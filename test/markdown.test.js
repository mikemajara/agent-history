import test from "node:test";
import assert from "node:assert/strict";
import { formatMarkdownLines, stripMarkdown } from "../src/lib/markdown.js";

function plain(text) {
  return String(text).replace(/\x1b\[[0-9;]*m/g, "");
}

test("stripMarkdown removes MVP markers", () => {
  assert.equal(
    stripMarkdown("**bold** and *italic* plus `code`"),
    "bold and italic plus code",
  );
  assert.equal(stripMarkdown("# Heading"), "Heading");
  assert.equal(stripMarkdown("- item one"), "• item one");
});

test("formatMarkdownLines styles inline and structural markdown", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const [inline] = formatMarkdownLines("Use **bold**, *italic*, and `code`.");
    assert.match(inline, /\x1b\[1mbold\x1b\[0m/);
    assert.match(inline, /\x1b\[3mitalic\x1b\[0m/);
    assert.match(inline, /\x1b\[36mcode\x1b\[0m/);
    assert.equal(plain(inline), "Use bold, italic, and code.");

    const [heading] = formatMarkdownLines("## Title");
    assert.match(heading, /^\x1b\[1m/);
    assert.equal(plain(heading), "Title");

    const [bullet] = formatMarkdownLines("* listed");
    assert.equal(plain(bullet), "• listed");
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("formatMarkdownLines respects NO_COLOR", () => {
  const previous = process.env.NO_COLOR;
  process.env.NO_COLOR = "1";
  try {
    const lines = formatMarkdownLines("# Hello\n- **world**");
    assert.deepEqual(lines, ["Hello", "• world"]);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});

test("code spans protect inner markers", () => {
  const previous = process.env.NO_COLOR;
  delete process.env.NO_COLOR;
  try {
    const [line] = formatMarkdownLines("use `**not bold**` please");
    assert.equal(plain(line), "use **not bold** please");
    assert.match(line, /\x1b\[36m\*\*not bold\*\*\x1b\[0m/);
  } finally {
    if (previous === undefined) delete process.env.NO_COLOR;
    else process.env.NO_COLOR = previous;
  }
});
