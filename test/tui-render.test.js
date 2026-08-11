import test from "node:test";
import assert from "node:assert/strict";
import { renderBrowserFrame } from "../src/tui.js";
import { createBrowserState } from "../src/tui/state.js";

const session = {
  agent: "claude",
  id: "11111111-2222-4333-8444-555555555555",
  startedAt: new Date("2026-07-10T10:00:00Z"),
  updatedAt: new Date("2026-07-13T12:00:00Z"),
  cwd: "/Users/miguel/github/a-project-with-a-long-name",
  preview: "short prompt preview",
  resumeCommand: ["claude", "--resume", "11111111-2222-4333-8444-555555555555"],
  metadata: {
    model: "claude-opus-4",
    branch: "feature/session-details",
  },
};

function plain(output) {
  return output.replace(/\x1b\[[0-9;]*m/g, "");
}

test("100x30 frame follows the header, row, details, and footer contract", () => {
  const state = createBrowserState([session]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.expanded = true;
  state.searchIndex = {
    docs: [{
      turns: [
        { role: "user", text: "A richer prompt with context that is available from the transcript index." },
        { role: "assistant", text: "I will inspect the session details." },
      ],
    }],
  };

  const lines = plain(renderBrowserFrame(state, 100, 30)).split("\n");

  assert.equal(lines[0].trim(), "Resume a previous session");
  assert.match(lines[2], /Type to search.*Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
  assert.match(lines.find((line) => line.includes("claude  short prompt preview")), /⌄ 2d ago/);
  assert.match(lines.join("\n"), /Session:\s+11111111-2222-4333-8444-555555555555/);
  assert.match(lines.join("\n"), /Model:\s+claude-opus-4/);
  assert.match(lines.join("\n"), /Branch:\s+feature\/session-details/);
  assert.match(lines.join("\n"), /you: A richer prompt with context/);
  assert.match(lines.at(-2), /enter resume   ctrl\+n new   esc exit   ctrl\+c exit   tab focus filter\/sort/);
  assert.match(lines.at(-1), /ctrl\+e expand   ↑\/↓ browse.*1 \/ 1 · 100%/);
  assert.ok(lines.every((line) => line.length <= 100));
});

test("60x16 frame keeps controls and rows within the terminal", () => {
  const state = createBrowserState([session]);
  state.now = new Date("2026-07-15T12:00:00Z");
  state.expanded = true;

  const lines = plain(renderBrowserFrame(state, 60, 16)).split("\n");

  assert.equal(lines[0].trim(), "Resume a previous session");
  assert.match(lines[2], /Type to search/);
  assert.match(lines[3], /Filter: Cwd \[All\]   Sort: \[Updated\] Created/);
  assert.match(lines.at(-2), /enter resume   ctrl\+n new   esc exit   tab focus/);
  assert.match(lines.at(-1), /ctrl\+e expand   ↑\/↓ browse/);
  assert.ok(lines.every((line) => line.length <= 60));
});
