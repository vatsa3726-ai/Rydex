import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { createDatabase, migrate, type Database } from "./database.js";
test("local PostgreSQL records survive restart", async () => {
  const folder = await mkdtemp(path.join(tmpdir(), "soulnest-db-test-"));
  let db: Database | undefined;
  try {
    db = await createDatabase(undefined, folder);
    await migrate(db);
    await db.query(
      "INSERT INTO sn_users(id,email,name,password_hash) VALUES ($1,$2,$3,$4)",
      ["test", "persist@example.test", "Persist", "not-a-real-password"],
    );
    await db.close();
    db = undefined;
    db = await createDatabase(undefined, folder);
    assert.equal(
      (await db.query("SELECT name FROM sn_users WHERE id=$1", ["test"]))
        .rows[0].name,
      "Persist",
    );
  } finally {
    try {
      await db?.close();
    } finally {
      if (
        path.resolve(folder).startsWith(path.resolve(tmpdir()) + path.sep) &&
        path.basename(folder).startsWith("soulnest-db-test-")
      )
        await rm(folder, { recursive: true, force: true });
    }
  }
});
