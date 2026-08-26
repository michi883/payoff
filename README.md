# Payoff

Payoff is an agent-native story room for shaping the **emotional payoff** of a short story with real audience evidence.

The creator defines what an audience should feel. Viewers react to the exact story without seeing that target. A browser agent can then inspect the creative brief, storyboard, and collected reactions through WebMCP, diagnose the gap, and stop. The human chooses the creative tradeoff; only then does the agent edit the shared storyboard through primitive WebMCP tools.

**Intent → Story → Reaction → Diagnosis → Human Direction → Revision → Test Again**

Payoff does not include an embedded chatbot, model backend, synthetic audience, or automatic story optimizer.

## Current status

The immutable **Nothing Urgent** baseline and target-blind audience viewer are ready for research. No audience findings are bundled or simulated. The creator workspace starts at `0/12 minimum` and displays only the number of valid, version-matched response files actually imported.

## Run locally

Requirements: Node.js 22+ and npm 10+.

```bash
npm install
npm run dev
```

Open:

- Creator workspace: [http://localhost:5173/](http://localhost:5173/)
- Target-blind audience viewer: [http://localhost:5173/study](http://localhost:5173/study)

Quality checks:

```bash
npm test
npm run lint
npm run build
npm run test:e2e
```

## Collect real responses

1. Deploy the app and give each participant only the `/study` URL. Do not disclose the emotional target.
2. The viewer automatically shows all six beats before presenting any question.
3. The participant answers ending emotion, meaning, surprise, prediction timing, and the beat that most changed their reaction.
4. They may optionally watch a separate second pass and tag individual beats.
5. The participant downloads or copies the anonymous JSON response and returns it to the researcher.
6. In the creator workspace, choose **Import response files** and select the collected JSON files.
7. Collect at least 12 valid responses. Twelve is a minimum, not a display constant; Payoff always shows the actual accepted count.

An imported response must declare that the target was hidden and the first viewing was uninterrupted. It must also match the immutable story version and its content fingerprint. Duplicate IDs, malformed files, and responses for another story version are rejected.

The JSON contains no requested name, email address, IP address, or device identifier. Public quotes appear only when the participant opted in; non-consented free text is not rendered in the workspace.

If the baseline lands exactly as intended, revise the baseline and run a fresh test. Do not manufacture a mismatch or cherry-pick responses.

## WebMCP tools

Payoff registers six imperative tools with `document.modelContext.registerTool(...)`:

| Tool | Kind | Purpose |
| --- | --- | --- |
| `get_story_brief` | Read | Read the intent, constraints, evidence status, and internal version IDs. |
| `list_story_beats` | Read | Read the ordered active storyboard or one stable beat ID. |
| `get_audience_reactions` | Read, untrusted content | Read real findings attached to the tested version. |
| `create_story_beat` | Write | Insert one visible beat after explicit creator direction. |
| `replace_story_beat` | Write | Replace one beat while preserving its ID and position. |
| `move_story_beat` | Write | Reorder one existing beat. |

All write tools require `expected_version`; stale calls fail without changing state. Human controls and WebMCP tools call the same validated domain commands. Every successful edit creates an immutable internal version, persists locally, highlights the affected card, and returns verification data.

The creator-facing status intentionally hides incidental mutation numbers:

- `Tested v1 · {actual count} viewers`
- `Untested revision · based on tested v1`

Audience evidence remains permanently attached to the tested version. A revision receives no inferred audience score.

## Test WebMCP

- Open the deployed app in ChatGPT's in-app browser, which supports site tools.
- Or use Chrome 149+ with `chrome://flags/#enable-webmcp-testing` enabled, then restart Chrome.
- Inspect the six available tools.
- During diagnosis, use only the three read tools. The agent should make no edit until the creator explicitly gives creative direction.

Pre-research evidence-neutral prompt:

> What did viewers actually experience, and how did that differ from my target?

Once honest research establishes the demonstrated mismatch, the creator can provide a concrete direction such as:

> Keep beats 1–4. Make the realization that both people outsourced the relationship. No death.

The deterministic demo replacement changes beats 5 and 6, but it remains labeled as an untested revision.

## Architecture

- Vite, React, and TypeScript
- Framework-independent external store consumed with `useSyncExternalStore`
- Immutable story versions and optimistic `expected_version` concurrency
- LocalStorage persistence and evidence-preserving demo reset
- Direct imperative WebMCP registration using `webmcp-types`
- Original inline SVG scene system; no remote assets
- Static Vercel deployment; no database, authentication, runtime model API, or secrets
- Vitest unit/tool tests and Playwright browser tests

## Deploy

The repository contains `vercel.json` with a single-page-app rewrite. On Vercel:

- Build command: `npm run build`
- Output directory: `dist`
- Framework preset: Vite

Both `/` and `/study` resolve to the application entry point.

## Evidence provenance

Each accepted response retains:

- anonymous response ID;
- exact tested story version and content fingerprint;
- submission timestamp;
- research method assertions;
- full first-pass answers;
- quote consent;
- separately labeled optional second-pass reactions.

Before submission, the final repository should include the anonymized study dataset and its exact question wording only after consent and validation. Temporary or AI-generated audience quotes must never be substituted for collected evidence.

## License

[MIT](./LICENSE)
