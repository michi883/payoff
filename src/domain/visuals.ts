import type {
  BeatArtwork,
  BeatVisual,
  CanonicalArtKey,
  VisualContinuity,
} from "./types.ts";

export const DEFAULT_VISUAL_STYLE = "Minimal editorial storyboard illustration, warm human gestures, clean geometric shapes, limited detail, textured paper, no photorealism.";

export const EMPTY_VISUAL_CONTINUITY: VisualContinuity = {
  characters: [],
  settings: [],
  importantProps: [],
  timeOfDay: "Unspecified neutral time; preserve one baseline across the sequence unless a beat explicitly changes it.",
  lighting: "Neutral soft storyboard lighting with no arbitrary color-temperature or exposure shifts.",
  style: DEFAULT_VISUAL_STYLE,
};

export function stableHash(value: unknown) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function sceneContentHash(spec: BeatVisual, continuity: VisualContinuity) {
  return `scene:${stableHash({ schema: 1, continuity, spec })}`;
}

export function continuityContentHash(continuity: VisualContinuity) {
  return `continuity:${stableHash({ schema: 1, continuity })}`;
}

export function generatedArtwork(spec: BeatVisual, continuity: VisualContinuity): BeatArtwork {
  return {
    source: "generated",
    spec: structuredClone(spec),
    contentHash: sceneContentHash(spec, continuity),
  };
}

export function canonicalArtwork(key: CanonicalArtKey, spec: BeatVisual): BeatArtwork {
  return {
    source: "canonical",
    key,
    spec: structuredClone(spec),
    contentHash: `canonical:${key}:v2`,
  };
}

export function legacyVisualBrief(input: {
  title: string;
  action: string;
  line?: string;
  intendedEmotion?: string;
}): BeatVisual {
  return {
    setting: "Use the location and time implied by the beat action.",
    characters: [],
    focalAction: input.action,
    focalObject: "The object or gesture that makes the action understandable.",
    composition: `Compose one clear storyboard frame for “${input.title}” so the relationship and action read before decorative detail.`,
    emotionalCue: input.intendedEmotion || "Match the visible emotional change in the action.",
    visibleText: input.line || "",
    continuityNotes: ["Preserve all established character, clothing, prop, and setting details from adjacent beats."],
  };
}

export function sameVisualSpec(left: BeatVisual, right: BeatVisual) {
  return JSON.stringify(left) === JSON.stringify(right);
}
