import * as cheerio from "cheerio";
import { ProjectStateSchema } from "../schema";

export async function extractTextFromUrl(url: string): Promise<string> {
  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 15000); // 15s timeout
  
  try {
    const res = await fetch(url, {
      signal: controller.signal,
      headers: {
        "User-Agent": "RockFoundry/1.0 ReferenceAnalyzer",
        "Accept": "text/html,application/xhtml+xml,application/xml"
      }
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const contentType = res.headers.get("content-type") || "";
    if (!contentType.includes("text/html") && !contentType.includes("text/plain")) {
      throw new Error(`Unsupported content type: ${contentType}`);
    }

    const sizeStr = res.headers.get("content-length");
    if (sizeStr && parseInt(sizeStr, 10) > 5 * 1024 * 1024) {
      throw new Error("Response too large (>5MB)");
    }

    const text = await res.text();
    if (text.length > 5 * 1024 * 1024) {
      throw new Error("Response too large (>5MB)");
    }

    const $ = cheerio.load(text);
    
    // Remove unwanted tags
    $("script, style, noscript, iframe, svg, img, video, audio").remove();

    // Extract structure
    const title = $("title").text().trim();
    const headers: string[] = [];
    $("h1, h2, h3").each((_, el) => {
      headers.push($(el).text().trim());
    });

    const bodyText = $("body").text()
      .replace(/\s+/g, " ")
      .trim()
      .substring(0, 100000); // Hard limit on extracted text

    return `TITLE: ${title}\n\nHEADERS:\n${headers.join("\n")}\n\nCONTENT:\n${bodyText}`;
  } finally {
    clearTimeout(timeoutId);
  }
}
