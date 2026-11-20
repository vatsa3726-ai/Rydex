import { spawn } from "node:child_process";
import { readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { isolatedTestEnvironment } from "./test-environment.mjs";
const root = new URL("../", import.meta.url);
const files = (await readdir(new URL("src/", root)))
  .filter((name) => name.endsWith(".test.ts"))
  .sort()
  .map((name) => fileURLToPath(new URL("src/" + name, root)));
const child = spawn(
  process.execPath,
  ["--import", "tsx", "--test", "--test-concurrency=1", ...files],
  {
    cwd: fileURLToPath(root),
    env: isolatedTestEnvironment(),
    stdio: "inherit",
  },
);
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => child.kill(signal));
child.on("error", () => {
  process.exitCode = 1;
});
await new Promise((resolve) =>
  child.on("exit", (code) => {
    process.exitCode = code ?? 1;
    resolve();
  }),
);
