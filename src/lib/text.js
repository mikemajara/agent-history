export function compactPreview(text, maxLength = 140) {
  const compact = unwrapPreviewText(String(text ?? "")).replace(/\s+/g, " ").trim();
  if (!compact) {
    return undefined;
  }

  return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
}

export function extractTextFromContent(content) {
  if (typeof content === "string") {
    return content;
  }

  if (!Array.isArray(content)) {
    return undefined;
  }

  const parts = [];
  for (const item of content) {
    if (typeof item === "string") {
      parts.push(item);
      continue;
    }

    if (typeof item?.text === "string") {
      parts.push(item.text);
    }
  }

  return parts.join(" ");
}

function unwrapPreviewText(text) {
  const trimmed = text.trim();
  if (!trimmed) {
    return "";
  }

  if (/^<(environment_context|permissions instructions|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions|local-command-|command-name)/.test(trimmed)) {
    return "";
  }

  const wrappedQuery = trimmed.match(/^<user_query>\s*([\s\S]*?)\s*<\/user_query>$/);
  if (wrappedQuery) {
    return wrappedQuery[1];
  }

  return trimmed
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/g, "")
    .replace(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/g, "$1")
    .trim();
}
