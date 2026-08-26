import { BASELINE_CONTENT_HASH, BASELINE_VERSION_ID, createSeedWorkspace } from "./seed";
import { getActiveBeats, getActiveVersion } from "./selectors";
import type {
  ActivityEntry,
  Actor,
  AudienceReaction,
  BeatDraft,
  StoryBeat,
  StoryVersion,
  StudyResponseExport,
  Workspace,
} from "./types";
import { ART_KEYS, NARRATIVE_ROLES, REACTION_EMOTIONS } from "./types";

const STORAGE_KEY = "payoff.workspace.v1";
const MAX_BEATS = 8;

type Listener = () => void;
type StoreOptions = { persist?: boolean; initialState?: Workspace };

export type ImportResult = {
  accepted: number;
  duplicates: number;
  rejected: number;
};

export type CommandResult = {
  affectedBeatIds: string[];
  activeVersionId: string;
  internalVersion: number;
  message: string;
};

function now() {
  return new Date().toISOString();
}

function makeId(prefix: string) {
  const suffix = typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID()
    : `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  return `${prefix}-${suffix}`;
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
    intendedEmotion: safeText(input.intendedEmotion, "Intended emotion", 32),
    narrativeRole: input.narrativeRole,
    artKey: input.artKey,
  };
}

function isReaction(value: unknown): value is AudienceReaction {
  if (!value || typeof value !== "object") return false;
  const item = value as Partial<AudienceReaction>;
  return Boolean(
    typeof item.id === "string" &&
      item.id.length <= 100 &&
      item.storyVersionId === BASELINE_VERSION_ID &&
      item.storyHash === BASELINE_CONTENT_HASH &&
      typeof item.submittedAt === "string" &&
      REACTION_EMOTIONS.includes(item.endingEmotion as (typeof REACTION_EMOTIONS)[number]) &&
      typeof item.interpretation === "string" &&
      item.interpretation.trim().length > 0 &&
      item.interpretation.length <= 800 &&
      typeof item.wasSurprised === "boolean" &&
      typeof item.predictionPoint === "string" &&
      /^not_predicted$|^before_story$|^beat_[1-6]$/.test(item.predictionPoint) &&
      /^beat-[1-6]$/.test(item.changedBeatId ?? "") &&
      typeof item.changedWhy === "string" &&
      item.changedWhy.trim().length > 0 &&
      item.changedWhy.length <= 800 &&
      typeof item.quoteConsent === "boolean"
  );
}

function parseStudyExport(value: unknown): AudienceReaction | null {
  if (!value || typeof value !== "object") return null;
  const item = value as Partial<StudyResponseExport>;
  if (item.schema !== "payoff-study-response/v1") return null;
  if (
    item.study?.projectId !== "nothing-urgent" ||
    item.study.storyVersionId !== BASELINE_VERSION_ID ||
    item.study.storyHash !== BASELINE_CONTENT_HASH ||
    item.study.targetWasHidden !== true ||
    item.study.firstViewingWasUninterrupted !== true
  ) return null;
  return isReaction(item.response) ? structuredClone(item.response) : null;
}

function loadWorkspace(): Workspace {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return createSeedWorkspace();
    const parsed = JSON.parse(raw) as Workspace;
    if (
      parsed.schemaVersion !== 1 ||
      parsed.testedVersionId !== BASELINE_VERSION_ID ||
      parsed.reactionSet?.storyHash !== BASELINE_CONTENT_HASH ||
      !Array.isArray(parsed.versions) ||
      !Array.isArray(parsed.reactionSet.responses)
    ) return createSeedWorkspace();
    return parsed;
  } catch {
    return createSeedWorkspace();
  }
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
    if (this.persist && typeof localStorage !== "undefined") {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    }
    this.listeners.forEach((listener) => listener());
  }

  private assertExpectedVersion(expectedVersion: string) {
    if (expectedVersion !== this.state.activeVersionId) {
      throw new Error(
        `Stale story version. Expected ${this.state.activeVersionId}; received ${expectedVersion}. Read the board again before editing.`,
      );
    }
  }

  private commitVersion(
    beats: StoryBeat[],
    actor: Actor,
    action: "create_beat" | "replace_beat" | "move_beat" | "undo",
    message: string,
    affectedBeatIds: string[],
  ): CommandResult {
    const previous = getActiveVersion(this.state);
    const number = this.state.revisionSequence + 1;
    const version: StoryVersion = {
      id: `nothing-urgent-r${number}`,
      number,
      parentVersionId: previous.id,
      createdAt: now(),
      source: actor,
      reason: message,
      beats: normalizeBeats(structuredClone(beats)),
    };
    const next: Workspace = {
      ...this.state,
      activeVersionId: version.id,
      revisionSequence: number,
      versions: [...this.state.versions, version],
      activity: [
        {
          id: makeId("activity"),
          at: version.createdAt,
          actor,
          action,
          message,
          affectedBeatIds,
          beforeVersionId: previous.id,
          afterVersionId: version.id,
        },
        ...this.state.activity,
      ].slice(0, 20),
    };
    this.publish(next);
    return { affectedBeatIds, activeVersionId: version.id, internalVersion: number, message };
  }

  createBeat(
    draft: BeatDraft,
    afterBeatId: string | null,
    expectedVersion: string,
    actor: Actor = "human",
  ): CommandResult & { createdBeatId: string } {
    this.assertExpectedVersion(expectedVersion);
    const beats = getActiveBeats(this.state);
    if (beats.length >= MAX_BEATS) throw new Error(`The storyboard is limited to ${MAX_BEATS} beats.`);
    const valid = validateDraft(draft);
    const insertIndex = afterBeatId === null ? 0 : beats.findIndex((beat) => beat.id === afterBeatId) + 1;
    if (afterBeatId !== null && insertIndex === 0) throw new Error(`Unknown beat ID: ${afterBeatId}`);
    const created: StoryBeat = { ...valid, id: makeId("beat"), order: insertIndex + 1 };
    const nextBeats = [...beats];
    nextBeats.splice(insertIndex, 0, created);
    return {
      ...this.commitVersion(nextBeats, actor, "create_beat", `Created “${created.title}”`, [created.id]),
      createdBeatId: created.id,
    };
  }

  replaceBeat(
    beatId: string,
    draft: BeatDraft,
    expectedVersion: string,
    actor: Actor = "human",
  ): CommandResult & { previousTitle: string; newTitle: string } {
    this.assertExpectedVersion(expectedVersion);
    const beats = getActiveBeats(this.state);
    const index = beats.findIndex((beat) => beat.id === beatId);
    if (index < 0) throw new Error(`Unknown beat ID: ${beatId}`);
    const valid = validateDraft(draft);
    const previousTitle = beats[index].title;
    beats[index] = { ...valid, id: beatId, order: beats[index].order };
    return {
      ...this.commitVersion(beats, actor, "replace_beat", `Replaced beat ${beats[index].order}: “${valid.title}”`, [beatId]),
      previousTitle,
      newTitle: valid.title,
    };
  }

  moveBeat(
    beatId: string,
    afterBeatId: string | null,
    expectedVersion: string,
    actor: Actor = "human",
  ): CommandResult & { newOrder: number } {
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
    return {
      ...this.commitVersion(normalized, actor, "move_beat", `Moved “${moved.title}” to beat ${newOrder}`, [beatId]),
      newOrder,
    };
  }

  undoLastMutation(actor: Actor = "human"): CommandResult | null {
    const latest = this.state.activity[0];
    if (!latest || latest.action === "import_reactions" || latest.action === "undo") return null;
    const before = this.state.versions.find((version) => version.id === latest.beforeVersionId);
    if (!before) return null;
    return this.commitVersion(
      before.beats,
      actor,
      "undo",
      `Undid: ${latest.message}`,
      latest.affectedBeatIds,
    );
  }

  resetDemo() {
    const seed = createSeedWorkspace();
    seed.reactionSet = structuredClone(this.state.reactionSet);
    this.publish(seed);
  }

  importStudyResponses(values: unknown[]): ImportResult {
    const existing = new Set(this.state.reactionSet.responses.map((response) => response.id));
    const accepted: AudienceReaction[] = [];
    let duplicates = 0;
    let rejected = 0;

    for (const value of values) {
      const response = parseStudyExport(value);
      if (!response) {
        rejected += 1;
      } else if (existing.has(response.id)) {
        duplicates += 1;
      } else {
        existing.add(response.id);
        accepted.push(response);
      }
    }

    if (accepted.length > 0) {
      const importedAt = now();
      const importActivity: ActivityEntry = {
        id: makeId("activity"),
        at: importedAt,
        actor: "human",
        action: "import_reactions",
        message: `Imported ${accepted.length} valid audience ${accepted.length === 1 ? "response" : "responses"}`,
        affectedBeatIds: [],
        beforeVersionId: this.state.activeVersionId,
        afterVersionId: this.state.activeVersionId,
      };
      this.publish({
        ...this.state,
        reactionSet: {
          ...this.state.reactionSet,
          collectedAt: importedAt,
          responses: [...this.state.reactionSet.responses, ...accepted],
        },
        activity: [
          importActivity,
          ...this.state.activity,
        ].slice(0, 20),
      });
    }

    return { accepted: accepted.length, duplicates, rejected };
  }
}

export const payoffStore = new PayoffStore();
