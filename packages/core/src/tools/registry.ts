import { z } from "zod";
import { detectContradictions } from "../graph/contradictions";
import { evaluateReadinessDirectly } from "../graph/evaluator";
import { renderArtifacts } from "../export/generator";
import { ProjectStateSchema, type ProjectState } from "../schema";

export type ToolContext = { project: ProjectState };
export type ToolDefinition<
  TInput extends z.ZodTypeAny = z.ZodTypeAny,
  TOutput extends z.ZodTypeAny = z.ZodTypeAny,
> = {
  name: string;
  description: string;
  inputSchema: TInput;
  outputSchema: TOutput;
  execute: (
    context: ToolContext,
    input: z.infer<TInput>,
  ) => Promise<z.infer<TOutput>> | z.infer<TOutput>;
};

export class ToolRegistry {
  private readonly definitions = new Map<string, ToolDefinition>();
  register<TInput extends z.ZodTypeAny, TOutput extends z.ZodTypeAny>(
    definition: ToolDefinition<TInput, TOutput>,
  ) {
    if (this.definitions.has(definition.name))
      throw new Error(`Tool already registered: ${definition.name}`);
    this.definitions.set(definition.name, definition as ToolDefinition);
    return this;
  }
  get(name: string) {
    return this.definitions.get(name);
  }
  list() {
    return [...this.definitions.values()].map(({ name, description }) => ({
      name,
      description,
    }));
  }
  async execute(name: string, context: ToolContext, rawInput: unknown) {
    const definition = this.definitions.get(name);
    if (!definition) throw new Error(`Unknown tool: ${name}`);
    const input = definition.inputSchema.parse(rawInput);
    const output = await definition.execute(
      { project: ProjectStateSchema.parse(context.project) },
      input,
    );
    return definition.outputSchema.parse(output);
  }
}

const EmptyInput = z.object({});
const StateReadOutput = z.object({
  facts: z.array(z.string()),
  decisions: z.array(z.unknown()),
  assumptions: z.array(z.unknown()),
  openQuestions: z.array(z.string()),
  contradictions: z.array(z.unknown()),
  readiness: z.object({
    score: z.number(),
    level: z.string(),
    breakdown: z.record(z.string(), z.number()),
  }),
  decisionDebt: z.object({
    score: z.number(),
    inventionRisk: z.string(),
    summary: z.string(),
    unresolvedHighRiskCount: z.number(),
    unresolvedArtifactSectionCount: z.number().optional(),
    topRisks: z.array(z.unknown()),
  }),
});
const JsonOutput = z.record(z.string(), z.unknown());

export function createDefaultToolRegistry() {
  return new ToolRegistry()
    .register({
      name: "project_state_read",
      description:
        "Read canonical facts, decisions, assumptions, questions, contradictions, references, and readiness.",
      inputSchema: EmptyInput,
      outputSchema: StateReadOutput,
      execute: ({ project }) => ({
        facts: [project.rawIdea, project.normalizedSummary || ""].filter(
          Boolean,
        ),
        decisions: project.decisions,
        assumptions: project.assumptions,
        openQuestions: project.openQuestions,
        contradictions: project.contradictions,
        readiness: {
          score: project.readinessScore,
          level: project.readiness,
          breakdown: project.readinessBreakdown,
        },
        decisionDebt: {
          score: project.decisionDebt?.score ?? 0,
          inventionRisk: project.decisionDebt?.inventionRisk ?? "HIGH",
          summary: project.decisionDebt?.summary ?? "",
          unresolvedHighRiskCount:
            project.decisionDebt?.unresolvedHighRiskCount ?? 0,
          unresolvedArtifactSectionCount:
            project.decisionDebt?.unresolvedArtifactSectionCount ?? 0,
          topRisks: project.decisionDebt?.topRisks ?? [],
        },
      }),
    })
    .register({
      name: "requirements_check",
      description:
        "Evaluate business, product, and data readiness without treating answered questions as the only signal.",
      inputSchema: EmptyInput,
      outputSchema: JsonOutput,
      execute: ({ project }) =>
        evaluateReadinessDirectly(project) as unknown as Record<
          string,
          unknown
        >,
    })
    .register({
      name: "contradiction_check",
      description: "Detect conflicts in the current canonical state.",
      inputSchema: EmptyInput,
      outputSchema: z.object({ contradictions: z.array(z.unknown()) }),
      execute: ({ project }) => ({
        contradictions: detectContradictions(project),
      }),
    })
    .register({
      name: "artifact_generate",
      description:
        "Render the handoff package from canonical state, including anti-invention files.",
      inputSchema: z.object({
        types: z
          .array(
            z.enum([
              "BRD",
              "PRD",
              "ERD",
              "DO_NOT_INVENT",
              "DECISIONS",
              "INVARIANTS",
              "READINESS",
              "AGENT_HANDOFF",
              "DECISIONS_JSON",
              "ALL",
            ]),
          )
          .default(["ALL"]),
      }),
      outputSchema: JsonOutput,
      execute: ({ project }, input) => {
        const docs = renderArtifacts(project);
        const wantsAll = input.types.includes("ALL");
        return {
          documents: wantsAll
            ? docs
            : Object.fromEntries(
                input.types.map((type) => [
                  type,
                  docs[type as keyof typeof docs],
                ]),
              ),
        };
      },
    });
}
