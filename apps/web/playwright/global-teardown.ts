import { spawn } from "node:child_process";

export default async function globalTeardown() {
  const isolatedDataDir = process.env.PLAYWRIGHT_ISOLATED_DATA_DIR;
  if (!isolatedDataDir) return;

  const cleanupScript = `
    const fs = require("node:fs");
    const target = process.argv[1];
    let attempts = 0;
    const remove = () => {
      try {
        fs.rmSync(target, { recursive: true, force: true });
      } catch (error) {
        const retryable = ["EBUSY", "EPERM", "ENOTEMPTY"].includes(error && error.code);
        if (retryable && attempts++ < 30) return setTimeout(remove, 500);
        process.exitCode = 1;
      }
    };
    remove();
  `;

  const cleanup = spawn(process.execPath, ["-e", cleanupScript, isolatedDataDir], {
    detached: true,
    stdio: "ignore",
    windowsHide: true,
  });
  cleanup.unref();
}
