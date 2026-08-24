import { describe, expect, it } from "vitest";
import { AiGateway, MockGatewayProvider } from "../index";
import { TASK_REASONING_EFFORT, reasoningEffortForTask } from "../prompts";

describe("Design V2 reasoning policy", () => {
  it("uses one task policy without mutating provider fallback", () => {
    expect(TASK_REASONING_EFFORT.screen_architecture).toBe("max");
    expect(TASK_REASONING_EFFORT.design_architecture).toBe("max");
    expect(TASK_REASONING_EFFORT.prototype_generation).toBe("high");
    expect(TASK_REASONING_EFFORT.design_quality_review).toBe("high");
    expect(TASK_REASONING_EFFORT.prototype_repair).toBe("high");
    expect(reasoningEffortForTask("design_architecture", "medium")).toBe("medium");
  });

  it("quality review returns structured output through the mock transport", async () => {
    const gateway = new AiGateway(new MockGatewayProvider());
    await expect(gateway.runDesignQualityReview({
      productSummary: "Kasir mencatat pesanan warteg.",
      screenMap: [{ id: "orders", route: "#/orders" }],
      designSpec: { productName: "Kasir" },
      prototype: { html: "<main>orders</main>", css: ".x{}", js: "" },
      quality: { accepted: false, reasons: ["weak hierarchy"] },
    })).resolves.toMatchObject({ verdict: "PASS", score: 86 });
  });
});
