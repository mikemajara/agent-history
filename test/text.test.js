import test from "node:test";
import assert from "node:assert/strict";
import { compactPreview, unwrapPromptText } from "../src/lib/text.js";

test("preview cleanup keeps wrapped user query text", () => {
  assert.equal(compactPreview("<user_query>hello from cursor</user_query>"), "hello from cursor");
});

test("preview cleanup drops environment wrappers", () => {
  assert.equal(compactPreview("<environment_context>ignored</environment_context>"), undefined);
});

test("prompt cleanup removes Codex-injected context before the user request", () => {
  const bundled = `# AGENTS.md instructions
<INSTRUCTIONS>be concise</INSTRUCTIONS>
<environment_context>runtime details</environment_context>
<image name=[Image #1] path="/tmp/example.png"> </image>
Show me the useful conversation details.`;

  assert.equal(unwrapPromptText(bundled), "Show me the useful conversation details.");
});

test("prompt cleanup removes AGENTS.md instructions with a source path", () => {
  const bundled = `# AGENTS.md instructions for /Users/miguel/github/vercel/gtm
<INSTRUCTIONS>be concise</INSTRUCTIONS>
<environment_context>runtime details</environment_context>`;

  assert.equal(compactPreview(bundled), undefined);
});

test("prompt cleanup drops standalone attachment records", () => {
  assert.equal(compactPreview('<image name=[Image #1] path="/tmp/example.png">'), undefined);
});
