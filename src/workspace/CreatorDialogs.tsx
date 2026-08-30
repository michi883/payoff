import { useEffect, useRef, useState } from "react";
import type { BeatDraft, NarrativeRole, StoryVersion } from "../domain/types";
import { NARRATIVE_ROLES } from "../domain/types";

export type EditorState = {
  mode: "create" | "replace";
  beatId?: string;
  afterBeatId?: string | null;
  draft: BeatDraft;
};

function useDialogFocus(onClose: () => void) {
  const containerRef = useRef<HTMLElement>(null);
  const closeRef = useRef(onClose);
  useEffect(() => { closeRef.current = onClose; }, [onClose]);
  useEffect(() => {
    const previous = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    const container = containerRef.current;
    const focusable = () => Array.from(container?.querySelectorAll<HTMLElement>(
      "button:not([disabled]), input:not([disabled]), textarea:not([disabled]), select:not([disabled]), summary, [href]",
    ) ?? []);
    focusable()[0]?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        closeRef.current();
        return;
      }
      if (event.key !== "Tab") return;
      const items = focusable();
      if (items.length === 0) return;
      const first = items[0];
      const last = items.at(-1)!;
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    container?.addEventListener("keydown", onKeyDown);
    return () => {
      container?.removeEventListener("keydown", onKeyDown);
      previous?.focus();
    };
  }, []);
  return containerRef;
}

export function BeatEditor({ editor, onClose, onSave }: {
  editor: EditorState;
  onClose: () => void;
  onSave: (editor: EditorState) => void;
}) {
  const [draft, setDraft] = useState(editor.draft);
  const dialogRef = useDialogFocus(onClose);
  const isCreate = editor.mode === "create";

  function update<K extends keyof BeatDraft>(key: K, value: BeatDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  function updateAction(action: string) {
    setDraft((current) => ({
      ...current,
      action,
      visual: { ...current.visual, focalAction: action },
    }));
  }

  function updateLine(line: string) {
    setDraft((current) => ({
      ...current,
      line,
      visual: current.visual.visibleText === editor.draft.line
        ? { ...current.visual, visibleText: line }
        : current.visual,
    }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="creator-dialog beat-editor" role="dialog" aria-modal="true" aria-labelledby="beat-editor-title">
        <header className="dialog-header">
          <div><span className="kicker">{isCreate ? "Add to the story" : "Manual edit"}</span><h2 id="beat-editor-title">{isCreate ? "Add beat" : "Edit beat"}</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close editor">×</button>
        </header>
        <form onSubmit={(event) => { event.preventDefault(); onSave({ ...editor, draft }); }}>
          <div className="beat-editor__primary">
            <label className="field-label">
              Beat title
              <input autoFocus required maxLength={48} value={draft.title} onChange={(event) => update("title", event.target.value)} />
            </label>
            <label className="field-label">
              What happens
              <textarea required maxLength={180} value={draft.action} onChange={(event) => updateAction(event.target.value)} />
            </label>
            <label className="field-label">
              Dialogue / on-screen text <span>Optional</span>
              <input maxLength={100} value={draft.line} onChange={(event) => updateLine(event.target.value)} />
            </label>
            <label className="field-label">
              Visual direction
              <textarea required maxLength={320} value={draft.visual.focalAction} onChange={(event) => setDraft((current) => ({ ...current, visual: { ...current.visual, focalAction: event.target.value } }))} />
            </label>
          </div>
          <details className="beat-editor__advanced">
            <summary>Advanced</summary>
            <div className="beat-editor__grid">
              <label className="field-label">
                Narrative role
                <select value={draft.narrativeRole} onChange={(event) => update("narrativeRole", event.target.value as NarrativeRole)}>
                  {NARRATIVE_ROLES.map((role) => <option key={role}>{role}</option>)}
                </select>
              </label>
              <label className="field-label">
                Intended beat emotion
                <input required maxLength={48} value={draft.intendedEmotion} onChange={(event) => update("intendedEmotion", event.target.value)} />
              </label>
              <label className="field-label field-label--full">
                Composition
                <textarea required maxLength={360} value={draft.visual.composition} onChange={(event) => setDraft((current) => ({ ...current, visual: { ...current.visual, composition: event.target.value } }))} />
              </label>
            </div>
          </details>
          <footer className="dialog-footer">
            <button type="button" className="secondary-button" onClick={onClose}>Cancel</button>
            <button className="primary-button" type="submit" disabled={!draft.title.trim() || !draft.action.trim() || !draft.intendedEmotion.trim() || !draft.visual.focalAction.trim()}>{isCreate ? "Add beat" : "Save beat"}</button>
          </footer>
        </form>
      </section>
    </div>
  );
}

export function HistoryDialog({ versions, activeVersionId, onClose, onRestore }: {
  versions: StoryVersion[];
  activeVersionId: string;
  onClose: () => void;
  onRestore: (versionId: string) => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  const visible = [...versions].filter((version) => version.beats.length > 0).sort((a, b) => b.number - a.number);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="creator-dialog history-dialog" role="dialog" aria-modal="true" aria-labelledby="history-title">
        <header className="dialog-header">
          <div><span className="kicker">Experiment safely</span><h2 id="history-title">Story history</h2></div>
          <button className="icon-button" onClick={onClose} aria-label="Close history">×</button>
        </header>
        <div className="history-list">
          {visible.map((version, index) => {
            const active = version.id === activeVersionId;
            const firstDraft = index === visible.length - 1;
            return (
              <article key={version.id}>
                <div>
                  <span>{active ? "Current story" : firstDraft ? "First draft" : "Previous version"}</span>
                  <strong>{firstDraft && version.parentVersionId === null ? "Original storyboard" : version.reason}</strong>
                  <small>{new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" }).format(new Date(version.createdAt))}</small>
                </div>
                {active ? <em>Active</em> : <button className="secondary-button secondary-button--small" onClick={() => onRestore(version.id)}>Restore</button>}
              </article>
            );
          })}
        </div>
        <footer className="dialog-footer"><button className="secondary-button" onClick={onClose}>Done</button></footer>
      </section>
    </div>
  );
}

export function ConfirmDialog({
  title,
  description,
  confirmLabel,
  destructive = false,
  onClose,
  onConfirm,
}: {
  title: string;
  description: string;
  confirmLabel: string;
  destructive?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}) {
  const dialogRef = useDialogFocus(onClose);
  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section ref={dialogRef} className="creator-dialog confirm-dialog" role="alertdialog" aria-modal="true" aria-labelledby="confirm-dialog-title" aria-describedby="confirm-dialog-description">
        <div className={`confirm-dialog__mark${destructive ? " confirm-dialog__mark--destructive" : ""}`} aria-hidden="true">{destructive ? "!" : "↕"}</div>
        <h2 id="confirm-dialog-title">{title}</h2>
        <p id="confirm-dialog-description">{description}</p>
        <footer className="dialog-footer">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className={destructive ? "danger-button" : "primary-button"} onClick={onConfirm}>{confirmLabel}</button>
        </footer>
      </section>
    </div>
  );
}
