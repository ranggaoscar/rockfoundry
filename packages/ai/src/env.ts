import { z } from "zod";

export const EnvSchema = z.object({
  ROCKFOUNDRY_DATABASE_URL: z.string().optional(),
  AI_PROVIDER_MODE: z.enum(["mock", "openai-compatible"]).default("mock"),
  OPENAI_COMPATIBLE_BASE_URL: z.string().url().optional(),
  OPENAI_COMPATIBLE_API_KEY: z.string().optional(),
  OPENAI_COMPATIBLE_MODEL: z.string().optional(),
  NODE_ENV: z
    .enum(["development", "production", "test"])
    .default("development"),
});
export type Env = z.infer<typeof EnvSchema>;

let validated: Env | null = null;
export function validateEnv(): Env {
  if (validated) return validated;
  const result = EnvSchema.safeParse(process.env);
  if (!result.success) {
    if (process.env.NODE_ENV === "production")
      throw new Error("RockFoundry environment configuration is invalid.");
    console.warn("RockFoundry is using local development defaults.");
    validated = EnvSchema.parse({});
    return validated;
  }
  validated = result.data;
  return validated;
}

export function shouldUseMockAi() {
  return (
    process.env.AI_PROVIDER_MODE !== "openai-compatible" ||
    !process.env.OPENAI_COMPATIBLE_API_KEY
  );
}
