# agent-history

This project is a local CLI for finding and resuming AI agent sessions associated with the current repository or directory.

## Product Direction

The CLI should prioritize a rich interactive UX over a zero-dependency implementation. We chose JavaScript/Node because the ecosystem is strongest for terminal UI, packaging, and future extensibility.

The default command should be:

```bash
agent-history
```

It should open an interactive session browser across all known local projects. Users can pass a path to narrow the browser to a single project:

```bash
agent-history .
agent-history ~/github/example
```

A scriptable table view should also exist:

```bash
agent-history ls
agent-history ls .
```

## Core Behavior

`agent-history` should parse local agent metadata directly from files. Listing, filtering, and search should not shell out to `claude`, `codex`, `cursor`, or other agent CLIs.

Native agent commands may be used only after the user explicitly chooses to resume or open a session.

Initial providers:

- Cursor: `~/.cursor/projects/<project-slug>/agent-transcripts/**/<session>.jsonl`
- Claude Code: `~/.claude/projects/<project-slug>/*.jsonl` and `~/.claude/history.jsonl`
- Codex: `~/.codex/sessions/**/*.jsonl` and `~/.codex/history.jsonl`

## Interactive UX Goals

The no-argument command should show sessions across all known local projects in a navigable terminal UI. Passing a path should filter to that project.

Expected controls:

- `j` / `k` and arrow keys move selection.
- `Enter` resumes or opens the selected session.
- `Ctrl+e` expands extended metadata for the selected session.
- `/` searches across indexed local metadata.
- `q` exits.
- `?` shows help.

Rows should show at least:

- agent name
- local date/time
- short session id
- preview of the first or most relevant prompt

Expanded metadata should show:

- full session id
- agent/provider
- project directory
- transcript path
- model, branch, entrypoint, and version when available
- resume command
- more prompt/context preview when available

## Session Model

Normalize all providers into a common session shape:

```ts
type AgentSession = {
  agent: "cursor" | "claude" | "codex";
  id: string;
  startedAt?: Date;
  updatedAt?: Date;
  cwd?: string;
  preview?: string;
  transcriptPath?: string;
  resumeCommand?: string[];
  metadata?: Record<string, unknown>;
};
```

## Path Matching

Always normalize the target directory with `realpath` before matching.

Use provider-specific project slug encoders from the known path. Do not reverse-decode slugs by replacing hyphens with slashes, because real directory names can contain hyphens.

Fast path:

- Cursor slug: `/Users/miguel/github/foo` -> `Users-miguel-github-foo`
- Claude slug: `/Users/miguel/github/foo` -> `-Users-miguel-github-foo`

Codex should be matched by reading `session_meta.payload.cwd` from rollout JSONL files.

## Search Scope

Search must use only data parsed from local agent files. It can include:

- first user prompt
- recent prompts
- session id
- cwd/project path
- branch
- model
- agent name
- transcript metadata

Deep transcript search can be added as an opt-in mode if normal indexing becomes too slow.

## Implementation Notes

Keep the parser/indexer independent from the interactive UI. The TUI should be a view over the same normalized data used by `agent-history ls`.

Likely command shape:

```bash
agent-history          # interactive browser
agent-history ls       # scriptable table
agent-history show ID  # detailed metadata
agent-history resume ID
```

Add caching only after profiling or once Codex transcript scans feel slow. A likely cache location is `~/.cache/agent-history/index.json`.
