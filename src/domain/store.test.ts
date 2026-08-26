import { describe, expect, it } from "vitest";
import { BASELINE_BEATS, BASELINE_CONTENT_HASH, BASELINE_VERSION_ID, createSeedWorkspace } from "./seed";
import { getActiveBeats, getEvidenceLabel } from "./selectors";
import { PayoffStore } from "./store";
import type { StudyResponseExport } from "./types";

function studyResponse(index: number): StudyResponseExport {
  return {
    schema: "payoff-study-response/v1",
    study: {
      projectId: "nothing-urgent",
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
      endingEmotion: index % 2 ? "sad" : "surprised",
      interpretation: `Interpretation ${index}`,
      wasSurprised: index % 2 === 0,
      predictionPoint: index % 2 ? "beat_5" : "not_predicted",
      changedBeatId: index % 2 ? "beat-5" : "beat-6",
      changedWhy: `Beat changed reaction ${index}`,
      quoteConsent: index % 3 === 0,
    },
  };
}

describe("PayoffStore", () => {
  it("keeps the baseline immutable when a beat is replaced", () => {
    const store = new PayoffStore({ persist: false });
    const original = structuredClone(store.getSnapshot().versions[0]);
    const result = store.replaceBeat(
      "beat-5",
      {
        title: "Warmly, again",
        action: "Mom taps a generated response without listening.",
        line: "Make it more maternal",
        narrativeRole: "turn",
        intendedEmotion: "recognition",
        artKey: "mother_autoreply",
      },
      BASELINE_VERSION_ID,
      "agent",
    );

    expect(result.activeVersionId).not.toBe(BASELINE_VERSION_ID);
    expect(store.getSnapshot().versions[0]).toEqual(original);
    expect(store.getSnapshot().versions).toHaveLength(2);
    expect(getActiveBeats(store.getSnapshot())[4].title).toBe("Warmly, again");
  });

  it("rejects stale writes without changing state", () => {
    const store = new PayoffStore({ persist: false });
    const draft = {
      title: "Replacement",
      action: "A different action.",
      line: "Different line",
      narrativeRole: "turn" as const,
      intendedEmotion: "uneasy",
      artKey: "window_light" as const,
    };
    store.replaceBeat("beat-5", draft, BASELINE_VERSION_ID, "agent");
    const before = structuredClone(store.getSnapshot());

    expect(() => store.replaceBeat("beat-6", draft, BASELINE_VERSION_ID, "agent")).toThrow(/Stale story version/);
    expect(store.getSnapshot()).toEqual(before);
  });

  it("imports only valid, matching, unique audience responses", () => {
    const store = new PayoffStore({ persist: false });
    const valid = studyResponse(1);
    const wrongHash = structuredClone(studyResponse(2));
    wrongHash.study.storyHash = "wrong";
    wrongHash.response.storyHash = "wrong";

    const result = store.importStudyResponses([valid, valid, wrongHash, { nope: true }]);

    expect(result).toEqual({ accepted: 1, duplicates: 1, rejected: 2 });
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(1);
  });

  it("uses the actual valid count and treats twelve only as the minimum", () => {
    const store = new PayoffStore({ persist: false });
    store.importStudyResponses(Array.from({ length: 14 }, (_, index) => studyResponse(index)));
    expect(getEvidenceLabel(store.getSnapshot())).toBe("Tested v1 · 14 viewers");
  });

  it("resets story revisions while preserving imported evidence", () => {
    const store = new PayoffStore({ persist: false });
    store.importStudyResponses([studyResponse(1)]);
    store.moveBeat("beat-2", "beat-3", BASELINE_VERSION_ID, "human");
    store.resetDemo();

    expect(getActiveBeats(store.getSnapshot())).toEqual(BASELINE_BEATS);
    expect(store.getSnapshot().reactionSet.responses).toHaveLength(1);
  });

  it("can be constructed from an explicit workspace fixture", () => {
    const fixture = createSeedWorkspace();
    fixture.project.title = "Fixture";
    const store = new PayoffStore({ persist: false, initialState: fixture });
    expect(store.getSnapshot().project.title).toBe("Fixture");
  });
});
