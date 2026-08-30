import { describe, expect, it } from "vitest";
import { BASELINE_BEATS, BASELINE_VERSION_ID, PROJECT_BRIEF } from "../src/domain/seed";
import type { ReviseRequest } from "./aiSchemas";
import { creatorLanguageClarification, deriveRevisionTargeting, normalizeRevisionOutput } from "./revision";

const base: Omit<ReviseRequest, "creator_request"> = {
  story: { id: PROJECT_BRIEF.id, title: PROJECT_BRIEF.title, beats: BASELINE_BEATS },
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

function input(creator_request: string): ReviseRequest {
  return { ...base, creator_request };
}

function sparseChange(beat_id: string, action: string | null) {
  return {
    beat_id,
    what_changes: null,
    title: null,
    action,
    line: null,
    narrative_role: null,
    intended_emotion: null,
    visual_direction: null,
  };
}

describe("natural-language revision normalization", () => {
  it("identifies the exact typo-heavy refrigerator attachment request as Beat 4", () => {
    const request = input("instead of sticking her drawing to the refrigerator, have her stick her drawing to the floower");
    expect(deriveRevisionTargeting(request)).toMatchObject({ high_confidence_beat_id: "beat-4" });

    const normalized = normalizeRevisionOutput({
      kind: "revision",
      summary: null,
      why: null,
      clarification_question: null,
      changes: [sparseChange("beat-3", "The daughter quietly pins up her drawing on the floor beside her, then walks away")],
    }, request);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.output.changes[0].beat_id).toBe("beat-4");
    expect(normalized.output.changes[0].replacement.action).toMatch(/tapes her drawing on the floor beside her, then walks away\.$/);
    expect(normalized.output.changes[0].replacement.action).not.toMatch(/pin/i);
    expect(normalized.output.changes[0].replacement.visual.focalObject).toContain("pressed flat against the floor");
    expect(normalized.output.changes[0].replacement.visual.characters[0].action).toContain("Tapes the new drawing flat to the floor");
  });

  it("turns a genuinely ambiguous object typo into a normal clarification state", () => {
    expect(creatorLanguageClarification(input("instead of the refrigerator, put it on the floower"))).toMatchObject({
      kind: "clarification",
      clarification_question: "Did you mean the floor or a flower?",
      changes: [],
    });
    expect(creatorLanguageClarification(input("pls mke scne 1 quiker n dad mor bizzy"))).toBeNull();
    expect(creatorLanguageClarification(input("Make Dad look less uncaring"))).toBeNull();
  });

  it("accepts a normal clarification even when the model also supplies an explanation", () => {
    const normalized = normalizeRevisionOutput({
      kind: "clarification",
      summary: "The destination word could describe two different objects",
      why: "Floor and flower require different staging",
      clarification_question: "Did you mean the floor or a flower?",
      changes: [],
    }, input("Put it on the floower"));
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.output).toMatchObject({
      kind: "clarification",
      why: null,
      clarification_question: "Did you mean the floor or a flower?",
      changes: [],
    });
  });

  it.each([
    ["Make scene 2 funnier", "beat-2"],
    ["Change the refrigerator scene so she leaves the drawing on the table", "beat-4"],
    ["Keep everything except the ending", "beat-6"],
    ["Make the payoff warmer", "beat-6"],
  ])("resolves %s", (creatorRequest, beatId) => {
    expect(deriveRevisionTargeting(input(creatorRequest)).high_confidence_beat_id).toBe(beatId);
  });

  it("does not force a broad Dad-tone request onto one beat", () => {
    expect(deriveRevisionTargeting(input("Make Dad look less uncaring")).high_confidence_beat_id).toBeNull();
  });

  it("reuses optional metadata and builds new visual direction from a changed action", () => {
    const request = input("Make scene 2 funnier");
    const normalized = normalizeRevisionOutput({
      kind: "revision",
      summary: null,
      why: null,
      clarification_question: null,
      changes: [sparseChange("beat-2", "Dad praises the heart upside down while still staring at his phone")],
    }, request);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    const replacement = normalized.output.changes[0].replacement;
    expect(replacement.title).toBe(BASELINE_BEATS[1].title);
    expect(replacement.intendedEmotion).toBe(BASELINE_BEATS[1].intendedEmotion);
    expect(replacement.visual.focalAction).toBe(replacement.action);
    expect(replacement.visual).not.toEqual(BASELINE_BEATS[1].visual.spec);
  });

  it("keeps a genuine multi-beat proposal scoped and atomic", () => {
    const request = input("Make Dad look less uncaring in the first two scenes");
    const normalized = normalizeRevisionOutput({
      kind: "revision",
      summary: "Give Dad visible work pressure in the opening",
      why: null,
      clarification_question: null,
      changes: [
        sparseChange("beat-1", "Dad finishes a work message, then gives his daughter an apologetic glance"),
        sparseChange("beat-2", "Dad silences a work call while telling her he wants to see the new drawing"),
      ],
    }, request);
    expect(normalized.ok).toBe(true);
    if (!normalized.ok) return;
    expect(normalized.output.changes.map((change) => change.beat_id)).toEqual(["beat-1", "beat-2"]);
  });
});
