/**
 * Provider-neutral AI smoke test.
 *
 * Usage: pnpm ai:smoke
 * Set OPENAI_COMPATIBLE_API_KEY to run it. Without a key, the check reports SKIPPED.
 */

import { NineRouterGateway } from "./gateway";
import { InitialIdeaExtractionSchema } from "@rockfoundry/core";
import { SYSTEM_PROMPTS, TASK_MODEL_TIER, TASK_TEMPERATURE } from "./prompts";

async function main() {
  const apiKey = process.env.OPENAI_COMPATIBLE_API_KEY;
  if (!apiKey) {
    console.log("SKIPPED: OPENAI_COMPATIBLE_API_KEY is not configured.");
    process.exit(0);
  }

  const baseUrl =
    process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1";
  const model = process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini";
  const gateway = new NineRouterGateway(baseUrl, apiKey, {
    default: model,
    cheap: model,
    strong: model,
  });
  const testIdea =
    "Build inventory for three marble warehouses with transfer history.";
  const taskType = "initial_idea_extraction";
  const startedAt = Date.now();

  try {
    const result = await gateway.complete({
      taskType,
      modelTier: TASK_MODEL_TIER[taskType],
      messages: [
        { role: "system", content: SYSTEM_PROMPTS[taskType] },
        {
          role: "user",
          content: `Extract structured information from this product idea:\n\n---\n${testIdea}\n---`,
        },
      ],
      temperature: TASK_TEMPERATURE[taskType],
      responseSchema: InitialIdeaExtractionSchema as any,
    });
    const parsed = InitialIdeaExtractionSchema.parse(result.data);
    console.log(
      `PASS: provider responded in ${result.metadata?.latency || Date.now() - startedAt}ms.`,
    );
    console.log(`Model: ${result.metadata?.model || model}`);
    console.log(
      `Users: ${parsed.primaryUsers.length}; entities: ${parsed.coreEntities.length}.`,
    );
  } catch {
    console.error(
      "FAILED: configured AI provider did not return a valid Agentic V1 extraction.",
    );
    process.exit(1);
  }
}

void main();
