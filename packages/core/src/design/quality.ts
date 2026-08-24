import type { DesignScreen, DesignSpec } from "../schema/design";

export type QualityValidation = {
  accepted: boolean;
  score: number;
  reasons: string[];
  areas: Record<string, boolean>;
};

export function validatePrototypeQuality(
  files: Array<{ path: string; content: string }>,
  screens: DesignScreen[],
  spec?: DesignSpec,
): QualityValidation {
  const html = files.find((file) => file.path === "index.html")?.content || "";
  const css = files.find((file) => file.path === "styles.css")?.content || "";
  const js = files.find((file) => file.path === "app.js")?.content || "";
  const areas = {
    screenCoverage: screens.length > 0 && screens.every((screen) => html.includes(screen.route) || js.includes(screen.route)),
    navigationCoverage: /<nav\b/i.test(html) && /href\s*=|addEventListener/i.test(js + html),
    meaningfulContent: screens.length > 0 && screens.every((screen) => html.includes(screen.name) || html.includes(screen.purpose.split(" ")[0])),
    interactionPresence: /<button\b|<input\b|addEventListener\s*\(/i.test(html + js),
    responsiveImplementation: /@media\b/i.test(css),
    visualHierarchy: /font-size|font-weight|line-height/i.test(css) && /h1|h2|h3/i.test(html),
    styledControls: /button|input|select|textarea/i.test(css),
    typographyTreatment: /font-family|letter-spacing/i.test(css),
    layoutDensity: /display\s*:\s*(grid|flex)|gap\s*:/i.test(css),
    designSpecAdherence: Boolean(spec) && (!spec || spec.components.length === 0 || spec.components.some((component) => html.toLowerCase().includes(component.toLowerCase()))),
    noDefaultBrowserStyling: !/<a\b[^>]*>/.test(html) || /color\s*:|text-decoration\s*:/i.test(css),
    noDecorativeFirstLayout: html.length >= 250 && css.length >= 120 && /<section\b|<article\b|<form\b/i.test(html),
  };
  const reasons = Object.entries(areas).filter(([, passed]) => !passed).map(([area]) => `Quality area failed: ${area}`);
  const score = Math.round((Object.values(areas).filter(Boolean).length / Object.keys(areas).length) * 100);
  return { accepted: reasons.length === 0, score, reasons, areas };
}

export function evaluateDesignQualityAfterRepair(
  initial: QualityValidation,
  repaired: QualityValidation | null,
) {
  return repaired || initial;
}

export type { DesignScreen, DesignSpec } from "../schema/design";