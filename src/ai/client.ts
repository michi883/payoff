import { AI_PERSONAS, NARRATIVE_ROLES } from "../domain/types";
import type {
  ApiErrorPayload,
  AudienceApiRequest,
  AudienceApiResponse,
  DiagnoseApiRequest,
  DiagnoseApiResponse,
  HumanAudienceApiRequest,
  HumanAudienceApiResponse,
  ReviseApiRequest,
  ReviseApiResponse,
  SceneApiRequest,
  SceneApiResponse,
  StoryboardApiRequest,
  StoryboardApiResponse,
} from "./contracts";
import { AI_AUDIENCE_LABEL, AI_AUDIENCE_NOTICE } from "./contracts";
import { runtimeConfig } from "../runtime";

export class PayoffApiError extends Error {
  code: string;
  retryable: boolean;
  status: number;

  constructor(message: string, code = "UNKNOWN", retryable = false, status = 0) {
    super(message);
    this.name = "PayoffApiError";
    this.code = code;
    this.retryable = retryable;
    this.status = status;
  }
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value && typeof value === "object" && !Array.isArray(value));
}

function hasText(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

function isVisual(value: unknown) {
  if (!isRecord(value) || !hasText(value.setting) || !hasText(value.focalAction)
    || !hasText(value.focalObject) || !hasText(value.composition) || !hasText(value.emotionalCue)
    || typeof value.visibleText !== "string" || !Array.isArray(value.continuityNotes) || !value.continuityNotes.every(hasText)
    || !Array.isArray(value.characters)) return false;
  return value.characters.every((character) => isRecord(character) && hasText(character.id)
    && hasText(character.appearance) && hasText(character.position) && hasText(character.action));
}

function isContinuity(value: unknown) {
  if (!isRecord(value) || !hasText(value.style)) return false;
  return ["characters", "settings", "importantProps"].every((field) => Array.isArray(value[field])
    && value[field].every((item) => isRecord(item) && hasText(item.id) && hasText(item.appearance)));
}

function isBeatDraft(value: unknown) {
  if (!isRecord(value)) return false;
  return hasText(value.title) && hasText(value.action) && typeof value.line === "string"
    && NARRATIVE_ROLES.includes(value.narrativeRole as (typeof NARRATIVE_ROLES)[number])
    && hasText(value.intendedEmotion) && isVisual(value.visual);
}

function isStoryboardResponse(value: unknown): value is StoryboardApiResponse {
  return isRecord(value) && hasText(value.title) && hasText(value.target_payoff) && isContinuity(value.visual_continuity)
    && Array.isArray(value.beats) && value.beats.length === 6 && value.beats.every(isBeatDraft);
}

function isSceneReference(value: unknown) {
  return isRecord(value)
    && /^continuity:[a-f0-9]{8}$/.test(String(value.content_hash))
    && typeof value.environment_image_data_url === "string"
    && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(value.environment_image_data_url)
    && Array.isArray(value.characters)
    && value.characters.every((character) => isRecord(character) && hasText(character.id)
      && typeof character.image_data_url === "string"
      && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(character.image_data_url));
}

function isSceneResponse(value: unknown): value is SceneApiResponse {
  return isRecord(value) && /^scene:[a-f0-9]{8}$/.test(String(value.content_hash))
    && typeof value.image_data_url === "string"
    && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(value.image_data_url)
    && isSceneReference(value.continuity_reference);
}

function isResultBeat(value: unknown) {
  return isRecord(value) && hasText(value.beat_id) && hasText(value.why);
}

function isAudienceReport(value: Record<string, unknown>) {
  return hasText(value.summary) && hasText(value.audience_landing) && hasText(value.main_risk)
    && hasText(value.what_landed) && hasText(value.where_it_drifted) && hasText(value.biggest_opportunity)
    && ["strong", "partial", "missed", "insufficient"].includes(String(value.match))
    && Array.isArray(value.observed_arc) && value.observed_arc.length >= 2 && value.observed_arc.every(hasText)
    && isResultBeat(value.strongest_beat) && isResultBeat(value.weakest_beat) && isResultBeat(value.changed_audience);
}

function isAudienceResponse(value: unknown): value is AudienceApiResponse {
  if (!isRecord(value) || value.source !== "ai" || value.label !== AI_AUDIENCE_LABEL || value.notice !== AI_AUDIENCE_NOTICE) return false;
  if (!hasText(value.story_version) || !isAudienceReport(value) || value.match === "insufficient") return false;
  if (!Array.isArray(value.disagreements) || !value.disagreements.every(hasText)) return false;
  if (!isRecord(value.confidence) || !["low", "medium", "high"].includes(String(value.confidence.level)) || !hasText(value.confidence.note)) return false;
  return Array.isArray(value.reactions) && value.reactions.length >= 4 && value.reactions.every((item) =>
    isRecord(item) && AI_PERSONAS.includes(item.persona as (typeof AI_PERSONAS)[number])
    && hasText(item.note) && hasText(item.evidence),
  );
}

function isHumanAudienceResponse(value: unknown): value is HumanAudienceApiResponse {
  return isRecord(value) && value.source === "human" && hasText(value.story_version) && hasText(value.story_hash)
    && Array.isArray(value.response_ids) && value.response_ids.length > 0 && value.response_ids.every(hasText)
    && isAudienceReport(value);
}

function isReviseResponse(value: unknown): value is ReviseApiResponse {
  if (!isRecord(value) || !hasText(value.story_version) || !["revision", "clarification"].includes(String(value.kind))) return false;
  if (!hasText(value.summary) || !(value.why === null || hasText(value.why))) return false;
  if (!(value.clarification_question === null || hasText(value.clarification_question)) || !Array.isArray(value.changes)) return false;
  const validChanges = value.changes.every((change) => isRecord(change) && hasText(change.beat_id)
    && hasText(change.what_changes) && isBeatDraft(change.replacement));
  if (!validChanges) return false;
  if (value.kind === "revision") return value.changes.length > 0 && hasText(value.why) && value.clarification_question === null;
  return value.changes.length === 0 && value.why === null && hasText(value.clarification_question);
}

function isDiagnoseResponse(value: unknown): value is DiagnoseApiResponse {
  return isRecord(value) && hasText(value.story_version) && ["ai", "human"].includes(String(value.audience_source))
    && hasText(value.answer) && Array.isArray(value.evidence) && value.evidence.length > 0
    && value.evidence.every((item) => isRecord(item) && (item.beat_id === null || hasText(item.beat_id)) && hasText(item.observation));
}

async function postJson<T>(
  path: string,
  body: unknown,
  validate: (value: unknown) => value is T,
  invalidMessage: string,
  signal?: AbortSignal,
  timeoutMs = 45_000,
): Promise<T> {
  const controller = new AbortController();
  let externalAbort = false;
  let timedOut = false;
  const onAbort = () => { externalAbort = true; controller.abort(); };
  if (signal?.aborted) throw new DOMException("The request was cancelled.", "AbortError");
  signal?.addEventListener("abort", onAbort, { once: true });
  const timeout = window.setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);

  try {
    const response = await fetch(path, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
        ...(runtimeConfig.demoMode ? { "X-Payoff-Demo": "1" } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    const payload = await response.json().catch(() => null) as unknown;
    if (!response.ok) {
      const apiError = isRecord(payload) && isRecord(payload.error) ? payload as ApiErrorPayload : null;
      throw new PayoffApiError(
        apiError?.error.message ?? "Payoff couldn't complete that request.",
        apiError?.error.code ?? "API_ERROR",
        apiError?.error.retryable ?? response.status >= 500,
        response.status,
      );
    }
    if (!validate(payload)) throw new PayoffApiError(invalidMessage, "INVALID_AI_RESPONSE", true, 502);
    return payload;
  } catch (error) {
    if (error instanceof PayoffApiError) throw error;
    if (error instanceof DOMException && error.name === "AbortError") {
      if (externalAbort) throw error;
      if (timedOut) throw new PayoffApiError("Payoff took too long to respond. Please try again.", "TIMEOUT", true);
    }
    throw new PayoffApiError("Payoff couldn't reach its AI service. Try again in a moment.", "NETWORK_ERROR", true);
  } finally {
    window.clearTimeout(timeout);
    signal?.removeEventListener("abort", onAbort);
  }
}

export function generateStoryboard(input: StoryboardApiRequest, signal?: AbortSignal) {
  return postJson("/api/storyboard", input, isStoryboardResponse, "Payoff couldn't finish that storyboard. Your brief is safe.", signal, 180_000);
}

export function generateSceneVisual(input: SceneApiRequest, signal?: AbortSignal) {
  return postJson("/api/scene", input, isSceneResponse, "Scene visual couldn't be created.", signal, 300_000);
}

export function runAIAudience(input: AudienceApiRequest, signal?: AbortSignal) {
  return postJson("/api/audience", input, isAudienceResponse, "Payoff couldn't finish that audience check. Your story was not changed.", signal, 120_000);
}

export function interpretHumanAudience(input: HumanAudienceApiRequest, signal?: AbortSignal) {
  return postJson("/api/audience", input, isHumanAudienceResponse, "Payoff couldn't make sense of those viewer responses. Your responses are safe.", signal, 120_000);
}

export function diagnoseAudience(input: DiagnoseApiRequest, signal?: AbortSignal) {
  return postJson("/api/diagnose", input, isDiagnoseResponse, "Payoff couldn't explain that result just now. Your story was not changed.", signal, 120_000);
}

export function requestRevision(input: ReviseApiRequest, signal?: AbortSignal) {
  return postJson("/api/revise", input, isReviseResponse, "Payoff couldn't prepare that revision. Try again.", signal, 180_000);
}
