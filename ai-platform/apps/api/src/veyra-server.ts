import { buildApp } from "./app.js";
import { createDatabase } from "./database.js";
const database = await createDatabase(
  process.env.VEYRA_DATABASE_URL ?? process.env.DATABASE_URL,
  process.env.VEYRA_DATA_DIR ?? "./.veyra-data",
);
const app = await buildApp(undefined, database, undefined, undefined, {});
app.addHook("onClose", () => database.close());
for (const signal of ["SIGINT", "SIGTERM"])
  process.on(signal, () => void app.close());
await app.listen({
  port: Number(process.env.PORT ?? 4001),
  host: process.env.HOST ?? "127.0.0.1",
});
