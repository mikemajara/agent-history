import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

/** Cells occupied by a harness PNG in the AGENT column. */
export const HARNESS_ICON_CELLS = 2;
/** Blank cell between the PNG and the agent label. */
export const HARNESS_ICON_GAP = 1;

export function harnessIconSlotWidth() {
  return HARNESS_ICON_CELLS + HARNESS_ICON_GAP;
}

const HARNESS_ICON_FILES = {
  cursor: "cursor.png",
  claude: "claude.png",
  codex: "codex.png",
  opencode: "opencode.png",
};

const ASSET_DIR = fileURLToPath(new URL("../../assets/harness/", import.meta.url));

let protocolCached;
const pngCache = new Map();

/**
 * Kitty / iTerm2 inline images when the terminal can paint them.
 * Override with AGENT_HISTORY_IMAGES=0|1|kitty|iterm.
 * Off inside tmux (passthrough is unreliable) unless the override forces a protocol.
 */
export function detectImageProtocol() {
  if (protocolCached !== undefined) return protocolCached;

  const override = (process.env.AGENT_HISTORY_IMAGES ?? "").trim().toLowerCase();
  if (override === "0" || override === "off" || override === "no" || override === "false") {
    return (protocolCached = null);
  }
  if (override === "kitty") return (protocolCached = "kitty");
  if (override === "iterm" || override === "iterm2") return (protocolCached = "iterm");
  if (override === "1" || override === "on" || override === "yes") {
    return (protocolCached = guessImageProtocol() ?? "kitty");
  }
  if (process.env.TMUX) return (protocolCached = null);
  return (protocolCached = guessImageProtocol());
}

function guessImageProtocol() {
  const term = (process.env.TERM ?? "").toLowerCase();
  const program = (process.env.TERM_PROGRAM ?? "").toLowerCase();
  if (process.env.KITTY_WINDOW_ID || term.includes("kitty") || program === "ghostty" || program === "wezterm") {
    return "kitty";
  }
  if (program === "iterm.app" || (process.env.LC_TERMINAL ?? "").toLowerCase() === "iterm2") {
    return "iterm";
  }
  return null;
}

export function useTerminalImages() {
  return detectImageProtocol() != null;
}

export function resetTerminalImageCache() {
  protocolCached = undefined;
}

export function hasHarnessIcon(agent) {
  return Boolean(HARNESS_ICON_FILES[agent]);
}

function harnessPng(agent) {
  const file = HARNESS_ICON_FILES[agent];
  if (!file) return null;
  if (pngCache.has(agent)) return pngCache.get(agent);
  try {
    const buf = readFileSync(path.join(ASSET_DIR, file));
    pngCache.set(agent, buf);
    return buf;
  } catch {
    pngCache.set(agent, null);
    return null;
  }
}

/** Clear Kitty image placements. No-op for iTerm (cells clear with ED). */
export function deleteVisibleImages() {
  if (detectImageProtocol() !== "kitty") return "";
  return "\x1b_Ga=d,d=A,q=2\x1b\\";
}

/**
 * Inline PNG at the current cursor. Occupies 2 columns × 1 row; does not move the cursor.
 * @param {string} agent
 */
export function encodeHarnessImage(agent) {
  const protocol = detectImageProtocol();
  const png = harnessPng(agent);
  if (!protocol || !png) return "";
  const payload = png.toString("base64");
  if (protocol === "iterm") {
    return `\x1b]1337;File=inline=1;width=${HARNESS_ICON_CELLS};height=1;preserveAspectRatio=1;doNotMoveCursor=1:${payload}\x07`;
  }
  return `\x1b_Ga=T,f=100,c=${HARNESS_ICON_CELLS},r=1,C=1,q=2;${payload}\x1b\\`;
}

/**
 * @param {{ row: number, col: number, agent: string }[]} placements
 */
export function renderImagePlacements(placements) {
  if (!useTerminalImages() || !placements?.length) return "";
  let out = "";
  for (const placement of placements) {
    const image = encodeHarnessImage(placement.agent);
    if (!image) continue;
    out += `\x1b[${placement.row};${placement.col}H${image}`;
  }
  return out;
}
