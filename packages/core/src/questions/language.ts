export type ConversationLanguage = "id" | "en";

const INDONESIAN_MARKERS =
  /\b(gua|gue|aku|saya|kami|kita|mau|ingin|bikin|buat|bangun|jualan|jual|beli|untuk|setiap|tapi|harus|bisa|pengen|pengin|dengan|punya|ada|dan|yang|kalau|apakah|sama|lintas|cabang|gudang|marmer|aplikasi|produk|pembeli|ketika|atau|dari|ini|itu|tidak|nggak|boleh|mesti|supaya|agar|mereka|sebuah|seorang|mobil|hewan|penitipan)\b/i;

const ENGLISH_MARKERS =
  /\b(the|and|for|with|from|this|that|want|build|create|should|would|their|because|when|what|how|who|which|customer|owner|sales|branch|warehouse)\b/i;

export function detectConversationLanguage(
  text: string,
  fallback: ConversationLanguage = "en",
): ConversationLanguage {
  const source = text.trim();
  if (!source) return fallback;
  const indonesian = source.match(new RegExp(INDONESIAN_MARKERS, "gi")) || [];
  const english = source.match(new RegExp(ENGLISH_MARKERS, "gi")) || [];
  if (indonesian.length === english.length) {
    return INDONESIAN_MARKERS.test(source) ? "id" : fallback;
  }
  return indonesian.length > english.length ? "id" : "en";
}

export function isIndonesianText(text: string) {
  return detectConversationLanguage(text) === "id";
}
