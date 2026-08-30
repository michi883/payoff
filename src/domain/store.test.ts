import { describe, expect, it } from "vitest";
import { BASELINE_BEATS, BASELINE_CONTENT_HASH, BASELINE_VERSION_ID, PROJECT_BRIEF, createCanonicalWorkspace, createSeedWorkspace } from "./seed";
import { getAIAudienceResult, getHumanAudienceResult } from "./audience";
import { getActiveBeats, getActivePreview, getEvidenceLabel, isActiveVersionTested } from "./selectors";
import { PayoffStore } from "./store";
import type { BeatDraft, StoryBeat, StudyResponseExport } from "./types";
import { EMPTY_VISUAL_CONTINUITY, legacyVisualBrief } from "./visuals";
import rehearsalResponse1 from "../../fixtures/rehearsal-only/looks-great-response-01.json";
import rehearsalResponse2 from "../../fixtures/rehearsal-only/looks-great-response-02.json";
import rehearsalResponse3 from "../../fixtures/rehearsal-only/looks-great-response-03.json";
import rehearsalResponse4 from "../../fixtures/rehearsal-only/looks-great-response-04.json";

function draft(input: Omit<BeatDraft, "visual"> & { visual?: BeatDraft["visual"] }): BeatDraft {
  return { ...input, visual: input.visual ?? legacyVisualBrief(input) };
}

function revisedBeat(beat: StoryBeat, changes: Partial<Omit<BeatDraft, "visual">> & { visual?: BeatDraft["visual"] }): BeatDraft {
  const action = changes.action ?? beat.action;
  return {
    title: changes.title ?? beat.title,
    action,
    line: changes.line ?? beat.line,
    narrativeRole: changes.narrativeRole ?? beat.narrativeRole,
    intendedEmotion: changes.intendedEmotion ?? beat.intendedEmotion,
    visual: changes.visual ?? { ...structuredClone(beat.visual.spec), focalAction: action },
  };
}

function studyResponse(index: number): StudyResponseExport {
  return {
    schema: "payoff-study-response/v1",
    study: {
      projectId: PROJECT_BRIEF.id,
      storyVersionId: BASELINE_VERSION_ID,
      storyHash: BASELINE_CONTENT_HASH,
      targetWasHidden: true,
      firstViewingWasUninterrupted: true,
    },
    response: {
      id: `response-${index}`,
      storyVersionId: BASELINE_VERSION_ID,
      storyHash: BASELINE_CONTENT_HASH,
      submittedAt: `2026-08-2${index % 10}T12:00:00.000Z`,
      endingEmotion: index % 2 ? "guilty" : "warm",
      interpretation: `Interpretation ${index}`,
      wasSurprised: index % 2 === 0,
      predictionPoint: index % 2 ? "beat_5" : "not_predicted",
      changedBeatId: index % 2 ? "beat-5" : "beat-6",
      changedWhy: `Beat changed reaction ${index}`,
      quoteConsent: index % 3 === 0,
    },
  };
}

function humanReportDraft() {
  return {
    summary: "The response recognized the intended repair, but the sample is still early.",
    audienceLanding: "A guilty realization followed by warmth.",
    match: "insufficient" as const,
    observedArc: ["recognition", "guilt", "warmth"],
    whatLanded: "The final reconnection felt warm.",
    whereItDrifted: "Dad felt absent longer than intended.",
    biggestOpportunity: "Make his care visible before the reveal.",
    strongestBeatId: "beat-6",
    strongestBeatWhy: "The physical reconnection supports the warmth.",
    weakestBeatId: "beat-4",
    weakestBeatWhy: "Her withdrawal lets guilt accumulate.",
    mainRisk: "Guilt may remain stronger than warmth.",
    changedAudienceBeatId: "beat-5",
    changedAudienceWhy: "The drawing reframes every earlier interaction.",
  };
}

describe("PayoffStore", () => {
  it("starts in Define with an empty storyboard", () => {
    const store = new PayoffStore({ persist: false });
    expect(store.getSnapshot().workflow.stage).toBe("define");
    expect(getActiveBeats(store.getSnapshot())).toEqual([]);
  });

  it("opens the canonical starter locally with all six known beats", () => {
    const store = new PayoffStore({ persist: false });
    store.selectStarter();

    expect(store.getSnapshot().workflow).toEqual({ stage: "storyboard", source: "starter" });
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().versions).toHaveLength(1);
    expect(getActiveBeats(store.getSnapshot())).toHaveLength(6);
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.title)).toEqual([
      "Dad, look",
      "Another drawing",
      "The fridge fills up",
      "She stops asking",
      "A drawing of Dad",
      "He finally looks",
    ]);
  });

  it("repairs a corrupted persisted canonical baseline without rewriting intentional revisions", () => {
    const corrupted = createCanonicalWorkspace();
    corrupted.versions[0].beats = [
      corrupted.versions[0].beats[1],
      corrupted.versions[0].beats[0],
      ...corrupted.versions[0].beats.slice(2),
    ].map((beat, index) => ({ ...beat, order: index + 1 }));
    localStorage.setItem("payoff.workspace.v4", JSON.stringify(corrupted));

    const store = new PayoffStore();
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.title)).toEqual([
      "Dad, look",
      "Another drawing",
      "The fridge fills up",
      "She stops asking",
      "A drawing of Dad",
      "He finally looks",
    ]);
    localStorage.clear();
  });

  it("keeps the canonical beats when the starter emotion or format is edited", () => {
    const store = new PayoffStore({ persist: false });
    store.selectStarter({
      ...PROJECT_BRIEF,
      format: "30-second horizontal short",
      target: { ...PROJECT_BRIEF.target, payoffEmotion: "recognition → hope" },
    });

    expect(store.getSnapshot().project.format).toBe("30-second horizontal short");
    expect(store.getSnapshot().project.target.payoffEmotion).toBe("recognition → hope");
    expect(store.getSnapshot().humanTest?.format).toBe("30-second horizontal short");
    expect(getActiveBeats(store.getSnapshot())).toHaveLength(6);
  });

  it("recovers a legacy partial starter instead of reopening the old build-request state", () => {
    localStorage.clear();
    const legacy = {
      ...createSeedWorkspace(),
      schemaVersion: 2,
      workflow: { stage: "storyboard", source: "starter" },
    };
    localStorage.setItem("payoff.workspace.v2", JSON.stringify(legacy));

    const store = new PayoffStore();
    expect(store.getSnapshot().schemaVersion).toBe(4);
    expect(store.getSnapshot().workflow).toEqual({ stage: "storyboard", source: "starter" });
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
    expect(getActiveBeats(store.getSnapshot())).toHaveLength(6);
    localStorage.clear();
  });

  it("keeps the baseline immutable when a beat is replaced", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const original = structuredClone(store.getSnapshot().versions[0]);
    const result = store.replaceBeat(
      "beat-5",
      draft({
        title: "He sees it",
        action: "Dad studies the drawing for the first time.",
        line: "DAD",
        narrativeRole: "turn",
        intendedEmotion: "recognition",
      }),
      BASELINE_VERSION_ID,
      "agent",
    );

    expect(result.activeVersionId).not.toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().versions[0]).toEqual(original);
    expect(store.getSnapshot().versions).toHaveLength(2);
    expect(getActiveBeats(store.getSnapshot())[4].title).toBe("He sees it");
  });

  it("installs a generated custom storyboard atomically as one validated version", () => {
    const store = new PayoffStore({ persist: false });
    store.startCustomProject({
      id: "ignored",
      title: "School Night",
      topic: "A confident dad shows up to his daughter's school performance.",
      format: "45-second vertical short",
      audienceFeeling: "surprise, then warmth",
      targetSummary: "Surprise → warmth",
      target: {
        setupEmotion: "confidence",
        payoffEmotion: "warmth",
        realization: "He misunderstood what she needed.",
        constraints: [],
      },
    });
    const expectedVersion = store.getSnapshot().activeVersionId;
    const drafts = Array.from({ length: 6 }, (_, index) => draft({
      title: `Moment ${index + 1}`,
      action: `A visible story action happens in moment ${index + 1}.`,
      line: index === 5 ? "I see you." : "",
      narrativeRole: index < 2 ? "setup" as const : index < 4 ? "escalation" as const : index === 4 ? "turn" as const : "payoff" as const,
      intendedEmotion: index === 5 ? "warmth" : "surprise",
    }));
    const beforeInvalid = structuredClone(store.getSnapshot());

    expect(() => store.installGeneratedStoryboard({
      title: "School Night",
      targetSummary: "Surprise → warmth",
      visualContinuity: EMPTY_VISUAL_CONTINUITY,
      beats: drafts.slice(0, 5),
    }, expectedVersion)).toThrow(/exactly six beats/);
    expect(store.getSnapshot()).toEqual(beforeInvalid);

    const result = store.installGeneratedStoryboard({
      title: "The Front Row",
      targetSummary: "Confident surprise → warmth",
      visualContinuity: EMPTY_VISUAL_CONTINUITY,
      beats: drafts,
    }, expectedVersion);

    expect(result.affectedBeatIds).toEqual([
      "school-night-beat-1",
      "school-night-beat-2",
      "school-night-beat-3",
      "school-night-beat-4",
      "school-night-beat-5",
      "school-night-beat-6",
    ]);
    expect(store.getSnapshot().project.title).toBe("The Front Row");
    expect(store.getSnapshot().project.targetSummary).toBe("Confident surprise → warmth");
    expect(store.getSnapshot().versions).toHaveLength(2);
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.order)).toEqual([1, 2, 3, 4, 5, 6]);
    expect(store.getSnapshot().activity[0].action).toBe("generate_storyboard");
  });

  it("rejects stale generated-story writes without partially changing the brief or board", () => {
    const store = new PayoffStore({ persist: false });
    store.startCustomProject({
      id: "ignored",
      title: "First Brief",
      topic: "A tiny visible premise.",
      format: "30-second vertical short",
      audienceFeeling: "tension, then relief",
      targetSummary: "Tension → relief",
      target: { setupEmotion: "tension", payoffEmotion: "relief", realization: "Help arrives.", constraints: [] },
    });
    const staleVersion = store.getSnapshot().activeVersionId;
    store.createBeat(draft({
      title: "A start",
      action: "The character notices a locked door.",
      line: "",
      narrativeRole: "setup",
      intendedEmotion: "tension",
    }), null, staleVersion, "human", "first-brief-beat-one");
    const before = structuredClone(store.getSnapshot());

    expect(() => store.installGeneratedStoryboard({
      title: "Unexpected overwrite",
      targetSummary: "A changed target",
      visualContinuity: EMPTY_VISUAL_CONTINUITY,
      beats: Array.from({ length: 6 }, (_, index) => draft({
        title: `Beat ${index + 1}`,
        action: `Action ${index + 1}.`,
        line: "",
        narrativeRole: index < 2 ? "setup" as const : index < 5 ? "escalation" as const : "payoff" as const,
        intendedEmotion: "relief",
      })),
    }, staleVersion)).toThrow(/Stale story version/);
    expect(store.getSnapshot()).toEqual(before);
  });

  it("rejects stale writes without changing state", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const replacement = draft({
      title: "Replacement",
      action: "A different action.",
      line: "Different line",
      narrativeRole: "turn" as const,
      intendedEmotion: "uneasy",
    });
    store.replaceBeat("beat-5", replacement, BASELINE_VERSION_ID, "agent");
    const before = structuredClone(store.getSnapshot());

    expect(() => store.replaceBeat("beat-6", replacement, BASELINE_VERSION_ID, "agent")).toThrow(/Stale story version/);
    expect(store.getSnapshot()).toEqual(before);
  });

  it("applies a multi-beat AI proposal as one immutable version and preserves evidence", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.importStudyResponses([studyResponse(1)]);
    const original = structuredClone(store.getSnapshot().versions[0]);

    const result = store.applyRevision([
      {
        beatId: "beat-1",
        draft: revisedBeat(getActiveBeats(store.getSnapshot())[0], {
          action: "A girl holds up a drawing while Dad handles a ringing work call and points apologetically to the phone.",
        }),
      },
      {
        beatId: "beat-2",
        draft: revisedBeat(getActiveBeats(store.getSnapshot())[1], {
          action: "She tries again as Dad finishes typing a time-sensitive message, then he looks toward her.",
        }),
      },
    ], BASELINE_VERSION_ID, "Dad now reads as visibly busy rather than uncaring.", "agent");

    expect(result.affectedBeatIds).toEqual(["beat-1", "beat-2"]);
    expect(store.getSnapshot().versions).toHaveLength(2);
    expect(store.getSnapshot().versions[0]).toEqual(original);
    expect(store.getSnapshot().activeVersionId).not.toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().testedVersionId).toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().reactionSet.storyVersionId).toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(1);
    expect(getEvidenceLabel(store.getSnapshot())).toMatch(/^Untested revision/);

    const beforeStaleAttempt = structuredClone(store.getSnapshot());
    expect(() => store.applyRevision([{
      beatId: "beat-6",
      draft: revisedBeat(getActiveBeats(store.getSnapshot())[5], { action: "A different ending." }),
    }], BASELINE_VERSION_ID, "Stale proposal", "agent")).toThrow(/Stale story version/);
    expect(store.getSnapshot()).toEqual(beforeStaleAttempt);
  });

  it("rejects revised meaning when the visible scene is left stale", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const original = getActiveBeats(store.getSnapshot())[4];

    expect(() => store.replaceBeat("beat-5", {
      title: original.title,
      action: "Dad walks away before noticing the drawing on the refrigerator.",
      line: original.line,
      narrativeRole: original.narrativeRole,
      intendedEmotion: original.intendedEmotion,
      visual: structuredClone(original.visual.spec),
    }, BASELINE_VERSION_ID, "agent")).toThrow(/visual direction/);
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
  });

  it("rejects beat visuals that drift from the established character identity", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const original = getActiveBeats(store.getSnapshot())[0];
    const visual = structuredClone(original.visual.spec);
    visual.characters[0].appearance = "A different child in different clothes.";

    expect(() => store.replaceBeat("beat-1", {
      title: original.title,
      action: original.action,
      line: original.line,
      narrativeRole: original.narrativeRole,
      intendedEmotion: original.intendedEmotion,
      visual,
    }, BASELINE_VERSION_ID, "agent")).toThrow(/established appearance/);
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
  });

  it("regenerates only a changed beat hash and undo restores the exact visual contract", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const before = getActiveBeats(store.getSnapshot()).map((beat) => beat.visual.contentHash);
    const changed = revisedBeat(getActiveBeats(store.getSnapshot())[2], {
      action: "The refrigerator fills with drawings while Dad answers another message without looking up.",
    });

    store.replaceBeat("beat-3", changed, BASELINE_VERSION_ID, "agent");
    const after = getActiveBeats(store.getSnapshot()).map((beat) => beat.visual.contentHash);
    expect(after[2]).not.toBe(before[2]);
    expect(after.filter((hash, index) => hash === before[index])).toHaveLength(5);

    store.undoLastMutation();
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.visual.contentHash)).toEqual(before);
  });

  it("closes testing without changing story or evidence", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.openTesting();
    const versionCount = store.getSnapshot().versions.length;
    store.closeTesting();
    expect(store.getSnapshot().workflow.stage).toBe("storyboard");
    expect(store.getSnapshot().versions).toHaveLength(versionCount);
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
  });

  it("imports only valid, matching, unique audience responses", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const valid = studyResponse(1);
    const wrongHash = structuredClone(studyResponse(2));
    wrongHash.study.storyHash = "wrong";
    wrongHash.response.storyHash = "wrong";
    const retiredStory = structuredClone(studyResponse(3));
    retiredStory.study.projectId = "nothing-urgent";

    const result = store.importStudyResponses([valid, valid, wrongHash, retiredStory, { nope: true }]);

    expect(result).toEqual({ accepted: 1, duplicates: 1, rejected: 3 });
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(1);
    expect(getHumanAudienceResult(store.getSnapshot())).toBeNull();
    store.saveHumanReport(humanReportDraft(), BASELINE_VERSION_ID, [valid.response.id]);
    expect(getHumanAudienceResult(store.getSnapshot())?.match).toBe("insufficient");
  });

  it("uses the actual valid count and treats twelve only as the minimum", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.importStudyResponses(Array.from({ length: 14 }, (_, index) => studyResponse(index)));
    expect(getEvidenceLabel(store.getSnapshot())).toBe("Human-tested · 14 viewers");
  });

  it("rejects rehearsal evidence collected against the superseded visual story hash", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    expect(store.importStudyResponses([
      rehearsalResponse1,
      rehearsalResponse2,
      rehearsalResponse3,
      rehearsalResponse4,
    ])).toEqual({ accepted: 0, duplicates: 0, rejected: 4 });
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
  });

  it("binds Human Audience reports to the exact response set and story version", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const first = studyResponse(1);
    const second = studyResponse(2);
    store.importStudyResponses([first]);
    store.saveHumanReport(humanReportDraft(), BASELINE_VERSION_ID, [first.response.id]);
    expect(getHumanAudienceResult(store.getSnapshot())?.audienceSize).toBe(1);

    store.importStudyResponses([second]);
    expect(store.getSnapshot().humanReports).toHaveLength(0);
    expect(getHumanAudienceResult(store.getSnapshot())).toBeNull();
    expect(() => store.saveHumanReport(humanReportDraft(), BASELINE_VERSION_ID, [first.response.id])).toThrow(/responses changed/i);
    store.saveHumanReport(humanReportDraft(), BASELINE_VERSION_ID, [first.response.id, second.response.id]);

    store.replaceBeat("beat-6", revisedBeat(getActiveBeats(store.getSnapshot())[5], {
      action: "Dad puts the phone away and lets her choose the next crayon.",
    }), BASELINE_VERSION_ID, "human");
    expect(getHumanAudienceResult(store.getSnapshot())).toBeNull();
    expect(store.getSnapshot().humanReports[0].storyVersionId).toBe(BASELINE_VERSION_ID);
  });

  it("start over clears the current storyboard and test results", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.importStudyResponses([studyResponse(1)]);
    store.moveBeat("beat-2", "beat-3", BASELINE_VERSION_ID, "human");
    store.resetDemo();

    expect(getActiveBeats(store.getSnapshot())).toEqual([]);
    expect(store.getSnapshot().workflow.stage).toBe("define");
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
    expect(store.getSnapshot().reactionHistory).toHaveLength(0);
    expect(store.getSnapshot().humanReports).toHaveLength(0);

    store.selectStarter();
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.title)).toEqual([
      "Dad, look",
      "Another drawing",
      "The fridge fills up",
      "She stops asking",
      "A drawing of Dad",
      "He finally looks",
    ]);
  });

  it("does not resurrect cleared evidence when starting another story", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.importStudyResponses([studyResponse(1)]);
    store.resetDemo();
    store.startCustomProject({
      id: "ignored",
      title: "Lost Key",
      topic: "A neighbor returns a key in an unexpected way.",
      format: "45-second short",
      target: { setupEmotion: "curious", payoffEmotion: "relieved", realization: "The stranger was helping.", constraints: [] },
    });

    expect(store.getSnapshot().reactionHistory.some((set) => set.storyHash === BASELINE_CONTENT_HASH)).toBe(false);
    store.resetDemo();
    expect(store.getSnapshot().reactionSet.storyHash).toBe(BASELINE_CONTENT_HASH);
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
  });

  it("archives prior human evidence when a revision is prepared for testing", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.importStudyResponses([studyResponse(1)]);
    store.replaceBeat("beat-6", draft({
      title: "A longer repair",
      action: "Dad sits beside her and begins a drawing of his own.",
      line: "",
      narrativeRole: "payoff",
      intendedEmotion: "warm",
    }), BASELINE_VERSION_ID, "agent");
    store.prepareHumanTest();

    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
    expect(store.getSnapshot().reactionHistory[0].storyVersionId).toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().reactionHistory[0].responses).toHaveLength(1);

    store.resetDemo();
    expect(store.getSnapshot().reactionSet.storyHash).toBe(BASELINE_CONTENT_HASH);
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
  });

  it("restores baseline evidence when undo returns a prepared revision to the canonical story", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.importStudyResponses([studyResponse(1)]);
    store.replaceBeat("beat-6", draft({
      title: "A longer repair",
      action: "Dad sits beside her and begins a drawing of his own.",
      line: "",
      narrativeRole: "payoff",
      intendedEmotion: "warm",
    }), BASELINE_VERSION_ID, "agent");
    store.prepareHumanTest();

    store.undoLastMutation();
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().reactionSet.storyVersionId).toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(1);
    expect(store.getSnapshot().reactionHistory.some((set) => set.storyVersionId === BASELINE_VERSION_ID)).toBe(false);
  });

  it("keeps AI Audience separate from human response evidence", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.saveAIPreview({
      summary: "The turn may land differently depending on viewing patience.",
      perspectives: [
        { persona: "impatient_casual", likelyResponse: "Understands the phone pattern quickly.", watchFor: "May predict the drawing reveal." },
        { persona: "emotionally_sensitive", likelyResponse: "Feels the daughter's withdrawal strongly.", watchFor: "May finish with guilt instead of warmth." },
      ],
      disagreements: ["The repeated setup may feel efficient to one lens and prolonged to another."],
    }, BASELINE_VERSION_ID);

    expect(store.getSnapshot().aiPreviews).toHaveLength(1);
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(0);
    expect(getAIAudienceResult(store.getSnapshot())).not.toBeNull();
    expect(getHumanAudienceResult(store.getSnapshot())).toBeNull();
    expect(isActiveVersionTested(store.getSnapshot())).toBe(true);
  });

  it("binds AI Audience results to the exact version and hides them after revision", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.saveAIPreview({
      summary: "The turn is clear, but guilt may outlast the repair.",
      likelyEmotionalLanding: "Amusement → guilt → cautious warmth",
      targetMatch: "partial",
      strongestBeatId: "beat-5",
      strongestBeatWhy: "The drawing makes the pattern concrete.",
      weakestBeatId: "beat-6",
      weakestBeatWhy: "The repair is brief.",
      mainRisk: "Guilt may outweigh warmth.",
      observedArc: ["amusement", "guilt", "cautious warmth"],
      changedAudienceBeatId: "beat-5",
      changedAudienceWhy: "The drawing reframes the repeated praise.",
      perspectives: [
        { persona: "impatient_casual", likelyResponse: "Gets the turn quickly.", watchFor: "May predict it." },
        { persona: "emotionally_sensitive", likelyResponse: "Feels the withdrawal.", watchFor: "May keep the guilt." },
      ],
      disagreements: ["The repair may feel sufficient or rushed."],
      confidence: "medium",
      confidenceNote: "A simulated early check, not human evidence.",
    }, BASELINE_VERSION_ID);
    const savedId = getActivePreview(store.getSnapshot())?.id;
    store.replaceBeat("beat-6", revisedBeat(getActiveBeats(store.getSnapshot())[5], {
      action: "Dad puts the phone away, apologizes, and lets her guide the next drawing.",
    }), BASELINE_VERSION_ID, "human");

    expect(store.getSnapshot().aiPreviews).toHaveLength(1);
    expect(store.getSnapshot().aiPreviews[0].id).toBe(savedId);
    expect(store.getSnapshot().aiPreviews[0].storyVersionId).toBe(BASELINE_VERSION_ID);
    expect(getActivePreview(store.getSnapshot())).toBeNull();
    expect(getAIAudienceResult(store.getSnapshot())).toBeNull();
    expect(isActiveVersionTested(store.getSnapshot())).toBe(false);
    expect(getEvidenceLabel(store.getSnapshot())).toMatch(/^Untested revision/);

    const beforeStaleResult = structuredClone(store.getSnapshot());
    expect(() => store.saveAIPreview({
      summary: "Stale result",
      perspectives: [
        { persona: "impatient_casual", likelyResponse: "Old story.", watchFor: "Old beat." },
        { persona: "emotionally_sensitive", likelyResponse: "Old story.", watchFor: "Old beat." },
      ],
      disagreements: ["Old result."],
    }, BASELINE_VERSION_ID)).toThrow(/Stale story version/);
    expect(store.getSnapshot()).toEqual(beforeStaleResult);
  });

  it("restores the canonical order after an explicit reorder and undo", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.moveBeat("beat-2", "beat-3", BASELINE_VERSION_ID, "human");
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.id)).toEqual([
      "beat-1", "beat-3", "beat-2", "beat-4", "beat-5", "beat-6",
    ]);
    store.undoLastMutation();
    expect(getActiveBeats(store.getSnapshot()).map((beat) => beat.id)).toEqual([
      "beat-1", "beat-2", "beat-3", "beat-4", "beat-5", "beat-6",
    ]);
    expect(store.getSnapshot().activeVersionId).toBe(BASELINE_VERSION_ID);
  });

  it("restores a previous version through History as a new immutable revision", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    const firstEdit = store.replaceBeat("beat-1", revisedBeat(getActiveBeats(store.getSnapshot())[0], {
      action: "Dad is finishing a work call when she approaches with the drawing.",
    }), BASELINE_VERSION_ID, "human");
    const preserved = structuredClone(store.getSnapshot().versions.find((version) => version.id === firstEdit.activeVersionId));
    const secondEdit = store.replaceBeat("beat-2", revisedBeat(getActiveBeats(store.getSnapshot())[1], {
      action: "She waits until the call ends, then tries one more time.",
    }), firstEdit.activeVersionId, "human");

    const restored = store.restoreVersion(firstEdit.activeVersionId, secondEdit.activeVersionId, "human");
    expect(restored.activeVersionId).not.toBe(firstEdit.activeVersionId);
    expect(restored.activeVersionId).not.toBe(secondEdit.activeVersionId);
    expect(store.getSnapshot().versions.find((version) => version.id === firstEdit.activeVersionId)).toEqual(preserved);
    expect(store.getSnapshot().versions.find((version) => version.id === restored.activeVersionId)?.parentVersionId).toBe(secondEdit.activeVersionId);
    expect(getActiveBeats(store.getSnapshot())[0].action).toMatch(/finishing a work call/);
    expect(getActiveBeats(store.getSnapshot())[1].action).toBe(BASELINE_BEATS[1].action);
    expect(store.getSnapshot().activity[0].action).toBe("restore_version");
  });

  it("prepares and validates a version-bound Human Test for a custom idea", () => {
    const store = new PayoffStore({ persist: false });
    store.startCustomProject({
      id: "ignored",
      title: "Lost Key",
      topic: "A neighbor returns a key in an unexpected way.",
      format: "45-second short",
      target: { setupEmotion: "curious", payoffEmotion: "relieved", realization: "The apparent stranger was helping.", constraints: [] },
    });
    for (let index = 1; index <= 6; index += 1) {
      const after = index === 1 ? null : `custom-beat-${index - 1}`;
      store.createBeat(draft({
        title: `Beat ${index}`,
        action: `Visible action ${index}.`,
        line: "",
        narrativeRole: index < 3 ? "setup" : index < 5 ? "escalation" : index === 5 ? "turn" : "payoff",
        intendedEmotion: index === 6 ? "relieved" : "curious",
      }), after, store.getSnapshot().activeVersionId, "agent", `custom-beat-${index}`);
    }
    const stimulus = store.prepareHumanTest();
    const response: StudyResponseExport = {
      schema: "payoff-study-response/v1",
      study: {
        projectId: stimulus.projectId,
        storyVersionId: stimulus.storyVersionId,
        storyHash: stimulus.storyHash,
        targetWasHidden: true,
        firstViewingWasUninterrupted: true,
      },
      response: {
        id: "custom-response",
        storyVersionId: stimulus.storyVersionId,
        storyHash: stimulus.storyHash,
        submittedAt: "2026-08-26T12:00:00.000Z",
        endingEmotion: "warm",
        interpretation: "The neighbor meant well.",
        wasSurprised: true,
        predictionPoint: "beat_5",
        changedBeatId: "custom-beat-5",
        changedWhy: "The intention became clear.",
        quoteConsent: false,
      },
    };

    expect(store.importStudyResponses([response])).toEqual({ accepted: 1, duplicates: 0, rejected: 0 });
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(1);
  });

  it("returns from Test to an untested storyboard after a revision", () => {
    const store = new PayoffStore({ persist: false, initialState: createCanonicalWorkspace() });
    store.openTesting();
    expect(store.getSnapshot().workflow.stage).toBe("test");

    store.replaceBeat("beat-5", draft({
      title: "He sees it",
      action: "Dad studies the drawing for the first time.",
      line: "DAD",
      narrativeRole: "turn",
      intendedEmotion: "recognition",
    }), BASELINE_VERSION_ID, "agent");

    expect(store.getSnapshot().workflow.stage).toBe("storyboard");
    expect(store.getSnapshot().activeVersionId).not.toBe(store.getSnapshot().testedVersionId);
    expect(getEvidenceLabel(store.getSnapshot())).toMatch(/^Untested revision/);
  });

  it("can be constructed from an explicit workspace fixture", () => {
    const fixture = createSeedWorkspace();
    fixture.project.title = "Fixture";
    const store = new PayoffStore({ persist: false, initialState: fixture });
    expect(store.getSnapshot().project.title).toBe("Fixture");
  });
});
