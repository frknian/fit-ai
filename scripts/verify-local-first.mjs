#!/usr/bin/env node
// Yerel-öncelikli yolun GERÇEK cihazda çalıştığını kanıtlar.
//
// NEDEN GEREKLİ: birim testleri sahte köprüyle davranışı doğruluyor, ama asıl
// soru mimariydi — AI rotaları Cloudflare Worker'da çalıştığı için cihaz üstü
// model üretimde hiç seçilemiyordu. Bu betik WebView'ın İÇİNDE, gerçek
// HedefitLocalAI köprüsüyle ve gerçek modelle üretim yaptırır.
//
// Kullanım: uygulama cihazda AÇIKKEN
//   node scripts/verify-local-first.mjs

import { execFile } from "node:child_process";
import { promisify } from "node:util";

const run = promisify(execFile);
const APP_ID = "com.hedefit.app";

async function adb(...params) {
  const { stdout } = await run("adb", params, { maxBuffer: 32 * 1024 * 1024 });
  return stdout.trim();
}

class Cdp {
  constructor(socket) {
    this.socket = socket;
    this.nextId = 1;
    this.pending = new Map();
    socket.addEventListener("message", (event) => {
      const message = JSON.parse(String(event.data));
      if (!message.id) return;
      const pending = this.pending.get(message.id);
      if (!pending) return;
      this.pending.delete(message.id);
      if (message.error) pending.reject(new Error(message.error.message));
      else pending.resolve(message.result);
    });
  }
  static async connect(url) {
    const socket = new WebSocket(url);
    await new Promise((resolve, reject) => {
      socket.addEventListener("open", resolve, { once: true });
      socket.addEventListener("error", () => reject(new Error("webview_baglanamadi")), { once: true });
    });
    return new Cdp(socket);
  }
  call(method, params = {}) {
    const id = this.nextId++;
    return new Promise((resolve, reject) => {
      this.pending.set(id, { resolve, reject });
      this.socket.send(JSON.stringify({ id, method, params }));
    });
  }
  async evaluate(expression, timeoutMs = 180_000) {
    const result = await this.call("Runtime.evaluate", {
      expression, awaitPromise: true, returnByValue: true, timeout: timeoutMs,
    });
    if (result.exceptionDetails) {
      throw new Error(result.exceptionDetails.exception?.description || "js_hatasi");
    }
    return result.result?.value;
  }
}

async function main() {
  const pid = (await adb("shell", "pidof", APP_ID)).split(/\s+/)[0];
  if (!pid) throw new Error("uygulama çalışmıyor — önce cihazda açın");
  const port = await adb("forward", "tcp:0", `localabstract:webview_devtools_remote_${pid}`);
  try {
    const pages = await fetch(`http://127.0.0.1:${port}/json/list`).then((r) => r.json());
    const page = pages.find((entry) => entry.type === "page" && entry.webSocketDebuggerUrl);
    if (!page) throw new Error("webview sayfası bulunamadı");
    console.log("WebView:", page.url);
    const wsUrl = new URL(page.webSocketDebuggerUrl);
    wsUrl.hostname = "127.0.0.1";
    wsUrl.port = String(port);
    const cdp = await Cdp.connect(wsUrl.toString());
    await cdp.call("Runtime.enable");

    console.log("\n0) WebView'daki Capacitor durumu:");
    const diag = await cdp.evaluate(`(() => {
      const cap = globalThis.Capacitor;
      return {
        hasCapacitor: Boolean(cap),
        isNative: cap?.isNativePlatform?.() ?? null,
        platform: cap?.getPlatform?.() ?? null,
        pluginNames: cap?.Plugins ? Object.keys(cap.Plugins) : null,
        hasAndroidBridge: Boolean(globalThis.androidBridge),
        hasDirectGlobal: Boolean(globalThis.HedefitLocalAI),
        title: document.title,
        bodyLen: document.body?.innerHTML?.length ?? 0,
        capacitorish: Object.keys(globalThis).filter((k) => /capacitor|native|bridge|hedefit/i.test(k)),
        readyState: document.readyState,
      };
    })()`);
    console.log("   ", JSON.stringify(diag, null, 2));

    console.log("\n1) Native köprü WebView'da görünüyor mu?");
    const bridge = await cdp.evaluate(`(async () => {
      const p = globalThis.Capacitor?.Plugins?.HedefitLocalAI || globalThis.HedefitLocalAI;
      if (!p) return { bridge: false };
      const caps = await p.getCapabilities();
      return { bridge: true, caps };
    })()`);
    console.log("   ", JSON.stringify(bridge));
    if (!bridge?.bridge) throw new Error("KÖPRÜ YOK — yerel yol çalışamaz");

    console.log("\n2) Yerel-öncelikli modül sayfaya yüklendi mi ve üretim yapıyor mu?");
    // Modülü sayfanın kendi bundle'ından değil, dinamik import ile alıyoruz:
    // amaç mimariyi kanıtlamak, bileşen durumuna bağlı kalmamak.
    const generated = await cdp.evaluate(`(async () => {
      const started = Date.now();
      const mod = await import('/lib/ai/local-first.ts').catch(() => null);
      if (!mod) return { moduleLoaded: false };
      const result = await mod.generateLocalCoachResponse({
        messages: [{ role: 'user', text: 'Bugün spor yapmalı mıyım?' }],
        locale: 'tr',
        signals: {
          profile: { age: 30, sex: 'male', heightCm: 180, weightKg: 85 },
          goals: { goalType: 'lose', targetWeightKg: 78 },
          today: { totals: { calories: 1850, protein: 96, carbs: 200, fat: 60 }, steps: 7230 },
          activity: { workoutsThisWeek: 3 },
        },
        fetcher: async () => new Response(JSON.stringify({ memories: [] }), { status: 200 }),
      });
      return { moduleLoaded: true, elapsedMs: Date.now() - started, result };
    })()`);
    console.log("   ", JSON.stringify(generated, null, 2).slice(0, 1200));

    if (generated?.result?.source === "local") {
      console.log("\n✓ KANIT: yanıt CİHAZDA üretildi (provider=" + generated.result.provider + ", model=" + generated.result.model + ")");
    } else {
      console.log("\n✗ Yerel yol devreye girmedi — yukarıdaki çıktıya bakın");
    }
  } finally {
    await adb("forward", "--remove", `tcp:${port}`).catch(() => {});
  }
}

main().catch((error) => { console.error("doğrulama başarısız:", error.message); process.exit(1); });
