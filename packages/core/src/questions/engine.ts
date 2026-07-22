import { ProjectState, Question, RequirementNode } from "../schema";

// Simple deterministic template engine for Phase 1
export class QuestionEngine {
  
  generateQuestions(state: ProjectState, topUnresolved: RequirementNode[], maxCount: number = 3): Question[] {
    const questions: Question[] = [];

    for (const node of topUnresolved) {
      if (questions.length >= maxCount) break;

      // Deterministic templates based on requirement category
      if (node.category === "DATA" && node.id === "req-db-type") {
        questions.push({
          id: `q-${node.id}`,
          text: `Because this app tracks ${state.entities.join(", ") || "various records"}, should their history remain strictly connected (like linking a user to all their past orders), or can each record stand independently?`,
          contextReferences: ["entities"],
          relatedRequirementIds: [node.id],
          answerType: "SINGLE_CHOICE",
          options: [
            { id: "connected", label: "Connected history", description: "Records must link strictly together." },
            { id: "independent", label: "Independent records", description: "Records are mostly standalone documents." }
          ],
          recommendation: "Connected history is standard for most apps that need reporting.",
          priority: node.priority,
          reasonAsked: "Choosing how data relates helps finalize the storage architecture."
        });
        continue;
      }

      if (node.category === "USERS" && node.id === "req-auth-type") {
        questions.push({
          id: `q-${node.id}`,
          text: `How should the ${state.targetUsers.join(" and ") || "users"} identify themselves when opening the app?`,
          contextReferences: ["targetUsers"],
          relatedRequirementIds: [node.id],
          answerType: "MULTIPLE_CHOICE",
          options: [
            { id: "email_pass", label: "Standard email and password" },
            { id: "oauth", label: "Sign in with Google, Apple, or similar" },
            { id: "magic", label: "Email a magic sign-in link (passwordless)" },
            { id: "sso", label: "Company/Enterprise login (SSO)" },
            { id: "none", label: "No login needed (Anonymous)" }
          ],
          recommendation: "Standard email + Google sign-in covers most modern needs.",
          priority: node.priority,
          reasonAsked: "Authentication decides how user identity is secured and managed."
        });
        continue;
      }

      // Generic fallback (must be specific to the node)
      questions.push({
        id: `q-${node.id}`,
        text: `Regarding ${node.title}: Can you clarify how you want to handle ${node.description.toLowerCase()}?`,
        contextReferences: [],
        relatedRequirementIds: [node.id],
        answerType: "FREE_TEXT",
        priority: node.priority,
        reasonAsked: "This is a high-risk unresolved requirement blocking development readiness."
      });
    }

    return questions;
  }
}
