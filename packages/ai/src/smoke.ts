/**
 * AI Smoke Test
 *
 * Tests the real 9Router integration by submitting one known product idea
 * and validating the response schema.
 *
 * Usage: pnpm ai:smoke
 * Requires configured 9Router environment variables.
 */

import { NineRouterGateway } from "./gateway";
import { InitialIdeaExtractionSchema } from "@rockfoundry/core";
import {
  SYSTEM_PROMPTS,
  TASK_MODEL_TIER,
  TASK_TEMPERATURE,
  TASK_TIMEOUT,
} from "./prompts";

async function main() {
  const apiKey = process.env.NINE_ROUTER_API_KEY;
  const baseUrl = process.env.NINE_ROUTER_BASE_URL || "https://api.9router.com";

  if (!apiKey) {
    console.error("✗ NINE_ROUTER_API_KEY is not configured.");
    console.error(
      "  Set AI_PROVIDER_MODE=9router and NINE_ROUTER_API_KEY in .env",
    );
    process.exit(1);
  }

  const models = {
    default: process.env.NINE_ROUTER_DEFAULT_MODEL || "gpt-4o",
    cheap: process.env.NINE_ROUTER_CHEAP_MODEL || "gpt-4o-mini",
    strong: process.env.NINE_ROUTER_STRONG_MODEL || "gpt-4o",
  };

  console.log("╔══════════════════════════════════════════════╗");
  console.log("║   RockFoundry AI Provider Smoke Test        ║");
  console.log("╚══════════════════════════════════════════════╝");
  console.log();
  console.log(`Provider: 9Router`);
  console.log(`Base URL: ${baseUrl}`);
  console.log(`Default model: ${models.default}`);
  console.log(`Cheap model: ${models.cheap}`);
  console.log(`Strong model: ${models.strong}`);
  console.log();

  const gateway = new NineRouterGateway(baseUrl, apiKey, models);

  const testIdea = `A mobile-first booking platform that lets dog owners find and book trusted pet sitters in their neighborhood. Owners can browse sitter profiles with verified reviews, see real-time availability, and pay securely through the app. Sitters get a dashboard to manage bookings, set their rates, and receive payments automatically.`;

  console.log("Submitting test idea for extraction...");
  console.log(`Idea: "${testIdea.substring(0, 80)}..."`);
  console.log();

  try {
    const taskType = "initial_idea_extraction";
    const prompt = SYSTEM_PROMPTS[taskType];

    const startTime = Date.now();

    const result = await gateway.complete({
      modelTier: TASK_MODEL_TIER[taskType],
      messages: [
        { role: "system", content: prompt },
        {
          role: "user",
          content: `Extract structured information from this product idea:\n\n---\n${testIdea}\n---`,
        },
      ],
      temperature: TASK_TEMPERATURE[taskType],
      responseSchema: InitialIdeaExtractionSchema as any,
    });

    const elapsed = Date.now() - startTime;

    console.log("✓ Extraction completed successfully!");
    console.log();
    console.log(`Model: ${result.metadata?.model || "unknown"}`);
    console.log(`Latency: ${result.metadata?.latency || elapsed}ms`);
    console.log(
      `Tokens: ${result.usage?.totalTokens || "?"} (prompt: ${result.usage?.promptTokens || "?"}, completion: ${result.usage?.completionTokens || "?"})`,
    );
    console.log();

    // Validate the response against schema
    try {
      const parsed = InitialIdeaExtractionSchema.parse(result.data);
      console.log("✓ Response schema validation passed");
      console.log();

      if (parsed.normalizedSummary) {
        console.log(`Summary: ${parsed.normalizedSummary.value}`);
      }
      if (parsed.productType) {
        console.log(`Product type: ${parsed.productType.value}`);
      }
      console.log(`Users found: ${parsed.primaryUsers?.length || 0}`);
      console.log(`Entities found: ${parsed.coreEntities?.length || 0}`);
      console.log(
        `Capabilities found: ${parsed.proposedCapabilities?.length || 0}`,
      );
      console.log(`Ambiguities found: ${parsed.ambiguities?.length || 0}`);

      console.log();
      console.log("╔══════════════════════════════════════════════╗");
      console.log("║   Smoke test PASSED ✓                        ║");
      console.log("╚══════════════════════════════════════════════╝");
      process.exit(0);
    } catch (parseError) {
      console.error("✗ Response schema validation FAILED");
      console.error(parseError);
      console.log();
      console.log("Raw response (first 500 chars):");
      console.log(JSON.stringify(result.data).substring(0, 500));
      process.exit(1);
    }
  } catch (error) {
    console.error("✗ AI Provider request FAILED");
    console.error(error);
    process.exit(1);
  }
}

main();
