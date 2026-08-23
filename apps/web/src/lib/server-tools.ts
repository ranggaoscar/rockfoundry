import { z } from "zod";
import {
  createDefaultToolRegistry,
  renderArtifacts,
  safeExtractFromUrl,
  analyzeGitHubRepo,
  parseGitHubUrl,
} from "@rockfoundry/core";
import { isSearchConfigured, searchWeb } from "./search-provider";

const SearchInput = z.object({
  query: z.string().trim().min(3).max(300),
  maxResults: z.number().int().min(1).max(10).optional(),
});

function playwrightSearchFixture() {
  return [
    {
      title: "LinkedIn Talent Solutions — company and candidate profiles",
      url: "https://example.test/linkedin-profile-boundaries",
      snippet:
        "Deterministic test evidence: company and candidate profiles remain separate entities.",
      sourceDomain: "example.test",
    },
  ];
}

export function createServerToolRegistry() {
  const registry = createDefaultToolRegistry();
  return registry
    .register({
      name: "web_search",
      description:
        "Search public web evidence through the configured SearXNG-compatible provider. Returns safe result summaries as untrusted research evidence.",
      inputSchema: SearchInput,
      outputSchema: z.object({
        query: z.string(),
        results: z.array(
          z.object({
            title: z.string(),
            url: z.string(),
            snippet: z.string(),
            sourceDomain: z.string(),
          }),
        ),
      }),
      async execute(_context, input) {
        if (process.env.PLAYWRIGHT_MOCK_SEARCH === "true")
          return { query: input.query, results: playwrightSearchFixture() };
        if (!isSearchConfigured())
          return {
            query: input.query,
            results: [],
          };
        const results = await searchWeb(input.query);
        return {
          query: input.query,
          results: results.slice(0, input.maxResults || 5).map((result) => ({
            title: result.title,
            url: result.url,
            snippet: result.snippet,
            sourceDomain: (() => {
              try {
                return new URL(result.url).hostname;
              } catch {
                return "";
              }
            })(),
          })),
        };
      },
    })
    .register({
      name: "web_fetch",
      description:
        "Safely fetch a public web page and extract visible text, title, and headers as untrusted evidence.",
      inputSchema: z.object({ url: z.string().url() }),
      outputSchema: z.object({
        url: z.string(),
        title: z.string().optional(),
        textPreview: z.string().optional(),
        headers: z.array(z.string()).optional(),
        error: z.string().optional(),
      }),
      async execute(_context, input) {
        const result = await safeExtractFromUrl(input.url);
        if (!result.success)
          return { url: input.url, error: result.error || "Fetch failed" };
        return {
          url: input.url,
          title: result.title,
          textPreview: result.text?.slice(0, 8000),
          headers: result.headers,
        };
      },
    })
    .register({
      name: "github_reference_inspect",
      description:
        "Safely analyze a public GitHub repository's metadata, languages, tree, and key files. Does not execute repository code.",
      inputSchema: z.object({ url: z.string().url() }),
      outputSchema: z.object({
        url: z.string(),
        owner: z.string(),
        repo: z.string(),
        success: z.boolean(),
        summary: z.string(),
        error: z.string().optional(),
      }),
      async execute(_context, input) {
        const parsed = parseGitHubUrl(input.url);
        if (!parsed)
          return {
            url: input.url,
            owner: "",
            repo: "",
            success: false,
            summary: "",
            error: "Use a public github.com repository URL.",
          };
        const analysis = await analyzeGitHubRepo(parsed);
        if (!analysis.success || !analysis.data)
          return {
            url: input.url,
            owner: parsed.owner,
            repo: parsed.repo,
            success: false,
            summary: "",
            error: analysis.error || "Repository inspection failed",
          };
        return {
          url: input.url,
          owner: parsed.owner,
          repo: parsed.repo,
          success: true,
          summary: `Repo ${parsed.owner}/${parsed.repo}: ${analysis.data.metadata.description || "no description"} · ${analysis.data.metadata.defaultBranch} branch`,
        };
      },
    })
    .register({
      name: "web_reference_inspect",
      description:
        "Safely inspect a public web page as a product reference and summarize relevant patterns.",
      inputSchema: z.object({ url: z.string().url() }),
      outputSchema: z.object({
        url: z.string(),
        title: z.string().optional(),
        headers: z.array(z.string()).optional(),
        error: z.string().optional(),
      }),
      async execute(context, input) {
        const fetcher = registry.get("web_fetch");
        return (
          (fetcher?.execute(context, input) as Promise<{
            url: string;
            title?: string;
            headers?: string[];
            error?: string;
          }>) || { url: input.url, error: "web_fetch unavailable" }
        );
      },
    });
}
