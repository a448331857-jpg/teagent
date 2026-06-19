import { readFile, writeFile, unlink } from "node:fs/promises";
import { spawnSync } from "node:child_process";

const base = JSON.parse(await readFile(new URL("./wrangler.jsonc", import.meta.url), "utf8"));
const names = [
  "LLM_API_MODE", "LLM_API_URL",
  "LLM_1_NAME", "LLM_1_MODE", "LLM_1_API_URL", "LLM_1_MODEL",
  "LLM_2_NAME", "LLM_2_MODE", "LLM_2_API_URL", "LLM_2_MODEL",
  "LLM_3_NAME", "LLM_3_MODE", "LLM_3_API_URL", "LLM_3_MODEL",
];

const vars = Object.fromEntries(names.filter((name) => process.env[name]).map((name) => [name, process.env[name].trim()]));
const missing = ["LLM_1_MODEL", "LLM_2_MODEL", "LLM_3_MODEL"].filter((name) => !vars[name]);
if (missing.length) {
  console.error(`缺少 Cloudflare Builds 变量：${missing.join(", ")}`);
  process.exit(1);
}

const generatedPath = new URL("./wrangler.generated.jsonc", import.meta.url);
await writeFile(generatedPath, JSON.stringify({ ...base, vars }, null, 2), "utf8");
try {
  const command = process.platform === "win32" ? "npx.cmd" : "npx";
  const result = spawnSync(command, ["wrangler", "deploy", "--config", "wrangler.generated.jsonc"], { stdio: "inherit", shell: false });
  process.exitCode = result.status ?? 1;
} finally {
  await unlink(generatedPath).catch(() => {});
}
