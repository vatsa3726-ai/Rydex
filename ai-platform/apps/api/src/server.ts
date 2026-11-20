import { buildApp } from "./app.js";
import { createDatabase } from "./database.js";
const database = await createDatabase();
const app = await buildApp(
  undefined,
  database,
  undefined,
  undefined,
  undefined,
  {
    trustProxyHops: Number(process.env.SOULNEST_TRUST_PROXY_HOPS ?? 0),
    logging: process.env.NODE_ENV === "production",
  },
);
app.addHook("onClose", () => database.close());
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => {
    void app.close();
  });
const port = Number(process.env.PORT ?? 4000);
await app.listen({ port, host: process.env.HOST ?? "0.0.0.0" });
