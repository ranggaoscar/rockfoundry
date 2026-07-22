# Testing Plan

Run the smallest tests that protect product invariants.

| Layer | Check |
|---|---|
| Unit | Requirements graph detects a known conflict; question validator rejects a generic prompt |
| Unit | Readiness is blocked by missing required decision nodes |
| Integration | Answer applies exactly one state-version transition |
| Integration | Rendered export manifest and decision log agree |
| Integration | SumoPod webhook rejects bad signature/amount and ignores duplicate event |
| Integration | Reference fetch rejects private IP, oversized body, and redirect loop |
| E2E | Create idea, answer a round, resolve conflict, export ZIP |
| Manual | Keyboard navigation, screen reader labels, Indonesian copy, QRIS invoice expiry |

Use provider stubs in CI. Run one sandbox payment test before every release that changes the billing adapter.
