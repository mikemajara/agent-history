/**
 * Minimal markdown → terminal text for the preview pane.
 * MVP: inline bold/italic/code, ATX headers, unordered list bullets.
 */

/**
 * Format markdown into display lines (one per source line).
 * Markers are stripped; styles use ANSI unless NO_COLOR / color:false.
 *
 * @param {string} text
 * @param {{ color?: boolean }} [options]
 * @returns {string[]}
 */
export function formatMarkdownLines(text, options = {}) {
  const useColor = options.color !== false && !process.env.NO_COLOR;
  return String(text ?? "")
    .split(/\r?\n/)
    .map((line) => formatMarkdownLine(line, useColor));
}

/**
 * Strip MVP markdown markers without applying styles.
 * @param {string} text
 */
export function stripMarkdown(text) {
  return formatMarkdownLines(text, { color: false }).join("\n");
}

function formatMarkdownLine(line, useColor) {
  const heading = /^(#{1,3})\s+(.*)$/.exec(line);
  if (heading) {
    const body = formatInline(heading[2], useColor);
    return useColor ? ansi("1", body) : body;
  }

  const list = /^[-*]\s+(.*)$/.exec(line);
  if (list) {
    return `• ${formatInline(list[1], useColor)}`;
  }

  return formatInline(line, useColor);
}

function formatInline(text, useColor) {
  const slots = [];
  const protect = (value) => {
    const token = `\u0000${slots.length}\u0000`;
    slots.push(value);
    return token;
  };

  // Code first so markers inside backticks stay literal.
  let result = String(text ?? "").replace(/`([^`]+)`/g, (_, code) => (
    protect(useColor ? ansi("36", code) : code)
  ));

  result = result.replace(/\*\*([^*]+)\*\*/g, (_, body) => (
    useColor ? ansi("1", body) : body
  ));

  result = result.replace(/__([^_]+)__/g, (_, body) => (
    useColor ? ansi("1", body) : body
  ));

  result = result.replace(/(^|[^*])\*([^*]+)\*(?!\*)/g, (_, lead, body) => (
    `${lead}${useColor ? ansi("3", body) : body}`
  ));

  result = result.replace(/(^|[^_])_([^_]+)_(?!_)/g, (_, lead, body) => (
    `${lead}${useColor ? ansi("3", body) : body}`
  ));

  return result.replace(/\u0000(\d+)\u0000/g, (_, index) => slots[Number(index)] ?? "");
}

function ansi(code, text) {
  return `\x1b[${code}m${text}\x1b[0m`;
}
