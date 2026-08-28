import { spawnSync } from "node:child_process";

const config = "dist/server/wrangler.json";
const healthUrl = "https://hedefit.frknian.workers.dev/api/health/openai";

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { stdio: "inherit", ...options });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

function output(command, args) {
  const result = spawnSync(command, args, { encoding: "utf8" });
  if (result.status !== 0) {
    process.stderr.write(result.stderr || "Komut tamamlanamadı.\n");
    process.exit(result.status ?? 1);
  }
  return result.stdout;
}

async function checkHealth(url, token) {
  for (let attempt = 1; attempt <= 4; attempt += 1) {
    try {
      const response = await fetch(url, {
        method: "POST",
        headers: { "x-deploy-health-token": token },
        signal: AbortSignal.timeout(45_000),
        cache: "no-store",
      });
      const body = await response.json().catch(() => ({}));
      if (response.ok && body?.ok === true) return body;
      if (attempt === 4) throw new Error(`HTTP ${response.status}: ${body?.reason || "unknown"}`);
    } catch (error) {
      if (attempt === 4) throw error;
    }
    await new Promise((resolve) => setTimeout(resolve, attempt * 1_500));
  }
}

run("npm", ["run", "build"]);

const secrets = JSON.parse(output("npx", ["wrangler", "secret", "list", "-c", config]));
for (const required of ["OPENAI_API_KEY", "DEPLOY_HEALTH_TOKEN"]) {
  if (secrets.some((item) => item.name === required)) continue;
  console.error(`Dağıtım durduruldu: canlı Worker'da ${required} yok.`);
  process.exit(1);
}

const healthToken = output("security", ["find-generic-password", "-a", "hedefit-deploy", "-s", "hedefit-openai-health", "-w"]).trim();
if (!healthToken) {
  console.error("Dağıtım durduruldu: OpenAI sağlık anahtarı macOS Anahtar Zinciri'nde bulunamadı.");
  process.exit(1);
}

const deployments = JSON.parse(output("npx", ["wrangler", "deployments", "list", "-c", config, "--json"]));
const previousVersion = deployments.at(-1)?.versions?.find((item) => item.percentage === 100)?.version_id;

run("npx", ["wrangler", "deploy", "-c", config, "--message", "Verified deploy with automatic OpenAI health check"]);

try {
  const health = await checkHealth(healthUrl, healthToken);
  console.log(`OpenAI sağlık kontrolü başarılı: ${health.model}`);
} catch (error) {
  console.error(`OpenAI sağlık kontrolü başarısız: ${error instanceof Error ? error.message : "unknown"}`);
  if (previousVersion) {
    console.error(`Önceki sağlıklı sürüme otomatik dönülüyor: ${previousVersion}`);
    run("npx", ["wrangler", "rollback", previousVersion, "-c", config, "--message", "Automatic rollback: OpenAI health check failed", "--yes"]);
  }
  process.exit(1);
}
