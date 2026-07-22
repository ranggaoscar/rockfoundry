import { ProjectState, Contradiction } from "../schema";

type ContradictionRule = {
  id: string;
  check: (state: ProjectState) => Contradiction | null;
}

export const rules: ContradictionRule[] = [
  {
    id: "internal-vs-public",
    check: (state) => {
      const isInternal = state.targetUsers.some(u => u.toLowerCase().includes("internal") || u.toLowerCase().includes("employee"));
      const isPublicReg = state.features.some(f => f.toLowerCase().includes("public registration") || f.toLowerCase().includes("self-serve"));
      
      if (isInternal && isPublicReg) {
        return {
          id: "internal-vs-public",
          severity: "BLOCKING",
          conflictingFields: ["targetUsers", "features"],
          explanation: "Target users indicate internal tools, but features require public self-serve registration.",
          recommendedResolution: "Decide if the app is strictly internal (admin invites only) or public-facing SaaS."
        };
      }
      return null;
    }
  },
  {
    id: "no-login-vs-private-data",
    check: (state) => {
      const noLogin = state.features.some(f => f.toLowerCase().includes("no login") || f.toLowerCase().includes("anonymous"));
      const privateData = state.features.some(f => f.toLowerCase().includes("user dashboard") || f.toLowerCase().includes("private profile"));
      
      if (noLogin && privateData) {
        return {
          id: "no-login-vs-private-data",
          severity: "BLOCKING",
          conflictingFields: ["features"],
          explanation: "App is designed for anonymous users, but includes private user-specific dashboards.",
          recommendedResolution: "Add authentication, or switch dashboards to session-based local storage only."
        };
      }
      return null;
    }
  }
];

export function detectContradictions(state: ProjectState): Contradiction[] {
  const contradictions: Contradiction[] = [];
  for (const rule of rules) {
    const result = rule.check(state);
    if (result) contradictions.push(result);
  }
  return contradictions;
}
