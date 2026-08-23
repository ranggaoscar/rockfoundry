const TOPIC_LABELS: Record<string, string> = {
  customer_identity: "Identity",
  sales_visibility: "Visibility",
  lead_ownership: "Ownership",
  quotation_branding: "Quotation",
  duplicate_handling: "Duplicates",
  vehicle_location: "Location",
  cross_branch_booking: "Booking",
  vehicle_transfer: "Transfer",
  pickup_return: "Handover",
  slab_identity: "Identity",
  warehouse_transfer: "Transfer",
  movement_history: "History",
  reservation: "Reservation",
  measurement_semantics: "Quantity",
  identity_boundary: "Identity",
  ownership_boundary: "Ownership",
  visibility_boundary: "Visibility",
  lifecycle_transitions: "Lifecycle",
  resource_conflict_policy: "Capacity",
  assignment_behavior: "Assignment",
  cross_boundary_behavior: "Boundaries",
  duplicate_semantics: "Duplicates",
  history_auditability: "History",
  completion_semantics: "Completion",
  approval_responsibility: "Approval",
  money_responsibility: "Payments",
  retention_deletion: "Retention",
  primary_workflow: "Outcome",
  record_relationships: "Relationships",
  role_boundaries: "Roles",
  product_identity: "Product",
};

const TOPIC_LABELS_ID: Record<string, string> = {
  customer_identity: "Identitas",
  sales_visibility: "Akses",
  lead_ownership: "Penanggung jawab",
  quotation_branding: "Quotation",
  duplicate_handling: "Data ganda",
  vehicle_location: "Lokasi",
  cross_branch_booking: "Booking",
  vehicle_transfer: "Transfer",
  pickup_return: "Serah terima",
  slab_identity: "Identitas",
  warehouse_transfer: "Transfer",
  movement_history: "Riwayat",
  reservation: "Reservasi",
  measurement_semantics: "Jumlah",
  identity_boundary: "Identitas",
  ownership_boundary: "Penanggung jawab",
  visibility_boundary: "Akses",
  lifecycle_transitions: "Status",
  resource_conflict_policy: "Kapasitas",
  assignment_behavior: "Penugasan",
  cross_boundary_behavior: "Batas",
  duplicate_semantics: "Data ganda",
  history_auditability: "Riwayat",
  completion_semantics: "Penyelesaian",
  approval_responsibility: "Persetujuan",
  money_responsibility: "Pembayaran",
  retention_deletion: "Retensi",
  primary_workflow: "Hasil utama",
  record_relationships: "Relasi",
  role_boundaries: "Peran",
  product_identity: "Produk",
};

export function humanTopicLabel(
  topic?: string | null,
  language: "id" | "en" = "en",
) {
  if (!topic) return language === "id" ? "Keputusan" : "Decision";
  if (language === "id") {
    return (
      TOPIC_LABELS_ID[topic] ||
      TOPIC_LABELS[topic] ||
      topic
        .replace(/[_-]+/g, " ")
        .replace(/\b\w/g, (letter) => letter.toUpperCase())
        .replace(/\bBoundary\b/i, "")
        .replace(/\bSemantics\b/i, "")
        .trim() ||
      "Keputusan"
    );
  }
  return (
    TOPIC_LABELS[topic] ||
    topic
      .replace(/[_-]+/g, " ")
      .replace(/\b\w/g, (letter) => letter.toUpperCase())
      .replace(/\bBoundary\b/i, "")
      .replace(/\bSemantics\b/i, "")
      .trim() ||
    "Decision"
  );
}

export function formatRelativeTime(value?: string) {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const delta = Date.now() - date.getTime();
  const minutes = Math.round(delta / 60_000);
  if (minutes < 1) return "Just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.round(hours / 24);
  if (days < 7) return `${days}d ago`;
  return date.toLocaleDateString();
}
