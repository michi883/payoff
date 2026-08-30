import { generateSceneVisual } from "../ai/client";
import type { SceneApiRequest, SceneApiResponse, SceneContinuityReference } from "../ai/contracts";
import { continuityContentHash } from "../domain/visuals";
import { resolveDemoSceneImage } from "../demo/provider";

const memoryCache = new Map<string, string>();
const inFlight = new Map<string, Promise<string>>();
const referenceMemory = new Map<string, SceneContinuityReference>();
const referenceInFlight = new Map<string, Promise<SceneContinuityReference>>();
const queue: Array<() => void> = [];
let activeRequests = 0;
const MAX_CONCURRENT_REQUESTS = 1;
const MAX_MEMORY_SCENES = 36;
const SCENE_RENDER_CACHE_VERSION = 6;
const REFERENCE_CACHE_VERSION = 4;

function clientDiagnostic(
  level: "info" | "warn" | "error",
  request: SceneApiRequest,
  event: string,
  details: Record<string, unknown> = {},
) {
  console[level]("[Payoff AI:scene-client]", JSON.stringify({
    event,
    at: new Date().toISOString(),
    story_id: request.context?.story_id ?? "unknown",
    version_id: request.context?.version_id ?? "unknown",
    beat_id: request.context?.beat_id ?? "unknown",
    beat_number: request.context?.beat_number ?? null,
    beat_title: request.beat.title,
    content_hash: request.content_hash,
    ...details,
  }));
}

function remember(hash: string, image: string) {
  memoryCache.delete(hash);
  memoryCache.set(hash, image);
  while (memoryCache.size > MAX_MEMORY_SCENES) {
    const oldest = memoryCache.keys().next().value as string | undefined;
    if (!oldest) break;
    memoryCache.delete(oldest);
  }
}

function schedule<T>(operation: () => Promise<T>) {
  return new Promise<T>((resolve, reject) => {
    const run = () => {
      activeRequests += 1;
      void operation().then(resolve, reject).finally(() => {
        activeRequests -= 1;
        queue.shift()?.();
      });
    };
    if (activeRequests < MAX_CONCURRENT_REQUESTS) run();
    else queue.push(run);
  });
}

function openDatabase() {
  return new Promise<IDBDatabase | null>((resolve) => {
    if (typeof indexedDB === "undefined") return resolve(null);
    const request = indexedDB.open("payoff-scene-cache", 1);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains("images")) request.result.createObjectStore("images");
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => resolve(null);
  });
}

async function readPersistent(hash: string) {
  const database = await openDatabase();
  if (!database) return null;
  return new Promise<string | null>((resolve) => {
    const transaction = database.transaction("images", "readonly");
    const request = transaction.objectStore("images").get(hash);
    request.onsuccess = () => resolve(typeof request.result === "string" ? request.result : null);
    request.onerror = () => resolve(null);
    transaction.oncomplete = () => database.close();
  });
}

async function writePersistent(hash: string, image: string) {
  const database = await openDatabase();
  if (!database) return "unavailable" as const;
  return new Promise<"stored" | "failed">((resolve) => {
    const transaction = database.transaction("images", "readwrite");
    transaction.objectStore("images").put(image, hash);
    transaction.oncomplete = () => { database.close(); resolve("stored"); };
    transaction.onerror = () => { database.close(); resolve("failed"); };
    transaction.onabort = () => { database.close(); resolve("failed"); };
  });
}

function isReference(value: unknown): value is SceneContinuityReference {
  if (!value || typeof value !== "object") return false;
  const reference = value as Partial<SceneContinuityReference>;
  return typeof reference.content_hash === "string"
    && /^continuity:[a-f0-9]{8}$/.test(reference.content_hash)
    && typeof reference.environment_image_data_url === "string"
    && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(reference.environment_image_data_url)
    && Array.isArray(reference.characters)
    && reference.characters.every((character) => typeof character?.id === "string"
      && typeof character.image_data_url === "string"
      && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(character.image_data_url))
    && (reference.previous_scene === undefined
      || (Number.isInteger(reference.previous_scene.beat_number)
        && reference.previous_scene.beat_number >= 1
        && reference.previous_scene.beat_number <= 6
        && typeof reference.previous_scene.beat_title === "string"
        && typeof reference.previous_scene.image_data_url === "string"
        && /^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i.test(reference.previous_scene.image_data_url)));
}

async function readReference(contentHash: string) {
  const memory = referenceMemory.get(contentHash);
  if (memory) return memory;
  const serialized = await readPersistent(`reference-v${REFERENCE_CACHE_VERSION}:${contentHash}`);
  if (!serialized) return null;
  try {
    const parsed: unknown = JSON.parse(serialized);
    if (!isReference(parsed) || parsed.content_hash !== contentHash) return null;
    referenceMemory.set(contentHash, parsed);
    return parsed;
  } catch {
    return null;
  }
}

async function rememberReference(reference: SceneContinuityReference, expectedHash: string) {
  if (reference.content_hash !== expectedHash) throw new Error("Scene visual couldn't be created.");
  const previous = referenceMemory.get(expectedHash) ?? await readReference(expectedHash);
  const characters = new Map(previous?.characters.map((character) => [character.id.toLowerCase(), character]));
  for (const character of reference.characters) characters.set(character.id.toLowerCase(), character);
  const merged = {
    ...reference,
    environment_image_data_url: reference.environment_image_data_url || previous?.environment_image_data_url || "",
    characters: [...characters.values()],
    previous_scene: reference.previous_scene ?? previous?.previous_scene,
  };
  referenceMemory.set(expectedHash, merged);
  await writePersistent(`reference-v${REFERENCE_CACHE_VERSION}:${expectedHash}`, JSON.stringify(merged));
  return merged;
}

function referenceForBeat(reference: SceneContinuityReference, request: SceneApiRequest): SceneContinuityReference {
  const requiredIds = new Set(request.beat.visual.characters.map((character) => character.id.toLowerCase()));
  const previousScene = request.context
    && reference.previous_scene?.beat_number === request.context.beat_number - 1
    ? reference.previous_scene
    : undefined;
  return {
    ...reference,
    characters: reference.characters.filter((character) => requiredIds.has(character.id.toLowerCase())),
    previous_scene: previousScene,
  };
}

async function generateWithContinuity(
  request: SceneApiRequest,
  force: boolean,
  continuityHash: string,
): Promise<SceneApiResponse> {
  const reference = await readReference(continuityHash);
  if (reference) {
    const response = await generateSceneVisual({ ...request, continuity_reference: referenceForBeat(reference, request), force: force || undefined });
    await rememberReference(response.continuity_reference, continuityHash);
    return response;
  }

  const pendingReference = referenceInFlight.get(continuityHash);
  if (pendingReference) {
    let sharedReference: SceneContinuityReference;
    try {
      sharedReference = await pendingReference;
    } catch {
      if (referenceInFlight.get(continuityHash) === pendingReference) referenceInFlight.delete(continuityHash);
      return generateWithContinuity(request, force, continuityHash);
    }
    const response = await generateSceneVisual({ ...request, continuity_reference: referenceForBeat(sharedReference, request), force: force || undefined });
    await rememberReference(response.continuity_reference, continuityHash);
    return response;
  }

  const bootstrapResponse = generateSceneVisual({ ...request, continuity_reference: undefined, force: force || undefined });
  const bootstrapReference = bootstrapResponse.then((response) =>
    rememberReference(response.continuity_reference, continuityHash));
  void bootstrapReference.catch(() => undefined);
  referenceInFlight.set(continuityHash, bootstrapReference);
  try {
    const response = await bootstrapResponse;
    await bootstrapReference;
    return response;
  } finally {
    if (referenceInFlight.get(continuityHash) === bootstrapReference) referenceInFlight.delete(continuityHash);
  }
}

export async function getSceneImage(request: SceneApiRequest, force = false) {
  const demoImage = await resolveDemoSceneImage(request);
  if (demoImage) return demoImage;
  const cacheKey = `render-v${SCENE_RENDER_CACHE_VERSION}:${request.content_hash}`;
  const continuityHash = continuityContentHash(request.continuity);
  if (!force) {
    const memory = memoryCache.get(cacheKey);
    if (memory) {
      clientDiagnostic("info", request, "scene_memory_cache_hit");
      return memory;
    }
    const persisted = await readPersistent(cacheKey);
    if (persisted) {
      remember(cacheKey, persisted);
      clientDiagnostic("info", request, "scene_persistent_cache_hit", { image_bytes: persisted.length });
      return persisted;
    }
  }

  const inFlightKey = force ? `${cacheKey}:force:${Date.now()}` : cacheKey;
  const existing = inFlight.get(inFlightKey);
  if (existing) {
    clientDiagnostic("info", request, "scene_inflight_joined", { force });
    return existing;
  }
  const requestedAt = Date.now();
  clientDiagnostic("info", request, "scene_generation_queued", { force, request_bytes: JSON.stringify(request).length });
  const operation = schedule(async () => {
    clientDiagnostic("info", request, "scene_generation_started", { force, queue_latency_ms: Date.now() - requestedAt });
    try {
      const response = await generateWithContinuity(request, force, continuityHash);
      if (response.content_hash !== request.content_hash) throw new Error("Scene visual couldn't be created.");
      remember(cacheKey, response.image_data_url);
      const persistence = await writePersistent(cacheKey, response.image_data_url);
      clientDiagnostic(persistence === "failed" ? "warn" : "info", request, "scene_generation_ready", {
        latency_ms: Date.now() - requestedAt,
        image_bytes: response.image_data_url.length,
        persistence,
      });
      return response.image_data_url;
    } catch (error) {
      const apiError = error as { code?: unknown; status?: unknown; retryable?: unknown; message?: unknown };
      clientDiagnostic("error", request, "scene_generation_failed", {
        latency_ms: Date.now() - requestedAt,
        code: typeof apiError.code === "string" ? apiError.code : "unknown",
        status: typeof apiError.status === "number" ? apiError.status : null,
        retryable: apiError.retryable === true,
        message: typeof apiError.message === "string" ? apiError.message : "Unknown scene error",
      });
      throw error;
    }
  }).finally(() => inFlight.delete(inFlightKey));
  inFlight.set(inFlightKey, operation);
  return operation;
}
