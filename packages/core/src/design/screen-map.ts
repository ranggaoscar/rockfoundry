import type { ProjectState } from "../schema/project";
import { DesignScreenSchema, type DesignScreen } from "../schema/design";

function slug(value: string) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 32);
}

function ideaLooksLikeJobMarketplace(state: ProjectState) {
  const text =
    `${state.rawIdea} ${state.normalizedSummary || ""} ${state.productType || ""}`.toLowerCase();
  return /job|kerja|lowongan|kandidat|recruiter|employer|pencari kerja/.test(
    text,
  );
}

function ideaLooksLikeCrm(state: ProjectState) {
  const text =
    `${state.rawIdea} ${state.normalizedSummary || ""}`.toLowerCase();
  return /crm|lead|quotation|sales pipeline|customer relationship/.test(text);
}

function confirmedEmployerPosting(state: ProjectState) {
  return state.decisions.some(
    (decision) =>
      decision.status === "ACCEPTED" &&
      /two_sided|perusahaan|employer|posting|pasang/.test(
        `${decision.topic} ${decision.decision}`,
      ),
  );
}

export function deriveScreenMap(state: ProjectState): DesignScreen[] {
  if (ideaLooksLikeJobMarketplace(state)) {
    const seeker: DesignScreen[] = [
      {
        id: "job-discover",
        name: "Job Discovery",
        actorIds: ["job_seeker"],
        purpose: "Browse and filter open roles.",
        route: "#/jobs",
        status: "DRAFT",
        source: "SYSTEM",
      },
      {
        id: "job-detail",
        name: "Job Detail",
        actorIds: ["job_seeker"],
        purpose: "Inspect one role before applying or saving.",
        route: "#/jobs/demo",
        status: "DRAFT",
        source: "SYSTEM",
      },
      {
        id: "job-saved",
        name: "Saved Jobs",
        actorIds: ["job_seeker"],
        purpose: "Keep interesting roles for later.",
        route: "#/saved",
        status: "INFERRED",
        source: "INFERRED",
      },
      {
        id: "job-applications",
        name: "Applications",
        actorIds: ["job_seeker"],
        purpose: "Track submitted applications.",
        route: "#/applications",
        status: "INFERRED",
        source: "INFERRED",
      },
    ];
    if (confirmedEmployerPosting(state)) {
      seeker.push(
        {
          id: "employer-dashboard",
          name: "Employer Dashboard",
          actorIds: ["employer"],
          purpose: "See hiring activity and next actions.",
          route: "#/employer",
          status: "DRAFT",
          source: "USER",
        },
        {
          id: "employer-jobs",
          name: "Job Listings",
          actorIds: ["employer"],
          purpose: "Manage posted roles.",
          route: "#/employer/jobs",
          status: "DRAFT",
          source: "USER",
        },
        {
          id: "employer-candidates",
          name: "Candidates",
          actorIds: ["employer"],
          purpose: "Review applicants for a role.",
          route: "#/employer/candidates",
          status: "INFERRED",
          source: "INFERRED",
        },
      );
    }
    return seeker.map((screen) => DesignScreenSchema.parse(screen));
  }

  if (ideaLooksLikeCrm(state)) {
    return [
      {
        id: "crm-inbox",
        name: "Lead Inbox",
        actorIds: ["sales"],
        purpose: "Work incoming leads from every channel.",
        route: "#/leads",
        status: "DRAFT",
        source: "SYSTEM",
      },
      {
        id: "crm-customer",
        name: "Customer Record",
        actorIds: ["sales", "owner"],
        purpose: "See one customer history without inventing extra records.",
        route: "#/customers/demo",
        status: "DRAFT",
        source: "SYSTEM",
      },
      {
        id: "crm-owner",
        name: "Owner Overview",
        actorIds: ["owner"],
        purpose: "Review activity across brands.",
        route: "#/owner",
        status: "INFERRED",
        source: "INFERRED",
      },
    ].map((screen) => DesignScreenSchema.parse(screen));
  }

  const actors = state.targetUsers.length
    ? state.targetUsers
    : state.roles.length
      ? state.roles
      : ["user"];
  return actors.slice(0, 3).flatMap((actor, index) => {
    const id = slug(actor) || `actor-${index + 1}`;
    return [
      DesignScreenSchema.parse({
        id: `${id}-home`,
        name: `${actor} Home`,
        actorIds: [id],
        purpose: `Primary workspace for ${actor}.`,
        route: index === 0 ? "#/" : `#/${id}`,
        status: "INFERRED",
        source: "INFERRED",
      }),
    ];
  });
}
