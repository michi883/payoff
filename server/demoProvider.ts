import storyboardMetadata from "../src/demo/looks-great/storyboard.json" with { type: "json" };
import revisionFixtureValue from "../src/demo/looks-great/revision-make-opening-faster.json" with { type: "json" };
import baselineAiAudienceFixtureValue from "../src/demo/looks-great/ai-audience-baseline.json" with { type: "json" };
import aiAudienceFixtureValue from "../src/demo/looks-great/ai-audience.json" with { type: "json" };
import humanAudienceFixtureValue from "../src/demo/looks-great/human-audience.json" with { type: "json" };
import aiDiagnosisFixtureValue from "../src/demo/looks-great/ai-diagnosis.json" with { type: "json" };
import baselineAiDiagnosisFixtureValue from "../src/demo/looks-great/ai-diagnosis-baseline.json" with { type: "json" };
import sceneAssets from "../src/demo/looks-great/scene-assets.json" with { type: "json" };
import humanResponseFixtureValue from "../src/demo/looks-great/human-responses.json" with { type: "json" };
import { DEMO_TIMING_MS } from "../src/demo/timing.ts";
import {
  BASELINE_BEATS,
  BASELINE_CONTENT_HASH,
  BASELINE_VERSION_ID,
  LOOKS_GREAT_CONTINUITY,
  PROJECT_BRIEF,
  storyContentHash,
} from "../src/domain/seed.ts";
import type { StoryBeat } from "../src/domain/types.ts";
import { generatedArtwork, stableHash } from "../src/domain/visuals.ts";
import {
  AudienceModelOutputSchema,
  DiagnosisModelOutputSchema,
  HumanAudienceModelOutputSchema,
  HumanResponseSchema,
  RevisionStructuredOutputSchema,
  StoryboardModelOutputSchema,
  type AudienceRequest,
  type DiagnoseRequest,
  type HumanAudienceRequest,
  type ReviseRequest,
  type StoryboardRequest,
} from "./aiSchemas.ts";
import { DemoFixtureError } from "./demoErrors.ts";
import type { PayoffAIProvider } from "./openaiProvider.ts";
import { normalizeRevisionOutput } from "./revision.ts";

export const DEMO_REVISED_VERSION_ID = "looks-great-r2";

function canonicalValue(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (value && typeof value === "object") {
    return Object.fromEntries(Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([left], [right]) => left.localeCompare(right))
      .map(([key, item]) => [key, canonicalValue(item)]));
  }
  return value;
}

function fixtureFingerprint(value: unknown) {
  return stableHash(canonicalValue(value));
}

function checked<T>(name: string, parse: () => T): T {
  try {
    return parse();
  } catch (error) {
    throw new DemoFixtureError(name, error instanceof Error ? error.message : "schema validation failed");
  }
}

function delay(milliseconds: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, milliseconds));
}

const storyboardFixture = checked("looks-great-storyboard", () => StoryboardModelOutputSchema.parse({
  title: PROJECT_BRIEF.title,
  target_payoff: PROJECT_BRIEF.targetSummary,
  visual_continuity: LOOKS_GREAT_CONTINUITY,
  beats: BASELINE_BEATS.map((beat) => ({
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    intendedEmotion: beat.intendedEmotion,
    visual: beat.visual.spec,
  })),
}));

const revisionFixture = checked("revision-make-opening-faster", () => RevisionStructuredOutputSchema.parse(revisionFixtureValue));
const baselineAiAudienceFixture = checked("ai-audience-baseline", () => AudienceModelOutputSchema.parse(baselineAiAudienceFixtureValue));
const aiAudienceFixture = checked("ai-audience", () => AudienceModelOutputSchema.parse(aiAudienceFixtureValue));
const humanAudienceFixture = checked("human-audience", () => HumanAudienceModelOutputSchema.parse(humanAudienceFixtureValue));
const aiDiagnosisFixture = checked("ai-diagnosis", () => DiagnosisModelOutputSchema.parse(aiDiagnosisFixtureValue));
const baselineAiDiagnosisFixture = checked("ai-diagnosis-baseline", () => DiagnosisModelOutputSchema.parse(baselineAiDiagnosisFixtureValue));

const canonicalRevisionRequest: ReviseRequest = {
  creator_request: "Make the opening faster",
  story: { id: PROJECT_BRIEF.id, title: PROJECT_BRIEF.title, beats: structuredClone(BASELINE_BEATS) },
  emotional_target: {
    natural_language: PROJECT_BRIEF.audienceFeeling!,
    summary: PROJECT_BRIEF.targetSummary!,
    setup: PROJECT_BRIEF.target.setupEmotion,
    payoff: PROJECT_BRIEF.target.payoffEmotion,
    realization: PROJECT_BRIEF.target.realization,
    constraints: PROJECT_BRIEF.target.constraints,
  },
  selected_beat_id: null,
  expected_version: BASELINE_VERSION_ID,
  testing_context: null,
};

function normalizeDemoRevisionRequest(value: string) {
  return value.trim().replace(/\.+$/u, "").trim().toLocaleLowerCase("en-US");
}

const normalizedRevision = checked("revision-make-opening-faster", () => {
  const result = normalizeRevisionOutput(revisionFixture, canonicalRevisionRequest);
  if (!result.ok) throw new Error(result.failure.category);
  return result.output;
});

export const DEMO_REVISED_BEATS: StoryBeat[] = BASELINE_BEATS.map((beat) => {
  const change = normalizedRevision.changes.find((candidate) => candidate.beat_id === beat.id);
  if (!change) return structuredClone(beat);
  return {
    id: beat.id,
    order: beat.order,
    ...structuredClone(change.replacement),
    visual: generatedArtwork(change.replacement.visual, LOOKS_GREAT_CONTINUITY),
  };
});

export const DEMO_REVISED_STORY_HASH = storyContentHash(
  PROJECT_BRIEF.id,
  DEMO_REVISED_VERSION_ID,
  DEMO_REVISED_BEATS,
  LOOKS_GREAT_CONTINUITY,
);
export const DEMO_REVISED_BEAT_FINGERPRINT = fixtureFingerprint(DEMO_REVISED_BEATS);

const responseFixture = checked("human-responses", () => {
  if (humanResponseFixtureValue.provenance?.kind !== "rehearsal") throw new Error("provenance must be rehearsal");
  if (humanResponseFixtureValue.storyVersion !== DEMO_REVISED_VERSION_ID) throw new Error("story version mismatch");
  if (humanResponseFixtureValue.storyHash !== DEMO_REVISED_STORY_HASH) throw new Error("story hash mismatch");
  const responses = humanResponseFixtureValue.responses.map((item) => HumanResponseSchema.parse(item.response));
  if (new Set(responses.map((response) => response.id)).size !== responses.length) throw new Error("response IDs must be unique");
  return { exports: humanResponseFixtureValue.responses, responses };
});

checked("looks-great-storyboard", () => {
  if (storyboardMetadata.storyVersion !== BASELINE_VERSION_ID || storyboardMetadata.storyHash !== BASELINE_CONTENT_HASH) {
    throw new Error("canonical version provenance mismatch");
  }
  if (JSON.stringify(storyboardMetadata.beatIds) !== JSON.stringify(BASELINE_BEATS.map((beat) => beat.id))) {
    throw new Error("canonical beat IDs mismatch");
  }
  if (JSON.stringify(storyboardMetadata.artKeys) !== JSON.stringify(BASELINE_BEATS.map((beat) => beat.visual.source === "canonical" ? beat.visual.key : null))) {
    throw new Error("canonical asset references mismatch");
  }
  return true;
});

checked("revision-make-opening-faster-scene", () => {
  const revised = DEMO_REVISED_BEATS[0];
  const entry = sceneAssets["revision-make-opening-faster"];
  if (entry.storyVersion !== DEMO_REVISED_VERSION_ID || entry.beatId !== revised.id || entry.contentHash !== revised.visual.contentHash) {
    throw new Error("revised visual provenance mismatch");
  }
  if (entry.asset !== "./assets/drawing-offer-faster.png") throw new Error("unexpected revised visual asset");
  return true;
});

function assertCanonicalBeats(name: string, beats: StoryBeat[], version: string) {
  if (version !== BASELINE_VERSION_ID || fixtureFingerprint(beats) !== fixtureFingerprint(BASELINE_BEATS)) {
    throw new DemoFixtureError(name, "expected the reviewed Looks Great baseline");
  }
}

function isCanonicalBaseline(beats: StoryBeat[], version: string) {
  return version === BASELINE_VERSION_ID && fixtureFingerprint(beats) === fixtureFingerprint(BASELINE_BEATS);
}

function assertRevisedBeats(name: string, beats: StoryBeat[], version: string) {
  if (version !== DEMO_REVISED_VERSION_ID || fixtureFingerprint(beats) !== DEMO_REVISED_BEAT_FINGERPRINT) {
    throw new DemoFixtureError(name, "expected the exact cached opening revision");
  }
}

export function createDemoAIProvider(options: { timingScale?: number } = {}): PayoffAIProvider {
  const timingScale = options.timingScale ?? 1;
  const pause = (milliseconds: number) => delay(milliseconds * timingScale);
  return {
    storyboard: async (input: StoryboardRequest) => {
      if (input.premise !== PROJECT_BRIEF.topic) throw new DemoFixtureError("looks-great-storyboard", "unknown premise");
      await pause(DEMO_TIMING_MS.storyboard);
      return structuredClone(storyboardFixture);
    },
    reviewStoryboard: async () => ({ passed: true, issues: [] }),
    repairStoryboard: async () => { throw new DemoFixtureError("looks-great-storyboard-repair"); },
    verifyStoryboardRepair: async () => ({ passed: true, unresolved: [] }),
    canonicalizeRevisionRequest: (creatorRequest: string) => normalizeDemoRevisionRequest(creatorRequest) === normalizeDemoRevisionRequest(canonicalRevisionRequest.creator_request)
      ? canonicalRevisionRequest.creator_request
      : creatorRequest,
    revise: async (input: ReviseRequest) => {
      if (normalizeDemoRevisionRequest(input.creator_request) !== normalizeDemoRevisionRequest(canonicalRevisionRequest.creator_request)
        || input.selected_beat_id !== null
        || input.testing_context !== null) {
        throw new DemoFixtureError("revision-make-opening-faster", "unknown revision request");
      }
      assertCanonicalBeats("revision-make-opening-faster", input.story.beats, input.expected_version);
      await pause(DEMO_TIMING_MS.revision);
      return structuredClone(revisionFixture);
    },
    audience: async (input: AudienceRequest) => {
      const baseline = isCanonicalBaseline(input.beats, input.expected_version);
      if (!baseline) assertRevisedBeats("ai-audience", input.beats, input.expected_version);
      await pause(DEMO_TIMING_MS.aiAudience);
      return structuredClone(baseline ? baselineAiAudienceFixture : aiAudienceFixture);
    },
    humanAudience: async (input: HumanAudienceRequest) => {
      assertRevisedBeats("human-audience", input.beats, input.expected_version);
      if (input.story_hash !== DEMO_REVISED_STORY_HASH
        || JSON.stringify(input.responses.map((response) => response.id)) !== JSON.stringify(responseFixture.responses.map((response) => response.id))) {
        throw new DemoFixtureError("human-audience", "response provenance mismatch");
      }
      await pause(DEMO_TIMING_MS.humanAudience);
      return structuredClone(humanAudienceFixture);
    },
    diagnose: async (input: DiagnoseRequest) => {
      if (input.audience_source !== "ai") throw new DemoFixtureError("human-diagnosis");
      const baseline = isCanonicalBaseline(input.story.beats, input.expected_version);
      if (!baseline) assertRevisedBeats("ai-diagnosis", input.story.beats, input.expected_version);
      await pause(DEMO_TIMING_MS.diagnosis);
      return structuredClone(baseline ? baselineAiDiagnosisFixture : aiDiagnosisFixture);
    },
  };
}

export function getDemoResponseExports() {
  return structuredClone(responseFixture.exports);
}
