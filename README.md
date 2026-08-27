# Payoff

Payoff helps creators of short narrative videos answer one question:

> Did people feel what I wanted them to feel, and if not, why?

The creator loop is **create → refine → test → understand → revise → test again**.

A creator gives Payoff a premise, a natural-language audience feeling, and a format. Payoff generates a complete six-beat storyboard with its server-side AI. The creator can request a change in ordinary language, review the proposed beat replacements, and explicitly apply or cancel them. Manual editing remains available behind each beat’s contextual menu.

The full creative workspace has two views:

- **Storyboard** is the full-width story editor.
- **Test the payoff** compares the intended payoff with either an **AI Audience** simulation or real **Human Audience** evidence.

Diagnosis stays inside Test and never changes the story. The creator chooses what to change, returns to Storyboard, gives explicit direction, reviews a proposal, and then retests the resulting untested version.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
cp .env.example .env
# Add OPENAI_API_KEY to .env
npm run dev
```

Open:

- Creator workspace: [http://localhost:5173/](http://localhost:5173/)
- Target-blind audience viewer: [http://localhost:5173/study](http://localhost:5173/study)
- Optional developer details: [http://localhost:5173/?debug=1](http://localhost:5173/?debug=1)

`OPENAI_API_KEY` is loaded only by the development server or deployment runtime. It is never exposed through a `VITE_*` variable or imported into the browser application. `OPENAI_MODEL` is optional and defaults to `gpt-5.4-mini`.

## Server-side AI

Payoff exposes four creator operations:

- `POST /api/storyboard` generates a title, compact payoff summary, and exactly six validated beat drafts.
- `POST /api/audience` returns the same normalized report for either source. For AI Audience it simulates varied behavior and interpretation lenses. For Human Audience it organizes only the exact imported responses and returns their IDs unchanged.
- `POST /api/diagnose` answers a creator’s question from the exact story and normalized audience result. Its contract has no mutation fields.
- `POST /api/revise` returns either an inert, version-bound revision proposal or one clarification question. The story changes only when the creator chooses **Apply changes**.

The server uses OpenAI Responses API Structured Outputs with strict Zod schemas, validates the parsed result again, checks all referenced beat IDs, and returns creator-safe errors. The domain store validates every beat again at apply time and rejects stale `expected_version` values before any state change.

The legacy `POST /api/preview` route remains as a compatibility alias for `/api/audience`; the creator UI does not use it.

## Audience sources

AI Audience is a fast simulated perspective check. It uses behavior-based lenses such as casual fast-scrolling, emotionally attentive, literal, story-savvy, skeptical, and comedy-sensitive. It never invents human viewers, research counts, or real quotations.

Human Audience is real target-blind evidence. A viewer receives a link containing only the exact story stimulus, watches all six beats uninterrupted, and then completes an anonymous response form. For the current local-first build, response files are imported into the creator workspace.

Both sources render the exact same report component. Its default overview contains only:

- qualitative match;
- intended and observed landing;
- **What landed**;
- **Where it drifted**;
- **Biggest opportunity**.

Strongest and weakest beats, emotional progression, reaction notes, disagreements, methodology, provenance, and evidence strength stay behind **See details**.

AI results never enter Human Audience counts. Human report synthesis is pinned to the exact story hash and exact response ID set. Human comments appear only when quote consent is present; otherwise details show aggregate facts derived directly from the imported responses.

## Version and evidence integrity

Every applied edit creates an immutable story version with stable beat IDs. After a change:

- the new active version is **Untested**;
- previous AI Audience results remain attached only to the version they evaluated;
- previous Human Audience responses remain attached only to their tested version and content fingerprint;
- no score increases automatically and no improvement is claimed before retesting;
- **Undo**, **History**, and **Test again** support safe experimentation.

Human response imports must match the prepared project, story version, and story hash, and must declare a hidden target plus uninterrupted first viewing. Malformed, mismatched, and duplicate responses are rejected without changing accepted evidence.

The synthetic files under `fixtures/rehearsal-only/` verify the import flow during development. They are clearly marked as non-human rehearsal data and must never be used for a public real-viewer claim.

## WebMCP collaboration layer

Normal Payoff features do not depend on WebMCP. When supported, the existing integration registers eight narrow tools against the same store and command layer used by the UI and Payoff’s own AI:

| Tool | Kind | Purpose |
| --- | --- | --- |
| `get_story_brief` | Read | Read the brief, target, evidence state, and versions. |
| `list_story_beats` | Read | Read the ordered storyboard or one stable beat. |
| `get_ai_preview` | Read | Read the active version’s simulated result. |
| `get_audience_reactions` | Read, untrusted content | Read real findings pinned to the tested version. |
| `create_story_beat` | Write | Insert one visible beat. |
| `replace_story_beat` | Write | Replace one beat while preserving its ID and position. |
| `move_story_beat` | Write | Explicitly reorder one beat. |
| `save_ai_preview` | Write | Save a validated simulation without touching story or human evidence. |

There are intentionally no broad `fix_story`, `make_it_better`, or `optimize_payoff` tools. External agents reason across primitive reads and use version-checked primitive writes.

## Quality checks

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

Vitest covers domain invariants, both Audience source contracts, target-blind study behavior, and WebMCP tool contracts. Playwright covers the complete custom creator journey, the two-second report and details disclosure, generation recovery, proposal/apply/cancel, read-only diagnosis for either source, exact response/report binding, Human Audience synthesis retry, version/evidence separation, Payoff confirmation dialogs, navigation persistence, desktop/tablet/mobile bounds, target-blind viewing, normal use without WebMCP, and native Chrome WebMCP execution.

## Architecture

- Vite, React, and TypeScript
- Server-only OpenAI provider using Responses API Structured Outputs
- Vite development middleware plus Vercel `/api` functions
- Framework-independent external store via `useSyncExternalStore`
- Immutable versions and optimistic stale-write protection
- LocalStorage workspace recovery
- Target-free shareable study stimuli with content fingerprints
- Direct imperative WebMCP registration using `webmcp-types`
- Lightweight inline SVG scene art; no runtime image dependency

## Deploy

The complete product requires a server-capable deployment with an `OPENAI_API_KEY` runtime secret. Vercel serves the four `/api` functions, creator SPA, and `/study` route.

The historical GitHub Pages workflow can publish the static client, but GitHub Pages cannot run the server-side AI operations and is not the complete product deployment.

## License

[MIT](./LICENSE)
