import { SceneArt } from "../art/SceneArt";
import type { StoryBeat } from "../domain/types";

type StoryCardProps = {
  beat: StoryBeat;
  changed?: boolean;
  compact?: boolean;
  onEdit?: (beat: StoryBeat) => void;
  onMove?: (beat: StoryBeat, direction: "left" | "right") => void;
  canMoveLeft?: boolean;
  canMoveRight?: boolean;
};

export function StoryCard({
  beat,
  changed = false,
  compact = false,
  onEdit,
  onMove,
  canMoveLeft = false,
  canMoveRight = false,
}: StoryCardProps) {
  return (
    <article className={`story-card${changed ? " story-card--changed" : ""}${compact ? " story-card--compact" : ""}`}>
      <div className="story-card__art">
        <SceneArt artKey={beat.artKey} label={`Illustration for beat ${beat.order}: ${beat.title}`} />
        <span className="beat-number">{String(beat.order).padStart(2, "0")}</span>
        <span className={`role-chip role-chip--${beat.narrativeRole}`}>{beat.narrativeRole}</span>
      </div>
      <div className="story-card__body">
        <div className="story-card__heading">
          <h3>{beat.title}</h3>
          <span className="emotion-dot"><i />{beat.intendedEmotion}</span>
        </div>
        <p>{beat.action}</p>
        {beat.line && <blockquote>“{beat.line}”</blockquote>}
      </div>
      {onEdit && (
        <div className="story-card__actions">
          <button className="icon-button" onClick={() => onMove?.(beat, "left")} disabled={!canMoveLeft} aria-label={`Move ${beat.title} left`}>←</button>
          <button className="text-button" onClick={() => onEdit(beat)}>Edit beat</button>
          <button className="icon-button" onClick={() => onMove?.(beat, "right")} disabled={!canMoveRight} aria-label={`Move ${beat.title} right`}>→</button>
        </div>
      )}
    </article>
  );
}
