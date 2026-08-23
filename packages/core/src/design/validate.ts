import {
  ALLOWED_PROTOTYPE_PATHS,
  DesignGenerationResultSchema,
  type DesignGenerationResult,
  type DesignScreen,
} from "../schema/design";

const MAX_FILE_BYTES = 180_000;

const UNSAFE_PATTERNS: Array<{ id: string; pattern: RegExp }> = [
  { id: "external-script", pattern: /<script[^>]+src\s*=\s*["']https?:/i },
  { id: "external-style", pattern: /<link[^>]+href\s*=\s*["']https?:/i },
  { id: "iframe", pattern: /<iframe\b/i },
  { id: "object", pattern: /<object\b/i },
  { id: "embed", pattern: /<embed\b/i },
  { id: "top-nav", pattern: /window\.top\s*\./i },
  { id: "parent-nav", pattern: /window\.parent\s*\.location/i },
  { id: "fetch", pattern: /\bfetch\s*\(/i },
  { id: "xhr", pattern: /\bXMLHttpRequest\b/i },
  { id: "websocket", pattern: /\bWebSocket\b/i },
];

export type PrototypeValidation = {
  accepted: boolean;
  reasons: string[];
};

export function validatePrototypeFiles(
  files: Array<{ path: string; content: string }>,
  screens: DesignScreen[] = [],
): PrototypeValidation {
  const reasons: string[] = [];
  const byPath = new Map(files.map((file) => [file.path, file.content]));
  for (const required of ALLOWED_PROTOTYPE_PATHS) {
    if (!byPath.has(required))
      reasons.push(`Missing required file: ${required}`);
  }
  for (const file of files) {
    if (!(ALLOWED_PROTOTYPE_PATHS as readonly string[]).includes(file.path))
      reasons.push(`Unsafe prototype path: ${file.path}`);
    if (
      file.path.includes("..") ||
      file.path.startsWith("/") ||
      file.path.includes("\\")
    )
      reasons.push(`Unsafe prototype path: ${file.path}`);
    if (file.content.length > MAX_FILE_BYTES)
      reasons.push(
        `${file.path} exceeds the ${MAX_FILE_BYTES} character limit.`,
      );
    for (const rule of UNSAFE_PATTERNS) {
      if (rule.pattern.test(file.content))
        reasons.push(`${file.path} contains blocked pattern: ${rule.id}`);
    }
  }
  const html = byPath.get("index.html") || "";
  const css = byPath.get("styles.css") || "";
  const js = byPath.get("app.js") || "";
  if (html && !/<main\b/i.test(html))
    reasons.push("index.html is missing a main landmark.");
  if (html && !/<nav\b/i.test(html))
    reasons.push("index.html is missing shared navigation.");
  if (css && !/@media/.test(css))
    reasons.push("styles.css is missing responsive behavior.");
  for (const screen of screens) {
    if (!html.includes(screen.route) && !js.includes(screen.route))
      reasons.push(`Prototype is missing screen route ${screen.route}.`);
  }
  return { accepted: reasons.length === 0, reasons };
}

export function parseDesignGeneration(raw: unknown): DesignGenerationResult {
  return DesignGenerationResultSchema.parse(raw);
}
