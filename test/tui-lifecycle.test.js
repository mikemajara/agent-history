import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { runInteractiveBrowser } from "../src/tui.js";

test("interactive browser removes resize and key listeners on Ctrl+C", async () => {
  const stdin = new EventEmitter();
  stdin.isTTY = true;
  stdin.setRawMode = (value) => {
    stdin.rawMode = value;
  };
  stdin.resume = () => {};
  stdin.pause = () => {};

  const output = [];
  const io = {
    stdin,
    stdout: {
      isTTY: true,
      columns: 100,
      rows: 30,
      write: (value) => output.push(value),
    },
    stderr: { write: () => {} },
  };
  const before = process.listenerCount("SIGWINCH");
  const result = runInteractiveBrowser([{ agent: "codex", id: "one", preview: "hello" }], io);

  await new Promise((resolve) => setImmediate(resolve));
  assert.equal(process.listenerCount("SIGWINCH"), before + 1);
  stdin.emit("keypress", "", { ctrl: true, name: "c" });

  assert.equal(await result, 130);
  assert.equal(process.listenerCount("SIGWINCH"), before);
  assert.equal(stdin.rawMode, false);
  assert.match(output.at(-1), /\x1b\[\?25h/);
});
