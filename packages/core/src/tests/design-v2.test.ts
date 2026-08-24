import { describe, expect, it } from "vitest";
import { createInitialProjectState } from "../schema/project";
import { deriveScreenMap } from "../design/screen-map";
import {
  DesignSpecSchema,
  DesignStateSchema,
  PrototypeGenerationOutputSchema,
} from "../schema/design";
import { ProjectStateSchema } from "../schema/project";
import { generateExport } from "../export/generator";
import { validatePrototypeFiles } from "../design/validate";
import { validatePrototypeQuality } from "../design/quality";
import JSZip from "jszip";

describe("Design Engine V2", () => {
  it("derives task screens from entities and workflows instead of actor Home", () => {
    const state = createInitialProjectState({ id: "v2", name: "Warteg", rawIdea: "Kasir" });
    state.targetUsers = ["kasir"];
    state.entities = ["pesanan", "menu"];
    state.workflows = ["mencatat pesanan", "melihat status pesanan"];
    const screens = deriveScreenMap(state);
    expect(screens.map((screen) => screen.id)).toEqual([
      "workspace-overview",
      "entity-list",
      "entity-detail",
    ]);
    expect(screens.every((screen) => screen.truthReferences)).toBe(true);
    expect(screens.some((screen) => screen.name.endsWith("Home"))).toBe(false);
  });

  it("keeps old DesignSpec payload parseable while accepting V2 additions", () => {
    const parsed = DesignSpecSchema.parse({
      productName: "Legacy",
      direction: {},
      navigation: "sidebar",
      visualHierarchy: "clear",
      density: "comfortable",
      typography: "system",
      spacing: "4px scale",
      surfaces: "flat",
      controls: "styled",
      responsive: "mobile",
    });
    expect(parsed.productName).toBe("Legacy");
  });

  it("rejects an ugly but safety-valid prototype", () => {
    const state = createInitialProjectState({ id: "ugly", name: "Kasir", rawIdea: "Kasir" });
    state.entities = ["pesanan"];
    state.workflows = ["mencatat pesanan"];
    const screens = deriveScreenMap(state);
    const links = screens.map((screen) => `<a href="${screen.route}">${screen.name}</a>`).join("");
    const files = [
      { path: "index.html", content: `<main><nav>${links}</nav><div class="blob"></div><h1>THE FUTURE OF EVERYTHING</h1></main>` },
      { path: "styles.css", content: ".blob{width:500px;height:500px;border-radius:50%;background:#ddd;} @media(max-width:600px){}" },
      { path: "app.js", content: "" },
    ];
    expect(validatePrototypeFiles(files, screens).accepted).toBe(true);
    const quality = validatePrototypeQuality(files, screens);
    expect(quality.accepted).toBe(false);
    expect(quality.areas.interactionPresence).toBe(false);
  });

  it("accepts a grounded application shell with styled controls", () => {
    const state = createInitialProjectState({ id: "good", name: "Kasir", rawIdea: "Kasir" });
    state.entities = ["pesanan"];
    state.workflows = ["mencatat pesanan"];
    const screens = deriveScreenMap(state);
    const links = screens.map((screen) => `<a href="${screen.route}">${screen.name}</a>`).join("");
    const files = [
      { path: "index.html", content: `<main><nav>${links}</nav><section><h1>Kasir</h1><h2>Pesanan</h2><p>Kelola pesanan aktif.</p><button data-action="create">Tambah pesanan</button><input aria-label="Cari pesanan" /></section></main>` },
      { path: "styles.css", content: `:root{font-family:system-ui;} main{display:flex;gap:24px;} section{display:grid;gap:12px;} h1{font-size:32px;font-weight:700;line-height:1.2;} button{background:#111;color:#fff;padding:10px;border-radius:6px;} input{border:1px solid #bbb;padding:8px;} @media(max-width:600px){main{display:block;}} /* deliberate spacing and surface tokens for the shell */ .card{padding:24px;border:1px solid #ddd;border-radius:8px;box-shadow:0 2px 8px #0001;} .muted{color:#667085;} .primary{background:#111;color:#fff;} .stack{display:flex;flex-direction:column;gap:16px;} .table{width:100%;border-collapse:collapse;} .status{font-weight:600;} .toolbar{display:flex;align-items:center;justify-content:space-between;} .content{max-width:960px;margin:0 auto;padding:32px;} .sidebar{width:240px;} .surface{background:#fff;} .border{border:1px solid #ddd;} .elevation{box-shadow:0 1px 3px #0001;} .space{margin-bottom:16px;} .label{font-size:12px;letter-spacing:.04em;} .body{font-size:14px;line-height:1.5;} .responsive{min-width:0;} .focus{outline:2px solid #555;} .empty{padding:32px;} .loading{opacity:.7;} .error{color:#b42318;} .nav{display:flex;gap:12px;} .header{display:flex;align-items:center;} .footer{margin-top:48px;} .grid{display:grid;grid-template-columns:repeat(2,1fr);gap:16px;} .mobile{display:none;} .desktop{display:block;} .density{padding:20px;} .token{border-radius:6px;} .control{min-height:40px;} .row{display:flex;gap:8px;} .caption{font-size:12px;} .meta{color:#667085;} .divider{border-top:1px solid #ddd;} .icon{width:20px;height:20px;} .link{color:#111;text-decoration:underline;} .action{cursor:pointer;} .panel{padding:20px;} .list{display:grid;gap:8px;} .detail{padding:24px;} .section{margin-bottom:24px;} .hero{padding:24px;} .wrap{flex-wrap:wrap;} .small{font-size:12px;} .large{font-size:20px;} .medium{font-size:16px;} .hidden{display:none;} .visible{display:block;} .safe{color:#067647;} .warning{color:#b54708;} .neutral{color:#344054;} .radius{border-radius:8px;} .surface2{background:#f8fafc;} .surface3{background:#f2f4f7;} .border2{border-color:#d0d5dd;} .shadow{box-shadow:0 4px 12px #0001;} .container{max-width:1200px;margin:auto;} .page{min-height:100vh;} .form{display:grid;gap:12px;} .input{width:100%;} .button{font-weight:600;} .table-cell{padding:12px;} .tab{padding:8px 12px;} .active{background:#f2f4f7;} .disabled{opacity:.5;} .focus-ring:focus{outline:2px solid #444;} .sr-only{position:absolute;width:1px;height:1px;overflow:hidden;} .desktop-only{display:block;} .mobile-only{display:none;} .break{word-break:break-word;} .truncate{overflow:hidden;text-overflow:ellipsis;} .space-lg{margin:32px;} .space-sm{margin:8px;} .line{height:1px;background:#ddd;} .topbar{height:56px;} .content-area{padding:24px;} .stack-lg{gap:24px;} .shell{display:flex;} .work{flex:1;} .sidebar-link{padding:8px;} .selected{background:#eee;} .success{color:#067647;} .danger{color:#b42318;} .info{color:#175cd3;} .warning-bg{background:#fffaeb;} .success-bg{background:#ecfdf3;} .neutral-bg{background:#f9fafb;} .outline{background:transparent;} .compact{padding:8px;} .spacious{padding:32px;} .strong{font-weight:700;} .regular{font-weight:400;} .thin{font-weight:300;} .left{text-align:left;} .right{text-align:right;} .center{text-align:center;} .rule{border-bottom:1px solid #ddd;} .card-grid{display:grid;gap:16px;} .footer-note{font-size:12px;} @media(max-width:600px){main{display:block;}}` },
      { path: "app.js", content: `document.querySelector('[data-action=\\"create\\"]').addEventListener('click',()=>{});` },
    ];
    const quality = validatePrototypeQuality(files, screens, { components: ["button"], tokens: {}, layout: {}, direction: {}, productName: "Kasir", informationArchitecture: [], navigation: "", visualHierarchy: "", density: "", typography: "", spacing: "", surfaces: "", controls: "", screenContent: [], responsive: "", interactions: [], states: [] } as never);
    expect(quality.reasons).toEqual([]);
  });

  it("supports explicit V2 defaults and additions", () => {
    const parsed = DesignSpecSchema.parse({ productName: "V2", navigation: "sidebar", visualHierarchy: "clear", density: "comfortable", typography: "system", spacing: "4px", surfaces: "layered", controls: "styled", responsive: "stacked" });
    expect(parsed.tokens.typography).toBe("system scale");
    expect(parsed.layout.mobileNavigation).toBe("compact menu");
    expect(parsed.componentsV2).toEqual([]);
    expect(parsed.screensV2).toEqual([]);

    const enriched = DesignSpecSchema.parse({
      productName: "V2 enriched",
      navigation: "sidebar",
      visualHierarchy: "clear",
      density: "comfortable",
      typography: "system",
      spacing: "4px",
      surfaces: "layered",
      controls: "styled",
      responsive: "stacked",
      tokens: { radius: "12px" },
      layout: { mobileNavigation: "bottom bar" },
      screensV2: [{ screenId: "overview", primaryAction: "Create" }],
    });
    expect(enriched.tokens.radius).toBe("12px");
    expect(enriched.tokens.typography).toBe("system scale");
    expect(enriched.layout.mobileNavigation).toBe("bottom bar");
    expect(enriched.screensV2[0]).toMatchObject({
      screenId: "overview",
      primaryAction: "Create",
    });
  });

  it("parses legacy DesignState and supplies safe defaults", () => {
    const parsed = DesignStateSchema.parse({ status: "DRAFT", currentVersion: 1 });
    expect(parsed.screenMap).toEqual([]);
    expect(parsed.readiness.level).toBe("BLOCKED");
    expect(parsed.direction.navigation).toBe("sidebar");
    expect(parsed.activeScreenId).toBeNull();
  });

  it("parses legacy DesignSpec V1 and additive V2 fields together", () => {
    const parsed = DesignSpecSchema.parse({ productName: "Legacy V1", navigation: "tabs", visualHierarchy: "clear", density: "dense", typography: "system", spacing: "8px", surfaces: "cards", controls: "buttons", responsive: "stack", componentsV2: [{ name: "Table", purpose: "show records" }] });
    expect(parsed.productName).toBe("Legacy V1");
    expect(parsed.componentsV2[0]?.name).toBe("Table");
    expect(parsed.componentsV2[0]?.variants).toEqual([]);
  });

  it("keeps old prototype artifacts readable", () => {
    const artifact = PrototypeGenerationOutputSchema.parse({ files: [
      { path: "index.html", content: "<main>legacy</main>" },
      { path: "styles.css", content: "main{}" },
      { path: "app.js", content: "" },
    ], summary: "legacy artifact" });
    expect(artifact.files.map((file) => file.path)).toEqual(["index.html", "styles.css", "app.js"]);
  });

  it("keeps legacy handoff/export structure valid", async () => {
    const result = await generateExport(createInitialProjectState({ id: "handoff", name: "Legacy", rawIdea: "Legacy" }));
    expect(result.documents).toMatchObject({ BRD: expect.any(String), PRD: expect.any(String), ERD: expect.any(String), AGENT_HANDOFF: expect.any(String) });
    expect(result.metadata.fileCount).toBeGreaterThanOrEqual(10);
    expect(result.documents.AGENT_HANDOFF).toContain("DO_NOT_INVENT.md");
    expect(result.documents.AGENT_HANDOFF).toContain("The approved prototype, when included");
  });

  it("ships a coding-agent-ready package without a prototype", async () => {
    const result = await generateExport(
      createInitialProjectState({ id: "package-first", name: "Package First", rawIdea: "Kasir" }),
    );
    const zip = await JSZip.loadAsync(result.buffer);
    const names = Object.keys(zip.files);
    expect(names).toEqual(expect.arrayContaining([
      "README.md",
      "AGENT_HANDOFF.md",
      "product/BRD.md",
      "product/PRD.md",
      "product/ERD.md",
      "decisions/DO_NOT_INVENT.md",
      "decisions/INVARIANTS.md",
      "decisions/READINESS.md",
      "design/DESIGN_SPEC.json",
      "design/SCREEN_MAP.json",
      "design/DESIGN_DECISIONS.md",
    ]));
    expect(names.some((name) => name.startsWith("design/prototype/"))).toBe(false);
    expect(await zip.file("README.md")?.async("string")).toMatch(/prototype is optional/i);
    expect(await zip.file("AGENT_HANDOFF.md")?.async("string")).toContain("Product Truth is authoritative");
  });

  it("round-trips a complete legacy DesignState without requiring V2-only fields", () => {
    const parsed = DesignStateSchema.parse({
      status: "APPROVED",
      readiness: { level: "READY", score: 100, blockers: [], unresolved: [] },
      direction: { mood: "editorial", navigation: "tabs" },
      screenMap: [{ id: "overview", name: "Overview", purpose: "Review work", route: "#/overview" }],
      activeScreenId: "overview",
      currentVersion: 1,
      approvedVersion: 1,
      approvedAt: "2026-08-24T00:00:00.000Z",
      stale: false,
      staleScreens: [],
      debt: { unresolved: [], count: 0 },
      revisions: [],
      assumptions: [],
    });
    expect(parsed.status).toBe("APPROVED");
    expect(parsed.screenMap[0]?.status).toBe("INFERRED");
    expect(parsed.direction.navigation).toBe("tabs");
    expect(parsed.revisions).toEqual([]);
  });

  it("preserves additive V2 metadata while defaulting omitted nested values", () => {
    const parsed = DesignSpecSchema.parse({
      productName: "V2 metadata",
      navigation: "sidebar",
      visualHierarchy: "clear",
      density: "comfortable",
      typography: "system",
      spacing: "4px",
      surfaces: "layered",
      controls: "styled",
      responsive: "stacked",
      componentsV2: [{ name: "Button", purpose: "Primary action", stateNotes: "" }],
      screensV2: [{ screenId: "overview", primaryAction: "Create" }],
    });
    expect(parsed.componentsV2[0]).toMatchObject({ name: "Button", variants: [], stateNotes: "" });
    expect(parsed.screensV2[0]).toMatchObject({ screenId: "overview", primaryAction: "Create", components: [], mobileAdaptation: "" });
  });

  it("accepts additive quality metadata and defaults absent metadata safely", () => {
    const base = createInitialProjectState({ id: "metadata", name: "Metadata", rawIdea: "Test" });
    const withMetadata = ProjectStateSchema.parse({ ...base, generationMetadata: { quality: { score: 92, verdict: "PASS" } } });
    const withoutMetadata = ProjectStateSchema.parse({ ...base });
    expect(withMetadata.generationMetadata.quality).toEqual({ score: 92, verdict: "PASS" });
    expect(withoutMetadata.generationMetadata).toEqual({});
  });
});

export const designV2TestMarker = true;
