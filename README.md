# Payoff

Payoff helps creators of short narrative videos answer one question:

> Did people feel what I wanted them to feel, and if not, why?

The creator loop is **create → refine → test → understand → revise → test again**.

A creator gives Payoff a premise, a natural-language audience feeling, and a format. Payoff generates the copy and structured visual direction for a complete six-beat storyboard together, then creates each custom scene progressively. The creator can request a change in ordinary language, review the proposed beat replacements, and explicitly apply or cancel them. Manual editing remains available behind each beat’s contextual menu.

The full creative workspace has two views:

- **Storyboard** is the full-width story editor.
- **Test the payoff** compares the intended payoff with either an **AI Audience** simulation or real **Human Audience** evidence.

Diagnosis stays inside Test and never changes the story. The creator chooses what to change, returns to Storyboard, gives explicit direction, reviews a proposal, and then retests the resulting untested version.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
cp .env.example .env
# Add OPENAI_API_KEY and GEMINI_API_KEY to .env
npm run dev
```

Open:

- Creator workspace: [http://localhost:5173/](http://localhost:5173/)
- Target-blind audience viewer: [http://localhost:5173/study](http://localhost:5173/study)
- Optional developer details: [http://localhost:5173/?debug=1](http://localhost:5173/?debug=1)

`OPENAI_API_KEY` and `GEMINI_API_KEY` are loaded only by the development server or deployment runtime. They are never exposed through `VITE_*` variables or imported into the browser application. `OPENAI_MODEL` defaults to `gpt-5.4-mini` for structured story work, `OPENAI_SCENE_REVIEW_MODEL` defaults to `gpt-5.4` for vision QA, and `GEMINI_IMAGE_MODEL` defaults to `gemini-3.1-flash-lite-image` for reference and scene generation.

## Deterministic recording mode

Open [http://localhost:5173/?demo=1](http://localhost:5173/?demo=1) to run the canonical **Looks Great** recording journey through deterministic, schema-validated fixtures. The creator UI, revision proposal/apply flow, immutable version commands, scene loading state, Audience Report, diagnosis, and evidence binding are the production paths. Only provider outputs for the supported journey are replaced by cached artifacts. The clean baseline and the canonical opening revision have separate AI Audience and diagnosis fixtures, each validated against its exact story version. An unknown demo request fails with `Missing demo fixture: …`; it never falls through to OpenAI or Gemini.

Demo state is stored under `payoff.demo.workspace.v5`, separately from the normal `payoff.workspace.v4` workspace. The demo namespace is versioned so stale fixture provenance cannot be reused after a checked-in artifact changes. **Start over** restores the clean definition screen. Add `reset=1` for a hard reset on page load. A six-pixel red dot at the bottom-right subtly identifies demo mode; `debug=1` additionally shows the **Demo cache active** developer detail.

The current checked-in Human Audience dataset is a development-only synthetic rehearsal fixture. The shared report labels it **Human Audience · Rehearsal data** and **Not real viewer evidence**; it must not be recorded or described as real human research. A public `Human Audience · N real viewers` claim requires replacing it with genuine anonymized responses collected against the exact demonstrated version and story hash.

## Server-side AI

Payoff exposes five creator operations:

- `POST /api/storyboard` generates a title, compact payoff summary, visual continuity specification, and exactly six validated beat drafts. Copy and visual direction are generated in the same structured response.
- `POST /api/scene` creates one scene from its complete beat visual specification and story continuity. It retries one transient provider/asset failure, performs continuity-aware semantic image review, applies one bounded candidate edit or structural regeneration according to the failure class, and otherwise returns the neutral retryable failure contract instead of an inaccurate image.
- `POST /api/audience` returns the same normalized report for either source. For AI Audience it simulates varied behavior and interpretation lenses. For Human Audience it organizes only the exact imported responses and returns their IDs unchanged.
- `POST /api/diagnose` answers a creator’s question from the exact story and normalized audience result. Its contract has no mutation fields.
- `POST /api/revise` resolves casual creator language against the complete storyboard and returns either an inert, version-bound sparse revision proposal or one clarification question. Obvious shorthand and typos are normalized; genuinely ambiguous concrete objects become a normal clarification state. The model supplies only changed fields, while the server preserves and validates unchanged beat metadata. One bounded structured-output recovery is allowed. The story changes only when the creator chooses **Apply changes**.

The server uses OpenAI Responses API Structured Outputs with strict Zod schemas, validates the parsed result again, checks all referenced beat IDs, and returns creator-safe errors. Story generation has a bounded quality review and repair gate for titles, descriptions, progression, payoff, text/visual agreement, and continuity. Scene generation is isolated behind a provider-neutral server adapter; API keys and provider details never enter the client. The domain store validates every beat again at apply time and rejects stale `expected_version` values before any state change.

## Storyboard visuals

Payoff uses a hybrid visual architecture:

- **Looks Great** uses six reviewed Gemini JPEG scenes generated through the production continuity and semantic-QA flow, then bundled as canonical assets. Resetting the starter serves them immediately and never invokes runtime image generation.
- **Custom stories** carry a structured visual brief on every beat plus one shared continuity specification for character identity, clothing, settings, props, time of day, lighting, and style. Cards appear as soon as the story is ready with an intentional **Creating scene...** state, then resolve independently.
- The scene prompt uses the action, cast, focal object, spatial relationship, composition, emotional cue, continuity notes, and only the continuity props relevant to that frame. Later clues and unlisted cast are explicitly withheld.
- Environment references contain no people or narrative clues. Recurring character identity references are isolated per character and only the visible cast is supplied to a scene.
- Each completed custom scene returns a provider-neutral continuity reference bundle for its visible cast plus the accepted scene for the immediately following beat. Custom frames generate in story order so the next request can preserve room, wardrobe, lighting, and story-relevant accumulated state without treating incidental movable set dressing as mandatory. Nonadjacent or stale scene references are rejected.
- Exact narratively important typography is rendered by deterministic UI overlays, not trusted to generated pixels.

Accepted images are cached by the stable hash of the beat visual specification and continuity inputs. The browser uses memory plus IndexedDB caching; the server deduplicates in-flight work and keeps bounded LRU caches for scenes and continuity references. A revision proposal never invokes image generation. Applying it atomically creates one textually valid version, assigns a new visual hash only to affected beats, preserves unaffected images, and marks the new version **Untested**. Those cards then show **Updating scene visual...** independently. If generation or semantic QA ultimately fails, the revised text remains committed and the card shows **Scene visual couldn't be updated.** with **Try again**. A Gemini project spending-cap response is classified separately, is not wastefully retried, and tells the creator that the story was updated and the project limit must be increased before retrying. Undo restores both the prior text and prior visual asset reference.

Internal structured diagnostics use the `[Payoff AI:storyboard-diagnostic]`, `[Payoff AI:revision-diagnostic]`, `[Payoff AI:revision-provider]`, `[Payoff AI:scene-diagnostic]`, `[Payoff AI:gemini-request]`, `[Payoff AI:gemini-response]`, `[Payoff AI:scene-client]`, and `[Payoff AI:scene-ui]` prefixes. Revision logs include request/story/version context, creator direction, selected beat, target resolution, model latency/status, parse and schema results, resolved IDs, failure category, and bounded-recovery result. Scene logs record model, attempt stage, request size, latency, provider error classification, semantic review/repair, cache, persistence, and render status. Raw logs never enter the creator UI.

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
npm run acceptance:storyboard -- --images
```

Vitest covers domain invariants, structured visual contracts, bounded story and scene quality gates, revision/undo visual integrity, both Audience source contracts, target-blind study behavior, demo fixture validation/failure protection, and WebMCP tool contracts. Playwright covers progressive scene placeholders, retryable image failure, collapsed revision assistance, proposal/apply/cancel with visual replacement and undo, Audience integration, start-over behavior, desktop/tablet/mobile bounds, normal use without WebMCP, native WebMCP execution, and ten identical runs of the complete deterministic demo journey.

The acceptance runner generates comedy, warm family, awkward social, suspense/reveal, and bittersweet storyboards. With `--images`, it also creates all scene images and writes review artifacts to `/private/tmp/payoff-storyboard-acceptance`. Use `--reuse-text`, `--case=<id>`, and `--beat=<1-6>` for bounded visual reruns. Automated acceptance is a gate, not a substitute for manually reviewing every final scene and the six deterministic starter scenes.

## Architecture

- Vite, React, and TypeScript
- Server-only OpenAI text/review adapters using Responses API Structured Outputs plus Gemini scene generation
- Vite development middleware plus Vercel `/api` functions
- Framework-independent external store via `useSyncExternalStore`
- Immutable versions and optimistic stale-write protection
- LocalStorage workspace recovery
- Bundled reviewed Gemini JPEGs for the canonical example plus runtime Gemini visuals for custom stories
- Structured beat visual briefs and shared character/setting continuity
- Bounded semantic scene QA with one repair and a neutral failure state
- Content-hash image reuse with memory, IndexedDB, and server LRU caches
- Target-free shareable study stimuli with content fingerprints
- Direct imperative WebMCP registration using `webmcp-types`

## Deploy

The complete product requires a server-capable deployment with `OPENAI_API_KEY` and `GEMINI_API_KEY` runtime secrets. Vercel serves the `/api` functions, creator SPA, and `/study` route. `vercel.json` gives storyboard/revision generation enough time for bounded text repair and scene generation enough time for reference creation, semantic review, and one image repair while retaining finite execution limits.

The historical GitHub Pages workflow can publish the static client, but GitHub Pages cannot run the server-side AI operations and is not the complete product deployment.

## License

[MIT](./LICENSE)
