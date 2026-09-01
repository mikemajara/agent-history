import { execFileSync } from "node:child_process";

/** Font Awesome bookmark (Nerd Fonts). */
export const NERD_BOOKMARK = "\uf02e";
/** Unicode black star when a Nerd Font is not available. */
export const STAR_PIN = "★";

const NERD_TERM_PROGRAMS = new Set([
  "ghostty",
  "iterm.app",
  "wezterm",
  "kitty",
  "vscode",
  "warpterminal",
  "alacritty",
]);

let nerdCached;

/**
 * Prefer Nerd Fonts when available.
 * Override with AGENT_HISTORY_NERD_FONTS=0|1 (or AGENT_HISTORY_ICONS=star|nerd).
 */
export function useNerdFonts() {
  if (nerdCached !== undefined) return nerdCached;

  const override = (process.env.AGENT_HISTORY_NERD_FONTS ?? process.env.AGENT_HISTORY_ICONS ?? "")
    .trim()
    .toLowerCase();
  if (override === "0" || override === "off" || override === "star" || override === "emoji") {
    return (nerdCached = false);
  }
  if (override === "1" || override === "on" || override === "nerd") {
    return (nerdCached = true);
  }

  const termProgram = (process.env.TERM_PROGRAM ?? "").trim().toLowerCase();
  if (NERD_TERM_PROGRAMS.has(termProgram)) {
    return (nerdCached = true);
  }

  try {
    const out = execFileSync("fc-list", [":", "family"], {
      encoding: "utf8",
      timeout: 750,
      stdio: ["ignore", "pipe", "ignore"],
    });
    nerdCached = /nerd/i.test(out);
  } catch {
    nerdCached = false;
  }
  return nerdCached;
}

export function resetNerdFontCache() {
  nerdCached = undefined;
}

/** Pin glyph for the META column: Nerd bookmark, otherwise a star. */
export function pinMarker() {
  return useNerdFonts() ? NERD_BOOKMARK : STAR_PIN;
}
