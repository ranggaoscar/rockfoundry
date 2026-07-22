import { AiGateway, MockGatewayProvider, NineRouterGateway } from "@rockfoundry/ai";

const getProvider = () => {
  if (process.env.NINE_ROUTER_API_KEY) {
    return new NineRouterGateway(
      process.env.NINE_ROUTER_BASE_URL || "https://api.9router.com",
      process.env.NINE_ROUTER_API_KEY,
      {
        default: process.env.NINE_ROUTER_DEFAULT_MODEL || "gpt-4o",
        cheap: process.env.NINE_ROUTER_CHEAP_MODEL || "gpt-4o-mini",
        strong: process.env.NINE_ROUTER_STRONG_MODEL || "gpt-4o",
      }
    ) as any;
  }
  return new MockGatewayProvider();
};

export const aiGateway = new AiGateway(getProvider());
