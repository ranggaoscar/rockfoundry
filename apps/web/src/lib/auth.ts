import { betterAuth } from "better-auth";
import { prisma } from "@rockfoundry/db";

export const auth = betterAuth({
  database: {
    provider: "postgresql",
    // Better Auth uses its own adapter; we pass prisma directly
    client: prisma,
  },
  emailAndPassword: {
    enabled: true,
    requireEmailVerification: false, // Alpha: skip email verification
  },
  session: {
    expiresIn: 60 * 60 * 24 * 30, // 30 days
    updateAge: 60 * 60 * 24,       // Refresh every 24h
  },
  trustedOrigins: [process.env.BETTER_AUTH_TRUSTED_ORIGIN || "http://localhost:3000"],
});

export type Session = typeof auth.$Infer.Session;
