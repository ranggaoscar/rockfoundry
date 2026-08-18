import type {
  ProjectState,
  Question,
  QuestionOption,
  RequirementNode,
} from "../schema";
import { buildGenericCandidates, type DecisionCandidate } from "./archetypes";
import { detectArtifactGapSignals } from "./artifact-gap-signals";
import {
  contextLabel,
  contextValues,
  extractStructuralContext,
} from "./context-extractor";
import { rankDecisionCandidates } from "./candidate-ranker";

function slug(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function hasDecision(state: ProjectState, topic: string) {
  return state.decisions.some(
    (decision) =>
      decision.topic === topic &&
      ["ACCEPTED", "PROPOSED"].includes(decision.status),
  );
}

function hasAmbiguousAnswer(state: ProjectState, topic: string) {
  return Object.values(state.generationMetadata).some((value) => {
    if (!value || typeof value !== "object") return false;
    const entry = value as { topic?: unknown; answer?: unknown };
    return (
      entry.topic === topic &&
      typeof entry.answer === "string" &&
      /\b(depends|tergantung|case by case|belum yakin|belum tahu|not sure|maybe|mungkin|masih dibahas|tbd)\b/i.test(
        entry.answer,
      )
    );
  });
}

function genericQuestionCopy(
  state: ProjectState,
  candidate: DecisionCandidate,
): { text: string; recommendation: string } {
  const context = extractStructuralContext(state);
  const roleValues = new Set(
    context.roles.map((item) => item.value.toLowerCase()),
  );
  const distinctEntityFacts = context.entities.filter(
    (item) => !roleValues.has(item.value.toLowerCase()),
  );
  const entityFacts = distinctEntityFacts.length
    ? distinctEntityFacts
    : context.entities;
  const id = context.language === "id";
  const entities = contextLabel(
    entityFacts,
    id ? "record utama" : "the main records",
  );
  const roles = contextLabel(
    context.roles,
    id ? "role yang terlibat" : "the roles involved",
  );
  const workflows = contextLabel(
    context.workflows,
    id ? "alur utama" : "the main workflow",
  );
  const primaryEntity = contextValues(entityFacts, 1)[0] || "record";
  const primaryWorkflow =
    contextValues(context.workflows, 1)[0] ||
    (id
      ? `alur pertama untuk ${primaryEntity}`
      : `the first workflow involving ${primaryEntity}`);
  const boundaries = contextLabel(
    context.boundaries,
    "organizational boundaries",
  );
  const followUp = hasAmbiguousAnswer(state, candidate.topic)
    ? id
      ? " Kalau jawabannya tergantung kasus, aturan apa yang menentukan pilihan itu? Beri satu contoh konkret."
      : " If it depends on the case, what rule determines the choice? Give one concrete example."
    : "";

  switch (candidate.archetype) {
    case "IDENTITY":
      return {
        text: id
          ? `Anda menyebut ${entities}. Kalau hal yang sama muncul lewat konteks atau peran berbeda, apakah harus menjadi satu record dengan histori bersama, atau record terpisah?${followUp}`
          : `You mentioned ${entities}. If the same real-world thing appears through different contexts or roles, should it remain one record with shared history or become separate records?${followUp}`,
        recommendation: id
          ? "Tentukan batas identitas sebelum histori, duplicate handling, dan relasi data dibangun."
          : "Set the identity boundary before history, duplicate handling, and data relationships are built.",
      };
    case "OWNERSHIP":
      return {
        text: id
          ? `Untuk ${entities} dalam ${workflows}, siapa pemilik operasional setelah record dibuat, dan apa yang terjadi jika tanggung jawab berpindah?${followUp}`
          : `For ${entities} in ${workflows}, who owns the record after creation, and what happens when responsibility changes?${followUp}`,
        recommendation: id
          ? "Ownership yang eksplisit mencegah record tanpa penanggung jawab dan menjaga riwayat reassignment."
          : "Explicit ownership prevents orphaned work and preserves reassignment history.",
      };
    case "VISIBILITY":
      return {
        text: id
          ? `Anda menyebut ${roles} dan ${entities}. Jika lebih dari satu role menangani record yang sama, siapa yang boleh melihat histori lengkap dan siapa yang hanya melihat bagian yang ditugaskan?${followUp}`
          : `You mentioned ${roles} and ${entities}. If more than one role handles the same record, who can see the full history and who is limited to the part assigned to them?${followUp}`,
        recommendation: id
          ? "Batas visibility sebaiknya mengikuti risiko data dan tanggung jawab, bukan default semua role bisa melihat semua."
          : "Visibility should follow data risk and responsibility instead of defaulting to every role seeing everything.",
      };
    case "LIFECYCLE":
      return {
        text: id
          ? `Untuk ${primaryEntity}, status apa yang perlu dilalui dari dibuat sampai selesai atau dibatalkan, dan kejadian apa yang membuatnya benar-benar selesai?${followUp}`
          : `For ${primaryEntity}, which states should it move through from creation to completion or cancellation, and what event makes it truly complete?${followUp}`,
        recommendation: id
          ? "Status dan transisi yang jelas menjaga workflow, notifikasi, dan acceptance criteria tetap konsisten."
          : "Clear states and transitions keep workflows, notifications, and acceptance criteria consistent.",
      };
    case "CONFLICT_CAPACITY":
      return {
        text: id
          ? `Karena ${entities} memiliki proses berbasis waktu atau resource terbatas, kalau dua permintaan memakai slot/resource yang sama, sistem harus menolak, mengantrikan, atau mengizinkan override dengan persetujuan?${followUp}`
          : `Because ${entities} involve time or constrained resources, when two requests target the same slot or resource, should the system reject, queue, or allow an approved override?${followUp}`,
        recommendation: id
          ? "Aturan conflict harus diputuskan sebelum availability dan notifikasi memberi janji kepada user."
          : "Conflict behavior should be decided before availability and notifications make promises to users.",
      };
    case "ASSIGNMENT":
      return {
        text: id
          ? `Saat ${entities} perlu ditangani oleh ${roles}, bagaimana assignment ditentukan dan bolehkah record dipindahkan ke role lain tanpa menghapus histori?${followUp}`
          : `When ${entities} need to be handled by ${roles}, how is assignment decided, and can a record move to another role without losing history?${followUp}`,
        recommendation: id
          ? "Assignment perlu membedakan pemilik saat ini dari histori siapa yang pernah menangani record."
          : "Assignment should distinguish current ownership from the history of who handled the record.",
      };
    case "CROSS_BOUNDARY":
      return {
        text: id
          ? `Jika ${entities} berpindah antar ${boundaries}, apakah ownership, visibility, histori, dan aturan workflow ikut berpindah atau tetap mengikuti tempat asal?${followUp}`
          : `If ${entities} move across ${boundaries}, do ownership, visibility, history, and workflow rules move with them or stay with the originating boundary?${followUp}`,
        recommendation: id
          ? "Perpindahan lintas batas harus eksplisit agar akses dan histori tidak berubah diam-diam."
          : "Cross-boundary movement needs an explicit rule so access and history do not change silently.",
      };
    case "DUPLICATE":
      return {
        text: id
          ? `Kalau ${primaryEntity} yang sama muncul dari konteks atau channel berbeda, apa yang dianggap duplicate: digabung, ditautkan, diberi tanda untuk review, atau tetap terpisah?${followUp}`
          : `If the same ${primaryEntity} appears from different contexts or channels, what counts as a duplicate: merge, link, flag for review, or keep separate?${followUp}`,
        recommendation: id
          ? "Jangan menggabungkan data secara diam-diam; tetapkan sinyal duplicate dan siapa yang memutuskan."
          : "Do not silently merge data; define the duplicate signal and who makes the final decision.",
      };
    case "HISTORY":
      return {
        text: id
          ? `Untuk histori ${primaryEntity}, perubahan apa yang harus tetap terlihat, siapa yang boleh melihatnya, dan apakah histori mengikuti record atau pemilik saat ini?${followUp}`
          : `For ${primaryEntity} history, which changes must remain visible, who may inspect them, and does history follow the record or its current owner?${followUp}`,
        recommendation: id
          ? "History policy memengaruhi audit, koreksi, privacy, dan kepercayaan pada data."
          : "History policy affects auditability, corrections, privacy, and trust in the data.",
      };
    case "COMPLETION":
      return {
        text: id
          ? `Untuk ${primaryWorkflow}, bukti apa yang membuat workflow dianggap selesai, dan apakah record yang selesai boleh dibuka kembali?${followUp}`
          : `For ${primaryWorkflow}, what evidence makes the workflow complete, and can a completed record be reopened?${followUp}`,
        recommendation: id
          ? "Completion harus terlihat di state dan laporan, bukan hanya berarti tombol terakhir ditekan."
          : "Completion should be visible in state and reporting, not just mean that the last button was pressed.",
      };
    case "APPROVAL":
      return {
        text: id
          ? `Dari ${roles}, siapa yang boleh approve, reject, atau override perubahan penting pada ${primaryEntity}, dan bukti apa yang harus disimpan?${followUp}`
          : `Among ${roles}, who may approve, reject, or override a consequential change to ${primaryEntity}, and what evidence must be retained?${followUp}`,
        recommendation: id
          ? "Approval boundary harus konsisten dengan permission dan audit trail."
          : "Approval boundaries must stay consistent with permissions and the audit trail.",
      };
    case "MONEY":
      return {
        text: id
          ? `Jika ${primaryEntity} terkait pembayaran atau deposit, siapa yang bertanggung jawab atas status uang, dan apa yang terjadi saat cancel, gagal, refund, atau dispute?${followUp}`
          : `If ${primaryEntity} involves payment or a deposit, who owns the money state, and what happens on cancellation, failure, refund, or dispute?${followUp}`,
        recommendation: id
          ? "Money state perlu dipisahkan dari status workflow supaya pembatalan dan rekonsiliasi tidak ambigu."
          : "Keep money state distinct from workflow state so cancellation and reconciliation stay unambiguous.",
      };
    case "RETENTION":
      return {
        text: id
          ? `Berapa lama ${primaryEntity} dan histori terkait harus tersedia, dan apa arti delete jika masih ada record atau dokumen yang terhubung?${followUp}`
          : `How long should ${primaryEntity} and its history remain available, and what does delete mean when linked records or documents still exist?${followUp}`,
        recommendation: id
          ? "Retention dan deletion harus diputuskan sebelum relasi data dan privacy behavior dikunci."
          : "Retention and deletion should be decided before data relationships and privacy behavior are locked.",
      };
    case "WORKFLOW_ANCHOR":
      return {
        text:
          entityFacts.length === 0
            ? id
              ? `Apa hasil utama yang ingin terjadi ketika seseorang menemukan produk yang mereka minati?${followUp}`
              : `What is the main outcome when someone finds something they want in this product?${followUp}`
            : id
              ? `Ketika seseorang tertarik pada ${primaryEntity}, hasil pertama apa yang harus terjadi supaya produk ini berhasil dipakai?${followUp}`
              : `When someone is interested in ${primaryEntity}, what first outcome should happen to prove the product was actually used?${followUp}`,
        recommendation: id
          ? "Outcome yang terlihat membantu membatasi scope dan acceptance criteria."
          : "An observable outcome keeps scope and acceptance criteria honest.",
      };
    case "RELATIONSHIPS":
      return {
        text: id
          ? `Dari ${entities}, record mana yang wajib tetap terhubung supaya histori dan konteksnya bisa dipahami bersama?${followUp}`
          : `Among ${entities}, which records must stay connected so their history and context can be understood together?${followUp}`,
        recommendation: id
          ? "Relasi yang diputuskan menjadi dasar ERD; relasi lain tetap unresolved."
          : "Decided relationships become the ERD basis; other relationships remain unresolved.",
      };
    case "ROLE_BOUNDARIES":
      return {
        text: id
          ? `Untuk ${roles}, apa yang boleh dilihat atau diubah oleh tiap role pada ${entities}?${followUp}`
          : `For ${roles}, what may each role see or change in ${entities}?${followUp}`,
        recommendation: id
          ? "Permission sebaiknya mengikuti tanggung jawab yang benar-benar disebut, bukan default semua akses."
          : "Permissions should follow stated responsibilities rather than defaulting to universal access.",
      };
    default:
      return {
        text: `${candidate.intent} ${entities}.${followUp}`,
        recommendation: candidate.description,
      };
  }
}

export function generateGenericDecisionCandidates(state: ProjectState) {
  const context = extractStructuralContext(state);
  const gaps = detectArtifactGapSignals(state, context);
  const candidates = buildGenericCandidates(context, gaps);
  return rankDecisionCandidates(state, candidates, context, gaps);
}

export function genericRequirementNodes(
  state: ProjectState,
): RequirementNode[] {
  return generateGenericDecisionCandidates(state).map((candidate) => ({
    id: candidate.topic,
    category: candidate.category,
    title: candidate.title,
    description: candidate.description,
    priority: candidate.priority,
    riskWeight: candidate.riskWeight,
    status: hasDecision(state, candidate.topic) ? "ANSWERED" : "UNRESOLVED",
    source: "SYSTEM",
    evidence: candidate.evidence.join("; "),
    dependencies: [],
    confidence:
      candidate.confidence === "EXPLICIT"
        ? 100
        : candidate.confidence === "STRONGLY_INFERRED"
          ? 72
          : candidate.confidence === "WEAKLY_INFERRED"
            ? 45
            : 0,
  }));
}

function genericOptions(
  state: ProjectState,
  candidate: DecisionCandidate,
): QuestionOption[] {
  const id = extractStructuralContext(state).language === "id";
  const clarify: QuestionOption = {
    id: "needs_clarification",
    label: id ? "Perlu diklarifikasi dulu" : "Needs clarification",
    description: id
      ? "Ada pengecualian yang harus didefinisikan lebih dulu."
      : "There are exceptions we should define first.",
  };
  const byArchetype: Record<string, QuestionOption[]> = {
    IDENTITY: [
      {
        id: "shared_identity",
        label: id ? "Satu record bersama" : "Shared identity",
        description: id
          ? "Identitas dan histori mengikuti orang atau benda yang sama."
          : "The same identity and history follow them everywhere.",
      },
      {
        id: "separate_records",
        label: id ? "Record terpisah" : "Separate records",
        description: id
          ? "Setiap konteks menjaga record-nya sendiri."
          : "Each context keeps its own record.",
      },
    ],
    VISIBILITY: [
      {
        id: "owner_all_others_scoped",
        label: id
          ? "Owner melihat semua, role lain terbatas"
          : "Owner sees all, others stay scoped",
        description: id
          ? "Akses penuh hanya untuk pemilik; role lain mengikuti tanggung jawabnya."
          : "Full access stays with the owner; other roles stay scoped.",
      },
      {
        id: "everyone_sees_all",
        label: id ? "Semua role melihat semua" : "Everyone sees everything",
        description: id
          ? "Kolaborasi lebih mudah, batas data lebih longgar."
          : "Easier collaboration, looser data boundaries.",
      },
    ],
    OWNERSHIP: [
      {
        id: "creator_owns",
        label: id ? "Pembuat menjadi pemilik" : "Creator owns it",
        description: id
          ? "Ownership dimulai dari yang membuat record."
          : "Ownership starts with whoever created the record.",
      },
      {
        id: "assigned_role_owns",
        label: id ? "Role yang ditugaskan" : "Assigned role owns it",
        description: id
          ? "Pemilik bisa berubah tanpa menghapus histori."
          : "Ownership can move without deleting history.",
      },
    ],
    WORKFLOW_ANCHOR: [
      {
        id: "contact_first",
        label: id ? "Menghubungi tim" : "Contact the team",
        description: id
          ? "Tindakan pertama adalah percakapan atau follow-up."
          : "The first action is a conversation or follow-up.",
      },
      {
        id: "booking_first",
        label: id ? "Membuat janji atau booking" : "Book or schedule",
        description: id
          ? "Keberhasilan diukur dari jadwal yang terisi."
          : "Success is a confirmed booking or appointment.",
      },
      {
        id: "order_first",
        label: id ? "Langsung memesan" : "Place an order",
        description: id
          ? "Tindakan utama adalah transaksi atau pemesanan."
          : "The main action is an order or purchase.",
      },
    ],
  };
  const options = byArchetype[candidate.archetype] || [
    {
      id: "explicit_rule",
      label: id ? "Tetapkan satu aturan tetap" : "Set one explicit rule",
      description: id
        ? "Satu kebijakan yang konsisten untuk semua kasus biasa."
        : "One consistent policy for the usual cases.",
    },
    {
      id: "case_by_case_with_rule",
      label: id ? "Ada pengecualian terukur" : "Allow defined exceptions",
      description: id
        ? "Aturan utama tetap ada, plus pengecualian yang tertulis."
        : "Keep a default rule plus written exceptions.",
    },
  ];
  return [...options, clarify];
}

export function genericQuestionForTopic(
  state: ProjectState,
  topic: string,
): Question | null {
  const candidate = generateGenericDecisionCandidates(state).find(
    (item) => item.topic === topic,
  );
  if (!candidate) return null;
  const copy = genericQuestionCopy(state, candidate);
  return {
    id: `generic-${slug(candidate.topic)}`,
    topic: candidate.topic,
    category: candidate.category,
    text: copy.text,
    contextReferences: ["rawIdea", "roles", "entities", "workflows"],
    relatedRequirementIds: [candidate.topic],
    affects: candidate.affects,
    answerType: "SINGLE_CHOICE",
    options: genericOptions(state, candidate),
    recommendation: copy.recommendation,
    priority: candidate.priority,
    reasonAsked: copy.recommendation,
  };
}
