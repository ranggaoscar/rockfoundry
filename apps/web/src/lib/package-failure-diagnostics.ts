import { toPackageFailureMetadata } from "@rockfoundry/ai";
import { logDesignGenerationFailure } from "./design";

export function buildPackageFailureMetadata(
  error: unknown,
  stage: string,
  timings: Record<string, number | null>,
) {
  const diagnostics = logDesignGenerationFailure(error);
  return {
    ...toPackageFailureMetadata(diagnostics, stage),
    timings,
  };
}
