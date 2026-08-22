import "server-only";

export type SearchResult = {
  title: string;
  url: string;
  snippet: string;
};

function optionalText(value: string | undefined) {
  return value?.trim() || null;
}

export function isSearchConfigured(env: NodeJS.ProcessEnv = process.env) {
  return (
    env.ROCKFOUNDRY_SEARCH_PROVIDER === "searxng" &&
    Boolean(optionalText(env.ROCKFOUNDRY_SEARCH_BASE_URL))
  );
}

export async function searchWeb(
  query: string,
  env: NodeJS.ProcessEnv = process.env,
): Promise<SearchResult[]> {
  const baseUrl = optionalText(env.ROCKFOUNDRY_SEARCH_BASE_URL);
  if (env.ROCKFOUNDRY_SEARCH_PROVIDER !== "searxng" || !baseUrl)
    throw new Error(
      "Web search is not configured for this RockFoundry runtime.",
    );

  const endpoint = new URL(baseUrl);
  if (!/^https?:$/.test(endpoint.protocol))
    throw new Error("Web search configuration must use an HTTP(S) endpoint.");
  endpoint.searchParams.set("q", query);
  endpoint.searchParams.set("format", "json");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 10_000);
  try {
    const response = await fetch(endpoint, {
      signal: controller.signal,
      headers: {
        Accept: "application/json",
        ...(optionalText(env.ROCKFOUNDRY_SEARCH_API_KEY)
          ? { Authorization: `Bearer ${env.ROCKFOUNDRY_SEARCH_API_KEY}` }
          : {}),
      },
    });
    if (!response.ok)
      throw new Error("Web search provider could not complete the request.");
    const body = (await response.json()) as {
      results?: Array<{ title?: unknown; url?: unknown; content?: unknown }>;
    };
    return (body.results || [])
      .flatMap((item) => {
        if (typeof item.title !== "string" || typeof item.url !== "string")
          return [];
        try {
          const url = new URL(item.url);
          if (!/^https?:$/.test(url.protocol)) return [];
          return [
            {
              title: item.title.slice(0, 240),
              url: url.toString(),
              snippet:
                typeof item.content === "string"
                  ? item.content.slice(0, 600)
                  : "",
            },
          ];
        } catch {
          return [];
        }
      })
      .slice(0, 5);
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError")
      throw new Error("Web search timed out.");
    throw error;
  } finally {
    clearTimeout(timer);
  }
}
