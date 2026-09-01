# Payoff

Payoff helps creators of short narrative videos answer one question:

> Did people feel what I wanted them to feel, and if not, why?

> **For:** creators and small creative teams making short narrative videos where a punchline, reveal, or emotional turn needs to land.

The creator loop is **Create → Refine → Test → Understand → Revise → Test again**.

Creators often know the feeling they intend, but not whether an audience will experience it. Payoff turns that gap into a concrete workflow: it holds the creative brief, storyboard, audience response, diagnosis, and revision history as one versioned artifact. It is not only an AI storyboard generator; it helps a creator compare intended emotion with actual landing, understand the mismatch, and test the next version without losing the evidence behind the previous one.

## Why WebMCP

Payoff works as a normal creator product by itself. WebMCP makes the same live workspace directly usable by an external AI agent.

Payoff owns the structured creative state. The creator sees and edits the storyboard visually, while AI Audience results and Human Audience responses remain attached to the exact versions they evaluated. WebMCP exposes that same state and a small set of primitive operations to an external agent. The agent can reason across creative intent, storyboard structure, simulated perspectives, and real Human Audience evidence; the human retains creative judgment and chooses the tradeoff; then the agent can execute that direction against the same storyboard the creator sees.

### Without WebMCP

The creator would need to:

1. Copy storyboard content into an AI chat.
2. Copy audience feedback into the chat.
3. Explain the current story and version.
4. Discuss possible changes.
5. Return to Payoff.
6. Manually reproduce the recommended edits.

That handoff loses structure, provenance, and confidence about which evidence belongs to which revision.

### With WebMCP

The agent can:

1. Inspect the actual creative brief.
2. Read the actual live storyboard.
3. Inspect evidence attached to the correct version.
4. Reason with the creator about the mismatch.
5. Wait for human creative direction.
6. Perform precise, version-checked edits to the same storyboard the creator sees.

```text
Creator UI ─────────────┐
Payoff server-side AI ──┼──> shared, validated, versioned story state
External WebMCP agent ──┘                       │
                                               ├── storyboard
                                               ├── AI Audience
                                               ├── Human Audience evidence
                                               └── immutable versions
```

**Payoff's AI makes the product useful. WebMCP makes the workspace agent-native.**

## Human + Agent Collaboration

The central collaboration is deliberate, not autonomous optimization:

1. The human defines the intended emotional payoff.
2. Payoff holds the live storyboard and audience evidence.
3. The agent reads that structured state through WebMCP.
4. The agent diagnoses the mismatch between intended and observed response.
5. The human decides which creative tradeoff to make.
6. The agent composes primitive WebMCP write operations to execute that direction.
7. Payoff creates a new immutable version and marks it **Untested**.
8. The human tests again.

**The agent diagnoses. The creator directs. The agent helps execute.**

This is the WebMCP leverage: structured reads and version-checked writes turn an external agent from a separate advice window into a collaborator on a real shared artifact, without giving it ownership of the creative decision.

## Product Experience

A creator gives Payoff a premise, a natural-language audience feeling, and a format. Payoff generates the copy and structured visual direction for a complete six-beat storyboard together, then creates each custom scene progressively.

The workspace has two views:

- **Storyboard** is the full-width story editor. The creator can manually edit a beat or ask Payoff for a natural-language revision, review the proposed replacements, and explicitly apply or cancel them.
- **Test the payoff** compares the intended payoff with either an **AI Audience** simulation or real **Human Audience** evidence using the same normalized Audience Report.

Diagnosis stays inside Test and never changes the story. The creator chooses what to change, returns to Storyboard, gives explicit direction, reviews the resulting change, and retests the new untested version. The product is designed to close the gap between intended emotion and actual landing, rather than simply generate more content.

## Try Payoff with WebMCP

Use a WebMCP-enabled browser and external agent environment that implements `document.modelContext.registerTool`. Payoff continues to work normally when that API is unavailable; opening [http://localhost:5173/?debug=1](http://localhost:5173/?debug=1) shows whether the tools are exposed and whether an agent has interacted with them.

1. Run Payoff locally using the instructions below.
2. Open the creator workspace in the WebMCP-enabled environment.
3. Create or load a storyboard and, if desired, run an Audience test.
4. Ask the connected agent:

   > Inspect this story's intended payoff, storyboard, and audience response. Explain why the audience reaction differs from the creator's target. Do not edit the story.

5. After considering the diagnosis, give a concrete direction:

   > Keep the reveal, but make the opening faster.

The first prompt should read live Payoff state without mutating it. After the human supplies direction, the agent can compose primitive beat operations against the active version. The visible storyboard changes, the version advances, and the revision becomes **Untested**; no verdict from the previous version silently follows it.

The registration and tool contracts live in [`src/webmcp/tools.ts`](./src/webmcp/tools.ts). Native registration and tool behavior are covered in [`src/webmcp/tools.test.ts`](./src/webmcp/tools.test.ts) and the Playwright suite.

### Chrome WebMCP Inspector demo payload

Open `/?demo=1`, create or load **Looks Great**, then open the Chrome WebMCP Inspector side panel. Run `get_story_brief` with `{}` and `list_story_beats` with `{}` before writing. Copy `active_version` from the read result into `expected_version`, and copy the first returned beat's `id`; do not use the Inspector's `example_string` placeholders. A clean demo returns `looks-great-v1` and `beat-1`, but a persisted demo revision returns a newer version and must use that newer value.

`replace_story_beat` is a full replacement. For the clean reviewed baseline, the exact deterministic opening-revision payload is:

```json
{
  "beat_id": "beat-1",
  "expected_version": "looks-great-v1",
  "title": "Answering on autopilot",
  "action": "Before his daughter finishes raising the drawing, Dad says “Looks great” without lifting his eyes from his phone.",
  "line": "Looks great.",
  "narrative_role": "setup",
  "intended_emotion": "familiar amusement",
  "visual": {
    "setting": "The family dining area in their warm apartment, beside the small table.",
    "characters": [
      {
        "id": "daughter",
        "appearance": "Eight years old, dark ponytail, orange shirt, indigo trousers, expressive round face.",
        "position": "Standing at the left edge of the table, still raising the drawing toward Dad.",
        "action": "Lifts the drawing from chest height toward Dad, hopeful and not yet finished presenting it."
      },
      {
        "id": "dad",
        "appearance": "Early 40s, short dark hair, charcoal sweater, dark trousers, gentle face that looks tired when distracted.",
        "position": "Seated on the right side of the table.",
        "action": "Keeps his eyes on the phone while lifting his free hand in an automatic reassuring gesture."
      }
    ],
    "focal_action": "Dad answers automatically while the daughter's drawing is still being raised and his gaze stays on the phone.",
    "focal_object": "The half-raised drawing contrasted with Dad's phone and reflexive free-hand gesture.",
    "composition": "Keep the drawing mid-offer between them, Dad's phone-focused gaze unmistakable, and the lower center clear for the product-controlled line.",
    "emotional_cue": "Her hopeful momentum meets his practiced, unintentional inattention.",
    "visible_text": "LOOKS GREAT",
    "continuity_notes": [
      "Preserve the exact daughter, Dad, apartment, wardrobe, phone, drawing palette, and warm-neutral daylight.",
      "Revised creator direction: Make the opening faster"
    ]
  }
}
```

The line, narrative role, intended emotion, setting, character appearances, and Dad's position come from `list_story_beats`. Only the visible opening action and the visual fields required to depict it change. A successful call returns `looks-great-r2`, updates Beat 1 immediately, and survives a reload from the isolated `payoff.demo.workspace.v5` workspace. Repeating this payload with the old `expected_version` returns an `isError: true` result beginning `Stale expected_version:`.

## Production Architecture

Payoff's primary production target is one containerized Node service on Google Cloud Run. The same origin serves the built Vite application, `/study`, and every server-side AI route. The browser owns the shared versioned workspace used by both the visual UI and WebMCP tools; Cloud Run validates requests and returns provider results without becoming a second source of story state.

Live service: [https://payoff-i5d3lcvjjq-uc.a.run.app](https://payoff-i5d3lcvjjq-uc.a.run.app)

```text
Browser
  ├── Creator UI
  ├── WebMCP tools
  └── shared versioned domain state
        │
        ▼
Cloud Run · Node service
  ├── built Vite SPA and /study
  ├── /api/storyboard
  ├── /api/scene
  ├── /api/audience
  ├── /api/diagnose
  └── /api/revise
        │
        ├── OpenAI · structured story, audience, diagnosis, revision, and scene review
        └── Gemini · reference and scene image generation
```

`OPENAI_API_KEY` and `GEMINI_API_KEY` enter the container only as Secret Manager-backed runtime variables. The Vite bundle contains neither key nor provider implementation. Browser memory, IndexedDB, and server LRU caches improve reuse; server caches are instance-local and disposable, so correctness never depends on a warm Cloud Run instance.

## Run Locally

Requirements: Node.js 22.13+ and npm 10+.

```bash
npm install
cp .env.example .env
# Add OPENAI_API_KEY and GEMINI_API_KEY to .env
npm run dev
```

Open:

- Creator workspace: [http://localhost:5173/](http://localhost:5173/)
- Target-blind audience viewer: [http://localhost:5173/study](http://localhost:5173/study)
- Optional developer details and WebMCP status: [http://localhost:5173/?debug=1](http://localhost:5173/?debug=1)

`OPENAI_API_KEY` and `GEMINI_API_KEY` are loaded only by the development server or deployment runtime. They are never exposed through `VITE_*` variables or imported into the browser application. `OPENAI_MODEL` defaults to `gpt-5.4-mini` for structured story work, `OPENAI_SCENE_REVIEW_MODEL` defaults to `gpt-5.4` for vision QA, and `GEMINI_IMAGE_MODEL` defaults to `gemini-3.1-flash-lite-image` for reference and scene generation.

Local development continues to use Vite middleware. To exercise the production entrypoint locally instead:

```bash
npm run build
PORT=8080 npm start
```

The equivalent container check is:

```bash
docker build -t payoff .
docker run --rm --env-file .env -p 8080:8080 payoff
```

## Deterministic Recording Mode

Open [http://localhost:5173/?demo=1](http://localhost:5173/?demo=1) to run the canonical **Looks Great** recording journey through deterministic, schema-validated fixtures. It exists to make recording reliable while preserving the production UI, schemas, loading states, domain commands, immutable versioning, Audience Report, diagnosis, and evidence binding. Only provider outputs for the supported journey are cached.

The clean baseline and canonical opening revision have separate AI Audience and diagnosis fixtures, each validated against its exact story version. An unknown demo request fails with `Missing demo fixture: …`; it never falls through to OpenAI or Gemini.

Demo state is stored under `payoff.demo.workspace.v5`, separately from the normal `payoff.workspace.v4` workspace. The namespace is versioned so stale fixture provenance cannot be reused after an artifact changes. **Start over** restores the clean definition screen. Add `reset=1` for a hard reset on page load. A six-pixel red dot at the bottom-right subtly identifies demo mode; `debug=1` additionally shows **Demo cache active**.

The checked-in Human Audience dataset is a development-only synthetic rehearsal fixture. The shared report labels it **Human Audience · Rehearsal data** and **Not real viewer evidence**. It must never be recorded or described as real human research. A public `Human Audience · N real viewers` claim requires genuine anonymized responses collected against the exact demonstrated version and story hash.

Demo mode proves that the product journey is repeatable; it is not, by itself, proof of WebMCP collaboration. The submission demonstration should separately show an external agent reading and writing the live workspace through the registered tools.

## WebMCP Tools

Payoff registers eight narrow tools against the same external store and domain commands used by the human UI. This is an intentional design constraint: there are no broad `fix_story`, `make_it_better`, or `optimize_payoff` tools. The external agent must reason across primitive reads and compose precise operations after receiving human direction, rather than invoking a hidden high-level optimizer.

| Tool | Kind | Purpose |
| --- | --- | --- |
| `get_story_brief` | Read | Read the brief, target, evidence state, and versions. |
| `list_story_beats` | Read | Read the complete ordered storyboard and stable beat IDs. |
| `get_ai_preview` | Read | Read the active version's simulated result. |
| `get_audience_reactions` | Read, untrusted content | Read real findings pinned to the tested version. |
| `create_story_beat` | Write | Insert one visible beat. |
| `replace_story_beat` | Write | Replace one beat while preserving its ID and position. |
| `move_story_beat` | Write | Explicitly reorder one beat. |
| `save_ai_preview` | Write | Save a validated simulation without touching story or human evidence. |

Read tools expose the active and tested versions needed for reliable reasoning. Story writes require the `expected_version` previously read and are rejected if it is stale. They create normal immutable versions through the production command layer, so the human sees the result immediately and all evidence rules remain in force. `save_ai_preview` is also version-checked and can never write Human Audience evidence.

Normal Payoff features do not depend on WebMCP. WebMCP is the collaboration layer that lets an external agent enter the same live creative workspace.

## Server-side AI

Payoff's server-side AI powers the normal product experience, with or without WebMCP:

- `POST /api/storyboard` generates a title, compact payoff summary, visual continuity specification, and exactly six validated beat drafts. Copy and visual direction are generated in the same structured response.
- `POST /api/scene` creates one scene from its complete beat visual specification and story continuity. It retries one transient provider or asset failure, performs continuity-aware semantic image review, applies one bounded candidate edit or structural regeneration according to the failure class, and otherwise returns a neutral retryable failure instead of an inaccurate image.
- `POST /api/audience` returns the same normalized report for either source. AI Audience simulates varied behavior and interpretation lenses; Human Audience synthesis organizes only the exact imported responses and returns their IDs unchanged.
- `POST /api/diagnose` answers a creator's question from the exact story and normalized audience result. Its contract has no mutation fields.
- `POST /api/revise` resolves casual creator language against the complete storyboard and returns either an inert, version-bound sparse revision proposal or one clarification question. Shorthand and typos are normalized; genuinely ambiguous concrete objects become a normal clarification state. The model supplies only changed fields, while the server preserves and validates unchanged beat metadata. One bounded structured-output recovery is allowed. The story changes only when the creator chooses **Apply changes**.

The server uses OpenAI Responses API Structured Outputs with strict Zod schemas, validates parsed results again, checks every referenced beat ID, and returns creator-safe errors. Story generation has a bounded quality review and repair gate for titles, descriptions, progression, payoff, text and visual agreement, and continuity. Scene generation is isolated behind a provider-neutral server adapter. The domain store validates every beat again at apply time and rejects stale `expected_version` values before any state change.

The legacy `POST /api/preview` route remains as a compatibility alias for `/api/audience`; the creator UI does not use it.

## Storyboard Visuals

Payoff uses a hybrid visual architecture:

- **Looks Great** uses six reviewed Gemini JPEG scenes generated through the production continuity and semantic-QA flow, then bundled as canonical assets. Resetting the starter serves them immediately and never invokes runtime image generation.
- **Custom stories** carry a structured visual brief on every beat plus one shared continuity specification for character identity, clothing, settings, props, time of day, lighting, and style. Cards appear as soon as the story is ready with **Creating scene...**, then resolve independently.
- Scene prompts use the action, visible cast, focal object, spatial relationship, composition, emotional cue, and relevant continuity details. Later clues and unlisted cast are withheld.
- Environment references contain no people or narrative clues. Recurring character identity references are isolated per character, and only the visible cast is supplied to a scene.
- Custom frames generate in story order. Each accepted scene returns a provider-neutral continuity bundle for its visible cast plus the accepted scene for the immediately following beat; nonadjacent or stale references are rejected.
- Narratively important typography is rendered by deterministic UI overlays instead of being trusted to generated pixels.

Accepted images are cached by a stable hash of the beat visual specification and continuity inputs. The browser uses memory plus IndexedDB caching; the server deduplicates in-flight work and keeps bounded LRU caches for scenes and continuity references.

A revision proposal never invokes image generation. Applying it atomically creates a textually valid version, assigns a new visual hash only to affected beats, preserves unaffected images, and marks the new version **Untested**. Affected cards show **Updating scene visual...** independently. If generation or semantic QA fails, the revised text remains committed and the card offers **Try again**. Gemini spending-cap failures are classified separately and are not wastefully retried. Undo restores both the prior text and prior visual asset reference.

For maintainers, structured diagnostics are grouped under `[Payoff AI:*]` prefixes for storyboard, revision, provider, scene, request/response, client, and UI stages. They capture bounded repair, latency, failure classification, cache, persistence, and render status without entering the creator UI.

## Audience Sources

### AI Audience

AI Audience is a fast simulated perspective check. AI creates and interprets simulated reactions through behavior-based lenses such as casual fast-scrolling, emotionally attentive, literal, story-savvy, skeptical, and comedy-sensitive. It never invents human viewers, research counts, or real quotations.

### Human Audience

Human Audience is real target-blind viewer evidence. Humans create the reactions; AI only organizes and interprets them. A viewer receives a link containing only the exact story stimulus, watches all six beats uninterrupted, and then completes an anonymous response form. In the current local-first build, response files are imported into the creator workspace; Payoff does not recruit participants automatically.

Both sources use the same normalized Audience Report. Its concise overview shows qualitative match, intended and observed landing, **What landed**, **Where it drifted**, and **Biggest opportunity**. Strongest and weakest beats, emotional progression, reaction notes, disagreements, methodology, provenance, and evidence strength remain behind **See details**.

AI results never enter Human Audience counts. Human synthesis is pinned to the exact story hash and exact response ID set. Human comments appear only when quote consent is present; otherwise details show aggregate facts derived directly from imported responses. Synthetic rehearsal fixtures are always labeled and are never treated as real viewers.

## Version and Evidence Integrity

Every applied edit creates an immutable story version with stable beat IDs. After a change:

- The new active version is **Untested**.
- Previous AI Audience results remain attached only to the version they evaluated.
- Previous Human Audience responses remain attached only to their tested version and content fingerprint.
- No score increases automatically and no improvement is claimed before retesting.
- **Undo**, **History**, and **Test again** support safe experimentation.

Human response imports must match the prepared project, story version, and story hash, and must declare a hidden target plus uninterrupted first viewing. Malformed, mismatched, and duplicate responses are rejected without changing accepted evidence.

The synthetic files under `fixtures/rehearsal-only/` verify the import flow during development. They are clearly marked as non-human rehearsal data and must never be used for a public real-viewer claim.

These safeguards also apply to WebMCP. An agent cannot silently carry an old verdict onto a new story or overwrite a version that changed after it was read.

## Implementation Details

- Vite, React, and TypeScript
- One Cloud Run Node service serving the built Vite SPA and shared server-side handlers
- Server-only OpenAI text and review adapters using Responses API Structured Outputs, plus Gemini scene generation
- The same Node API request adapter under Vite development middleware and the Cloud Run server
- Framework-independent external store via `useSyncExternalStore`, shared by the UI and WebMCP tools
- Immutable versions and optimistic stale-write protection
- LocalStorage workspace recovery
- Bundled reviewed Gemini JPEGs for the canonical example plus runtime Gemini visuals for custom stories
- Structured beat visual briefs and shared character and setting continuity
- Bounded semantic scene QA with one repair and a neutral failure state
- Content-hash image reuse with memory, IndexedDB, and server LRU caches
- Target-free shareable study stimuli with content fingerprints
- Direct imperative WebMCP registration using `webmcp-types`

## Quality Checks

```bash
npm test
npm run lint
npm run build
npm run test:e2e
npm run acceptance:storyboard -- --images
```

Vitest covers domain invariants, structured visual contracts, bounded story and scene quality gates, revision and undo visual integrity, both Audience source contracts, target-blind study behavior, demo fixture validation and failure protection, and WebMCP tool contracts. Playwright covers progressive scene placeholders, retryable image failure, collapsed revision assistance, proposal/apply/cancel with visual replacement and undo, Audience integration, start-over behavior, desktop/tablet/mobile bounds, normal use without WebMCP, native WebMCP execution, and ten identical runs of the deterministic demo journey.

The acceptance runner generates comedy, warm family, awkward social, suspense/reveal, and bittersweet storyboards. With `--images`, it also creates all scene images and writes review artifacts to `/private/tmp/payoff-storyboard-acceptance`. Use `--reuse-text`, `--case=<id>`, and `--beat=<1-6>` for bounded visual reruns. Automated acceptance is a gate, not a substitute for manually reviewing every final scene and the six deterministic starter scenes.

## Deploy to Cloud Run

The checked-in scripts use `GCP_PROJECT_ID` when set and otherwise use the active Google Cloud CLI project. They default to region `us-central1` and service name `payoff`. Authenticate the Google Cloud CLI, choose your project, then create or update the two runtime secrets from a local ignored `.env` file and deploy:

```bash
gcloud auth login
gcloud config set project YOUR_PROJECT_ID
./scripts/configure-cloud-run-secrets.sh
./scripts/deploy-cloud-run.sh
```

The default deployment is publicly reachable and calls paid model APIs. Before operating it beyond a controlled demo, configure provider budgets and add the abuse controls appropriate to your environment, such as authenticated access or an external distributed rate limiter.

The deployment script enables the required APIs, creates the Artifact Registry repository and dedicated `payoff-cloud-run` runtime service account when absent, handles the reduced default Cloud Build permissions used by post-2024 GCP projects, builds the `Dockerfile`, and deploys publicly. Secret values are never printed, copied into the build context, or baked into the image. Optional model variables can be overridden when invoking the script:

```bash
OPENAI_MODEL=gpt-5.4-mini \
OPENAI_SCENE_REVIEW_MODEL=gpt-5.4 \
GEMINI_IMAGE_MODEL=gemini-3.1-flash-lite-image \
./scripts/deploy-cloud-run.sh
```

### Cloud Run reliability profile

The default deployment uses 2 vCPU, 2 GiB memory, concurrency 4, startup CPU boost, a 600-second request timeout, and up to 10 instances. This leaves bounded headroom for Sharp processing, Gemini generation, OpenAI semantic review, and one repair without allowing many image-heavy requests to compete inside one process.

The browser requests custom scenes progressively in story order. Each scene is an independent `/api/scene` request with its own bounded provider retries and neutral failure response, so one slow or failed scene does not discard the storyboard or stop completed cards. A scale-from-zero cold start may affect the first request's latency but not state integrity. In-memory deduplication and LRU caches are performance optimizations within one warm instance; they are never durable state and may disappear on restart or scale-out.

The Vercel function adapters remain as secondary compatibility entrypoints. The historical GitHub Pages workflow can publish only the static client; it cannot run Payoff's server-side AI and is not a complete production deployment.

## License

[MIT](./LICENSE)

Contributions are welcome; see [CONTRIBUTING.md](./CONTRIBUTING.md). Please report vulnerabilities privately as described in [SECURITY.md](./SECURITY.md).
