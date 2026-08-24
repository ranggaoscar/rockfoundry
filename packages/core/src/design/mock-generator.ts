import type { ProjectState } from "../schema/project";
import {
  DesignGenerationResultSchema,
  type DesignGenerationResult,
  type DesignScreen,
  type DesignSpec,
} from "../schema/design";
import { evaluateDesignReadiness } from "./readiness";
import { deriveScreenMap } from "./screen-map";

function escape(value: string) {
  return value.replace(
    /[&<>"]/g,
    (char) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" })[char] || char,
  );
}

function compactClass(request?: string) {
  return /compact/i.test(request || "") ? " rf-compact" : "";
}

export function buildDesignSpec(
  state: ProjectState,
  screens: DesignScreen[],
): DesignSpec {
  const readiness = evaluateDesignReadiness(state);
  return {
    productName: state.name,
    direction: {
      mood: "quiet-technical",
      tone: "clear and restrained",
      density: state.studio.direction.density || "comfortable",
      platform: "responsive web",
      shell: "workspace shell",
      navigation: "sidebar",
      visualKeywords: ["hairline", "system-type", "low-elevation"],
      references: state.studio.direction.references,
    },
    informationArchitecture: screens.map(
      (screen) => `${screen.name} (${screen.route})`,
    ),
    navigation: "Persistent product shell with actor-grouped sidebar.",
    visualHierarchy:
      "Screen title, supporting meta, then primary work surface.",
    density: state.studio.direction.density || "comfortable",
    typography: "System UI, tight tracking on labels, readable body at 14px.",
    spacing: "8px rhythm; 24px page padding; 12px card padding.",
    surfaces: "Paper surface on quiet gray; 1px hairline borders; no glow.",
    controls: "Text buttons and quiet primary actions; no neon CTA blocks.",
    components: ["app-shell", "sidebar", "job-card", "apply-cta", "data-table"],
    screenContent: screens.map((screen) => ({
      screenId: screen.id,
      hierarchy: [screen.name, screen.purpose],
    })),
    responsive:
      "Sidebar collapses below 768px; bottom tabs on 390px viewports.",
    interactions: ["hash routing", "screen switch", "component select"],
    states:
      readiness.unresolved.length > 0
        ? readiness.unresolved.map((item) => `Assumption: ${item}`)
        : ["Default populated demo state"],
    tokens: {
      typography: "system scale",
      spacing: "8px rhythm",
      radius: "subtle",
      surfaces: "quiet layered surfaces",
      bordersElevation: "hairline borders, low elevation",
      semanticStates: "clear neutral, success, warning, and error states",
    },
    layout: {
      shellStructure: "shared shell with primary work surface",
      contentWidth: "readable max width",
      desktopNavigation: "persistent sidebar",
      mobileNavigation: "compact menu",
      responsiveBehavior: "stack content and preserve primary action",
    },
    componentsV2: [
      { name: "app-shell", purpose: "Shared navigation and workspace frame", variants: ["desktop", "mobile"], stateNotes: "Navigation remains available on every route." },
      { name: "primary-action", purpose: "Expose the confirmed next workflow action", variants: ["filled", "quiet"], stateNotes: "Disabled while unavailable." },
    ],
    screensV2: screens.map((screen) => ({
      screenId: screen.id,
      hierarchy: [screen.name, screen.purpose],
      primaryAction: screen.primaryAction || "Review confirmed context.",
      secondaryActions: [],
      keyContent: screen.entityIds || [],
      components: ["app-shell", "primary-action"],
      emptyState: "No confirmed records yet.",
      loadingState: "Loading confirmed context.",
      errorState: "Unable to load this local prototype state.",
      mobileAdaptation: "Stack content and keep the primary action visible.",
    })),
  };
}

export function generateMockPrototype(
  state: ProjectState,
  input: { request?: string } = {},
): DesignGenerationResult {
  const screens = deriveScreenMap(state);
  const spec = buildDesignSpec(state, screens);
  const compact = compactClass(input.request);
  const hidePostJob = !screens.some((screen) => screen.id === "employer-jobs");
  const nav = screens
    .map(
      (screen) =>
        `<a href="${screen.route}" data-rf-component="nav-${screen.id}">${escape(screen.name)}</a>`,
    )
    .join("");
  const views = screens
    .map((screen) => {
      const inferred =
        screen.source === "INFERRED"
          ? `<p class="rf-note">Inferred screen — not a confirmed product rule.</p>`
          : "";
      const post =
        screen.id === "employer-jobs" && !hidePostJob
          ? `<button data-rf-component="post-job">Post Job</button>`
          : "";
      const card =
        screen.id === "job-discover"
          ? `<article class="rf-card" data-rf-component="job-card"><h2>Product Designer</h2><p>Jakarta · Remote-friendly</p><button data-rf-component="apply-cta">Apply</button></article>`
          : screen.id === "employer-dashboard"
            ? `<section class="rf-card" data-rf-component="employer-dashboard"><h2>Hiring pulse</h2><p>3 roles open · 12 candidates waiting.</p></section>`
            : `<section class="rf-card" data-rf-component="${screen.id}"><h2>${escape(screen.name)}</h2><p>${escape(screen.purpose)}</p>${post}</section>`;
      return `<section data-screen="${screen.route}">${inferred}${card}</section>`;
    })
    .join("");

  const html = `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escape(state.name)} prototype</title>
  <link rel="stylesheet" href="styles.css">
</head>
<body class="${compact.trim()}">
  <div class="rf-shell">
    <aside class="rf-sidebar" data-rf-component="sidebar">
      <p class="rf-brand">${escape(state.name)}</p>
      <nav aria-label="Product">${nav}</nav>
    </aside>
    <main id="app">${views}</main>
  </div>
  <nav class="rf-tabs" aria-label="Mobile">${nav}</nav>
  <script src="app.js"></script>
</body>
</html>`;

  const css = `*{box-sizing:border-box}body{margin:0;font:14px/1.45 system-ui,sans-serif;background:#f4f2ee;color:#161513}
.rf-shell{display:flex;min-height:100vh}
.rf-sidebar{width:220px;padding:20px 16px;border-right:1px solid #ddd6cb;background:#faf8f4}
.rf-brand{font-weight:650;letter-spacing:-.02em;margin:0 0 16px}
nav a{display:block;padding:8px 10px;color:#161513;text-decoration:none;border-radius:6px}
nav a[aria-current="page"]{background:#ece7df}
main{flex:1;padding:24px}
.rf-card{background:#fff;border:1px solid #ddd6cb;padding:16px;border-radius:8px;max-width:560px}
.rf-note{color:#6b645b;font-size:12px}
.rf-tabs{display:none}
.rf-compact .rf-card{padding:10px}
.rf-compact .rf-sidebar{width:176px}
button{border:1px solid #161513;background:#161513;color:#fff;padding:8px 12px;border-radius:6px}
@media (max-width:768px){.rf-sidebar{display:none}.rf-tabs{display:flex;gap:8px;padding:10px;border-top:1px solid #ddd6cb;position:sticky;bottom:0;background:#faf8f4}}
@media (max-width:390px){main{padding:16px}.rf-card{padding:12px}}`;

  const routes = JSON.stringify(screens.map((screen) => screen.route));
  const js = `const routes = ${routes};
function show(hash){
  const target = routes.includes(hash) ? hash : routes[0];
  document.querySelectorAll("[data-screen]").forEach((node) => {
    node.hidden = node.getAttribute("data-screen") !== target;
  });
  document.querySelectorAll("nav a").forEach((link) => {
    link.setAttribute("aria-current", link.getAttribute("href") === target ? "page" : "false");
  });
}
window.addEventListener("hashchange", () => show(location.hash || routes[0]));
document.addEventListener("click", (event) => {
  const node = event.target.closest("[data-rf-component]");
  if (!node) return;
  parent.postMessage({
    type: "rf-select",
    componentId: node.getAttribute("data-rf-component"),
    screen: location.hash || routes[0]
  }, "*");
});
show(location.hash || routes[0]);`;

  const assumptions = evaluateDesignReadiness(state).unresolved;
  return DesignGenerationResultSchema.parse({
    designSpec: spec,
    screenMap: screens,
    files: [
      { path: "index.html", content: html },
      { path: "styles.css", content: css },
      { path: "app.js", content: js },
    ],
    summary: `Generated ${screens.length} screens from confirmed product structure.`,
    assumptions,
  });
}

export function applyVisualRevision(
  current: DesignGenerationResult,
  request: string,
): DesignGenerationResult {
  if (!/compact/i.test(request)) return current;
  const nextCss = current.files.map((file) =>
    file.path === "styles.css"
      ? {
          ...file,
          content: `${file.content}\nbody,.rf-card{padding:8px}.rf-sidebar{width:168px}`,
        }
      : file,
  );
  return {
    ...current,
    files: nextCss,
    summary: "Made the employer workspace more compact.",
  };
}
