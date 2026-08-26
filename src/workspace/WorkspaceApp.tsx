import { useEffect, useMemo, useRef, useState } from "react";
import { Brand } from "../components/Brand";
import { StoryCard } from "../components/StoryCard";
import { RESEARCH_MIN_SAMPLE } from "../domain/seed";
import {
  countEndingEmotions,
  countTurningBeats,
  getActiveBeats,
  getEvidenceLabel,
  isActiveVersionTested,
  predictionSummary,
} from "../domain/selectors";
import { payoffStore } from "../domain/store";
import type { ArtKey, BeatDraft, NarrativeRole, StoryBeat } from "../domain/types";
import { ART_KEYS, NARRATIVE_ROLES } from "../domain/types";
import { useWorkspace } from "../domain/useWorkspace";
import { registerPayoffTools, type WebMCPStatus } from "../webmcp/tools";

type EditorState = {
  mode: "create" | "replace";
  beatId?: string;
  afterBeatId?: string | null;
  draft: BeatDraft;
};

const emptyDraft: BeatDraft = {
  title: "New beat",
  action: "Describe what visibly happens.",
  line: "",
  narrativeRole: "escalation",
  intendedEmotion: "curious",
  artKey: "conversation",
};

const statusCopy: Record<WebMCPStatus, string> = {
  registering: "Connecting agent",
  ready: "Agent ready",
  unsupported: "WebMCP unavailable",
  error: "Agent connection failed",
};

function formatDate(value: string | null) {
  if (!value) return "Collection in progress";
  return new Intl.DateTimeFormat("en-US", { month: "short", day: "numeric", year: "numeric" }).format(new Date(value));
}

function BeatEditor({ editor, onClose, onSave }: {
  editor: EditorState;
  onClose: () => void;
  onSave: (editor: EditorState) => void;
}) {
  const [draft, setDraft] = useState(editor.draft);
  const titleRef = useRef<HTMLInputElement>(null);

  useEffect(() => titleRef.current?.focus(), []);

  function update<K extends keyof BeatDraft>(key: K, value: BeatDraft[K]) {
    setDraft((current) => ({ ...current, [key]: value }));
  }

  return (
    <div className="modal-backdrop" role="presentation" onMouseDown={(event) => event.target === event.currentTarget && onClose()}>
      <section className="beat-editor" role="dialog" aria-modal="true" aria-labelledby="beat-editor-title">
        <div className="beat-editor__header">
          <div>
            <span className="kicker">{editor.mode === "create" ? "Add to storyboard" : "Edit in place"}</span>
            <h2 id="beat-editor-title">{editor.mode === "create" ? "Create a beat" : "Replace this beat"}</h2>
          </div>
          <button className="icon-button" onClick={onClose} aria-label="Close editor">×</button>
        </div>
        <div className="beat-editor__grid">
          <label className="field-label">
            Beat title
            <input ref={titleRef} required maxLength={48} value={draft.title} onChange={(event) => update("title", event.target.value)} />
          </label>
          <label className="field-label">
            Narrative role
            <select value={draft.narrativeRole} onChange={(event) => update("narrativeRole", event.target.value as NarrativeRole)}>
              {NARRATIVE_ROLES.map((role) => <option key={role}>{role}</option>)}
            </select>
          </label>
          <label className="field-label field-label--full">
            What happens
            <textarea required maxLength={180} value={draft.action} onChange={(event) => update("action", event.target.value)} />
          </label>
          <label className="field-label field-label--full">
            Dialogue or on-screen line
            <input maxLength={100} value={draft.line} onChange={(event) => update("line", event.target.value)} />
          </label>
          <label className="field-label">
            Intended emotion
            <input required maxLength={32} value={draft.intendedEmotion} onChange={(event) => update("intendedEmotion", event.target.value)} />
          </label>
          <label className="field-label">
            Visual motif
            <select value={draft.artKey} onChange={(event) => update("artKey", event.target.value as ArtKey)}>
              {ART_KEYS.map((artKey) => <option key={artKey} value={artKey}>{artKey.replaceAll("_", " ")}</option>)}
            </select>
          </label>
        </div>
        <div className="beat-editor__footer">
          <button className="secondary-button" onClick={onClose}>Cancel</button>
          <button className="primary-button" onClick={() => onSave({ ...editor, draft })} disabled={!draft.title.trim() || !draft.action.trim() || !draft.intendedEmotion.trim()}>
            {editor.mode === "create" ? "Create beat" : "Save replacement"}
          </button>
        </div>
      </section>
    </div>
  );
}

export function WorkspaceApp() {
  const workspace = useWorkspace();
  const beats = getActiveBeats(workspace);
  const [webMcpStatus, setWebMcpStatus] = useState<WebMCPStatus>("registering");
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [notice, setNotice] = useState("");
  const [importSummary, setImportSummary] = useState("");

  useEffect(() => {
    let unregister: () => void = () => undefined;
    let mounted = true;
    void registerPayoffTools((status) => mounted && setWebMcpStatus(status))
      .then((cleanup) => {
        if (mounted) unregister = cleanup;
        else cleanup();
      })
      .catch(() => undefined);
    return () => {
      mounted = false;
      unregister();
    };
  }, []);

  const responses = workspace.reactionSet.responses;
  const emotionCounts = useMemo(() => countEndingEmotions(responses), [responses]);
  const turningCounts = useMemo(() => countTurningBeats(responses), [responses]);
  const predictions = useMemo(() => predictionSummary(responses), [responses]);
  const maxEmotionCount = Math.max(1, ...Object.values(emotionCounts));
  const topEmotion = Object.entries(emotionCounts).sort((a, b) => b[1] - a[1])[0];
  const latestChange = workspace.activity.find((entry) => entry.action !== "import_reactions");
  const consentedQuotes = responses.filter((response) => response.quoteConsent).slice(0, 2);
  const isTested = isActiveVersionTested(workspace);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2600);
  }

  function editBeat(beat: StoryBeat) {
    setEditor({
      mode: "replace",
      beatId: beat.id,
      draft: {
        title: beat.title,
        action: beat.action,
        line: beat.line,
        narrativeRole: beat.narrativeRole,
        intendedEmotion: beat.intendedEmotion,
        artKey: beat.artKey,
      },
    });
  }

  function saveEditor(value: EditorState) {
    try {
      if (value.mode === "replace" && value.beatId) {
        const result = payoffStore.replaceBeat(value.beatId, value.draft, workspace.activeVersionId, "human");
        showNotice(result.message);
      } else {
        const result = payoffStore.createBeat(value.draft, value.afterBeatId ?? null, workspace.activeVersionId, "human");
        showNotice(result.message);
      }
      setEditor(null);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The edit could not be saved.");
    }
  }

  function moveBeat(beat: StoryBeat, direction: "left" | "right") {
    const index = beats.findIndex((candidate) => candidate.id === beat.id);
    const afterBeatId = direction === "left"
      ? index <= 1 ? null : beats[index - 2].id
      : beats[index + 1]?.id ?? null;
    try {
      const result = payoffStore.moveBeat(beat.id, afterBeatId, workspace.activeVersionId, "human");
      showNotice(result.message);
    } catch (error) {
      showNotice(error instanceof Error ? error.message : "The beat could not be moved.");
    }
  }

  async function importResponses(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const values = await Promise.all(files.map(async (file) => {
      try {
        return JSON.parse(await file.text()) as unknown;
      } catch {
        return null;
      }
    }));
    const result = payoffStore.importStudyResponses(values);
    setImportSummary(`${result.accepted} accepted · ${result.duplicates} duplicate · ${result.rejected} rejected`);
    event.target.value = "";
  }

  function resetDemo() {
    payoffStore.resetDemo();
    showNotice("Restored the tested baseline; audience evidence was preserved.");
  }

  function undo() {
    const result = payoffStore.undoLastMutation("human");
    showNotice(result?.message ?? "There is no story change to undo.");
  }

  return (
    <main className="workspace-shell">
      <header className="workspace-header">
        <Brand />
        <div className="workspace-header__project">
          <span>Story room</span>
          <strong>{workspace.project.title}</strong>
        </div>
        <div className="workspace-header__actions">
          <a className="header-link" href="/study" target="_blank" rel="noreferrer">Open audience viewer ↗</a>
          <span className={`agent-status agent-status--${webMcpStatus}`} title={webMcpStatus === "unsupported" ? "Open in ChatGPT's browser or enabled Chrome to use site tools." : undefined}>
            <i /> {statusCopy[webMcpStatus]}
          </span>
          <button className="secondary-button secondary-button--small" onClick={resetDemo}>Reset demo</button>
        </div>
      </header>

      <div className="workspace-grid">
        <aside className="brief-rail">
          <div className="brief-rail__intro">
            <span className="kicker">Creative intent</span>
            <h1>{workspace.project.title}</h1>
            <p>{workspace.project.topic}</p>
            <span className="format-chip">{workspace.project.format}</span>
          </div>

          <section className="target-card">
            <span className="target-card__label">Emotional target</span>
            <div className="emotion-arc">
              <span><i>1</i>{workspace.project.target.setupEmotion}</span>
              <b aria-hidden="true">↓</b>
              <span><i>2</i>Recognition</span>
              <b aria-hidden="true">↓</b>
              <span className="emotion-arc__payoff"><i>3</i>{workspace.project.target.payoffEmotion}</span>
            </div>
            <p>“{workspace.project.target.realization}”</p>
          </section>

          <section className="collaboration-note">
            <span className="kicker">Working agreement</span>
            <p><strong>The agent diagnoses.</strong><br />You choose the creative tradeoff. It edits only after your direction.</p>
          </section>

          <section className="activity-panel">
            <div className="section-heading">
              <span>Recent activity</span>
              {latestChange && latestChange.action !== "undo" && <button className="text-button" onClick={undo}>Undo last</button>}
            </div>
            {workspace.activity.length === 0 ? (
              <p className="empty-copy">No edits yet. The tested baseline is untouched.</p>
            ) : (
              <ol>
                {workspace.activity.slice(0, 4).map((entry) => (
                  <li key={entry.id}>
                    <i className={`activity-dot activity-dot--${entry.actor}`} />
                    <div><strong>{entry.actor}</strong><span>{entry.message}</span></div>
                  </li>
                ))}
              </ol>
            )}
          </section>
        </aside>

        <section className="storyboard-area">
          <div className="storyboard-heading">
            <div>
              <span className="kicker">Active storyboard</span>
              <h2>Six beats. One emotional turn.</h2>
            </div>
            <div className="storyboard-heading__actions">
              <span className={isTested ? "evidence-badge evidence-badge--tested" : "evidence-badge evidence-badge--untested"}>
                <i /> {getEvidenceLabel(workspace)}
              </span>
              <button
                className="secondary-button secondary-button--small"
                onClick={() => setEditor({ mode: "create", afterBeatId: beats.at(-1)?.id ?? null, draft: structuredClone(emptyDraft) })}
                disabled={beats.length >= 8}
              >+ Add beat</button>
            </div>
          </div>

          <div className="storyboard-grid" aria-label="Ordered storyboard">
            {beats.map((beat, index) => (
              <StoryCard
                key={beat.id}
                beat={beat}
                changed={Boolean(latestChange?.afterVersionId === workspace.activeVersionId && latestChange.affectedBeatIds.includes(beat.id))}
                onEdit={editBeat}
                onMove={moveBeat}
                canMoveLeft={index > 0}
                canMoveRight={index < beats.length - 1}
              />
            ))}
          </div>
        </section>

        <aside className="evidence-rail">
          <div className="evidence-rail__header">
            <div>
              <span className="kicker">Audience evidence</span>
              <h2>Did it land?</h2>
            </div>
            <span className="response-count"><strong>{responses.length}</strong><small>valid</small></span>
          </div>

          {responses.length === 0 ? (
            <section className="evidence-empty">
              <div className="evidence-empty__mark"><span /><span /><span /></div>
              <h3>No audience verdict yet</h3>
              <p>The baseline is ready for an uninterrupted, target-blind viewing. Findings stay blank until real responses are imported.</p>
              <a className="primary-button" href="/study" target="_blank" rel="noreferrer">Open study viewer ↗</a>
              <p className="microcopy">Minimum {RESEARCH_MIN_SAMPLE} valid responses. The displayed count is always actual.</p>
            </section>
          ) : (
            <>
              <section className="outcome-compare">
                <div><span>Target ending</span><strong>{workspace.project.target.payoffEmotion}</strong></div>
                <div><span>Most reported</span><strong>{topEmotion?.[0] ?? "—"}</strong><small>{topEmotion?.[1] ?? 0} of {responses.length}</small></div>
              </section>

              <section className="emotion-results">
                <h3>Ending emotion</h3>
                {Object.entries(emotionCounts).sort((a, b) => b[1] - a[1]).map(([emotion, count]) => (
                  <div className="result-bar" key={emotion}>
                    <span>{emotion}</span>
                    <i><b style={{ width: `${(count / maxEmotionCount) * 100}%` }} /></i>
                    <strong>{count}</strong>
                  </div>
                ))}
              </section>

              <section className="evidence-stat-grid">
                <div><strong>{responses.filter((response) => response.wasSurprised).length}</strong><span>surprised</span></div>
                <div><strong>{predictions.predictedCount}</strong><span>predicted it</span></div>
              </section>

              <section className="turning-results">
                <h3>Beat that changed things</h3>
                {Object.entries(turningCounts).sort((a, b) => b[1] - a[1]).slice(0, 3).map(([beatId, count]) => {
                  const beat = beats.find((candidate) => candidate.id === beatId);
                  return <div key={beatId}><span>Beat {beat?.order ?? "?"} · {beat?.title ?? beatId}</span><strong>{count}</strong></div>;
                })}
              </section>

              {consentedQuotes.length > 0 && (
                <section className="audience-quotes">
                  <h3>In their words</h3>
                  {consentedQuotes.map((response) => <blockquote key={response.id}>“{response.interpretation}”</blockquote>)}
                </section>
              )}
            </>
          )}

          <section className="evidence-provenance">
            <div><span>Method</span><strong>Target hidden · full story first</strong></div>
            <div><span>Exact version</span><strong>{workspace.testedVersionId}</strong></div>
            <div><span>Last import</span><strong>{formatDate(workspace.reactionSet.collectedAt)}</strong></div>
          </section>

          <label className="import-button">
            <input type="file" accept="application/json,.json" multiple onChange={(event) => void importResponses(event)} />
            <span>Import response files</span>
          </label>
          {importSummary && <p className="import-summary">{importSummary}</p>}
        </aside>
      </div>

      <div className="sr-only" aria-live="polite">{notice}</div>
      {notice && <div className="toast" role="status">{notice}</div>}
      {editor && <BeatEditor editor={editor} onClose={() => setEditor(null)} onSave={saveEditor} />}
    </main>
  );
}
