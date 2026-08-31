import { matchNaturalAnswer } from "@rockfoundry/core";
import { prisma } from "@rockfoundry/db";

export type MessageIntent =
  | "BRAINSTORM"
  | "CLARIFICATION"
  | "CORRECTION"
  | "SPEC_REQUEST"
  | "DESIGN_REQUEST"
  | "RESEARCH_REQUEST"
  | "REFERENCE"
  | "HANDOFF_REQUEST"
  | "ACTIVE_DECISION_ANSWER"
  | "NEW_PRODUCT_CONTEXT"
  | "REFERENCE_URL"
  | "AMBIGUOUS";

const URL_PATTERN = /https?:\/\/[^\s)]+/i;
const RESEARCH_PATTERN =
  /\b(cari|search|riset|research|bandingkan|compare|contoh|referensi|reference|bagaimana .*(?:menangani|memisahkan|melakukan)|how does .* handle)\b/i;
const DESIGN_PATTERN =
  /\b(buat|bikin|generate|mulai|open)\s+(design|desain|prototype)\b/i;
const SPEC_PATTERN =
  /\b(spec|spesifikasi|product spec|dokumen|handoff|build brief)\b/i;
const CORRECTION_PATTERN =
  /\b(sebenarnya|bukan|bukan begini|eh|nggak|tidak boleh|revisi|koreksi|revise|wait no|actually|ternyata)\b/i;

export function classifyMessage(text: string): MessageIntent {
  const trimmed = text.trim();
  if (URL_PATTERN.test(trimmed)) return "REFERENCE";
  if (RESEARCH_PATTERN.test(trimmed)) return "RESEARCH_REQUEST";
  if (DESIGN_PATTERN.test(trimmed)) return "DESIGN_REQUEST";
  if (SPEC_PATTERN.test(trimmed)) {
    return /handoff|dokumen/i.test(trimmed) ? "HANDOFF_REQUEST" : "SPEC_REQUEST";
  }
  if (CORRECTION_PATTERN.test(trimmed)) return "CORRECTION";
  return "BRAINSTORM";
}

/** Compatibility export for the optional legacy quick-reply endpoint. */
export const mapNaturalAnswer = matchNaturalAnswer;

export async function persistUserMessage(
  projectId: string,
  content: string,
  metadata: Record<string, unknown> = {},
) {
  return prisma.conversationMessage.create({
    data: {
      projectId,
      role: "user",
      content,
      metadata: JSON.stringify({ source: "USER", ...metadata }),
    },
  });
}

export async function persistConversationMessage(
  projectId: string,
  role: "user" | "assistant",
  content: string,
  metadata: Record<string, unknown>,
) {
  return prisma.conversationMessage.create({
    data: {
      projectId,
      role,
      content,
      metadata: JSON.stringify({ source: role === "user" ? "USER" : "AGENT", ...metadata }),
    },
  });
}
