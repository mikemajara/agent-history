import fs from "node:fs/promises";

export async function readJsonl(filePath) {
  const raw = await fs.readFile(filePath, "utf8");
  const lines = raw.split("\n");
  const records = [];

  for (const line of lines) {
    if (!line.trim()) {
      continue;
    }

    try {
      records.push(JSON.parse(line));
    } catch {
      continue;
    }
  }

  return records;
}
