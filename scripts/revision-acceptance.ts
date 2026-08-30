import { readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { BASELINE_BEATS, BASELINE_VERSION_ID, PROJECT_BRIEF } from "../src/domain/seed";

const baseUrl = process.env.PAYOFF_ACCEPTANCE_URL ?? "http://127.0.0.1:5173";
const fixtureRoot = process.env.PAYOFF_REVISION_FIXTURE_ROOT ?? "/private/tmp/payoff-storyboard-acceptance-production";
const reportPath = process.env.PAYOFF_REVISION_REPORT ?? "/private/tmp/payoff-revision-acceptance.json";
const selectedCase = process.argv.find((value) => value.startsWith("--case="))?.slice("--case=".length);

type FixtureStory = {
  id: string;
  title: string;
  beats: typeof BASELINE_BEATS;
  emotionalTarget: {
    natural_language: string;
    summary: string;
    setup: string;
    payoff: string;
    realization: string;
    constraints: string[];
  };
  version: string;
};

type AcceptanceCase = {
  id: string;
  story: string;
  request: string;
  selectedBeat?: number;
  expectedBeatIds?: string[];
  allowClarification?: boolean;
};

function generatedBeats(beats: Array<Record<string, unknown>>) {
  return beats.map((beat, index) => ({
    ...beat,
    id: `beat-${index + 1}`,
    order: index + 1,
    visual: {
      source: "generated",
      spec: beat.visual,
      contentHash: `scene:${String(index + 1).padStart(8, "0")}`,
    },
  })) as typeof BASELINE_BEATS;
}

async function customFixture(id: string): Promise<FixtureStory> {
  const stored = JSON.parse(await readFile(join(fixtureRoot, id, "storyboard.json"), "utf8"));
  return {
    id: `acceptance-${id}`,
    title: stored.story.title,
    beats: generatedBeats(stored.story.beats),
    emotionalTarget: {
      natural_language: stored.premise.intended_feeling,
      summary: stored.story.target_payoff,
      setup: "The requested opening feeling.",
      payoff: stored.premise.intended_feeling,
      realization: stored.story.target_payoff,
      constraints: [],
    },
    version: `acceptance-${id}-v1`,
  };
}

const looksGreat: FixtureStory = {
  id: PROJECT_BRIEF.id,
  title: PROJECT_BRIEF.title,
  beats: BASELINE_BEATS,
  emotionalTarget: {
    natural_language: PROJECT_BRIEF.audienceFeeling!,
    summary: PROJECT_BRIEF.targetSummary!,
    setup: PROJECT_BRIEF.target.setupEmotion,
    payoff: PROJECT_BRIEF.target.payoffEmotion,
    realization: PROJECT_BRIEF.target.realization,
    constraints: PROJECT_BRIEF.target.constraints,
  },
  version: BASELINE_VERSION_ID,
};

const cases: AcceptanceCase[] = [
  { id: "exact-floower", story: "looks-great", request: "instead of sticking her drawing to the refrigerator, have her stick her drawing to the floower", expectedBeatIds: ["beat-4"], allowClarification: true },
  { id: "scene-2-funnier", story: "looks-great", request: "Make scene 2 funnier", expectedBeatIds: ["beat-2"] },
  { id: "dad-less-uncaring", story: "looks-great", request: "Make Dad look less uncaring" },
  { id: "fridge-to-table", story: "looks-great", request: "Change the refrigerator scene so she leaves the drawing on the table", expectedBeatIds: ["beat-4"] },
  { id: "except-ending", story: "looks-great", request: "Keep everything except the ending", expectedBeatIds: ["beat-6"] },
  { id: "warmer-payoff", story: "looks-great", request: "Make the payoff warmer", expectedBeatIds: ["beat-6"] },
  { id: "typo-heavy", story: "looks-great", request: "pls mke scne 1 quiker n dad mor bizzy", expectedBeatIds: ["beat-1"], allowClarification: true },
  { id: "ambiguous-stand", story: "looks-great", request: "Put the new drawing on the stand instead", allowClarification: true },
  { id: "selected-scene", story: "looks-great", request: "Make this scene feel lonelier", selectedBeat: 3, expectedBeatIds: ["beat-3"] },
  { id: "multi-beat", story: "looks-great", request: "Make Dad look less uncaring in the first two scenes" },
  { id: "comedy-chaos", story: "comedy", request: "Make scene 2's sneeze more chaotic", expectedBeatIds: ["beat-2"] },
  { id: "comedy-ending", story: "comedy", request: "Keep the win but make the ending quieter", expectedBeatIds: ["beat-6"] },
  { id: "comedy-baker", story: "comedy", request: "Make the baker anxious without seeming pathetic" },
  { id: "family-doorway", story: "warm-family", request: "In the doorway scene, have her grandson arrive instead", expectedBeatIds: ["beat-4"] },
  { id: "family-payoff", story: "warm-family", request: "Make the payoff feel warmer", expectedBeatIds: ["beat-6"] },
  { id: "family-grandma", story: "warm-family", request: "Make Grandma seem confused but not helpless" },
  { id: "social-scene-3", story: "awkward-social", request: "Make scene 3 more painfully uncomfortable", expectedBeatIds: ["beat-3"] },
  { id: "social-ending", story: "awkward-social", request: "Keep everything except make the ending less tidy", expectedBeatIds: ["beat-6"] },
  { id: "suspense-clue", story: "suspense-reveal", request: "Make the dog clue less obvious before the reveal" },
  { id: "suspense-scene-4", story: "suspense-reveal", request: "Make scene 4's reveal gentler", expectedBeatIds: ["beat-4"] },
  { id: "soup-handoff", story: "bittersweet", request: "At the recipe handoff, let the granddaughter reach for it first", expectedBeatIds: ["beat-5"] },
  { id: "soup-ending", story: "bittersweet", request: "Make the final spoonful warmer without becoming sentimental", expectedBeatIds: ["beat-6"] },
];

async function main() {
  const stories = new Map<string, FixtureStory>([["looks-great", looksGreat]]);
  for (const id of ["comedy", "warm-family", "awkward-social", "suspense-reveal", "bittersweet"]) {
    stories.set(id, await customFixture(id));
  }
  const report = [];
  const activeCases = selectedCase ? cases.filter((testCase) => testCase.id === selectedCase) : cases;
  if (activeCases.length === 0) throw new Error(`Unknown revision acceptance case: ${selectedCase}`);
  for (const testCase of activeCases) {
    const story = stories.get(testCase.story)!;
    const startedAt = Date.now();
    const response = await fetch(`${baseUrl}/api/revise`, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({
        creator_request: testCase.request,
        story: { id: story.id, title: story.title, beats: story.beats },
        emotional_target: story.emotionalTarget,
        selected_beat_id: testCase.selectedBeat ? `beat-${testCase.selectedBeat}` : null,
        expected_version: story.version,
        testing_context: null,
      }),
    });
    const payload = await response.json();
    const beatIds = Array.isArray(payload.changes) ? payload.changes.map((change: { beat_id: string }) => change.beat_id) : [];
    const acceptedKind = payload.kind === "revision" || payload.kind === "clarification";
    const clarificationAllowed = payload.kind !== "clarification" || testCase.allowClarification === true || !testCase.expectedBeatIds;
    const expectedTargets = payload.kind !== "revision" || !testCase.expectedBeatIds
      || beatIds.every((beatId: string) => testCase.expectedBeatIds!.includes(beatId))
        && testCase.expectedBeatIds.some((beatId) => beatIds.includes(beatId));
    const passed = response.ok && acceptedKind && clarificationAllowed && expectedTargets
      && (payload.kind !== "revision" || beatIds.length > 0);
    const row = {
      id: testCase.id,
      story: testCase.story,
      request: testCase.request,
      status: response.status,
      latency_ms: Date.now() - startedAt,
      kind: payload.kind ?? null,
      beat_ids: beatIds,
      proposed_actions: Array.isArray(payload.changes) ? payload.changes.map((change: { replacement?: { action?: string } }) => change.replacement?.action ?? null) : [],
      question: payload.clarification_question ?? null,
      error_code: payload.error?.code ?? null,
      passed,
    };
    report.push(row);
    console.log(JSON.stringify(row));
  }
  await writeFile(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  const failures = report.filter((item) => !item.passed);
  console.log(`Revision acceptance: ${report.length - failures.length}/${report.length} passed. Report: ${reportPath}`);
  if (failures.length > 0) process.exitCode = 1;
}

void main();
