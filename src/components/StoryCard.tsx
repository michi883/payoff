import { SceneArt } from "../art/SceneArt";
import type { StoryBeat } from "../domain/types";

type StoryCardProps = {
  beat: StoryBeat;
  changed?: boolean;
  compact?: boolean;
  onAskAI?: (beat: StoryBeat) => void;
  onEdit?: (beat: StoryBeat) => void;
  onMove?: (beat: StoryBeat, direction: "earlier" | "later") => void;
  onDelete?: (beat: StoryBeat) => void;
  canMoveEarlier?: boolean;
  canMoveLater?: boolean;
};

export function StoryCard({
  beat,
  changed = false,
  compact = false,
  onAskAI,
  onEdit,
  onMove,
  onDelete,
  canMoveEarlier = false,
  canMoveLater = false,
}: StoryCardProps) {
  function closeMenu(event: React.MouseEvent<HTMLButtonElement>, action: () => void) {
    event.currentTarget.closest("details")?.removeAttribute("open");
    action();
  }

  return (
    <article className={`story-card${changed ? " story-card--changed" : ""}${compact ? " story-card--compact" : ""}`}>
      <div className="story-card__art">
        <SceneArt artKey={beat.artKey} label={`Illustration for beat ${beat.order}: ${beat.title}`} />
        <span className="beat-number">{String(beat.order).padStart(2, "0")}</span>
        {onEdit && (
          <details className="beat-menu">
            <summary aria-label={`More options for ${beat.title}`}>•••</summary>
            <div className="beat-menu__popover" role="menu">
              <button role="menuitem" onClick={(event) => closeMenu(event, () => onAskAI?.(beat))}>Ask Payoff to change this beat</button>
              <button role="menuitem" onClick={(event) => closeMenu(event, () => onEdit(beat))}>Edit manually</button>
              <button role="menuitem" disabled={!canMoveEarlier} onClick={(event) => closeMenu(event, () => onMove?.(beat, "earlier"))}>Move earlier</button>
              <button role="menuitem" disabled={!canMoveLater} onClick={(event) => closeMenu(event, () => onMove?.(beat, "later"))}>Move later</button>
              {onDelete && <button className="beat-menu__delete" role="menuitem" onClick={(event) => closeMenu(event, () => onDelete(beat))}>Delete beat</button>}
            </div>
          </details>
        )}
      </div>
      <div className="story-card__body">
        <h3>{beat.title}</h3>
        <p>{beat.action}</p>
        {beat.line && <blockquote>“{beat.line}”</blockquote>}
      </div>
    </article>
  );
}
