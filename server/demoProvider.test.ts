import { describe, expect, it } from "vitest";
import type { AudienceApiResponse, DiagnoseApiResponse, HumanAudienceApiResponse, ReviseApiResponse } from "../src/ai/contracts";
import { BASELINE_VERSION_ID, createCanonicalWorkspace, LOOKS_GREAT_CONTINUITY, PROJECT_BRIEF } from "../src/domain/seed";
import { PayoffStore } from "../src/domain/store";
import { getActiveBeats } from "../src/domain/selectors";
import type { StudyResponseExport } from "../src/domain/types";
import { handleAudience, handleDiagnose, handleRevise, handleStoryboard } from "./handlers";
import {
  createDemoAIProvider,
  DEMO_REVISED_BEATS,
  DEMO_REVISED_STORY_HASH,
  DEMO_REVISED_VERSION_ID,
  getDemoResponseExports,
} from "./demoProvider";

const target = {
  natural_language: PROJECT_BRIEF.audienceFeeling!,
  summary: PROJECT_BRIEF.targetSummary!,
  setup: PROJECT_BRIEF.target.setupEmotion,
  payoff: PROJECT_BRIEF.target.payoffEmotion,
  realization: PROJECT_BRIEF.target.realization,
  constraints: PROJECT_BRIEF.target.constraints,
};

describe("deterministic demo provider", () => {
  it("validates and serves the reviewed storyboard fixture through the production handler", async () => {
    const result = await handleStoryboard("POST", {
      premise: PROJECT_BRIEF.topic,
      intended_feeling: PROJECT_BRIEF.audienceFeeling,
      format: PROJECT_BRIEF.format,
    }, createDemoAIProvider({ timingScale: 0 }));
    expect(result.status).toBe(200);
    expect((result.body.beats as unknown[])).toHaveLength(6);
  });

  it("applies the cached sparse proposal through the normal immutable version command", async () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const before = store.getSnapshot();
    const result = await handleRevise("POST", {
      creator_request: "Make the opening faster",
      story: { id: before.project.id, title: before.project.title, beats: getActiveBeats(before) },
      emotional_target: target,
      selected_beat_id: null,
      expected_version: before.activeVersionId,
      testing_context: null,
    }, createDemoAIProvider({ timingScale: 0 }));
    expect(result.status).toBe(200);
    const proposal = result.body as ReviseApiResponse;
    const unaffectedArtwork = before.versions[0].beats.slice(1).map((beat) => beat.visual);
    store.applyRevision(
      proposal.changes.map((change) => ({ beatId: change.beat_id, draft: change.replacement })),
      proposal.story_version,
      proposal.summary,
      "agent",
    );
    const after = store.getSnapshot();
    expect(after.activeVersionId).toBe(DEMO_REVISED_VERSION_ID);
    expect(after.versions).toHaveLength(2);
    expect(getActiveBeats(after)[0]).toEqual(DEMO_REVISED_BEATS[0]);
    expect(getActiveBeats(after).slice(1).map((beat) => beat.visual)).toEqual(unaffectedArtwork);
    expect(after.aiPreviews).toHaveLength(0);
    expect(after.humanReports).toHaveLength(0);
  });

  it("accepts the punctuated revision suggestion rendered by the product UI", async () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const before = store.getSnapshot();
    const result = await handleRevise("POST", {
      creator_request: "Make the opening faster.",
      story: { id: before.project.id, title: before.project.title, beats: getActiveBeats(before) },
      emotional_target: target,
      selected_beat_id: null,
      expected_version: before.activeVersionId,
      testing_context: null,
    }, createDemoAIProvider({ timingScale: 0 }));
    expect(result.status).toBe(200);
    const proposal = result.body as ReviseApiResponse;
    expect(proposal.changes).toHaveLength(1);
    store.applyRevision(
      proposal.changes.map((change) => ({ beatId: change.beat_id, draft: change.replacement })),
      proposal.story_version,
      proposal.summary,
      "agent",
    );
    expect(getActiveBeats(store.getSnapshot())[0].visual.contentHash).toBe(DEMO_REVISED_BEATS[0].visual.contentHash);
  });

  it("serves a separately validated AI report and diagnosis for the clean baseline", async () => {
    const beats = createCanonicalWorkspace().versions[0].beats;
    const provider = createDemoAIProvider({ timingScale: 0 });
    const ai = await handleAudience("POST", {
      source: "ai",
      title: PROJECT_BRIEF.title,
      emotional_target: target,
      beats,
      expected_version: BASELINE_VERSION_ID,
    }, provider);
    expect(ai.status).toBe(200);
    const audience = ai.body as AudienceApiResponse;
    expect(audience.story_version).toBe(BASELINE_VERSION_ID);
    expect(audience.audience_landing).toBe("Familiar amusement, a clear guilty sting, then gentle warmth.");
    expect(audience.biggest_opportunity).toContain("Compress Dad's first response");

    const diagnosis = await handleDiagnose("POST", {
      question: "Where is the pacing slow?",
      story: { title: PROJECT_BRIEF.title, beats },
      emotional_target: target,
      audience_source: "ai",
      audience_result: {
        audience_landing: audience.audience_landing,
        match: audience.match,
        observed_arc: audience.observed_arc,
        what_landed: audience.what_landed,
        where_it_drifted: audience.where_it_drifted,
        biggest_opportunity: audience.biggest_opportunity,
        strongest_beat: audience.strongest_beat,
        weakest_beat: audience.weakest_beat,
        main_risk: audience.main_risk,
        changed_audience: audience.changed_audience,
        reaction_notes: audience.reactions.map((reaction) => reaction.note),
        evidence_strength: audience.confidence.note,
      },
      expected_version: BASELINE_VERSION_ID,
    }, provider);
    expect(diagnosis.status).toBe(200);
    expect((diagnosis.body as DiagnoseApiResponse).story_version).toBe(BASELINE_VERSION_ID);
    expect((diagnosis.body as DiagnoseApiResponse).answer).toContain("The main opportunity is pace");
  });

  it("serves exact-version AI, Human, and diagnosis outputs through production contracts", async () => {
    const provider = createDemoAIProvider({ timingScale: 0 });
    const ai = await handleAudience("POST", {
      source: "ai",
      title: PROJECT_BRIEF.title,
      emotional_target: target,
      beats: DEMO_REVISED_BEATS,
      expected_version: DEMO_REVISED_VERSION_ID,
    }, provider);
    expect(ai.status).toBe(200);
    expect((ai.body as AudienceApiResponse).match).toBe("strong");

    const exports = getDemoResponseExports() as StudyResponseExport[];
    const human = await handleAudience("POST", {
      source: "human",
      title: PROJECT_BRIEF.title,
      emotional_target: target,
      beats: DEMO_REVISED_BEATS,
      expected_version: DEMO_REVISED_VERSION_ID,
      story_hash: DEMO_REVISED_STORY_HASH,
      responses: exports.map((item) => item.response),
    }, provider);
    expect(human.status).toBe(200);
    expect((human.body as HumanAudienceApiResponse).response_ids).toHaveLength(4);

    const audience = ai.body as AudienceApiResponse;
    const diagnosis = await handleDiagnose("POST", {
      question: "Why did this work?",
      story: { title: PROJECT_BRIEF.title, beats: DEMO_REVISED_BEATS },
      emotional_target: target,
      audience_source: "ai",
      audience_result: {
        audience_landing: audience.audience_landing,
        match: audience.match,
        observed_arc: audience.observed_arc,
        what_landed: audience.what_landed,
        where_it_drifted: audience.where_it_drifted,
        biggest_opportunity: audience.biggest_opportunity,
        strongest_beat: audience.strongest_beat,
        weakest_beat: audience.weakest_beat,
        main_risk: audience.main_risk,
        changed_audience: audience.changed_audience,
        reaction_notes: audience.reactions.map((reaction) => reaction.note),
        evidence_strength: audience.confidence.note,
      },
      expected_version: DEMO_REVISED_VERSION_ID,
    }, provider);
    expect(diagnosis.status).toBe(200);
    expect((diagnosis.body as DiagnoseApiResponse).story_version).toBe(DEMO_REVISED_VERSION_ID);
  });

  it("fails closed for an unknown demo operation", async () => {
    const result = await handleRevise("POST", {
      creator_request: "Change everything",
      story: { id: PROJECT_BRIEF.id, title: PROJECT_BRIEF.title, beats: createCanonicalWorkspace().versions[0].beats },
      emotional_target: target,
      selected_beat_id: null,
      expected_version: "looks-great-v1",
      testing_context: null,
    }, createDemoAIProvider({ timingScale: 0 }));
    expect(result.status).toBe(500);
    expect(result.body).toHaveProperty("error.code", "MISSING_DEMO_FIXTURE");
    expect(result.body).toHaveProperty("error.message", expect.stringContaining("Missing demo fixture: revision-make-opening-faster"));
  });

  it("keeps revised story provenance stable", () => {
    expect(DEMO_REVISED_STORY_HASH).toBe("fnv1a:5e561bf4");
    expect(DEMO_REVISED_BEATS[0].visual.contentHash).toBe("scene:7a4ac33c");
    expect(DEMO_REVISED_BEATS.slice(1).every((beat) => beat.visual.source === "canonical")).toBe(true);
    expect(LOOKS_GREAT_CONTINUITY.characters).toHaveLength(2);
  });
});
