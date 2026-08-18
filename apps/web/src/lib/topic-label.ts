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
};

export function humanTopicLabel(topic?: string | null) {
  if (!topic) return "Decision";
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
