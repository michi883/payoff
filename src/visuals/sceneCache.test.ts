import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SceneApiRequest, SceneApiResponse } from "../ai/contracts";
import { continuityContentHash, sceneContentHash } from "../domain/visuals";

const mocks = vi.hoisted(() => ({ generateSceneVisual: vi.fn() }));

vi.mock("../ai/client", () => ({ generateSceneVisual: mocks.generateSceneVisual }));

const imageDataUrl = "data:image/jpeg;base64,AAAA";

function request(marker: string): SceneApiRequest {
  const continuity = {
    characters: [{ id: "kid", appearance: `Ten-year-old child in a red hoodie ${marker}.` }],
    settings: [{ id: "kitchen", appearance: "Cream kitchen with one wooden breakfast table." }],
    importantProps: [{ id: "toast", appearance: "One triangular slice of toast." }],
    timeOfDay: "Late morning throughout.",
    lighting: "Stable warm-neutral window daylight.",
    style: "Clear minimal editorial storyboard illustration.",
  };
  const beat = {
    title: "Toast Takes Flight",
    action: "The kid lifts the toast toward Dad with an eager grin.",
    line: "",
    narrativeRole: "setup" as const,
    intendedEmotion: "playful anticipation",
    visual: {
      setting: continuity.settings[0].appearance,
      characters: [{ id: "kid", appearance: continuity.characters[0].appearance, position: "Left of the table.", action: "Raises the toast in one hand." }],
      focalAction: "The kid visibly raises the toast toward Dad.",
      focalObject: "The triangular toast in the kid's raised hand.",
      composition: "Keep the toast and the kid's eager face on one clear sightline.",
      emotionalCue: "The kid is delighted and expectant.",
      visibleText: "",
      continuityNotes: ["Keep the same kitchen, child, toast, time, and light."],
    },
  };
  return {
    content_hash: sceneContentHash(beat.visual, continuity),
    continuity,
    beat,
    context: { story_id: "story-cache-test", version_id: "version-1", beat_id: `beat-${marker}`, beat_number: 1 },
  };
}

function response(input: SceneApiRequest): SceneApiResponse {
  return {
    content_hash: input.content_hash,
    image_data_url: imageDataUrl,
    continuity_reference: {
      content_hash: continuityContentHash(input.continuity),
      environment_image_data_url: imageDataUrl,
      characters: [{ id: "kid", image_data_url: imageDataUrl }],
      previous_scene: input.context ? {
        beat_number: input.context.beat_number,
        beat_title: input.beat.title,
        image_data_url: imageDataUrl,
      } : undefined,
    },
  };
}

function installMemoryIndexedDb() {
  const values = new Map<IDBValidKey, unknown>();
  const database = {
    objectStoreNames: { contains: () => true },
    createObjectStore: vi.fn(),
    close: vi.fn(),
    transaction: (_name: string, mode: IDBTransactionMode) => {
      const transaction: Record<string, unknown> = {};
      const objectStore = {
        get: (key: IDBValidKey) => {
          const getRequest: Record<string, unknown> = { result: values.get(key) };
          queueMicrotask(() => {
            (getRequest.onsuccess as (() => void) | undefined)?.();
            (transaction.oncomplete as (() => void) | undefined)?.();
          });
          return getRequest;
        },
        put: (value: unknown, key: IDBValidKey) => {
          values.set(key, value);
          queueMicrotask(() => (transaction.oncomplete as (() => void) | undefined)?.());
        },
      };
      transaction.objectStore = () => objectStore;
      transaction.mode = mode;
      return transaction;
    },
  };
  const indexedDb = {
    open: () => {
      const openRequest: Record<string, unknown> = { result: database };
      queueMicrotask(() => (openRequest.onsuccess as (() => void) | undefined)?.());
      return openRequest;
    },
  };
  vi.stubGlobal("indexedDB", indexedDb as unknown as IDBFactory);
  return values;
}

describe("scene image cache", () => {
  beforeEach(() => {
    vi.resetModules();
    vi.restoreAllMocks();
    mocks.generateSceneVisual.mockReset();
    vi.stubGlobal("indexedDB", undefined);
    vi.spyOn(console, "info").mockImplementation(() => undefined);
    vi.spyOn(console, "warn").mockImplementation(() => undefined);
    vi.spyOn(console, "error").mockImplementation(() => undefined);
  });

  it("keeps a successful beat usable when a neighboring beat fails", async () => {
    const failed = request("failed-neighbor");
    const successful = request("successful-neighbor");
    mocks.generateSceneVisual.mockImplementation(async (input: SceneApiRequest) => {
      if (input.content_hash === failed.content_hash) throw new Error("provider failure");
      return response(input);
    });
    const { getSceneImage } = await import("./sceneCache");

    const results = await Promise.allSettled([getSceneImage(failed), getSceneImage(successful)]);

    expect(results[0].status).toBe("rejected");
    expect(results[1]).toEqual({ status: "fulfilled", value: imageDataUrl });
  });

  it("retries only the requested beat with force and replaces its failure", async () => {
    const input = request("retry-one-beat");
    mocks.generateSceneVisual
      .mockRejectedValueOnce(new Error("first attempt failed"))
      .mockResolvedValueOnce(response(input));
    const { getSceneImage } = await import("./sceneCache");

    await expect(getSceneImage(input)).rejects.toThrow("first attempt failed");
    await expect(getSceneImage(input, true)).resolves.toBe(imageDataUrl);

    expect(mocks.generateSceneVisual).toHaveBeenCalledTimes(2);
    expect(mocks.generateSceneVisual.mock.calls[1][0]).toEqual(expect.objectContaining({
      content_hash: input.content_hash,
      force: true,
    }));
  });

  it("persists an accepted scene and serves it after a module reload", async () => {
    installMemoryIndexedDb();
    const input = request("persistent-asset");
    mocks.generateSceneVisual.mockResolvedValue(response(input));
    let cache = await import("./sceneCache");

    await expect(cache.getSceneImage(input)).resolves.toBe(imageDataUrl);
    expect(mocks.generateSceneVisual).toHaveBeenCalledTimes(1);

    vi.resetModules();
    cache = await import("./sceneCache");
    await expect(cache.getSceneImage(input)).resolves.toBe(imageDataUrl);
    expect(mocks.generateSceneVisual).toHaveBeenCalledTimes(1);
  });

  it("serializes new beats and gives the next beat the immediately preceding accepted frame", async () => {
    const first = request("adjacent-scene");
    const second: SceneApiRequest = {
      ...first,
      beat: {
        ...first.beat,
        title: "Dad Pulls Away",
        action: "Dad pulls his chair away while the kid holds up the same toast.",
        visual: {
          ...first.beat.visual,
          focalAction: "Dad retreats from the table while the kid keeps presenting the toast.",
        },
      },
      context: { ...first.context!, beat_id: "beat-2", beat_number: 2 },
    };
    second.content_hash = sceneContentHash(second.beat.visual, second.continuity);
    mocks.generateSceneVisual.mockImplementation(async (input: SceneApiRequest) => response(input));
    const { getSceneImage } = await import("./sceneCache");

    await Promise.all([getSceneImage(first), getSceneImage(second)]);

    expect(mocks.generateSceneVisual).toHaveBeenCalledTimes(2);
    expect(mocks.generateSceneVisual.mock.calls[1][0]).toEqual(expect.objectContaining({
      continuity_reference: expect.objectContaining({
        previous_scene: {
          beat_number: 1,
          beat_title: first.beat.title,
          image_data_url: imageDataUrl,
        },
      }),
    }));
  });
});
