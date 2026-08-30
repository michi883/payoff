export const CANONICAL_ART_KEYS = [
  "drawing_offer",
  "drawing_again",
  "fridge_gallery",
  "quiet_fridge",
  "phone_dad_drawing",
  "crayon_together",
] as const;

export const NARRATIVE_ROLES = ["setup", "escalation", "turn", "payoff"] as const;

export const REACTION_EMOTIONS = [
  "amused",
  "curious",
  "uneasy",
  "warm",
  "guilty",
  "sad",
  "surprised",
  "confused",
  "moved",
  "angry",
  "sentimental",
] as const;

export const AI_PERSONAS = [
  "impatient_casual",
  "emotionally_sensitive",
  "comedy_oriented",
  "literal_low_context",
  "experienced_storyteller",
  "skeptical_viewer",
] as const;

export type CanonicalArtKey = (typeof CANONICAL_ART_KEYS)[number];
export type NarrativeRole = (typeof NARRATIVE_ROLES)[number];
export type ReactionEmotion = (typeof REACTION_EMOTIONS)[number];
export type AIPersona = (typeof AI_PERSONAS)[number];
export type Actor = "human" | "agent" | "system";

export type ProjectBrief = {
  id: string;
  title: string;
  topic: string;
  format: string;
  /** The creator's original natural-language intent. */
  audienceFeeling?: string;
  /** A concise creator-facing restatement that preserves the original intent. */
  targetSummary?: string;
  target: {
    setupEmotion: string;
    payoffEmotion: string;
    realization: string;
    constraints: string[];
  };
};

export type VisualContinuity = {
  characters: Array<{
    id: string;
    appearance: string;
  }>;
  settings: Array<{
    id: string;
    appearance: string;
  }>;
  importantProps: Array<{
    id: string;
    appearance: string;
  }>;
  /** New storyboards always provide these; optionality preserves saved v4 workspaces created before the fields existed. */
  timeOfDay?: string;
  lighting?: string;
  style: string;
};

export type BeatVisual = {
  setting: string;
  characters: Array<{
    id: string;
    appearance: string;
    position: string;
    action: string;
  }>;
  focalAction: string;
  focalObject: string;
  composition: string;
  emotionalCue: string;
  /** Exact typography is rendered by Payoff, not requested from an image model. */
  visibleText: string;
  continuityNotes: string[];
};

export type BeatArtwork =
  | {
      source: "canonical";
      key: CanonicalArtKey;
      spec: BeatVisual;
      contentHash: string;
    }
  | {
      source: "generated";
      spec: BeatVisual;
      contentHash: string;
    };

export type StoryBeat = {
  id: string;
  order: number;
  title: string;
  action: string;
  line: string;
  narrativeRole: NarrativeRole;
  intendedEmotion: string;
  visual: BeatArtwork;
};

export type StoryVersion = {
  id: string;
  number: number;
  parentVersionId: string | null;
  createdAt: string;
  source: Actor;
  reason: string;
  visualContinuity: VisualContinuity;
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
  /** Absent on older workspaces and treated as genuine imported human evidence. */
  evidenceKind?: "human" | "rehearsal";
  responses: AudienceReaction[];
};

export type AIPreviewPerspective = {
  persona: AIPersona;
  likelyResponse: string;
  watchFor: string;
};

export type AIPreview = {
  id: string;
  storyVersionId: string;
  createdAt: string;
  summary: string;
  perspectives: AIPreviewPerspective[];
  disagreements: string[];
  likelyEmotionalLanding?: string;
  targetMatch?: "strong" | "partial" | "weak" | "missed" | "unclear";
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
  confidence?: "low" | "medium" | "high";
  confidenceNote?: string;
  investigateNext?: string;
};

export type HumanAudienceReport = {
  id: string;
  storyVersionId: string;
  storyHash: string;
  createdAt: string;
  responseIds: string[];
  summary: string;
  audienceLanding: string;
  match: "strong" | "partial" | "missed" | "insufficient";
  observedArc: string[];
  whatLanded: string;
  whereItDrifted: string;
  biggestOpportunity: string;
  strongestBeatId: string | null;
  strongestBeatWhy: string;
  weakestBeatId: string | null;
  weakestBeatWhy: string;
  mainRisk: string;
  changedAudienceBeatId: string | null;
  changedAudienceWhy: string;
};

export type StudyBeat = Omit<StoryBeat, "intendedEmotion">;

export type StudyStimulus = {
  schema: "payoff-study/v2";
  projectId: string;
  title: string;
  format: string;
  storyVersionId: string;
  storyHash: string;
  visualContinuity: VisualContinuity;
  beats: StudyBeat[];
};

export type WorkflowState = {
  stage: "define" | "storyboard" | "test";
  source: "starter" | "custom" | null;
};

export type ActivityEntry = {
  id: string;
  at: string;
  actor: Actor;
  action:
    | "start_project"
    | "generate_storyboard"
    | "create_beat"
    | "replace_beat"
    | "move_beat"
    | "delete_beat"
    | "undo"
    | "restore_version"
    | "save_ai_preview"
    | "save_human_report"
    | "prepare_human_test"
    | "import_reactions";
  message: string;
  affectedBeatIds: string[];
  beforeVersionId: string;
  afterVersionId: string;
};

export type Workspace = {
  schemaVersion: 4;
  workflow: WorkflowState;
  project: ProjectBrief;
  activeVersionId: string;
  testedVersionId: string;
  revisionSequence: number;
  versions: StoryVersion[];
  reactionSet: ReactionSet;
  reactionHistory: ReactionSet[];
  humanTest: StudyStimulus | null;
  aiPreviews: AIPreview[];
  humanReports: HumanAudienceReport[];
  activity: ActivityEntry[];
};

export type BeatDraft = Omit<StoryBeat, "id" | "order" | "visual"> & {
  visual: BeatVisual;
};

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
