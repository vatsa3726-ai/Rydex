import { spawn } from "node:child_process";
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
process.on("SIGTERM", () => stop(0));
process.on("SIGINT", () => stop(0));
start(["--import", "tsx", "apps/api/src/server.ts"], {
  PORT: "4000",
  HOST: "127.0.0.1",
});
try {
  let healthy = false;
  for (let i = 0; i < 60 && !closing; i++) {
    try {
      const r = await fetch("http://127.0.0.1:4000/v2/soulnest/health");
      healthy = r.ok;
      if (healthy) break;
    } catch {}
    await new Promise((r) => setTimeout(r, 500));
  }
  if (!healthy) throw Error("API failed to start");
  if (!closing)
    start(
      [
        "node_modules/next/dist/bin/next",
        "start",
        "apps/companion-web",
        "-p",
        process.env.PORT ?? "3000",
        "-H",
        "0.0.0.0",
      ],
      {NODE_ENV:'production'},
    );
} catch {
  console.error("SoulNest could not start. Check database configuration.");
  stop(1);
}
