import { describe, expect, it } from "vitest";
import { BASELINE_BEATS, BASELINE_CONTENT_HASH, BASELINE_VERSION_ID, PROJECT_BRIEF } from "../src/domain/seed";
import { handleAudience, handleDiagnose, handleRevise, handleStoryboard } from "./handlers";
import { createOpenAIProvider, type PayoffAIProvider } from "./openaiProvider";

const emotionalTarget = {
  natural_language: PROJECT_BRIEF.audienceFeeling!,
  summary: PROJECT_BRIEF.targetSummary!,
  setup: PROJECT_BRIEF.target.setupEmotion,
  payoff: PROJECT_BRIEF.target.payoffEmotion,
  realization: PROJECT_BRIEF.target.realization,
  constraints: PROJECT_BRIEF.target.constraints,
};

const storyboardInput = {
  premise: "A confident dad shows up to his daughter's school performance and realizes he misunderstood what she needed.",
  intended_feeling: "surprise, then warmth",
  format: "45-second vertical short",
};

const storyboardOutput = {
  title: "The Wrong Kind of Ready",
  target_payoff: "Confidence → surprise → warmth",
  beats: BASELINE_BEATS.map((beat) => ({
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    intendedEmotion: beat.intendedEmotion,
    artKey: beat.artKey,
  })),
};

const audienceInput = {
  source: "ai" as const,
  title: PROJECT_BRIEF.title,
  emotional_target: emotionalTarget,
  beats: BASELINE_BEATS,
  expected_version: BASELINE_VERSION_ID,
};

const audienceOutput = {
  summary: "The reveal lands, but guilt can outweigh the repair.",
  audience_landing: "Familiar amusement, guilt, then cautious warmth.",
  match: "partial" as const,
  observed_arc: ["amusement", "recognition", "guilt", "cautious warmth"],
  what_landed: "The drawing reveal makes the emotional pattern immediately clear.",
  where_it_drifted: "Dad reads as neglectful long enough for guilt to outweigh the repair.",
  biggest_opportunity: "Show a small sign of care before the reveal without weakening it.",
  strongest_beat: { beat_id: "beat-5", why: "The drawing makes Dad's absence visible." },
  weakest_beat: { beat_id: "beat-6", why: "The repair has little time to register." },
  main_risk: "Guilt may linger longer than warmth.",
  changed_audience: { beat_id: "beat-5", why: "The visual reframes every earlier automatic response." },
  reactions: [
    { persona: "impatient_casual" as const, note: "Gets the pattern quickly.", evidence: "May predict the drawing reveal." },
    { persona: "emotionally_sensitive" as const, note: "Feels the withdrawal sharply.", evidence: "May retain guilt after the repair." },
    { persona: "literal_low_context" as const, note: "Understands the phone substitution.", evidence: "The DAD label makes it explicit." },
    { persona: "experienced_storyteller" as const, note: "Reads the turn cleanly.", evidence: "May want more ending space." },
  ],
  disagreements: ["The repair may feel earned to one lens and too quick to another."],
  confidence: { level: "medium" as const, note: "The visual causality is clear, but this remains a simulation." },
};

const humanAudienceInput = {
  source: "human" as const,
  title: PROJECT_BRIEF.title,
  emotional_target: emotionalTarget,
  beats: BASELINE_BEATS,
  expected_version: BASELINE_VERSION_ID,
  story_hash: BASELINE_CONTENT_HASH,
  responses: [{
    id: "real-response-1",
    storyVersionId: BASELINE_VERSION_ID,
    storyHash: BASELINE_CONTENT_HASH,
    submittedAt: "2026-08-27T12:00:00.000Z",
    endingEmotion: "warm" as const,
    interpretation: "He finally chooses to be present with her.",
    wasSurprised: true,
    predictionPoint: "beat_5" as const,
    changedBeatId: "beat-5",
    changedWhy: "The drawing made his absence visible.",
    quoteConsent: true,
  }],
};

const humanAudienceOutput = {
  summary: "The response recognized the intended repair, but one viewer is too little evidence for a stable verdict.",
  audience_landing: "A guilty realization followed by warmth.",
  match: "partial" as const,
  observed_arc: ["recognition", "guilt", "warmth"],
  what_landed: "The final choice to sit with his daughter felt warm.",
  where_it_drifted: "The drawing reveal made his earlier absence feel heavier than intended.",
  biggest_opportunity: "Clarify that distraction, rather than indifference, drives the pattern.",
  strongest_beat: { beat_id: "beat-6", why: "The physical reconnection supports the intended warmth." },
  weakest_beat: { beat_id: "beat-4", why: "Her withdrawal lets guilt accumulate before the repair." },
  main_risk: "The guilt may remain stronger than the warmth.",
  changed_audience: { beat_id: "beat-5", why: "The drawing reframes every earlier interaction." },
};

const revisionInput = {
  creator_request: "Make Dad seem busy rather than uncaring.",
  story: { title: PROJECT_BRIEF.title, beats: BASELINE_BEATS },
  emotional_target: emotionalTarget,
  selected_beat_id: null,
  expected_version: BASELINE_VERSION_ID,
  testing_context: null,
};

const revisionOutput = {
  kind: "revision" as const,
  summary: "Show a real interruption in the opening.",
  why: "A visible cause makes Dad read as overloaded while preserving the emotional pattern.",
  clarification_question: null,
  changes: [{
    beat_id: "beat-1",
    what_changes: "Dad's distraction gets a visible cause.",
    replacement: {
      ...storyboardOutput.beats[0],
      action: "A girl holds up a drawing while Dad handles a ringing work call and looks apologetically toward her.",
    },
  }],
};

const diagnosisInput = {
  question: "Why does guilt outweigh warmth?",
  story: { title: PROJECT_BRIEF.title, beats: BASELINE_BEATS },
  emotional_target: emotionalTarget,
  audience_source: "ai" as const,
  audience_result: {
    audience_landing: audienceOutput.audience_landing,
    match: audienceOutput.match,
    observed_arc: audienceOutput.observed_arc,
    what_landed: audienceOutput.what_landed,
    where_it_drifted: audienceOutput.where_it_drifted,
    biggest_opportunity: audienceOutput.biggest_opportunity,
    strongest_beat: audienceOutput.strongest_beat,
    weakest_beat: audienceOutput.weakest_beat,
    main_risk: audienceOutput.main_risk,
    changed_audience: audienceOutput.changed_audience,
    reaction_notes: audienceOutput.reactions.map((reaction) => reaction.note),
    evidence_strength: audienceOutput.confidence.note,
  },
  expected_version: BASELINE_VERSION_ID,
};

const diagnosisOutput = {
  answer: "Beats 1–4 repeat the same automatic response while the child's bids shrink, so Beat 5 converts a pattern into accumulated neglect. Beat 6 repairs the behavior but has less time than the guilt had to build.",
  evidence: [
    { beat_id: "beat-4", observation: "The child stops asking before Dad notices the cost." },
    { beat_id: "beat-6", observation: "The warm repair occupies only the final beat." },
  ],
};

function provider(overrides: Partial<PayoffAIProvider> = {}): PayoffAIProvider {
  return {
    storyboard: async () => storyboardOutput,
    audience: async () => audienceOutput,
    humanAudience: async () => humanAudienceOutput,
    diagnose: async () => diagnosisOutput,
    revise: async () => revisionOutput,
    ...overrides,
  };
}

describe("Payoff AI API handlers", () => {
  it("returns a validated complete custom storyboard", async () => {
    const result = await handleStoryboard("POST", storyboardInput, provider());
    expect(result.status).toBe(200);
    expect(result.body.title).toBe("The Wrong Kind of Ready");
    expect(result.body.beats).toHaveLength(6);

    const invalid = await handleStoryboard("POST", storyboardInput, provider({ storyboard: async () => ({ ...storyboardOutput, beats: storyboardOutput.beats.slice(0, 5) }) }));
    expect(invalid.status).toBe(502);
    expect(invalid.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");
  });

  it("rejects prose that trails off before it can reach the creator UI", async () => {
    const storyboard = await handleStoryboard("POST", storyboardInput, provider({
      storyboard: async () => ({
        ...storyboardOutput,
        beats: storyboardOutput.beats.map((beat, index) => index === 0
          ? { ...beat, action: "Dad enters confidently, spots his daughter waiting," }
          : beat),
      }),
    }));
    expect(storyboard.status).toBe(502);
    expect(storyboard.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");

    const audience = await handleAudience("POST", audienceInput, provider({
      audience: async () => ({
        ...audienceOutput,
        weakest_beat: { beat_id: "beat-6", why: "The attempted repair is undercut by" },
      }),
    }));
    expect(audience.status).toBe(502);
    expect(audience.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");

    const revision = await handleRevise("POST", revisionInput, provider({
      revise: async () => ({
        ...revisionOutput,
        changes: revisionOutput.changes.map((change) => ({
          ...change,
          replacement: { ...change.replacement, action: "Dad silences his work call and looks back toward her" },
        })),
      }),
    }));
    expect(revision.status).toBe(502);
    expect(revision.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");

    const diagnosis = await handleDiagnose("POST", diagnosisInput, provider({
      diagnose: async () => ({
        ...diagnosisOutput,
        evidence: [{ beat_id: "beat-6", observation: "The repair gets less time than the guilt" }],
      }),
    }));
    expect(diagnosis.status).toBe(502);
    expect(diagnosis.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");
  });

  it("returns a normalized, explicitly simulated AI Audience result for the exact version", async () => {
    const result = await handleAudience("POST", audienceInput, provider());
    expect(result.status).toBe(200);
    expect(result.body.label).toBe("AI-simulated audience");
    expect(result.body.notice).toBe("Useful as an early check. Not human evidence.");
    expect(result.body.story_version).toBe(BASELINE_VERSION_ID);
    expect(result.body.match).toBe("partial");
  });

  it("organizes real Human Audience responses without changing their provenance or count", async () => {
    const result = await handleAudience("POST", humanAudienceInput, provider());
    expect(result.status).toBe(200);
    expect(result.body.source).toBe("human");
    expect(result.body.story_version).toBe(BASELINE_VERSION_ID);
    expect(result.body.story_hash).toBe(BASELINE_CONTENT_HASH);
    expect(result.body.response_ids).toEqual(["real-response-1"]);
    expect(result.body.match).toBe("insufficient");
    expect(result.body).not.toHaveProperty("reactions");

    const inventedBeat = await handleAudience("POST", humanAudienceInput, provider({
      humanAudience: async () => ({
        ...humanAudienceOutput,
        strongest_beat: { beat_id: "invented", why: "This beat does not exist." },
      }),
    }));
    expect(inventedBeat.status).toBe(502);
  });

  it("rejects model output that references a beat outside the evaluated story", async () => {
    const result = await handleAudience("POST", audienceInput, provider({
      audience: async () => ({ ...audienceOutput, weakest_beat: { beat_id: "invented", why: "Not present." } }),
    }));
    expect(result.status).toBe(502);
    expect(result.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");
  });

  it("returns read-only diagnosis with evidence linked only to real beat IDs", async () => {
    const result = await handleDiagnose("POST", diagnosisInput, provider());
    expect(result.status).toBe(200);
    expect(result.body.story_version).toBe(BASELINE_VERSION_ID);
    expect(result.body.audience_source).toBe("ai");
    expect(result.body).not.toHaveProperty("changes");

    const invalid = await handleDiagnose("POST", diagnosisInput, provider({
      diagnose: async () => ({ ...diagnosisOutput, evidence: [{ beat_id: "invented", observation: "No such beat." }] }),
    }));
    expect(invalid.status).toBe(502);
  });

  it("returns inert revision proposals and protects selected-beat scope", async () => {
    const result = await handleRevise("POST", revisionInput, provider());
    expect(result.status).toBe(200);
    expect(result.body.story_version).toBe(BASELINE_VERSION_ID);
    expect(result.body.changes).toHaveLength(1);

    const selected = { ...revisionInput, selected_beat_id: "beat-2" };
    expect((await handleRevise("POST", selected, provider())).status).toBe(502);
  });

  it("accepts clarification only when it contains no changes", async () => {
    const clarification = await handleRevise("POST", revisionInput, provider({
      revise: async () => ({
        kind: "clarification",
        summary: "The requested tone could go in two directions.",
        why: null,
        clarification_question: "Should Dad seem hurried or emotionally guarded?",
        changes: [],
      }),
    }));
    expect(clarification.status).toBe(200);

    const invalid = await handleRevise("POST", revisionInput, provider({
      revise: async () => ({ ...revisionOutput, kind: "clarification", clarification_question: "Which direction?" }),
    }));
    expect(invalid.status).toBe(502);
  });

  it("fails safely for bad requests, missing configuration, provider errors, and non-POST methods", async () => {
    expect((await handleStoryboard("POST", { ...storyboardInput, premise: "" }, provider())).status).toBe(400);
    const unconfigured = await handleAudience("POST", audienceInput, createOpenAIProvider({}));
    expect(unconfigured.status).toBe(503);
    expect(JSON.stringify(unconfigured.body)).not.toMatch(/OPENAI_API_KEY|sk-/);

    const failed = await handleRevise("POST", revisionInput, provider({ revise: async () => { throw new Error("secret provider detail"); } }));
    expect(failed.status).toBe(502);
    expect(JSON.stringify(failed.body)).not.toContain("secret provider detail");

    const failedHuman = await handleAudience("POST", humanAudienceInput, provider({ humanAudience: async () => { throw new Error("private viewer content"); } }));
    expect(failedHuman.status).toBe(502);
    expect(JSON.stringify(failedHuman.body)).not.toContain("private viewer content");

    const method = await handleDiagnose("GET", null, provider());
    expect(method.status).toBe(405);
    expect(method.allow).toBe("POST");
  });
});
