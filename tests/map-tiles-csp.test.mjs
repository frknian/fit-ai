import assert from "node:assert/strict";
import test from "node:test";
import { readFile } from "node:fs/promises";
import { contentSecurityPolicy } from "../lib/security-headers.ts";
import { MAP_TILE_CSP_ORIGINS, MAP_TILE_URL } from "../lib/map-tiles.ts";

// Bu sınıf hata bir kez canlıya çıktı: harita bomboş görünüyordu ama hiçbir
// yerde hata yoktu. Sebep, döşemelerin img-src ile değil connect-src ile
// alakalı olmasıydı — MapLibre onları bir web worker'ından fetch ile çeker,
// CSP engelleyince istekler sessizce düşer. Adres ile izin ayrı yerlerde
// yazıldığı sürece bu tekrar olur; test ikisini birbirine bağlar.

test("harita döşeme adresi CSP connect-src'te izinli", () => {
  const connectSrc = contentSecurityPolicy
    .split("; ")
    .find((directive) => directive.startsWith("connect-src "));
  assert.ok(connectSrc, "connect-src yönergesi olmalı");

  const host = new URL(MAP_TILE_URL.replace("{z}/{x}/{y}", "0/0/0")).origin;
  assert.ok(
    MAP_TILE_CSP_ORIGINS.includes(host),
    `${host} MAP_TILE_CSP_ORIGINS içinde listelenmeli`,
  );
  for (const origin of MAP_TILE_CSP_ORIGINS) {
    assert.ok(connectSrc.includes(origin), `connect-src ${origin} adresine izin vermeli`);
  }
});

test("harita bileşeni döşeme adresini paylaşılan sabitten alır", async () => {
  const map = await readFile(new URL("../components/GpsMapView.tsx", import.meta.url), "utf8");
  assert.match(map, /MAP_TILE_URL/, "adres bileşende elle yazılmamalı");
  assert.doesNotMatch(map, /https:\/\/tile\.openstreetmap\.org/, "adres yalnız lib/map-tiles.ts'te durmalı");
});

test("worker geolocation ve konum izinlerini engellemez", async () => {
  const { securityHeaders } = await import("../lib/security-headers.ts");
  assert.match(securityHeaders["Permissions-Policy"], /geolocation=\(self\)/);
});

test("Google Identity düğmesinin stil sayfası CSP tarafından engellenmez", async () => {
  // GSI kendi düğmesini çizerken accounts.google.com/gsi/style'ı yükler;
  // script/frame/connect zaten bu kaynağa izin veriyordu, style-src'de
  // unutulmuştu ve düğme markasız/çıplak görünüyordu (canlıda gözlemlendi).
  const { contentSecurityPolicy } = await import("../lib/security-headers.ts");
  const styleSrc = contentSecurityPolicy.split("; ").find((directive) => directive.startsWith("style-src"));
  assert.ok(styleSrc?.includes("https://accounts.google.com"), "style-src Google Identity'ye izin vermeli");
});
