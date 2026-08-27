import {
  BASELINE_BEATS,
  BASELINE_CONTENT_HASH,
  BASELINE_VERSION_ID,
  CANONICAL_STUDY,
  PROJECT_BRIEF,
  createCanonicalWorkspace,
  createSeedWorkspace,
  studyBeatsWithoutTarget,
  storyContentHash,
} from "./seed";
import { getActiveBeats, getActiveVersion } from "./selectors";
import type {
  AIPreview,
  AIPreviewPerspective,
  ActivityEntry,
  Actor,
  AudienceReaction,
  BeatDraft,
  HumanAudienceReport,
  ProjectBrief,
  StoryBeat,
  StoryVersion,
  StudyResponseExport,
  StudyStimulus,
  Workspace,
} from "./types";
import { AI_PERSONAS, ART_KEYS, NARRATIVE_ROLES, REACTION_EMOTIONS } from "./types";

const STORAGE_KEY = "payoff.workspace.v3";
const LEGACY_STORAGE_KEY = "payoff.workspace.v2";
const MAX_BEATS = 6;

type Listener = () => void;
type StoreOptions = { persist?: boolean; initialState?: Workspace };

export type ImportResult = { accepted: number; duplicates: number; rejected: number };

export type CommandResult = {
  affectedBeatIds: string[];
  activeVersionId: string;
  internalVersion: number;
  message: string;
};

export type PreviewDraft = {
  summary: string;
  perspectives: AIPreviewPerspective[];
  disagreements: string[];
  likelyEmotionalLanding?: string;
  targetMatch?: AIPreview["targetMatch"];
  whatLanded?: string;
  whereItDrifted?: string;
  biggestOpportunity?: string;
  strongestBeatId?: string;
  strongestBeatWhy?: string;
  weakestBeatId?: string;
  weakestBeatWhy?: string;
  mainRisk?: string;
  observedArc?: string[];
  changedAudienceBeatId?: string;
  changedAudienceWhy?: string;
  confidence?: AIPreview["confidence"];
  confidenceNote?: string;
  investigateNext?: string;
};

export type HumanReportDraft = Omit<
  HumanAudienceReport,
  "id" | "storyVersionId" | "storyHash" | "createdAt" | "responseIds"
>;

export type RevisionCommandChange = { beatId: string; draft: BeatDraft };

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
}

function slugify(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40) || "untitled-story";
}

function normalizeBeats(beats: StoryBeat[]): StoryBeat[] {
  return beats.map((beat, index) => ({ ...beat, order: index + 1 }));
}

function safeText(value: unknown, field: string, maxLength: number, allowEmpty = false): string {
  if (typeof value !== "string") throw new Error(`${field} must be text.`);
  const clean = value.trim();
  if (!allowEmpty && !clean) throw new Error(`${field} cannot be empty.`);
  if (clean.length > maxLength) throw new Error(`${field} must be ${maxLength} characters or fewer.`);
  return clean;
}

function validateDraft(input: BeatDraft): BeatDraft {
  if (!NARRATIVE_ROLES.includes(input.narrativeRole)) throw new Error("Unknown narrative role.");
  if (!ART_KEYS.includes(input.artKey)) throw new Error("Unknown art key.");
  return {
    title: safeText(input.title, "Title", 48),
    action: safeText(input.action, "Action", 180),
    line: safeText(input.line, "Line", 100, true),
    intendedEmotion: safeText(input.intendedEmotion, "Intended emotion", 48),
    narrativeRole: input.narrativeRole,
    artKey: input.artKey,
  };
}

function validateBrief(input: ProjectBrief): ProjectBrief {
  return {
    id: slugify(input.title),
    title: safeText(input.title, "Title", 60),
    topic: safeText(input.topic, "Premise", 220),
    format: safeText(input.format, "Format", 80),
    audienceFeeling: input.audienceFeeling ? safeText(input.audienceFeeling, "Audience feeling", 160) : undefined,
    targetSummary: input.targetSummary ? safeText(input.targetSummary, "Target payoff", 160) : undefined,
    target: {
      setupEmotion: safeText(input.target.setupEmotion, "Opening emotion", 60),
      payoffEmotion: safeText(input.target.payoffEmotion, "Payoff emotion", 80),
      realization: safeText(input.target.realization, "Emotional turn", 180),
      constraints: input.target.constraints.slice(0, 4).map((constraint) => safeText(constraint, "Constraint", 140)),
    },
  };
}

function isCanonicalStory(project: ProjectBrief, beats: StoryBeat[]) {
  const normalized = normalizeBeats(beats);
  return project.id === PROJECT_BRIEF.id && normalized.length === BASELINE_BEATS.length && normalized.every((beat, index) => {
    const expected = BASELINE_BEATS[index];
    return beat.id === expected.id && beat.order === expected.order && beat.title === expected.title &&
      beat.action === expected.action && beat.line === expected.line && beat.narrativeRole === expected.narrativeRole &&
      beat.intendedEmotion === expected.intendedEmotion && beat.artKey === expected.artKey;
  });
}

function emptyVersion(projectId: string): StoryVersion {
  return {
    id: `${projectId}-draft-v0`,
    number: 0,
    parentVersionId: null,
    createdAt: now(),
    source: "system",
    reason: "Brief confirmed; storyboard empty",
    beats: [],
  };
}

function blankReactionSet(projectId: string) {
  return {
    id: `${projectId}-study-unprepared`,
    storyVersionId: `${projectId}-untested`,
    storyHash: "unprepared",
    collectedAt: null,
    method: "Target-blind uninterrupted first viewing, immediate post-view questionnaire, optional labeled second pass.",
    responses: [],
  };
}

function mergeReactionHistory(...sets: Array<Workspace["reactionSet"] | undefined>) {
  const seen = new Set<string>();
  return sets.flatMap((set) => {
    if (!set || set.responses.length === 0) return [];
    const key = `${set.storyVersionId}:${set.storyHash}`;
    if (seen.has(key)) return [];
    seen.add(key);
    return [structuredClone(set)];
  }).slice(0, 8);
}

function validReaction(value: unknown, state: Workspace): value is AudienceReaction {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AudienceReaction>;
  const testedBeatIds = new Set((state.humanTest?.beats ?? (state.reactionSet.storyHash === BASELINE_CONTENT_HASH ? BASELINE_BEATS : [])).map((beat) => beat.id));
  return Boolean(
    typeof item.id === "string" && item.id.length <= 100 &&
    item.storyVersionId === state.reactionSet.storyVersionId &&
    item.storyHash === state.reactionSet.storyHash &&
    typeof item.submittedAt === "string" &&
    REACTION_EMOTIONS.includes(item.endingEmotion as (typeof REACTION_EMOTIONS)[number]) &&
    typeof item.interpretation === "string" && item.interpretation.trim().length > 0 && item.interpretation.length <= 800 &&
    typeof item.wasSurprised === "boolean" &&
    typeof item.predictionPoint === "string" && /^not_predicted$|^before_story$|^beat_[1-6]$/.test(item.predictionPoint) &&
    typeof item.changedBeatId === "string" && testedBeatIds.has(item.changedBeatId) &&
    typeof item.changedWhy === "string" && item.changedWhy.trim().length > 0 && item.changedWhy.length <= 800 &&
    typeof item.quoteConsent === "boolean"
  );
}

function parseStudyExport(value: unknown, state: Workspace): AudienceReaction | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StudyResponseExport>;
  if (item.schema !== "payoff-study-response/v1") return null;
  if (
    item.study?.projectId !== state.project.id ||
    item.study.storyVersionId !== state.reactionSet.storyVersionId ||
    item.study.storyHash !== state.reactionSet.storyHash ||
    item.study.targetWasHidden !== true ||
    item.study.firstViewingWasUninterrupted !== true
  ) return null;
  return validReaction(item.response, state) ? structuredClone(item.response) : null;
}

function hasWorkspaceCollections(value: unknown): value is Record<string, unknown> {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  const reactionSet = item.reactionSet as Record<string, unknown> | undefined;
  return Boolean(
    item.workflow &&
    Array.isArray(item.versions) &&
    Array.isArray(reactionSet?.responses) &&
    Array.isArray(item.reactionHistory) &&
    Array.isArray(item.aiPreviews),
  );
}

function recoverStarterWorkspace(workspace: Workspace): Workspace {
  if (workspace.workflow.source !== "starter" || workspace.workflow.stage === "define") return workspace;
  const active = workspace.versions.find((version) => version.id === workspace.activeVersionId);
  if (active?.id === BASELINE_VERSION_ID && !isCanonicalStory(workspace.project, active.beats)) {
    return {
      ...workspace,
      versions: workspace.versions.map((version) => version.id === BASELINE_VERSION_ID
        ? { ...version, beats: structuredClone(BASELINE_BEATS) }
        : version),
    };
  }
  if (active && active.beats.length >= BASELINE_BEATS.length) return workspace;

  const recovered = createCanonicalWorkspace();
  const canonicalEvidence = workspace.reactionSet.storyHash === BASELINE_CONTENT_HASH
    ? workspace.reactionSet
    : workspace.reactionHistory.find((set) => set.storyHash === BASELINE_CONTENT_HASH);
  if (canonicalEvidence) recovered.reactionSet = structuredClone(canonicalEvidence);
  recovered.reactionHistory = structuredClone(
    workspace.reactionHistory.filter((set) => set.storyHash !== BASELINE_CONTENT_HASH),
  );
  recovered.activity = structuredClone(workspace.activity).slice(0, 30);
  return recovered;
}

function parseWorkspace(raw: string | null): Workspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!hasWorkspaceCollections(parsed)) return null;
    if (parsed.schemaVersion === 3) {
      const workspace = {
        ...parsed,
        humanReports: Array.isArray(parsed.humanReports) ? parsed.humanReports : [],
      } as Workspace;
      if (!["define", "storyboard", "test"].includes(workspace.workflow.stage)) return null;
      return recoverStarterWorkspace(workspace);
    }
    if (parsed.schemaVersion !== 2) return null;
    const legacy = parsed as Record<string, unknown> & {
      workflow: { stage: "choose" | "intent" | "storyboard"; source: "starter" | "custom" | null };
    };
    const migrated = {
      ...legacy,
      schemaVersion: 3,
      humanReports: [],
      workflow: {
        stage: legacy.workflow.stage === "choose" ? "define" : "storyboard",
        source: legacy.workflow.source,
      },
    } as unknown as Workspace;
    return recoverStarterWorkspace(migrated);
  } catch {
    return null;
  }
}

function loadWorkspace(): Workspace {
  return parseWorkspace(localStorage.getItem(STORAGE_KEY))
    ?? parseWorkspace(localStorage.getItem(LEGACY_STORAGE_KEY))
    ?? createSeedWorkspace();
}

export class PayoffStore {
  private state: Workspace;
  private listeners = new Set<Listener>();
  private persist: boolean;

  constructor(options: StoreOptions = {}) {
    this.persist = options.persist ?? true;
    this.state = options.initialState
      ? structuredClone(options.initialState)
      : this.persist && typeof localStorage !== "undefined"
        ? loadWorkspace()
        : createSeedWorkspace();
  }

  getSnapshot = () => this.state;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: Workspace) {
    this.state = next;
    if (this.persist && typeof localStorage !== "undefined") localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    this.listeners.forEach((listener) => listener());
  }

  private activity(action: ActivityEntry["action"], message: string, actor: Actor = "human", affectedBeatIds: string[] = []): ActivityEntry {
    return {
      id: makeId("activity"),
      at: now(),
      actor,
      action,
      message,
      affectedBeatIds,
      beforeVersionId: this.state.activeVersionId,
      afterVersionId: this.state.activeVersionId,
    };
  }

  selectStarter(brief: ProjectBrief = PROJECT_BRIEF) {
    const next = createCanonicalWorkspace();
    const project = validateBrief({ ...brief, id: PROJECT_BRIEF.id, title: PROJECT_BRIEF.title });
    project.id = PROJECT_BRIEF.id;
    next.project = project;
    next.humanTest = {
      ...structuredClone(CANONICAL_STUDY),
      title: project.title,
      format: project.format,
    };
    const canonicalEvidence = this.state.reactionSet.storyHash === BASELINE_CONTENT_HASH
      ? this.state.reactionSet
      : this.state.reactionHistory.find((set) => set.storyHash === BASELINE_CONTENT_HASH);
    if (canonicalEvidence) next.reactionSet = structuredClone(canonicalEvidence);
    next.reactionHistory = mergeReactionHistory(
      this.state.reactionSet.storyHash !== BASELINE_CONTENT_HASH ? this.state.reactionSet : undefined,
      ...this.state.reactionHistory.filter((set) => set.storyHash !== BASELINE_CONTENT_HASH),
    );
    next.activity = [{
      ...this.activity("start_project", "Opened the Looks Great storyboard", "human", BASELINE_BEATS.map((beat) => beat.id)),
      afterVersionId: BASELINE_VERSION_ID,
    }];
    this.publish(next);
  }

  startCustomProject(brief: ProjectBrief) {
    const project = validateBrief(brief);
    const version = emptyVersion(project.id);
    this.publish({
      schemaVersion: 3,
      workflow: { stage: "storyboard", source: "custom" },
      project,
      activeVersionId: version.id,
      testedVersionId: `${project.id}-untested`,
      revisionSequence: 0,
      versions: [version],
      reactionSet: blankReactionSet(project.id),
      reactionHistory: mergeReactionHistory(this.state.reactionSet, ...this.state.reactionHistory),
      humanTest: null,
      aiPreviews: [],
      humanReports: [],
      activity: [{ ...this.activity("start_project", `Started “${project.title}”`), beforeVersionId: version.id, afterVersionId: version.id }],
    });
  }

  installGeneratedStoryboard(
    input: { title: string; targetSummary: string; beats: BeatDraft[] },
    expectedVersion: string,
    actor: Actor = "agent",
  ): CommandResult {
    this.assertExpectedVersion(expectedVersion);
    const current = getActiveVersion(this.state);
    if (current.beats.length > 0) throw new Error("This storyboard already has a draft.");
    if (input.beats.length !== MAX_BEATS) throw new Error("A generated storyboard must contain exactly six beats.");
    const title = safeText(input.title, "Story title", 60);
    const targetSummary = safeText(input.targetSummary, "Target payoff", 160);
    const beats = input.beats.map((draft, index): StoryBeat => ({
      ...validateDraft(draft),
      id: `${this.state.project.id}-beat-${index + 1}`,
      order: index + 1,
    }));
    const number = this.state.revisionSequence + 1;
    const version: StoryVersion = {
      id: `${this.state.project.id}-r${number}`,
      number,
      parentVersionId: current.id,
      createdAt: now(),
      source: actor,
      reason: "Created the first storyboard draft",
      beats,
    };
    const activity: ActivityEntry = {
      id: makeId("activity"),
      at: now(),
      actor,
      action: "generate_storyboard",
      message: "Created the first storyboard draft",
      affectedBeatIds: beats.map((beat) => beat.id),
      beforeVersionId: current.id,
      afterVersionId: version.id,
    };
    this.publish({
      ...this.state,
      project: { ...this.state.project, title, targetSummary },
      workflow: { ...this.state.workflow, stage: "storyboard" },
      activeVersionId: version.id,
      revisionSequence: number,
      versions: [...this.state.versions, version],
      activity: [activity, ...this.state.activity].slice(0, 30),
    });
    return {
      affectedBeatIds: beats.map((beat) => beat.id),
      activeVersionId: version.id,
      internalVersion: number,
      message: activity.message,
    };
  }

  private assertExpectedVersion(expectedVersion: string) {
    if (expectedVersion !== this.state.activeVersionId) {
      throw new Error(`Stale story version. Expected ${this.state.activeVersionId}; received ${expectedVersion}. Read the board again before editing.`);
    }
  }

  private commitVersion(
    beats: StoryBeat[],
    actor: Actor,
    action: "create_beat" | "replace_beat" | "move_beat" | "delete_beat" | "undo" | "restore_version",
    message: string,
    affectedBeatIds: string[],
  ): CommandResult {
    const previous = getActiveVersion(this.state);
    const number = this.state.revisionSequence + 1;
    const normalized = normalizeBeats(structuredClone(beats));
    const canonical = this.state.workflow.source === "starter" && isCanonicalStory(this.state.project, normalized);
    const versionId = canonical ? BASELINE_VERSION_ID : `${this.state.project.id}-r${number}`;
    const existing = this.state.versions.find((version) => version.id === versionId);
    const version: StoryVersion = existing ?? {
      id: versionId,
      number,
      parentVersionId: previous.id,
      createdAt: now(),
      source: actor,
      reason: message,
      beats: normalized,
    };
    const at = now();
    const activity: ActivityEntry = {
      id: makeId("activity"), at, actor, action, message, affectedBeatIds,
      beforeVersionId: previous.id, afterVersionId: version.id,
    };
    const canonicalEvidence = canonical
      ? this.state.reactionSet.storyHash === BASELINE_CONTENT_HASH
        ? this.state.reactionSet
        : this.state.reactionHistory.find((set) => set.storyHash === BASELINE_CONTENT_HASH)
      : undefined;
    const canonicalSeed = canonical ? createCanonicalWorkspace() : null;
    const next: Workspace = {
      ...this.state,
      workflow: { ...this.state.workflow, stage: "storyboard" },
      activeVersionId: version.id,
      testedVersionId: canonical ? BASELINE_VERSION_ID : this.state.testedVersionId,
      revisionSequence: number,
      versions: existing ? this.state.versions : [...this.state.versions, version],
      humanTest: canonical
        ? { ...structuredClone(CANONICAL_STUDY), title: this.state.project.title, format: this.state.project.format }
        : this.state.humanTest,
      reactionSet: canonical
        ? structuredClone(canonicalEvidence ?? canonicalSeed!.reactionSet)
        : this.state.reactionSet,
      reactionHistory: canonical
        ? mergeReactionHistory(
            this.state.reactionSet.storyHash !== BASELINE_CONTENT_HASH ? this.state.reactionSet : undefined,
            ...this.state.reactionHistory.filter((set) => set.storyHash !== BASELINE_CONTENT_HASH),
          )
        : this.state.reactionHistory,
      activity: [activity, ...this.state.activity].slice(0, 30),
    };
    this.publish(next);
    return { affectedBeatIds, activeVersionId: version.id, internalVersion: number, message };
  }

  createBeat(
    draft: BeatDraft,
    afterBeatId: string | null,
    expectedVersion: string,
    actor: Actor = "human",
    requestedId?: string,
  ): CommandResult & { createdBeatId: string } {
    this.assertExpectedVersion(expectedVersion);
    const beats = getActiveBeats(this.state);
    if (beats.length >= MAX_BEATS) throw new Error(`The storyboard is limited to ${MAX_BEATS} beats.`);
    const valid = validateDraft(draft);
    const insertIndex = afterBeatId === null ? 0 : beats.findIndex((beat) => beat.id === afterBeatId) + 1;
    if (afterBeatId !== null && insertIndex === 0) throw new Error(`Unknown beat ID: ${afterBeatId}`);
    const beatId = requestedId ? safeText(requestedId, "Beat ID", 100) : makeId("beat");
    if (!/^[a-z0-9][a-z0-9-]*$/.test(beatId)) throw new Error("Beat ID may contain lowercase letters, numbers, and hyphens only.");
    if (beats.some((beat) => beat.id === beatId)) throw new Error(`Beat ID already exists: ${beatId}`);
    const created: StoryBeat = { ...valid, id: beatId, order: insertIndex + 1 };
    const nextBeats = [...beats];
    nextBeats.splice(insertIndex, 0, created);
    return {
      ...this.commitVersion(nextBeats, actor, "create_beat", `Created “${created.title}”`, [created.id]),
      createdBeatId: created.id,
    };
  }

  replaceBeat(beatId: string, draft: BeatDraft, expectedVersion: string, actor: Actor = "human") {
    this.assertExpectedVersion(expectedVersion);
    const beats = getActiveBeats(this.state);
    const index = beats.findIndex((beat) => beat.id === beatId);
    if (index < 0) throw new Error(`Unknown beat ID: ${beatId}`);
    const valid = validateDraft(draft);
    const previousTitle = beats[index].title;
    beats[index] = { ...valid, id: beatId, order: beats[index].order };
    return {
      ...this.commitVersion(beats, actor, "replace_beat", `Edited beat ${beats[index].order}: “${valid.title}”`, [beatId]),
      previousTitle,
      newTitle: valid.title,
    };
  }

  applyRevision(
    changes: RevisionCommandChange[],
    expectedVersion: string,
    summary: string,
    actor: Actor = "agent",
  ) {
    this.assertExpectedVersion(expectedVersion);
    if (changes.length < 1 || changes.length > MAX_BEATS) throw new Error("A revision must change 1 to 6 beats.");
    const beats = getActiveBeats(this.state);
    const indexes = new Map(beats.map((beat, index) => [beat.id, index]));
    const seen = new Set<string>();
    const affectedBeatIds: string[] = [];
    for (const change of changes) {
      if (seen.has(change.beatId)) throw new Error(`Beat ${change.beatId} appears more than once in this revision.`);
      seen.add(change.beatId);
      const index = indexes.get(change.beatId);
      if (index === undefined) throw new Error(`Unknown beat ID: ${change.beatId}`);
      const valid = validateDraft(change.draft);
      const current = beats[index];
      const material = current.title !== valid.title || current.action !== valid.action || current.line !== valid.line ||
        current.narrativeRole !== valid.narrativeRole || current.intendedEmotion !== valid.intendedEmotion || current.artKey !== valid.artKey;
      if (!material) throw new Error(`The proposed revision does not change “${current.title}”.`);
      beats[index] = { ...valid, id: current.id, order: current.order };
      affectedBeatIds.push(current.id);
    }
    const reason = safeText(summary, "Revision summary", 500);
    return this.commitVersion(beats, actor, "replace_beat", reason, affectedBeatIds);
  }

  moveBeat(beatId: string, afterBeatId: string | null, expectedVersion: string, actor: Actor = "human") {
    this.assertExpectedVersion(expectedVersion);
    if (beatId === afterBeatId) throw new Error("A beat cannot be moved after itself.");
    const beats = getActiveBeats(this.state);
    const sourceIndex = beats.findIndex((beat) => beat.id === beatId);
    if (sourceIndex < 0) throw new Error(`Unknown beat ID: ${beatId}`);
    const [moved] = beats.splice(sourceIndex, 1);
    const insertIndex = afterBeatId === null ? 0 : beats.findIndex((beat) => beat.id === afterBeatId) + 1;
    if (afterBeatId !== null && insertIndex === 0) throw new Error(`Unknown beat ID: ${afterBeatId}`);
    beats.splice(insertIndex, 0, moved);
    const normalized = normalizeBeats(beats);
    const newOrder = normalized.find((beat) => beat.id === beatId)?.order ?? 1;
    return { ...this.commitVersion(normalized, actor, "move_beat", `Moved “${moved.title}” to beat ${newOrder}`, [beatId]), newOrder };
  }

  deleteBeat(beatId: string, expectedVersion: string, actor: Actor = "human") {
    this.assertExpectedVersion(expectedVersion);
    const beats = getActiveBeats(this.state);
    const index = beats.findIndex((beat) => beat.id === beatId);
    if (index < 0) throw new Error(`Unknown beat ID: ${beatId}`);
    const [deleted] = beats.splice(index, 1);
    return this.commitVersion(beats, actor, "delete_beat", `Deleted beat ${deleted.order}: “${deleted.title}”`, [beatId]);
  }

  undoLastMutation(actor: Actor = "human"): CommandResult | null {
    const latest = this.state.activity.find((entry) => ["create_beat", "replace_beat", "move_beat", "delete_beat"].includes(entry.action));
    if (!latest) return null;
    const before = this.state.versions.find((version) => version.id === latest.beforeVersionId);
    if (!before) return null;
    return this.commitVersion(before.beats, actor, "undo", `Undid: ${latest.message}`, latest.affectedBeatIds);
  }

  restoreVersion(versionId: string, expectedVersion: string, actor: Actor = "human"): CommandResult {
    this.assertExpectedVersion(expectedVersion);
    const target = this.state.versions.find((version) => version.id === versionId);
    if (!target) throw new Error("That previous version is no longer available.");
    if (target.id === this.state.activeVersionId) throw new Error("That version is already active.");
    return this.commitVersion(
      target.beats,
      actor,
      "restore_version",
      "Restored a previous story version",
      target.beats.map((beat) => beat.id),
    );
  }

  saveAIPreview(draft: PreviewDraft, expectedVersion: string, actor: Actor = "agent") {
    this.assertExpectedVersion(expectedVersion);
    const summary = safeText(draft.summary, "Summary", 500);
    if (draft.targetMatch && !["strong", "partial", "weak", "missed", "unclear"].includes(draft.targetMatch)) {
      throw new Error("Unknown target match value.");
    }
    if (draft.confidence && !["low", "medium", "high"].includes(draft.confidence)) {
      throw new Error("Unknown preview confidence value.");
    }
    if (draft.perspectives.length < 2 || draft.perspectives.length > AI_PERSONAS.length) throw new Error("Include 2 to 6 viewer perspectives.");
    const seen = new Set<string>();
    const perspectives = draft.perspectives.map((perspective) => {
      if (!AI_PERSONAS.includes(perspective.persona)) throw new Error("Unknown preview perspective.");
      if (seen.has(perspective.persona)) throw new Error("Preview perspectives must be unique.");
      seen.add(perspective.persona);
      return {
        persona: perspective.persona,
        likelyResponse: safeText(perspective.likelyResponse, "Likely response", 240),
        watchFor: safeText(perspective.watchFor, "Watch-for", 240),
      };
    });
    if (draft.disagreements.length < 1 || draft.disagreements.length > 4) throw new Error("Include 1 to 4 useful disagreements.");
    const preview: AIPreview = {
      id: makeId("preview"),
      storyVersionId: expectedVersion,
      createdAt: now(),
      summary,
      perspectives,
      disagreements: draft.disagreements.map((item) => safeText(item, "Disagreement", 240)),
      likelyEmotionalLanding: draft.likelyEmotionalLanding
        ? safeText(draft.likelyEmotionalLanding, "Likely emotional landing", 240)
        : undefined,
      targetMatch: draft.targetMatch,
      whatLanded: draft.whatLanded ? safeText(draft.whatLanded, "What landed", 300) : undefined,
      whereItDrifted: draft.whereItDrifted ? safeText(draft.whereItDrifted, "Where it drifted", 300) : undefined,
      biggestOpportunity: draft.biggestOpportunity ? safeText(draft.biggestOpportunity, "Biggest opportunity", 300) : undefined,
      strongestBeatId: draft.strongestBeatId
        ? safeText(draft.strongestBeatId, "Strongest beat ID", 100)
        : undefined,
      strongestBeatWhy: draft.strongestBeatWhy
        ? safeText(draft.strongestBeatWhy, "Strongest beat reason", 240)
        : undefined,
      weakestBeatId: draft.weakestBeatId
        ? safeText(draft.weakestBeatId, "Weakest beat ID", 100)
        : undefined,
      weakestBeatWhy: draft.weakestBeatWhy
        ? safeText(draft.weakestBeatWhy, "Weakest beat reason", 240)
        : undefined,
      mainRisk: draft.mainRisk ? safeText(draft.mainRisk, "Main risk", 300) : undefined,
      observedArc: draft.observedArc?.slice(0, 6).map((item) => safeText(item, "Observed emotion", 80)),
      changedAudienceBeatId: draft.changedAudienceBeatId
        ? safeText(draft.changedAudienceBeatId, "Audience-changing beat ID", 100)
        : undefined,
      changedAudienceWhy: draft.changedAudienceWhy
        ? safeText(draft.changedAudienceWhy, "Audience-changing reason", 240)
        : undefined,
      confidence: draft.confidence,
      confidenceNote: draft.confidenceNote
        ? safeText(draft.confidenceNote, "Confidence note", 240)
        : undefined,
      investigateNext: draft.investigateNext
        ? safeText(draft.investigateNext, "Area to investigate", 240)
        : undefined,
    };
    if (preview.strongestBeatId && !getActiveBeats(this.state).some((beat) => beat.id === preview.strongestBeatId)) {
      throw new Error(`Unknown strongest beat ID: ${preview.strongestBeatId}`);
    }
    for (const beatId of [preview.weakestBeatId, preview.changedAudienceBeatId].filter(Boolean)) {
      if (!getActiveBeats(this.state).some((beat) => beat.id === beatId)) throw new Error(`Unknown audience result beat ID: ${beatId}`);
    }
    const activity = this.activity("save_ai_preview", "Saved an AI Audience result", actor);
    this.publish({
      ...this.state,
      aiPreviews: [preview, ...this.state.aiPreviews].slice(0, 12),
      activity: [activity, ...this.state.activity].slice(0, 30),
    });
    return { previewId: preview.id, storyVersionId: preview.storyVersionId, perspectiveCount: perspectives.length };
  }

  saveHumanReport(draft: HumanReportDraft, expectedVersion: string, responseIds: string[], actor: Actor = "agent") {
    this.assertExpectedVersion(expectedVersion);
    const reactionSet = this.state.reactionSet;
    if (reactionSet.storyVersionId !== expectedVersion || reactionSet.responses.length === 0) {
      throw new Error("There are no Human Audience responses for this story version.");
    }
    const actualIds = reactionSet.responses.map((response) => response.id).sort();
    const suppliedIds = [...responseIds].sort();
    if (actualIds.length !== suppliedIds.length || actualIds.some((id, index) => id !== suppliedIds[index])) {
      throw new Error("The Human Audience responses changed while Payoff was reading them. Try again.");
    }
    if (!["strong", "partial", "missed", "insufficient"].includes(draft.match)) {
      throw new Error("Unknown audience match value.");
    }
    if (draft.observedArc.length < 1 || draft.observedArc.length > 6) {
      throw new Error("The observed emotional arc must contain 1 to 6 steps.");
    }
    const beatIds = new Set(getActiveBeats(this.state).map((beat) => beat.id));
    for (const beatId of [draft.strongestBeatId, draft.weakestBeatId, draft.changedAudienceBeatId]) {
      if (beatId !== null && !beatIds.has(beatId)) throw new Error(`Unknown Human Audience beat ID: ${beatId}`);
    }
    const report: HumanAudienceReport = {
      id: makeId("human-report"),
      storyVersionId: expectedVersion,
      storyHash: reactionSet.storyHash,
      createdAt: now(),
      responseIds: actualIds,
      summary: safeText(draft.summary, "Summary", 500),
      audienceLanding: safeText(draft.audienceLanding, "Audience landing", 300),
      match: draft.match,
      observedArc: draft.observedArc.map((emotion) => safeText(emotion, "Observed emotion", 100)),
      whatLanded: safeText(draft.whatLanded, "What landed", 300),
      whereItDrifted: safeText(draft.whereItDrifted, "Where it drifted", 300),
      biggestOpportunity: safeText(draft.biggestOpportunity, "Biggest opportunity", 300),
      strongestBeatId: draft.strongestBeatId,
      strongestBeatWhy: safeText(draft.strongestBeatWhy, "Strongest beat reason", 300),
      weakestBeatId: draft.weakestBeatId,
      weakestBeatWhy: safeText(draft.weakestBeatWhy, "Weakest beat reason", 300),
      mainRisk: safeText(draft.mainRisk, "Main risk", 400),
      changedAudienceBeatId: draft.changedAudienceBeatId,
      changedAudienceWhy: safeText(draft.changedAudienceWhy, "Audience-changing reason", 300),
    };
    const activity = this.activity("save_human_report", "Made sense of the Human Audience responses", actor);
    this.publish({
      ...this.state,
      humanReports: [report, ...this.state.humanReports.filter((candidate) =>
        candidate.storyVersionId !== expectedVersion || candidate.storyHash !== reactionSet.storyHash,
      )].slice(0, 12),
      activity: [activity, ...this.state.activity].slice(0, 30),
    });
    return { reportId: report.id, storyVersionId: report.storyVersionId, audienceSize: actualIds.length };
  }

  openTesting() {
    if (getActiveBeats(this.state).length !== 6) throw new Error("Complete all six story beats before testing the payoff.");
    if (this.state.workflow.stage === "test") return;
    this.publish({
      ...this.state,
      workflow: { ...this.state.workflow, stage: "test" },
    });
  }

  closeTesting() {
    if (this.state.workflow.stage !== "test") return;
    this.publish({
      ...this.state,
      workflow: { ...this.state.workflow, stage: "storyboard" },
    });
  }

  prepareHumanTest(): StudyStimulus {
    const beats = getActiveBeats(this.state);
    if (beats.length !== 6) throw new Error("Human Audience testing requires a complete six-beat storyboard.");
    const storyHash = storyContentHash(this.state.project.id, this.state.activeVersionId, beats);
    const stimulus: StudyStimulus = {
      schema: "payoff-study/v1",
      projectId: this.state.project.id,
      title: this.state.project.title,
      format: this.state.project.format,
      storyVersionId: this.state.activeVersionId,
      storyHash,
      beats: studyBeatsWithoutTarget(beats),
    };
    const sameTest = this.state.reactionSet.storyVersionId === stimulus.storyVersionId && this.state.reactionSet.storyHash === storyHash;
    const reactionSet = sameTest ? this.state.reactionSet : {
      id: `${this.state.project.id}-study-${this.state.activeVersionId}`,
      storyVersionId: stimulus.storyVersionId,
      storyHash,
      collectedAt: null,
      method: "Target-blind uninterrupted first viewing, immediate post-view questionnaire, optional labeled second pass.",
      responses: [],
    };
    const activity = this.activity("prepare_human_test", "Prepared a target-blind Human Audience test");
    const reactionHistory = !sameTest && this.state.reactionSet.responses.length > 0
      ? [structuredClone(this.state.reactionSet), ...this.state.reactionHistory].slice(0, 8)
      : this.state.reactionHistory;
    this.publish({
      ...this.state,
      workflow: { ...this.state.workflow, stage: "test" },
      testedVersionId: stimulus.storyVersionId,
      humanTest: stimulus,
      reactionSet,
      reactionHistory,
      activity: [activity, ...this.state.activity].slice(0, 30),
    });
    return stimulus;
  }

  resetDemo() {
    this.publish(createSeedWorkspace());
  }

  importStudyResponses(values: unknown[]): ImportResult {
    const existing = new Set(this.state.reactionSet.responses.map((response) => response.id));
    const accepted: AudienceReaction[] = [];
    let duplicates = 0;
    let rejected = 0;
    for (const value of values) {
      const response = parseStudyExport(value, this.state);
      if (!response) rejected += 1;
      else if (existing.has(response.id)) duplicates += 1;
      else { existing.add(response.id); accepted.push(response); }
    }
    if (accepted.length > 0) {
      const importedAt = now();
      const activity = this.activity("import_reactions", `Imported ${accepted.length} valid human ${accepted.length === 1 ? "response" : "responses"}`);
      this.publish({
        ...this.state,
        reactionSet: { ...this.state.reactionSet, collectedAt: importedAt, responses: [...this.state.reactionSet.responses, ...accepted] },
        humanReports: this.state.humanReports.filter((report) =>
          report.storyVersionId !== this.state.reactionSet.storyVersionId || report.storyHash !== this.state.reactionSet.storyHash,
        ),
        activity: [activity, ...this.state.activity].slice(0, 30),
      });
    }
    return { accepted: accepted.length, duplicates, rejected };
  }
}

export const payoffStore = new PayoffStore();
