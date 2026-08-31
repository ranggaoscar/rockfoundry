import { describe, expect, it } from "vitest";
import {
  renderPrototypePreviewDocument,
  selectCoherentPrototypeSet,
} from "./design-preview";

const artifact = (type: string, version: number, canonicalVersion = 3) => ({
  type,
  version,
  canonicalVersion,
  status: "READY",
  content: `${type}-${version}`,
});

describe("persisted design preview selection", () => {
  it("selects one complete common-version set instead of mixing files", () => {
    const selected = selectCoherentPrototypeSet(
      [
        artifact("PROTOTYPE_HTML", 2),
        artifact("PROTOTYPE_CSS", 2),
        artifact("PROTOTYPE_JS", 1),
        artifact("PROTOTYPE_HTML", 1),
        artifact("PROTOTYPE_CSS", 1),
        artifact("PROTOTYPE_JS", 1),
      ],
      3,
    );
    expect(selected?.html.content).toBe("PROTOTYPE_HTML-1");
    expect(selected?.css.content).toBe("PROTOTYPE_CSS-1");
    expect(selected?.js.content).toBe("PROTOTYPE_JS-1");
  });

  it("rejects null-canonical legacy files", () => {
    const selected = selectCoherentPrototypeSet(
      [
        artifact("PROTOTYPE_HTML", 1, null as unknown as number),
        artifact("PROTOTYPE_CSS", 1, null as unknown as number),
        artifact("PROTOTYPE_JS", 1, null as unknown as number),
      ],
      3,
    );
    expect(selected).toBeNull();
  });
});

describe("prototype preview asset injection", () => {
  const css = "body{background:rgb(1,2,3)}";
  const js = "window.previewBooted=true;";
  const files = (html: string) => [
    { path: "index.html", content: html },
    { path: "styles.css", content: css },
    { path: "app.js", content: js },
  ];
  const expectAssetsOnce = (document: string) => {
    expect(document.match(/data-rf-prototype-asset="styles\.css"/g)).toHaveLength(1);
    expect(document.match(/data-rf-prototype-asset="app\.js"/g)).toHaveLength(1);
    expect(document.split(css)).toHaveLength(2);
    expect(document.split(js)).toHaveLength(2);
  };

  it("replaces canonical asset tags", () => {
    const document = renderPrototypePreviewDocument(files('<html><head><link rel="stylesheet" href="styles.css"><link rel="stylesheet" href="styles.css"></head><body><main>Preview</main><script src="app.js"></script><script src="app.js"></script></body></html>'));
    expectAssetsOnce(document);
  });

  it("matches reversed attributes and optional link attributes", () => {
    const document = renderPrototypePreviewDocument(files('<html><head><link media="screen" href="styles.css" type="text/css" rel="stylesheet"></head><body><script defer src="app.js" type="text/javascript"></script></body></html>'));
    expectAssetsOnce(document);
  });

  it("matches single-quoted asset tags", () => {
    const document = renderPrototypePreviewDocument(files("<html><head><link href='styles.css' rel='stylesheet'></head><body><script src='app.js'></script></body></html>"));
    expectAssetsOnce(document);
  });

  it("adds missing asset tags once at safe document locations", () => {
    const document = renderPrototypePreviewDocument(files("<html><head><title>Preview</title></head><body><main>Preview</main></body></html>"));
    expectAssetsOnce(document);
    expect(document.indexOf(`data-rf-prototype-asset=\"styles.css\"`)).toBeLessThan(document.indexOf("</head>"));
    expect(document.indexOf(`data-rf-prototype-asset=\"app.js\"`)).toBeLessThan(document.indexOf("</body>"));
  });
});
