import { test } from "node:test";
import assert from "node:assert/strict";
import { OpenAIProvider } from "./ai-provider.js";
test("configured AI provider moderates input and output and sends bounded context", async () => {
  const oldKey = process.env.AI_PROVIDER_API_KEY,
    oldModel = process.env.AI_CHAT_MODEL;
  process.env.AI_PROVIDER_API_KEY = "test-placeholder";
  process.env.AI_CHAT_MODEL = "test-model";
  const requests: any[] = [];
  try {
    const request = (async (url: any, options: any) => {
      requests.push({ url, body: JSON.parse(options.body) });
      return Response.json(
        String(url).endsWith("moderations")
          ? { results: [{ flagged: false }] }
          : { choices: [{ message: { content: "A warm reply" } }] },
      );
    }) as typeof fetch;
    const provider = new OpenAIProvider(request);
    const result = await provider.reply({
      system: "Identity and boundaries",
      messages: [{ role: "user", content: "Hello" }],
      memories: ["Short replies"],
    });
    assert.equal(result, "A warm reply");
    assert.equal(requests.length, 3);
    assert.equal(requests[1].body.store, false);
    assert.equal(requests[1].body.messages[0].role, "system");
    assert.equal(requests[1].body.max_completion_tokens, 500);
    const blocked = new OpenAIProvider((async () =>
      Response.json({
        results: [{ flagged: true, categories: { "self-harm/intent": true } }],
      })) as typeof fetch);
    assert.match(
      await blocked.reply({
        system: "",
        messages: [{ role: "user", content: "distress" }],
        memories: [],
      }),
      /emergency services/,
    );
  } finally {
    if (oldKey === undefined) delete process.env.AI_PROVIDER_API_KEY;
    else process.env.AI_PROVIDER_API_KEY = oldKey;
    if (oldModel === undefined) delete process.env.AI_CHAT_MODEL;
    else process.env.AI_CHAT_MODEL = oldModel;
  }
});
