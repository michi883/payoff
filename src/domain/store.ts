import {
  BASELINE_BEATS,
  BASELINE_CONTENT_HASH,
  BASELINE_VERSION_ID,
  CANONICAL_STUDY,
  LOOKS_GREAT_CONTINUITY,
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
  VisualContinuity,
} from "./types";
import { AI_PERSONAS, NARRATIVE_ROLES, REACTION_EMOTIONS } from "./types";
import { EMPTY_VISUAL_CONTINUITY, generatedArtwork, legacyVisualBrief, sameVisualSpec } from "./visuals";
import { runtimeConfig } from "../runtime";

export const WORKSPACE_STORAGE_KEY = "payoff.workspace.v4";
export const DEMO_WORKSPACE_STORAGE_KEY = "payoff.demo.workspace.v5";
const LEGACY_STORAGE_KEYS = ["payoff.workspace.v3", "payoff.workspace.v2"];
const MAX_BEATS = 6;

type Listener = () => void;
type StoreOptions = { persist?: boolean; initialState?: Workspace; storageKey?: string; resetOnLoad?: boolean };

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

function validateContinuity(input: VisualContinuity): VisualContinuity {
  const validateEntries = (entries: VisualContinuity["characters"], field: string, max: number) => {
    if (!Array.isArray(entries) || entries.length > max) throw new Error(`${field} has too many entries.`);
    const seen = new Set<string>();
    return entries.map((entry) => {
      const id = safeText(entry.id, `${field} ID`, 80);
      const appearance = safeText(entry.appearance, `${field} appearance`, 280);
      if (seen.has(id.toLowerCase())) throw new Error(`${field} IDs must be unique.`);
      seen.add(id.toLowerCase());
      return { id, appearance };
    });
  };
  return {
    characters: validateEntries(input.characters, "Characters", 8),
    settings: validateEntries(input.settings, "Settings", 6),
    importantProps: validateEntries(input.importantProps, "Important props", 8),
    timeOfDay: safeText(input.timeOfDay ?? "Consistent neutral time across the sequence unless a beat explicitly changes it.", "Time of day", 180),
    lighting: safeText(input.lighting ?? "Stable neutral storyboard lighting with no arbitrary color-temperature shift.", "Lighting baseline", 240),
    style: safeText(input.style, "Visual style", 320),
  };
}

function validateVisual(input: BeatDraft["visual"]): BeatDraft["visual"] {
  if (!input || typeof input !== "object") throw new Error("A structured visual brief is required.");
  if (!Array.isArray(input.characters) || input.characters.length > 8) throw new Error("A visual brief may include up to eight characters.");
  if (!Array.isArray(input.continuityNotes) || input.continuityNotes.length > 6) throw new Error("A visual brief may include up to six continuity notes.");
  return {
    setting: safeText(input.setting, "Visual setting", 280),
    characters: input.characters.map((character) => ({
      id: safeText(character.id, "Visual character ID", 80),
      appearance: safeText(character.appearance, "Visual character appearance", 260),
      position: safeText(character.position, "Visual character position", 220),
      action: safeText(character.action, "Visual character action", 260),
    })),
    focalAction: safeText(input.focalAction, "Visual focal action", 320),
    focalObject: safeText(input.focalObject, "Visual focal object", 260),
    composition: safeText(input.composition, "Visual composition", 360),
    emotionalCue: safeText(input.emotionalCue, "Visual emotional cue", 220),
    visibleText: safeText(input.visibleText, "Visible text", 80, true),
    continuityNotes: input.continuityNotes.map((note) => safeText(note, "Continuity note", 240)),
  };
}

function validateDraft(input: BeatDraft): BeatDraft {
  if (!NARRATIVE_ROLES.includes(input.narrativeRole)) throw new Error("Unknown narrative role.");
  return {
    title: safeText(input.title, "Title", 48),
    action: safeText(input.action, "Action", 180),
    line: safeText(input.line, "Line", 100, true),
    intendedEmotion: safeText(input.intendedEmotion, "Intended emotion", 48),
    narrativeRole: input.narrativeRole,
    visual: validateVisual(input.visual),
  };
}

function beatFromDraft(
  draft: BeatDraft,
  id: string,
  order: number,
  continuity: VisualContinuity,
  previous?: StoryBeat,
): StoryBeat {
  const valid = validateDraft(draft);
  for (const character of valid.visual.characters) {
    const established = continuity.characters.find((candidate) => candidate.id.toLowerCase() === character.id.toLowerCase());
    if (!established) throw new Error(`Visual character “${character.id}” is not defined in this story's continuity.`);
    if (established.appearance !== character.appearance) {
      throw new Error(`Visual character “${character.id}” must keep the established appearance.`);
    }
  }
  return {
    ...valid,
    id,
    order,
    visual: previous && sameVisualSpec(previous.visual.spec, valid.visual)
      ? structuredClone(previous.visual)
      : generatedArtwork(valid.visual, continuity),
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

function isCanonicalStory(project: ProjectBrief, beats: StoryBeat[], continuity: VisualContinuity) {
  const normalized = normalizeBeats(beats);
  return project.id === PROJECT_BRIEF.id && normalized.length === BASELINE_BEATS.length && normalized.every((beat, index) => {
    const expected = BASELINE_BEATS[index];
    return beat.id === expected.id && beat.order === expected.order && beat.title === expected.title &&
      beat.action === expected.action && beat.line === expected.line && beat.narrativeRole === expected.narrativeRole &&
      beat.intendedEmotion === expected.intendedEmotion && JSON.stringify(beat.visual) === JSON.stringify(expected.visual) &&
      JSON.stringify(continuity) === JSON.stringify(LOOKS_GREAT_CONTINUITY);
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
    visualContinuity: structuredClone(EMPTY_VISUAL_CONTINUITY),
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
  if (active?.id === BASELINE_VERSION_ID && !isCanonicalStory(workspace.project, active.beats, active.visualContinuity)) {
    return {
      ...workspace,
      versions: workspace.versions.map((version) => version.id === BASELINE_VERSION_ID
        ? { ...version, visualContinuity: structuredClone(LOOKS_GREAT_CONTINUITY), beats: structuredClone(BASELINE_BEATS) }
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

function migrateLegacyBeat(value: unknown, continuity: VisualContinuity): StoryBeat | null {
  if (!value || typeof value !== "object") return null;
  const beat = value as Record<string, unknown>;
  try {
    const title = safeText(beat.title, "Title", 48);
    const action = safeText(beat.action, "Action", 180);
    const line = safeText(beat.line, "Line", 100, true);
    const narrativeRole = beat.narrativeRole;
    if (!NARRATIVE_ROLES.includes(narrativeRole as StoryBeat["narrativeRole"])) return null;
    const intendedEmotion = safeText(beat.intendedEmotion, "Intended emotion", 48);
    const visual = legacyVisualBrief({ title, action, line, intendedEmotion });
    return {
      id: safeText(beat.id, "Beat ID", 100),
      order: typeof beat.order === "number" ? beat.order : 1,
      title,
      action,
      line,
      narrativeRole: narrativeRole as StoryBeat["narrativeRole"],
      intendedEmotion,
      visual: generatedArtwork(visual, continuity),
    };
  } catch {
    return null;
  }
}

function migrateLegacyWorkspace(parsed: Record<string, unknown>): Workspace | null {
  const legacy = parsed as Record<string, unknown> & {
    workflow: { stage: "choose" | "intent" | "define" | "storyboard" | "test"; source: "starter" | "custom" | null };
    versions: Array<Record<string, unknown>>;
  };
  const starter = legacy.workflow.source === "starter";
  const continuity = starter ? LOOKS_GREAT_CONTINUITY : EMPTY_VISUAL_CONTINUITY;
  const versions = legacy.versions.flatMap((version) => {
    const rawBeats = Array.isArray(version.beats) ? version.beats : [];
    const beats = version.id === BASELINE_VERSION_ID && starter
      ? structuredClone(BASELINE_BEATS)
      : rawBeats.map((beat) => migrateLegacyBeat(beat, continuity)).filter((beat): beat is StoryBeat => Boolean(beat));
    if (beats.length !== rawBeats.length) return [];
    return [{ ...version, visualContinuity: structuredClone(continuity), beats } as unknown as StoryVersion];
  });
  if (versions.length !== legacy.versions.length) return null;
  const previousActiveId = String(parsed.activeVersionId ?? "");
  const previousActive = versions.find((version) => version.id === previousActiveId);
  if (!previousActive) return null;
  const nextNumber = Number(parsed.revisionSequence ?? 0) + 1;
  const migratedActive: StoryVersion = {
    ...structuredClone(previousActive),
    id: `${(parsed.project as ProjectBrief).id}-r${nextNumber}`,
    number: nextNumber,
    parentVersionId: previousActive.id,
    createdAt: now(),
    source: "system",
    reason: "Updated storyboard visuals to the scene-specific format",
  };
  return recoverStarterWorkspace({
    ...parsed,
    schemaVersion: 4,
    workflow: {
      stage: legacy.workflow.stage === "choose" || legacy.workflow.stage === "intent" ? "define" : legacy.workflow.stage,
      source: legacy.workflow.source,
    },
    activeVersionId: migratedActive.id,
    revisionSequence: nextNumber,
    versions: [...versions, migratedActive],
    humanReports: Array.isArray(parsed.humanReports) ? parsed.humanReports : [],
  } as unknown as Workspace);
}

function parseWorkspace(raw: string | null): Workspace | null {
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!hasWorkspaceCollections(parsed)) return null;
    if (parsed.schemaVersion === 4) {
      const workspace = {
        ...parsed,
        humanReports: Array.isArray(parsed.humanReports) ? parsed.humanReports : [],
      } as Workspace;
      if (!["define", "storyboard", "test"].includes(workspace.workflow.stage)) return null;
      return recoverStarterWorkspace(workspace);
    }
    if (parsed.schemaVersion !== 2 && parsed.schemaVersion !== 3) return null;
    return migrateLegacyWorkspace(parsed);
  } catch {
    return null;
  }
}

function loadWorkspace(storageKey: string, includeLegacy: boolean): Workspace {
  return parseWorkspace(localStorage.getItem(storageKey))
    ?? (includeLegacy ? LEGACY_STORAGE_KEYS.map((key) => parseWorkspace(localStorage.getItem(key))).find(Boolean) : null)
    ?? createSeedWorkspace();
}

export class PayoffStore {
  private state: Workspace;
  private listeners = new Set<Listener>();
  private persist: boolean;
  private storageKey: string;

  constructor(options: StoreOptions = {}) {
    this.persist = options.persist ?? true;
    this.storageKey = options.storageKey ?? (runtimeConfig.demoMode ? DEMO_WORKSPACE_STORAGE_KEY : WORKSPACE_STORAGE_KEY);
    if (this.persist && options.resetOnLoad && typeof localStorage !== "undefined") localStorage.removeItem(this.storageKey);
    this.state = options.initialState
      ? structuredClone(options.initialState)
      : this.persist && typeof localStorage !== "undefined"
        ? loadWorkspace(this.storageKey, this.storageKey === WORKSPACE_STORAGE_KEY)
        : createSeedWorkspace();
  }

  getSnapshot = () => this.state;

  subscribe = (listener: Listener) => {
    this.listeners.add(listener);
    return () => this.listeners.delete(listener);
  };

  private publish(next: Workspace) {
    this.state = next;
    if (this.persist && typeof localStorage !== "undefined") localStorage.setItem(this.storageKey, JSON.stringify(next));
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
      schemaVersion: 4,
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
    input: { title: string; targetSummary: string; visualContinuity: VisualContinuity; beats: BeatDraft[] },
    expectedVersion: string,
    actor: Actor = "agent",
  ): CommandResult {
    this.assertExpectedVersion(expectedVersion);
    const current = getActiveVersion(this.state);
    if (current.beats.length > 0) throw new Error("This storyboard already has a draft.");
    if (input.beats.length !== MAX_BEATS) throw new Error("A generated storyboard must contain exactly six beats.");
    const title = safeText(input.title, "Story title", 60);
    const targetSummary = safeText(input.targetSummary, "Target payoff", 160);
    const visualContinuity = validateContinuity(input.visualContinuity);
    const beats = input.beats.map((draft, index) => beatFromDraft(
      draft,
      `${this.state.project.id}-beat-${index + 1}`,
      index + 1,
      visualContinuity,
    ));
    const number = this.state.revisionSequence + 1;
    const version: StoryVersion = {
      id: `${this.state.project.id}-r${number}`,
      number,
      parentVersionId: current.id,
      createdAt: now(),
      source: actor,
      reason: "Created the first storyboard draft",
      visualContinuity,
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
    visualContinuity: VisualContinuity = getActiveVersion(this.state).visualContinuity,
  ): CommandResult {
    const previous = getActiveVersion(this.state);
    const number = this.state.revisionSequence + 1;
    const normalized = normalizeBeats(structuredClone(beats));
    const canonical = this.state.workflow.source === "starter" && isCanonicalStory(this.state.project, normalized, visualContinuity);
    const versionId = canonical ? BASELINE_VERSION_ID : `${this.state.project.id}-r${number}`;
    const existing = this.state.versions.find((version) => version.id === versionId);
    const version: StoryVersion = existing ?? {
      id: versionId,
      number,
      parentVersionId: previous.id,
      createdAt: now(),
      source: actor,
      reason: message,
      visualContinuity: structuredClone(visualContinuity),
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
    const created = beatFromDraft(valid, beatId, insertIndex + 1, getActiveVersion(this.state).visualContinuity);
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
    const current = beats[index];
    const previousTitle = current.title;
    const meaningChanged = current.action !== valid.action || current.narrativeRole !== valid.narrativeRole
      || current.intendedEmotion !== valid.intendedEmotion;
    if (meaningChanged && sameVisualSpec(current.visual.spec, valid.visual)) {
      throw new Error("Update the visual direction so it depicts the revised beat.");
    }
    beats[index] = beatFromDraft(valid, beatId, current.order, getActiveVersion(this.state).visualContinuity, current);
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
        current.narrativeRole !== valid.narrativeRole || current.intendedEmotion !== valid.intendedEmotion || !sameVisualSpec(current.visual.spec, valid.visual);
      if (!material) throw new Error(`The proposed revision does not change “${current.title}”.`);
      const meaningChanged = current.action !== valid.action || current.narrativeRole !== valid.narrativeRole
        || current.intendedEmotion !== valid.intendedEmotion;
      if (meaningChanged && sameVisualSpec(current.visual.spec, valid.visual)) {
        throw new Error(`The proposed revision changes “${current.title}” without updating its visual direction.`);
      }
      beats[index] = beatFromDraft(valid, current.id, current.order, getActiveVersion(this.state).visualContinuity, current);
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
    return this.commitVersion(before.beats, actor, "undo", `Undid: ${latest.message}`, latest.affectedBeatIds, before.visualContinuity);
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
      target.visualContinuity,
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
    const visualContinuity = getActiveVersion(this.state).visualContinuity;
    const storyHash = storyContentHash(this.state.project.id, this.state.activeVersionId, beats, visualContinuity);
    const stimulus: StudyStimulus = {
      schema: "payoff-study/v2",
      projectId: this.state.project.id,
      title: this.state.project.title,
      format: this.state.project.format,
      storyVersionId: this.state.activeVersionId,
      storyHash,
      visualContinuity: structuredClone(visualContinuity),
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

  importStudyResponses(values: unknown[], evidenceKind: "human" | "rehearsal" = "human"): ImportResult {
    if (this.state.reactionSet.responses.length > 0 && (this.state.reactionSet.evidenceKind ?? "human") !== evidenceKind) {
      throw new Error("Human and rehearsal responses cannot be mixed in one evidence set.");
    }
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
        reactionSet: { ...this.state.reactionSet, collectedAt: importedAt, evidenceKind, responses: [...this.state.reactionSet.responses, ...accepted] },
        humanReports: this.state.humanReports.filter((report) =>
          report.storyVersionId !== this.state.reactionSet.storyVersionId || report.storyHash !== this.state.reactionSet.storyHash,
        ),
        activity: [activity, ...this.state.activity].slice(0, 30),
      });
    }
    return { accepted: accepted.length, duplicates, rejected };
  }
}

export const payoffStore = new PayoffStore({ resetOnLoad: runtimeConfig.resetDemoWorkspace });
