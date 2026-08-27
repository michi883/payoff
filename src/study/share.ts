import { ART_KEYS, NARRATIVE_ROLES, type StudyStimulus } from "../domain/types";

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

export function encodeStudyStimulus(stimulus: StudyStimulus) {
  return toBase64Url(JSON.stringify(stimulus));
}

export function decodeStudyStimulus(value: string | null): StudyStimulus | null {
  if (!value || value.length > 12_000) return null;
  try {
    const parsed = JSON.parse(fromBase64Url(value)) as StudyStimulus;
    if (
      parsed.schema !== "payoff-study/v1" ||
      typeof parsed.projectId !== "string" || parsed.projectId.length > 60 ||
      typeof parsed.title !== "string" || parsed.title.length > 60 ||
      typeof parsed.format !== "string" || parsed.format.length > 80 ||
      typeof parsed.storyVersionId !== "string" || parsed.storyVersionId.length > 100 ||
      typeof parsed.storyHash !== "string" || parsed.storyHash.length > 100 ||
      !Array.isArray(parsed.beats) || parsed.beats.length !== 6
    ) return null;
    const validBeats = parsed.beats.every((beat, index) =>
      typeof beat.id === "string" && beat.id.length <= 100 &&
      beat.order === index + 1 &&
      typeof beat.title === "string" && beat.title.length <= 48 &&
      typeof beat.action === "string" && beat.action.length <= 180 &&
      typeof beat.line === "string" && beat.line.length <= 100 &&
      NARRATIVE_ROLES.includes(beat.narrativeRole) &&
      ART_KEYS.includes(beat.artKey)
    );
    return validBeats ? parsed : null;
  } catch {
    return null;
  }
}

export function studyShareUrl(stimulus: StudyStimulus) {
  const base = new URL(`${import.meta.env.BASE_URL}study`, window.location.origin);
  base.searchParams.set("stimulus", encodeStudyStimulus(stimulus));
  return base.toString();
}
