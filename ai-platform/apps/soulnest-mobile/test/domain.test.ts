import { test } from "node:test";
import assert from "node:assert/strict";
import { resolveApiUrl } from "../src/lib/domain";
test("release connections require HTTPS and cannot carry embedded credentials", () => {
  assert.throws(() => resolveApiUrl(undefined, false), /needs/);
  for (const value of [
    "http://public.example.com/v2/soulnest",
    "https://user:secret@example.com/v2/soulnest",
    "https://example.com/v2/soulnest?token=secret",
    "https://example.com/wrong",
  ])
    assert.throws(() => resolveApiUrl(value, false));
  assert.equal(
    resolveApiUrl("https://api.example.com/v2/soulnest/", false),
    "https://api.example.com/v2/soulnest",
  );
});
test("local emulator exceptions remain restricted to local addresses", () => {
  assert.equal(
    resolveApiUrl(undefined, true, false, true),
    "http://10.0.2.2:4000/v2/soulnest",
  );
  assert.equal(
    resolveApiUrl("http://10.0.2.2:4000/v2/soulnest", false, true),
    "http://10.0.2.2:4000/v2/soulnest",
  );
  assert.throws(() =>
    resolveApiUrl("http://public.example.com/v2/soulnest", false, true),
  );
  assert.throws(() =>
    resolveApiUrl("http://10.0.2.2:4000/v2/soulnest", false, false),
  );
});
