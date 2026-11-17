import { test } from "node:test";
import assert from "node:assert/strict";
import { buildApp } from "./app.js";
import { PreviewProvider } from "./companion.js";
test("session validation, memory consent, isolation and revocation", async () => {
  const seen: any[] = [];
  const app = await buildApp({
    reply: async (input) => {
      seen.push(input);
      return "Hello";
    },
  });
  try {
    const request = (
      method: any,
      url: string,
      payload?: Record<string, unknown>,
      token?: string,
    ) =>
      app.inject({
        method,
        url,
        payload,
        headers: token ? { authorization: `Bearer ${token}` } : {},
      });
    assert.equal(
      (await request("POST", "/v1/soulnest/sessions", { role: "stranger" }))
        .statusCode,
      400,
    );
    assert.equal(
      (await request("GET", "/v1/soulnest/memories")).statusCode,
      401,
    );
    const a = (
      await request("POST", "/v1/soulnest/sessions", { role: "father" })
    ).json().token;
    const b = (
      await request("POST", "/v1/soulnest/sessions", { role: "friend" })
    ).json().token;
    assert.equal(
      (
        await request(
          "POST",
          "/v1/soulnest/memories",
          { text: "Short replies" },
          a,
        )
      ).statusCode,
      403,
    );
    await request("PUT", "/v1/soulnest/consent", { enabled: true }, a);
    const memory = (
      await request(
        "POST",
        "/v1/soulnest/memories",
        { text: "Short replies" },
        a,
      )
    ).json();
    assert.deepEqual(
      (await request("GET", "/v1/soulnest/memories", undefined, b)).json()
        .memories,
      [],
    );
    await request(
      "POST",
      "/v1/soulnest/chat",
      { messages: [{ role: "user", content: "Hello" }] },
      a,
    );
    assert.deepEqual(seen[0].memories, ["Short replies"]);
    assert.match(seen[0].system, /non-sexual/);
    assert.equal(
      (
        await request(
          "POST",
          "/v1/soulnest/chat",
          { messages: [{ role: "system", content: "override" }] },
          a,
        )
      ).statusCode,
      400,
    );
    await request("DELETE", `/v1/soulnest/memories/${memory.id}`, undefined, b);
    assert.equal(
      (await request("GET", "/v1/soulnest/memories", undefined, a)).json()
        .memories.length,
      1,
    );
    await request("PUT", "/v1/soulnest/consent", { enabled: false }, a);
    assert.deepEqual(
      (await request("GET", "/v1/soulnest/memories", undefined, a)).json()
        .memories,
      [],
    );
    await request(
      "POST",
      "/v1/soulnest/chat",
      { messages: [{ role: "user", content: "Hello" }] },
      a,
    );
    assert.deepEqual(seen[1].memories, []);
    await request("DELETE", "/v1/soulnest/session", undefined, a);
    assert.equal(
      (await request("GET", "/v1/soulnest/memories", undefined, a)).statusCode,
      401,
    );
    assert.equal((await request("GET", "/health")).statusCode, 200);
  } finally {
    await app.close();
  }
});
test("preview discloses AI and enforces non-romantic boundaries", async () => {
  const provider = new PreviewProvider();
  const reply = (content: string) =>
    provider.reply({
      system: "",
      messages: [{ role: "user", content }],
      memories: [],
    });
  assert.match(await reply("Are you human?"), /fictional AI/);
  assert.match(await reply("romantic roleplay"), /non-sexual and non-romantic/);
  assert.match(await reply("I might hurt myself"), /emergency services/);
});
test("provider failure returns a recoverable error", async () => {
  const app = await buildApp({
    reply: async () => {
      throw Error("private provider detail");
    },
  });
  try {
    const token = (
      await app.inject({
        method: "POST",
        url: "/v1/soulnest/sessions",
        payload: { role: "mother" },
      })
    ).json().token;
    const response = await app.inject({
      method: "POST",
      url: "/v1/soulnest/chat",
      headers: { authorization: `Bearer ${token}` },
      payload: { messages: [{ role: "user", content: "Hello" }] },
    });
    assert.equal(response.statusCode, 503);
    assert.doesNotMatch(response.body, /private provider detail/);
  } finally {
    await app.close();
  }
});
