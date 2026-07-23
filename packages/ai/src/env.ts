import { z } from "zod";

export const EnvSchema = z.object({
  // Database
  DATABASE_URL: z.string().url().min(1, "DATABASE_URL is required"),

  // Auth
  BETTER_AUTH_SECRET: z.string().min(32, "BETTER_AUTH_SECRET must be at least 32 characters"),
  BETTER_AUTH_URL: z.string().url().default("http://localhost:3000"),
  APP_URL: z.string().url().default("http://localhost:3000"),

  // AI / 9Router
  AI_PROVIDER_MODE: z.enum(["mock", "9router"]).default("mock"),
  NINE_ROUTER_BASE_URL: z.string().url().optional(),
  NINE_ROUTER_API_KEY: z.string().optional(),
  NINE_ROUTER_DEFAULT_MODEL: z.string().optional(),
  NINE_ROUTER_CHEAP_MODEL: z.string().optional(),
  NINE_ROUTER_STRONG_MODEL: z.string().optional(),

  // Storage
  STORAGE_PROVIDER: z.enum(["local", "s3"]).default("local"),
  STORAGE_LOCAL_PATH: z.string().default("./data/exports"),

  // Payment
  PAYMENT_PROVIDER: z.enum(["none", "sumopod"]).default("none"),

  // Environment
  NODE_ENV: z.enum(["development", "production", "test"]).default("development"),
});

export type Env = z.infer<typeof EnvSchema>;

let validated: Env | null = null;

export function validateEnv(): Env {
  if (validated) return validated;

  const isProduction = process.env.NODE_ENV === "production";

  const result = EnvSchema.safeParse(process.env);

  if (!result.success) {
    const errors = result.error.issues
      .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
      .join("\n");

    if (isProduction) {
      throw new Error(
        `[FATAL] Environment validation failed in production. Missing or invalid variables:\n${errors}\n` +
        "Mock fallback is NOT available in production. Set all required environment variables."
      );
    }

    console.warn(
      `⚠ Environment validation warnings (development only):\n${errors}`
    );
  }

  validated = result.data ?? EnvSchema.parse({});
  return validated;
}

// Quick way to check if we should use mock AI
export function useMockAi(): boolean {
  const isProduction = process.env.NODE_ENV === "production";

  if (isProduction) {
    // In production, mock AI must NEVER activate silently.
    // If AI_PROVIDER_MODE is not explicitly "9router" with a key, fail.
    if (process.env.AI_PROVIDER_MODE !== "9router" || !process.env.NINE_ROUTER_API_KEY) {
      throw new Error(
        "[FATAL] AI_PROVIDER_MODE must be '9router' with NINE_ROUTER_API_KEY set in production. Mock mode is not allowed."
      );
    }
    return false;
  }

  return process.env.AI_PROVIDER_MODE !== "9router" || !process.env.NINE_ROUTER_API_KEY;
}
