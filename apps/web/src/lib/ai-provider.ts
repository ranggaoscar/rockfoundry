import {
  AiGateway,
  MockGatewayProvider,
  NineRouterGateway,
  shouldUseMockAi,
  validateEnv,
} from "@rockfoundry/ai";

try {
  validateEnv();
} catch (error) {
  if (process.env.NODE_ENV === "production") throw error;
}

function getProvider() {
  if (!shouldUseMockAi()) {
    return new NineRouterGateway(
      process.env.OPENAI_COMPATIBLE_BASE_URL || "https://api.openai.com/v1",
      process.env.OPENAI_COMPATIBLE_API_KEY || "",
      {
        default: process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini",
        cheap: process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini",
        strong: process.env.OPENAI_COMPATIBLE_MODEL || "gpt-4o-mini",
      },
    );
  }
  return new MockGatewayProvider();
}

export const aiGateway = new AiGateway(getProvider());
