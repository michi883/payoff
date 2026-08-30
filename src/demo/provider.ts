import type { SceneApiRequest } from "../ai/contracts";
import type { PayoffStore } from "../domain/store";
import type { StudyStimulus } from "../domain/types";
import { runtimeConfig } from "../runtime";
import humanResponseFixture from "./looks-great/human-responses.json";
import sceneAssets from "./looks-great/scene-assets.json";
import { DEMO_TIMING_MS } from "./timing";

const revisedOpeningAssetUrl = new URL(
  "./looks-great/assets/drawing-offer-faster.png",
  import.meta.url,
).href;

function missing(name: string, detail?: string): never {
  throw new Error(`Missing demo fixture: ${name}${detail ? ` (${detail})` : ""}`);
}

function wait(milliseconds: number) {
  return new Promise<void>((resolve) => window.setTimeout(resolve, milliseconds));
}

/** Returns null outside demo mode; in demo mode it either resolves the exact cached scene or fails closed. */
export async function resolveDemoSceneImage(request: SceneApiRequest): Promise<string | null> {
  if (!runtimeConfig.demoMode) return null;
  const entry = sceneAssets["revision-make-opening-faster"];
  if (entry.asset !== "./assets/drawing-offer-faster.png"
    || request.content_hash !== entry.contentHash
    || request.context?.story_id !== "looks-great"
    || request.context.version_id !== entry.storyVersion
    || request.context.beat_id !== entry.beatId) {
    return missing("scene", `${request.context?.version_id ?? "unknown"}/${request.context?.beat_id ?? "unknown"}`);
  }
  await wait(DEMO_TIMING_MS.revisedScene);
  return revisedOpeningAssetUrl;
}

/** Hydrates the normal import command with exact-version rehearsal fixtures; normal mode is a no-op. */
export function hydratePreparedHumanAudience(store: PayoffStore, stimulus: StudyStimulus) {
  if (!runtimeConfig.demoMode) return;
  if (stimulus.projectId !== "looks-great"
    || stimulus.storyVersionId !== humanResponseFixture.storyVersion
    || stimulus.storyHash !== humanResponseFixture.storyHash) {
    missing("human-responses", `${stimulus.storyVersionId}/${stimulus.storyHash}`);
  }
  const current = store.getSnapshot().reactionSet;
  if (current.responses.length > 0) {
    if (current.evidenceKind !== "rehearsal") missing("human-responses", "unexpected evidence provenance");
    return;
  }
  const result = store.importStudyResponses(humanResponseFixture.responses, "rehearsal");
  if (result.accepted !== humanResponseFixture.responses.length || result.rejected > 0 || result.duplicates > 0) {
    missing("human-responses", "domain validation rejected cached responses");
  }
}

/** Prepares any deterministic evidence available for the active test view; normal mode remains untouched. */
export function prepareAvailableHumanAudienceData(store: PayoffStore) {
  if (!runtimeConfig.demoMode) return;
  const current = store.getSnapshot();
  const stimulus = current.humanTest?.storyVersionId === current.activeVersionId
    ? current.humanTest
    : store.prepareHumanTest();
  hydratePreparedHumanAudience(store, stimulus);
}
