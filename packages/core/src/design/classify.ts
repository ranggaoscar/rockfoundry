import type { ProjectState } from "../schema/project";
import type { DesignRevisionImpact } from "../schema/design";

const PRODUCT_PATTERN =
  /\b(recruiter|permission|role|workflow|erd|entity|akun|account|ownership|multi[- ]?user|beberapa recruiter|banyak recruiter|bisa punya)\b/i;
const STRUCTURE_PATTERN =
  /\b(sidebar|bottom tab|top nav|navigation|layout|dashboard|compact|screen|mobile nav)\b/i;

export function classifyDesignRevision(text: string): DesignRevisionImpact {
  if (PRODUCT_PATTERN.test(text)) return "POTENTIAL_PRODUCT_DECISION";
  if (STRUCTURE_PATTERN.test(text)) return "DESIGN_STRUCTURE";
  return "VISUAL_ONLY";
}

export function affectedScreensForDecision(
  text: string,
  state: ProjectState,
): string[] {
  const screens = state.studio.screenMap;
  const lower = text.toLowerCase();
  return screens
    .filter((screen) => {
      if (/recruiter|perusahaan|employer|company/.test(lower))
        return (
          screen.actorIds.includes("employer") ||
          /employer|company/.test(screen.id)
        );
      return false;
    })
    .map((screen) => screen.id);
}
