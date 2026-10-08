import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

const require = createRequire(new URL("../packages/runtime-host/package.json", import.meta.url));
const tsx = require.resolve("tsx/cli");
// The imported smoke scripts create fixture accounts. Always use memory stores,
// even when CI has DATABASE_URL set for the separate PostgreSQL tests.
for (const name of ["session", "rest"]) {
  const result = spawnSync(process.execPath, [tsx, fileURLToPath(new URL(`../packages/runtime-host/src/${name}.smoke.ts`, import.meta.url))], {
    env: { ...process.env, DATABASE_URL: "" }, stdio: "inherit", windowsHide: true,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}
