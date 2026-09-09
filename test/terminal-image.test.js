import test from "node:test";
import assert from "node:assert/strict";
import {
  deleteVisibleImages,
  detectImageProtocol,
  encodeHarnessImage,
  hasHarnessIcon,
  resetTerminalImageCache,
  useTerminalImages,
} from "../src/lib/terminal-image.js";

function withImagesEnv(value, fn) {
  const previous = process.env.AGENT_HISTORY_IMAGES;
  if (value === undefined) delete process.env.AGENT_HISTORY_IMAGES;
  else process.env.AGENT_HISTORY_IMAGES = value;
  resetTerminalImageCache();
  try {
    return fn();
  } finally {
    if (previous === undefined) delete process.env.AGENT_HISTORY_IMAGES;
    else process.env.AGENT_HISTORY_IMAGES = previous;
    resetTerminalImageCache();
  }
}

test("AGENT_HISTORY_IMAGES=0 disables terminal images", () => {
  withImagesEnv("0", () => {
    assert.equal(detectImageProtocol(), null);
    assert.equal(useTerminalImages(), false);
    assert.equal(deleteVisibleImages(), "");
    assert.equal(encodeHarnessImage("claude"), "");
  });
});

test("AGENT_HISTORY_IMAGES=kitty encodes PNG via the Kitty graphics protocol", () => {
  withImagesEnv("kitty", () => {
    assert.equal(detectImageProtocol(), "kitty");
    assert.equal(hasHarnessIcon("claude"), true);
    assert.equal(hasHarnessIcon("fx"), false);
    assert.equal(hasHarnessIcon("unknown"), false);
    const encoded = encodeHarnessImage("claude");
    assert.match(encoded, /^\x1b_Ga=T,f=100,c=2,r=1,C=1,q=2;/);
    assert.match(encoded, /\x1b\\$/);
    assert.ok(encoded.length > 100);
    assert.match(deleteVisibleImages(), /^\x1b_Ga=d,d=A,q=2\x1b\\$/);
  });
});

test("AGENT_HISTORY_IMAGES=iterm encodes PNG via the iTerm2 inline file protocol", () => {
  withImagesEnv("iterm", () => {
    assert.equal(detectImageProtocol(), "iterm");
    const encoded = encodeHarnessImage("codex");
    assert.match(encoded, /^\x1b]1337;File=inline=1;width=2;height=1;/);
    assert.match(encoded, /doNotMoveCursor=1:/);
    assert.equal(deleteVisibleImages(), "");
  });
});
