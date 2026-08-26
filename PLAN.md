# Payoff — Product and Implementation Plan

Status: research-ready implementation deployed; audience collection and target-browser verification pending
Last updated: August 26, 2026
Submission deadline: September 3, 2026 at 1:00 p.m. PDT / 4:00 p.m. EDT

## 1. Product decision

Build Payoff as a local-first, single-page story room where a creator and the browser's AI agent work on the same live storyboard. Payoff owns the structured creative state and the audience evidence. The browser agent supplies the analysis and creative reasoning through WebMCP; Payoff does not embed a second chat interface or call an LLM API.

The central loop is:

**Intent → Story → Reaction → Diagnosis → Human Direction → Revision → Test Again**

The division of labor is deliberate. The human defines the intended emotion and decides which creative tradeoff to make. The agent examines the storyboard and real audience evidence, diagnoses the gap, and may explain possible tradeoffs, but it does not automatically optimize or edit the story. Only after the human gives explicit direction does the agent execute that direction through primitive WebMCP tools. The resulting revision remains untested until people evaluate it.

The smallest compelling product is one polished workflow:

1. The creator defines an emotional intention and sees it beside a six-beat visual storyboard.
2. Viewers react to that exact story version without being shown the creator's intended target.
3. The creator asks their browser agent to compare the intended emotion with the observed response.
4. The agent reads the brief, beats, and reactions through WebMCP, explains the structural mismatch, and stops without changing the story.
5. The creator chooses a creative direction and states the constraint or tradeoff.
6. The agent executes that direction through primitive WebMCP editing tools; the affected cards visibly change and an activity entry records what happened.
7. The prior reactions stay attached to the tested version. The revision is explicitly marked “untested” until a new human test, so Payoff never presents AI-invented feedback as audience evidence.

This is stronger than a generic AI writing app because the agent can inspect evidence and act inside the creator's actual workspace without screen-scraping, copied context, or a parallel model backend.

## 2. Repository audit

The repository is greenfield:

- `INSTRUCTIONS.md` contains the product brief.
- `PLAN.md` was empty before this plan.
- There is no application source, package configuration, test setup, README, license, asset set, or Git history.
- The directory is not yet a Git repository.

Before feature work, initialize Git and make dated commits. The challenge requires a public repository with all source and setup instructions plus a visible open-source license. Because this is a new project during the submission window, its commit history should make that timing clear.

## 3. Challenge and WebMCP constraints

Requirements verified on August 26, 2026:

- The app must be a working WebMCP-powered web app centered on human-agent collaboration.
- Judges must receive a working live URL accessible in ChatGPT's in-app browser or Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled.
- The submission needs an English project description, a public source repository with an open-source license and setup instructions, and a public YouTube demo under three minutes with audio.
- The app must work as shown in the submission. After the September 3 deadline, do not change the submission, submitted repository, or live site during judging.
- The four equally weighted judging criteria are WebMCP leverage, execution, potential impact, and creativity/ambition. WebMCP is also the first tie-break criterion.

Implementation implications:

- Use the current imperative API, `document.modelContext.registerTool(...)`, with feature detection.
- Register narrow JSON-schema inputs with `additionalProperties: false`; use stable IDs and validate all inputs again in the command layer.
- Mark read tools with `readOnlyHint: true`. Mark the reaction-reading tool with `untrustedContentHint: true` because it returns audience-authored comments.
- Keep tool names and parameter names under 30 characters, parameter descriptions under 150 characters, tool descriptions under 500 characters, and each result under roughly 1,500 characters.
- Return enough structured information for the agent to verify mutations, including affected beat IDs and the new story version.
- Preserve the normal human interface when WebMCP is unavailable. Do not claim that the development harness is WebMCP.
- Register tools once against a stable external store and clean them up with `AbortController`; pass execution cancellation signals to any asynchronous work.

Primary references:

- [Official challenge overview and requirements](https://webmcp.devpost.com/)
- [Official rules](https://webmcp.devpost.com/rules)
- [OpenAI challenge page](https://openai.com/webmcp-challenge/)
- [OpenAI site tools guide](https://learn.chatgpt.com/docs/webmcp)
- [Chrome imperative API guide](https://developer.chrome.com/docs/ai/webmcp/imperative-api)
- [Chrome tool security guidance](https://developer.chrome.com/docs/ai/webmcp/secure-tools)
- [WebMCP draft specification](https://webmachinelearning.github.io/webmcp/)

## 4. Hero demo: “Nothing Urgent”

### Seeded creative brief

- Title: **Nothing Urgent**
- Topic: outsourcing intimacy to AI
- Format: 60-second vertical short
- Emotional target: **laugh at the convenience, then feel an “oh-shit” realization that neither person is participating in the relationship**

### Baseline candidate for tested version 1

The six illustrated cards establish a son increasingly delegating communication with his mother:

1. His phone suggests the perfect emoji response; he accepts it without reading.
2. It summarizes a rambling voice note as “Nothing urgent.”
3. It generates an affectionate reply while he keeps scrolling.
4. A comic montage shows their effortless “daily” message streak.
5. The tone turns to an empty chair and an unheard final voice note.
6. At a funeral, the phone offers to “automate grief.”

Treat the baseline as a research stimulus, not proof of a predetermined failure. Show the complete story without revealing the intended emotional target, collect the responses, and use the actual observed difference—if any—to finalize the demo diagnosis. If this baseline lands exactly as intended, revise the baseline and test the new version with fresh viewers rather than manufacturing, selectively quoting, or relabeling evidence. The final demo baseline must be the exact version that produced the displayed responses.

### Exact 60–90 second evidence-locked demo run

| Time | Creator/agent action | Visible proof |
| --- | --- | --- |
| 0–10s | Open the seeded room. | Target, six beat cards, `Tested v1 · {actual valid count} viewers`, and actual audience findings are visible together. |
| 10–18s | Creator: “What did viewers actually experience, and how did that differ from my target?” | The browser agent begins using the page's site tools. |
| 18–35s | Agent calls `get_story_brief`, `list_story_beats`, and `get_audience_reactions`. | Tool activity appears unobtrusively in the room; no state changes yet. |
| 35–45s | Agent explains the actual observed mismatch and the story mechanics that caused it, then stops. | Diagnosis cites specific beats and human findings; no write tool is called. |
| 45–52s | Creator: “Keep beats 1–4. Make the realization that both people outsourced the relationship. No death.” | Human judgment sets the revision constraint. |
| 52–68s | Agent calls `replace_story_beat` for beats 5 and 6. | Each card changes and pulses as its illustration and copy update; the room becomes an `Untested revision · based on tested v1`. |
| 68–80s | Agent summarizes how it executed the creator's direction. | New ending shows both people alive while their phones autonomously exchange affection; the evidence remains permanently labeled with the tested version and actual valid response count. |

The replacement ending is deterministic:

- Beat 5 reveals the mother also tapping an auto-reply without listening.
- Beat 6 pulls wide: both people are alive in separate rooms while their phones keep the loving conversation going without them.

The operational sequence and replacement ending are deterministic. The evidence values and diagnosis language are not predetermined: lock them only after honest research reveals a real mismatch. “No death” is the creator's explicit creative choice after diagnosis, not a constraint hidden in the seeded brief or a change the agent makes autonomously.

Record the demo only after this exact sequence succeeds repeatedly in the target browser with the real evidence. The submitted video may be up to three minutes, but the product proof should occupy 60–90 seconds; use the remaining time only for a brief premise and implementation explanation.

## 5. Experience design

Use one screen, optimized first for a 1440×900 desktop capture while remaining usable down to tablet width.

### Top bar

- Payoff wordmark and project title.
- Creator-facing evidence status: `Tested v1 · {actual valid count} viewers` or `Untested revision · based on tested v1`.
- WebMCP status: `Agent ready` or a concise unsupported-browser explanation.
- `Reset demo` action so judges can always restore the known starting state.

### Creative brief rail

- Topic, format, and emotional target shown as first-class objects rather than buried settings.
- A compact target arc such as `amused → recognition → alarm`.
- Human-editable fields for a new room; the demo opens directly to the seeded room.
- Submitting a new brief opens an empty board with a suggested prompt for the browser agent. The agent reads the brief and creates beats through WebMCP; there is no hidden in-app generation service.

### Storyboard

- Six large ordered cards in a film-strip layout.
- Each card includes an original SVG scene, beat title, story action, on-screen/dialogue text, narrative role, and intended emotion.
- Agent mutations animate only the affected cards and never hide the resulting text.
- Human controls support the same create, replace, and move commands as WebMCP.

### Audience evidence

- A target-versus-observed outcome summary centered on ending emotion, interpretation, surprise, prediction timing, and the beat that most changed viewers' reactions.
- Optional per-beat emotion detail only when it was collected in a clearly labeled second pass.
- Sample count and a small set of anonymized quotes or paraphrased findings.
- A permanent provenance label: collection date, sample size, and tested story version.
- No forecasted “new score” after revision. The revised version receives an `Untested` badge until separately tested.

### Activity and control

- A compact activity strip records agent and human mutations in plain language.
- `Undo last change` is always visible after a mutation.
- Motion lasts 150–250 ms and respects `prefers-reduced-motion`.
- All editing and evidence controls are keyboard accessible with visible focus states.

## 6. Data model

Keep the model deliberately small and versioned.

```ts
type Workspace = {
  schemaVersion: 1;
  project: ProjectBrief;
  activeVersionId: string;
  testedVersionId: string;
  versions: StoryVersion[];
  reactionSet: ReactionSet;
  activity: ActivityEntry[];
};

type ProjectBrief = {
  id: string;
  title: string;
  topic: string;
  format: string;
  target: {
    setupEmotion: string;
    payoffEmotion: string;
    realization: string;
    constraints: string[];
  };
};

type StoryBeat = {
  id: string;
  order: number;
  title: string;
  action: string;
  line: string;
  narrativeRole: "setup" | "escalation" | "turn" | "payoff";
  intendedEmotion: string;
  artKey: string;
};

type ReactionSet = {
  id: string;
  storyVersionId: string;
  collectedAt: string;
  sampleSize: number;
  method: string;
  responses: Reaction[];
};
```

Rules:

- Beat IDs remain stable when replacing content and change only for newly created beats.
- Every mutation creates a new immutable story version and an activity record.
- Write commands accept `expected_version`; stale calls fail without changing state.
- Internal version IDs and mutation counts remain available to tools and history but are not foregrounded in the creator UI. Multiple edits may still produce multiple immutable internal versions.
- The creator UI summarizes state as `Tested v1 · {actual valid count} viewers` or `Untested revision · based on tested v1` rather than exposing incidental mutation numbering.
- Reaction selectors aggregate from source responses and always include the tested version ID.
- Store only anonymous reaction IDs. Do not include names, email addresses, or hidden metadata in the app or repository.

## 7. WebMCP tool contract

Expose six primitive tools. The agent performs the analysis; the application does not provide a pre-baked “diagnose my story” or “optimize story” tool. Diagnosis is a read-only phase, and write tools are used only after explicit human direction.

| Tool | Purpose | Key input | Result |
| --- | --- | --- | --- |
| `get_story_brief` | Read the topic, format, target, constraints, and version status. | None | Compact brief and tested/active version IDs. |
| `list_story_beats` | Read the ordered active storyboard. | Optional `beat_id` | Compact beat records with stable IDs. |
| `get_audience_reactions` | Read observed ending emotions, interpretations, surprise, prediction timing, turning beats, and optional second-pass details. | Optional `beat_id`; `quote_limit` ≤ 3 | Bounded findings, sample size, method, and tested version ID. |
| `create_story_beat` | Insert one beat at a precise location. | `after_beat_id`, beat fields, `expected_version` | Created ID, order, and new version. |
| `replace_story_beat` | Replace one beat while preserving its identity and position. | `beat_id`, full replacement fields, `expected_version` | Changed ID, prior/new summary, and new version. |
| `move_story_beat` | Reorder one existing beat. | `beat_id`, `after_beat_id`, `expected_version` | New order and new version. |

Contract details:

- Read tools: `annotations: { readOnlyHint: true }`.
- Reaction tool: also `untrustedContentHint: true`.
- Write tools: `readOnlyHint: false`, descriptions explicitly state that the visible storyboard and persisted state change.
- Text fields use conservative `maxLength` values; `artKey` and `narrativeRole` use enums.
- Errors are actionable and non-mutating: unknown ID, invalid schema, stale version, or beat limit reached.
- Cap the board at eight beats and return at most three quotes per call to keep context bounded.
- Tool handlers call the exact same domain commands as human UI controls.
- All successful mutations focus and briefly highlight the affected card, announce the change through an ARIA live region, persist it, and return verification data.

Do not expose a bulk “rewrite story” tool for the MVP. Primitive operations make the agent's judgment legible, preserve creator control, and demonstrate genuine shared-state collaboration.

The hero eval must fail if the agent calls a write tool during diagnosis or edits beyond the direction the creator later provides. Analysis can surface options, but choosing among them belongs to the human.

## 8. Technical architecture

### Stack

- Vite, React, and TypeScript.
- Plain CSS with design tokens and small SVG components; no component framework or animation dependency.
- A tiny framework-independent external store exposed to React through `useSyncExternalStore`.
- `localStorage` persistence with schema-version validation and a one-click seed reset.
- Direct imperative WebMCP registration with `webmcp-types` for TypeScript definitions; avoid an experimental React wrapper.
- Vitest for unit/integration tests and Playwright for browser tests.
- Static deployment on Vercel. No server, database, authentication, secrets, cookies, or runtime AI API.

### State flow

```text
Human controls ─┐
                ├─> validated domain commands ─> versioned store ─> React UI
WebMCP tools ───┘                                  │
                                                  ├─> localStorage
                                                  └─> activity + live announcement
```

This shared command layer is the central implementation constraint: a tool call must update the same state the creator sees, through the same validation path as a click.

### Suggested file layout

```text
src/
  app/                 app shell and routes
  domain/              types, commands, selectors, validation, store
  demo/                baseline/revised story and reaction dataset
  webmcp/              schemas, descriptors, registration adapter
  components/          brief, storyboard, evidence, activity, status
  art/                 original SVG scene registry
  test/                fixtures and fake ModelContext
tests/e2e/              reset, human edit, and WebMCP command-path tests
public/                 icons and social preview
README.md
LICENSE
```

### Non-WebMCP development harness

Provide a development-only tool inspector that invokes registered descriptors through a fake `ModelContext`. It exists for automated tests and ordinary-browser debugging, is excluded from production, and is never presented as proof of WebMCP compatibility. Final verification must use ChatGPT's in-app browser and Chrome 149+ with WebMCP enabled.

## 9. Audience evidence plan

Human data is a release blocker, not polish.

1. Finalize, content-hash, and deploy an immutable baseline candidate.
2. Recruit at least 12 people who have not been shown the intended emotional target. Twelve is the minimum sample, never a hard-coded display count.
3. Show each participant the entire six-beat story once, uninterrupted. Do not pause for ratings or questions between beats.
4. Immediately after the viewing, collect:
   - their ending emotion, using a fixed vocabulary plus an optional free response;
   - their interpretation of what the story means;
   - whether anything surprised them and, if so, what;
   - whether and when they predicted the ending;
   - which beat most changed their reaction and why.
5. Optionally show the story a second time to collect beat-level reactions. Keep second-pass responses distinct because prior knowledge of the ending changes the viewing experience.
6. Obtain permission to use anonymized quotes in a public demo; otherwise retain only non-identifying aggregates or paraphrases.
7. Export, anonymize, and commit a static JSON dataset with the collection date, method, exact question wording, sample size, tested version ID, and content hash.
8. Analyze the responses before finalizing the hero diagnosis:
   - If a meaningful intention/reaction mismatch exists, describe only what the evidence supports.
   - If the story lands exactly as intended, revise the baseline and test again with fresh viewers.
   - If the result is ambiguous, present it as ambiguous or run another test; do not cherry-pick a cleaner narrative.
9. Keep a README note distinguishing raw collected responses, derived aggregates, optional second-pass data, and any temporary development fixture.

Temporary synthetic fixtures may support development but must be unmistakably labeled and replaced before the release candidate. Never ask an AI model to create or embellish the final audience quotes.

## 10. Implementation phases and gates

### Phase 0 — Lock the proof (August 26)

- [ ] Confirm challenge registration and entrant eligibility.
- [x] Initialize Git and add an MIT license.
- [x] Lock the baseline candidate, deterministic revised ending, neutral research questions, and hero interaction sequence; leave the exact diagnosis evidence-dependent.
- [x] Create and visually verify the single workspace at the target capture resolution.

Gate: a reviewer can understand the intended emotion, baseline story, human-agent decision boundary, and proposed revision without any claim about uncollected reactions.

### Phase 1 — Shared story room (August 27)

- [x] Scaffold Vite/React/TypeScript, linting, tests, and static deployment configuration.
- [x] Implement types, seed loading, immutable versions, commands, selectors, persistence, reset, and undo.
- [x] Build the brief, six-card storyboard, evidence panel, and activity strip with original baseline/revised art.
- [x] Deploy the uninterrupted baseline viewer.
- [ ] Begin target-blind collection.

Gate: human controls and direct command tests mutate the same persisted board; reload and reset are deterministic.

### Phase 2 — WebMCP core (August 28)

- [x] Define the six schemas and concise descriptions.
- [x] Implement feature detection, registration, cleanup, annotations, bounded results, errors, and cancellation handling.
- [x] Add command/tool tests for discovery, reads, mutations, stale versions, invalid evidence, and output budgets.
- [ ] Verify the tools manually in Chrome with WebMCP enabled.

Gate: every tool is discoverable and a successful write visibly updates the board and returns matching verification data.

### Phase 3 — Real evidence and hero path (August 29, repeat if needed)

- [ ] Close the baseline study at 12+ valid responses and analyze it without reference to the desired demo claim.
- [ ] If it lands exactly as intended or is too ambiguous to support a diagnosis, revise the baseline and repeat with fresh viewers rather than manufacturing a mismatch.
- [ ] Freeze the exact tested baseline, anonymize and import its dataset, and verify aggregate calculations and provenance labels.
- [ ] Finalize the creator's opening question and the agent's evidence-backed diagnosis from the actual observed mismatch.
- [ ] Run the exact two-prompt hero flow in the ChatGPT in-app browser.
- [ ] Tune tool descriptions and compact outputs based on observed agent behavior, without encoding the diagnosis.

Gate: the agent independently relates actual reaction evidence to story structure, makes no change during diagnosis, and later performs only the beat changes explicitly directed by the creator.

### Phase 4 — Product polish and reliability (August 30–31)

- [x] Complete visual polish, responsive layout, keyboard flow, ARIA announcements, reduced motion, and empty/error states.
- [ ] Test reset, persistence, unsupported-browser behavior, and all write failures.
- [ ] Run the evidence-backed hero flow from a clean state at least five times in both supported environments; verify that diagnosis remains read-only until human direction.
- [ ] Attend the August 31 office hours only if an API or judging question remains unresolved.

Gate: 5/5 clean hero runs, no console errors, no clipping at capture resolution, and no stale or fabricated evidence after mutation.

### Phase 5 — Release candidate and submission (September 1–2)

- [x] Publish the research-ready public app and public repository; freeze the final release only after evidence and target-browser verification are complete.
- [x] Write a concise README with local setup, architecture, exact WebMCP tools, testing instructions, data provenance, privacy, and demo reset instructions.
- [ ] Add screenshots, social preview, license visibility, and third-party attribution if any.
- [ ] Draft the Devpost description around WebMCP fit, improved UX, new human-agent capability, and implementation.
- [ ] Record a clean under-three-minute YouTube video with audio and no unlicensed music or marks.
- [ ] Test the exact public URLs from a signed-out/incognito context and complete the submission by September 2.

Gate: a judge can understand the value from the first 30 seconds of the video and can reproduce the demo without credentials.

### Deadline buffer (September 3, before 1:00 p.m. PDT)

- [ ] Recheck the live URL, public repository, YouTube visibility, submission fields, and timezone.
- [ ] Submit any final correction before the deadline.
- [ ] After the deadline, freeze the submitted app, repository, and Devpost entry until winners are announced; continue work only in a separate fork if necessary.

## 11. Acceptance criteria

The MVP is complete only when all of the following are true:

- The emotional target, storyboard, and tested audience response are visible in one viewport.
- The app contains real, anonymized reactions tied to a specific immutable story version.
- Supported agents discover all six tools with correct schemas and annotations.
- The three read calls provide enough bounded context for an agent to diagnose the actual observed mismatch.
- The agent calls no write tool during diagnosis and waits for explicit human creative direction.
- The two replacement calls update the correct cards, advance the version, persist on reload, and create visible activity entries.
- Before editing, the creator sees `Tested v1 · {actual valid count} viewers`; afterward they see `Untested revision · based on tested v1`, regardless of internal mutation numbering.
- Audience reactions remain permanently attached to the tested version; the revision receives no inferred audience score before another human test.
- Undo and reset reliably restore prior state and the canonical demo state.
- The exact hero flow passes five consecutive times in ChatGPT's in-app browser and five times in enabled Chrome.
- Human editing still works in a browser without WebMCP, with an honest compatibility message.
- The live app, public repository, license, setup instructions, English description, and public video meet the official submission rules.

## 12. Explicit scope cuts

Do not build these before submission:

- An embedded chatbot, model picker, prompt history, or server-side agent.
- Live AI image generation or live story generation APIs.
- Accounts, cloud sync, multiplayer presence, sharing permissions, or a database.
- A public audience-recruitment platform or live reaction simulation.
- Video editing, audio generation, screenplay formatting, or export pipelines.
- Arbitrary visual asset generation; use the original bounded SVG art registry.
- Automated emotional scoring of the untested revision.
- Multiple demo stories, templates, or broad format support beyond the one new-room form and seeded hero room.

If time slips, cut human drag-and-drop and secondary responsive polish first. Do not cut genuine audience data, the shared command layer, tool verification, visible mutations, evidence versioning, or the deterministic demo reset.

## 13. Main risks and mitigations

| Risk | Mitigation |
| --- | --- |
| Browser API changes or inconsistent support | Keep WebMCP behind one adapter, feature-detect, use current `document.modelContext`, and test both official target environments daily. |
| The agent chooses the wrong tool or over-edits | Keep six orthogonal tools, stable IDs, explicit side effects, strict schemas, expected versions, short outputs, and a fixed five-run eval. |
| Audience evidence is late, ambiguous, or shows that the story already lands | Deploy the baseline on day two, recruit 12+ viewers immediately, preserve the actual result, and revise and retest the baseline with fresh viewers if there is no genuine mismatch. Never revise the data or cherry-pick quotes. |
| Revision appears to have “improved a score” without testing | Pin reactions to the tested baseline and mark the active revision untested. Never generate post-edit reaction metrics. |
| Visual updates look like text-field automation | Change the illustration, copy, emotion marker, evidence-status badge, and activity entry for each affected beat. |
| The demo depends on fragile network services | Use a static app with bundled assets and data, no auth, no backend, no API keys, and a deterministic reset. |
| Submission becomes ineligible | Use original/licensed assets, document data consent and project timing, add a visible license, test public access, submit a day early, and freeze all submitted artifacts after the deadline. |

## 14. Ship order if time is constrained

1. Versioned store and deterministic reset.
2. Three read tools and `replace_story_beat` working end to end.
3. Real tested-baseline reactions and provenance.
4. Polished hero workspace and exact demo flow.
5. `create_story_beat`, `move_story_beat`, undo, and full tests.
6. Responsive and decorative refinements.

This ordering preserves the core proof: an agent sees the creator's intent and real audience response, diagnoses the mismatch without acting, and visibly changes the shared story only after the human chooses a creative direction. The next step is always another human test, not an AI-generated verdict.
