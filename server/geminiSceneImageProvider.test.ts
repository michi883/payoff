import { beforeEach, describe, expect, it, vi } from "vitest";
import { sceneContentHash } from "../src/domain/visuals";
import type { BeatDraft, VisualContinuity } from "../src/domain/types";
import { createGeminiSceneImageProvider } from "./geminiSceneImageProvider";

const mocks = vi.hoisted(() => ({ createInteraction: vi.fn(), normalizeImage: vi.fn() }));

vi.mock("@google/genai", () => ({
  GoogleGenAI: class {
    interactions = { create: mocks.createInteraction };
  },
}));

vi.mock("sharp", () => ({
  default: () => ({
    rotate: () => ({
      resize: () => ({
        jpeg: () => ({ toBuffer: mocks.normalizeImage }),
      }),
    }),
  }),
}));

const continuity: VisualContinuity = {
  characters: [{ id: "kid", appearance: "Ten years old, short black curls, red hoodie, navy shorts." }],
  settings: [{ id: "living-room", appearance: "Warm family living room with a tan sofa and walnut coffee table." }],
  importantProps: [{ id: "notebook", appearance: "Blue spiral notebook with a subtle star pattern." }],
  timeOfDay: "Bright mid-morning throughout.",
  lighting: "Stable warm-neutral window daylight without dramatic grading.",
  style: "Warm, polished editorial storybook illustration with expressive faces and natural proportions.",
};

const beat: BeatDraft = {
  title: "Timer tension grows",
  action: "The kid slides the joke notebook closer while Dad reaches for the red timer.",
  line: "",
  narrativeRole: "escalation",
  intendedEmotion: "playful tension",
  visual: {
    setting: continuity.settings[0].appearance,
    characters: [{
      id: "kid",
      appearance: continuity.characters[0].appearance,
      position: "Leaning over the left side of the coffee table.",
      action: "Pushes the notebook toward Dad with an eager grin.",
    }],
    focalAction: "The notebook and Dad's reaching hand converge beside the red timer.",
    focalObject: "The red timer between the notebook and Dad's hand.",
    composition: "Keep the timer large and centered with the kid clearly visible at left.",
    emotionalCue: "The kid beams while Dad braces for another joke.",
    visibleText: "5:00",
    continuityNotes: ["Keep the kid, living room, notebook, and timer consistent."],
  },
};

const jpeg = { dataUrl: "data:image/jpeg;base64,AAAA", mimeType: "image/jpeg" as const };

describe("Gemini scene image provider", () => {
  beforeEach(() => {
    mocks.createInteraction.mockReset();
    mocks.normalizeImage.mockReset();
    mocks.normalizeImage.mockResolvedValue(Buffer.from("AAAA", "base64"));
    mocks.createInteraction.mockResolvedValue({ output_image: { type: "image", mime_type: "image/jpeg", data: "AAAA" } });
  });

  it("requests square identity references while preserving the same compact output contract", async () => {
    const provider = createGeminiSceneImageProvider({ apiKey: "gemini-test-key" });
    await provider.prepareCharacterReference(continuity.characters[0], continuity.style);

    expect(mocks.createInteraction).toHaveBeenCalledWith(expect.objectContaining({
      response_format: expect.objectContaining({ aspect_ratio: "1:1", image_size: "1K" }),
    }), { timeout_ms: 100_000 });
    expect(mocks.normalizeImage).toHaveBeenCalledOnce();
  });

  it("uses Gemini 3.1 Flash Lite Image with compact 16:9 JPEG output", async () => {
    const provider = createGeminiSceneImageProvider({ apiKey: "gemini-test-key" });
    const result = await provider.prepareEnvironmentReference(continuity);

    expect(result).toEqual(jpeg);
    expect(provider.providerName).toBe("google");
    expect(provider.model).toBe("gemini-3.1-flash-lite-image");
    expect(provider.reviewModel).toBe("gpt-5.4");
    expect(mocks.createInteraction).toHaveBeenCalledWith(expect.objectContaining({
      model: "gemini-3.1-flash-lite-image",
      response_format: {
        type: "image",
        mime_type: "image/jpeg",
        aspect_ratio: "16:9",
        image_size: "1K",
      },
    }), { timeout_ms: 100_000 });
    expect(mocks.createInteraction.mock.calls[0][0].input).toContain("outermost pixels on all four sides");
    expect(mocks.createInteraction.mock.calls[0][0].input).toContain("no outer matte, frame, border, or page margin");
  });

  it("surfaces Gemini response errors when no image asset is returned", async () => {
    mocks.createInteraction.mockResolvedValueOnce({
      errors: [{ code: "SAFETY", message: "Image generation was blocked by the provider." }],
    });
    const provider = createGeminiSceneImageProvider({ apiKey: "gemini-test-key" });

    await expect(provider.prepareEnvironmentReference(continuity)).rejects.toThrow(
      "Gemini did not return an image: SAFETY: Image generation was blocked by the provider.",
    );
  });

  it("supplies labeled continuity images and the rejected candidate to semantic repair", async () => {
    const provider = createGeminiSceneImageProvider({ apiKey: "gemini-test-key" });
    const request = { content_hash: sceneContentHash(beat.visual, continuity), continuity, beat };
    const result = await provider.repair(request, {
      environment: jpeg,
      characters: [{ id: "kid", image: jpeg }],
    }, jpeg, "Move the timer into Dad's visible reaching hand.", "edit");

    expect(result).toEqual(jpeg);
    const call = mocks.createInteraction.mock.calls[0][0];
    expect(call.input).toHaveLength(6);
    expect(call.input[0].text).toContain("Image 1 is the authoritative people-free environment");
    expect(call.input[0].text).toContain("Image 2 is the authoritative identity and wardrobe reference for kid");
    expect(call.input[0].text).toContain("Move the timer into Dad's visible reaching hand.");
    expect(call.input[0].text).toContain("never a comparison, split panel");
    expect(call.input[1]).toEqual({ type: "image", mime_type: "image/jpeg", data: "AAAA" });
    expect(call.input[2]).toEqual({ type: "image", mime_type: "image/jpeg", data: "AAAA" });
    expect(call.input[3]).toEqual({ type: "text", text: "REJECTED CANDIDATE TO EDIT:" });
    expect(call.input[4]).toEqual({ type: "image", mime_type: "image/jpeg", data: "AAAA" });
    expect(call.input[5].text).toContain("FINAL REQUIRED EDIT");
    expect(call.input[5].text).toContain(beat.visual.focalAction);
    expect(call.input[5].text).toContain("Do not return the candidate unchanged");
  });

  it("uses a fresh constrained render for structural room-layout repair", async () => {
    const provider = createGeminiSceneImageProvider({ apiKey: "gemini-test-key" });
    const request = { content_hash: sceneContentHash(beat.visual, continuity), continuity, beat };

    await provider.repair(request, {
      environment: jpeg,
      characters: [{ id: "kid", image: jpeg }],
    }, jpeg, "Remove the split panel and restore one continuous living room.", "regenerate");

    const call = mocks.createInteraction.mock.calls[0][0];
    expect(call.input).toHaveLength(4);
    expect(call.input[0].text).toContain("Remove the split panel");
    expect(call.input[3].text).toContain("STRUCTURAL REPAIR");
    expect(call.input).not.toContainEqual({ type: "text", text: "REJECTED CANDIDATE TO EDIT:" });
  });

  it("labels the immediately preceding scene as continuity context without asking Gemini to copy its layout", async () => {
    const provider = createGeminiSceneImageProvider({ apiKey: "gemini-test-key" });
    const request = {
      content_hash: sceneContentHash(beat.visual, continuity),
      continuity,
      beat,
      context: { story_id: "story-1", version_id: "version-1", beat_id: "beat-2", beat_number: 2 },
    };

    await provider.generate(request, {
      environment: jpeg,
      characters: [{ id: "kid", image: jpeg }],
      previousScene: { beatNumber: 1, beatTitle: "First Joke", image: jpeg },
    });

    const call = mocks.createInteraction.mock.calls[0][0];
    expect(call.input).toHaveLength(4);
    expect(call.input[0].text).toContain("immediately preceding accepted scene, beat 1");
    expect(call.input[0].text).toContain("only story state required by the current beat or continuity notes");
    expect(call.input[0].text).toContain("Ordinary movable props may move, be occluded, or leave frame");
    expect(call.input[0].text).toContain("Compose a new scene");
    expect(call.input[3]).toEqual({ type: "image", mime_type: "image/jpeg", data: "AAAA" });
  });
});
