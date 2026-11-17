import { test } from "node:test";
import assert from "node:assert/strict";
import { speechRequest } from "./voice-routes.js";
test("speech adapter returns audio and handles upstream failures", async () => {
  const response = await speechRequest(
    "speech",
    JSON.stringify({ input: "Hello" }),
    "application/json",
    (async (url: any, options: any) => {
      assert.match(String(url), /audio\/speech$/);
      assert.equal(options.headers["Content-Type"], "application/json");
      assert.ok(options.signal);
      return new Response(new Uint8Array([1, 2, 3]));
    }) as typeof fetch,
  );
  assert.equal((await response.arrayBuffer()).byteLength, 3);
  await assert.rejects(
    speechRequest(
      "speech",
      "{}",
      "application/json",
      (async () =>
        new Response("private detail", { status: 500 })) as typeof fetch,
    ),
    /unavailable/,
  );
});
