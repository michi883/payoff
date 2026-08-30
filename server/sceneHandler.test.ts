import { describe, expect, it, vi } from "vitest";
import { continuityContentHash, sceneContentHash } from "../src/domain/visuals";
import type { BeatDraft, VisualContinuity } from "../src/domain/types";
import { handleScene } from "./sceneHandler";
import { scenePrompt, type SceneImageProvider } from "./sceneImageProvider";
import { AIProviderError } from "./openaiProvider";

const continuity: VisualContinuity = {
  characters: [
    { id: "maya", appearance: "Nine years old, yellow raincoat, short black curls." },
    { id: "grandpa", appearance: "Late 60s, silver beard, green cardigan, round glasses." },
  ],
  settings: [{ id: "porch", appearance: "Blue wooden porch during a gentle rain." }],
  importantProps: [{ id: "paper-boat", appearance: "Small red paper boat with one folded white stripe." }],
  timeOfDay: "Overcast late morning throughout all six scenes.",
  lighting: "Stable soft neutral daylight with no blue tint or exposure shift.",
  style: "Minimal editorial storyboard illustration with clean shapes and expressive body language.",
};

function request(marker: string) {
  const requestContinuity = { ...continuity, style: `${continuity.style} ${marker}` };
  const beat: BeatDraft = {
    title: "The boat returns",
    action: `Maya catches her red paper boat as Grandpa guides it back through the rain ${marker}.`,
    line: "",
    narrativeRole: "payoff",
    intendedEmotion: "warm relief",
    visual: {
      setting: requestContinuity.settings[0].appearance,
      characters: [
        { id: "maya", appearance: requestContinuity.characters[0].appearance, position: "Kneeling at the left porch step.", action: "Catches the returning paper boat with both hands." },
        { id: "grandpa", appearance: requestContinuity.characters[1].appearance, position: "At the right edge of the porch gutter.", action: "Guides the boat toward Maya with a walking stick." },
      ],
      focalAction: `Grandpa guides Maya's lost paper boat back into her waiting hands ${marker}.`,
      focalObject: "The red paper boat moving between Grandpa and Maya.",
      composition: "Put the boat between their hands on one uninterrupted diagonal sightline.",
      emotionalCue: "Maya's surprise opens into relief while Grandpa smiles gently.",
      visibleText: "",
      continuityNotes: ["Keep the raincoats, porch, and red boat identical to the earlier scene."],
    },
  };
  return { content_hash: sceneContentHash(beat.visual, requestContinuity), continuity: requestContinuity, beat };
}

const image = { dataUrl: "data:image/webp;base64,AAAA", mimeType: "image/webp" as const };
const reference = {
  environment: image,
  characters: continuity.characters.map((character) => ({ id: character.id, image })),
};
const passingReview = {
  passed: true,
  story_core_clear: true,
  emotional_purpose_clear: true,
  material_failure: false,
  required_characters_present: true,
  unexpected_character_or_reveal: false,
  unexpected_object_or_clue: false,
  focal_object_present: true,
  focal_action_clear: true,
  relationship_clear: true,
  contradiction: false,
  identity_consistent: true,
  wardrobe_consistent: true,
  setting_consistent: true,
  room_layout_consistent: true,
  lighting_consistent: true,
  prop_continuity_consistent: true,
  continuity_consistent: true,
  clarification: "",
};
const failingReview = {
  ...passingReview,
  passed: false,
  focal_action_clear: false,
  relationship_clear: false,
  clarification: "Place the red boat visibly between Grandpa's guiding stick and Maya's waiting hands.",
};

function provider(reviews: Array<typeof passingReview | typeof failingReview>) {
  let reviewIndex = 0;
  const value: SceneImageProvider = {
    prepareEnvironmentReference: vi.fn(async () => reference.environment),
    prepareCharacterReference: vi.fn(async () => image),
    generate: vi.fn(async () => image),
    repair: vi.fn(async () => image),
    review: vi.fn(async () => reviews[Math.min(reviewIndex++, reviews.length - 1)]),
  };
  return value;
}

function expectedReference(input: ReturnType<typeof request>) {
  return {
    content_hash: continuityContentHash(input.continuity),
    environment_image_data_url: image.dataUrl,
    characters: input.continuity.characters.map((character) => ({ id: character.id, image_data_url: image.dataUrl })),
  };
}

describe("scene image handler", () => {
  it("returns a semantically accepted scene and caches it by stable content hash", async () => {
    const input = request("cache-case");
    const sceneProvider = provider([passingReview]);
    const first = await handleScene("POST", input, sceneProvider);
    const second = await handleScene("POST", input, sceneProvider);

    expect(first).toEqual({
      status: 200,
      body: {
        content_hash: input.content_hash,
        image_data_url: image.dataUrl,
        continuity_reference: expectedReference(input),
      },
    });
    expect(second.status).toBe(200);
    expect(sceneProvider.generate).toHaveBeenCalledTimes(1);
    expect(sceneProvider.review).toHaveBeenCalledTimes(1);
    expect(sceneProvider.prepareEnvironmentReference).toHaveBeenCalledTimes(1);
    expect(sceneProvider.prepareCharacterReference).toHaveBeenCalledTimes(2);
  });

  it("makes concrete title locations mandatory in the generated scene prompt", () => {
    const input = request("literal-title-case");
    input.beat.title = "Granddaughter at Door";

    expect(scenePrompt(input)).toContain("MANDATORY LITERAL TITLE PROMISE");
    expect(scenePrompt(input)).toContain("A named door or doorway requires the actual doorway/opening in shot");
  });

  it("performs exactly one candidate-aware repair after a semantic mismatch", async () => {
    const input = request("repair-case");
    const sceneProvider = provider([failingReview, passingReview]);
    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.generate).toHaveBeenCalledTimes(1);
    expect(sceneProvider.repair).toHaveBeenCalledTimes(1);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, failingReview.clarification, "edit");
    expect(sceneProvider.review).toHaveBeenCalledTimes(2);
  });

  it("repairs an image that adds an undeclared clue even when the reviewer claims it passed", async () => {
    const input = request("extra-clue-case");
    const extraClueReview = {
      ...passingReview,
      unexpected_object_or_clue: true,
      clarification: "Remove the paw prints; only the declared human footprints may appear in this beat.",
    };
    const sceneProvider = provider([extraClueReview, passingReview]);
    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.generate).toHaveBeenCalledTimes(1);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, extraClueReview.clarification, "edit");
  });

  it("repairs an otherwise valid image when the declared lighting continuity drifts", async () => {
    const input = request("lighting-drift-case");
    const lightingDriftReview = {
      ...passingReview,
      passed: false,
      lighting_consistent: false,
      continuity_consistent: false,
      clarification: "Restore the stable soft neutral late-morning daylight and remove the blue cast.",
    };
    const sceneProvider = provider([lightingDriftReview, passingReview]);
    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, lightingDriftReview.clarification, "regenerate");
  });

  it("edits isolated wardrobe and prop continuity defects without discarding correct staging", async () => {
    const input = request("material-continuity-case");
    const materialContinuityReview = {
      ...passingReview,
      passed: false,
      material_failure: true,
      wardrobe_consistent: false,
      prop_continuity_consistent: false,
      continuity_consistent: false,
      clarification: "Restore Grandpa's green cardigan and the persistent red boat while preserving the correct staging.",
    };
    const sceneProvider = provider([materialContinuityReview, passingReview]);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, materialContinuityReview.clarification, "edit");
  });

  it("accepts a clear story beat when the reviewer records only cosmetic prop or wardrobe variance", async () => {
    const input = request("cosmetic-variance-case");
    const cosmeticVarianceReview = {
      ...passingReview,
      passed: false,
      focal_object_present: false,
      wardrobe_consistent: false,
      prop_continuity_consistent: false,
      continuity_consistent: false,
      clarification: "The toast is rectangular instead of triangular and Dad's socks are hidden by shoes.",
    };
    const sceneProvider = provider([cosmeticVarianceReview]);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).not.toHaveBeenCalled();
  });

  it("regenerates once from continuity references when the candidate breaks the room layout", async () => {
    const input = request("structural-repair-case");
    const roomDriftReview = {
      ...passingReview,
      passed: false,
      room_layout_consistent: false,
      continuity_consistent: false,
      contradiction: true,
      clarification: "Remove the split panel and restore one continuous porch composition.",
    };
    const sceneProvider = provider([roomDriftReview, passingReview]);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, roomDriftReview.clarification, "regenerate");
  });

  it("regenerates instead of preserving a candidate that misses both the focal object and action", async () => {
    const input = request("missing-focal-case");
    const missingFocalReview = {
      ...passingReview,
      passed: false,
      focal_object_present: false,
      focal_action_clear: false,
      clarification: "Create a clear floor gap between the table edge and Grandpa's moved chair.",
    };
    const sceneProvider = provider([missingFocalReview, passingReview]);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, missingFocalReview.clarification, "regenerate");
  });

  it("regenerates when the candidate misses the story core even if one focal cue is present", async () => {
    const input = request("missing-story-core-case");
    const missingCoreReview = {
      ...passingReview,
      passed: false,
      story_core_clear: false,
      focal_action_clear: false,
      clarification: "Present the open scorecard toward the baker so the winner reveal is immediately clear.",
    };
    const sceneProvider = provider([missingCoreReview, passingReview]);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, missingCoreReview.clarification, "regenerate");
  });

  it("edits isolated generated typography without discarding correct staging", async () => {
    const input = request("typography-repair-case");
    const typographyReview = {
      ...passingReview,
      passed: false,
      unexpected_object_or_clue: true,
      clarification: "Remove the readable caption text and return the same scene without typography.",
    };
    const sceneProvider = provider([typographyReview, passingReview]);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.repair).toHaveBeenCalledWith(input, reference, image, typographyReview.clarification, "edit");
  });

  it("retries one transient provider error before accepting a valid initial scene", async () => {
    const input = request("provider-retry-case");
    const sceneProvider = provider([passingReview]);
    vi.mocked(sceneProvider.generate)
      .mockRejectedValueOnce(new AIProviderError("Timed out while creating image."))
      .mockResolvedValueOnce(image);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.generate).toHaveBeenCalledTimes(2);
    expect(sceneProvider.repair).not.toHaveBeenCalled();
  });

  it("classifies and reports a provider failure after the bounded retry", async () => {
    const input = {
      ...request("provider-failure-case"),
      context: { story_id: "story-dad-joke", version_id: "version-7", beat_id: "beat-2", beat_number: 2 },
    };
    const sceneProvider = provider([passingReview]);
    vi.mocked(sceneProvider.generate).mockRejectedValue(new AIProviderError("RESOURCE_EXHAUSTED: quota reached."));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result).toEqual({
      status: 502,
      body: { error: { code: "SCENE_UNAVAILABLE", message: "Scene visual couldn't be created.", retryable: true } },
    });
    expect(sceneProvider.generate).toHaveBeenCalledTimes(2);
    expect(error.mock.calls.some((call) => String(call[1]).includes('"classification":"rate_limit"')
      && String(call[1]).includes('"story_id":"story-dad-joke"')
      && String(call[1]).includes('"beat_number":2'))).toBe(true);
    error.mockRestore();
  });

  it("does not retry a hard monthly spending cap and returns an actionable quota error", async () => {
    const input = request("provider-spending-cap-case");
    const sceneProvider = provider([passingReview]);
    vi.mocked(sceneProvider.generate).mockRejectedValue(new AIProviderError("429 Your project has exceeded its monthly spending cap."));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result).toEqual({
      status: 429,
      body: {
        error: {
          code: "SCENE_QUOTA_EXHAUSTED",
          message: "The Gemini project spending limit has been reached. Increase the limit, then try again.",
          retryable: true,
        },
      },
    });
    expect(sceneProvider.generate).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.some((call) => String(call[1]).includes('"classification":"quota_exhausted"'))).toBe(true);
    error.mockRestore();
  });

  it("does not retry a provider safety block", async () => {
    const input = request("safety-block-case");
    const sceneProvider = provider([passingReview]);
    vi.mocked(sceneProvider.generate).mockRejectedValue(new AIProviderError("SAFETY: image request blocked by policy."));
    const error = vi.spyOn(console, "error").mockImplementation(() => undefined);

    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(502);
    expect(sceneProvider.generate).toHaveBeenCalledTimes(1);
    expect(error.mock.calls.some((call) => String(call[1]).includes('"classification":"safety_block"'))).toBe(true);
    error.mockRestore();
  });

  it("uses the neutral failure contract instead of returning an inaccurate scene", async () => {
    const input = request("failure-case");
    const sceneProvider = provider([failingReview, failingReview]);
    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(422);
    expect(result.body).toEqual({
      error: { code: "SCENE_MISMATCH", message: "Scene visual couldn't be created.", retryable: true },
    });
    expect(sceneProvider.generate).toHaveBeenCalledTimes(1);
    expect(sceneProvider.repair).toHaveBeenCalledTimes(1);
  });

  it("forces an explicit retry even when a matching image is cached", async () => {
    const input = request("force-case");
    const sceneProvider = provider([passingReview, passingReview]);
    await handleScene("POST", input, sceneProvider);
    await handleScene("POST", { ...input, force: true }, sceneProvider);
    expect(sceneProvider.generate).toHaveBeenCalledTimes(2);
  });

  it("reuses a portable continuity reference without regenerating identities", async () => {
    const input = request("portable-reference-case");
    const firstProvider = provider([passingReview]);
    const first = await handleScene("POST", input, firstProvider);
    const secondProvider = provider([passingReview]);
    const result = await handleScene("POST", {
      ...input,
      force: true,
      continuity_reference: first.body.continuity_reference,
    }, secondProvider);

    expect(result.status).toBe(200);
    expect(secondProvider.prepareEnvironmentReference).not.toHaveBeenCalled();
    expect(secondProvider.prepareCharacterReference).not.toHaveBeenCalled();
    expect(secondProvider.generate).toHaveBeenCalledWith(
      expect.objectContaining({ continuity_reference: expectedReference(input) }),
      reference,
    );
  });

  it("passes only an immediately preceding accepted frame into the next beat and returns the current frame", async () => {
    const firstInput = {
      ...request("adjacent-first"),
      context: { story_id: "story-adjacent", version_id: "version-1", beat_id: "beat-1", beat_number: 1 },
    };
    const firstProvider = provider([passingReview]);
    const first = await handleScene("POST", firstInput, firstProvider);
    const secondInput = {
      ...request("adjacent-second"),
      continuity: firstInput.continuity,
      context: { story_id: "story-adjacent", version_id: "version-1", beat_id: "beat-2", beat_number: 2 },
      continuity_reference: first.body.continuity_reference,
    };
    secondInput.content_hash = sceneContentHash(secondInput.beat.visual, secondInput.continuity);
    const secondProvider = provider([passingReview]);

    const second = await handleScene("POST", secondInput, secondProvider);

    expect(second.status).toBe(200);
    expect(secondProvider.generate).toHaveBeenCalledWith(secondInput, {
      environment: image,
      characters: reference.characters,
      previousScene: { beatNumber: 1, beatTitle: firstInput.beat.title, image },
    });
    expect(second.body.continuity_reference).toEqual(expect.objectContaining({
      previous_scene: {
        beat_number: 2,
        beat_title: secondInput.beat.title,
        image_data_url: image.dataUrl,
      },
    }));
  });

  it("creates and returns identity references only for the cast visible in the beat", async () => {
    const input = request("visible-cast-case");
    input.beat.visual.characters = input.beat.visual.characters.slice(0, 1);
    input.content_hash = sceneContentHash(input.beat.visual, input.continuity);
    const sceneProvider = provider([passingReview]);
    const result = await handleScene("POST", input, sceneProvider);

    expect(result.status).toBe(200);
    expect(sceneProvider.prepareCharacterReference).toHaveBeenCalledTimes(1);
    expect(sceneProvider.prepareCharacterReference).toHaveBeenCalledWith(input.continuity.characters[0], input.continuity.style);
    expect(sceneProvider.generate).toHaveBeenCalledWith(input, {
      environment: image,
      characters: [{ id: "maya", image }],
    });
    expect(result.body.continuity_reference).toEqual({
      content_hash: continuityContentHash(input.continuity),
      environment_image_data_url: image.dataUrl,
      characters: [{ id: "maya", image_data_url: image.dataUrl }],
    });
  });

  it("rejects a continuity reference from a different story", async () => {
    const input = request("wrong-reference-case");
    const sceneProvider = provider([passingReview]);
    const result = await handleScene("POST", {
      ...input,
      continuity_reference: { ...expectedReference(input), content_hash: "continuity:00000000" },
    }, sceneProvider);

    expect(result.status).toBe(400);
    expect(sceneProvider.generate).not.toHaveBeenCalled();
  });

  it("rejects a stale non-adjacent scene reference instead of using it for the wrong beat", async () => {
    const input = {
      ...request("stale-adjacent-reference"),
      context: { story_id: "story-1", version_id: "version-2", beat_id: "beat-3", beat_number: 3 },
    };
    const sceneProvider = provider([passingReview]);
    const result = await handleScene("POST", {
      ...input,
      continuity_reference: {
        ...expectedReference(input),
        previous_scene: { beat_number: 6, beat_title: "Old Ending", image_data_url: image.dataUrl },
      },
    }, sceneProvider);

    expect(result.status).toBe(400);
    expect(sceneProvider.generate).not.toHaveBeenCalled();
  });

  it("builds prompts from the full scene and leaves exact typography to the UI", () => {
    const input = request("prompt-case");
    input.beat.visual.visibleText = "HOME";
    input.content_hash = sceneContentHash(input.beat.visual, input.continuity);
    const prompt = scenePrompt(input);

    expect(prompt).toContain(input.beat.action);
    expect(prompt).toContain(input.beat.visual.focalAction);
    expect(prompt).toContain(input.beat.visual.composition);
    expect(prompt).toContain(continuity.characters[0].appearance);
    expect(prompt).not.toContain("HOME");
    expect(prompt).not.toContain("label after generation");
    expect(prompt).toContain("Leave a clean, uncluttered lower-center area");
    expect(prompt).toContain("Do not draw any letters");
  });

  it("withholds continuity cast and props that are not declared for the current frame", () => {
    const input = request("withheld-prop-case");
    input.continuity.characters.push({
      id: "later-child",
      appearance: "A child whose identity is reserved for the final reveal.",
    });
    input.continuity.importantProps.push({
      id: "paw-prints",
      appearance: "Tiny muddy paw prints reserved for the later animal reveal.",
    });
    input.content_hash = sceneContentHash(input.beat.visual, input.continuity);
    const prompt = scenePrompt(input);

    expect(prompt).toContain(continuity.importantProps[0].appearance);
    expect(prompt).not.toContain("Tiny muddy paw prints");
    expect(prompt).not.toContain("identity is reserved for the final reveal");
    expect(prompt).toContain("exhaustive list of narrative clues");
  });
});
