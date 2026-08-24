import {
  ProjectState,
  ProjectStateSchema,
  Question,
  RequirementNode,
} from "../schema";
import { recordDecision } from "../decision-graph";
import {
  CRM_DECISION_META,
  describeDecisionImpact,
  type CrmDecisionTopic,
} from "./crm-catalog";
import { detectDiscoveryDomain, evaluateDiscovery } from "./requirements";
import { validateQuestionQuality } from "./quality";
import {
  genericQuestionForTopic,
  recommendationForQuestion,
} from "./candidate-generator";
import { isIndonesianText } from "./language";

function isIndonesian(state: ProjectState) {
  return isIndonesianText(`${state.rawIdea} ${state.name || ""}`);
}

function hasDecision(state: ProjectState, topic: string) {
  return state.decisions.some(
    (decision) =>
      decision.topic === topic &&
      ["ACCEPTED", "PROPOSED"].includes(decision.status),
  );
}

function question(input: Question): Question {
  return { ...input, ...recommendationForQuestion(input) };
}

function foundationQuestion(state: ProjectState): Question | null {
  const genericProductOnly = /^(?:saya punya ide untuk )?(?:bikin|buat|membuat|build|create)?\s*(?:aplikasi|application|app|platform|website|web app|mobile app|system|sistem|software|social media platform)(?:\s+(?:platform|social media))*\s*(?:untuk|for)?\s*(?:anak kantor|office workers|teams?)?(?:,?\s*(?:menurut mu gimana|what do you think))?[,?.!\s]*$/i.test(
    state.rawIdea.trim(),
  );
  const needsFoundation =
    genericProductOnly &&
    state.targetUsers.length === 0 &&
    state.roles.length === 0 &&
    state.entities.length === 0 &&
    state.workflows.length === 0;
  if (!needsFoundation) return null;
  const indo = isIndonesian(state);
  const hasPrimaryUser = state.targetUsers.length > 0 || state.roles.length > 0;
  const hasWorkObject = state.entities.length > 0;
  const hasOutcome = state.objectives.length > 0 || state.workflows.length > 0;
  if (!hasPrimaryUser) {
    return question({
      id: "foundation-primary-user",
      topic: "foundation_primary_user",
      category: "PRODUCT",
      text: indo
        ? "Siapa yang paling utama akan memakai aplikasi ini setiap hari?"
        : "Who is the primary person expected to use this product every day?",
      contextReferences: ["rawIdea"],
      relatedRequirementIds: ["foundation_primary_user"],
      affects: ["actors", "product scope", "workflow"],
      answerType: "FREE_TEXT",
      priority: 10,
      reasonAsked: indo
        ? "Kita perlu tahu pengguna utama sebelum membahas aturan kerja yang lebih detail."
        : "We need the primary user before discussing deeper operating rules.",
    });
  }
  if (!hasWorkObject) {
    return question({
      id: "foundation-primary-object",
      topic: "foundation_primary_object",
      category: "DATA",
      text: indo
        ? "Hal utama apa yang dibuat, dibagikan, atau dikelola pengguna di aplikasi ini?"
        : "What is the main thing users create, share, or manage in this product?",
      contextReferences: ["rawIdea", "targetUsers"],
      relatedRequirementIds: ["foundation_primary_object"],
      affects: ["data", "workflow", "screens"],
      answerType: "FREE_TEXT",
      priority: 10,
      reasonAsked: indo
        ? "Objek utama perlu jelas agar pertanyaan berikutnya tidak menebak-nebak."
        : "The main object must be clear so later questions do not guess.",
    });
  }
  if (!hasOutcome) {
    return question({
      id: "foundation-primary-outcome",
      topic: "foundation_primary_outcome",
      category: "WORKFLOW",
      text: indo
        ? "Hasil apa yang paling penting ingin dicapai pengguna lewat aplikasi ini?"
        : "What is the most important outcome users should achieve with this product?",
      contextReferences: ["rawIdea", "entities", "targetUsers"],
      relatedRequirementIds: ["foundation_primary_outcome"],
      affects: ["workflow", "scope", "screens"],
      answerType: "FREE_TEXT",
      priority: 10,
      reasonAsked: indo
        ? "Hasil utama membantu menyusun alur inti sebelum aturan detail."
        : "The primary outcome anchors the core workflow before detailed rules.",
    });
  }
  return null;
}

function affectedFor(topic: string) {
  const crmMeta = CRM_DECISION_META[topic as CrmDecisionTopic];
  if (crmMeta) return [...crmMeta.affects];
  const affects: Record<string, string[]> = {
    customer_identity: [
      "customer model",
      "cross-unit search",
      "duplicate detection",
      "permissions",
    ],
    sales_visibility: ["sales permissions", "owner visibility", "search scope"],
    lead_ownership: [
      "lead ownership",
      "follow-up workflow",
      "sales permissions",
    ],
    quotation_branding: [
      "quotation ownership",
      "brand reporting",
      "customer history",
    ],
    duplicate_handling: [
      "duplicate detection",
      "customer model",
      "channel intake",
    ],
    vehicle_location: [
      "vehicle availability",
      "branch inventory",
      "booking rules",
    ],
    cross_branch_booking: [
      "booking workflow",
      "pickup and return",
      "branch permissions",
    ],
    vehicle_transfer: ["vehicle location", "availability", "movement history"],
    pickup_return: ["rental workflow", "vehicle status", "damage handling"],
    slab_identity: ["slab model", "movement history", "reservation"],
    warehouse_transfer: [
      "warehouse permissions",
      "movement history",
      "stock availability",
    ],
    movement_history: [
      "audit trail",
      "inventory corrections",
      "stock reporting",
    ],
    reservation: ["reservation workflow", "quotation", "stock availability"],
    measurement_semantics: ["quantity model", "stock reporting", "reservation"],
    primary_workflow: ["primary workflow", "scope", "acceptance criteria"],
    record_relationships: ["data model", "history", "reporting"],
    role_boundaries: ["permissions", "navigation", "data visibility"],
  };
  return affects[topic] || [topic];
}

function canonicalDecision(topic: string, answer: string, optionId?: string) {
  const value = `${optionId || ""} ${answer}`.toLowerCase();
  if (
    /not[_ -]?sure|belum yakin|belum tahu|not decided|undecided|tergantung|case by case|depends|maybe|mungkin|masih dibahas|tbd/.test(
      value,
    )
  )
    return "undecided";

  if (topic === "customer_identity") {
    if (
      /company[_ -]?wide|one customer|single customer|satu customer|satu pelanggan|lintas|shared|across/.test(
        value,
      )
    )
      return "company_wide";
    if (
      /separate|per[_ -]?brand|terpisah|masing-masing|masing masing|per[_ -]?branch|per cabang/.test(
        value,
      )
    )
      return "unit_specific";
  }
  if (topic === "sales_visibility") {
    if (
      /all_sales_all_brands|all sales see all|semua sales.*semua|sales.*all brands/.test(
        value,
      )
    )
      return "all_sales_all_brands";
    if (
      /owner[_ -]?all|owner.*all|owner.*semua|lintas|company[_ -]?wide|brand-scoped sales/.test(
        value,
      )
    )
      return "owner_all_sales_brand_scoped";
    if (/brand[_ -]?only|own brand|brand sendiri|brand masing/.test(value))
      return "brand_scoped";
  }
  if (topic === "lead_ownership") {
    if (
      /first|initial|brand[_ -]?first|brand yang pertama|brand pertama/.test(
        value,
      )
    )
      return "owning_brand_sales";
    if (/round|shared|dibagi|bersama|pool/.test(value))
      return "shared_sales_pool";
  }
  if (topic === "quotation_branding") {
    if (
      /owning_brand|lead-owning|brand.*lead|brand asal|originating|quotation_uses_owning_brand/.test(
        value,
      )
    )
      return "quotation_uses_owning_brand";
    if (/customer[_ -]?choice|customer chooses|customer memilih/.test(value))
      return "customer_chooses_brand";
  }
  if (topic === "duplicate_handling") {
    if (
      /merge_with_review|merge|one|gabung|satu customer|same customer|unify/.test(
        value,
      )
    )
      return "merge_with_review";
    if (
      /keep_separate|never_merge|separate|terpisah|keep.*lead|pisah|ignore/.test(
        value,
      )
    )
      return "keep_separate_until_review";
  }
  if (topic === "cross_branch_booking") {
    if (/yes|boleh|bisa|allow|one[- ]way|different|beda/.test(value))
      return "cross_branch_allowed";
    if (/no|tidak|nggak|hanya|same branch/.test(value))
      return "same_branch_only";
  }
  if (topic === "slab_identity") {
    if (/individual|each slab|per slab|satu per|masing/.test(value))
      return "individual_slab";
    if (/aggregate|quantity|total|jumlah/.test(value))
      return "aggregate_quantity";
  }
  if (topic === "reservation") {
    if (/yes|boleh|bisa|reserve|reservasi|quotation/.test(value))
      return "reservation_supported";
    if (/no|tidak|nggak|only after/.test(value)) return "no_pre_reservation";
  }
  return answer.trim() || "user_defined";
}

function applyFoundationFact(state: ProjectState, topic: string, answer: string) {
  const value = answer.trim();
  if (!value) return;
  if (topic === "foundation_primary_user" && !state.targetUsers.includes(value))
    state.targetUsers.push(value);
  if (topic === "foundation_primary_object" && !state.entities.includes(value))
    state.entities.push(value);
  if (topic === "foundation_primary_outcome") {
    if (!state.objectives.includes(value)) state.objectives.push(value);
    if (!state.workflows.includes(value)) state.workflows.push(value);
  }
}

function applyCanonicalRule(
  state: ProjectState,
  topic: string,
  decision: string,
) {
  const rules: Record<string, string> = {
    company_wide: "Customer is one shared identity across brands or branches.",
    unit_specific: "Customer identity is separate per brand or branch.",
    owner_all_sales_brand_scoped:
      "Sales visibility is limited by brand while the owner can see all brands.",
    brand_scoped: "Sales visibility is limited to the salesperson's own brand.",
    owning_brand_sales:
      "A lead is owned by the sales team of the brand it first reaches.",
    shared_sales_pool: "Leads are handled by a shared sales pool.",
    quotation_uses_owning_brand:
      "A quotation keeps the brand that owns the lead.",
    merge_with_review: "Potential duplicates are merged with a review step.",
    keep_separate_until_review:
      "Potential duplicates stay separate until a review step.",
    cross_branch_allowed: "Bookings can cross branch boundaries.",
    same_branch_only: "Bookings stay within the selected branch.",
    individual_slab: "Each slab has its own identity and movement history.",
    aggregate_quantity: "Inventory is tracked as aggregate quantity.",
    reservation_supported:
      "Inventory can be reserved before it leaves the warehouse.",
    no_pre_reservation:
      "Inventory is not reserved before the operational handoff.",
  };
  const genericLabels: Record<string, string> = {
    identity_boundary: "Identity boundary",
    ownership_boundary: "Ownership boundary",
    visibility_boundary: "Visibility boundary",
    lifecycle_transitions: "Lifecycle transition rule",
    resource_conflict_policy: "Resource conflict policy",
    assignment_behavior: "Assignment rule",
    cross_boundary_behavior: "Cross-boundary behavior",
    duplicate_semantics: "Duplicate semantics",
    history_auditability: "History and auditability rule",
    completion_semantics: "Completion semantics",
    approval_responsibility: "Approval responsibility",
    money_responsibility: "Money responsibility",
    retention_deletion: "Retention and deletion rule",
    primary_workflow: "Primary workflow outcome",
    record_relationships: "Record relationship decision",
    role_boundaries: "Role boundary",
  };
  const genericDecisionRules: Record<string, string> = {
    order_first: "The primary user outcome is placing an order.",
    booking_first: "The primary user outcome is booking or scheduling.",
    contact_first: "The primary user outcome is contacting the team.",
    simple_lifecycle:
      "Records move through a simple created-to-done lifecycle.",
    rich_lifecycle:
      "Records move through pending, active, completed, cancelled, or deferred states.",
    creator_owns: "The creator becomes the operational owner of the record.",
    assigned_role_owns:
      "An assigned role owns the record and ownership can move with history.",
    creator_handles: "The creator handles the work directly after creation.",
    reassignable_with_history:
      "Work can be reassigned while preserving full history.",
    shared_identity: "The same real-world thing stays one shared record.",
    separate_records: "Separate contexts keep separate records.",
    owner_all_others_scoped:
      "Owners see everything while other roles stay scoped.",
    everyone_sees_all: "Every involved role can see the full record history.",
    role_scoped_access: "Each role only sees the part assigned to them.",
    shared_full_access: "All involved roles can see and change the same scope.",
    reject_conflict: "Conflicting resource requests are rejected.",
    queue_with_approval:
      "Conflicting resource requests can queue or override with approval.",
    rules_follow_record:
      "Rules and history follow the record across boundaries.",
    origin_keeps_rules: "The originating boundary keeps ownership rules.",
    merge_with_review: "Likely duplicates are merged after review.",
    flag_for_review: "Likely duplicates are flagged and never auto-merged.",
    full_change_history: "Every material change remains visible in history.",
    key_changes_only: "Only key changes remain visible in history.",
    explicit_completion: "Completion requires an explicit done state or proof.",
    reopenable_completion:
      "Completed records can be reopened under a clear rule.",
    needs_clarification: "The decision still needs a clearer rule.",
  };
  const humanizeDecision = (value: string) =>
    value.replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
  const rule =
    rules[decision] ||
    genericDecisionRules[decision] ||
    (genericLabels[topic]
      ? `${genericLabels[topic]}: ${humanizeDecision(decision)}`
      : undefined);
  if (!rule) return;
  if (!state.businessRules.includes(rule)) state.businessRules.push(rule);
  if (
    ["visibility_boundary", "role_boundaries"].includes(topic) &&
    !state.permissions.includes(rule)
  ) {
    state.permissions.push(rule);
  }
  if (
    [
      "ownership_boundary",
      "assignment_behavior",
      "lifecycle_transitions",
      "primary_workflow",
    ].includes(topic) &&
    !state.workflows.includes(rule)
  ) {
    state.workflows.push(rule);
  }
  if (topic === "sales_visibility" && decision.includes("owner_all")) {
    const permission =
      "Salespeople see their brand; the owner sees all brands.";
    if (!state.permissions.includes(permission))
      state.permissions.push(permission);
  }
  if (topic === "lead_ownership" && decision === "owning_brand_sales") {
    const workflow =
      "Lead assignment follows the brand that first receives the lead.";
    if (!state.workflows.includes(workflow)) state.workflows.push(workflow);
  }
}

function topicQuestion(state: ProjectState, topic: string): Question | null {
  const indo = isIndonesian(state);
  const domain = detectDiscoveryDomain(state);
  const contextReferences = ["rawIdea", "entities", "workflows"];

  if (domain === "CRM" && topic === "customer_identity") {
    return question({
      id: "crm-customer-identity",
      topic,
      category: "DATA",
      text: indo
        ? `Karena sales per brand sementara owner perlu melihat semuanya, kalau customer yang sama masuk lewat dua brand, apakah identitasnya satu customer lintas brand atau terpisah per brand?`
        : `You described sales teams per brand and an owner who sees everything. If the same Customer contacts two brands, should the CRM keep one Customer identity across brands or separate records per brand?`,
      contextReferences,
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "company_wide",
          label: indo
            ? "Satu customer lintas brand"
            : "One customer across brands",
          description: indo
            ? "Histori customer tetap utuh; brand melekat di lead atau quotation."
            : "Keep one history; attach the brand to the lead or quotation.",
        },
        {
          id: "unit_specific",
          label: indo
            ? "Customer terpisah per brand"
            : "Separate customer per brand",
          description: indo
            ? "Setiap brand punya histori dan identitas customer sendiri."
            : "Each brand keeps its own customer identity and history.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan keputusan ini tetap terbuka."
            : "Keep this decision open.",
        },
      ],
      recommendation: indo
        ? "Gue cenderung menyarankan satu customer lintas brand karena owner perlu melihat histori penuh. Brand tetap bisa melekat di lead atau quotation."
        : "I lean toward one shared customer because the owner needs the full history. The brand can still live on the lead or quotation.",
      priority: 10,
      reasonAsked: indo
        ? "Identitas customer memengaruhi histori, duplicate detection, search, quotation, dan batas akses sales."
        : "Customer identity affects history, duplicate detection, search, quotation ownership, and sales access.",
    });
  }

  if (domain === "CRM" && topic === "sales_visibility") {
    return question({
      id: "crm-sales-visibility",
      topic,
      category: "PERMISSIONS",
      text: indo
        ? `Sales tiap brand sudah disebut terpisah dan owner harus bisa melihat semua. Apakah sales hanya boleh melihat customer, lead, follow-up, dan quotation brand-nya sendiri sementara owner melihat seluruh brand?`
        : `You mentioned sales teams per brand and an owner who can see everything. Should each salesperson see only their brand's customers, leads, follow-ups, and quotations while the owner sees all brands?`,
      contextReferences,
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "owner_all_sales_brand_scoped",
          label: indo
            ? "Sales per brand, owner lihat semua"
            : "Brand-scoped sales, owner sees all",
          description: indo
            ? "Batas akses mengikuti brand."
            : "Access follows the brand boundary.",
        },
        {
          id: "all_sales_all_brands",
          label: indo
            ? "Semua sales boleh lihat semua"
            : "All sales see all brands",
          description: indo
            ? "Lebih mudah kolaborasi, tapi batas ownership lebih longgar."
            : "Easier collaboration, looser ownership boundaries.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan akses tetap terbuka."
            : "Keep the access rule open.",
        },
      ],
      recommendation: indo
        ? "Batas per brand dengan akses penuh untuk owner biasanya paling aman untuk mencegah data sales tercampur."
        : "Brand-scoped sales access with full owner visibility is usually safer and prevents sales data from blending.",
      priority: 10,
      reasonAsked: indo
        ? "Aturan ini menentukan permission, ownership, pencarian, dan tampilan kerja setiap role."
        : "This rule determines permissions, ownership, search scope, and each role's working view.",
    });
  }

  if (domain === "CRM" && topic === "lead_ownership") {
    return question({
      id: "crm-lead-ownership",
      topic,
      category: "WORKFLOW",
      text: indo
        ? `Lead bisa datang dari WhatsApp, Instagram, dan website. Saat brand atau sales pertama menerima lead, siapa yang menjadi pemilik follow-up dan boleh memindahkan ownership-nya?`
        : `Leads can arrive from WhatsApp, Instagram, and the website. When a brand or salesperson receives a lead first, who owns the follow-up and can ownership be reassigned?`,
      contextReferences: ["rawIdea", "entities", "workflows", "integrations"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "owning_brand_sales",
          label: indo
            ? "Sales dari brand yang pertama menerima"
            : "First receiving brand's sales team",
          description: indo
            ? "Ownership dimulai dari brand asal lead."
            : "Ownership starts with the lead's originating brand.",
        },
        {
          id: "shared_sales_pool",
          label: indo ? "Dibagi ke pool sales bersama" : "Shared sales pool",
          description: indo
            ? "Lead bisa ditangani lintas brand."
            : "Leads can be handled across brands.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan assignment tetap terbuka."
            : "Keep assignment open.",
        },
      ],
      recommendation: indo
        ? "Ownership dari brand yang pertama menerima membuat follow-up jelas, lalu owner tetap bisa melakukan reassignment."
        : "Starting ownership with the first receiving brand makes follow-up clear while still allowing owner reassignment.",
      priority: 9,
      reasonAsked: indo
        ? "Tanpa aturan ownership, lead dari banyak channel mudah dobel atau tidak punya penanggung jawab."
        : "Without an ownership rule, multi-channel leads can be duplicated or left without an accountable owner.",
    });
  }

  if (domain === "CRM" && topic === "quotation_branding") {
    return question({
      id: "crm-quotation-branding",
      topic,
      category: "DATA",
      text: indo
        ? `Quotation sudah termasuk kebutuhan produk ini. Kalau satu customer pernah berinteraksi dengan beberapa brand, quotation baru harus menggunakan brand yang mana dan tetap terhubung ke histori customer yang sama?`
        : `Quotations are part of this product. If one customer has interacted with multiple brands, which brand should a new quotation use while staying linked to the same customer history?`,
      contextReferences: ["entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "owning_brand_sales",
          label: indo ? "Brand yang memiliki lead" : "The lead-owning brand",
          description: indo
            ? "Reporting quotation tetap jelas per brand."
            : "Quotation reporting stays clear by brand.",
        },
        {
          id: "customer_choice",
          label: indo ? "Customer memilih brand" : "Customer chooses the brand",
          description: indo
            ? "Pilihan brand menjadi bagian dari proses quotation."
            : "Brand choice becomes part of the quotation flow.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan branding quotation tetap terbuka."
            : "Keep quotation branding open.",
        },
      ],
      recommendation: indo
        ? "Brand pemilik lead biasanya paling konsisten untuk reporting, approval, dan histori quotation."
        : "Using the lead-owning brand is usually clearest for reporting, approvals, and quotation history.",
      priority: 9,
      reasonAsked: indo
        ? "Keputusan ini menjaga quotation tetap punya konteks brand tanpa memecah customer history."
        : "This keeps each quotation tied to a brand without splitting the customer history.",
    });
  }

  if (domain === "CRM" && topic === "duplicate_handling") {
    return question({
      id: "crm-duplicate-handling",
      topic,
      category: "DATA",
      text: indo
        ? `Kalau nomor telepon atau akun sosial yang sama masuk dari dua channel atau dua brand, apakah customer langsung digabung, atau lead tetap terpisah sampai ada yang meninjau?`
        : `If the same phone number or social account arrives through two channels or brands, should the customer be merged immediately or should separate leads stay until someone reviews them?`,
      contextReferences: ["entities", "integrations"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "merge_with_review",
          label: indo ? "Gabungkan dengan review" : "Merge with review",
          description: indo
            ? "Sistem memberi sinyal, user mengonfirmasi."
            : "The system flags it; a user confirms.",
        },
        {
          id: "keep_separate_until_review",
          label: indo
            ? "Pisahkan dulu sampai direview"
            : "Keep separate until review",
          description: indo
            ? "Tidak ada data yang menyatu tanpa pengecekan."
            : "No data is merged without review.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan duplicate tetap terbuka."
            : "Keep duplicate handling open.",
        },
      ],
      recommendation: indo
        ? "Sinyal duplicate dengan review manual biasanya mengurangi data ganda tanpa berisiko menyatukan orang yang berbeda."
        : "A duplicate signal with human review reduces duplicates without silently merging different people.",
      priority: 8,
      reasonAsked: indo
        ? "Duplicate handling memengaruhi kualitas customer history dan kepercayaan sales pada data CRM."
        : "Duplicate handling affects customer-history quality and sales trust in the CRM data.",
    });
  }

  if (domain === "RENTAL" && topic === "vehicle_location") {
    return question({
      id: "rental-vehicle-location",
      topic,
      category: "DATA",
      text: indo
        ? `Untuk rental mobil dengan beberapa cabang, apakah setiap kendaraan selalu terikat ke satu cabang saat tersedia, atau kendaraan boleh tersedia di cabang lain setelah dipindahkan?`
        : `For this multi-branch car rental, is each vehicle tied to one branch while available, or can it become available at another branch after a transfer?`,
      contextReferences: ["rawIdea", "entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "branch_bound",
          label: indo ? "Terikat ke cabang" : "Branch-bound",
          description: indo
            ? "Availability hanya berasal dari cabang pemilik."
            : "Availability comes only from the owning branch.",
        },
        {
          id: "transferable",
          label: indo ? "Bisa dipindahkan" : "Transferable",
          description: indo
            ? "Lokasi aktif berubah setelah transfer."
            : "The active location changes after transfer.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan lokasi terbuka."
            : "Keep the location rule open.",
        },
      ],
      recommendation: indo
        ? "Simpan lokasi aktif dan histori transfer terpisah supaya availability tidak salah."
        : "Keep current location separate from transfer history so availability stays trustworthy.",
      priority: 10,
      reasonAsked: indo
        ? "Lokasi kendaraan menentukan availability, booking, dan operasi antar cabang."
        : "Vehicle location determines availability, booking, and cross-branch operations.",
    });
  }

  if (domain === "RENTAL" && topic === "cross_branch_booking") {
    return question({
      id: "rental-cross-branch-booking",
      topic,
      category: "WORKFLOW",
      text: indo
        ? `Customer bisa booking kendaraan di beberapa cabang. Apakah customer boleh pickup di satu cabang dan return di cabang lain, atau booking harus selesai di cabang yang sama?`
        : `Customers can book across branches. Can they pick up at one branch and return at another, or must each booking stay within the same branch?`,
      contextReferences: ["rawIdea", "entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "cross_branch_allowed",
          label: indo ? "Boleh lintas cabang" : "Cross-branch allowed",
          description: indo
            ? "Pickup dan return boleh berbeda."
            : "Pickup and return can differ.",
        },
        {
          id: "same_branch_only",
          label: indo ? "Harus cabang yang sama" : "Same branch only",
          description: indo
            ? "Operasi lebih sederhana dan terlokalisasi."
            : "Operations stay simple and local.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan booking terbuka."
            : "Keep the booking rule open.",
        },
      ],
      recommendation: indo
        ? "Tentukan ini sejak awal karena memengaruhi availability dan biaya operasional transfer."
        : "Decide this early because it changes availability and transfer operations.",
      priority: 10,
      reasonAsked: indo
        ? "Aturan pickup dan return mengubah model booking dan koordinasi antar cabang."
        : "Pickup and return rules change the booking model and branch coordination.",
    });
  }

  if (domain === "RENTAL" && topic === "customer_identity") {
    return question({
      id: "rental-customer-identity",
      topic,
      category: "DATA",
      text: indo
        ? `Kalau customer rental pernah menyewa di dua cabang, apakah histori customer-nya satu lintas cabang atau profil terpisah per cabang?`
        : `If a rental customer has used two branches, should customer history stay shared across branches or remain separate per branch?`,
      contextReferences: ["entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "company_wide",
          label: indo
            ? "Satu customer lintas cabang"
            : "One customer across branches",
          description: indo
            ? "Riwayat sewa tetap utuh."
            : "Rental history stays together.",
        },
        {
          id: "unit_specific",
          label: indo
            ? "Profil terpisah per cabang"
            : "Separate profile per branch",
          description: indo
            ? "Setiap cabang mengelola histori sendiri."
            : "Each branch manages its own history.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan identitas terbuka."
            : "Keep identity open.",
        },
      ],
      recommendation: indo
        ? "Satu histori lintas cabang biasanya membantu pengecekan customer dan repeat rental."
        : "One cross-branch history usually helps with customer checks and repeat rentals.",
      priority: 9,
      reasonAsked: indo
        ? "Identitas customer memengaruhi histori sewa, duplicate detection, dan kebijakan antar cabang."
        : "Customer identity affects rental history, duplicate detection, and cross-branch policies.",
    });
  }

  if (domain === "RENTAL" && topic === "vehicle_transfer") {
    return question({
      id: "rental-vehicle-transfer",
      topic,
      category: "WORKFLOW",
      text: indo
        ? `Saat kendaraan dipindahkan antar cabang, kapan statusnya berubah menjadi tersedia: saat berangkat, saat diterima, atau setelah staff cabang tujuan mengonfirmasi?`
        : `When a vehicle moves between branches, when should it become available: when it leaves, when it arrives, or after the destination staff confirms it?`,
      contextReferences: ["entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "destination_confirmed",
          label: indo
            ? "Setelah cabang tujuan konfirmasi"
            : "After destination confirmation",
          description: indo
            ? "Availability tidak muncul sebelum kendaraan diterima."
            : "Availability waits until receipt is confirmed.",
        },
        {
          id: "transfer_started",
          label: indo ? "Saat transfer dimulai" : "When transfer starts",
          description: indo
            ? "Cabang tujuan bisa merencanakan lebih awal."
            : "The destination can plan earlier.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan status terbuka."
            : "Keep status handling open.",
        },
      ],
      recommendation: indo
        ? "Availability setelah konfirmasi penerimaan paling aman untuk mencegah double booking."
        : "Availability after receipt confirmation is safest for preventing double booking.",
      priority: 8,
      reasonAsked: indo
        ? "Status transfer mengubah availability dan risiko double booking."
        : "Transfer status changes availability and double-booking risk.",
    });
  }

  if (domain === "RENTAL" && topic === "pickup_return") {
    return question({
      id: "rental-pickup-return",
      topic,
      category: "WORKFLOW",
      text: indo
        ? `Saat pickup dan return kendaraan dicatat, data apa yang wajib menjadi bagian dari status booking: kondisi kendaraan, kilometer, bahan bakar, atau biaya kerusakan?`
        : `When a vehicle is picked up and returned, which details must change the booking status: condition, mileage, fuel, or damage charges?`,
      contextReferences: ["entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "FREE_TEXT",
      priority: 8,
      reasonAsked: indo
        ? "Aturan pickup dan return menentukan data operasional yang harus dicatat."
        : "Pickup and return rules determine which operational data must be recorded.",
    });
  }

  if (domain === "INVENTORY" && topic === "slab_identity") {
    return question({
      id: "inventory-slab-identity",
      topic,
      category: "DATA",
      text: indo
        ? `Untuk inventory slab marmer, apakah setiap slab harus punya identitas dan histori sendiri, atau cukup menyimpan total quantity per jenis dan gudang?`
        : `For this marble slab inventory, should every slab have its own identity and history, or is aggregate quantity by type and warehouse enough?`,
      contextReferences: ["rawIdea", "entities"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "individual_slab",
          label: indo ? "Identitas setiap slab" : "Individual slab identity",
          description: indo
            ? "Lokasi dan movement bisa dilacak per slab."
            : "Location and movement are tracked per slab.",
        },
        {
          id: "aggregate_quantity",
          label: indo ? "Total quantity saja" : "Aggregate quantity only",
          description: indo
            ? "Model lebih sederhana, tanpa histori per slab."
            : "Simpler model, without per-slab history.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan semantics inventory terbuka."
            : "Keep inventory semantics open.",
        },
      ],
      recommendation: indo
        ? "Jika slab dijual atau dicari satu per satu, identitas individual lebih aman; kalau hanya stok massal, quantity cukup."
        : "If slabs are sold or searched individually, identity is safer; aggregate quantity is enough for bulk stock.",
      priority: 10,
      reasonAsked: indo
        ? "Identitas slab menentukan ERD, transfer, reservation, dan histori inventory."
        : "Slab identity determines the ERD, transfers, reservations, and inventory history.",
    });
  }

  if (domain === "INVENTORY" && topic === "warehouse_transfer") {
    return question({
      id: "inventory-warehouse-transfer",
      topic,
      category: "WORKFLOW",
      text: indo
        ? `Saat stock atau slab dipindahkan antar gudang, apakah transfer langsung mengurangi gudang asal dan menambah gudang tujuan, atau harus menunggu konfirmasi penerimaan?`
        : `When stock or slabs move between warehouses, should a transfer immediately reduce the source and add to the destination, or wait for receipt confirmation?`,
      contextReferences: ["rawIdea", "entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "destination_confirmed",
          label: indo
            ? "Menunggu konfirmasi gudang tujuan"
            : "Wait for destination confirmation",
          description: indo
            ? "Transit terlihat terpisah dari stock tersedia."
            : "Transit stays separate from available stock.",
        },
        {
          id: "transfer_started",
          label: indo
            ? "Langsung saat transfer dibuat"
            : "Update when transfer is created",
          description: indo
            ? "Lebih cepat, tapi butuh kontrol jika gagal."
            : "Faster, but needs failure handling.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan transfer terbuka."
            : "Keep transfer behavior open.",
        },
      ],
      recommendation: indo
        ? "Status transit dan konfirmasi penerimaan mengurangi risiko stock terlihat tersedia padahal masih perjalanan."
        : "Transit status plus receipt confirmation reduces the risk of showing stock as available while in motion.",
      priority: 10,
      reasonAsked: indo
        ? "Transfer mengubah quantity, lokasi, permission staff, dan audit trail."
        : "Transfers change quantity, location, staff permissions, and the audit trail.",
    });
  }

  if (domain === "INVENTORY" && topic === "movement_history") {
    return question({
      id: "inventory-movement-history",
      topic,
      category: "DATA",
      text: indo
        ? `Untuk inventory ini, apakah setiap perubahan lokasi atau quantity harus menyimpan siapa, kapan, dari mana, ke mana, dan alasannya?`
        : `For this inventory, should every location or quantity change preserve who changed it, when, the source, the destination, and the reason?`,
      contextReferences: ["entities", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "full_history",
          label: indo ? "Histori lengkap" : "Full movement history",
          description: indo
            ? "Setiap perubahan bisa diaudit."
            : "Every change can be audited.",
        },
        {
          id: "current_state_only",
          label: indo ? "Current state saja" : "Current state only",
          description: indo
            ? "Lebih sederhana, histori terbatas."
            : "Simpler, with limited history.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan kebutuhan audit terbuka."
            : "Keep audit needs open.",
        },
      ],
      recommendation: indo
        ? "Histori lengkap biasanya penting untuk menemukan selisih stock dan menelusuri perpindahan slab."
        : "Full history is usually important for reconciling stock and tracing slab movement.",
      priority: 9,
      reasonAsked: indo
        ? "Movement history memengaruhi audit, koreksi stock, dan kepercayaan pada data gudang."
        : "Movement history affects audits, stock corrections, and trust in warehouse data.",
    });
  }

  if (domain === "INVENTORY" && topic === "reservation") {
    return question({
      id: "inventory-reservation",
      topic,
      category: "WORKFLOW",
      text: indo
        ? `Kalau slab sudah dipilih untuk customer atau quotation, apakah stock harus langsung di-reserve agar tidak dijual ke orang lain sebelum transaksi selesai?`
        : `When a slab is selected for a customer or quotation, should inventory be reserved so it cannot be sold to someone else before the transaction finishes?`,
      contextReferences: ["entities", "features", "workflows"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "SINGLE_CHOICE",
      options: [
        {
          id: "reservation_supported",
          label: indo ? "Ya, bisa di-reserve" : "Yes, support reservations",
          description: indo
            ? "Availability membedakan stock bebas dan reserved."
            : "Availability distinguishes free and reserved stock.",
        },
        {
          id: "no_pre_reservation",
          label: indo ? "Tidak perlu reservation" : "No pre-reservation",
          description: indo
            ? "Stock berubah saat transaksi final."
            : "Stock changes only at final transaction.",
        },
        {
          id: "not_sure",
          label: indo ? "Belum yakin" : "Not sure yet",
          description: indo
            ? "Biarkan aturan reservation terbuka."
            : "Keep reservation open.",
        },
      ],
      recommendation: indo
        ? "Reservation penting jika quotation bisa berlangsung lama atau customer memesan slab tertentu."
        : "Reservations matter when quotations remain open or customers select specific slabs.",
      priority: 8,
      reasonAsked: indo
        ? "Reservation memengaruhi availability dan hubungan inventory dengan customer atau quotation."
        : "Reservations affect availability and how inventory connects to customers or quotations.",
    });
  }

  if (domain === "INVENTORY" && topic === "measurement_semantics") {
    return question({
      id: "inventory-measurement-semantics",
      topic,
      category: "DATA",
      text: indo
        ? `Untuk quantity slab, apakah perhitungan memakai per slab, meter persegi, ukuran panjang-lebar, atau kombinasi beberapa satuan?`
        : `For slab quantity, should calculation use per slab, square meter, dimensions, or a combination of units?`,
      contextReferences: ["entities", "features"],
      relatedRequirementIds: [topic],
      affects: affectedFor(topic),
      answerType: "FREE_TEXT",
      priority: 8,
      reasonAsked: indo
        ? "Semantics quantity menentukan field inventory, quotation, dan laporan stock."
        : "Quantity semantics determine inventory fields, quotations, and stock reporting.",
    });
  }

  return genericQuestionForTopic(state, topic);
}

/** Build the discovery question for a topic even if already decided (revision). */
export function questionForTopic(
  state: ProjectState,
  topic: string,
): Question | null {
  return topicQuestion(state, topic);
}

export class QuestionEngine {
  generateQuestions(
    state: ProjectState,
    _topUnresolved: RequirementNode[] = [],
    maxCount = 5,
  ): Question[] {
    if (detectDiscoveryDomain(state) === "GENERAL") {
      const foundation = foundationQuestion(state);
      if (foundation) return [foundation];
    }
    const evaluation = evaluateDiscovery(state);
    const questions: Question[] = [];
    for (const requirement of evaluation.topUnresolved) {
      if (hasDecision(state, requirement.id)) continue;
      const candidate = topicQuestion(state, requirement.id);
      if (!candidate || !validateQuestionQuality(candidate, state).accepted)
        continue;
      if (!questions.some((item) => item.topic === candidate.topic))
        questions.push(candidate);
      if (questions.length >= maxCount) break;
    }

    return questions;
  }

  /** Re-open a decided topic so the user can supersede the prior answer. */
  generateRevisionQuestion(
    state: ProjectState,
    topic: string,
  ): Question | null {
    const candidate = topicQuestion(state, topic);
    if (!candidate) return null;
    // A revision legitimately re-opens a confirmed decision (supersede flow),
    // so the "already answered" rejection does not apply here.
    if (
      !validateQuestionQuality(candidate, state, { allowDecidedTopic: true })
        .accepted
    )
      return null;
    return {
      ...candidate,
      reasonAsked: `${candidate.reasonAsked} You can revise the previous answer; the prior decision will be marked superseded.`,
    };
  }

  resolveQuestion(state: ProjectState, questionId: string): Question | null {
    const active = this.generateQuestions(state, [], 12).find(
      (item) => item.id === questionId,
    );
    if (active) return active;
    // Allow answering a revision question whose topic is already decided.
    const evaluation = evaluateDiscovery(state);
    for (const requirement of evaluation.requirements) {
      const candidate = topicQuestion(state, requirement.id);
      if (candidate?.id === questionId) return candidate;
    }
    return null;
  }

  processAnswer(
    state: ProjectState,
    questionId: string,
    answer: string | string[],
    currentQuestion?: Question,
  ): {
    updatedState: ProjectState;
    decision?: ProjectState["decisions"][number];
    impact?: { headline: string; detail: string };
    revision: { version: number; createdAt: string };
  } {
    const parsed = ProjectStateSchema.parse(JSON.parse(JSON.stringify(state)));
    const question = currentQuestion || undefined;
    const answerText = Array.isArray(answer) ? answer.join(", ") : answer;
    const option = question?.options?.find(
      (item) => item.id === answerText || item.label === answerText,
    );
    const topic =
      question?.topic ||
      questionId
        .replace(/^(crm|rental|inventory|general)-/, "")
        .replace(/-/g, "_");
    const decision = canonicalDecision(topic, answerText, option?.id);
    const currentVersion = Number(parsed.generationMetadata._version || 1);
    const isFoundation = topic.startsWith("foundation_");

    parsed.generationMetadata[`answer_${questionId}_${Date.now()}`] = {
      answer: answerText,
      topic,
      timestamp: new Date().toISOString(),
      previousVersion: currentVersion,
    };

    if (isFoundation) {
      applyFoundationFact(parsed, topic, answerText);
      parsed.discovery.activeQuestionId = undefined;
      return {
        updatedState: parsed,
        revision: {
          version: currentVersion,
          createdAt: new Date().toISOString(),
        },
      };
    }

    if (decision === "undecided") {
      if (!parsed.openQuestions.includes(question?.text || questionId))
        parsed.openQuestions.push(question?.text || questionId);
      parsed.discovery.activeQuestionId = questionId;
      return {
        updatedState: parsed,
        revision: {
          version: currentVersion,
          createdAt: new Date().toISOString(),
        },
      };
    }

    const affects = question?.affects?.length
      ? question.affects
      : affectedFor(topic);
    const recorded = recordDecision(parsed, {
      topic,
      decision,
      reason:
        question?.reasonAsked || "User answered during adaptive discovery.",
      source: "USER",
      affects,
    });
    applyCanonicalRule(recorded.state, topic, decision);
    recorded.state.discovery.activeQuestionId = undefined;
    const impact = describeDecisionImpact({
      topic,
      decision,
      affects,
      language: isIndonesian(parsed) ? "id" : "en",
    });

    return {
      updatedState: recorded.state,
      decision: recorded.decision,
      impact,
      revision: {
        version: currentVersion,
        createdAt: new Date().toISOString(),
      },
    };
  }
}
