import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
export * from "@prisma/client";

function resolveAppDataDir() {
  if (process.env.ROCKFOUNDRY_DATA_DIR) return process.env.ROCKFOUNDRY_DATA_DIR;
  if (process.platform === "win32")
    return path.join(
      process.env.LOCALAPPDATA ||
        path.join(process.env.USERPROFILE || ".", "AppData", "Local"),
      "RockFoundry",
    );
  if (process.platform === "darwin")
    return path.join(
      process.env.HOME || ".",
      "Library",
      "Application Support",
      "RockFoundry",
    );
  return path.join(
    process.env.XDG_DATA_HOME ||
      path.join(process.env.HOME || ".", ".local", "share"),
    "rockfoundry",
  );
}

export const appDataDir = resolveAppDataDir();
export const projectsDir = path.join(appDataDir, "projects");
export const databasePath =
  process.env.ROCKFOUNDRY_DATABASE_URL?.replace(/^file:/, "") ||
  path.join(appDataDir, "rockfoundry.db");

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const fileUrl = `file:${databasePath.replace(/\\/g, "/")}`;
  const adapter = new PrismaLibSql({ url: fileUrl });
  const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });
  globalForPrisma.prisma = prisma;
  return prisma;
}

export const prisma = createPrismaClient();

export function projectDataPath(projectId: string) {
  const dir = path.join(projectsDir, projectId);
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export function providerConfigDir() {
  const dir = path.join(appDataDir, "config");
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

export async function disconnectDatabase() {
  await prisma.$disconnect();
  globalForPrisma.prisma = undefined;
}

export const localStorageInfo = { appDataDir, databasePath, projectsDir };
