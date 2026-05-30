import fs from "node:fs/promises";
import path from "node:path";

export async function pathExists(inputPath) {
  try {
    await fs.access(inputPath);
    return true;
  } catch {
    return false;
  }
}

export async function listFilesRecursive(rootPath, filter) {
  const results = [];

  async function walk(currentPath) {
    const entries = await fs.readdir(currentPath, { withFileTypes: true });

    for (const entry of entries) {
      const entryPath = path.join(currentPath, entry.name);

      if (entry.isDirectory()) {
        await walk(entryPath);
        continue;
      }

      if (entry.isFile() && (!filter || filter(entryPath))) {
        results.push(entryPath);
      }
    }
  }

  await walk(rootPath);
  return results;
}
