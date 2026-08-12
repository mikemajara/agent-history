import { spawn } from "node:child_process";

/**
 * Reinstall the package globally at @latest via npm.
 * @param {{ stdout: { write: (s: string) => void }, stderr: { write: (s: string) => void } }} io
 * @param {{
 *   packageName?: string,
 *   currentVersion?: string,
 *   runNpm?: (args: string[], io: unknown) => Promise<number>,
 * }} [options]
 * @returns {Promise<number>}
 */
export async function upgradePackage(io, options = {}) {
  const packageName = options.packageName ?? "agent-history";
  const currentVersion = options.currentVersion;
  const runNpm = options.runNpm ?? runNpmInstall;

  const versionLabel = currentVersion ? ` (currently ${currentVersion})` : "";
  io.stdout.write(`Upgrading ${packageName}${versionLabel}...\n`);

  const exitCode = await runNpm(["install", "-g", `${packageName}@latest`], io);
  if (exitCode === 0) {
    io.stdout.write(`Installed ${packageName}@latest.\n`);
  }
  return exitCode;
}

function runNpmInstall(args, io) {
  return new Promise((resolve) => {
    const child = spawn("npm", args, {
      stdio: "inherit",
      shell: process.platform === "win32",
    });

    child.once("error", (error) => {
      io.stderr.write(`Failed to run npm: ${error.message}\n`);
      resolve(1);
    });
    child.once("exit", (code) => resolve(code ?? 1));
  });
}
