import { Pool } from "pg"
import { PrismaPg } from "@prisma/adapter-pg"
import { PrismaClient } from "@prisma/client"
export * from "@prisma/client"

const globalForPrisma = globalThis as unknown as { prisma: PrismaClient, pgPool: Pool }

function createPrismaClient() {
  if (globalForPrisma.prisma) return globalForPrisma.prisma;
  
  if (!globalForPrisma.pgPool) {
    globalForPrisma.pgPool = new Pool({
      connectionString: process.env.DATABASE_URL || "postgresql://postgres:password@localhost:5432/rockfoundry?schema=public",
      max: 10,
    });
  }
  
  const adapter = new PrismaPg(globalForPrisma.pgPool)
  const prisma = new PrismaClient({
    adapter,
    log: process.env.NODE_ENV === "development" ? ["query", "error", "warn"] : ["error"],
  })
  
  return prisma;
}

export const prisma = createPrismaClient()

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma