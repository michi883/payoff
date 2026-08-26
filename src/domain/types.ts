export const ART_KEYS = [
  "emoji_glow",
  "voice_wave",
  "auto_reply",
  "message_streak",
  "empty_chair",
  "funeral_phone",
  "mother_autoreply",
  "two_rooms",
  "phone_closeup",
  "conversation",
  "window_light",
  "clock",
] as const;

export const NARRATIVE_ROLES = ["setup", "escalation", "turn", "payoff"] as const;

export const REACTION_EMOTIONS = [
  "amused",
  "curious",
  "uneasy",
  "sad",
  "surprised",
  "confused",
  "moved",
  "angry",
] as const;

export type ArtKey = (typeof ART_KEYS)[number];
export type NarrativeRole = (typeof NARRATIVE_ROLES)[number];
export type ReactionEmotion = (typeof REACTION_EMOTIONS)[number];
export type Actor = "human" | "agent" | "system";

export type ProjectBrief = {
  id: string;
  title: string;
  topic: string;
  format: string;
  target: {
    setupEmotion: string;
    payoffEmotion: string;
    realization: string;
    constraints: string[];
  };
};

export type StoryBeat = {
  id: string;
  order: number;
  title: string;
  action: string;
  line: string;
  narrativeRole: NarrativeRole;
  intendedEmotion: string;
  artKey: ArtKey;
};

export type StoryVersion = {
  id: string;
  number: number;
  parentVersionId: string | null;
  createdAt: string;
  source: Actor;
  reason: string;
  beats: StoryBeat[];
};

export type BeatReaction = {
  beatId: string;
  emotion: ReactionEmotion;
};

export type AudienceReaction = {
  id: string;
  storyVersionId: string;
  storyHash: string;
  submittedAt: string;
  endingEmotion: ReactionEmotion;
  endingEmotionOther?: string;
  interpretation: string;
  wasSurprised: boolean;
  surpriseDetail?: string;
  predictionPoint: "not_predicted" | "before_story" | `beat_${1 | 2 | 3 | 4 | 5 | 6}`;
  changedBeatId: string;
  changedWhy: string;
  quoteConsent: boolean;
  secondPass?: BeatReaction[];
};

export type ReactionSet = {
  id: string;
  storyVersionId: string;
  storyHash: string;
  collectedAt: string | null;
  method: string;
  responses: AudienceReaction[];
};

export type ActivityEntry = {
  id: string;
  at: string;
  actor: Actor;
  action: "create_beat" | "replace_beat" | "move_beat" | "undo" | "import_reactions";
  message: string;
  affectedBeatIds: string[];
  beforeVersionId: string;
  afterVersionId: string;
};

export type Workspace = {
  schemaVersion: 1;
  project: ProjectBrief;
  activeVersionId: string;
  testedVersionId: string;
  revisionSequence: number;
  versions: StoryVersion[];
  reactionSet: ReactionSet;
  activity: ActivityEntry[];
};

export type BeatDraft = Omit<StoryBeat, "id" | "order">;

export type StudyResponseExport = {
  schema: "payoff-study-response/v1";
  study: {
    projectId: string;
    storyVersionId: string;
    storyHash: string;
    targetWasHidden: true;
    firstViewingWasUninterrupted: true;
  };
  response: AudienceReaction;
};
