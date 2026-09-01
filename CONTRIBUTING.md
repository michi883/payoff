# Contributing to Payoff

Thanks for helping improve Payoff. Changes should preserve its central guarantee: story versions and audience evidence remain explicit, immutable, and correctly linked.

## Local setup

Use Node.js 22.13 or newer and npm 10 or newer.

```bash
npm ci
cp .env.example .env
npm run dev
```

Provider keys are needed only for live AI generation. The automated unit, build, and browser checks use deterministic fixtures or mocked API responses and should not spend provider credits.

## Before opening a pull request

Run the full local quality gate:

```bash
npm run check
npm run test:e2e
```

Add or update tests for behavioral changes. Keep commits focused, and explain user-visible changes and any migration implications in the pull request.

## Project invariants

- The creator UI and WebMCP tools must operate on the same `PayoffStore` and domain commands.
- Every story write must create an immutable version and reject a stale `expected_version`.
- AI and Human Audience evidence must stay attached to the exact story version and content hash they evaluated.
- Rehearsal fixtures must remain visibly labeled as synthetic and must never be presented as real viewer evidence.
- Provider credentials are server-only. Never add secrets to `VITE_*` variables, source files, fixtures, logs, or commits.
- WebMCP writes should remain narrow primitives; creative decisions belong to the creator.
- Generated scene changes must preserve the structured visual contract and its deterministic fallback behavior.

## Repository map

- `src/domain/`: versioned workspace state, commands, selectors, and invariants
- `src/workspace/`: creator workflow and dialogs
- `src/study/`: target-blind Human Audience stimulus and response flow
- `src/webmcp/`: external-agent tool contracts
- `server/`: provider adapters, validation, and the production HTTP service
- `api/`: Vercel-compatible route adapters
- `tests/e2e/`: browser-level product and WebMCP coverage
- `fixtures/rehearsal-only/`: synthetic development data, never real research

By contributing, you agree that your contribution may be distributed under the repository's [MIT License](./LICENSE).
