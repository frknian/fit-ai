import { copyFileSync, existsSync, mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";

// vinext beta emits app-router-entry next to an import for
// ./vinext-client-assets.js, while placing that module at the Worker root.
// Cloudflare's no-bundle upload keeps the import path intact, so mirror the
// generated module beside the entry until the upstream packager fixes it.
const source = resolve("dist/server/vinext-client-assets.js");
const target = resolve("dist/server/_next/static/vinext-client-assets.js");

if (!existsSync(source)) {
  throw new Error(`vinext Worker modülü bulunamadı: ${source}`);
}

mkdirSync(dirname(target), { recursive: true });
copyFileSync(source, target);

