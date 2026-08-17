import "dotenv/config";
import fs from "node:fs";
import path from "node:path";
import { PrismaLibSql } from "@prisma/adapter-libsql";
import { PrismaClient } from "@prisma/client";
import { appDataDir, databasePath, databaseUrl, projectsDir } from "./paths";

export * from "@prisma/client";
export * from "./paths";

fs.mkdirSync(path.dirname(databasePath), { recursive: true });
fs.mkdirSync(projectsDir, { recursive: true });

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

function createPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  const adapter = new PrismaLibSql({ url: databaseUrl });
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

export const localStorageInfo = {
  appDataDir,
  databasePath,
  projectsDir,
  databaseUrl,
};
