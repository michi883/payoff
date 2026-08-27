import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { diagnoseAudience, generateStoryboard, interpretHumanAudience, requestRevision, runAIAudience } from "../ai/client";
import {
  AI_AUDIENCE_NOTICE,
  type DiagnoseApiResponse,
  type EmotionalTargetInput,
  type ReviseApiResponse,
  type StoryboardApiRequest,
} from "../ai/contracts";
import { Brand } from "../components/Brand";
import { StoryCard } from "../components/StoryCard";
import {
  getAIAudienceResult,
  getHumanAudienceResult,
  toDiagnosisEvidence,
} from "../domain/audience";
import { PROJECT_BRIEF } from "../domain/seed";
import { getActiveBeats, getActiveVersion, getTargetPayoff, isActiveVersionTested } from "../domain/selectors";
import { payoffStore } from "../domain/store";
import type { BeatDraft, ProjectBrief, StoryBeat } from "../domain/types";
import { useWorkspace } from "../domain/useWorkspace";
import { studyShareUrl } from "../study/share";
import { registerPayoffTools, type AgentCapability } from "../webmcp/tools";
import { AudienceResultView } from "./AudienceResultView";
import { BeatEditor, ConfirmDialog, HistoryDialog, type EditorState } from "./CreatorDialogs";

type AudienceMode = "ai" | "human";
type GenerationState = { busy: boolean; error: string };
type DefinitionDraft = { premise: string; feeling: string; format: string };
type ConfirmationState =
  | { kind: "start-over" }
  | { kind: "move"; beat: StoryBeat; direction: "earlier" | "later" }
  | { kind: "delete"; beat: StoryBeat };

const FORMAT_OPTIONS = [
  "30-second vertical short",
  "45-second vertical short",
  "60-second vertical short",
  "90-second short",
];

const EXAMPLE_FEELING = "Familiar amusement, then a small gut punch, then warmth";

const emptyDraft: BeatDraft = {
  title: "New beat",
  action: "Describe what visibly happens.",
  line: "",
  narrativeRole: "escalation",
  intendedEmotion: "curiosity",
  artKey: "conversation",
};

const revisionSuggestions = [
  "Make the opening faster.",
  "Make Dad seem busy rather than uncaring.",
  "Make the payoff less obvious.",
  "Keep the reveal but make the ending warmer.",
];

const diagnosisSuggestions = [
  "Why did this feel sad instead of warm?",
  "Why was the reveal predictable?",
  "Why did viewers miss the payoff?",
];

function briefTitle(premise: string) {
  const clean = premise.trim().replace(/[.!?]+$/, "");
  const words = clean.split(/\s+/);
  const candidate = words.length > 6 ? `${words.slice(0, 6).join(" ")}…` : clean;
  return candidate.length > 60 ? `${candidate.slice(0, 59).trim()}…` : candidate;
}

function draftFromBeat(beat: StoryBeat): BeatDraft {
  return {
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    intendedEmotion: beat.intendedEmotion,
    artKey: beat.artKey,
  };
}

function targetInput(project: ProjectBrief): EmotionalTargetInput {
  const summary = project.targetSummary || project.audienceFeeling
    || `${project.target.setupEmotion} → ${project.target.payoffEmotion}`;
  return {
    natural_language: project.audienceFeeling || summary,
    summary,
    setup: project.target.setupEmotion,
    payoff: project.target.payoffEmotion,
    realization: project.target.realization,
    constraints: project.target.constraints,
  };
}

function firstSentence(value: string, max = 190) {
  const sentence = value.match(/^.*?[.!?](?:\s|$)/)?.[0]?.trim() ?? value.trim();
  return sentence.length <= max ? sentence : `${sentence.slice(0, max - 1).trim()}…`;
}

function isAbort(error: unknown) {
  return error instanceof DOMException && error.name === "AbortError";
}

function minimumWait(milliseconds: number, signal: AbortSignal) {
  return new Promise<void>((resolve, reject) => {
    const timer = window.setTimeout(resolve, milliseconds);
    signal.addEventListener("abort", () => {
      window.clearTimeout(timer);
      reject(new DOMException("Cancelled", "AbortError"));
    }, { once: true });
  });
}

async function withMinimumWait<T>(operation: Promise<T>, signal: AbortSignal, milliseconds = 420) {
  const [result] = await Promise.all([operation, minimumWait(milliseconds, signal)]);
  return result;
}

function DefineExperience({ onCreate }: { onCreate: (draft: DefinitionDraft) => void }) {
  const [draft, setDraft] = useState<DefinitionDraft>({
    premise: "",
    feeling: "",
    format: "45-second vertical short",
  });
  const ready = Boolean(draft.premise.trim() && draft.feeling.trim() && draft.format.trim());

  function useExample() {
    setDraft({ premise: PROJECT_BRIEF.topic, feeling: EXAMPLE_FEELING, format: PROJECT_BRIEF.format });
  }

  return (
    <main className="start-shell">
      <header className="start-header"><Brand /></header>
      <section className="define-story">
        <div className="define-story__intro">
          <span className="kicker">Story payoff testing</span>
          <h1>What story are you trying to tell?</h1>
          <p>Turn a premise into a storyboard, then see whether the audience feels what you intended.</p>
        </div>
        <form className="define-story__form" onSubmit={(event) => { event.preventDefault(); if (ready) onCreate(draft); }}>
          <label className="field-label">
            Story premise
            <textarea
              autoFocus
              required
              maxLength={220}
              value={draft.premise}
              onChange={(event) => setDraft({ ...draft, premise: event.target.value })}
              placeholder="e.g. A confident dad shows up to his daughter's school performance and realizes he has misunderstood what she needed from him."
            />
          </label>
          <label className="field-label">
            What should the audience feel?
            <input
              required
              maxLength={160}
              value={draft.feeling}
              onChange={(event) => setDraft({ ...draft, feeling: event.target.value })}
              placeholder="e.g. Laugh, then feel a small emotional sting"
            />
          </label>
          <label className="field-label">
            Format
            <select value={draft.format} onChange={(event) => setDraft({ ...draft, format: event.target.value })}>
              {FORMAT_OPTIONS.map((format) => <option key={format}>{format}</option>)}
            </select>
          </label>
          <button className="example-link" type="button" onClick={useExample}>Try example: <strong>Looks Great</strong></button>
          <button className="primary-button primary-button--large" disabled={!ready} type="submit">Create storyboard <span>→</span></button>
        </form>
      </section>
    </main>
  );
}

function GenerationExperience({ project, generation, onRetry, onStartOver }: {
  project: ProjectBrief;
  generation: GenerationState;
  onRetry: () => void;
  onStartOver: () => void;
}) {
  const errorDetail = !generation.error || /couldn't finish (?:your|that) storyboard/i.test(generation.error)
    ? "Your premise and intended feeling are still here. Nothing was changed."
    : generation.error;
  return (
    <section className="generation-workspace" aria-live="polite">
      {generation.busy ? (
        <>
          <div className="generation-copy">
            <span className="generation-spark" aria-hidden="true">✦</span>
            <div><span className="kicker">Creating the first draft</span><h1>Building your story...</h1><p>Shaping six beats around the payoff you want the audience to feel.</p></div>
          </div>
          <div className="story-skeleton" aria-hidden="true">
            {Array.from({ length: 6 }, (_, index) => <div key={index}><i /><span /><span /></div>)}
          </div>
        </>
      ) : (
        <div className="generation-error" role="alert">
          <span className="kicker">Your brief is safe</span>
          <h1>Payoff couldn't finish your storyboard.</h1>
          <p>{errorDetail}</p>
          <dl><div><dt>Story</dt><dd>{project.topic}</dd></div><div><dt>Audience feeling</dt><dd>{project.audienceFeeling || project.targetSummary}</dd></div></dl>
          <div><button className="primary-button" onClick={onRetry}>Try again</button><button className="secondary-button" onClick={onStartOver}>Edit the brief</button></div>
        </div>
      )}
    </section>
  );
}

function ProjectSummary({ project, tested, revision }: { project: ProjectBrief; tested: boolean; revision: boolean }) {
  return (
    <header className="project-summary">
      <div><span className="kicker">Your story</span><h1>{project.title}</h1><p>{project.format}</p></div>
      <div className="target-summary"><span>Target payoff</span><strong>{project.targetSummary || project.audienceFeeling || `${project.target.setupEmotion} → ${project.target.payoffEmotion}`}</strong></div>
      <span className={`story-status story-status--${tested ? "tested" : "untested"}`}>{tested ? "Tested" : revision ? "Untested revision" : "Untested"}</span>
    </header>
  );
}

export function WorkspaceApp() {
  const workspace = useWorkspace();
  const beats = getActiveBeats(workspace);
  const activeVersion = getActiveVersion(workspace);
  const [agentCapability, setAgentCapability] = useState<AgentCapability>("webmcp-unavailable");
  const [generation, setGeneration] = useState<GenerationState>({ busy: false, error: "" });
  const [editor, setEditor] = useState<EditorState | null>(null);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [confirmation, setConfirmation] = useState<ConfirmationState | null>(null);
  const [notice, setNotice] = useState("");
  const [audienceMode, setAudienceMode] = useState<AudienceMode>("ai");
  const [creatorRequest, setCreatorRequest] = useState("");
  const [selectedBeatId, setSelectedBeatId] = useState<string | null>(null);
  const [testingContext, setTestingContext] = useState<string | null>(null);
  const [revisionResult, setRevisionResult] = useState<ReviseApiResponse | null>(null);
  const [revisionBusy, setRevisionBusy] = useState(false);
  const [revisionError, setRevisionError] = useState("");
  const [audienceBusy, setAudienceBusy] = useState(false);
  const [audienceError, setAudienceError] = useState("");
  const [humanAudienceBusy, setHumanAudienceBusy] = useState(false);
  const [humanAudienceError, setHumanAudienceError] = useState("");
  const [diagnosisOpen, setDiagnosisOpen] = useState(false);
  const [diagnosisQuestion, setDiagnosisQuestion] = useState("");
  const [diagnosisResult, setDiagnosisResult] = useState<DiagnoseApiResponse | null>(null);
  const [diagnosisBusy, setDiagnosisBusy] = useState(false);
  const [diagnosisError, setDiagnosisError] = useState("");
  const [importSummary, setImportSummary] = useState("");
  const composerRef = useRef<HTMLElement>(null);
  const composerInputRef = useRef<HTMLTextAreaElement>(null);
  const diagnosisRef = useRef<HTMLElement>(null);
  const diagnosisInputRef = useRef<HTMLInputElement>(null);
  const humanInterpretationAttempt = useRef("");
  const generationController = useRef<AbortController | null>(null);
  const revisionController = useRef<AbortController | null>(null);
  const audienceController = useRef<AbortController | null>(null);
  const humanAudienceController = useRef<AbortController | null>(null);
  const diagnosisController = useRef<AbortController | null>(null);

  useEffect(() => {
    let unregister: () => void = () => undefined;
    let mounted = true;
    void registerPayoffTools((capability) => mounted && setAgentCapability(capability))
      .then((cleanup) => { if (mounted) unregister = cleanup; else cleanup(); })
      .catch(() => undefined);
    return () => { mounted = false; unregister(); };
  }, []);

  useEffect(() => () => {
    generationController.current?.abort();
    revisionController.current?.abort();
    audienceController.current?.abort();
    humanAudienceController.current?.abort();
    diagnosisController.current?.abort();
  }, []);

  const isTestView = workspace.workflow.stage === "test";
  const storyboardComplete = beats.length === 6;
  const tested = isActiveVersionTested(workspace);
  const revision = activeVersion.number > 1;
  const aiResult = useMemo(() => getAIAudienceResult(workspace), [workspace]);
  const humanResult = useMemo(() => getHumanAudienceResult(workspace), [workspace]);
  const activeAudienceResult = audienceMode === "ai" ? aiResult : humanResult;
  const activeHumanTest = workspace.humanTest?.storyVersionId === workspace.activeVersionId ? workspace.humanTest : null;
  const shareUrl = activeHumanTest ? studyShareUrl(activeHumanTest) : "";
  const activeHumanResponses = workspace.reactionSet.storyVersionId === workspace.activeVersionId
    ? workspace.reactionSet.responses
    : [];
  const humanResponseFingerprint = `${workspace.activeVersionId}:${activeHumanResponses.map((response) => response.id).sort().join(",")}`;
  const selectedBeat = beats.find((beat) => beat.id === selectedBeatId) ?? null;
  const currentRevisionResult = revisionResult?.story_version === workspace.activeVersionId ? revisionResult : null;
  const currentDiagnosisResult = diagnosisResult?.story_version === workspace.activeVersionId
    && diagnosisResult.audience_source === audienceMode ? diagnosisResult : null;
  const latestStoryAction = workspace.activity.find((entry) => ["create_beat", "replace_beat", "move_beat", "delete_beat", "undo", "restore_version"].includes(entry.action));
  const canUndo = Boolean(latestStoryAction && !["undo", "restore_version"].includes(latestStoryAction.action));
  const hasPriorTest = workspace.aiPreviews.length > 0 || workspace.reactionSet.responses.length > 0
    || workspace.reactionHistory.some((set) => set.responses.length > 0);
  const revealCards = ["start_project", "generate_storyboard"].includes(workspace.activity[0]?.action ?? "");
  const debug = new URLSearchParams(window.location.search).get("debug") === "1";

  const interpretHumanResponses = useCallback(async () => {
    const current = payoffStore.getSnapshot();
    const currentBeats = getActiveBeats(current);
    const responses = current.reactionSet.storyVersionId === current.activeVersionId
      ? current.reactionSet.responses
      : [];
    if (responses.length === 0) return;
    humanAudienceController.current?.abort();
    const controller = new AbortController();
    humanAudienceController.current = controller;
    setHumanAudienceBusy(true);
    setHumanAudienceError("");
    try {
      const result = await withMinimumWait(interpretHumanAudience({
        source: "human",
        title: current.project.title,
        emotional_target: targetInput(current.project),
        beats: currentBeats,
        expected_version: current.activeVersionId,
        story_hash: current.reactionSet.storyHash,
        responses,
      }, controller.signal), controller.signal, 520);
      if (result.story_version !== payoffStore.getSnapshot().activeVersionId) {
        throw new Error("The story changed while Payoff was reading the responses. Try again from the current story.");
      }
      payoffStore.saveHumanReport({
        summary: result.summary,
        audienceLanding: result.audience_landing,
        match: result.match,
        observedArc: result.observed_arc,
        whatLanded: result.what_landed,
        whereItDrifted: result.where_it_drifted,
        biggestOpportunity: result.biggest_opportunity,
        strongestBeatId: result.strongest_beat.beat_id,
        strongestBeatWhy: result.strongest_beat.why,
        weakestBeatId: result.weakest_beat.beat_id,
        weakestBeatWhy: result.weakest_beat.why,
        mainRisk: result.main_risk,
        changedAudienceBeatId: result.changed_audience.beat_id,
        changedAudienceWhy: result.changed_audience.why,
      }, result.story_version, result.response_ids, "agent");
      setDiagnosisResult(null);
    } catch (error) {
      if (!isAbort(error)) setHumanAudienceError(error instanceof Error ? error.message : "Payoff couldn't make sense of those viewer responses. Your responses are safe.");
    } finally {
      if (humanAudienceController.current === controller) setHumanAudienceBusy(false);
    }
  }, [setDiagnosisResult, setHumanAudienceBusy, setHumanAudienceError]);

  useEffect(() => {
    if (!isTestView || audienceMode !== "human" || !storyboardComplete || activeHumanTest) return;
    try { payoffStore.prepareHumanTest(); } catch { /* The visible Human Audience state handles incompleteness. */ }
  }, [activeHumanTest, audienceMode, isTestView, storyboardComplete, workspace.activeVersionId]);

  useEffect(() => {
    if (!isTestView || audienceMode !== "human" || activeHumanResponses.length === 0 || humanResult
      || humanAudienceBusy || humanAudienceError || humanInterpretationAttempt.current === humanResponseFingerprint) return;
    humanInterpretationAttempt.current = humanResponseFingerprint;
    void interpretHumanResponses();
  }, [
    activeHumanResponses.length,
    audienceMode,
    humanAudienceBusy,
    humanAudienceError,
    humanResponseFingerprint,
    humanResult,
    interpretHumanResponses,
    isTestView,
  ]);

  function showNotice(message: string) {
    setNotice(message);
    window.setTimeout(() => setNotice(""), 2800);
  }

  function resetLocalFlow() {
    setCreatorRequest("");
    setSelectedBeatId(null);
    setTestingContext(null);
    setRevisionResult(null);
    setRevisionError("");
    setDiagnosisQuestion("");
    setDiagnosisResult(null);
    setDiagnosisOpen(false);
    setDiagnosisError("");
    setAudienceError("");
    setHumanAudienceError("");
    humanInterpretationAttempt.current = "";
    setImportSummary("");
  }

  function startOver() {
    generationController.current?.abort();
    revisionController.current?.abort();
    audienceController.current?.abort();
    humanAudienceController.current?.abort();
    diagnosisController.current?.abort();
    resetLocalFlow();
    setGeneration({ busy: false, error: "" });
    setConfirmation(null);
    payoffStore.resetDemo();
  }

  function confirmPendingAction() {
    if (!confirmation) return;
    if (confirmation.kind === "start-over") {
      startOver();
      return;
    }
    if (confirmation.kind === "delete") {
      try { showNotice(payoffStore.deleteBeat(confirmation.beat.id, workspace.activeVersionId, "human").message); }
      catch (error) { showNotice(error instanceof Error ? error.message : "The beat could not be deleted."); }
      setConfirmation(null);
      return;
    }
    const { beat, direction } = confirmation;
    const index = beats.findIndex((candidate) => candidate.id === beat.id);
    const afterBeatId = direction === "earlier"
      ? index <= 1 ? null : beats[index - 2].id
      : beats[index + 1]?.id ?? null;
    try { showNotice(payoffStore.moveBeat(beat.id, afterBeatId, workspace.activeVersionId, "human").message); }
    catch (error) { showNotice(error instanceof Error ? error.message : "The beat could not be moved."); }
    setConfirmation(null);
  }

  async function buildStoryboard(draft: DefinitionDraft) {
    generationController.current?.abort();
    const controller = new AbortController();
    generationController.current = controller;
    setGeneration({ busy: true, error: "" });
    const provisionalTitle = briefTitle(draft.premise) || "Untitled story";
    payoffStore.startCustomProject({
      id: "custom",
      title: provisionalTitle,
      topic: draft.premise,
      format: draft.format,
      audienceFeeling: draft.feeling,
      targetSummary: draft.feeling,
      target: {
        setupEmotion: "the intended opening feeling",
        payoffEmotion: "the intended final feeling",
        realization: "Deliver the creator's stated emotional shift.",
        constraints: ["Keep the story visually clear with minimal dialogue."],
      },
    });
    const expectedVersion = payoffStore.getSnapshot().activeVersionId;
    const isExample = draft.premise.trim() === PROJECT_BRIEF.topic;
    try {
      if (isExample) {
        await new Promise<void>((resolve, reject) => {
          const timer = window.setTimeout(resolve, 420);
          controller.signal.addEventListener("abort", () => { window.clearTimeout(timer); reject(new DOMException("Cancelled", "AbortError")); }, { once: true });
        });
        payoffStore.selectStarter({
          ...PROJECT_BRIEF,
          format: draft.format,
          audienceFeeling: draft.feeling,
          targetSummary: draft.feeling === EXAMPLE_FEELING ? PROJECT_BRIEF.targetSummary : draft.feeling,
          target: PROJECT_BRIEF.target,
        });
      } else {
        const request: StoryboardApiRequest = { premise: draft.premise, intended_feeling: draft.feeling, format: draft.format };
        const result = await withMinimumWait(generateStoryboard(request, controller.signal), controller.signal, 520);
        if (payoffStore.getSnapshot().activeVersionId !== expectedVersion) throw new Error("The story brief changed while Payoff was building. Try again from the current brief.");
        payoffStore.installGeneratedStoryboard({ title: result.title, targetSummary: result.target_payoff, beats: result.beats }, expectedVersion, "agent");
      }
      setGeneration({ busy: false, error: "" });
    } catch (error) {
      if (!isAbort(error)) setGeneration({ busy: false, error: error instanceof Error ? error.message : "Payoff couldn't finish your storyboard. Your brief is safe." });
    }
  }

  function retryGeneration() {
    void buildStoryboard({
      premise: workspace.project.topic,
      feeling: workspace.project.audienceFeeling || workspace.project.targetSummary || workspace.project.target.payoffEmotion,
      format: workspace.project.format,
    });
  }

  function switchView(view: "storyboard" | "test") {
    if (view === "storyboard") payoffStore.closeTesting();
    else {
      try { payoffStore.openTesting(); }
      catch (error) { showNotice(error instanceof Error ? error.message : "Complete the storyboard before testing it."); }
    }
  }

  function focusComposer(beatId: string | null = null) {
    setSelectedBeatId(beatId);
    setRevisionResult(null);
    setRevisionError("");
    payoffStore.closeTesting();
    window.requestAnimationFrame(() => {
      composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      composerInputRef.current?.focus();
    });
  }

  function saveEditor(value: EditorState) {
    try {
      const result = value.mode === "replace" && value.beatId
        ? payoffStore.replaceBeat(value.beatId, value.draft, workspace.activeVersionId, "human")
        : payoffStore.createBeat(value.draft, value.afterBeatId ?? null, workspace.activeVersionId, "human");
      setEditor(null);
      setRevisionResult(null);
      showNotice(result.message);
    } catch (error) { showNotice(error instanceof Error ? error.message : "The edit could not be saved."); }
  }

  function moveBeat(beat: StoryBeat, direction: "earlier" | "later") {
    setConfirmation({ kind: "move", beat, direction });
  }

  function deleteBeat(beat: StoryBeat) {
    setConfirmation({ kind: "delete", beat });
  }

  function restoreVersion(versionId: string) {
    try {
      const result = payoffStore.restoreVersion(versionId, workspace.activeVersionId, "human");
      setHistoryOpen(false);
      showNotice(result.message);
    } catch (error) { showNotice(error instanceof Error ? error.message : "That version could not be restored."); }
  }

  async function askPayoff(event?: React.FormEvent) {
    event?.preventDefault();
    if (!creatorRequest.trim() || !storyboardComplete || revisionBusy) return;
    revisionController.current?.abort();
    const controller = new AbortController();
    revisionController.current = controller;
    setRevisionBusy(true);
    setRevisionError("");
    setRevisionResult(null);
    try {
      const result = await withMinimumWait(requestRevision({
        creator_request: creatorRequest.trim(),
        story: { title: workspace.project.title, beats },
        emotional_target: targetInput(workspace.project),
        selected_beat_id: selectedBeatId,
        expected_version: workspace.activeVersionId,
        testing_context: testingContext,
      }, controller.signal), controller.signal);
      if (payoffStore.getSnapshot().activeVersionId !== result.story_version) throw new Error("The storyboard changed while Payoff was thinking. Ask again from the current story.");
      setRevisionResult(result);
    } catch (error) {
      if (!isAbort(error)) setRevisionError(error instanceof Error ? error.message : "Payoff couldn't prepare that revision. Your story was not changed.");
    } finally { if (revisionController.current === controller) setRevisionBusy(false); }
  }

  function applyRevision() {
    if (!currentRevisionResult || currentRevisionResult.kind !== "revision") return;
    try {
      const result = payoffStore.applyRevision(
        currentRevisionResult.changes.map((change) => ({ beatId: change.beat_id, draft: change.replacement })),
        currentRevisionResult.story_version,
        currentRevisionResult.summary,
        "agent",
      );
      setRevisionResult(null);
      setCreatorRequest("");
      setSelectedBeatId(null);
      setTestingContext(null);
      showNotice(`Applied ${result.affectedBeatIds.length === 1 ? "1 beat change" : `${result.affectedBeatIds.length} beat changes`}.`);
    } catch (error) { setRevisionError(error instanceof Error ? error.message : "The proposed changes could not be applied."); }
  }

  async function runAudienceCheck() {
    if (!storyboardComplete || audienceBusy) return;
    audienceController.current?.abort();
    const controller = new AbortController();
    audienceController.current = controller;
    setAudienceBusy(true);
    setAudienceError("");
    try {
      const result = await withMinimumWait(runAIAudience({
        source: "ai",
        title: workspace.project.title,
        emotional_target: targetInput(workspace.project),
        beats,
        expected_version: workspace.activeVersionId,
      }, controller.signal), controller.signal, 520);
      payoffStore.saveAIPreview({
        summary: result.summary,
        likelyEmotionalLanding: result.audience_landing,
        targetMatch: result.match,
        whatLanded: result.what_landed,
        whereItDrifted: result.where_it_drifted,
        biggestOpportunity: result.biggest_opportunity,
        observedArc: result.observed_arc,
        strongestBeatId: result.strongest_beat.beat_id,
        strongestBeatWhy: result.strongest_beat.why,
        weakestBeatId: result.weakest_beat.beat_id,
        weakestBeatWhy: result.weakest_beat.why,
        mainRisk: result.main_risk,
        changedAudienceBeatId: result.changed_audience.beat_id,
        changedAudienceWhy: result.changed_audience.why,
        perspectives: result.reactions.map((reaction) => ({ persona: reaction.persona, likelyResponse: reaction.note, watchFor: reaction.evidence })),
        disagreements: result.disagreements,
        confidence: result.confidence.level,
        confidenceNote: result.confidence.note,
        investigateNext: result.changed_audience.why,
      }, result.story_version, "agent");
      setDiagnosisResult(null);
    } catch (error) {
      if (!isAbort(error)) setAudienceError(error instanceof Error ? error.message : "Payoff couldn't finish the audience check. Your story was not changed.");
    } finally { if (audienceController.current === controller) setAudienceBusy(false); }
  }

  async function askDiagnosis(event?: React.FormEvent) {
    event?.preventDefault();
    if (!diagnosisQuestion.trim() || !activeAudienceResult || diagnosisBusy) return;
    diagnosisController.current?.abort();
    const controller = new AbortController();
    diagnosisController.current = controller;
    setDiagnosisBusy(true);
    setDiagnosisError("");
    setDiagnosisResult(null);
    try {
      const result = await withMinimumWait(diagnoseAudience({
        question: diagnosisQuestion.trim(),
        story: { title: workspace.project.title, beats },
        emotional_target: targetInput(workspace.project),
        audience_source: audienceMode,
        audience_result: toDiagnosisEvidence(activeAudienceResult),
        expected_version: workspace.activeVersionId,
      }, controller.signal), controller.signal);
      if (payoffStore.getSnapshot().activeVersionId !== result.story_version) throw new Error("The story changed while Payoff was reading the result. Ask again from the current story.");
      setDiagnosisResult(result);
    } catch (error) {
      if (!isAbort(error)) setDiagnosisError(error instanceof Error ? error.message : "Payoff couldn't explain that result just now.");
    } finally { if (diagnosisController.current === controller) setDiagnosisBusy(false); }
  }

  function openDiagnosisWorkspace() {
    setDiagnosisOpen(true);
    window.requestAnimationFrame(() => {
      diagnosisRef.current?.scrollIntoView({ behavior: "smooth", block: "center" });
      diagnosisInputRef.current?.focus();
    });
  }

  function reviseFromDiagnosis() {
    if (!currentDiagnosisResult || !activeAudienceResult) return;
    setTestingContext(`Testing found: ${firstSentence(currentDiagnosisResult.answer || activeAudienceResult.mainRisk)}`);
    setCreatorRequest("");
    setSelectedBeatId(null);
    setRevisionResult(null);
    payoffStore.closeTesting();
    window.requestAnimationFrame(() => composerRef.current?.scrollIntoView({ behavior: "smooth", block: "center" }));
  }

  async function copyText(value: string, success: string) {
    try { await navigator.clipboard.writeText(value); showNotice(success); }
    catch { showNotice("Copy was unavailable. Open the test and copy the link from the address bar."); }
  }

  async function importResponses(event: React.ChangeEvent<HTMLInputElement>) {
    const files = Array.from(event.target.files ?? []);
    const values = await Promise.all(files.map(async (file) => { try { return JSON.parse(await file.text()) as unknown; } catch { return null; } }));
    const result = payoffStore.importStudyResponses(values);
    setImportSummary(`${result.accepted} accepted · ${result.duplicates} duplicate · ${result.rejected} rejected`);
    if (result.accepted > 0) {
      setHumanAudienceError("");
      humanInterpretationAttempt.current = "";
    }
    event.target.value = "";
  }

  function renderConfirmation() {
    if (!confirmation) return null;
    if (confirmation.kind === "start-over") {
      return (
        <ConfirmDialog
          title="Start a new story?"
          description="Your current storyboard and test results will be cleared."
          confirmLabel="Start over"
          destructive
          onClose={() => setConfirmation(null)}
          onConfirm={confirmPendingAction}
        />
      );
    }
    if (confirmation.kind === "delete") {
      return (
        <ConfirmDialog
          title="Delete this beat?"
          description={`“${confirmation.beat.title}” will be removed. You can undo this change until you make another edit.`}
          confirmLabel="Delete beat"
          destructive
          onClose={() => setConfirmation(null)}
          onConfirm={confirmPendingAction}
        />
      );
    }
    return (
      <ConfirmDialog
        title={`Move this beat ${confirmation.direction}?`}
        description={`“${confirmation.beat.title}” will move ${confirmation.direction} in the story. The change is saved as a new version.`}
        confirmLabel="Move beat"
        onClose={() => setConfirmation(null)}
        onConfirm={confirmPendingAction}
      />
    );
  }

  if (workspace.workflow.stage === "define") return <DefineExperience onCreate={(draft) => void buildStoryboard(draft)} />;

  const generationIncomplete = beats.length === 0;
  if (generationIncomplete) {
    return (
      <main className="creator-shell">
        <header className="creator-nav">
          <Brand />
          <nav className="primary-views" role="tablist" aria-label="Creator views"><button role="tab" aria-selected="true">Storyboard</button><button role="tab" aria-selected="false" disabled>Test the payoff</button></nav>
          <div className="creator-nav__actions"><button className="secondary-button secondary-button--small" onClick={() => setConfirmation({ kind: "start-over" })}>Start over</button></div>
        </header>
        <GenerationExperience project={workspace.project} generation={generation} onRetry={retryGeneration} onStartOver={() => setConfirmation({ kind: "start-over" })} />
        {renderConfirmation()}
      </main>
    );
  }

  const diagnosisQuestions = aiResult && humanResult
    ? [...diagnosisSuggestions, "Why did AI and human audiences disagree?"]
    : diagnosisSuggestions;

  return (
    <main className="creator-shell">
      <header className="creator-nav">
        <Brand />
        <nav className="primary-views" role="tablist" aria-label="Creator views">
          <button role="tab" aria-selected={!isTestView} className={!isTestView ? "active" : ""} onClick={() => switchView("storyboard")}>Storyboard</button>
          <button role="tab" aria-selected={isTestView} className={isTestView ? "active" : ""} onClick={() => switchView("test")}>Test the payoff</button>
        </nav>
        <div className="creator-nav__actions">
          <button className="text-button" onClick={() => setHistoryOpen(true)}>History</button>
          <button className="secondary-button secondary-button--small" onClick={() => setConfirmation({ kind: "start-over" })}>Start over</button>
        </div>
      </header>

      {!isTestView ? (
        <section className="creator-view storyboard-view" aria-labelledby="story-title">
          <ProjectSummary project={workspace.project} tested={tested} revision={revision} />
          <div className="view-toolbar">
            <div><span className="kicker">Storyboard</span><h2 id="story-title">Make the story say and feel what you intend.</h2></div>
            <div>
              {canUndo && <button className="text-button" onClick={() => showNotice(payoffStore.undoLastMutation("human")?.message ?? "There is no story change to undo.")}>Undo</button>}
              {beats.length < 6 && <button className="secondary-button" onClick={() => setEditor({ mode: "create", afterBeatId: beats.at(-1)?.id ?? null, draft: structuredClone(emptyDraft) })}>Add beat</button>}
              {storyboardComplete && <button className="primary-button" onClick={() => switchView("test")}>{!tested && hasPriorTest ? "Test again" : "Test the payoff"}</button>}
            </div>
          </div>

          <section className="ai-composer" ref={composerRef} aria-labelledby="ai-composer-title">
            <header><span className="composer-mark" aria-hidden="true">✦</span><div><h2 id="ai-composer-title">Ask Payoff to change the story...</h2><p>Give the creative direction. You'll review the proposed beat changes before anything is applied.</p></div></header>
            {testingContext && <div className="testing-note"><span>{testingContext}</span><button onClick={() => setTestingContext(null)} aria-label="Dismiss testing note">×</button></div>}
            {selectedBeat && <button className="selected-beat" onClick={() => setSelectedBeatId(null)}>Beat {selectedBeat.order} · {selectedBeat.title} <span>×</span></button>}
            <div className="suggestion-row" aria-label="Revision examples">
              {revisionSuggestions.map((suggestion) => <button key={suggestion} type="button" onClick={() => { setCreatorRequest(suggestion); composerInputRef.current?.focus(); }}>{suggestion}</button>)}
            </div>
            <form onSubmit={(event) => void askPayoff(event)}>
              <textarea
                ref={composerInputRef}
                aria-label="Ask Payoff to change the story"
                maxLength={500}
                rows={2}
                value={creatorRequest}
                onChange={(event) => setCreatorRequest(event.target.value)}
                placeholder={selectedBeat ? `What should change about “${selectedBeat.title}”?` : "Keep the reveal, but make the ending warmer."}
              />
              <button className="primary-button" type="submit" disabled={!creatorRequest.trim() || revisionBusy}>{revisionBusy ? "Planning changes..." : "Ask Payoff"}</button>
            </form>
            {revisionBusy && <p className="operation-status" role="status">Reading the full story and planning the smallest useful change…</p>}
            {revisionError && <div className="inline-error" role="alert"><p>{revisionError}</p><button className="secondary-button secondary-button--small" onClick={() => void askPayoff()}>Try again</button></div>}
            {currentRevisionResult && (
              <section className={`revision-proposal revision-proposal--${currentRevisionResult.kind}`} aria-live="polite">
                {currentRevisionResult.kind === "revision" ? (
                  <>
                    <span className="kicker">Proposed revision · story unchanged</span>
                    <h3>What I'll change</h3>
                    <ul>{currentRevisionResult.changes.map((change) => { const beat = beats.find((candidate) => candidate.id === change.beat_id); return <li key={change.beat_id}><strong>Beat {beat?.order ?? "?"}: {beat?.title}</strong><span>{change.what_changes}</span></li>; })}</ul>
                    <h3>Why</h3><p>{currentRevisionResult.why}</p>
                    <div><button className="primary-button" onClick={applyRevision}>Apply changes</button><button className="secondary-button" onClick={() => setRevisionResult(null)}>Cancel</button></div>
                  </>
                ) : (
                  <><span className="kicker">One question before changing anything</span><h3>{currentRevisionResult.clarification_question}</h3><p>Your storyboard has not changed. Clarify the direction above and ask again.</p></>
                )}
              </section>
            )}
          </section>

          {beats.length < 6 && <div className="incomplete-story" role="status"><strong>This storyboard has {beats.length} of 6 beats.</strong><span>Undo the deletion or add a replacement before testing.</span></div>}
          <div className={`storyboard-grid${revealCards ? " storyboard-grid--revealing" : ""}`} aria-label="Ordered storyboard">
            {beats.map((beat, index) => (
              <StoryCard
                key={beat.id}
                beat={beat}
                changed={Boolean(latestStoryAction?.afterVersionId === workspace.activeVersionId && latestStoryAction.affectedBeatIds.includes(beat.id))}
                onAskAI={(selected) => focusComposer(selected.id)}
                onEdit={(selected) => setEditor({ mode: "replace", beatId: selected.id, draft: draftFromBeat(selected) })}
                onMove={moveBeat}
                onDelete={deleteBeat}
                canMoveEarlier={index > 0}
                canMoveLater={index < beats.length - 1}
              />
            ))}
          </div>
        </section>
      ) : (
        <section className="creator-view test-view" aria-labelledby="test-heading">
          <ProjectSummary project={workspace.project} tested={tested} revision={revision} />
          <header className="test-heading">
            <div><span className="kicker">Test the payoff</span><h2 id="test-heading">Did it land?</h2><p><strong>You wanted:</strong> {getTargetPayoff(workspace)}</p></div>
          </header>
          <div className="audience-tabs" role="tablist" aria-label="Audience source">
            <button role="tab" aria-selected={audienceMode === "ai"} className={audienceMode === "ai" ? "active" : ""} onClick={() => { setAudienceMode("ai"); setDiagnosisOpen(false); setDiagnosisError(""); }}>AI Audience<span>Fast simulated perspective check</span></button>
            <button role="tab" aria-selected={audienceMode === "human"} className={audienceMode === "human" ? "active" : ""} onClick={() => { setAudienceMode("human"); setDiagnosisOpen(false); setDiagnosisError(""); }}>Human Audience<span>Real target-blind viewers</span></button>
          </div>

          {audienceMode === "ai" ? (
            <section className="audience-source audience-source--ai">
              {aiResult && !audienceBusy && <div className="result-toolbar"><button className="text-button" onClick={() => void runAudienceCheck()}>Run again</button></div>}
              {audienceBusy && <div className="analysis-loading" role="status"><span className="generation-spark">✦</span><div><h3>Testing the payoff...</h3><p>Comparing several viewing perspectives with the feeling you want.</p></div></div>}
              {audienceError && <div className="inline-error" role="alert"><p>{audienceError}</p><button className="secondary-button secondary-button--small" onClick={() => void runAudienceCheck()}>Try again</button></div>}
              {!audienceBusy && !aiResult && (
                <div className="audience-empty audience-empty--ai">
                  <span className="kicker">AI Audience</span>
                  <h3>See how different viewers might react.</h3>
                  <p>Fast simulated perspective check. {AI_AUDIENCE_NOTICE}</p>
                  <button className="primary-button" onClick={() => void runAudienceCheck()}>Run AI Audience</button>
                </div>
              )}
              {aiResult && !audienceBusy && <AudienceResultView result={aiResult} beats={beats} onUnderstand={openDiagnosisWorkspace} />}
            </section>
          ) : (
            <section className="audience-source audience-source--human">
              {humanResult ? (
                <>
                  <AudienceResultView result={humanResult} beats={beats} onUnderstand={openDiagnosisWorkspace} />
                  <details className="collect-more">
                    <summary>Collect more responses</summary>
                    <div className="collection-controls">
                      <button className="primary-button" disabled={!shareUrl} onClick={() => void copyText(shareUrl, "Test link copied.")}>Copy test link</button>
                      {shareUrl ? <a className="secondary-button" href={shareUrl} target="_blank" rel="noreferrer">Open test ↗</a> : <button className="secondary-button" disabled>Preparing test…</button>}
                      <label className="import-button"><input type="file" accept="application/json,.json" multiple onChange={(event) => void importResponses(event)} /><span>Import responses</span></label>
                    </div>
                  </details>
                </>
              ) : (
                <section className="human-collection">
                  <span className="kicker">Human Audience</span>
                  <h3>Test with real people</h3>
                  <p>Viewers see the complete story without seeing the feeling you're aiming for.</p>
                  <div className="collection-controls">
                    <button className="primary-button" disabled={!shareUrl} onClick={() => void copyText(shareUrl, "Test link copied.")}>Copy test link</button>
                    {shareUrl ? <a className="secondary-button" href={shareUrl} target="_blank" rel="noreferrer">Open test ↗</a> : <button className="secondary-button" disabled>Preparing test…</button>}
                    <label className="import-button"><input type="file" accept="application/json,.json" multiple onChange={(event) => void importResponses(event)} /><span>Import responses</span></label>
                  </div>
                  <p className="response-status"><strong>{activeHumanResponses.length} {activeHumanResponses.length === 1 ? "response" : "responses"}</strong> · {activeHumanResponses.length > 0 ? "Making sense of responses" : "Waiting for viewers"}</p>
                  <details className="test-details">
                    <summary>Test details</summary>
                    <dl>
                      <div><dt>Story</dt><dd>Current storyboard</dd></div>
                      <div><dt>Viewer experience</dt><dd>Anonymous · target hidden · full story first</dd></div>
                      <div><dt>Evidence</dt><dd>Only valid responses for this exact story count. AI Audience data is never included.</dd></div>
                    </dl>
                  </details>
                </section>
              )}
              {humanAudienceBusy && <div className="analysis-loading analysis-loading--compact" role="status"><span className="generation-spark">✦</span><div><h3>Making sense of viewer responses...</h3><p>Organizing only the reactions real viewers submitted.</p></div></div>}
              {humanAudienceError && <div className="inline-error" role="alert"><p>{humanAudienceError}</p><button className="secondary-button secondary-button--small" onClick={() => { setHumanAudienceError(""); humanInterpretationAttempt.current = ""; void interpretHumanResponses(); }}>Try again</button></div>}
              {importSummary && <p className="import-summary" role="status">{importSummary}</p>}
              {workspace.reactionHistory.some((set) => set.responses.length > 0) && <p className="preserved-evidence">Previous Human Audience evidence remains preserved on the story version it tested.</p>}
            </section>
          )}

          {activeAudienceResult && diagnosisOpen && (
            <section className="diagnosis-workspace" ref={diagnosisRef} aria-labelledby="diagnosis-heading">
              <header><span className="kicker">Understand the result</span><h2 id="diagnosis-heading">Why did the audience respond this way?</h2><p>Ask about the gap between your target and this result. Diagnosis will not change the storyboard.</p></header>
              <div className="suggestion-row">{diagnosisQuestions.map((question) => <button key={question} onClick={() => setDiagnosisQuestion(question)}>{question}</button>)}</div>
              <form onSubmit={(event) => void askDiagnosis(event)}><input ref={diagnosisInputRef} aria-label="Ask about the audience result" maxLength={500} value={diagnosisQuestion} onChange={(event) => setDiagnosisQuestion(event.target.value)} placeholder="Ask why the response differed from your target..." /><button className="primary-button" disabled={!diagnosisQuestion.trim() || diagnosisBusy}>{diagnosisBusy ? "Looking for the mismatch..." : "Ask why"}</button></form>
              {diagnosisBusy && <p className="operation-status" role="status">Looking for the emotional mismatch…</p>}
              {diagnosisError && <div className="inline-error" role="alert"><p>{diagnosisError}</p><button className="secondary-button secondary-button--small" onClick={() => void askDiagnosis()}>Try again</button></div>}
              {currentDiagnosisResult && (
                <article className="diagnosis-answer" aria-live="polite">
                  <span className="kicker">Payoff's diagnosis · story unchanged</span>
                  <p>{currentDiagnosisResult.answer}</p>
                  <div>{currentDiagnosisResult.evidence.map((item, index) => { const beat = beats.find((candidate) => candidate.id === item.beat_id); return <section key={`${item.beat_id}-${index}`}><strong>{beat ? `Beat ${beat.order} · ${beat.title}` : "Audience result"}</strong><span>{item.observation}</span></section>; })}</div>
                  <button className="primary-button" onClick={reviseFromDiagnosis}>Revise the story</button>
                </article>
              )}
            </section>
          )}
        </section>
      )}

      {debug && <details className="debug-surface"><summary>Developer details</summary><p>WebMCP: {agentCapability}. Eight primitive story and evidence tools remain registered when supported.</p></details>}
      <div className="sr-only" aria-live="polite">{notice}</div>
      {notice && <div className="toast" role="status">{notice}</div>}
      {editor && <BeatEditor editor={editor} onClose={() => setEditor(null)} onSave={saveEditor} />}
      {historyOpen && <HistoryDialog versions={workspace.versions} activeVersionId={workspace.activeVersionId} onClose={() => setHistoryOpen(false)} onRestore={restoreVersion} />}
      {renderConfirmation()}
    </main>
  );
}
