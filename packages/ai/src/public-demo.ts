export function isPublicDemo(env: NodeJS.ProcessEnv = process.env) {
  const value = env.ROCKFOUNDRY_PUBLIC_DEMO;
  return value === "true" || value === "1";
}
