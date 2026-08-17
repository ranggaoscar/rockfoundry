import path from "node:path";

type RuntimeEnv = NodeJS.ProcessEnv;

export function resolveAppDataDir(
  env: RuntimeEnv = process.env,
  platform = process.platform,
) {
  if (env.ROCKFOUNDRY_DATA_DIR) return env.ROCKFOUNDRY_DATA_DIR;
  if (platform === "win32") {
    return path.join(
      env.LOCALAPPDATA || path.join(env.USERPROFILE || ".", "AppData", "Local"),
      "RockFoundry",
    );
  }
  if (platform === "darwin") {
    return path.join(
      env.HOME || ".",
      "Library",
      "Application Support",
      "RockFoundry",
    );
  }
  return path.join(
    env.XDG_DATA_HOME || path.join(env.HOME || ".", ".local", "share"),
    "rockfoundry",
  );
}

function configuredDatabasePath(value: string, appDataDir: string) {
  const raw = decodeURIComponent(
    value.slice("file:".length).replace(/^\/\//, ""),
  );
  const windowsAbsolute = /^[A-Za-z]:[\\/]/.test(raw);
  if (path.isAbsolute(raw) || windowsAbsolute) return raw;
  return path.resolve(appDataDir, raw);
}

export const appDataDir = resolveAppDataDir();
export const projectsDir = path.join(appDataDir, "projects");
export const databasePath = process.env.ROCKFOUNDRY_DATABASE_URL?.startsWith(
  "file:",
)
  ? configuredDatabasePath(process.env.ROCKFOUNDRY_DATABASE_URL, appDataDir)
  : path.join(appDataDir, "rockfoundry.db");
export const databaseUrl = `file:${databasePath.replace(/\\/g, "/")}`;

export const localPaths = {
  appDataDir,
  projectsDir,
  databasePath,
  databaseUrl,
};
