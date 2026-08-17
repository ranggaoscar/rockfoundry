import { ProjectState, Question, RequirementNode } from "../schema";
import { validateQuestionQuality } from "./quality";

// Question template interface
interface QuestionTemplate {
  category: string;
  condition: (state: ProjectState) => boolean;
  generate: (state: ProjectState) => Question;
  priority: number;
}

export class QuestionEngine {
  private templates: QuestionTemplate[];

  constructor() {
    this.templates = this.buildTemplates();
  }

  private buildTemplates(): QuestionTemplate[] {
    return [
      // ── DATA: Entity relationships ──────────────────────
      {
        category: "DATA",
        priority: 9,
        condition: (state) => state.entities.length > 0,
        generate: (state) => ({
          id: "q-req-db-type",
          text: `Because ${state.name || "this product"} tracks ${state.entities.slice(0, 3).join(", ")}, should all related records stay connected in one history (like linking a customer to their orders), or can each record exist independently?`,
          contextReferences: ["entities"],
          relatedRequirementIds: ["req-db-type"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "connected",
              label: "Connected history",
              description:
                "Records must link strictly together in a relational way.",
            },
            {
              id: "independent",
              label: "Independent records",
              description: "Records are mostly standalone documents or events.",
            },
          ],
          recommendation:
            "Connected history is standard for most apps that need reporting and analytics.",
          tradeoffs:
            "Connected history enables rich queries but adds database complexity.",
          priority: 8,
          reasonAsked: `The entities (${state.entities.slice(0, 3).join(", ")}) suggest data relationships that affect database design.`,
        }),
      },

      // ── DATA: Data sensitivity ──────────────────────────
      {
        category: "DATA",
        priority: 7,
        condition: (state) =>
          (state.productType?.toLowerCase().includes("health") ?? false) ||
          (state.productType?.toLowerCase().includes("finance") ?? false) ||
          (state.productType?.toLowerCase().includes("medical") ?? false),
        generate: (state) => ({
          id: `q-data-sensitivity-${Date.now()}`,
          text: `${state.name || "This product"} appears to be in a regulated domain. What level of data sensitivity and compliance does it need to handle? For example, does it store personal health data, financial transactions, or personally identifiable information?`,
          contextReferences: ["productType"],
          relatedRequirementIds: ["req-security-level"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "standard",
              label: "Standard data",
              description: "Basic user data with standard protection.",
            },
            {
              id: "sensitive",
              label: "Sensitive data",
              description:
                "Personal data needing encryption and access controls.",
            },
            {
              id: "regulated",
              label: "Regulated data",
              description:
                "Subject to HIPAA, GDPR, SOC2, or similar regulations.",
            },
          ],
          recommendation:
            "Treat data as sensitive by default. Compliance can be added later but retrofitting is expensive.",
          priority: 7,
          reasonAsked:
            "The product type suggests regulated data handling requirements.",
        }),
      },

      // ── USERS: Authentication ───────────────────────────
      {
        category: "USERS",
        priority: 10,
        condition: (state) => state.targetUsers.length > 0,
        generate: (state) => ({
          id: "q-req-auth-type",
          text: `How should your ${state.targetUsers.slice(0, 2).join(" and ") || "users"} identify themselves when using ${state.name || "this product"}?`,
          contextReferences: ["targetUsers"],
          relatedRequirementIds: ["req-auth-type"],
          answerType: "MULTIPLE_CHOICE",
          options: [
            {
              id: "email",
              label: "Email and password",
              description: "Standard login form.",
            },
            {
              id: "oauth",
              label: "Sign in with Google or Apple",
              description: "Social sign-in.",
            },
            {
              id: "magic",
              label: "Magic link (passwordless)",
              description: "Email a one-time sign-in link.",
            },
            {
              id: "sso",
              label: "Enterprise SSO",
              description: "SAML/SSO for company accounts.",
            },
            {
              id: "none",
              label: "No login needed",
              description: "Fully anonymous / no accounts.",
            },
          ],
          recommendation:
            "Email + Google sign-in covers most product types and users expect it.",
          tradeoffs:
            "Adding auth adds complexity but is essential for personalization and data ownership.",
          priority: 9,
          reasonAsked:
            "Authentication is the foundation of user identity and security.",
        }),
      },

      // ── USERS: Multiple user types ──────────────────────
      {
        category: "USERS",
        priority: 8,
        condition: (state) => state.targetUsers.length > 1,
        generate: (state) => ({
          id: `q-user-roles-${Date.now()}`,
          text: `${state.name || "The product"} has multiple user types: ${state.targetUsers.join(", ")}. Do they need different permissions and access levels? For example, should ${state.targetUsers[0] || "one type"} see different things than ${state.targetUsers[1] || "another type"}?`,
          contextReferences: ["targetUsers"],
          relatedRequirementIds: ["req-auth-type"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "roles",
              label: "Yes, role-based access",
              description: "Each user type has permissions and views.",
            },
            {
              id: "same",
              label: "No, same experience",
              description: "All users see the same interface.",
            },
          ],
          recommendation:
            "Role-based access is safer to build early — merging roles later is easier than splitting.",
          priority: 8,
          reasonAsked: "Multiple user types suggest different access needs.",
        }),
      },

      // ── USERS: Registration flow ────────────────────────
      {
        category: "USERS",
        priority: 7,
        condition: (state) =>
          state.targetUsers.some(
            (u) =>
              u.toLowerCase().includes("internal") ||
              u.toLowerCase().includes("employee"),
          ),
        generate: (state) => ({
          id: `q-registration-${Date.now()}`,
          text: `Since ${state.name || "the product"} involves internal users, should registration be invite-only (admin creates accounts), or can anyone sign up? This affects onboarding flow and security model.`,
          contextReferences: ["targetUsers"],
          relatedRequirementIds: ["req-auth-type"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "invite",
              label: "Invite-only",
              description: "Admin sends invites to new users.",
            },
            {
              id: "open",
              label: "Open registration with approval",
              description: "Anyone can request, admin approves.",
            },
          ],
          recommendation:
            "Internal tools work best with invite-only to control access.",
          priority: 7,
          reasonAsked: "Internal users need controlled access.",
        }),
      },

      // ── WORKFLOW: Core actions ──────────────────────────
      {
        category: "WORKFLOW",
        priority: 8,
        condition: (state) => state.features.length > 0,
        generate: (state) => ({
          id: `q-workflow-priority-${Date.now()}`,
          text: `Of these features — ${state.features.slice(0, 4).join(", ")} — which one should work first in an MVP? Focus on the single most important action a user takes.`,
          contextReferences: ["features"],
          relatedRequirementIds: ["req-workflow-core"],
          answerType: "SINGLE_CHOICE",
          options: state.features.slice(0, 5).map((f, i) => ({
            id: `feat-${i}`,
            label: f.length > 40 ? f.substring(0, 40) + "..." : f,
            description: `Prioritize ${f} in the MVP.`,
          })),
          recommendation:
            "Focus on the feature that delivers the core value proposition.",
          tradeoffs:
            "Building more features slows down the MVP — launch with the minimum valuable set.",
          priority: 8,
          reasonAsked:
            "Knowing the MVP feature helps prioritize the implementation plan.",
        }),
      },

      // ── SCALE: Expected usage ───────────────────────────
      {
        category: "SCALE",
        priority: 6,
        condition: (state) => state.features.length > 2,
        generate: (state) => ({
          id: `q-scale-users-${Date.now()}`,
          text: `How many ${state.targetUsers[0] || "users"} do you expect to have in the first 6 months? This helps decide hosting infrastructure and database design.`,
          contextReferences: ["targetUsers"],
          relatedRequirementIds: ["req-scale"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "tens",
              label: "Tens of users",
              description: "Small team or pilot.",
            },
            {
              id: "hundreds",
              label: "Hundreds of users",
              description: "Growing product.",
            },
            {
              id: "thousands",
              label: "Thousands of users",
              description: "Scaling product.",
            },
            { id: "unknown", label: "No idea yet", description: "Uncertain." },
          ],
          recommendation:
            "Start simple with what you know. Most products overestimate early scale needs.",
          tradeoffs:
            "Over-engineering for scale slows development; under-engineering needs rework.",
          priority: 6,
          reasonAsked:
            "Scale expectations shape hosting, database, and caching decisions.",
        }),
      },

      // ── DESIGN: Platform preference ─────────────────────
      {
        category: "DESIGN",
        priority: 5,
        condition: (state: ProjectState) => state.platforms.length === 0,
        generate: (state) => ({
          id: `q-platform-${Date.now()}`,
          text: `Which platforms should ${state.name || "the product"} be available on? This affects the technology choices and development approach.`,
          contextReferences: [],
          relatedRequirementIds: ["req-platform"],
          answerType: "MULTIPLE_CHOICE",
          options: [
            {
              id: "web",
              label: "Web (responsive)",
              description: "Works in any browser.",
            },
            {
              id: "mobile",
              label: "Mobile app",
              description: "iOS and/or Android native.",
            },
            {
              id: "both",
              label: "Both web and mobile",
              description: "Web-first then mobile app.",
            },
          ],
          recommendation:
            "Start web-first unless offline or native device features are essential from day one.",
          tradeoffs:
            "Web is faster to build and iterate; mobile provides better native experience.",
          priority: 5,
          reasonAsked:
            "Platform choice determines the technology stack and development approach.",
        }),
      },

      // ── INTEGRATIONS: Third-party services ──────────────
      {
        category: "INTEGRATIONS",
        priority: 6,
        condition: (state) =>
          state.integrations.length === 0 && state.features.length > 0,
        generate: (state) => ({
          id: `q-integrations-${Date.now()}`,
          text: `${state.name || "The product"} will likely need to connect to other services. Do you have any existing tools or services ${state.name || "the product"} should integrate with? For example: payment processors (Stripe), email services (SendGrid), or analytics platforms?`,
          contextReferences: ["features"],
          relatedRequirementIds: ["req-integrations"],
          answerType: "FREE_TEXT",
          recommendation:
            "Start with the bare minimum integrations. Add more as user feedback confirms the need.",
          priority: 6,
          reasonAsked:
            "Integrations affect the API design and data flow architecture.",
        }),
      },

      // ── SECURITY: Privacy considerations ────────────────
      {
        category: "SECURITY",
        priority: 7,
        condition: (state) =>
          state.features.some(
            (f) =>
              f.toLowerCase().includes("payment") ||
              f.toLowerCase().includes("profile") ||
              f.toLowerCase().includes("personal"),
          ),
        generate: (state) => ({
          id: `q-privacy-${Date.now()}`,
          text: `${state.name || "The product"} involves personal or payment data. What privacy regulations or data protection requirements apply to your target users? For example: GDPR for European users, CCPA for California, or industry-specific rules like HIPAA for healthcare.`,
          contextReferences: ["features"],
          relatedRequirementIds: ["req-security-level"],
          answerType: "MULTIPLE_CHOICE",
          options: [
            {
              id: "none",
              label: "None at this stage",
              description: "Start with basic security best practices.",
            },
            {
              id: "gdpr",
              label: "GDPR",
              description: "European data protection.",
            },
            { id: "ccpa", label: "CCPA", description: "California privacy." },
            {
              id: "soc2",
              label: "SOC2",
              description: "Enterprise security compliance.",
            },
          ],
          recommendation:
            "Apply GDPR-level data protection as a baseline — it's the most comprehensive standard.",
          tradeoffs:
            "Compliance adds development cost but removes barriers for enterprise customers.",
          priority: 7,
          reasonAsked:
            "Privacy requirements affect data storage, user consent flows, and legal compliance.",
        }),
      },

      // ── DEPLOYMENT: Hosting preference ──────────────────
      {
        category: "DEPLOYMENT",
        priority: 5,
        condition: (state) => true,
        generate: (state) => ({
          id: `q-hosting-${Date.now()}`,
          text: `Where should ${state.name || "the product"} be hosted initially?`,
          contextReferences: [],
          relatedRequirementIds: ["req-hosting"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "cloud",
              label: "Cloud hosting (Vercel/Railway)",
              description: "Fast setup, managed infrastructure.",
            },
            {
              id: "vps",
              label: "VPS (DigitalOcean/Linode)",
              description: "More control, higher maintenance.",
            },
            {
              id: "self",
              label: "Self-hosted",
              description: "Full control, highest maintenance.",
            },
            {
              id: "unknown",
              label: "Not sure yet",
              description: "Need to research options.",
            },
          ],
          recommendation:
            "Start with a managed cloud provider like Vercel or Railway to minimize DevOps overhead.",
          tradeoffs:
            "Managed cloud is simpler but more expensive at scale; VPS is cheaper but needs maintenance.",
          priority: 5,
          reasonAsked:
            "Hosting choice affects deployment strategy, CI/CD setup, and infrastructure costs.",
        }),
      },

      // ── LAUNCH: Monetization ───────────────────────────
      {
        category: "LAUNCH",
        priority: 6,
        condition: (state) =>
          !state.productType ||
          state.productType.toLowerCase().includes("internal") === false,
        generate: (state) => ({
          id: `q-monetization-${Date.now()}`,
          text: `How does ${state.name || "the product"} plan to make money? This feeds into the business model and payment integration requirements.`,
          contextReferences: [],
          relatedRequirementIds: ["req-monetization"],
          answerType: "SINGLE_CHOICE",
          options: [
            {
              id: "subscription",
              label: "Monthly/Yearly subscription",
              description: "Recurring billing.",
            },
            {
              id: "free",
              label: "Free to use",
              description: "No monetization yet.",
            },
            {
              id: "ads",
              label: "Ad-supported",
              description: "Revenue from ads.",
            },
            {
              id: "marketplace",
              label: "Transaction fees",
              description: "Commission on transactions.",
            },
            {
              id: "enterprise",
              label: "Enterprise licensing",
              description: "Custom pricing for businesses.",
            },
            { id: "unknown", label: "Not sure yet", description: "Undecided." },
          ],
          recommendation:
            "Subscription works best for SaaS products with recurring value delivery.",
          tradeoffs:
            "Free is easiest for adoption but zero revenue; subscriptions need payment infrastructure.",
          priority: 6,
          reasonAsked:
            "Monetization model affects user account design, payment integration, and feature gating.",
        }),
      },
    ];
  }

  generateQuestions(
    state: ProjectState,
    topUnresolved: RequirementNode[],
    maxCount: number = 5,
  ): Question[] {
    const questions: Question[] = [];
    const usedCategories = new Set<string>();

    // First, try to match templates based on state
    const applicableTemplates = this.templates
      .filter((t) => t.condition(state))
      .sort((a, b) => b.priority - a.priority);

    for (const template of applicableTemplates) {
      if (questions.length >= maxCount) break;

      // Avoid asking the same category twice in a row
      if (usedCategories.has(template.category) && questions.length < 3)
        continue;

      const question = template.generate(state);
      // Avoid duplicate questions by checking if similar text already exists
      const isDuplicate = questions.some(
        (q) => q.text.substring(0, 50) === question.text.substring(0, 50),
      );
      if (!isDuplicate && validateQuestionQuality(question, state).accepted) {
        questions.push(question);
        usedCategories.add(template.category);
      }
    }

    // Fill remaining slots with requirement-based questions
    if (questions.length < maxCount) {
      for (const node of topUnresolved) {
        if (questions.length >= maxCount) break;

        // Skip if this node's category is already covered
        if (
          usedCategories.has(node.category) &&
          questions.some((q) => q.relatedRequirementIds.includes(node.id))
        ) {
          continue;
        }

        questions.push({
          id: `q-req-${node.id}-${Date.now()}`,
          text: `Regarding **${node.title}**: ${node.description}. How would you like to approach this?`,
          contextReferences: [],
          relatedRequirementIds: [node.id],
          answerType: "FREE_TEXT",
          priority: node.priority || 5,
          reasonAsked: `This is an unresolved requirement with priority ${node.priority} that affects ${node.category}.`,
          recommendation: node.resolution || undefined,
        });

        usedCategories.add(node.category);
      }
    }

    // If still empty, add a generic question to start the conversation
    if (questions.length === 0) {
      questions.push({
        id: `q-generic-${Date.now()}`,
        text: `Great, you've started ${state.name || "a new project"}! What's the primary problem you're trying to solve for your users?`,
        contextReferences: [],
        relatedRequirementIds: [],
        answerType: "FREE_TEXT",
        priority: 10,
        reasonAsked:
          "Every product needs a clear understanding of the problem it solves.",
      });
    }

    return questions;
  }

  /**
   * Process an answer and return updated state with provenance tracking.
   */
  processAnswer(
    state: ProjectState,
    questionId: string,
    answer: string | string[],
  ): {
    updatedState: ProjectState;
    revision: { version: number; createdAt: string };
  } {
    const nextState = JSON.parse(JSON.stringify(state)) as ProjectState & {
      _version?: number;
    };

    // Track version for revision history (stored in metadata)
    const currentVersion = (nextState as any)._version || 1;

    // Record the decision
    const answerText = Array.isArray(answer) ? answer.join(", ") : answer;
    nextState.decisions.push({
      id: `dec-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`,
      topic: questionId,
      decision: answerText,
      reason: "User answered during adaptive discovery",
      source: "USER",
      confidence: "EXPLICIT",
      status: "ACCEPTED",
      affects: [],
    });

    // Record provenance
    if (!nextState.generationMetadata) {
      nextState.generationMetadata = {};
    }
    nextState.generationMetadata[`answer_${questionId}_${Date.now()}`] = {
      answer: answerText,
      timestamp: new Date().toISOString(),
      previousVersion: currentVersion,
    };

    return {
      updatedState: nextState,
      revision: {
        version: currentVersion,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
