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

/**
 * Recover a filesystem path from an encoded Cursor/Claude project slug.
 * Walks existing directories with longest-segment matching so names that contain
 * hyphens (e.g. agent-history) are not reverse-decoded by naive hyphen→slash.
 * Cursor project folders also strip leading dots from path segments.
 */
export async function resolveEncodedProjectSlug(slug, options = {}) {
  if (!slug) {
    return undefined;
  }

  const encoded = slug.startsWith("-") ? slug.slice(1) : slug;
  if (!encoded) {
    return undefined;
  }

  const root = options.root ?? path.parse(process.cwd()).root;
  const stripLeadingDots = options.stripLeadingDots === true;
  let current = root;
  let remaining = encoded;

  while (remaining) {
    let entries;
    try {
      entries = await fs.readdir(current);
    } catch {
      return undefined;
    }

    let best;
    for (const name of entries) {
      const form = stripLeadingDots ? slugSegment(name) : name;
      if (remaining !== form && !remaining.startsWith(`${form}-`)) {
        continue;
      }

      if (
        !best
        || form.length > best.form.length
        || (form.length === best.form.length && !name.startsWith(".") && best.name.startsWith("."))
      ) {
        best = { name, form };
      }
    }

    if (!best) {
      return undefined;
    }

    current = path.join(current, best.name);
    remaining = remaining === best.form ? "" : remaining.slice(best.form.length + 1);
  }

  try {
    return await fs.realpath(current);
  } catch {
    return current;
  }
}

function slugSegment(name) {
  const stripped = name.replace(/^\.+/, "");
  return stripped || name;
}

function stripRootSeparators(projectPath) {
  const root = path.parse(projectPath).root;
  return projectPath.startsWith(root) ? projectPath.slice(root.length) : projectPath;
}
