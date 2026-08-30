import { useEffect, useState } from "react";
import type { CanonicalArtKey, StoryBeat, VisualContinuity } from "../domain/types";
import { getSceneImage } from "./sceneCache";

type SceneState =
  | { hash: string; status: "creating" }
  | { hash: string; status: "ready"; imageUrl: string }
  | { hash: string; status: "failed"; code: string; message: string };

const canonicalAssetNames: Record<CanonicalArtKey, string> = {
  drawing_offer: "drawing_offer.jpg",
  drawing_again: "drawing_again.jpg",
  fridge_gallery: "fridge_gallery.jpg",
  quiet_fridge: "quiet_fridge.jpg",
  phone_dad_drawing: "phone_dad_drawing.jpg",
  crayon_together: "crayon_together.jpg",
};

function BundledCanonicalScene({ artKey, label, visibleText }: {
  artKey: CanonicalArtKey;
  label: string;
  visibleText: string;
}) {
  return (
    <div className="generated-scene">
      <img src={`${import.meta.env.BASE_URL}canonical/${canonicalAssetNames[artKey]}`} alt={label} draggable="false" />
      {visibleText && <span className="generated-scene__text">{visibleText}</span>}
    </div>
  );
}

export function SceneVisual({ beat, continuity, storyId, versionId, updating = false }: {
  beat: StoryBeat;
  continuity: VisualContinuity;
  storyId: string;
  versionId: string;
  updating?: boolean;
}) {
  const artwork = beat.visual;
  const label = `Illustration for beat ${beat.order}: ${beat.title}. ${beat.action}`;
  if (artwork.source === "canonical") {
    return <BundledCanonicalScene artKey={artwork.key} label={label} visibleText={artwork.spec.visibleText} />;
  }
  return <GeneratedSceneVisual key={artwork.contentHash} beat={beat} continuity={continuity} storyId={storyId} versionId={versionId} label={label} updating={updating} />;
}

function GeneratedSceneVisual({ beat, continuity, storyId, versionId, label, updating }: {
  beat: StoryBeat;
  continuity: VisualContinuity;
  storyId: string;
  versionId: string;
  label: string;
  updating: boolean;
}) {
  const artwork = beat.visual;
  const [attempt, setAttempt] = useState(0);
  const [state, setState] = useState<SceneState>({ hash: artwork.contentHash, status: "creating" });
  const current = state.hash === artwork.contentHash ? state : { hash: artwork.contentHash, status: "creating" as const };

  useEffect(() => {
    let mounted = true;
    const hash = artwork.contentHash;
    void getSceneImage({
      content_hash: hash,
      continuity,
      context: {
        story_id: storyId,
        version_id: versionId,
        beat_id: beat.id,
        beat_number: beat.order,
      },
      beat: {
        title: beat.title,
        action: beat.action,
        line: beat.line,
        narrativeRole: beat.narrativeRole,
        intendedEmotion: beat.intendedEmotion,
        visual: artwork.spec,
      },
    }, attempt > 0).then((imageUrl) => {
      if (mounted) {
        console.info("[Payoff AI:scene-ui]", JSON.stringify({
          event: "scene_rendered",
          story_id: storyId,
          version_id: versionId,
          beat_id: beat.id,
          beat_number: beat.order,
          content_hash: hash,
          retry_attempt: attempt,
        }));
        setState({ hash, status: "ready", imageUrl });
      }
    }).catch((error: unknown) => {
      if (mounted) {
        console.error("[Payoff AI:scene-ui]", JSON.stringify({
          event: "scene_failure_rendered",
          story_id: storyId,
          version_id: versionId,
          beat_id: beat.id,
          beat_number: beat.order,
          content_hash: hash,
          retry_attempt: attempt,
          code: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown",
        }));
        setState({
          hash,
          status: "failed",
          code: typeof (error as { code?: unknown })?.code === "string" ? (error as { code: string }).code : "unknown",
          message: error instanceof Error ? error.message : "Scene visual couldn't be created.",
        });
      }
    });
    return () => { mounted = false; };
  }, [artwork, attempt, beat.action, beat.id, beat.intendedEmotion, beat.line, beat.narrativeRole, beat.order, beat.title, continuity, storyId, versionId]);

  if (current.status === "ready") {
    return (
      <div className="generated-scene">
        <img src={current.imageUrl} alt={label} draggable="false" />
        {artwork.spec.visibleText && <span className="generated-scene__text">{artwork.spec.visibleText}</span>}
      </div>
    );
  }
  if (current.status === "failed") {
    const message = current.code === "SCENE_QUOTA_EXHAUSTED"
      ? updating
        ? "The story was updated, but the Gemini project spending limit has been reached. Increase the limit, then try again."
        : current.message
      : updating ? "Scene visual couldn't be updated." : "Scene visual couldn't be created.";
    return (
      <div className="scene-fallback" role="status">
        <span aria-hidden="true">□</span>
        <strong>{message}</strong>
        <button type="button" onClick={() => {
          setState({ hash: artwork.contentHash, status: "creating" });
          setAttempt((value) => value + 1);
        }}>Try again</button>
      </div>
    );
  }
  return (
    <div className="scene-creating" role="status" aria-label={`${updating ? "Updating" : "Creating"} scene for ${beat.title}`}>
      <span className="scene-creating__frame" aria-hidden="true"><i /><i /><i /></span>
      <strong>{updating ? "Updating scene visual..." : "Creating scene..."}</strong>
    </div>
  );
}
