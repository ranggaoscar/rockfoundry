import * as cheerio from "cheerio";
import * as dns from "dns";
const dnsPromises = dns.promises;

// ── Safe URL Retrieval ──────────────────────────────────────────

export interface SafeUrlResult {
  success: boolean;
  text?: string;
  title?: string;
  headers?: string[];
  metadata?: Record<string, string>;
  error?: string;
}

const PRIVATE_IP_RANGES = [
  "10.",
  "172.16.",
  "172.17.",
  "172.18.",
  "172.19.",
  "172.20.",
  "172.21.",
  "172.22.",
  "172.23.",
  "172.24.",
  "172.25.",
  "172.26.",
  "172.27.",
  "172.28.",
  "172.29.",
  "172.30.",
  "172.31.",
  "192.168.",
  "127.",
  "0.",
  "169.254.",
];

const ALLOWED_MIME_TYPES = [
  "text/html",
  "text/plain",
  "application/xhtml+xml",
  "application/xml",
];

const MAX_REDIRECTS = 5;
const MAX_RESPONSE_SIZE = 5 * 1024 * 1024; // 5MB
const TIMEOUT_MS = 15000;

function isPrivateHost(hostname: string): boolean {
  return PRIVATE_IP_RANGES.some((prefix) => hostname.startsWith(prefix));
}

function isPrivateIP(ip: string): boolean {
  // Normalize IPv4-mapped IPv6
  const normalized = ip.replace(/^::ffff:/, "");

  // Check IPv4 private ranges
  if (PRIVATE_IP_RANGES.some((prefix) => normalized.startsWith(prefix))) return true;

  // Check IPv6 private/reserved ranges
  if (normalized === "::1") return true; // IPv6 loopback
  if (normalized.startsWith("fc") || normalized.startsWith("fd")) return true; // Unique local
  if (normalized.startsWith("fe80")) return true; // Link-local

  return false;
}

/**
 * Safely retrieve and extract text from a URL.
 * Validates DNS, blocks private IPs, enforces size limits, and sanitizes output.
 */
export async function safeExtractFromUrl(url: string): Promise<SafeUrlResult> {
  // Only HTTP and HTTPS
  if (!url.startsWith("http://") && !url.startsWith("https://")) {
    return { success: false, error: "Only HTTP and HTTPS URLs are supported" };
  }

  let parsedUrl: URL;
  try {
    parsedUrl = new URL(url);
  } catch {
    return { success: false, error: "Invalid URL format" };
  }

  // DNS resolution check
  try {
    const addresses = await dnsResolve(parsedUrl.hostname);
    if (addresses.length === 0) {
      return { success: false, error: "DNS resolution failed: host not found" };
    }

    // Block private and reserved IP ranges
    for (const addr of addresses) {
      if (isPrivateIP(addr)) {
        return { success: false, error: `URL resolves to a private IP range: ${addr}` };
      }
    }
  } catch (err) {
    return { success: false, error: `DNS resolution error: ${(err as Error).message}` };
  }

  // Perform the request with redirect revalidation
  return fetchUrlWithRedirects(parsedUrl, 0);
}

async function dnsResolve(hostname: string): Promise<string[]> {
  try {
    const addresses = await dnsPromises.resolve4(hostname);
    return addresses || [];
  } catch {
    // Try IPv6
    try {
      const addrs6 = await dnsPromises.resolve6(hostname);
      return (addrs6 || []).filter((a) => !a.startsWith("fe80:"));
    } catch {
      return [];
    }
  }
}

async function fetchUrlWithRedirects(url: URL, redirectCount: number): Promise<SafeUrlResult> {
  if (redirectCount > MAX_REDIRECTS) {
    return { success: false, error: `Too many redirects (max ${MAX_REDIRECTS})` };
  }

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetch(url.toString(), {
      signal: controller.signal,
      redirect: "manual", // We handle redirects manually for security
      headers: {
        "User-Agent": "RockFoundry/1.0 ReferenceAnalyzer",
        Accept: "text/html,application/xhtml+xml,application/xml",
      },
    });

    // Handle redirects
    if (response.status >= 300 && response.status < 400) {
      const location = response.headers.get("location");
      if (!location) {
        return { success: false, error: "Redirect without Location header" };
      }

      const redirectUrl = new URL(location, url.origin);

      // Revalidate redirect target
      try {
        const addresses = await dnsResolve(redirectUrl.hostname);
        for (const addr of addresses) {
          if (isPrivateIP(addr)) {
            return { success: false, error: `Redirect target resolves to private IP: ${addr}` };
          }
        }
      } catch {
        return { success: false, error: "Redirect target DNS resolution failed" };
      }

      return fetchUrlWithRedirects(redirectUrl, redirectCount + 1);
    }

    if (!response.ok) {
      return { success: false, error: `HTTP ${response.status}: ${response.statusText}` };
    }

    // MIME type validation
    const contentType = response.headers.get("content-type") || "";
    const primaryMime = contentType.split(";")[0].trim().toLowerCase();
    if (!ALLOWED_MIME_TYPES.includes(primaryMime)) {
      return { success: false, error: `Unsupported content type: ${contentType}` };
    }

    // Content-Length check
    const contentLength = response.headers.get("content-length");
    if (contentLength && parseInt(contentLength, 10) > MAX_RESPONSE_SIZE) {
      return { success: false, error: "Response too large (>5MB)" };
    }

    // Stream and check size
    const reader = response.body?.getReader();
    if (!reader) {
      return { success: false, error: "Response body not readable" };
    }

    const chunks: Uint8Array[] = [];
    let totalSize = 0;

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      totalSize += value.length;
      if (totalSize > MAX_RESPONSE_SIZE) {
        reader.cancel();
        return { success: false, error: "Response too large (>5MB)" };
      }
      chunks.push(value);
    }

    const decoder = new TextDecoder();
    const text = chunks.map((c) => decoder.decode(c, { stream: true })).join("") + decoder.decode();

    return extractVisibleText(text);
  } catch (err: unknown) {
    if (err instanceof DOMException && err.name === "AbortError") {
      return { success: false, error: "Request timed out" };
    }
    return { success: false, error: `Request failed: ${(err as Error).message}` };
  } finally {
    clearTimeout(timeoutId);
  }
}

function extractVisibleText(html: string): SafeUrlResult {
  try {
    const $ = cheerio.load(html);

    // Remove unwanted elements
    $("script, style, noscript, iframe, svg, img, video, audio, link, meta").remove();

    const title = $("title").first().text().trim();
    const description = $('meta[name="description"]').attr("content") || "";

    const headers: string[] = [];
    $("h1, h2, h3, h4").each((_, el) => {
      const text = $(el).text().trim();
      if (text) headers.push(text);
    });

    const bodyText = $("body")
      .text()
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 100000);

    const metadata: Record<string, string> = {};
    if (description) metadata["description"] = description;

    return {
      success: true,
      text: bodyText,
      title,
      headers,
      metadata,
    };
  } catch (err) {
    return { success: false, error: `Text extraction failed: ${(err as Error).message}` };
  }
}

// ── GitHub Repository Analysis ──────────────────────────────────

export interface GitHubRepoInfo {
  owner: string;
  repo: string;
}

export interface GitHubAnalysisResult {
  success: boolean;
  data?: {
    metadata: {
      owner: string;
      name: string;
      description: string | null;
      defaultBranch: string;
      license: string | null;
      stars: number;
      topics: string[];
    };
    languages: Record<string, number>;
    directoryTree: string[];
    structure: {
      hasPackageJson: boolean;
      hasDockerfile: boolean;
      hasCI: boolean;
      appType: string | null;
      framework: string | null;
    };
    keyFiles: Record<string, string>;
  };
  error?: string;
}

const MAX_FILES = 100;
const MAX_TEXT_DOWNLOAD = 500000; // 500KB total
const TEXT_FILE_EXTENSIONS = [
  ".ts", ".tsx", ".js", ".jsx", ".json", ".md", ".yaml", ".yml",
  ".toml", ".css", ".scss", ".html", ".py", ".rs", ".go", ".java",
  ".rb", ".php", ".sh", ".env.example", ".gitignore", ".dockerignore",
  ".config.*", ".prisma", ".sql", ".graphql", ".proto",
];

const EXCLUDED_PATHS = [
  "node_modules", ".git", "dist", "build", ".next", "out",
  "__pycache__", ".venv", "venv", "target", "vendor",
  ".env", ".env.local", ".env.production",
];

/**
 * Validate a GitHub repository URL.
 */
export function parseGitHubUrl(url: string): GitHubRepoInfo | null {
  const match = url.match(/^https?:\/\/github\.com\/([^/]+)\/([^/]+?)(?:\/|$|\.git)/);
  if (!match) return null;
  return { owner: match[1], repo: match[2].replace(/\.git$/, "") };
}

/**
 * Analyze a public GitHub repository using GitHub's public APIs.
 */
export async function analyzeGitHubRepo(
  repo: GitHubRepoInfo
): Promise<GitHubAnalysisResult> {
  const { owner, repo: repoName } = repo;

  try {
    // Fetch repository metadata
    const repoRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}`,
      {
        headers: {
          Accept: "application/vnd.github.v3+json",
          "User-Agent": "RockFoundry/1.0",
        },
      }
    );

    if (!repoRes.ok) {
      if (repoRes.status === 404) {
        return { success: false, error: "Repository not found or is private" };
      }
      if (repoRes.status === 403) {
        return { success: false, error: "GitHub API rate limit exceeded. Try again later." };
      }
      return { success: false, error: `GitHub API error: ${repoRes.status}` };
    }

    const repoData = await repoRes.json();

    // Fetch languages
    const langRes = await fetch(repoData.languages_url, {
      headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "RockFoundry/1.0" },
    });
    const languages: Record<string, number> = langRes.ok ? await langRes.json() : {};

    // Fetch file tree via Git Trees API
    const treeRes = await fetch(
      `https://api.github.com/repos/${owner}/${repoName}/git/trees/${repoData.default_branch}?recursive=1`,
      {
        headers: { Accept: "application/vnd.github.v3+json", "User-Agent": "RockFoundry/1.0" },
      }
    );

    const tree: { path: string; type: string }[] = [];
    let fileCount = 0;

    if (treeRes.ok) {
      const treeData = await treeRes.json();
      for (const node of treeData.tree || []) {
        if (node.type === "blob") {
          const isExcluded = EXCLUDED_PATHS.some((p) => node.path.startsWith(p));
          const isTextFile = TEXT_FILE_EXTENSIONS.some((ext) => node.path.endsWith(ext.replace("*", "")));
          if (!isExcluded && isTextFile && fileCount < MAX_FILES) {
            tree.push(node);
            fileCount++;
          }
        }
      }
    }

    // Fetch key files
    const keyFiles: Record<string, string> = {};
    const priorityFiles = [
      "package.json", "tsconfig.json", ".env.example", "Dockerfile",
      "docker-compose.yml", "README.md", "next.config.js", "next.config.ts",
      "vite.config.ts", "requirements.txt", "Cargo.toml", "go.mod",
      "pom.xml", "build.gradle", "Gemfile", "Podfile",
    ];

    let totalTextSize = 0;

    for (const file of tree) {
      if (totalTextSize > MAX_TEXT_DOWNLOAD) break;

      const isPriority = priorityFiles.some((pf) => file.path === pf || file.path.endsWith("/" + pf));

      if (isPriority || file.path.split("/").length <= 2) {
        const contentRes = await fetch(
          `https://raw.githubusercontent.com/${owner}/${repoName}/${repoData.default_branch}/${file.path}`,
          {
            headers: { "User-Agent": "RockFoundry/1.0" },
          }
        );

        if (contentRes.ok) {
          const text = await contentRes.text();
          if (text.length < 100000) {
            // 100KB per file max
            keyFiles[file.path] = text.substring(0, 10000); // truncate to 10KB
            totalTextSize += text.length;
          }
        }
      }
    }

    // Detect structure
    const hasPackageJson = !!keyFiles["package.json"];
    const hasDockerfile = !!keyFiles["Dockerfile"];
    const hasCI = tree.some((f) => f.path.startsWith(".github/workflows"));

    let appType: string | null = null;
    if (hasPackageJson) {
      try {
        const pkg = JSON.parse(keyFiles["package.json"]);
        if (pkg.dependencies?.next || pkg.devDependencies?.next) appType = "Next.js";
        else if (pkg.dependencies?.react || pkg.devDependencies?.react) appType = "React";
        else if (pkg.dependencies?.express) appType = "Express";
        else appType = "Node.js";
      } catch {
        appType = "Node.js";
      }
    } else if (keyFiles["requirements.txt"]) appType = "Python";
    else if (keyFiles["Cargo.toml"]) appType = "Rust";
    else if (keyFiles["go.mod"]) appType = "Go";
    else if (keyFiles["pom.xml"] || keyFiles["build.gradle"]) appType = "Java";

    return {
      success: true,
      data: {
        metadata: {
          owner,
          name: repoName,
          description: repoData.description,
          defaultBranch: repoData.default_branch,
          license: repoData.license?.spdx_id || null,
          stars: repoData.stargazers_count,
          topics: repoData.topics || [],
        },
        languages,
        directoryTree: tree.map((t) => t.path),
        structure: {
          hasPackageJson,
          hasDockerfile,
          hasCI,
          appType,
          framework: hasPackageJson ? appType : null,
        },
        keyFiles,
      },
    };
  } catch (err) {
    return { success: false, error: `Analysis failed: ${(err as Error).message}` };
  }
}
