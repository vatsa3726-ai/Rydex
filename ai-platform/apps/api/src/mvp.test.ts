import sharp from "sharp";
import { test } from "node:test";
import assert from "node:assert/strict";
import { createDatabase } from "./database.js";
import { buildApp } from "./app.js";
export const profile = {
  name: "Asha",
  relationship: "mother",
  personality: "gentle",
  tone: "warm",
  language: "hi",
  instructions: "Listen first",
  interests: "Music",
  phrases: "One step at a time",
  custom_label: "",
};
test("accounts and companion CRUD enforce age, sessions, ownership and deletion", async () => {
  const db = await createDatabase(undefined, ":memory:");
  const seen: any[] = [];
  const app = await buildApp(undefined, db, {
    reply: async (input) => {
      seen.push(input);
      return "A thoughtful answer";
    },
  });
  const call = (
    method: any,
    path: string,
    body?: any,
    cookie?: string,
    origin = "http://localhost:3000",
  ) =>
    app.inject({
      method,
      url: `/v2/soulnest/${path}`,
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      payload: body,
    });
  const signup = async (email: string) => {
    const r = await call("POST", "auth/register", {
      name: "Test",
      email,
      password: "very strong test password",
      adult: true,
      terms: true,
    });
    assert.equal(r.statusCode, 200, r.body);
    return r.cookies[0].name + "=" + r.cookies[0].value;
  };
  try {
    assert.equal(
      (
        await call("POST", "auth/register", {
          name: "Young",
          email: "young@example.com",
          password: "very strong password",
          adult: false,
          terms: true,
        })
      ).statusCode,
      400,
    );
    const a = await signup("a@example.com"),
      b = await signup("b@example.com");
    const row = (
      await db.query("SELECT password_hash FROM sn_users WHERE email=$1", [
        "a@example.com",
      ])
    ).rows[0];
    assert.doesNotMatch(row.password_hash, /very strong/);
    assert.equal((await call("GET", "companions")).statusCode, 401);
    assert.equal(
      (await call("POST", "companions", profile, a, "https://evil.test"))
        .statusCode,
      403,
    );
    const created = await call("POST", "companions", profile, a);
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().companion.id;
    assert.equal(
      (await call("GET", `companions/${id}`, undefined, b)).statusCode,
      404,
    );
    assert.equal(
      (
        await call("PUT", `companions/${id}`, { ...profile, name: "Meera" }, a)
      ).json().companion.name,
      "Meera",
    );
    assert.equal(
      (await call("GET", "companions", undefined, b)).json().companions.length,
      0,
    );
    const requestId = crypto.randomUUID();
    assert.equal(
      (
        await call(
          "POST",
          `companions/${id}/chat`,
          { content: "A good day", requestId },
          b,
        )
      ).statusCode,
      404,
    );
    const answer = await call(
      "POST",
      `companions/${id}/chat`,
      { content: "A good day", requestId },
      a,
    );
    assert.equal(answer.statusCode, 200, answer.body);
    assert.equal(
      (
        await call(
          "POST",
          `companions/${id}/chat`,
          { content: "A good day", requestId },
          a,
        )
      ).json().duplicate,
      true,
    );
    assert.equal(
      (await call("GET", `companions/${id}/messages`, undefined, a)).json()
        .messages.length,
      2,
    );
    await call(
      "POST",
      `companions/${id}/chat`,
      { content: "Tell me more", requestId: crypto.randomUUID() },
      a,
    );
    assert.equal(seen[1].messages.length, 3);
    assert.match(seen[0].system, /Hindi/);
    assert.match(seen[0].system, /strictly platonic/);
    assert.equal(
      (await call("GET", `companions/${id}/messages`, undefined, b)).statusCode,
      404,
    );
    assert.equal(
      (
        await call(
          "POST",
          `companions/${id}/memories`,
          { text: "Short replies" },
          a,
        )
      ).statusCode,
      403,
    );
    await call("PUT", `companions/${id}/memory-consent`, { enabled: true }, a);
    const saved = (
      await call(
        "POST",
        `companions/${id}/memories`,
        { text: "Short replies" },
        a,
      )
    ).json();
    assert.equal(
      (
        await call(
          "PUT",
          `companions/${id}/memories/${saved.id}`,
          { text: "Long replies" },
          b,
        )
      ).statusCode,
      404,
    );
    await call(
      "PUT",
      `companions/${id}/memories/${saved.id}`,
      { text: "Gentle replies" },
      a,
    );
    await call(
      "POST",
      `companions/${id}/chat`,
      { content: "My preferences?", requestId: crypto.randomUUID() },
      a,
    );
    assert.deepEqual(seen.at(-1).memories, ["Gentle replies"]);
    await call("PUT", `companions/${id}/memory-consent`, { enabled: false }, a);
    assert.deepEqual(
      (await call("GET", `companions/${id}/memories`, undefined, a)).json()
        .memories,
      [],
    );
    const photo = (
      await sharp({
        create: { width: 16, height: 16, channels: 3, background: "#aabbcc" },
      })
        .png()
        .toBuffer()
    ).toString("base64");
    assert.equal(
      (
        await call(
          "PUT",
          `companions/${id}/photo`,
          { base64: photo, authorized: false },
          a,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call(
          "PUT",
          `companions/${id}/photo`,
          {
            base64: Buffer.from("<svg/>").toString("base64"),
            authorized: true,
          },
          a,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call(
          "PUT",
          `companions/${id}/photo`,
          { base64: photo, authorized: true },
          a,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", `companions/${id}/photo`, undefined, b)).statusCode,
      404,
    );
    const image = await call("GET", `companions/${id}/photo`, undefined, a);
    assert.equal(image.headers["content-type"], "image/jpeg");
    assert.equal(image.headers["cache-control"], "no-store");
    assert.equal(
      (
        await call(
          "POST",
          `companions/${id}/transcribe`,
          { base64: "YQ==", mime: "audio/webm" },
          a,
        )
      ).statusCode,
      503,
    );
    const exported = (await call("GET", "export", undefined, a)).json();
    assert.equal(exported.companions[0].photo.base64.length > 0, true);
    assert.equal(exported.user.password_hash, undefined);
    await call("DELETE", `companions/${id}/messages`, {}, a);
    assert.equal(
      (await call("GET", `companions/${id}/messages`, undefined, a)).json()
        .messages.length,
      0,
    );
    assert.equal(
      (
        await call("POST", "auth/login", {
          email: "a@example.com",
          password: "a wrong password long enough",
        })
      ).statusCode,
      401,
    );
    const login = await call("POST", "auth/login", {
      email: "a@example.com",
      password: "very strong test password",
    });
    assert.equal(login.statusCode, 200);
    assert.ok(login.cookies[0].httpOnly);
    await db.query("UPDATE sn_usage SET count=30 WHERE kind=$1", ["chat"]);
    assert.equal(
      (
        await call(
          "POST",
          `companions/${id}/chat`,
          { content: "One more", requestId: crypto.randomUUID() },
          a,
        )
      ).statusCode,
      429,
    );
    assert.equal(
      (await call("POST", "sessions", { role: "father" }, a)).statusCode,
      404,
    );
    assert.equal(
      (await call("DELETE", `companions/${id}`, {}, a)).statusCode,
      200,
    );
    assert.equal(
      (
        await call(
          "DELETE",
          "account",
          { password: "very strong test password" },
          a,
        )
      ).statusCode,
      200,
    );
    assert.equal((await call("GET", "account", undefined, a)).statusCode, 401);
    assert.equal(
      (await db.query("SELECT * FROM sn_companions")).rows.length,
      0,
    );
    for (const table of ["sn_photos", "sn_messages", "sn_memories", "sn_turns"])
      assert.equal((await db.query("SELECT * FROM " + table)).rows.length, 0);
  } finally {
    await app.close();
    await db.close();
  }
});
