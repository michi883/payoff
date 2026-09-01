import {
  SceneGenerationRequestSchema,
  SceneQualityReviewSchema,
  type SceneContinuityReference as SceneReferencePayload,
  type SceneGenerationRequest,
  type SceneQualityReview,
} from "./aiSchemas.ts";
import { continuityContentHash, stableHash } from "../src/domain/visuals.ts";
import type { ApiResult } from "./handlers.ts";
import { AIConfigurationError, AIProviderError } from "./openaiProvider.ts";
import type { GeneratedSceneImage, SceneContinuityReference, SceneImageProvider } from "./sceneImageProvider.ts";

type CachedScene = { image: GeneratedSceneImage; reference: SceneReferencePayload };

const sceneCache = new Map<string, CachedScene>();
const sceneInFlight = new Map<string, Promise<ApiResult>>();
const referenceCache = new Map<string, GeneratedSceneImage>();
const referenceInFlight = new Map<string, Promise<GeneratedSceneImage>>();
const MAX_CACHED_SCENES = 36;
const MAX_CACHED_REFERENCES = 36;

type SceneTrace = {
  trace_id: string;
  story_id: string;
  version_id: string;
  beat_id: string;
  beat_number: number | null;
  beat_title: string;
  content_hash: string;
  provider: string;
  model: string;
  review_model: string;
};

function traceFor(input: SceneGenerationRequest, provider: SceneImageProvider): SceneTrace {
  return {
    trace_id: `${input.content_hash}:${Date.now().toString(36)}`,
    story_id: input.context?.story_id ?? "unknown",
    version_id: input.context?.version_id ?? "unknown",
    beat_id: input.context?.beat_id ?? "unknown",
    beat_number: input.context?.beat_number ?? null,
    beat_title: input.beat.title,
    content_hash: input.content_hash,
    provider: provider.providerName ?? "unknown",
    model: provider.model ?? "unknown",
    review_model: provider.reviewModel ?? "unknown",
  };
}

function diagnostic(level: "info" | "warn" | "error", trace: SceneTrace, event: string, details: Record<string, unknown> = {}) {
  console[level]("[Payoff AI:scene-diagnostic]", JSON.stringify({ event, at: new Date().toISOString(), ...trace, ...details }));
}

function errorDetails(error: unknown) {
  let current: unknown = error;
  let status: number | undefined;
  let code: string | undefined;
  for (let depth = 0; depth < 4 && current && typeof current === "object"; depth += 1) {
    const value = current as { status?: unknown; code?: unknown; cause?: unknown };
    if (typeof value.status === "number") status ??= value.status;
    if (typeof value.code === "string") code ??= value.code;
    current = value.cause;
  }
  const message = error instanceof Error ? error.message : "Unknown scene provider failure";
  const normalized = `${code ?? ""} ${message}`.toLowerCase();
  const classification = /monthly spending cap|project spending cap|spend cap|billing cap/u.test(normalized)
    ? "quota_exhausted"
    : status === 429 || /rate|quota|resource exhausted/u.test(normalized)
      ? "rate_limit"
    : /timeout|timed out|abort/u.test(normalized)
      ? "timeout"
      : /safety|refusal|blocked|policy/u.test(normalized)
        ? "safety_block"
        : /image data|unsupported image|valid image|malformed/u.test(normalized)
          ? "invalid_asset"
          : "provider_error";
  return { classification, provider_status: status ?? null, provider_code: code ?? null, message };
}

async function providerOperation<T>(
  trace: SceneTrace,
  stage: string,
  operation: () => Promise<T>,
  maxAttempts = 2,
): Promise<T> {
  let lastError: unknown;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const started = Date.now();
    diagnostic("info", trace, "provider_stage_started", { stage, attempt, max_attempts: maxAttempts });
    try {
      const value = await operation();
      diagnostic("info", trace, "provider_stage_completed", { stage, attempt, latency_ms: Date.now() - started });
      return value;
    } catch (error) {
      lastError = error;
      const details = errorDetails(error);
      const retrying = error instanceof AIProviderError
        && details.classification !== "safety_block"
        && details.classification !== "quota_exhausted"
        && attempt < maxAttempts;
      diagnostic(retrying ? "warn" : "error", trace, "provider_stage_failed", {
        stage,
        attempt,
        latency_ms: Date.now() - started,
        retrying,
        ...details,
      });
      if (!retrying) throw error;
    }
  }
  throw lastError;
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}

function errorResult(status: number, code: string, message: string, retryable = false): ApiResult {
  return { status, body: { error: { code, message, retryable } } };
}

function imageFromDataUrl(dataUrl: string): GeneratedSceneImage {
  const match = /^data:(image\/(?:webp|png|jpeg));base64,[A-Za-z0-9+/=]+$/u.exec(dataUrl);
  if (!match) throw new Error("The continuity reference image is invalid.");
  return { dataUrl, mimeType: match[1] as GeneratedSceneImage["mimeType"] };
}

/** Storytelling requirements. A frame that misses one of these misrepresents its own beat. */
function storytellingHolds(review: SceneQualityReview) {
  return review.story_core_clear
    && review.emotional_purpose_clear
    && review.required_characters_present
    && !review.unexpected_character_or_reveal
    && !review.unexpected_object_or_clue
    && review.focal_action_clear
    && review.relationship_clear
    && !review.contradiction;
}

function reviewPasses(review: SceneQualityReview) {
  return storytellingHolds(review)
    && !review.material_failure
    && review.identity_consistent
    && review.setting_consistent
    && review.room_layout_consistent
    && review.lighting_consistent;
}

/**
 * Acceptance bar for a candidate that has already been through the bounded repair pass. The
 * reviewer's own contract lets a cosmetic prop or wardrobe variance leave a continuity flag false
 * while the frame still reads correctly, so drift of that kind — and a material_failure raised by
 * nothing else — no longer withholds the only frame the creator has. Identity and setting stay
 * blocking because they break the whole sequence rather than one card.
 */
function repairPasses(review: SceneQualityReview) {
  return storytellingHolds(review)
    && review.identity_consistent
    && review.setting_consistent;
}

function remember(hash: string, image: GeneratedSceneImage, reference: SceneReferencePayload) {
  sceneCache.delete(hash);
  sceneCache.set(hash, { image, reference });
  while (sceneCache.size > MAX_CACHED_SCENES) {
    const oldest = sceneCache.keys().next().value as string | undefined;
    if (!oldest) break;
    sceneCache.delete(oldest);
  }
}

function rememberReference(hash: string, image: GeneratedSceneImage) {
  referenceCache.delete(hash);
  referenceCache.set(hash, image);
  while (referenceCache.size > MAX_CACHED_REFERENCES) {
    const oldest = referenceCache.keys().next().value as string | undefined;
    if (!oldest) break;
    referenceCache.delete(oldest);
  }
}

async function referenceAsset(hash: string, trace: SceneTrace, stage: string, create: () => Promise<GeneratedSceneImage>) {
  const cached = referenceCache.get(hash);
  if (cached) {
    diagnostic("info", trace, "reference_cache_hit", { stage, reference_hash: hash });
    return cached;
  }
  const pending = referenceInFlight.get(hash);
  if (pending) {
    diagnostic("info", trace, "reference_inflight_joined", { stage, reference_hash: hash });
    return pending;
  }
  const requested = providerOperation(trace, stage, create).then((image) => {
    rememberReference(hash, image);
    return image;
  }).finally(() => referenceInFlight.delete(hash));
  referenceInFlight.set(hash, requested);
  return requested;
}

async function continuityReference(
  input: SceneGenerationRequest,
  provider: SceneImageProvider,
  trace: SceneTrace,
): Promise<{ providerReference: SceneContinuityReference; payload: SceneReferencePayload }> {
  const continuity = input.continuity;
  const requiredCharacterIds = new Set(input.beat.visual.characters.map((character) => character.id.toLowerCase()));
  const requiredCharacters = continuity.characters.filter((character) => requiredCharacterIds.has(character.id.toLowerCase()));
  const environmentKey = `environment:${stableHash({ schema: 3, settings: continuity.settings, timeOfDay: continuity.timeOfDay, lighting: continuity.lighting, style: continuity.style })}`;
  const provided = input.continuity_reference;
  const providedCharacters = new Map(provided?.characters.map((character) => [character.id.toLowerCase(), character.image_data_url]));
  const providedPrevious = input.context
    && provided?.previous_scene?.beat_number === input.context.beat_number - 1
    ? {
      beatNumber: provided.previous_scene.beat_number,
      beatTitle: provided.previous_scene.beat_title,
      image: imageFromDataUrl(provided.previous_scene.image_data_url),
    }
    : undefined;
  const [environment, ...characterImages] = await Promise.all([
    provided
      ? Promise.resolve(imageFromDataUrl(provided.environment_image_data_url))
      : referenceAsset(environmentKey, trace, "environment_reference", () => provider.prepareEnvironmentReference(continuity)),
    ...requiredCharacters.map((character) => {
      const providedImage = providedCharacters.get(character.id.toLowerCase());
      if (providedImage) return Promise.resolve(imageFromDataUrl(providedImage));
      const key = `character:${stableHash({ schema: 1, character, style: continuity.style })}`;
      return referenceAsset(key, trace, `character_reference:${character.id}`, () => provider.prepareCharacterReference(character, continuity.style));
    }),
  ]);
  const characters = requiredCharacters.map((character, index) => ({ id: character.id, image: characterImages[index] }));
  return { providerReference: {
    environment,
    characters,
    previousScene: providedPrevious,
  }, payload: {
    content_hash: continuityContentHash(continuity),
    environment_image_data_url: environment.dataUrl,
    characters: characters.map((character) => ({ id: character.id, image_data_url: character.image.dataUrl })),
  } };
}

function referenceAfterScene(
  input: SceneGenerationRequest,
  reference: SceneReferencePayload,
  image: GeneratedSceneImage,
): SceneReferencePayload {
  if (!input.context) return reference;
  return {
    ...reference,
    previous_scene: {
      beat_number: input.context.beat_number,
      beat_title: input.beat.title,
      image_data_url: image.dataUrl,
    },
  };
}

async function createAcceptedScene(
  input: SceneGenerationRequest,
  provider: SceneImageProvider,
  trace: SceneTrace,
): Promise<ApiResult> {
  const { providerReference: reference, payload: referencePayload } = await continuityReference(input, provider, trace);
  diagnostic("info", trace, "continuity_ready", {
    character_reference_count: reference.characters.length,
    adjacent_scene_reference: reference.previousScene
      ? { beat_number: reference.previousScene.beatNumber, beat_title: reference.previousScene.beatTitle }
      : null,
    reference_payload_bytes: reference.environment.dataUrl.length + reference.characters.reduce((sum, character) => sum + character.image.dataUrl.length, 0),
  });

  const reviewCandidate = (stage: string, image: GeneratedSceneImage) => providerOperation(trace, stage, async () => {
    const parsed = SceneQualityReviewSchema.safeParse(await provider.review(input, reference, image));
    if (!parsed.success) throw new AIProviderError(`Semantic review returned malformed output: ${parsed.error.issues[0]?.message ?? "unknown schema mismatch"}`);
    diagnostic("info", trace, "semantic_review_completed", { stage, passed: reviewPasses(parsed.data), review: parsed.data });
    return parsed.data;
  });

  const first = await providerOperation(trace, "scene_generation", () => provider.generate(input, reference));
  const firstReview = await reviewCandidate("initial_semantic_review", first);
  if (reviewPasses(firstReview)) {
    const nextReference = referenceAfterScene(input, referencePayload, first);
    remember(input.content_hash, first, nextReference);
    diagnostic("info", trace, "scene_accepted", { phase: "initial", image_bytes: first.dataUrl.length, cache: "server_memory" });
    return { status: 200, body: { content_hash: input.content_hash, image_data_url: first.dataUrl, continuity_reference: nextReference } };
  }

  const clarification = firstReview.clarification
    ? firstReview.clarification
    : "Make every required character, focal object, action, and spatial relationship unmistakable; match recurring identities exactly to the reference; and remove every undeclared character, object, clue, or contradictory element.";
  const repairStrategy = !firstReview.setting_consistent
    || !firstReview.room_layout_consistent
    || !firstReview.identity_consistent
    || !firstReview.lighting_consistent
    || !firstReview.story_core_clear
    || firstReview.contradiction
    || (!firstReview.focal_object_present && !firstReview.focal_action_clear)
    ? "regenerate" as const
    : "edit" as const;
  diagnostic("warn", trace, "semantic_repair_triggered", { clarification, repair_strategy: repairStrategy, initial_review: firstReview });
  const repaired = await providerOperation(
    trace,
    repairStrategy === "edit" ? "candidate_aware_repair" : "structural_scene_regeneration",
    () => provider.repair(input, reference, first, clarification, repairStrategy),
  );
  const repairedReview = await reviewCandidate("repair_semantic_review", repaired);
  // A repair can regress a candidate that was already close, so judge both frames and keep the
  // better one instead of discarding the work and leaving the creator an empty card.
  const accepted = repairPasses(repairedReview)
    ? { image: repaired, phase: "repair" as const }
    : repairPasses(firstReview)
      ? { image: first, phase: "initial_after_regressed_repair" as const }
      : null;
  if (accepted) {
    const nextReference = referenceAfterScene(input, referencePayload, accepted.image);
    remember(input.content_hash, accepted.image, nextReference);
    diagnostic("info", trace, "scene_accepted", {
      phase: accepted.phase,
      image_bytes: accepted.image.dataUrl.length,
      cache: "server_memory",
      accepted_review: accepted.phase === "repair" ? repairedReview : firstReview,
    });
    return { status: 200, body: { content_hash: input.content_hash, image_data_url: accepted.image.dataUrl, continuity_reference: nextReference } };
  }
  diagnostic("warn", trace, "scene_rejected", { classification: "semantic_mismatch", initial_review: firstReview, repaired_review: repairedReview });
  return errorResult(422, "SCENE_MISMATCH", "Scene visual couldn't be created.", true);
}

export async function handleScene(method: string | undefined, body: unknown, provider: SceneImageProvider): Promise<ApiResult> {
  if (method !== "POST") return { ...errorResult(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint."), allow: "POST" };
  const input = SceneGenerationRequestSchema.safeParse(parseBody(body));
  if (!input.success) return errorResult(400, "INVALID_REQUEST", input.error.issues[0]?.message ?? "The scene request is invalid.");
  const trace = traceFor(input.data, provider);
  const requestStarted = Date.now();
  diagnostic("info", trace, "scene_request_received", {
    request_bytes: Buffer.byteLength(typeof body === "string" ? body : JSON.stringify(body)),
    force: Boolean(input.data.force),
    supplied_continuity_reference: Boolean(input.data.continuity_reference),
    prompt_summary: {
      setting: input.data.beat.visual.setting,
      character_ids: input.data.beat.visual.characters.map((character) => character.id),
      focal_action: input.data.beat.visual.focalAction,
      focal_object: input.data.beat.visual.focalObject,
      composition: input.data.beat.visual.composition,
      time_of_day: input.data.continuity.timeOfDay ?? "legacy-unspecified",
      lighting: input.data.continuity.lighting ?? "legacy-unspecified",
    },
  });
  const suppliedReference = input.data.continuity_reference;
  if (suppliedReference) {
    const expectedHash = continuityContentHash(input.data.continuity);
    const allowedCharacters = new Set(input.data.continuity.characters.map((character) => character.id.toLowerCase()));
    if (suppliedReference.content_hash !== expectedHash
      || suppliedReference.characters.some((character) => !allowedCharacters.has(character.id.toLowerCase()))
      || (suppliedReference.previous_scene
        && (!input.data.context
          || suppliedReference.previous_scene.beat_number !== input.data.context.beat_number - 1))
      || JSON.stringify(suppliedReference).length > 4_000_000) {
      return errorResult(400, "INVALID_REQUEST", "The continuity reference does not match this story.");
    }
  }

  const cached = !input.data.force ? sceneCache.get(input.data.content_hash) : undefined;
  if (cached) {
    diagnostic("info", trace, "scene_cache_hit", { latency_ms: Date.now() - requestStarted });
    return { status: 200, body: { content_hash: input.data.content_hash, image_data_url: cached.image.dataUrl, continuity_reference: cached.reference } };
  }

  try {
    const pending = !input.data.force ? sceneInFlight.get(input.data.content_hash) : undefined;
    if (pending) {
      diagnostic("info", trace, "scene_inflight_joined");
      return await pending;
    }
    const requested = createAcceptedScene(input.data, provider, trace);
    if (!input.data.force) sceneInFlight.set(input.data.content_hash, requested);
    try {
      const result = await requested;
      diagnostic(result.status === 200 ? "info" : "warn", trace, "scene_request_completed", { status: result.status, latency_ms: Date.now() - requestStarted });
      return result;
    } finally {
      if (!input.data.force) sceneInFlight.delete(input.data.content_hash);
    }
  } catch (error) {
    if (error instanceof AIConfigurationError) {
      diagnostic("error", trace, "scene_request_failed", { status: 503, latency_ms: Date.now() - requestStarted, classification: "configuration" });
      return errorResult(503, "AI_NOT_CONFIGURED", "Scene visual couldn't be created.", true);
    }
    const details = errorDetails(error);
    if (details.classification === "quota_exhausted") {
      diagnostic("error", trace, "scene_request_failed", { status: 429, latency_ms: Date.now() - requestStarted, ...details });
      return errorResult(429, "SCENE_QUOTA_EXHAUSTED", "The Gemini project spending limit has been reached. Increase the limit, then try again.", true);
    }
    diagnostic("error", trace, "scene_request_failed", { status: 502, latency_ms: Date.now() - requestStarted, ...details });
    return errorResult(502, "SCENE_UNAVAILABLE", "Scene visual couldn't be created.", true);
  }
}
