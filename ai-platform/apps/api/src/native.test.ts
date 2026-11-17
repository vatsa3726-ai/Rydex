import { test } from "node:test";
import assert from "node:assert/strict";
import sharp from "sharp";
import { createDatabase } from "./database.js";
import { buildApp } from "./app.js";
import { drainPhotoDeletions, type PhotoStorage } from "./photo-storage.js";
test("native bearer auth preserves browser CSRF protections and privately cleans object photos", async () => {
  const db = await createDatabase(undefined, ":memory:");
  const files = new Map<string, Buffer>();
  const storage: PhotoStorage = {
    put: async (k, v) => {
      files.set(k, v);
    },
    get: async (k) => {
      if (!files.has(k)) throw Error("Missing photo");
      return files.get(k)!;
    },
    delete: async (k) => {
      files.delete(k);
    },
  };
  const app = await buildApp(undefined, db, undefined, storage);
  const call = (
    method: any,
    path: string,
    body?: any,
    token?: string,
    extra: Record<string, string> = {},
  ) =>
    app.inject({
      method,
      url: `/v2/soulnest/${path}`,
      headers: {
        "content-type": "application/json",
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...extra,
      },
      payload: body,
    });
  try {
    const register = {
      email: "native@example.test",
      password: "native secure test password",
      name: "Native tester",
      adult: true,
      terms: true,
    };
    assert.equal(
      (
        await call("POST", "auth/native/register", register, undefined, {
          origin: "https://evil.test",
        })
      ).statusCode,
      403,
    );
    const a = await call("POST", "auth/native/register", register);
    assert.equal(a.statusCode, 200, a.body);
    assert.equal(a.cookies.length, 0);
    const token = a.json().token;
    assert.match(token, /^[a-f0-9]{64}$/);
    const b = (
      await call("POST", "auth/native/register", {
        ...register,
        email: "other@example.test",
      })
    ).json().token;
    assert.equal(
      (await call("GET", "account", undefined, token)).statusCode,
      200,
    );
    assert.equal(
      (await call("PUT", "account", { name: "Updated" }, token)).json().name,
      "Updated",
    );
    const profile = {
      name: "Mitra",
      relationship: "friend",
      personality: "playful",
      tone: "warm",
      language: "kn",
    };
    const create = await call("POST", "companions", profile, token);
    assert.equal(create.statusCode, 200, create.body);
    const id = create.json().companion.id;
    const base64 = (
      await sharp({
        create: { width: 8, height: 8, channels: 3, background: "red" },
      })
        .jpeg()
        .toBuffer()
    ).toString("base64");
    assert.equal(
      (
        await call(
          "PUT",
          `companions/${id}/photo`,
          { base64, authorized: true },
          token,
        )
      ).statusCode,
      200,
    );
    assert.equal(files.size, 1);
    assert.equal(
      (await call("GET", `companions/${id}/photo`, undefined, b)).statusCode,
      404,
    );
    assert.equal(
      (await call("GET", `companions/${id}/photo`, undefined, token)).headers[
        "content-type"
      ],
      "image/jpeg",
    );
    assert.equal(
      (await db.query("SELECT data FROM sn_photos")).rows[0].data,
      null,
    );
    const browser = await call(
      "POST",
      "auth/login",
      { email: register.email, password: register.password },
      undefined,
      { origin: "http://localhost:3000" },
    );
    assert.equal(browser.statusCode, 200, browser.body);
    assert.equal(browser.json().token, undefined);
    const cookie = `sn_session=${browser.cookies[0].value}`;
    assert.equal(
      (
        await call("PUT", "account", { name: "No origin" }, undefined, {
          cookie,
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (await call("GET", "account", undefined, "0".repeat(64), { cookie }))
        .statusCode,
      401,
    );
    assert.equal(
      (await call("DELETE", "account", { password: register.password }, token))
        .statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "account", undefined, token)).statusCode,
      401,
    );
    assert.equal((await db.query("SELECT * FROM sn_photos")).rows.length, 0);
    assert.equal(
      (await db.query("SELECT * FROM sn_object_deletions")).rows.length,
      1,
    );
    await db.query(
      "UPDATE sn_object_deletions SET created_at=NOW()-INTERVAL '11 minutes'",
    );
    await drainPhotoDeletions(db, storage);
    assert.equal(files.size, 0);
    assert.equal(
      (await db.query("SELECT * FROM sn_object_deletions")).rows.length,
      0,
    );
    await call("POST", "auth/logout", {}, b);
    assert.equal((await call("GET", "account", undefined, b)).statusCode, 401);
  } finally {
    await app.close();
    await db.close();
  }
});
