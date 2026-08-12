import test from "node:test";
import assert from "node:assert/strict";
import { matchesQueryTokens, parseQuery } from "../src/lib/query.js";

const now = new Date("2026-08-12T15:00:00");

test("parseQuery extracts dir and date tokens and leaves free text", () => {
  assert.deepEqual(parseQuery("dir:alpha date:today parser fix", now), {
    freeText: "parser fix",
    dir: "alpha",
    date: { kind: "today" },
  });
});

test("parseQuery supports MVP date forms and ignores invalid dates", () => {
  assert.deepEqual(parseQuery("date:yesterday", now).date, { kind: "yesterday" });
  assert.deepEqual(parseQuery("date:week", now).date, {
    kind: "since",
    value: now.getTime() - 7 * 24 * 60 * 60 * 1000,
  });
  assert.deepEqual(parseQuery("date:<3h", now).date, {
    kind: "since",
    value: now.getTime() - 3 * 60 * 60 * 1000,
  });
  assert.deepEqual(parseQuery("date:<2d", now).date, {
    kind: "since",
    value: now.getTime() - 2 * 24 * 60 * 60 * 1000,
  });
  assert.equal(parseQuery("date:nope", now).date, null);
  assert.equal(parseQuery("date:", now).date, null);
});

test("unknown colon tokens stay in free text", () => {
  assert.deepEqual(parseQuery("agent:claude fix", now), {
    freeText: "agent:claude fix",
    dir: null,
    date: null,
  });
});

test("matchesQueryTokens filters by dir substring and date", () => {
  const session = {
    agent: "codex",
    id: "one",
    cwd: "/Users/miguel/github/alpha",
    updatedAt: new Date("2026-08-12T10:00:00"),
    metadata: { projectSlug: "Users-miguel-github-alpha" },
  };

  assert.equal(
    matchesQueryTokens(session, parseQuery("dir:alpha", now), now),
    true,
  );
  assert.equal(
    matchesQueryTokens(session, parseQuery("dir:beta", now), now),
    false,
  );
  assert.equal(
    matchesQueryTokens(session, parseQuery("date:today", now), now),
    true,
  );
  assert.equal(
    matchesQueryTokens(session, parseQuery("date:yesterday", now), now),
    false,
  );
});
