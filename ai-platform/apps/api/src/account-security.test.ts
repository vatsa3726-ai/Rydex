import { test } from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createDatabase } from "./database.js";
import { buildApp } from "./app.js";
import type { SoulNestOptions } from "./account-security.js";
const password = "original strong test password";
async function fixture(options: SoulNestOptions = {}) {
  const db = await createDatabase(undefined, ":memory:");
  const app = await buildApp(
    undefined,
    db,
    undefined,
    undefined,
    undefined,
    options,
  );
  let ip = 1;
  const call = (
    method: any,
    path: string,
    body?: any,
    token?: string,
    browser = false,
  ) =>
    app.inject({
      method,
      url: "/v2/soulnest/" + path,
      remoteAddress: "127.0.0." + ((ip++ % 200) + 1),
      headers: {
        "content-type": "application/json",
        ...(browser
          ? { origin: options.origin ?? "http://localhost:3000" }
          : {}),
        ...(token ? { authorization: "Bearer " + token } : {}),
      },
      payload: body,
    });
  const signup = async (email: string) => {
    const r = await call("POST", "auth/native/register", {
      name: "Tester",
      email,
      password,
      adult: true,
      terms: true,
    });
    assert.equal(r.statusCode, 200, r.body);
    return { id: r.json().user.id, token: r.json().token, email };
  };
  return {
    db,
    app,
    call,
    signup,
    async close() {
      await app.close();
      await db.close();
    },
  };
}
test("SoulNest verified email and one-time recovery protect native and browser accounts and revoke sessions", async () => {
  const mail: any[] = [];
  const f = await fixture({
    production: true,
    origin: "https://soulnest.example.test",
    mailer: {
      async send(input) {
        mail.push(input);
      },
    },
  });
  const { call, db, app } = f;
  try {
    const u = await f.signup("secure@soulnest.test");
    assert.equal(
      (await call("GET", "companions", undefined, u.token)).json().code,
      "EMAIL_REQUIRED",
    );
    assert.equal(
      (await call("GET", "account", undefined, u.token)).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "export", undefined, u.token)).statusCode,
      200,
    );
    const before = await call("POST", "auth/request-verification", {
      email: u.email,
    });
    assert.equal(before.statusCode, 200, before.body);
    assert.equal(mail.length, 1);
    assert.equal(mail[0].purpose, "verify");
    assert.match(mail[0].link, /account-security#/);
    const stored = (await db.query("SELECT token_hash FROM sn_account_tokens"))
      .rows[0];
    assert.notEqual(stored.token_hash, mail[0].token);
    assert.doesNotMatch(before.body, new RegExp(mail[0].token));
    assert.equal(
      (
        await call("POST", "auth/verify-email", {
          email: "other@soulnest.test",
          token: mail[0].token,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call("POST", "auth/reset-password", {
          email: u.email,
          token: mail[0].token,
          password: "new strong password",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (
        await call("POST", "auth/verify-email", {
          email: u.email,
          token: mail[0].token,
        })
      ).statusCode,
      200,
    );
    assert.equal(
      (
        await call("POST", "auth/verify-email", {
          email: u.email,
          token: mail[0].token,
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await call("GET", "companions", undefined, u.token)).statusCode,
      200,
    );
    const browser = await call(
      "POST",
      "auth/login",
      { email: u.email, password },
      undefined,
      true,
    );
    assert.equal(browser.statusCode, 200, browser.body);
    assert.match(String(browser.headers["set-cookie"]), /Secure/);
    assert.match(String(browser.headers["set-cookie"]), /HttpOnly/);
    const cookie = browser.cookies[0].name + "=" + browser.cookies[0].value;
    const unknown = await call("POST", "auth/forgot-password", {
      email: "unknown@soulnest.test",
    });
    const known = await call("POST", "auth/forgot-password", {
      email: u.email,
    });
    assert.deepEqual(known.json(), unknown.json());
    assert.equal(mail.length, 2);
    const reset = mail[1].token;
    await db.query(
      "UPDATE sn_account_tokens SET expires_at=NOW()-INTERVAL '1 second' WHERE purpose='reset'",
    );
    assert.equal(
      (
        await call("POST", "auth/reset-password", {
          email: u.email,
          token: reset,
          password: "new strong test password",
        })
      ).statusCode,
      400,
    );
    await call("POST", "auth/forgot-password", { email: u.email });
    const fresh = mail.at(-1).token;
    const r = await call("POST", "auth/reset-password", {
      email: u.email,
      token: fresh,
      password: "new strong test password",
    });
    assert.equal(r.statusCode, 200, r.body);
    assert.equal(
      (await call("GET", "account", undefined, u.token)).statusCode,
      401,
    );
    assert.equal(
      (await app.inject({ url: "/v2/soulnest/account", headers: { cookie } }))
        .statusCode,
      401,
    );
    assert.equal(
      (
        await call("POST", "auth/reset-password", {
          email: u.email,
          token: fresh,
          password: "another strong password",
        })
      ).statusCode,
      400,
    );
    assert.equal(
      (await call("POST", "auth/native/login", { email: u.email, password }))
        .statusCode,
      401,
    );
    const login = await call("POST", "auth/native/login", {
      email: u.email,
      password: "new strong test password",
    });
    assert.equal(login.statusCode, 200, login.body);
    const token = login.json().token;
    assert.equal(
      (
        await call(
          "PUT",
          "account/password",
          {
            currentPassword: "incorrect",
            newPassword: "updated strong password",
          },
          token,
        )
      ).statusCode,
      403,
    );
    assert.equal(
      (await call("GET", "account", undefined, token)).statusCode,
      200,
    );
    assert.equal(
      (
        await call(
          "PUT",
          "account/password",
          {
            currentPassword: "new strong test password",
            newPassword: "updated strong password",
          },
          token,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "account", undefined, token)).statusCode,
      401,
    );
    const relogin = await call("POST", "auth/native/login", {
      email: u.email,
      password: "updated strong password",
    });
    assert.equal(relogin.statusCode, 200, relogin.body);
    const live = relogin.json().token;
    assert.equal(
      (
        await call(
          "POST",
          "auth/logout-all",
          { password: "updated strong password" },
          live,
        )
      ).statusCode,
      200,
    );
    assert.equal(
      (await call("GET", "account", undefined, live)).statusCode,
      401,
    );
    const evil = await app.inject({
      method: "POST",
      url: "/v2/soulnest/auth/request-verification",
      headers: {
        origin: "https://evil.test",
        "content-type": "application/json",
      },
      payload: { email: u.email },
    });
    assert.equal(evil.statusCode, 403);
  } finally {
    await f.close();
  }
});
test("SoulNest account email limits persist, failed delivery invalidates tokens and unconfigured delivery fails closed", async () => {
  let sends = 0;
  const f = await fixture({
    mailer: {
      async send() {
        sends++;
        throw Error("test delivery outage");
      },
    },
  });
  try {
    const u = await f.signup("limited@soulnest.test");
    for (let i = 0; i < 4; i++)
      assert.equal(
        (await f.call("POST", "auth/forgot-password", { email: u.email }))
          .statusCode,
        200,
      );
    assert.equal(sends, 3);
    assert.equal(
      (await f.db.query("SELECT * FROM sn_account_tokens")).rows.length,
      0,
    );
    assert.equal(
      (await f.call("GET", "account", undefined, u.token)).statusCode,
      200,
    );
  } finally {
    await f.close();
  }
  const noMail = await fixture();
  try {
    const u = await noMail.signup("preview@soulnest.test");
    assert.equal(
      (await noMail.call("GET", "config")).json().emailEnabled,
      false,
    );
    assert.equal(
      (await noMail.call("POST", "auth/forgot-password", { email: u.email }))
        .statusCode,
      503,
    );
  } finally {
    await noMail.close();
  }
});
test("SoulNest premium expiry, companion limits, private reports and complete exports are enforced server-side", async () => {
  const f = await fixture();
  const { call, db } = f;
  const profile = {
    name: "Asha",
    relationship: "mother",
    personality: "gentle",
    tone: "warm",
    language: "hi",
    instructions: "Listen first",
    interests: "Books",
    phrases: "",
    custom_label: "",
  };
  try {
    const a = await f.signup("plan@soulnest.test"),
      b = await f.signup("other@soulnest.test");
    let first = "";
    for (let i = 0; i < 3; i++) {
      const r = await call("POST", "companions", profile, a.token);
      assert.equal(r.statusCode, 200, r.body);
      first ||= r.json().companion.id;
    }
    assert.equal(
      (await call("POST", "companions", profile, a.token)).statusCode,
      409,
    );
    await db.query(
      "UPDATE sn_subscriptions SET plan='premium',status='manual',active_until=$1,grant_reason='Authorized evaluation' WHERE user_id=$2",
      [new Date(Date.now() + 86400000), a.id],
    );
    assert.equal(
      (await call("POST", "companions", profile, a.token)).statusCode,
      200,
    );
    const account = (await call("GET", "account", undefined, a.token)).json();
    assert.equal(account.plan, "premium");
    assert.equal(account.limits.companions, 10);
    const now = new Date().toISOString().slice(0, 10);
    await db.query(
      "INSERT INTO sn_usage(user_id,day,kind,count) VALUES ($1,$2,'chat',30)",
      [a.id, now],
    );
    assert.equal(
      (
        await call(
          "POST",
          `companions/${first}/chat`,
          { content: "Hello", requestId: randomUUID() },
          a.token,
        )
      ).statusCode,
      200,
    );
    const history = (
      await call("GET", `companions/${first}/messages`, undefined, a.token)
    ).json().messages;
    const mid = String(history[1].id);
    assert.equal(
      (
        await call(
          "POST",
          "reports",
          {
            companionId: first,
            category: "privacy",
            details: "Please review this",
            messageId: mid,
            includeExcerpt: true,
          },
          b.token,
        )
      ).statusCode,
      404,
    );
    await call(
      "POST",
      "reports",
      {
        companionId: first,
        category: "safety",
        details: "Please review the reply",
        messageId: mid,
      },
      a.token,
    );
    await call(
      "POST",
      "reports",
      {
        companionId: first,
        category: "safety",
        details: "I choose to share this excerpt",
        messageId: mid,
        includeExcerpt: true,
      },
      a.token,
    );
    const own = (await call("GET", "reports", undefined, a.token)).json()
      .reports;
    assert.equal(own.length, 2);
    assert.equal(
      own.find((r: any) => r.details === "Please review the reply").excerpt,
      null,
    );
    assert.equal(
      typeof own.find(
        (r: any) => r.details === "I choose to share this excerpt",
      ).excerpt,
      "string",
    );
    assert.equal(
      (await call("GET", "reports", undefined, b.token)).json().reports.length,
      0,
    );
    const exported = (await call("GET", "export", undefined, a.token)).json();
    assert.equal(exported.reports.length, 2);
    assert.equal(exported.subscription.plan, "premium");
    assert.ok(!JSON.stringify(exported).includes("password_hash"));
    await db.query(
      "UPDATE sn_subscriptions SET active_until=NOW()-INTERVAL '1 second' WHERE user_id=$1",
      [a.id],
    );
    assert.equal(
      (await call("GET", "account", undefined, a.token)).json().plan,
      "free",
    );
    assert.equal(
      (await call("POST", "companions", profile, a.token)).statusCode,
      409,
    );
    assert.equal(
      (
        await call(
          "POST",
          `companions/${first}/chat`,
          { content: "Hello", requestId: randomUUID() },
          a.token,
        )
      ).statusCode,
      429,
    );
    assert.equal(
      (
        await call(
          "PUT",
          "account",
          { name: "Tester", plan: "premium" },
          a.token,
        )
      ).statusCode,
      400,
    );
    assert.equal(
      (await call("DELETE", "account", { password }, a.token)).statusCode,
      200,
    );
    assert.equal((await db.query("SELECT * FROM sn_reports")).rows.length, 0);
  } finally {
    await f.close();
  }
});

test("SoulNest proxy trust is explicit and ignores spoofed leftmost addresses", async () => {
  for (const hops of [0, 1]) {
    const app = await buildApp(
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      { trustProxyHops: hops, logging: hops === 1 },
    );
    try {
      app.get("/test-ip", (req) => ({ ip: req.ip }));
      const result = await app.inject({
        url: "/test-ip",
        remoteAddress: "127.0.0.1",
        headers: { "x-forwarded-for": "198.51.100.9, 203.0.113.7" },
      });
      assert.equal(result.json().ip, hops === 0 ? "127.0.0.1" : "203.0.113.7");
    } finally {
      await app.close();
    }
  }
  await assert.rejects(() =>
    buildApp(undefined, undefined, undefined, undefined, undefined, {
      trustProxyHops: NaN,
    }),
  );
});
