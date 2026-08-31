export type WebMcpCreateProjectResult =
  | {
      status: "success";
      projectId: string;
      name: string;
      projectUrl: string;
      message: string;
    }
  | {
      status: "failed" | "cancelled";
      message: string;
    };

type CreateProjectInput = {
  description: unknown;
  name: unknown;
  signal: AbortSignal;
  navigateToProject: (projectUrl: string) => void;
  fetchImpl?: typeof fetch;
};

function failure(message: string): WebMcpCreateProjectResult {
  return { status: "failed", message };
}

/** Uses the existing project API; this adapter owns no persistence logic. */
export async function createProjectThroughWebMcp({
  description,
  name,
  signal,
  navigateToProject,
  fetchImpl = fetch,
}: CreateProjectInput): Promise<WebMcpCreateProjectResult> {
  const trimmedDescription =
    typeof description === "string" ? description.trim() : "";
  const trimmedName = typeof name === "string" ? name.trim() : "";
  if (!trimmedDescription)
    return failure("Provide a product description to create a project.");
  if (trimmedDescription.length > 5000)
    return failure("Keep the product description under 5000 characters.");
  if (name !== undefined && typeof name !== "string")
    return failure("Project name must be a string when provided.");
  if (trimmedName.length > 200)
    return failure("Keep the project name under 200 characters.");

  try {
    const response = await fetchImpl("/api/projects", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        description: trimmedDescription,
        ...(trimmedName ? { name: trimmedName } : {}),
      }),
      signal,
    });
    const payload = (await response.json().catch(() => ({}))) as {
      error?: unknown;
      project?: { id?: unknown; name?: unknown };
    };
    const projectId = payload.project?.id;
    const projectName = payload.project?.name;
    if (
      !response.ok ||
      typeof projectId !== "string" ||
      typeof projectName !== "string"
    )
      return failure(
        typeof payload.error === "string"
          ? payload.error
          : "RockFoundry could not create the project.",
      );

    const projectUrl = `/project/${encodeURIComponent(projectId)}`;
    navigateToProject(projectUrl);
    return {
      status: "success",
      projectId,
      name: projectName,
      projectUrl,
      message: "Project created and opened.",
    };
  } catch (cause) {
    if (signal.aborted)
      return { status: "cancelled", message: "Project creation was cancelled." };
    return failure(
      cause instanceof Error
        ? cause.message
        : "RockFoundry could not create the project.",
    );
  }
}
