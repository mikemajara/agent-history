import os from "node:os";
import path from "node:path";
import fs from "node:fs/promises";

export async function resolveTargetCwd(inputCwd = process.cwd()) {
  return fs.realpath(expandHomePath(inputCwd));
}

export function expandHomePath(inputPath) {
  if (!inputPath.startsWith("~/")) {
    return inputPath;
  }

  return path.join(os.homedir(), inputPath.slice(2));
}

export function encodeCursorProjectSlug(projectPath) {
  const normalized = stripRootSeparators(projectPath);
  return normalized.split(path.sep).join("-");
}

export function encodeClaudeProjectSlug(projectPath) {
  return `-${encodeCursorProjectSlug(projectPath)}`;
}

function stripRootSeparators(projectPath) {
  const root = path.parse(projectPath).root;
  return projectPath.startsWith(root) ? projectPath.slice(root.length) : projectPath;
}
