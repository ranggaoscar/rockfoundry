import type { ReadinessResult } from "@rockfoundry/core";

export function getPackageEligibility(readiness: ReadinessResult) {
  const canBuildPackage = readiness.level === "BUILD_READY";
  if (canBuildPackage) {
    return { canBuildPackage: true, packageBlockers: [] as string[] };
  }

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
    canBuildPackage: false,
    packageBlockers:
      packageBlockers.length > 0
        ? packageBlockers
        : [
            `Readiness is ${readiness.level}. Resolve the remaining product requirements before building the package.`,
          ],
  };
}
