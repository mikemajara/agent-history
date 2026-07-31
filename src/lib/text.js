export function compactPreview(text, maxLength = 140) {
  const compact = unwrapPromptText(String(text ?? "")).replace(/\s+/g, " ").trim();
  if (!compact) {
    return undefined;
  }

  return compact.length > maxLength ? compact.slice(0, maxLength) : compact;
}

// Codex may combine its injected instructions, runtime context, attachments, and
// the actual user request in one input_text record. Keep only the user-authored
// portion so previews, search, and the details panel remain readable.
export function unwrapPromptText(text) {
  let unwrapped = String(text ?? "").trim();
  if (!unwrapped) return "";

  unwrapped = unwrapped
    .replace(/^# AGENTS\.md instructions(?: for [^\n]+)?\s*<INSTRUCTIONS>[\s\S]*?<\/INSTRUCTIONS>\s*/i, "")
    .replace(/<(environment_context|permissions instructions|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions)>[\s\S]*?<\/\1>\s*/gi, "")
    .replace(/<image\b[^>]*>(?:\s*<\/image>)?\s*/gi, "")
    .trim();

  if (/^<(environment_context|permissions instructions|collaboration_mode|apps_instructions|skills_instructions|plugins_instructions|local-command-|command-name)/i.test(unwrapped)) {
    return "";
  }

  const wrappedQuery = unwrapped.match(/^<user_query>\s*([\s\S]*?)\s*<\/user_query>$/i);
  if (wrappedQuery) {
    return wrappedQuery[1];
  }

  return unwrapped
    .replace(/<timestamp>[\s\S]*?<\/timestamp>/gi, "")
    .replace(/<user_query>\s*([\s\S]*?)\s*<\/user_query>/gi, "$1")
    .trim();
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
