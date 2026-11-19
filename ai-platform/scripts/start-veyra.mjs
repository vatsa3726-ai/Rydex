import { spawn } from "node:child_process";
import { existsSync } from "node:fs";
if (existsSync(".env.veyra")) process.loadEnvFile(".env.veyra");
const dev = process.argv.includes("--dev");
const children = [];
let closing = false;
function stop(code = 0) {
  if (closing) return;
  closing = true;
  for (const child of children) child.kill("SIGTERM");
  setTimeout(() => process.exit(code), 1000).unref();
}
function start(args, env) {
  const child = spawn(process.execPath, args, {
    cwd: process.cwd(),
    env: { ...process.env, ...env },
    stdio: "inherit",
  });
  children.push(child);
  child.on("error", () => stop(1));
  child.on("exit", (code) => {
    if (!closing) stop(code || 1);
  });
  return child;
}
process.on("SIGTERM", () => stop());
process.on("SIGINT", () => stop());
start(["--import", "tsx", "apps/api/src/veyra-server.ts"], {
  PORT: "4001",
  HOST: "127.0.0.1",
  ...(dev ? { NODE_ENV: "development" } : {}),
});
try {
  let healthy = false;
  for (let i = 0; i < 60 && !closing; i++) {
    try {
      healthy = (await fetch("http://127.0.0.1:4001/v1/veyra/health")).ok;
      if (healthy) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!healthy) throw Error("API not ready");
  if (!closing)
    start(
      [
        "node_modules/next/dist/bin/next",
        dev ? "dev" : "start",
        "apps/models-web",
        "-p",
        process.env.PORT ?? "3001",
        "-H",
        "0.0.0.0",
      ],
      { NODE_ENV: dev ? "development" : "production" },
    );
} catch {
  console.error(
    "Veyra could not start. Check the database and server configuration.",
  );
  stop(1);
}
