import { CANONICAL_ART_KEYS, NARRATIVE_ROLES, type BeatArtwork, type BeatVisual, type StudyStimulus, type VisualContinuity } from "../domain/types";
import { EMPTY_VISUAL_CONTINUITY, generatedArtwork, legacyVisualBrief } from "../domain/visuals";

function toBase64Url(value: string) {
  const bytes = new TextEncoder().encode(value);
  let binary = "";
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
  const normalized = value.replaceAll("-", "+").replaceAll("_", "/");
  const padded = normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "=");
  const binary = atob(padded);
  return new TextDecoder().decode(Uint8Array.from(binary, (character) => character.charCodeAt(0)));
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasText(value: unknown, max: number) {
  return typeof value === "string" && value.trim().length > 0 && value.length <= max;
}

function isVisual(value: unknown): value is BeatVisual {
  if (!isRecord(value) || !hasText(value.setting, 280) || !hasText(value.focalAction, 320)
    || !hasText(value.focalObject, 260) || !hasText(value.composition, 360) || !hasText(value.emotionalCue, 220)
    || typeof value.visibleText !== "string" || value.visibleText.length > 80
    || !Array.isArray(value.continuityNotes) || value.continuityNotes.length > 6 || !value.continuityNotes.every((item) => hasText(item, 240))
    || !Array.isArray(value.characters) || value.characters.length > 8) return false;
  return value.characters.every((character) => isRecord(character) && hasText(character.id, 80)
    && hasText(character.appearance, 260) && hasText(character.position, 220) && hasText(character.action, 260));
}

function isContinuity(value: unknown): value is VisualContinuity {
  if (!isRecord(value) || !hasText(value.style, 320)
    || (value.timeOfDay !== undefined && !hasText(value.timeOfDay, 180))
    || (value.lighting !== undefined && !hasText(value.lighting, 240))) return false;
  return ["characters", "settings", "importantProps"].every((field) => Array.isArray(value[field])
    && value[field].length <= 8 && value[field].every((entry) => isRecord(entry) && hasText(entry.id, 80) && hasText(entry.appearance, 280)));
}

function isArtwork(value: unknown): value is BeatArtwork {
  return isRecord(value) && (value.source === "generated" || value.source === "canonical")
    && hasText(value.contentHash, 100) && isVisual(value.spec)
    && (value.source !== "canonical" || CANONICAL_ART_KEYS.includes(value.key as (typeof CANONICAL_ART_KEYS)[number]));
}

export function encodeStudyStimulus(stimulus: StudyStimulus) {
  return toBase64Url(JSON.stringify(stimulus));
}

export function decodeStudyStimulus(value: string | null): StudyStimulus | null {
  if (!value || value.length > 64_000) return null;
  try {
    const raw = JSON.parse(fromBase64Url(value)) as Record<string, unknown>;
    if (raw.schema === "payoff-study/v1" && Array.isArray(raw.beats)) {
      const continuity = structuredClone(EMPTY_VISUAL_CONTINUITY);
      raw.schema = "payoff-study/v2";
      raw.visualContinuity = continuity;
      raw.beats = raw.beats.map((value) => {
        if (!isRecord(value)) return value;
        const title = String(value.title ?? "Story beat");
        const action = String(value.action ?? "A visible story moment happens.");
        const line = typeof value.line === "string" ? value.line : "";
        const { artKey: _legacyArtKey, ...beat } = value;
        void _legacyArtKey;
        return { ...beat, visual: generatedArtwork(legacyVisualBrief({ title, action, line }), continuity) };
      });
    }
    if (
      raw.schema !== "payoff-study/v2" ||
      typeof raw.projectId !== "string" || raw.projectId.length > 60 ||
      typeof raw.title !== "string" || raw.title.length > 60 ||
      typeof raw.format !== "string" || raw.format.length > 80 ||
      typeof raw.storyVersionId !== "string" || raw.storyVersionId.length > 100 ||
      typeof raw.storyHash !== "string" || raw.storyHash.length > 100 ||
      !isContinuity(raw.visualContinuity) ||
      !Array.isArray(raw.beats) || raw.beats.length !== 6
    ) return null;
    const validBeats = raw.beats.every((value, index) => {
      if (!isRecord(value)) return false;
      return typeof value.id === "string" && value.id.length <= 100
        && value.order === index + 1
        && typeof value.title === "string" && value.title.length <= 48
        && typeof value.action === "string" && value.action.length <= 180
        && typeof value.line === "string" && value.line.length <= 100
        && NARRATIVE_ROLES.includes(value.narrativeRole as (typeof NARRATIVE_ROLES)[number])
        && isArtwork(value.visual);
    });
    return validBeats ? raw as unknown as StudyStimulus : null;
  } catch {
    return null;
  }
}

export function studyShareUrl(stimulus: StudyStimulus) {
  const base = new URL(`${import.meta.env.BASE_URL}study`, window.location.origin);
  base.searchParams.set("stimulus", encodeStudyStimulus(stimulus));
  return base.toString();
}
