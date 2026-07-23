import { AiGateway, MockGatewayProvider, NineRouterGateway, validateEnv, useMockAi } from "@rockfoundry/ai";

// Validate environment at startup (throws in production if misconfigured)
try {
  validateEnv();
} catch (e) {
  // In server-side code, this will run during module initialization
  if (process.env.NODE_ENV === "production") {
    console.error("[FATAL] Environment validation failed:", e);
    // In production Next.js, this will cause the server to fail to start
    throw e;
  }
}

const getProvider = () => {
  const isMock = useMockAi();

  if (!isMock) {
    return new NineRouterGateway(
      process.env.NINE_ROUTER_BASE_URL || "https://api.9router.com",
      process.env.NINE_ROUTER_API_KEY!,
      {
        default: process.env.NINE_ROUTER_DEFAULT_MODEL || "gpt-4o",
        cheap: process.env.NINE_ROUTER_CHEAP_MODEL || "gpt-4o-mini",
        strong: process.env.NINE_ROUTER_STRONG_MODEL || "gpt-4o",
      }
    );
  }

  console.log("AI Provider: Mock mode (no 9Router credentials configured)");
  return new MockGatewayProvider();
};

export const aiGateway = new AiGateway(getProvider());
