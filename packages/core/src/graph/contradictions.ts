import { ProjectState, Contradiction } from "../schema";

type ContradictionRule = {
  id: string;
  check: (state: ProjectState) => Contradiction | null;
};

export const rules: ContradictionRule[] = [
  {
    id: "internal-vs-public",
    check: (state) => {
      const internal = state.targetUsers.some((user) =>
        /internal|employee|warehouse staff/i.test(user),
      );
      const publicRegistration = state.features.some((feature) =>
        /public registration|self-serve|anyone can sign up/i.test(feature),
      );
      if (!internal || !publicRegistration) return null;
      return {
        id: "internal-vs-public",
        severity: "BLOCKING",
        conflictingFields: ["targetUsers", "features"],
        explanation:
          "The project names internal users but also requires public self-registration.",
        recommendedResolution:
          "Choose invite-only access for internal users or explicitly make the product public.",
        status: "OPEN",
      };
    },
  },
  {
    id: "no-login-vs-private-data",
    check: (state) => {
      const anonymous = state.features.some((feature) =>
        /no login|anonymous/i.test(feature),
      );
      const privateData = state.features.some((feature) =>
        /private profile|private customer|personal dashboard/i.test(feature),
      );
      if (!anonymous || !privateData) return null;
      return {
        id: "no-login-vs-private-data",
        severity: "BLOCKING",
        conflictingFields: ["features", "permissions"],
        explanation:
          "The project requests anonymous access while also requiring private user-specific data.",
        recommendedResolution:
          "Define an identity boundary or make the data non-personal.",
        status: "OPEN",
      };
    },
  },
  {
    id: "single-location-vs-transfers",
    check: (state) => {
      const oneLocation = state.entities.some((entity) =>
        /one warehouse|single warehouse/i.test(entity),
      );
      const transfers = state.workflows.some((workflow) =>
        /transfer|move.*warehouse/i.test(workflow),
      );
      if (!oneLocation || !transfers) return null;
      return {
        id: "single-location-vs-transfers",
        severity: "WARNING",
        conflictingFields: ["entities", "workflows"],
        explanation:
          "The project describes one location but also requires cross-location transfers.",
        recommendedResolution:
          "Confirm whether multiple locations are in scope for the first build.",
        status: "OPEN",
      };
    },
  },
];

export function detectContradictions(state: ProjectState): Contradiction[] {
  return rules.flatMap((rule) => {
    const result = rule.check(state);
    return result ? [result] : [];
  });
}
