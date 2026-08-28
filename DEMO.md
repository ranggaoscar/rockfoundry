# RockFoundry WebMCP Challenge demo (60-90 seconds)

This demo shows an agent taking a product from idea to Product Draft and Design Preview through the page-scoped WebMCP tools added for the challenge.

Open [https://foundry.rockbase.web.id](https://foundry.rockbase.web.id).

## 1. Start a product (10 seconds)

Call `rockfoundry_start_product` with:

```text
A simple futsal field booking app. Customers choose a field and time slot; the owner confirms bookings and manages availability.
```

The tool creates the workspace through RockFoundry's normal project API and opens the new project page.

## 2. Generate the Product Draft (20-30 seconds)

Call `rockfoundry_generate_product_draft`.

Then call `rockfoundry_inspect_project` to confirm that the Product Draft is running or complete. The normal Documents workbench remains the source of progress and exposes the six generated documents:

- BRD
- PRD
- ERD
- User Flows
- Screen Map
- Design Brief

## 3. Generate the Design Preview (30-50 seconds)

When `rockfoundry_inspect_project` reports `hasCurrentDraft: true`, call `rockfoundry_generate_design_preview`.

The tool queues the existing Design Preview job and opens the normal Design workbench. It does not wait for completion or create a second prototype pipeline.

Call `rockfoundry_inspect_project` again to show:

- `design.jobStatus`
- `design.jobStage`
- `design.jobError` when relevant
- `design.prototypeAvailable`
- design review status and version

## Close

> RockFoundry already provided the product workspace. WebMCP makes its existing product, draft, and preview flows directly usable by an agent on the relevant page.
