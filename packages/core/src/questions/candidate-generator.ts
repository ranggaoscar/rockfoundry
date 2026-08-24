import type {
  ProjectState,
  Question,
  QuestionOption,
  RequirementNode,
} from "../schema";
import { buildGenericCandidates, type DecisionCandidate } from "./archetypes";
import { detectArtifactGapSignals } from "./artifact-gap-signals";
import {
  contextValues,
  displayContextLabel,
  extractStructuralContext,
  primaryContextNoun,
} from "./context-extractor";
import { rankDecisionCandidates } from "./candidate-ranker";
import { deriveProductShape, isCandidateEligible } from "./product-shape";

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
  const entities = displayContextLabel(
    entityFacts,
    id ? "data utama" : "the main records",
    2,
    id ? "id" : "en",
  );
  const roles = displayContextLabel(
    context.roles,
    id ? "orang yang terlibat" : "the roles involved",
    2,
    id ? "id" : "en",
  );
  const workflows = displayContextLabel(
    context.workflows,
    id ? "alur utama" : "the main workflow",
    2,
    id ? "id" : "en",
  );
  const primaryEntity = primaryContextNoun(entityFacts, id ? "data" : "record");
  const primaryWorkflow =
    contextValues(context.workflows, 1).filter(
      (value) =>
        !/[_:]|outcome|transition rule|boundary|semantics/i.test(value),
    )[0] ||
    (id
      ? `alur pertama untuk ${primaryEntity}`
      : `the first workflow involving ${primaryEntity}`);
  const boundaries = displayContextLabel(
    context.boundaries,
    id ? "batas organisasi" : "organizational boundaries",
  );
  const followUp = hasAmbiguousAnswer(state, candidate.topic)
    ? id
      ? " Kalau jawabannya tergantung kasus, aturan apa yang menentukan pilihan itu? Beri satu contoh konkret."
      : " If it depends on the case, what rule determines the choice? Give one concrete example."
    : "";

  switch (candidate.archetype) {
    case "PRODUCT_IDENTITY":
      return {
        text: id
          ? "Aplikasi ini hanya membantu pencari kerja menemukan lowongan, atau perusahaan juga bisa membuat akun dan memasang lowongan?"
          : "Does this product only help job seekers discover openings, or can employers also create accounts and post jobs?",
        recommendation: id
          ? "Ini menentukan siapa yang memakai aplikasi dan data apa yang perlu disimpan dari awal."
          : "This actor boundary determines the core workflow, data model, and permissions from the start.",
      };
    case "IDENTITY":
      return {
        text: id
          ? `Kamu menyebut ${entities}. Kalau data yang sama muncul dari sisi berbeda, apakah tetap satu data dengan riwayat bersama, atau dipisah?${followUp}`
          : `You mentioned ${entities}. If the same real-world thing appears through different contexts or roles, should it remain one record with shared history or become separate records?${followUp}`,
        recommendation: id
          ? "Supaya data orang atau barang yang sama tidak tercatat dobel."
          : "Set the identity boundary before history, duplicate handling, and data relationships are built.",
      };
    case "OWNERSHIP":
      return {
        text: id
          ? `Setelah ${primaryEntity} dibuat, siapa yang bertanggung jawab menanganinya? Jika tanggung jawab berpindah ke orang lain, apakah riwayatnya perlu tetap disimpan?${followUp}`
          : `For ${entities} in ${workflows}, who owns the record after creation, and what happens when responsibility changes?${followUp}`,
        recommendation: id
          ? "Supaya setiap data selalu punya penanggung jawab yang jelas dan riwayatnya tetap tercatat."
          : "Explicit ownership prevents orphaned work and preserves reassignment history.",
      };
    case "VISIBILITY":
      return {
        text: id
          ? `Kalau ${primaryEntity} ditangani beberapa orang, siapa yang boleh melihat seluruh riwayatnya? Siapa yang hanya boleh melihat bagian tugasnya?${followUp}`
          : `You mentioned ${roles} and ${entities}. If more than one role handles the same record, who can see the full history and who is limited to the part assigned to them?${followUp}`,
        recommendation: id
          ? "Supaya data penting tidak terlihat oleh orang yang tidak berwenang."
          : "Visibility should follow data risk and responsibility instead of defaulting to every role seeing everything.",
      };
    case "LIFECYCLE":
      return {
        text: id
          ? `Untuk ${primaryEntity}, status apa saja yang perlu ada dari dibuat sampai selesai atau dibatalkan? Kapan dianggap benar-benar selesai?${followUp}`
          : `For ${primaryEntity}, which states should it move through from creation to completion or cancellation, and what event makes it truly complete?${followUp}`,
        recommendation: id
          ? "Supaya semua orang memakai status yang sama dan tidak bingung."
          : "Clear states and transitions keep workflows, notifications, and acceptance criteria consistent.",
      };
    case "CONFLICT_CAPACITY":
      return {
        text: id
          ? `Untuk ${primaryEntity}, kalau dua permintaan bentrok pada waktu atau fasilitas yang sama, apa yang harus dilakukan sistem: menolak salah satunya, membuat antrean, atau tetap mengizinkan setelah ada persetujuan?${followUp}`
          : `Because ${entities} involve time or constrained resources, when two requests target the same slot or resource, should the system reject, queue, or allow an approved override?${followUp}`,
        recommendation: id
          ? "Supaya janji ke pelanggan tidak tabrakan."
          : "Conflict behavior should be decided before availability and notifications make promises to users.",
      };
    case "ASSIGNMENT":
      return {
        text: id
          ? `Siapa yang bertanggung jawab menangani ${primaryEntity}? Kalau perlu, apakah tanggung jawabnya boleh dialihkan ke orang lain tanpa menghapus riwayatnya?${followUp}`
          : `When ${entities} need to be handled by ${roles}, how is assignment decided, and can a record move to another role without losing history?${followUp}`,
        recommendation: id
          ? "Supaya selalu jelas siapa yang sedang mengerjakan dan siapa yang pernah mengerjakannya."
          : "Assignment should distinguish current ownership from the history of who handled the record.",
      };
    case "CROSS_BOUNDARY":
      return {
        text: id
          ? `Kalau ${entities} pindah ke ${boundaries} lain, apakah aturan akses dan riwayatnya ikut pindah, atau tetap mengikuti tempat asal?${followUp}`
          : `If ${entities} move across ${boundaries}, do ownership, visibility, history, and workflow rules move with them or stay with the originating boundary?${followUp}`,
        recommendation: id
          ? "Supaya akses dan riwayat tidak berubah diam-diam saat data pindah."
          : "Cross-boundary movement needs an explicit rule so access and history do not change silently.",
      };
    case "DUPLICATE":
      return {
        text: id
          ? `Kalau ${primaryEntity} yang sama muncul dari tempat berbeda, apa yang harus terjadi: digabung, ditandai dulu, atau tetap terpisah?${followUp}`
          : `If the same ${primaryEntity} appears from different contexts or channels, what counts as a duplicate: merge, link, flag for review, or keep separate?${followUp}`,
        recommendation: id
          ? "Supaya data yang sama tidak digabung diam-diam."
          : "Do not silently merge data; define the duplicate signal and who makes the final decision.",
      };
    case "HISTORY":
      return {
        text: id
          ? `Perubahan apa saja yang perlu tetap tercatat dalam riwayat ${primaryEntity}? Siapa yang boleh melihat riwayat tersebut?${followUp}`
          : `For ${primaryEntity} history, which changes must remain visible, who may inspect them, and does history follow the record or its current owner?${followUp}`,
        recommendation: id
          ? "Supaya perubahan penting bisa dicek kembali kalau ada kesalahan."
          : "History policy affects auditability, corrections, privacy, and trust in the data.",
      };
    case "COMPLETION":
      return {
        text: id
          ? `Kapan ${primaryEntity} dianggap selesai? Kalau sudah selesai, apakah boleh dibuka lagi?${followUp}`
          : `For ${primaryWorkflow}, what evidence makes the workflow complete, and can a completed record be reopened?${followUp}`,
        recommendation: id
          ? "Supaya sistem tahu dengan jelas kapan sebuah proses benar-benar selesai."
          : "Completion should be visible in state and reporting, not just mean that the last button was pressed.",
      };
    case "APPROVAL":
      return {
        text: id
          ? `Siapa yang boleh menyetujui atau menolak perubahan penting pada ${primaryEntity}? Kalau ada pengecualian, siapa yang boleh memberikan izin?${followUp}`
          : `Among ${roles}, who may approve, reject, or override a consequential change to ${primaryEntity}, and what evidence must be retained?${followUp}`,
        recommendation: id
          ? "Supaya perubahan penting hanya dilakukan oleh orang yang berwenang dan tetap tercatat."
          : "Approval boundaries must stay consistent with permissions and the audit trail.",
      };
    case "MONEY":
      return {
        text: id
          ? `Kalau ${primaryEntity} melibatkan pembayaran, siapa yang bertanggung jawab atas status pembayarannya? Apa yang terjadi kalau dibatalkan, gagal, dikembalikan, atau ada sengketa?${followUp}`
          : `If ${primaryEntity} involves payment or a deposit, who owns the money state, and what happens on cancellation, failure, refund, or dispute?${followUp}`,
        recommendation: id
          ? "Supaya status pembayaran tidak tercampur dengan status pekerjaan."
          : "Keep money state distinct from workflow state so cancellation and reconciliation stay unambiguous.",
      };
    case "RETENTION":
      return {
        text: id
          ? `Berapa lama ${primaryEntity} perlu disimpan? Kalau data dihapus tetapi masih terhubung dengan dokumen lain, apa yang harus terjadi?${followUp}`
          : `How long should ${primaryEntity} and its history remain available, and what does delete mean when linked records or documents still exist?${followUp}`,
        recommendation: id
          ? "Supaya data lama tidak menumpuk, tapi data penting tidak hilang sembarangan."
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
              ? `Kalau seseorang tertarik pada ${primaryEntity}, hasil pertama apa yang harus terjadi supaya produk ini terasa berguna?${followUp}`
              : `When someone is interested in ${primaryEntity}, what first outcome should happen to prove the product was actually used?${followUp}`,
        recommendation: id
          ? "Supaya jelas hasil pertama yang menandakan produk ini benar-benar dipakai."
          : "An observable outcome keeps scope and acceptance criteria honest.",
      };
    case "RELATIONSHIPS":
      return {
        text: id
          ? `Dari ${entities}, data mana yang wajib tetap terhubung supaya riwayatnya bisa dipahami bersama?${followUp}`
          : `Among ${entities}, which records must stay connected so their history and context can be understood together?${followUp}`,
        recommendation: id
          ? "Supaya data yang saling berkaitan tidak tercerai dan sulit dilacak."
          : "Decided relationships become the ERD basis; other relationships remain unresolved.",
      };
    case "ROLE_BOUNDARIES":
      return {
        text: id
          ? `Untuk ${roles}, apa yang boleh dilihat atau diubah oleh masing-masing orang pada ${entities}?${followUp}`
          : `For ${roles}, what may each role see or change in ${entities}?${followUp}`,
        recommendation: id
          ? "Supaya setiap orang hanya mengurus bagian yang memang jadi tanggung jawabnya."
          : "Permissions should follow stated responsibilities rather than defaulting to universal access.",
      };
    default:
      return {
        text: id
          ? `Ada keputusan yang perlu dipastikan soal ${entities}.${followUp}`
          : `${candidate.intent} ${entities}.${followUp}`,
        recommendation: id
          ? "Supaya aturan penting tidak ditebak sendiri."
          : candidate.description,
      };
  }
}

export function generateGenericDecisionCandidates(state: ProjectState) {
  const context = extractStructuralContext(state);
  const gaps = detectArtifactGapSignals(state, context);
  const candidates = buildGenericCandidates(context, gaps).filter((candidate) =>
    isCandidateEligible(candidate.topic, deriveProductShape(state)),
  );
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
      ? "Ada kondisi khusus yang perlu dibahas dulu."
      : "There are exceptions we should define first.",
  };
  const byArchetype: Record<string, QuestionOption[]> = {
    PRODUCT_IDENTITY: [
      {
        id: "job_seeker_only",
        label: id ? "Pencari kerja saja" : "Job seekers only",
        description: id
          ? "Aplikasi membantu orang menemukan, menyimpan, dan melacak lowongan."
          : "The product helps people discover, save, and track job openings.",
      },
      {
        id: "two_sided_marketplace",
        label: id ? "Pencari kerja + perusahaan" : "Job seekers + employers",
        description: id
          ? "Perusahaan dapat memasang lowongan dan mengelola kandidat."
          : "Employers can post openings and manage candidates.",
      },
      {
        id: "not_sure",
        label: id ? "Belum ditentukan" : "Not decided yet",
        description: id
          ? "Bandingkan dua model produk sebelum dikunci."
          : "Compare both product models before locking scope.",
      },
    ],
    IDENTITY: [
      {
        id: "shared_identity",
        label: id ? "Satu data bersama" : "Shared identity",
        description: id
          ? "Identitas dan riwayat mengikuti orang atau barang yang sama."
          : "The same identity and history follow them everywhere.",
      },
      {
        id: "separate_records",
        label: id ? "Data terpisah" : "Separate records",
        description: id
          ? "Setiap sisi menjaga datanya sendiri."
          : "Each context keeps its own record.",
      },
    ],
    VISIBILITY: [
      {
        id: "owner_all_others_scoped",
        label: id
          ? "Pemilik melihat semua, orang lain terbatas"
          : "Owner sees all, others stay scoped",
        description: id
          ? "Akses penuh hanya untuk pemilik; orang lain mengikuti tugasnya."
          : "Full access stays with the owner; other roles stay scoped.",
      },
      {
        id: "everyone_sees_all",
        label: id ? "Semua orang melihat semua" : "Everyone sees everything",
        description: id
          ? "Kolaborasi lebih mudah, batas data lebih longgar."
          : "Easier collaboration, looser data boundaries.",
      },
    ],
    OWNERSHIP: [
      {
        id: "creator_owns",
        label: id ? "Pembuat menjadi penanggung jawab" : "Creator owns it",
        description: id
          ? "Penanggung jawab dimulai dari yang membuat data."
          : "Ownership starts with whoever created the record.",
      },
      {
        id: "assigned_role_owns",
        label: id ? "Penanggung jawab bisa dialihkan" : "Assigned role owns it",
        description: id
          ? "Tanggung jawab bisa pindah tanpa menghapus riwayat."
          : "Ownership can move without deleting history.",
      },
    ],
    ROLE_BOUNDARIES: [
      {
        id: "role_scoped_access",
        label: id
          ? "Tiap orang melihat bagian tugasnya"
          : "Each role sees its own scope",
        description: id
          ? "Akses mengikuti tanggung jawab nyata tiap orang."
          : "Access follows each role's real responsibility.",
      },
      {
        id: "shared_full_access",
        label: id ? "Semua orang melihat semua" : "All roles see everything",
        description: id
          ? "Kolaborasi mudah, batas data lebih longgar."
          : "Easy collaboration, looser data boundaries.",
      },
    ],
    LIFECYCLE: [
      {
        id: "simple_lifecycle",
        label: id
          ? "Sederhana: dibuat lalu selesai"
          : "Simple: created then done",
        description: id
          ? "Cukup dua status utama tanpa tahap antara."
          : "Two main states without intermediate steps.",
      },
      {
        id: "rich_lifecycle",
        label: id
          ? "Ada tahap menunggu, dibatalkan, dan ditunda"
          : "Includes pending, cancelled, deferred",
        description: id
          ? "Proses nyata sering butuh status antara ini."
          : "Real processes usually need these intermediate states.",
      },
    ],
    CONFLICT_CAPACITY: [
      {
        id: "reject_conflict",
        label: id ? "Tolak permintaan bentrok" : "Reject conflicting requests",
        description: id
          ? "Waktu atau tempat yang sama hanya boleh dipakai satu permintaan."
          : "A slot or resource serves only one request.",
      },
      {
        id: "queue_with_approval",
        label: id
          ? "Antrikan atau izinkan setelah ada persetujuan"
          : "Queue or override with approval",
        description: id
          ? "Bentrok tidak hilang, tapi bisa lewat jalur persetujuan."
          : "Conflicts route through an explicit approval path.",
      },
    ],
    ASSIGNMENT: [
      {
        id: "creator_handles",
        label: id
          ? "Pembuat data menangani sendiri"
          : "Creator handles it directly",
        description: id
          ? "Tanggung jawab jelas sejak data dibuat."
          : "Responsibility is clear from creation.",
      },
      {
        id: "reassignable_with_history",
        label: id
          ? "Bisa dipindah dengan riwayat"
          : "Reassignable with history",
        description: id
          ? "Perpindahan tanggung jawab tetap tercatat."
          : "Ownership changes stay fully recorded.",
      },
    ],
    CROSS_BOUNDARY: [
      {
        id: "rules_follow_record",
        label: id
          ? "Aturan ikut data saat pindah"
          : "Rules move with the record",
        description: id
          ? "Akses dan riwayat tetap sama di tempat baru."
          : "Access and history stay consistent across units.",
      },
      {
        id: "origin_keeps_rules",
        label: id
          ? "Tempat asal tetap pegang aturannya"
          : "Origin keeps ownership rules",
        description: id
          ? "Data di tempat baru mengikuti aturan tempat itu."
          : "The new location applies its own rules.",
      },
    ],
    DUPLICATE: [
      {
        id: "merge_with_review",
        label: id ? "Gabungkan setelah diperiksa" : "Merge with a review step",
        description: id
          ? "Data ganda disatukan setelah diperiksa."
          : "Duplicates combine after human review.",
      },
      {
        id: "flag_for_review",
        label: id
          ? "Tandai dulu, jangan digabung otomatis"
          : "Flag first, never auto-merge",
        description: id
          ? "Penggabungan hanya lewat keputusan manusia."
          : "Merging only happens by explicit decision.",
      },
    ],
    HISTORY: [
      {
        id: "full_change_history",
        label: id ? "Semua perubahan tercatat" : "Every change is recorded",
        description: id
          ? "Catatan lengkap untuk koreksi dan kepercayaan data."
          : "Full audit trail for corrections and trust.",
      },
      {
        id: "key_changes_only",
        label: id ? "Hanya perubahan penting" : "Only key changes",
        description: id
          ? "Riwayat ringkas, fokus pada perubahan yang penting."
          : "Compact history focused on material changes.",
      },
    ],
    COMPLETION: [
      {
        id: "explicit_completion_evidence",
        label: id
          ? "Harus ada tanda jelas bahwa proses selesai"
          : "Requires explicit completion evidence",
        description: id
          ? "Status selesai hanya lewat konfirmasi nyata."
          : "Completion requires an explicit confirmation.",
      },
      {
        id: "auto_complete_last_step",
        label: id
          ? "Selesai otomatis di langkah terakhir"
          : "Auto-completes on the last step",
        description: id
          ? "Lebih cepat, tapi risiko salah tandai selesai."
          : "Faster, but risks premature completion.",
      },
    ],
    APPROVAL: [
      {
        id: "dedicated_approver",
        label: id
          ? "Orang khusus yang menyetujui"
          : "A dedicated approver role",
        description: id
          ? "Persetujuan terpisah dari orang yang membuat data."
          : "Approval stays separate from creation.",
      },
      {
        id: "creator_self_approves",
        label: id
          ? "Pembuat boleh menyetujui sendiri"
          : "Creator may self-approve",
        description: id
          ? "Lebih cepat untuk tim kecil, kontrol lebih longgar."
          : "Faster for small teams, weaker control.",
      },
    ],
    MONEY: [
      {
        id: "separate_money_state",
        label: id
          ? "Status uang terpisah dari status proses"
          : "Money state separate from workflow state",
        description: id
          ? "Pengembalian uang dan gagal bayar tidak merusak status pekerjaan."
          : "Refunds and failures never corrupt workflow state.",
      },
      {
        id: "money_follows_workflow",
        label: id
          ? "Status uang mengikuti proses utama"
          : "Money follows the main process",
        description: id
          ? "Sederhana, tapi pembatalan jadi ambigu."
          : "Simpler, but cancellation becomes ambiguous.",
      },
    ],
    RETENTION: [
      {
        id: "manual_deletion",
        label: id
          ? "Disimpan sampai dihapus manual"
          : "Kept until manually deleted",
        description: id
          ? "Kontrol penuh di tangan pengguna."
          : "Users keep full control of retention.",
      },
      {
        id: "archival_policy",
        label: id
          ? "Diarsipkan otomatis setelah periode"
          : "Auto-archived after a period",
        description: id
          ? "Data lama tidak menumpuk tanpa aturan."
          : "Old data does not accumulate indefinitely.",
      },
    ],
    RELATIONSHIPS: [
      {
        id: "required_core_links",
        label: id
          ? "Data utama wajib saling terhubung"
          : "Core records must stay linked",
        description: id
          ? "Histori dan konteks selalu bisa dilacak bersama."
          : "History and context stay traceable together.",
      },
      {
        id: "loose_optional_links",
        label: id
          ? "Relasi longgar dan opsional"
          : "Loose optional relationships",
        description: id
          ? "Fleksibel, risiko konteks terpisah lebih tinggi."
          : "Flexible, higher risk of orphaned context.",
      },
    ],
    WORKFLOW_ANCHOR: [
      {
        id: "contact_first",
        label: id ? "Menghubungi tim" : "Contact the team",
        description: id
          ? "Tindakan pertama adalah percakapan atau tindak lanjut."
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

export function recommendationForQuestion(input: Question): Pick<
  Question,
  "recommendedOptionId" | "recommendationReason"
> {
  const optionByTopic: Record<string, string> = {
    customer_identity: "company_wide",
    sales_visibility: "owner_all_sales_brand_scoped",
    lead_ownership: "owning_brand_sales",
    quotation_branding: "quotation_uses_owning_brand",
    duplicate_handling: "merge_with_review",
    slab_identity: "individual_slab",
    warehouse_transfer: "destination_confirmed",
    movement_history: "full_history",
    reservation: "reservation_supported",
    ownership_boundary: "assigned_role_owns",
    assignment_behavior: "reassignable_with_history",
    visibility_boundary: "owner_all_others_scoped",
    lifecycle_transitions: "rich_lifecycle",
    duplicate_semantics: "flag_for_review",
    history_auditability: "full_change_history",
  };
  const candidate = input.recommendation ? optionByTopic[input.topic || ""] : undefined;
  const recommendedOptionId = input.options?.some(
    (option) => option.id === candidate && option.id !== "needs_clarification",
  )
    ? candidate
    : undefined;
  return {
    recommendedOptionId,
    recommendationReason: recommendedOptionId ? input.recommendation : undefined,
  };
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
  const options = genericOptions(state, candidate);
  const base: Question = {
    id: `generic-${slug(candidate.topic)}`,
    topic: candidate.topic,
    category: candidate.category,
    text: copy.text,
    contextReferences: ["rawIdea", "roles", "entities", "workflows"],
    relatedRequirementIds: [candidate.topic],
    affects: candidate.affects,
    answerType: "SINGLE_CHOICE",
    options,
    recommendation: copy.recommendation,
    priority: candidate.priority,
    reasonAsked: copy.recommendation,
  };
  return { ...base, ...recommendationForQuestion(base) };
}
