import { InitialIdeaExtraction, InitialIdeaExtractionSchema } from "@rockfoundry/core";
import { AiGatewayProvider as CoreAiGatewayProvider, InferenceRequest, InferenceResponse } from "./schema";

export * from "./schema";
export * from "./gateway";

export class MockGatewayProvider implements CoreAiGatewayProvider {
  async complete<T>(req: InferenceRequest<T>): Promise<InferenceResponse<T>> {
    // Basic mock implementation simulating an LLM response
    const mockIdea: InitialIdeaExtraction = {
      normalizedSummary: { value: "A normalized version of the idea.", confidence: "EXPLICIT", extractionReason: "Mocked" },
      primaryUsers: [
        { value: "End User", confidence: "EXPLICIT", extractionReason: "Standard user" }
      ],
      userProblems: [],
      objectives: [],
      proposedCapabilities: [],
      coreEntities: [
        { value: "Account", confidence: "STRONGLY_INFERRED", extractionReason: "Most apps need accounts" }
      ],
      expectedWorkflows: [],
      integrationsMentioned: [],
      platforms: [],
      privacySignals: [],
      scaleSignals: [],
      designSignals: [],
      constraints: [],
      assumptions: [],
      ambiguities: [
        { value: "Unclear scale", confidence: "WEAKLY_INFERRED", extractionReason: "Scale was not mentioned" }
      ],
      possibleContradictions: [],
      unsupportedClaims: []
    };
    
    return {
      data: mockIdea as unknown as T,
      usage: { totalTokens: 100 },
      metadata: { provider: "mock", model: "mock", latency: 10 }
    };
  }
}

export class AiGateway {
  constructor(private provider: CoreAiGatewayProvider = new MockGatewayProvider()) {}

  async runInitialExtraction(rawIdea: string): Promise<InitialIdeaExtraction> {
    const result = await this.provider.complete({
      modelTier: "default",
      messages: [
        {
          role: "system",
          content: `You are a product analyst. Extract structured information from a raw product idea.

RULES:
- ONLY extract information explicitly supported by the raw idea
- Mark confidence as EXPLICIT for directly stated facts
- Mark confidence as STRONGLY_INFERRED for high-probability inferences
- Mark confidence as WEAKLY_INFERRED for low-confidence guesses
- Mark confidence as UNKNOWN for unclear areas
- NEVER invent target users, monetization, or technical stack
- NEVER return markdown or prose outside the schema
- Preserve domain-specific terminology exactly
- Detect ambiguous words and multiple interpretations
- Always provide evidenceText showing the source span from the raw idea
- Always provide extractionReason explaining why this was extracted`
        },
        { role: "user", content: `Extract structured information from this product idea:\n\n---\n${rawIdea}\n---` }
      ],
      temperature: 0.1,
      responseSchema: InitialIdeaExtractionSchema as any
    });

    return InitialIdeaExtractionSchema.parse(result.data);
  }
}
