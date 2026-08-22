import {
  AgentActionSchema,
  AgentObservationSchema,
  type AgentAction,
  type AgentObservation,
} from "./actions";
import type { ProjectState } from "../schema";
import type { ToolRegistry } from "../tools/registry";

export const MAX_AGENT_ITERATIONS = 8;

export type AgentPlanner = {
  nextAction(input: {
    project: ProjectState;
    observations: AgentObservation[];
    iteration: number;
    tools: Array<{ name: string; description: string }>;
    latestUserMessage?: string;
  }): Promise<unknown> | unknown;
};

export type AgentActivity = {
  action: AgentAction;
  observation?: AgentObservation;
  durationMs: number;
};

export type AgentLoopResult = {
  activities: AgentActivity[];
  finalAction: AgentAction;
  iterationCount: number;
};

/**
 * Executes only schema-validated actions. Tool output is an observation, never
 * a direct state mutation or a human decision.
 */
export class AgentRunner {
  constructor(
    private readonly planner: AgentPlanner,
    private readonly tools: ToolRegistry,
    private readonly maxIterations = MAX_AGENT_ITERATIONS,
  ) {}

  async run(input: {
    project: ProjectState;
    latestUserMessage?: string;
    onToolRun?: (activity: AgentActivity) => Promise<void> | void;
  }): Promise<AgentLoopResult> {
    const activities: AgentActivity[] = [];
    const observations: AgentObservation[] = [];

    for (let iteration = 1; iteration <= this.maxIterations; iteration++) {
      const rawAction = await this.planner.nextAction({
        project: input.project,
        observations,
        iteration,
        tools: this.tools.list(),
        latestUserMessage: input.latestUserMessage,
      });
      const action = AgentActionSchema.parse(rawAction);
      const startedAt = Date.now();

      if (action.type !== "CALL_TOOL") {
        return { activities, finalAction: action, iterationCount: iteration };
      }

      const output = await this.tools.execute(
        action.toolName,
        { project: input.project },
        action.input,
      );
      const observation = AgentObservationSchema.parse({
        type: `TOOL:${action.toolName}`,
        summary: `Completed ${action.toolName}.`,
        data: output,
      });
      const activity = {
        action,
        observation,
        durationMs: Date.now() - startedAt,
      };
      activities.push(activity);
      observations.push(observation);
      await input.onToolRun?.(activity);
    }

    const finalAction = AgentActionSchema.parse({
      id: "agent-iteration-limit",
      type: "WAIT_FOR_USER",
      reason: "Agent reached its safe iteration limit before selecting a question.",
    });
    return {
      activities,
      finalAction,
      iterationCount: this.maxIterations,
    };
  }
}

export function deterministicDiscoveryPlanner(question: {
  id: string;
  text: string;
  relatedRequirementIds: string[];
  options?: Array<{ id: string; label: string; description?: string }>;
}): AgentPlanner {
  return {
    nextAction({ iteration }) {
      if (iteration === 1)
        return {
          id: "read-project-state",
          type: "CALL_TOOL",
          toolName: "project_state_read",
          input: {},
          rationale: "Read the canonical product state before selecting a decision.",
        };
      return {
        id: `ask-${question.id}`,
        type: "ASK_USER",
        questionId: question.id,
        question: question.text,
        relatedRequirementIds: question.relatedRequirementIds,
        options: question.options || [],
      };
    },
  };
}
