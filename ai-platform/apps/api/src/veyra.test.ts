import { test } from "node:test";
import assert from "node:assert/strict";
import { createHmac, randomUUID } from "node:crypto";
import sharp from "sharp";
import { createDatabase } from "./database.js";
import { buildApp } from "./app.js";
import { VeyraOpenAIProvider, veyraPrompt } from "./veyra-provider.js";
import type { VeyraOptions } from "./veyra.js";
const password = "test-only strong password";
async function fixture(options: VeyraOptions = {}) {
  const db = await createDatabase(undefined, ":memory:");
  const app = await buildApp(undefined, db, undefined, undefined, options);
  const origin = options.origin ?? "http://localhost:3001";
  const call = (method: any, path: string, body?: any, cookie?: string) =>
    app.inject({
      method,
      url: "/v1/veyra/" + path,
      headers: {
        origin,
        "content-type": "application/json",
        ...(cookie ? { cookie } : {}),
      },
      payload: body,
    });
  const signup = async (email: string) => {
    const r = await call("POST", "auth/register", {
      name: "Tester",
      email,
      password,
      adult: true,
      terms: true,
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.match(String(r.headers["set-cookie"]), /HttpOnly/);
    assert.match(String(r.headers["set-cookie"]), /SameSite=Strict/);
    if (options.production)
      assert.match(String(r.headers["set-cookie"]), /; Secure/);
    return {
      cookie: r.cookies[0].name + "=" + r.cookies[0].value,
      id: r.json().user.id,
    };
  };
  const ready = async (email: string) => {
    const u = await signup(email);
    const r = await call(
      "POST",
      "age/development-attest",
      { adult: true },
      u.cookie,
    );
    assert.equal(r.statusCode, 200, r.body);
    return u;
  };
  return {
    db,
    app,
    call,
    signup,
    ready,
    async close() {
      await app.close();
      await db.close();
    },
  };
}
test("Veyra accounts: age gates, hashed credentials, private histories, quotas, reports and deletion preserve SoulNest", async () => {
  const seen: any[] = [];
  const f = await fixture({
    provider: {
      async reply(input) {
        seen.push(input);
        return "A thoughtful fictional AI answer";
      },
    },
  });
  const { call, db, app } = f;
  try {
    assert.equal((await call("GET", "models")).statusCode, 401);
    const a = await f.signup("a@veyra.test"),
      b = await f.ready("b@veyra.test");
    assert.equal(
      (
        await call("POST", "auth/login", {
          email: "a@veyra.test",
          password: "incorrect password",
        })
      ).statusCode,
      401,
    );
    const login = await call("POST", "auth/login", {
      email: "a@veyra.test",
      password,
    });
    assert.equal(login.statusCode, 200, login.body);
    const loginCookie = login.cookies[0].name + "=" + login.cookies[0].value;
    assert.equal(
      (await call("GET", "account", undefined, loginCookie)).statusCode,
      200,
    );
    await call("POST", "auth/logout", {}, loginCookie);
    assert.equal(
      (await call("GET", "account", undefined, loginCookie)).statusCode,
      401,
    );
    assert.equal(
      (await call("GET", "models", undefined, a.cookie)).statusCode,
      403,
    );
    assert.equal(
      (await call("GET", "media/aria-vale-portrait", undefined, a.cookie))
        .statusCode,
      403,
    );
    assert.equal(
      (
        await call(
          "POST",
          "models/aria-vale/chat",
          { content: "Hello", requestId: randomUUID() },
          a.cookie,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (await call("POST", "age/development-attest", { adult: false }, a.cookie))
        .statusCode,
      400,
    );
    await call("POST", "age/development-attest", { adult: true }, a.cookie);
    assert.equal(
      (await call("GET", "account", undefined, a.cookie)).json().verified,
      true,
    );
    const hash = (
      await db.query("SELECT password_hash FROM vy_users WHERE id=$1", [a.id])
    ).rows[0].password_hash;
    assert.doesNotMatch(hash, /test-only/);
    const models = (await call("GET", "models", undefined, a.cookie)).json()
      .models;
    assert.equal(models.length, 3);
    assert.ok(models.every((m: any) => m.age >= 21 && m.fictional));
    const image = await call(
      "GET",
      "media/aria-vale-portrait",
      undefined,
      a.cookie,
    );
    assert.equal(image.statusCode, 200, image.body);
    assert.match(image.headers["content-type"]!, /image\/jpeg/);
    assert.match(image.headers["cache-control"]!, /no-store/);
    assert.equal(
      (await call("GET", "admin/overview", undefined, a.cookie)).statusCode,
      403,
    );
    assert.equal(
      (
        await app.inject({
          method: "PUT",
          url: "/v1/veyra/account",
          headers: {
            origin: "https://evil.test",
            "content-type": "application/json",
            cookie: a.cookie,
          },
          payload: {},
        })
      ).statusCode,
      403,
    );
    assert.equal(
      (
        await call(
          "PUT",
          "conversations/aria-vale/customization",
          { tone: "witty", language: "kn", preferences: "I enjoy books" },
          a.cookie,
        )
      ).statusCode,
      200,
    );
    const turn = { content: "Tell me about art", requestId: randomUUID() };
    const chat = await call("POST", "models/aria-vale/chat", turn, a.cookie);
    assert.equal(chat.statusCode, 200, chat.body);
    assert.equal(
      (await call("POST", "models/aria-vale/chat", turn, a.cookie)).json()
        .duplicate,
      true,
    );
    assert.equal(seen.length, 1);
    assert.match(seen[0].system, /fictional adult AI/);
    assert.match(seen[0].system, /kn/);
    const history = (
      await call("GET", "conversations/aria-vale", undefined, a.cookie)
    ).json();
    assert.equal(history.messages.length, 2);
    assert.equal(
      (await call("GET", "conversations/aria-vale", undefined, b.cookie)).json()
        .messages.length,
      0,
    );
    assert.equal(
      (
        await call(
          "POST",
          "reports",
          {
            modelId: "aria-vale",
            category: "safety",
            details: "Please review this reply",
            messageId: String(history.messages[1].id),
          },
          b.cookie,
        )
      ).statusCode,
      404,
    );
    await call(
      "POST",
      "reports",
      {
        modelId: "aria-vale",
        category: "safety",
        details: "Please review this reply",
        messageId: String(history.messages[1].id),
      },
      a.cookie,
    );
    await call(
      "POST",
      "reports",
      {
        modelId: "aria-vale",
        category: "other",
        details: "Sharing this excerpt",
        messageId: String(history.messages[1].id),
        includeExcerpt: true,
      },
      a.cookie,
    );
    const reports = (
      await db.query("SELECT excerpt FROM vy_reports ORDER BY created_at")
    ).rows;
    assert.equal(reports[0].excerpt, null);
    assert.equal(reports[1].excerpt, "A thoughtful fictional AI answer");
    assert.equal(
      (
        await call(
          "POST",
          "models/julian-reed/chat",
          { content: "Hello", requestId: randomUUID() },
          a.cookie,
        )
      ).statusCode,
      403,
    );
    await db.query("UPDATE vy_usage SET count=20 WHERE user_id=$1", [a.id]);
    assert.equal(
      (
        await call(
          "POST",
          "models/aria-vale/chat",
          { content: "Hello", requestId: randomUUID() },
          a.cookie,
        )
      ).statusCode,
      429,
    );
    const sn = await app.inject({
      method: "POST",
      url: "/v2/soulnest/auth/register",
      headers: {
        origin: "http://localhost:3000",
        "content-type": "application/json",
      },
      payload: {
        name: "SoulNest user",
        email: "a@veyra.test",
        password,
        adult: true,
        terms: true,
      },
    });
    assert.equal(sn.statusCode, 200, sn.body);
    const snCookie = sn.cookies[0].name + "=" + sn.cookies[0].value;
    assert.equal(
      (await call("GET", "account", undefined, snCookie)).statusCode,
      401,
    );
    assert.equal(
      (
        await app.inject({
          url: "/v2/soulnest/companions",
          headers: { cookie: a.cookie },
        })
      ).statusCode,
      401,
    );
    assert.equal(
      (await call("GET", "export", undefined, a.cookie)).json().conversations[0]
        .messages.length,
      2,
    );
    assert.equal(
      (await call("DELETE", "account", { password: "wrong" }, a.cookie))
        .statusCode,
      401,
    );
    assert.equal(
      (await call("DELETE", "account", { password }, a.cookie)).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "account", undefined, a.cookie)).statusCode,
      401,
    );
    for (const table of [
      "vy_conversations",
      "vy_usage",
      "vy_reports",
      "vy_sessions",
    ])
      assert.equal(
        Number(
          (await db.query("SELECT COUNT(*) AS n FROM " + table)).rows[0].n,
        ),
        0 + (table === "vy_sessions" ? 1 : 0),
      );
    assert.equal(
      Number((await db.query("SELECT COUNT(*) AS n FROM sn_users")).rows[0].n),
      1,
    );
    assert.equal(
      (
        await app.inject({
          url: "/v2/soulnest/companions",
          headers: { cookie: snCookie },
        })
      ).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
});
test("Veyra production age assurance uses signed, expiring, replay-safe provider events and cannot use local attestations", async () => {
  let redirect = "https://age.example.test/check";
  const secret = "test-webhook-secret-with-at-least-32-characters";
  const f = await fixture({
    production: true,
    origin: "https://veyra.example.test",
    ageStart: async () => redirect,
    ageSecret: secret,
    ageRedirectHosts: ["age.example.test"],
  });
  const { call, app, db } = f;
  const webhook = async (
    event: any,
    opts: { timestamp?: string; signature?: string; pretty?: boolean } = {},
  ) => {
    const raw = JSON.stringify(event, null, opts.pretty ? 2 : undefined),
      ts = opts.timestamp ?? String(Math.floor(Date.now() / 1000));
    const sig =
      opts.signature ??
      "sha256=" +
        createHmac("sha256", secret)
          .update(ts + "." + raw)
          .digest("hex");
    return app.inject({
      method: "POST",
      url: "/v1/veyra/age/webhook",
      headers: {
        "content-type": "application/json",
        "x-veyra-timestamp": ts,
        "x-veyra-signature": sig,
      },
      payload: raw,
    });
  };
  try {
    const a = await f.signup("age@veyra.test");
    assert.equal(
      (await call("POST", "age/development-attest", { adult: true }, a.cookie))
        .statusCode,
      403,
    );
    await db.query(
      "UPDATE vy_users SET age_method='development-attestation',age_verified_until=$1 WHERE id=$2",
      [new Date(Date.now() + 86400000), a.id],
    );
    assert.equal(
      (await call("GET", "models", undefined, a.cookie)).statusCode,
      403,
    );
    const first = (await call("POST", "age/start", {}, a.cookie)).json();
    assert.equal(first.url, redirect);
    const second = (await call("POST", "age/start", {}, a.cookie)).json();
    const event = {
      eventId: randomUUID(),
      verificationId: second.verificationId,
      status: "verified",
      over18: true,
    };
    assert.equal(
      (
        await webhook({
          ...event,
          eventId: randomUUID(),
          verificationId: first.verificationId,
        })
      ).statusCode,
      409,
    );
    assert.equal(
      (await webhook(event, { signature: "sha256=" + "0".repeat(64) }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await webhook(event, {
          timestamp: String(Math.floor(Date.now() / 1000) - 600),
        })
      ).statusCode,
      401,
    );
    assert.equal((await webhook({ ...event, over18: false })).statusCode, 409);
    const verified = await webhook(event, { pretty: true });
    assert.equal(verified.statusCode, 200, verified.body);
    assert.equal((await webhook(event)).json().duplicate, true);
    assert.equal(
      (await call("GET", "models", undefined, a.cookie)).statusCode,
      200,
    );
    const renewal = (await call("POST", "age/start", {}, a.cookie)).json();
    assert.equal(
      (await call("GET", "models", undefined, a.cookie)).statusCode,
      403,
    );
    assert.equal(
      (await webhook({ ...event, eventId: randomUUID(), status: "revoked" }))
        .statusCode,
      409,
    );
    event.verificationId = renewal.verificationId;
    assert.equal(
      (await webhook({ ...event, eventId: randomUUID() })).statusCode,
      200,
    );
    assert.equal(
      (await webhook({ ...event, eventId: randomUUID(), status: "revoked" }))
        .statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "media/noor-amani-portrait", undefined, a.cookie))
        .statusCode,
      403,
    );
    const expired = (await call("POST", "age/start", {}, a.cookie)).json();
    await db.query(
      "UPDATE vy_age_checks SET expires_at=NOW()-INTERVAL '1 minute' WHERE id=$1",
      [expired.verificationId],
    );
    assert.equal(
      (
        await webhook({
          ...event,
          eventId: randomUUID(),
          verificationId: expired.verificationId,
        })
      ).statusCode,
      409,
    );
    redirect = "https://evil.example/check";
    assert.equal(
      (await call("POST", "age/start", {}, a.cookie)).statusCode,
      503,
    );
    assert.equal(
      (await call("DELETE", "account", { password }, a.cookie)).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
  const locked = await fixture({
    production: true,
    origin: "https://veyra.example.test",
  });
  try {
    const u = await locked.signup("locked@veyra.test");
    assert.equal(
      (await locked.call("GET", "config")).json().ageMode,
      "unavailable",
    );
    assert.equal(
      (await locked.call("POST", "age/start", {}, u.cookie)).statusCode,
      503,
    );
    assert.equal(
      (await locked.call("GET", "models", undefined, u.cookie)).statusCode,
      403,
    );
  } finally {
    await locked.close();
  }
});
test("Veyra admin enforces fictional 21+ profiles, reviewed private media, entitlements, suspension and audit reasons", async () => {
  const objects = new Map<string, Buffer>();
  const storage = {
    async put(k: string, b: Buffer) {
      objects.set(k, b);
    },
    async get(k: string) {
      if (!objects.has(k)) throw Error();
      return objects.get(k)!;
    },
    async delete(k: string) {
      objects.delete(k);
    },
  };
  const f = await fixture({ storage });
  const { call, db } = f;
  try {
    const a = await f.ready("admin@veyra.test"),
      u = await f.ready("reader@veyra.test");
    await db.query("UPDATE vy_users SET role='admin' WHERE id=$1", [a.id]);
    const m = {
      name: "Imagined Model",
      age: 21,
      fictional: true,
      tagline: "An imagined adult personality",
      bio: "Fictional adult companion profile",
      personality: "warm",
      interests: "Books",
      tier: "free",
      published: true,
    };
    assert.equal(
      (await call("POST", "admin/models", { ...m, age: 20 }, a.cookie))
        .statusCode,
      400,
    );
    assert.equal(
      (await call("POST", "admin/models", { ...m, fictional: false }, a.cookie))
        .statusCode,
      400,
    );
    const created = await call("POST", "admin/models", m, a.cookie);
    assert.equal(created.statusCode, 200, created.body);
    const id = created.json().id;
    await assert.rejects(() =>
      db.query("UPDATE vy_models SET age=18 WHERE id=$1", [id]),
    );
    const png = await sharp({
      create: { width: 8, height: 8, channels: 3, background: "#aabbcc" },
    })
      .png()
      .toBuffer();
    const media = {
      modelId: id,
      base64: png.toString("base64"),
      source: "generated",
      rightsConfirmed: true,
      fictionalAdultConfirmed: true,
      nonExplicitConfirmed: true,
      tier: "premium",
    };
    assert.equal(
      (
        await call(
          "POST",
          "admin/media",
          { ...media, rightsConfirmed: false },
          a.cookie,
        )
      ).statusCode,
      400,
    );
    const uploaded = await call("POST", "admin/media", media, a.cookie);
    assert.equal(uploaded.statusCode, 200, uploaded.body);
    const pid = uploaded.json().id;
    assert.equal(objects.size, 1);
    assert.equal(
      (await call("GET", "media/" + pid, undefined, u.cookie)).statusCode,
      404,
    );
    assert.equal(
      (await call("GET", "media/" + pid, undefined, a.cookie)).statusCode,
      200,
    );
    assert.equal(
      (
        await call(
          "POST",
          "admin/media/" + pid + "/review",
          { decision: "approved", reason: "Reviewed fictional adult" },
          a.cookie,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call(
          "POST",
          "admin/media/" + pid + "/review",
          { decision: "rejected", reason: "Not suitable for publication" },
          a.cookie,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await call(
          "POST",
          "admin/media/" + pid + "/review",
          {
            decision: "approved",
            reason: "Rights and fictional adult confirmed",
            rightsConfirmed: true,
            fictionalAdultConfirmed: true,
            nonExplicitConfirmed: true,
          },
          a.cookie,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "media/" + pid, undefined, u.cookie)).statusCode,
      403,
    );
    const grant = await call(
      "PUT",
      "admin/users/" + u.id + "/entitlement",
      { plan: "premium", days: 1, reason: "Approved evaluation access" },
      a.cookie,
    );
    assert.equal(grant.statusCode, 200, grant.body);
    assert.equal(grant.json().paymentsEnabled, false);
    assert.equal(
      (await call("GET", "media/" + pid, undefined, u.cookie)).statusCode,
      200,
    );
    assert.equal(
      (
        await call(
          "POST",
          "models/julian-reed/chat",
          { content: "Hello", requestId: randomUUID() },
          u.cookie,
        )
      ).statusCode,
      200,
    );
    await db.query(
      "UPDATE vy_subscriptions SET active_until=NOW()-INTERVAL '1 second' WHERE user_id=$1",
      [u.id],
    );
    assert.equal(
      (await call("GET", "media/" + pid, undefined, u.cookie)).statusCode,
      403,
    );
    await call(
      "PUT",
      "admin/models/" + id,
      { ...m, published: false },
      a.cookie,
    );
    assert.equal(
      (await call("GET", "media/" + pid, undefined, u.cookie)).statusCode,
      404,
    );
    assert.equal(
      (
        await call(
          "PUT",
          "admin/users/" + u.id + "/access",
          { blocked: true, reason: "Reported access concern" },
          a.cookie,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "models", undefined, u.cookie)).statusCode,
      403,
    );
    assert.equal(
      (await call("GET", "export", undefined, u.cookie)).statusCode,
      200,
    );
    const audit = (await call("GET", "admin/audit", undefined, a.cookie)).json()
      .events;
    assert.ok(
      audit.some((e: any) => e.reason === "Approved evaluation access"),
    );
    assert.equal(
      (await call("GET", "admin/conversations", undefined, a.cookie))
        .statusCode,
      404,
    );
    assert.equal(
      (await call("DELETE", "admin/media/" + pid, {}, a.cookie)).statusCode,
      200,
    );
    assert.equal(
      (await db.query("SELECT * FROM vy_object_deletions")).rows.length,
      1,
    );
    assert.equal(
      (await call("DELETE", "account", { password }, u.cookie)).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
});
test("Veyra provider moderates both directions, disables provider storage and fails closed", async () => {
  const old = {
    key: process.env.VEYRA_AI_API_KEY,
    model: process.env.VEYRA_AI_MODEL,
  };
  process.env.VEYRA_AI_API_KEY = "unit-test-not-a-real-key";
  process.env.VEYRA_AI_MODEL = "configured-model";
  try {
    const bodies: any[] = [];
    let outputFlagged = false;
    const provider = new VeyraOpenAIProvider(async (url, init) => {
      const b = JSON.parse(init!.body as string);
      bodies.push(b);
      return Response.json(
        String(url).endsWith("/moderations")
          ? {
              results: [
                {
                  flagged:
                    b.input === "Unsafe generated reply" && outputFlagged,
                },
              ],
            }
          : { choices: [{ message: { content: "Unsafe generated reply" } }] },
      );
    });
    const input = {
      system: veyraPrompt(
        {
          name: "Fictional",
          age: 29,
          bio: "Imagined",
          personality: "warm",
          interests: "Art",
        },
        {},
      ),
      messages: [{ role: "user" as const, content: "Hello" }],
    };
    assert.equal(await provider.reply(input), "Unsafe generated reply");
    assert.equal(bodies.length, 3);
    assert.equal(bodies[1].store, false);
    assert.equal(bodies[1].messages[0].role, "system");
    outputFlagged = true;
    assert.match(await provider.reply(input), /respectful and safe/);
    const broken = new VeyraOpenAIProvider(async () =>
      Response.json({ results: [] }),
    );
    await assert.rejects(() => broken.reply(input));
    let calls = 0;
    const flagged = new VeyraOpenAIProvider(async () => {
      calls++;
      return Response.json({ results: [{ flagged: true }] });
    });
    assert.match(await flagged.reply(input), /non-explicit/);
    assert.equal(calls, 1);
  } finally {
    if (old.key === undefined) delete process.env.VEYRA_AI_API_KEY;
    else process.env.VEYRA_AI_API_KEY = old.key;
    if (old.model === undefined) delete process.env.VEYRA_AI_MODEL;
    else process.env.VEYRA_AI_MODEL = old.model;
  }
});
