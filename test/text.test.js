import test from "node:test";
import assert from "node:assert/strict";
import { compactPreview } from "../src/lib/text.js";

test("preview cleanup keeps wrapped user query text", () => {
  assert.equal(compactPreview("<user_query>hello from cursor</user_query>"), "hello from cursor");
});

test("preview cleanup drops environment wrappers", () => {
  assert.equal(compactPreview("<environment_context>ignored</environment_context>"), undefined);
});
