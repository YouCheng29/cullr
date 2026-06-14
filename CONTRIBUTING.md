# Contributing

Thanks for looking at Cullr. It's an early, focused project: a free,
privacy-first (no-upload) browser RAW culler.

## Before you start
- Read [`docs/spec.md`](docs/spec.md) (what it is) and
  [`docs/architecture.md`](docs/architecture.md) (the one rule that can't break:
  **photos never leave the browser**).
- Run it locally — see [`docs/development.md`](docs/development.md).

## Ground rules
- **No backend that touches user photos.** Photo processing stays client-side.
- **Automation flags, humans decide** — never auto-delete a user's files.
- Heavy work goes in a Web Worker; keep the UI responsive.

## Workflow
1. Branch off `main`.
2. Keep changes focused; update the relevant doc if behaviour changes.
3. `pnpm test`, `pnpm exec tsc --noEmit`, and `pnpm build` must pass (CI runs all three).
4. Open a PR against `main`.

## Adding a RAW format
Verify `extractPreview()` against a real sample of that format (see
[`docs/spike-findings.md`](docs/spike-findings.md)) before adding its extension.
