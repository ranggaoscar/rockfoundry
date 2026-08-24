export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { startPackageWorker } = await import("./lib/package-worker");
  const { startDesignWorker } = await import("./lib/design-worker");
  startPackageWorker();
  startDesignWorker();
}
