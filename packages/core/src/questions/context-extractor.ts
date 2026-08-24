import type { Confidence, ProjectState, ProvenanceSource } from "../schema";
import { detectConversationLanguage } from "./language";

export type StructuralFact = {
  value: string;
  confidence: Confidence;
  source: ProvenanceSource;
  evidence?: string;
};

export type StructuralContext = {
  roles: StructuralFact[];
  productIdentityAmbiguous: boolean;
  entities: StructuralFact[];
  workflows: StructuralFact[];
  channels: StructuralFact[];
  locations: StructuralFact[];
  boundaries: StructuralFact[];
  signals: {
    identity: boolean;
    duplicate: boolean;
    visibility: boolean;
    ownership: boolean;
    lifecycle: boolean;
    stateTransitions: boolean;
    assignment: boolean;
    scheduling: boolean;
    resourceConstraint: boolean;
    history: boolean;
    auditability: boolean;
    money: boolean;
    documents: boolean;
    integrations: boolean;
    completion: boolean;
    retention: boolean;
  };
  evidence: string[];
  language: "id" | "en";
};

function uniqueFacts(facts: StructuralFact[]) {
  const seen = new Set<string>();
  return facts.filter((fact) => {
    const key = fact.value.toLowerCase().trim();
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function canonicalFacts(
  state: ProjectState,
  values: string[],
  keyPrefix: string,
): StructuralFact[] {
  return uniqueFacts(
    values.filter(Boolean).map((value) => {
      const provenance = state.provenance[`${keyPrefix}.${value}`];
      return {
        value: value.trim(),
        confidence: provenance?.confidence || "EXPLICIT",
        source: provenance?.source || "SYSTEM",
        evidence: provenance?.evidence,
      };
    }),
  );
}

function cleanCandidate(value: string) {
  return value
    .replace(/^[\s:–—-]+|[\s:,.!?;:–—-]+$/g, "")
    .replace(/^(?:[^,]+?\s+)?(?:has|have|with|punya|ada|dengan)\s+/i, "")
    .replace(
      /^(?:a|an|the|some|several|multiple|many|various|beberapa|banyak|berbagai|satu|sebuah)\s+/i,
      "",
    )
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Pull nouns from explicit list language without trying to identify an
 * industry. These are context candidates, not automatic canonical facts.
 */
function explicitListCandidates(rawIdea: string): StructuralFact[] {
  const candidates: StructuralFact[] = [];
  const addList = (rawList: string, evidence: string) => {
    const values = rawList
      .split(/\s*(?:,|;|\band\b|\bdan\b)\s*/i)
      .map(cleanCandidate)
      .filter((value) => value.length >= 3)
      .filter(
        (value) =>
          !/^(?:a|an|the|several|multiple|some|beberapa|banyak|various)$/i.test(
            value,
          ),
      );
    for (const value of values) {
      candidates.push({
        value,
        confidence: "EXPLICIT",
        source: "USER",
        evidence,
      });
    }
  };
  const listPattern =
    /\b(?:with|including|contains|has|have|dengan|punya|ada|berisi|meliputi)\b\s+([^.!?]+)/gi;
  for (const match of rawIdea.matchAll(listPattern)) {
    addList(match[1], match[0].trim());
  }

  // Ideas often introduce the list after a colon or a comma rather than a
  // "with" verb. Treat comma-separated nouns as evidence, not canonical
  // entities, so the same extractor works across unfamiliar products.
  const commaTail = rawIdea.match(/[:,]\s*([^.!?]{8,})(?:[.!?]|$)/)?.[1];
  if (commaTail && /,|\band\b|\bdan\b/i.test(commaTail)) {
    addList(commaTail, commaTail);
  }
  return uniqueFacts(candidates);
}

function inferredSignal(
  rawIdea: string,
  pattern: RegExp,
  evidenceLabel: string,
): StructuralFact[] {
  return pattern.test(rawIdea)
    ? [
        {
          value: evidenceLabel,
          confidence: "STRONGLY_INFERRED",
          source: "AGENT_INFERENCE",
          evidence: rawIdea,
        },
      ]
    : [];
}

function rawChannels(rawIdea: string) {
  const values = rawIdea.match(
    /\b(?:whatsapp|instagram|email|sms|api|webhook|website|portal|calendar|gateway)\b/gi,
  );
  return uniqueFacts(
    (values || []).map((value) => ({
      value,
      confidence: "EXPLICIT" as const,
      source: "USER" as const,
      evidence: value,
    })),
  );
}

function rawWorkflows(rawIdea: string) {
  const values = rawIdea.match(
    /\b(?:manage|managing|mengelola|track|tracking|menangani|schedule|scheduling|mengatur|register|mendaftar|assign|mengalokasikan|monitor|memantau|handle|menangani)\b[^,.!?]*/i,
  );
  return values?.[0]
    ? [
        {
          value: cleanCandidate(values[0]),
          confidence: "STRONGLY_INFERRED" as const,
          source: "AGENT_INFERENCE" as const,
          evidence: values[0],
        },
      ]
    : [];
}

function rawBoundaries(rawIdea: string) {
  const values = rawIdea.match(
    /\b(?:branch|cabang|brand|location|lokasi|unit|team|tim|organization|organisasi|department|departemen|group|kelompok|warehouse|gudang|across|lintas|per)\b/gi,
  );
  return uniqueFacts(
    (values || []).map((value) => ({
      value,
      confidence: "EXPLICIT" as const,
      source: "USER" as const,
      evidence: value,
    })),
  );
}

function shortIdeaNouns(rawIdea: string) {
  const words = rawIdea.split(/\s+/).filter(Boolean);
  if (words.length === 0 || words.length > 12) return [];
  const stop =
    /^(?:i|want|to|a|an|the|for|with|and|or|of|my|our|build|create|make|making|web|website|app|application|system|platform|gua|gue|saya|aku|mau|ingin|bikin|buat|membuat|membuatkan|bangun|jualan|jual|beli|untuk|dari|yang|dan|ini|itu|sebuah|seorang|aplikasi|produk|supaya|agar|lebih|mudah|dicatat|mencatat|mencari|mengelola|menangani|setelah|sebelum|bisa|harus|perlu|juga|atau|kalau|apakah|dengan|punya|ada|sama|dulu|nanti|saja|aja|sekali|sangat|buatkan|dibuat|dibikin)$/i;
  return uniqueFacts(
    words
      .map(cleanCandidate)
      .filter((value) => value.length >= 4 && !stop.test(value))
      .filter((value) => !isInternalIdentifier(value))
      .map((value) => ({
        value,
        confidence: "STRONGLY_INFERRED" as const,
        source: "AGENT_INFERENCE" as const,
        evidence: value,
      })),
  );
}

function isInternalIdentifier(value: string) {
  const text = value.trim();
  if (!text) return true;
  if (/^[a-z]+(?:_[a-z0-9]+)+$/.test(text)) return true;
  if (/^[A-Z][A-Za-z ]+:\s*[a-z0-9]+(?:_[a-z0-9]+)+$/.test(text)) return true;
  if (
    /\b(?:Primary workflow outcome|Lifecycle transition rule|Identity boundary|Ownership boundary|Visibility boundary|Assignment rule|Completion semantics|Duplicate semantics|History and auditability rule|Money responsibility|Retention and deletion rule|Resource conflict policy|Cross-boundary behavior|Approval responsibility|Record relationship decision|Role boundary)\b/i.test(
      text,
    ) &&
    /[_:]/.test(text)
  )
    return true;
  return false;
}

const GENERIC_PRODUCT_NOUN = /^(?:(?:application|app|aplikasi|platform|website|web app|mobile app|system|sistem|software)(?:\s+(?:platform|social media|app|aplikasi|untuk anak kantor|for office workers|for teams?))*|social media platform)$/i;

function isWeakContextToken(value: string) {
  return (
    isInternalIdentifier(value) ||
    GENERIC_PRODUCT_NOUN.test(value.trim()) ||
    /^(?:membuat|buat|bikin|create|make|build|manage|track|handle|record|records|workflow|ownership|visibility|assignment|history|completion)$/i.test(
      value.trim(),
    )
  );
}

function rawRoles(rawIdea: string, listCandidates: StructuralFact[]) {
  const roles: StructuralFact[] = [];
  const rolePattern =
    /\b(?:user|users|role|roles|actor|actors|staff|team|teams|owner|owners|manager|managers|operator|operators|admin|admins|people|person|customer|customers|client|clients|pembeli|penjual|pelanggan|pemilik)\b/gi;
  for (const match of rawIdea.matchAll(rolePattern)) {
    roles.push({
      value: match[0],
      confidence: "EXPLICIT",
      source: "USER",
      evidence: match[0],
    });
  }
  for (const candidate of listCandidates) {
    if (
      /(?:er|or|ist|staff|team|user|owner|admin|manager|operator|person|people)$/i.test(
        candidate.value,
      ) &&
      !/\b(?:room|equipment|resource|slot|seat|capacity|record|document|certificate|sertifikat)\b/i.test(
        candidate.value,
      )
    ) {
      roles.push(candidate);
    }
  }
  // Quantified actor groups often appear as the first item in an explicit
  // list. Keep this deliberately structural rather than industry-specific.
  if (
    /(?:several|multiple|some|many|beberapa|banyak)\s+[^,.]+/i.test(rawIdea)
  ) {
    const first = listCandidates[0];
    if (
      first &&
      !/\b(?:room|equipment|resource|slot|seat|capacity|record|document|certificate|sertifikat)\b/i.test(
        first.value,
      )
    )
      roles.push(first);
  }
  return uniqueFacts(roles);
}

function signalSet(rawIdea: string, context: StructuralContext) {
  const text = [
    rawIdea,
    ...context.entities.map((item) => item.value),
    ...context.workflows.map((item) => item.value),
    ...context.channels.map((item) => item.value),
  ].join(" ");
  const has = (pattern: RegExp) => pattern.test(text);
  return {
    identity:
      has(
        /\bidentity|identitas|same real|same person|same thing|one record|satu record|shared record|duplicate|duplikat\b/i,
      ) ||
      (context.entities.length >= 2 &&
        has(/\bhistory|histori|record|records|audit|riwayat\b/i)),
    duplicate: has(
      /duplicate|duplikat|same phone|same email|appears twice|sama\b/i,
    ),
    visibility:
      context.roles.length >= 2 ||
      (context.roles.length > 0 &&
        context.entities.length > 1 &&
        has(
          /\blifecycle|history|histori|record|records|document|dokumen|progress|status\b/i,
        )) ||
      has(
        /\bsee|view|visible|visibility|lihat|akses|access|private|privacy|history|histori\b/i,
      ),
    ownership:
      context.roles.length > 0 ||
      has(
        /\bowner|own|owned|responsib|assign|assignment|pemilik|tanggung jawab\b/i,
      ),
    lifecycle: has(
      /\bstatus|lifecycle|state|progress|history|histori|pending|active|complete|completed|cancel|reschedul|transfer|plan|record|session|booking|appointment|shift\b/i,
    ),
    stateTransitions: has(
      /\bstatus|lifecycle|state|pending|active|complete|completed|cancel|reschedul|approve|approved|review|confirm|confirmed|transfer\b/i,
    ),
    assignment: has(
      /\bassign|assignment|assigned|owner|pemilik|ditangani|handled|responsib\w*\b/i,
    ),
    scheduling: has(
      /\bschedul|calendar|appointment|booking|session|slot|shift|jadwal|waktu|date|deadline\b/i,
    ),
    resourceConstraint: has(
      /\bcapacity|availability|available|limited|resource|room|equipment|seat|slot|conflict|appointment|booking|kapasitas|terbatas|tersedia\b/i,
    ),
    history: has(/\bhistory|histori|record|records|audit|riwayat|log|trace\b/i),
    auditability: has(
      /\baudit|history|histori|log|trace|who changed|siapa|kapan\b/i,
    ),
    money: has(
      /\bpayment|payments|pay|deposit|refund|price|cost|fee|invoice|checkout|pembayaran|uang|biaya|tagihan\b/i,
    ),
    documents: has(
      /\bdocument|documents|certificate|report|invoice|plan|dokumen|sertifikat|laporan|rekam\b/i,
    ),
    integrations:
      context.channels.length > 0 || has(/\bintegrat|webhook|api\b/i),
    completion: has(
      /\bprogress|complete|completed|completion|finish|finished|outcome|success|certificate|sertifikat|lulus|selesai\b/i,
    ),
    retention: has(
      /\bretain|retention|delete|deletion|archive|archiv|hapus|simpan lama\b/i,
    ),
  };
}

/**
 * Build an ontology-like view without mutating canonical state. State arrays
 * are canonical evidence; raw-language additions remain inferred context.
 */
export function extractStructuralContext(
  state: ProjectState,
): StructuralContext {
  const rawCandidates = explicitListCandidates(state.rawIdea);
  const roles = uniqueFacts([
    ...canonicalFacts(state, state.roles, "role"),
    ...canonicalFacts(state, state.targetUsers, "user"),
    ...rawRoles(state.rawIdea, rawCandidates),
  ]);
  const entities = uniqueFacts([
    ...canonicalFacts(state, state.entities, "entity"),
    ...rawCandidates,
    ...shortIdeaNouns(state.rawIdea),
  ]);
  const workflows = uniqueFacts([
    ...canonicalFacts(state, state.workflows, "workflow"),
    ...canonicalFacts(state, state.features, "feature"),
    ...rawWorkflows(state.rawIdea),
  ]);
  const channels = uniqueFacts([
    ...canonicalFacts(state, state.integrations, "integration"),
    ...rawChannels(state.rawIdea),
  ]);
  const locations = uniqueFacts(
    rawBoundaries(state.rawIdea).filter((item) =>
      /branch|cabang|location|lokasi|warehouse|gudang|unit/i.test(item.value),
    ),
  );
  const boundaries = uniqueFacts([
    ...rawBoundaries(state.rawIdea),
    ...locations,
    ...roles.filter((item) => /warehouse|gudang|branch|cabang|team|tim/i.test(item.value)),
  ]);
  const productIdentityAmbiguous =
    /\b(?:mencari pekerjaan|cari kerja|job search|lowongan kerja|job marketplace)\b/i.test(
      state.rawIdea,
    ) &&
    !/\b(?:employer|perusahaan|recruiter|perekrut|pasang lowongan|post jobs?)\b/i.test(
      state.rawIdea,
    );
  const context = {
    roles,
    productIdentityAmbiguous,
    entities,
    workflows,
    channels,
    locations,
    boundaries,
    signals: {} as StructuralContext["signals"],
    evidence: [
      state.rawIdea,
      ...rawCandidates.map((item) => item.evidence || ""),
    ].filter(Boolean),
    language: detectConversationLanguage(state.rawIdea),
  };
  context.signals = signalSet(state.rawIdea, context);
  return context;
}

export function contextValues(facts: StructuralFact[], limit = 4) {
  return facts
    .map((fact) => fact.value)
    .filter(Boolean)
    .filter((value) => !isWeakContextToken(value))
    .slice(0, limit);
}

export function contextLabel(facts: StructuralFact[], fallback: string) {
  const values = contextValues(facts);
  return values.length ? values.join(", ") : fallback;
}

export function formatNaturalList(
  values: string[],
  language: "id" | "en" = "en",
) {
  if (values.length === 0) return "";
  if (values.length === 1) return values[0];
  if (language === "id") {
    if (values.length === 2) return `${values[0]} dan ${values[1]}`;
    return `${values.slice(0, -1).join(", ")}, dan ${values[values.length - 1]}`;
  }
  return values.join(", ");
}

export function displayContextLabel(
  facts: StructuralFact[],
  fallback: string,
  limit = 2,
  language: "id" | "en" = "en",
) {
  const values = contextValues(facts, limit);
  return values.length ? formatNaturalList(values, language) : fallback;
}

export function primaryContextNoun(facts: StructuralFact[], fallback: string) {
  return contextValues(facts, 1)[0] || fallback;
}

export function contextConfidence(context: StructuralContext): Confidence {
  const explicit = [
    ...context.roles,
    ...context.entities,
    ...context.workflows,
    ...context.channels,
  ].filter((item) => item.confidence === "EXPLICIT").length;
  if (explicit >= 3) return "STRONGLY_INFERRED";
  if (explicit > 0) return "WEAKLY_INFERRED";
  return "UNKNOWN";
}
