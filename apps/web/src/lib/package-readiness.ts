import type { ReadinessResult } from "@rockfoundry/core";

export function getPackageEligibility(readiness: ReadinessResult) {
  const packageBlockers = [
    ...readiness.blocking,
    ...readiness.decisionDebt.topRisks.map(
      (risk) => `${risk.title}: ${risk.reason}`,
    ),
    ...(readiness.discovery.unresolvedTopics.length > 0
      ? [
          `Discovery decisions remaining: ${readiness.discovery.unresolvedTopics.join(", ")}`,
        ]
      : []),
  ]
    .filter((item, index, all) => item.trim() && all.indexOf(item) === index)
    .slice(0, 6);

  return {
    // Readiness remains useful diagnostics, but it must not gate a user-chosen
    // handoff. The route still rejects an actually empty product idea.
    canBuildPackage: true,
    packageBlockers,
  };
}
