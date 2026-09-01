import { describe, expect, it, vi } from "vitest";
import { BASELINE_BEATS, BASELINE_CONTENT_HASH, BASELINE_VERSION_ID, LOOKS_GREAT_CONTINUITY, PROJECT_BRIEF } from "../src/domain/seed";
import { deterministicStoryboardIssues, handleAudience, handleDiagnose, handleRevise, handleStoryboard, normalizeStoryboardContinuity } from "./handlers";
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
  visual_continuity: LOOKS_GREAT_CONTINUITY,
  beats: BASELINE_BEATS.map((beat) => ({
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    intendedEmotion: beat.intendedEmotion,
    visual: beat.visual.spec,
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
  story: { id: PROJECT_BRIEF.id, title: PROJECT_BRIEF.title, beats: BASELINE_BEATS },
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
    title: null,
    action: "A girl holds up a drawing while Dad handles a ringing work call and looks apologetically toward her.",
    line: null,
    narrative_role: null,
    intended_emotion: null,
    visual_direction: {
      setting: null,
      character_updates: [{ id: "dad", position: null, action: "Handles a ringing work call while glancing apologetically toward his daughter." }],
      focal_action: "The daughter offers her drawing while Dad visibly handles an interrupting work call and acknowledges her.",
      focal_object: null,
      composition: null,
      emotional_cue: null,
      visible_text: null,
      continuity_notes: [],
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
    reviewStoryboard: async () => ({ passed: true, issues: [] }),
    repairStoryboard: async (_input, draft) => draft,
    verifyStoryboardRepair: async () => ({ passed: true, unresolved: [] }),
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

  it("repairs weak storyboard titles once before they reach the creator", async () => {
    const weak = {
      ...storyboardOutput,
      beats: storyboardOutput.beats.map((beat, index) => index === 1 ? { ...beat, title: "Again" } : beat),
    };
    const repairStoryboard = vi.fn(async () => storyboardOutput);
    const result = await handleStoryboard("POST", storyboardInput, provider({
      storyboard: async () => weak,
      repairStoryboard,
    }));

    expect(result.status).toBe(200);
    expect(result.body.beats).toEqual(storyboardOutput.beats);
    expect(repairStoryboard).toHaveBeenCalledTimes(1);
  });

  it("requires an explicit time-of-day and lighting baseline before generating scene art", async () => {
    const legacyContinuity = { ...storyboardOutput.visual_continuity };
    delete legacyContinuity.timeOfDay;
    delete legacyContinuity.lighting;
    const missingBaseline = { ...storyboardOutput, visual_continuity: legacyContinuity };
    const repairStoryboard = vi.fn(async () => storyboardOutput);

    const result = await handleStoryboard("POST", storyboardInput, provider({
      storyboard: async () => missingBaseline,
      repairStoryboard,
    }));

    expect(result.status).toBe(200);
    expect(repairStoryboard).toHaveBeenCalledWith(
      storyboardInput,
      missingBaseline,
      expect.arrayContaining([
        expect.stringContaining("time-of-day baseline"),
        expect.stringContaining("lighting and color-temperature baseline"),
      ]),
    );
  });

  it("repairs a beat whose visual result depends on an open or closed scorecard", async () => {
    const scorecardDraft = {
      ...storyboardOutput,
      beats: storyboardOutput.beats.map((beat, index) => index === 3 ? {
        ...beat,
        title: "Scorecards Stay Closed",
        action: "The judges huddle over closed scorecards while the baker mistakes their silence for rejection.",
        visual: {
          ...beat.visual,
          focalAction: "The closed scorecards conceal the result while the baker turns away.",
          focalObject: "Closed scorecards.",
        },
      } : beat),
    };
    const repairStoryboard = vi.fn(async () => storyboardOutput);

    const result = await handleStoryboard("POST", storyboardInput, provider({
      storyboard: async () => scorecardDraft,
      repairStoryboard,
    }));

    expect(result.status).toBe(200);
    expect(repairStoryboard).toHaveBeenCalledWith(
      storyboardInput,
      scorecardDraft,
      expect.arrayContaining([expect.stringContaining("depends on reading or inferring a scorecard state")]),
    );
  });

  it("retries one malformed storyboard response before failing the request", async () => {
    const storyboard = vi.fn()
      .mockResolvedValueOnce({ ...storyboardOutput, target_payoff: "x".repeat(161) })
      .mockResolvedValueOnce(storyboardOutput);

    const result = await handleStoryboard("POST", storyboardInput, provider({ storyboard }));

    expect(result.status).toBe(200);
    expect(storyboard).toHaveBeenCalledTimes(2);
  });

  it("rejects a storyboard that remains weak after the bounded repair pass", async () => {
    const weak = {
      ...storyboardOutput,
      beats: storyboardOutput.beats.map((beat, index) => index === 1 ? { ...beat, title: "The payoff" } : beat),
    };
    const result = await handleStoryboard("POST", storyboardInput, provider({
      storyboard: async () => weak,
      repairStoryboard: async () => weak,
    }));

    expect(result.status).toBe(502);
    expect(result.body).toHaveProperty("error.code", "INVALID_AI_RESPONSE");
  });

  it("recovers a beat character the model left off the continuity roster", async () => {
    const missingRoster = {
      ...storyboardOutput,
      visual_continuity: {
        ...storyboardOutput.visual_continuity,
        characters: storyboardOutput.visual_continuity.characters.filter((character) => character.id !== "dad"),
      },
    };
    expect(deterministicStoryboardIssues(missingRoster)).toContainEqual(expect.stringContaining("without an established continuity identity"));

    const normalized = normalizeStoryboardContinuity(missingRoster);

    expect(normalized.visual_continuity.characters.map((character) => character.id)).toContain("dad");
    expect(deterministicStoryboardIssues(normalized)).toEqual([]);
  });

  it("canonicalizes a paraphrased beat appearance back to the roster identity", async () => {
    const paraphrased = {
      ...storyboardOutput,
      beats: storyboardOutput.beats.map((beat, index) => index !== 0 ? beat : {
        ...beat,
        visual: {
          ...beat.visual,
          characters: beat.visual.characters.map((character) => ({ ...character, appearance: `${character.appearance} looking a little tired` })),
        },
      }),
    };
    expect(deterministicStoryboardIssues(paraphrased)).toContainEqual(expect.stringContaining("changes the established appearance"));

    const normalized = normalizeStoryboardContinuity(paraphrased);

    expect(normalized.beats[0].visual.characters.map((character) => character.appearance))
      .toEqual(storyboardOutput.beats[0].visual.characters.map((character) => character.appearance));
    expect(deterministicStoryboardIssues(normalized)).toEqual([]);
  });

  it("delivers a structurally valid repair when only a subjective verification note remains", async () => {
    const weak = {
      ...storyboardOutput,
      beats: storyboardOutput.beats.map((beat, index) => index === 1 ? { ...beat, title: "Again" } : beat),
    };
    const result = await handleStoryboard("POST", storyboardInput, provider({
      storyboard: async () => weak,
      repairStoryboard: async () => storyboardOutput,
      verifyStoryboardRepair: async () => ({
        passed: false,
        unresolved: [{ issue_number: 1, explanation: "The repaired beat still repeats the same visible event." }],
      }),
    }));

    expect(result.status).toBe(200);
    expect(result.body.beats).toHaveLength(6);
    expect(result.body.beats).toEqual(storyboardOutput.beats);
  });

  it("falls back to the draft when the repair pass breaks the objective contract", async () => {
    const brokenRepair = {
      ...storyboardOutput,
      beats: storyboardOutput.beats.map((beat, index) => index === 1 ? { ...beat, title: "The payoff" } : beat),
    };
    const result = await handleStoryboard("POST", storyboardInput, provider({
      reviewStoryboard: async () => ({
        passed: false,
        issues: [{ beat_number: 2, code: "description" as const, problem: "The second beat reads flat.", repair_instruction: "Sharpen the visible action." }],
      }),
      repairStoryboard: async () => brokenRepair,
    }));

    expect(result.status).toBe(200);
    expect(result.body.beats).toEqual(storyboardOutput.beats);
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
          action: "Dad silences his work call and looks back toward her",
        })),
      }),
    }));
    expect(revision.status).toBe(200);
    expect(revision.body.changes).toEqual([expect.objectContaining({
      replacement: expect.objectContaining({ action: "Dad silences his work call and looks back toward her." }),
    })]);

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
    const selectedResult = await handleRevise("POST", selected, provider());
    expect(selectedResult.status).toBe(200);
    expect(selectedResult.body.changes).toEqual([expect.objectContaining({ beat_id: "beat-2" })]);

    const sparseVisual = await handleRevise("POST", revisionInput, provider({
      revise: async () => ({
        ...revisionOutput,
        changes: revisionOutput.changes.map((change) => ({
          ...change,
          visual_direction: null,
        })),
      }),
    }));
    expect(sparseVisual.status).toBe(200);
    expect(sparseVisual.body.changes).toEqual([expect.objectContaining({
      replacement: expect.objectContaining({ visual: expect.objectContaining({ focalAction: expect.stringContaining("ringing work call") }) }),
    })]);
  });

  it("accepts clarification only when it contains no changes", async () => {
    const clarification = await handleRevise("POST", revisionInput, provider({
      revise: async () => ({
        kind: "clarification",
        summary: "The requested tone could go in two directions.",
        why: "Both interpretations would produce materially different staging.",
        clarification_question: "Should Dad seem hurried or emotionally guarded?",
        changes: [],
      }),
    }));
    expect(clarification.status).toBe(200);

    const invalid = await handleRevise("POST", revisionInput, provider({ revise: async () => ({ kind: "clarification", summary: null, why: null, clarification_question: null, changes: [] }) }));
    expect(invalid.status).toBe(502);
  });

  it("treats the exact floower request as a proposal or clarification, never a generic failure", async () => {
    const exactInput = {
      ...revisionInput,
      creator_request: "instead of sticking her drawing to the refrigerator, have her stick her drawing to the floower",
    };
    const clarification = await handleRevise("POST", exactInput, provider({
      revise: async () => ({
        kind: "clarification",
        summary: "The destination word could mean two things.",
        why: "Floor and flower require different visual staging.",
        clarification_question: "Did you mean the floor or a flower?",
        changes: [],
      }),
    }));
    expect(clarification.status).toBe(200);
    expect(clarification.body).toMatchObject({ kind: "clarification", clarification_question: "Did you mean the floor or a flower?" });

    expect(clarification.body).not.toHaveProperty("error");
  });

  it("runs one bounded structured-output recovery and reports its classified outcome", async () => {
    let attempts = 0;
    const info = vi.spyOn(console, "info").mockImplementation(() => undefined);
    const result = await handleRevise("POST", revisionInput, provider({
      revise: async (_input, options) => {
        attempts += 1;
        if (attempts === 1) return { kind: "revision", changes: [{ beat_id: "invented" }] };
        expect(options).toMatchObject({ attempt: 2, repairFeedback: expect.any(String) });
        return revisionOutput;
      },
    }));
    expect(result.status).toBe(200);
    expect(attempts).toBe(2);
    expect(info.mock.calls.some((call) => String(call[1]).includes('"retry_result":"recovered"'))).toBe(true);
    info.mockRestore();
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
