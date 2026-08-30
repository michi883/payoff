import { z } from "zod";
import { AI_PERSONAS, CANONICAL_ART_KEYS, NARRATIVE_ROLES, REACTION_EMOTIONS } from "../src/domain/types.ts";

const shortText = (max: number) => z.string().trim().min(1).max(max);

export const BeatVisualSchema = z.object({
  setting: shortText(280),
  characters: z.array(z.object({
    id: shortText(80),
    appearance: shortText(260),
    position: shortText(220),
    action: shortText(260),
  }).strict()).max(8),
  focalAction: shortText(320),
  focalObject: shortText(260),
  composition: shortText(360),
  emotionalCue: shortText(220),
  visibleText: z.string().trim().max(80),
  continuityNotes: z.array(shortText(240)).max(6),
}).strict();

export const VisualContinuitySchema = z.object({
  characters: z.array(z.object({ id: shortText(80), appearance: shortText(260) }).strict()).max(8),
  settings: z.array(z.object({ id: shortText(80), appearance: shortText(280) }).strict()).max(6),
  importantProps: z.array(z.object({ id: shortText(80), appearance: shortText(240) }).strict()).max(8),
  timeOfDay: shortText(180).optional(),
  lighting: shortText(240).optional(),
  style: shortText(320),
}).strict().superRefine((continuity, context) => {
  for (const [field, entries] of [["characters", continuity.characters], ["settings", continuity.settings], ["importantProps", continuity.importantProps]] as const) {
    const ids = entries.map((entry) => entry.id.toLowerCase());
    if (new Set(ids).size !== ids.length) context.addIssue({ code: "custom", message: `${field} IDs must be unique.`, path: [field] });
  }
});

export const BeatDraftSchema = z.object({
  title: shortText(48),
  action: shortText(180),
  line: z.string().trim().max(100),
  narrativeRole: z.enum(NARRATIVE_ROLES),
  intendedEmotion: shortText(48),
  visual: BeatVisualSchema,
}).strict();

const BeatArtworkSchema = z.discriminatedUnion("source", [
  z.object({
    source: z.literal("canonical"),
    key: z.enum(CANONICAL_ART_KEYS),
    spec: BeatVisualSchema,
    contentHash: shortText(100),
  }).strict(),
  z.object({
    source: z.literal("generated"),
    spec: BeatVisualSchema,
    contentHash: shortText(100),
  }).strict(),
]);

export const StoryBeatSchema = BeatDraftSchema.omit({ visual: true }).extend({
  id: z.string().trim().min(1).max(100),
  order: z.number().int().min(1).max(6),
  visual: BeatArtworkSchema,
}).strict();

export const EmotionalTargetSchema = z.object({
  natural_language: shortText(160),
  summary: shortText(160),
  setup: shortText(120),
  payoff: shortText(120),
  realization: shortText(240),
  constraints: z.array(shortText(180)).max(4),
}).strict();

function orderedBeatsSchema(exact = false) {
  const schema = exact ? z.array(StoryBeatSchema).length(6) : z.array(StoryBeatSchema).min(1).max(6);
  return schema.superRefine((beats, context) => {
    const ids = new Set<string>();
    beats.forEach((beat, index) => {
      if (beat.order !== index + 1) {
        context.addIssue({ code: "custom", message: "Beats must be supplied in display order.", path: [index, "order"] });
      }
      if (ids.has(beat.id)) context.addIssue({ code: "custom", message: "Beat IDs must be unique.", path: [index, "id"] });
      ids.add(beat.id);
    });
  });
}

export const StoryboardRequestSchema = z.object({
  premise: shortText(220),
  intended_feeling: shortText(160),
  format: shortText(80),
}).strict();

export const StoryboardModelOutputSchema = z.object({
  title: shortText(60),
  target_payoff: shortText(160),
  visual_continuity: VisualContinuitySchema,
  beats: z.array(BeatDraftSchema).length(6),
}).strict();

export const StoryboardQualityReviewSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.object({
    beat_number: z.number().int().min(1).max(6).nullable(),
    code: z.enum(["title", "description", "progression", "redundancy", "payoff", "emotion", "visual_text", "continuity"]),
    problem: shortText(300),
    repair_instruction: shortText(300),
  }).strict()).max(10),
}).strict();

export const StoryboardRepairVerificationSchema = z.object({
  passed: z.boolean(),
  unresolved: z.array(z.object({
    issue_number: z.number().int().min(1).max(20),
    explanation: shortText(300),
  }).strict()).max(10),
}).strict();

const referenceImageDataUrl = z.string().trim().max(2_000_000)
  .regex(/^data:image\/(?:webp|png|jpeg);base64,[a-z0-9+/=]+$/i);

export const SceneContinuityReferenceSchema = z.object({
  content_hash: z.string().trim().regex(/^continuity:[a-f0-9]{8}$/),
  environment_image_data_url: referenceImageDataUrl,
  characters: z.array(z.object({
    id: shortText(80),
    image_data_url: referenceImageDataUrl,
  }).strict()).max(8),
  previous_scene: z.object({
    beat_number: z.number().int().min(1).max(6),
    beat_title: shortText(100),
    image_data_url: referenceImageDataUrl,
  }).strict().optional(),
}).strict().superRefine((reference, context) => {
  const ids = reference.characters.map((character) => character.id.toLowerCase());
  if (new Set(ids).size !== ids.length) {
    context.addIssue({ code: "custom", message: "Continuity reference character IDs must be unique.", path: ["characters"] });
  }
});

export const SceneGenerationRequestSchema = z.object({
  content_hash: z.string().trim().regex(/^scene:[a-f0-9]{8}$/),
  continuity: VisualContinuitySchema,
  beat: BeatDraftSchema,
  context: z.object({
    story_id: shortText(100),
    version_id: shortText(100),
    beat_id: shortText(100),
    beat_number: z.number().int().min(1).max(6),
  }).strict().optional(),
  continuity_reference: SceneContinuityReferenceSchema.optional(),
  force: z.boolean().optional(),
}).strict();

export const SceneQualityReviewSchema = z.object({
  passed: z.boolean(),
  story_core_clear: z.boolean(),
  emotional_purpose_clear: z.boolean(),
  material_failure: z.boolean(),
  required_characters_present: z.boolean(),
  unexpected_character_or_reveal: z.boolean(),
  unexpected_object_or_clue: z.boolean(),
  focal_object_present: z.boolean(),
  focal_action_clear: z.boolean(),
  relationship_clear: z.boolean(),
  contradiction: z.boolean(),
  identity_consistent: z.boolean(),
  wardrobe_consistent: z.boolean(),
  setting_consistent: z.boolean(),
  room_layout_consistent: z.boolean(),
  lighting_consistent: z.boolean(),
  prop_continuity_consistent: z.boolean(),
  continuity_consistent: z.boolean(),
  clarification: z.string().trim().max(500),
}).strict();

export const AudienceRequestSchema = z.object({
  source: z.literal("ai"),
  title: shortText(60),
  emotional_target: EmotionalTargetSchema,
  beats: orderedBeatsSchema(true),
  expected_version: shortText(100),
}).strict();

const resultBeatSchema = z.object({
  beat_id: shortText(100),
  why: shortText(280),
}).strict();

const audienceReportShape = {
  summary: shortText(500),
  audience_landing: shortText(240),
  observed_arc: z.array(shortText(80)).min(2).max(6),
  what_landed: shortText(300),
  where_it_drifted: shortText(300),
  biggest_opportunity: shortText(300),
  strongest_beat: resultBeatSchema,
  weakest_beat: resultBeatSchema,
  main_risk: shortText(300),
  changed_audience: resultBeatSchema,
};

export const AudienceModelOutputSchema = z.object({
  ...audienceReportShape,
  match: z.enum(["strong", "partial", "missed"]),
  reactions: z.array(z.object({
    persona: z.enum(AI_PERSONAS),
    note: shortText(260),
    evidence: shortText(220),
  }).strict()).min(4).max(6),
  disagreements: z.array(shortText(240)).min(1).max(4),
  confidence: z.object({
    level: z.enum(["low", "medium", "high"]),
    note: shortText(240),
  }).strict(),
}).strict();

export const HumanResponseSchema = z.object({
  id: shortText(100),
  storyVersionId: shortText(100),
  storyHash: shortText(100),
  submittedAt: shortText(80),
  endingEmotion: z.enum(REACTION_EMOTIONS),
  endingEmotionOther: z.string().trim().max(80).optional(),
  interpretation: shortText(800),
  wasSurprised: z.boolean(),
  surpriseDetail: z.string().trim().max(500).optional(),
  predictionPoint: z.union([z.literal("not_predicted"), z.literal("before_story"), z.string().regex(/^beat_[1-6]$/)]),
  changedBeatId: shortText(100),
  changedWhy: shortText(800),
  quoteConsent: z.boolean(),
  secondPass: z.array(z.object({
    beatId: shortText(100),
    emotion: z.enum(REACTION_EMOTIONS),
  }).strict()).max(6).optional(),
}).strict();

export const HumanAudienceRequestSchema = z.object({
  source: z.literal("human"),
  title: shortText(60),
  emotional_target: EmotionalTargetSchema,
  beats: orderedBeatsSchema(true),
  expected_version: shortText(100),
  story_hash: shortText(100),
  responses: z.array(HumanResponseSchema).min(1).max(50),
}).strict().superRefine((input, context) => {
  const beatIds = new Set(input.beats.map((beat) => beat.id));
  const responseIds = new Set<string>();
  input.responses.forEach((response, index) => {
    if (responseIds.has(response.id)) context.addIssue({ code: "custom", message: "Response IDs must be unique.", path: ["responses", index, "id"] });
    responseIds.add(response.id);
    if (response.storyVersionId !== input.expected_version || response.storyHash !== input.story_hash) {
      context.addIssue({ code: "custom", message: "Every response must belong to the supplied story.", path: ["responses", index] });
    }
    if (!beatIds.has(response.changedBeatId) || response.secondPass?.some((item) => !beatIds.has(item.beatId))) {
      context.addIssue({ code: "custom", message: "A response references an unknown story beat.", path: ["responses", index] });
    }
  });
});

export const HumanAudienceModelOutputSchema = z.object({
  ...audienceReportShape,
  match: z.enum(["strong", "partial", "missed", "insufficient"]),
}).strict();

export const ReviseRequestSchema = z.object({
  creator_request: shortText(500),
  story: z.object({
    id: shortText(100),
    title: shortText(60),
    beats: orderedBeatsSchema(true),
  }).strict(),
  emotional_target: EmotionalTargetSchema,
  selected_beat_id: z.string().trim().min(1).max(100).nullable(),
  expected_version: shortText(100),
  testing_context: z.string().trim().min(1).max(1000).nullable(),
}).strict().superRefine((input, context) => {
  if (input.selected_beat_id && !input.story.beats.some((beat) => beat.id === input.selected_beat_id)) {
    context.addIssue({ code: "custom", message: "The selected beat does not exist in this storyboard.", path: ["selected_beat_id"] });
  }
});

export const RevisionModelOutputSchema = z.object({
  kind: z.enum(["revision", "clarification"]),
  summary: shortText(500),
  why: shortText(500).nullable(),
  clarification_question: shortText(300).nullable(),
  changes: z.array(z.object({
    beat_id: shortText(100),
    what_changes: shortText(240),
    replacement: BeatDraftSchema,
  }).strict()).max(6),
}).strict();

export const NormalizedAudienceEvidenceSchema = z.object({
  audience_landing: shortText(300),
  match: z.enum(["strong", "partial", "missed", "insufficient"]),
  observed_arc: z.array(shortText(100)).max(6),
  what_landed: shortText(300),
  where_it_drifted: shortText(300),
  biggest_opportunity: shortText(300),
  strongest_beat: z.object({ beat_id: z.string().trim().max(100).nullable(), why: shortText(300) }).strict(),
  weakest_beat: z.object({ beat_id: z.string().trim().max(100).nullable(), why: shortText(300) }).strict(),
  main_risk: shortText(400),
  changed_audience: z.object({ beat_id: z.string().trim().max(100).nullable(), why: shortText(300) }).strict(),
  reaction_notes: z.array(shortText(500)).max(8),
  evidence_strength: shortText(300),
}).strict();

export const DiagnoseRequestSchema = z.object({
  question: shortText(500),
  story: z.object({
    title: shortText(60),
    beats: orderedBeatsSchema(true),
  }).strict(),
  emotional_target: EmotionalTargetSchema,
  audience_source: z.enum(["ai", "human"]),
  audience_result: NormalizedAudienceEvidenceSchema,
  expected_version: shortText(100),
}).strict();

export const DiagnosisModelOutputSchema = z.object({
  answer: shortText(900),
  evidence: z.array(z.object({
    beat_id: z.string().trim().min(1).max(100).nullable(),
    observation: shortText(300),
  }).strict()).min(1).max(4),
}).strict();

/*
 * These schemas are intentionally more generous than the application contracts.
 * Tight JSON Schema maxLength values can make a model stop at the boundary in the
 * middle of a sentence. The provider asks for concise prose, then handlers validate
 * the parsed value against the bounded application schemas above before it reaches
 * the browser.
 */
const structuredText = z.string().trim().min(1);

const StructuredBeatDraftSchema = z.object({
  title: structuredText,
  action: structuredText,
  line: z.string().trim(),
  narrativeRole: z.enum(NARRATIVE_ROLES),
  intendedEmotion: structuredText,
  visual: z.object({
    setting: structuredText,
    characters: z.array(z.object({
      id: structuredText,
      appearance: structuredText,
      position: structuredText,
      action: structuredText,
    }).strict()).max(8),
    focalAction: structuredText,
    focalObject: structuredText,
    composition: structuredText,
    emotionalCue: structuredText,
    visibleText: z.string().trim(),
    continuityNotes: z.array(structuredText).max(6),
  }).strict(),
}).strict();

const StructuredVisualContinuitySchema = z.object({
  characters: z.array(z.object({ id: structuredText, appearance: structuredText }).strict()).max(8),
  settings: z.array(z.object({ id: structuredText, appearance: structuredText }).strict()).max(6),
  importantProps: z.array(z.object({ id: structuredText, appearance: structuredText }).strict()).max(8),
  timeOfDay: structuredText,
  lighting: structuredText,
  style: structuredText,
}).strict();

export const StoryboardStructuredOutputSchema = z.object({
  title: structuredText,
  target_payoff: structuredText,
  visual_continuity: StructuredVisualContinuitySchema,
  beats: z.array(StructuredBeatDraftSchema).length(6),
}).strict();

export const StoryboardQualityStructuredOutputSchema = z.object({
  passed: z.boolean(),
  issues: z.array(z.object({
    beat_number: z.number().int().min(1).max(6).nullable(),
    code: z.enum(["title", "description", "progression", "redundancy", "payoff", "emotion", "visual_text", "continuity"]),
    problem: structuredText,
    repair_instruction: structuredText,
  }).strict()).max(10),
}).strict();

export const StoryboardRepairVerificationStructuredOutputSchema = z.object({
  passed: z.boolean(),
  unresolved: z.array(z.object({
    issue_number: z.number().int().min(1).max(20),
    explanation: structuredText,
  }).strict()).max(10),
}).strict();

export const SceneQualityStructuredOutputSchema = z.object({
  passed: z.boolean(),
  story_core_clear: z.boolean(),
  emotional_purpose_clear: z.boolean(),
  material_failure: z.boolean(),
  required_characters_present: z.boolean(),
  unexpected_character_or_reveal: z.boolean(),
  unexpected_object_or_clue: z.boolean(),
  focal_object_present: z.boolean(),
  focal_action_clear: z.boolean(),
  relationship_clear: z.boolean(),
  contradiction: z.boolean(),
  identity_consistent: z.boolean(),
  wardrobe_consistent: z.boolean(),
  setting_consistent: z.boolean(),
  room_layout_consistent: z.boolean(),
  lighting_consistent: z.boolean(),
  prop_continuity_consistent: z.boolean(),
  continuity_consistent: z.boolean(),
  clarification: z.string().trim(),
}).strict();

const structuredResultBeat = z.object({
  beat_id: structuredText,
  why: structuredText,
}).strict();

const structuredAudienceReportShape = {
  summary: structuredText,
  audience_landing: structuredText,
  observed_arc: z.array(structuredText).min(2).max(6),
  what_landed: structuredText,
  where_it_drifted: structuredText,
  biggest_opportunity: structuredText,
  strongest_beat: structuredResultBeat,
  weakest_beat: structuredResultBeat,
  main_risk: structuredText,
  changed_audience: structuredResultBeat,
};

export const AudienceStructuredOutputSchema = z.object({
  ...structuredAudienceReportShape,
  match: z.enum(["strong", "partial", "missed"]),
  reactions: z.array(z.object({
    persona: z.enum(AI_PERSONAS),
    note: structuredText,
    evidence: structuredText,
  }).strict()).length(6),
  disagreements: z.array(structuredText).min(1).max(4),
  confidence: z.object({
    level: z.enum(["low", "medium", "high"]),
    note: structuredText,
  }).strict(),
}).strict();

export const HumanAudienceStructuredOutputSchema = z.object({
  ...structuredAudienceReportShape,
  match: z.enum(["strong", "partial", "missed", "insufficient"]),
}).strict();

export const RevisionStructuredOutputSchema = z.object({
  kind: z.enum(["revision", "clarification"]),
  summary: structuredText.nullable(),
  why: structuredText.nullable(),
  clarification_question: structuredText.nullable(),
  changes: z.array(z.object({
    beat_id: structuredText,
    what_changes: structuredText.nullable(),
    title: structuredText.nullable(),
    action: structuredText.nullable(),
    line: z.string().nullable(),
    narrative_role: z.enum(NARRATIVE_ROLES).nullable(),
    intended_emotion: structuredText.nullable(),
    visual_direction: z.object({
      setting: structuredText.nullable(),
      character_updates: z.array(z.object({
        id: structuredText,
        position: structuredText.nullable(),
        action: structuredText.nullable(),
      }).strict()).max(8),
      focal_action: structuredText.nullable(),
      focal_object: structuredText.nullable(),
      composition: structuredText.nullable(),
      emotional_cue: structuredText.nullable(),
      visible_text: z.string().nullable(),
      continuity_notes: z.array(structuredText).max(4),
    }).strict().nullable(),
  }).strict()).max(6),
}).strict();

export const DiagnosisStructuredOutputSchema = z.object({
  answer: structuredText,
  evidence: z.array(z.object({
    beat_id: structuredText.nullable(),
    observation: structuredText,
  }).strict()).min(1).max(4),
}).strict();

export type StoryboardRequest = z.infer<typeof StoryboardRequestSchema>;
export type StoryboardModelOutput = z.infer<typeof StoryboardModelOutputSchema>;
export type StoryboardQualityReview = z.infer<typeof StoryboardQualityReviewSchema>;
export type StoryboardRepairVerification = z.infer<typeof StoryboardRepairVerificationSchema>;
export type SceneContinuityReference = z.infer<typeof SceneContinuityReferenceSchema>;
export type SceneGenerationRequest = z.infer<typeof SceneGenerationRequestSchema>;
export type SceneQualityReview = z.infer<typeof SceneQualityReviewSchema>;
export type AudienceRequest = z.infer<typeof AudienceRequestSchema>;
export type AudienceModelOutput = z.infer<typeof AudienceModelOutputSchema>;
export type HumanAudienceRequest = z.infer<typeof HumanAudienceRequestSchema>;
export type HumanAudienceModelOutput = z.infer<typeof HumanAudienceModelOutputSchema>;
export type ReviseRequest = z.infer<typeof ReviseRequestSchema>;
export type RevisionModelOutput = z.infer<typeof RevisionModelOutputSchema>;
export type RevisionStructuredOutput = z.infer<typeof RevisionStructuredOutputSchema>;
export type DiagnoseRequest = z.infer<typeof DiagnoseRequestSchema>;
export type DiagnosisModelOutput = z.infer<typeof DiagnosisModelOutputSchema>;
