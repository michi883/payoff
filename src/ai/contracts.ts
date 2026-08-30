import type { AIPersona, AudienceReaction, BeatDraft, StoryBeat, VisualContinuity } from "../domain/types";

export const AI_AUDIENCE_LABEL = "AI-simulated audience" as const;
export const AI_AUDIENCE_NOTICE = "Useful as an early check. Not human evidence." as const;

export type EmotionalTargetInput = {
  natural_language: string;
  summary: string;
  setup: string;
  payoff: string;
  realization: string;
  constraints: string[];
};

export type StoryboardApiRequest = {
  premise: string;
  intended_feeling: string;
  format: string;
};

export type StoryboardApiResponse = {
  title: string;
  target_payoff: string;
  visual_continuity: VisualContinuity;
  beats: BeatDraft[];
};

export type SceneApiRequest = {
  content_hash: string;
  continuity: VisualContinuity;
  beat: BeatDraft;
  context?: {
    story_id: string;
    version_id: string;
    beat_id: string;
    beat_number: number;
  };
  continuity_reference?: SceneContinuityReference;
  force?: boolean;
};

export type SceneContinuityReference = {
  content_hash: string;
  environment_image_data_url: string;
  characters: Array<{ id: string; image_data_url: string }>;
  previous_scene?: {
    beat_number: number;
    beat_title: string;
    image_data_url: string;
  };
};

export type SceneApiResponse = {
  content_hash: string;
  image_data_url: string;
  continuity_reference: SceneContinuityReference;
};

export type AudienceApiRequest = {
  source: "ai";
  title: string;
  emotional_target: EmotionalTargetInput;
  beats: StoryBeat[];
  expected_version: string;
};

export type AudienceMatch = "strong" | "partial" | "missed";
export type AudienceConfidence = "low" | "medium" | "high";

export type AudienceReportFields<TMatch extends string = AudienceMatch> = {
  summary: string;
  audience_landing: string;
  match: TMatch;
  observed_arc: string[];
  what_landed: string;
  where_it_drifted: string;
  biggest_opportunity: string;
  strongest_beat: { beat_id: string; why: string };
  weakest_beat: { beat_id: string; why: string };
  main_risk: string;
  changed_audience: { beat_id: string; why: string };
};

export type AudienceApiResponse = AudienceReportFields & {
  source: "ai";
  label: typeof AI_AUDIENCE_LABEL;
  notice: typeof AI_AUDIENCE_NOTICE;
  story_version: string;
  reactions: Array<{
    persona: AIPersona;
    note: string;
    evidence: string;
  }>;
  disagreements: string[];
  confidence: { level: AudienceConfidence; note: string };
};

export type HumanAudienceApiRequest = {
  source: "human";
  title: string;
  emotional_target: EmotionalTargetInput;
  beats: StoryBeat[];
  expected_version: string;
  story_hash: string;
  responses: AudienceReaction[];
};

export type HumanAudienceApiResponse = AudienceReportFields<AudienceMatch | "insufficient"> & {
  source: "human";
  story_version: string;
  story_hash: string;
  response_ids: string[];
};

export type ReviseApiRequest = {
  creator_request: string;
  story: { id: string; title: string; beats: StoryBeat[] };
  emotional_target: EmotionalTargetInput;
  selected_beat_id: string | null;
  expected_version: string;
  testing_context: string | null;
};

export type RevisionChange = {
  beat_id: string;
  what_changes: string;
  replacement: BeatDraft;
};

export type ReviseApiResponse = {
  story_version: string;
  kind: "revision" | "clarification";
  summary: string;
  why: string | null;
  clarification_question: string | null;
  changes: RevisionChange[];
};

export type NormalizedAudienceEvidence = {
  audience_landing: string;
  match: AudienceMatch | "insufficient";
  observed_arc: string[];
  what_landed: string;
  where_it_drifted: string;
  biggest_opportunity: string;
  strongest_beat: { beat_id: string | null; why: string };
  weakest_beat: { beat_id: string | null; why: string };
  main_risk: string;
  changed_audience: { beat_id: string | null; why: string };
  reaction_notes: string[];
  evidence_strength: string;
};

export type DiagnoseApiRequest = {
  question: string;
  story: { title: string; beats: StoryBeat[] };
  emotional_target: EmotionalTargetInput;
  audience_source: "ai" | "human";
  audience_result: NormalizedAudienceEvidence;
  expected_version: string;
};

export type DiagnoseApiResponse = {
  story_version: string;
  audience_source: "ai" | "human";
  answer: string;
  evidence: Array<{ beat_id: string | null; observation: string }>;
};

export type ApiErrorPayload = {
  error: { code: string; message: string; retryable: boolean };
};
