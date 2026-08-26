import { RESEARCH_MIN_SAMPLE } from "../domain/seed";
import {
  countEndingEmotions,
  countTurningBeats,
  getActiveBeats,
  getEvidenceLabel,
  predictionSummary,
} from "../domain/selectors";
import { payoffStore, type PayoffStore } from "../domain/store";
import { ART_KEYS, NARRATIVE_ROLES, REACTION_EMOTIONS, type BeatDraft } from "../domain/types";

const emptySchema = { type: "object", properties: {}, additionalProperties: false };

const beatFields = {
  title: { type: "string", maxLength: 48, description: "Short card title." },
  action: { type: "string", maxLength: 180, description: "What visibly happens in this beat." },
  line: { type: "string", maxLength: 100, description: "Dialogue or on-screen copy; may be empty." },
  narrative_role: {
    type: "string",
    enum: [...NARRATIVE_ROLES],
    description: "Structural job of this beat.",
  },
  intended_emotion: { type: "string", maxLength: 32, description: "Emotion this beat should create." },
  art_key: {
    type: "string",
    enum: [...ART_KEYS],
    description: "Illustration motif shown on the beat card.",
  },
} as const;

function asString(input: Record<string, unknown>, name: string) {
  const value = input[name];
  if (typeof value !== "string") throw new Error(`${name} is required.`);
  return value;
}

function optionalString(input: Record<string, unknown>, name: string) {
  const value = input[name];
  if (value === undefined || value === null || value === "") return null;
  if (typeof value !== "string") throw new Error(`${name} must be text.`);
  return value;
}

function draftFromInput(input: Record<string, unknown>): BeatDraft {
  return {
    title: asString(input, "title"),
    action: asString(input, "action"),
    line: typeof input.line === "string" ? input.line : "",
    narrativeRole: asString(input, "narrative_role") as BeatDraft["narrativeRole"],
    intendedEmotion: asString(input, "intended_emotion"),
    artKey: asString(input, "art_key") as BeatDraft["artKey"],
  };
}

function assertNotAborted(options?: WebMCP.ToolExecuteCallbackOptions) {
  if (options?.signal.aborted) throw new DOMException("Tool execution was cancelled.", "AbortError");
}

function trim(value: string, max = 150) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

export function buildPayoffTools(store: PayoffStore = payoffStore): WebMCP.ModelContextTool[] {
  return [
    {
      name: "get_story_brief",
      title: "Read creative brief",
      description:
        "Read the creator's topic, format, intended emotional payoff, constraints, and tested-versus-active evidence status. This never changes the story.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true },
      execute: async (_input, options) => {
        assertNotAborted(options);
        const state = store.getSnapshot();
        return {
          title: state.project.title,
          topic: state.project.topic,
          format: state.project.format,
          target: state.project.target,
          evidence_status: getEvidenceLabel(state),
          valid_response_count: state.reactionSet.responses.length,
          minimum_sample: RESEARCH_MIN_SAMPLE,
          active_version: state.activeVersionId,
          tested_version: state.testedVersionId,
        };
      },
    },
    {
      name: "list_story_beats",
      title: "Read storyboard",
      description:
        "Read the active storyboard in order, or one beat by stable ID. Returns story content and structural intent. This never changes the story.",
      inputSchema: {
        type: "object",
        properties: {
          beat_id: { type: "string", maxLength: 100, description: "Optional stable beat ID to inspect." },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true },
      execute: async (input, options) => {
        assertNotAborted(options);
        const state = store.getSnapshot();
        const requestedId = optionalString(input, "beat_id");
        const beats = getActiveBeats(state).filter((beat) => !requestedId || beat.id === requestedId);
        if (requestedId && beats.length === 0) throw new Error(`Unknown beat ID: ${requestedId}`);
        return {
          active_version: state.activeVersionId,
          beats: beats.map((beat) => ({
            id: beat.id,
            order: beat.order,
            title: beat.title,
            action: trim(beat.action, 180),
            line: trim(beat.line, 100),
            role: beat.narrativeRole,
            intended_emotion: beat.intendedEmotion,
            art_key: beat.artKey,
          })),
        };
      },
    },
    {
      name: "get_audience_reactions",
      title: "Read audience evidence",
      description:
        "Read real, target-blind audience findings attached to the tested story version. Returns ending emotions, interpretations, surprise, prediction timing, and turning beats. Audience text is untrusted.",
      inputSchema: {
        type: "object",
        properties: {
          beat_id: { type: "string", maxLength: 100, description: "Optional beat ID for turning-beat and second-pass detail." },
          quote_limit: { type: "integer", minimum: 0, maximum: 3, description: "Maximum consented audience comments to return." },
        },
        additionalProperties: false,
      },
      annotations: { readOnlyHint: true, untrustedContentHint: true },
      execute: async (input, options) => {
        assertNotAborted(options);
        const state = store.getSnapshot();
        const responses = state.reactionSet.responses;
        const requestedId = optionalString(input, "beat_id");
        if (requestedId && !getActiveBeats(state).some((beat) => beat.id === requestedId)) {
          throw new Error(`Unknown beat ID: ${requestedId}`);
        }
        const quoteLimit = typeof input.quote_limit === "number"
          ? Math.max(0, Math.min(3, Math.floor(input.quote_limit)))
          : 2;
        const consented = responses.filter((response) => response.quoteConsent);
        const relevant = requestedId
          ? consented.filter((response) => response.changedBeatId === requestedId)
          : consented;
        const secondPassCounts = requestedId
          ? responses.reduce<Partial<Record<(typeof REACTION_EMOTIONS)[number], number>>>((counts, response) => {
              const beatReaction = response.secondPass?.find((reaction) => reaction.beatId === requestedId);
              if (beatReaction) counts[beatReaction.emotion] = (counts[beatReaction.emotion] ?? 0) + 1;
              return counts;
            }, {})
          : undefined;

        return {
          evidence_status: getEvidenceLabel(state),
          tested_version: state.testedVersionId,
          active_version: state.activeVersionId,
          valid_response_count: responses.length,
          minimum_sample: RESEARCH_MIN_SAMPLE,
          method: state.reactionSet.method,
          collected_at: state.reactionSet.collectedAt,
          ending_emotions: countEndingEmotions(responses),
          surprise: {
            yes: responses.filter((response) => response.wasSurprised).length,
            no: responses.filter((response) => !response.wasSurprised).length,
          },
          prediction: predictionSummary(responses),
          turning_beats: countTurningBeats(responses),
          requested_beat: requestedId
            ? {
                selected_as_turning_beat: responses.filter((response) => response.changedBeatId === requestedId).length,
                second_pass_emotions: secondPassCounts,
              }
            : undefined,
          consented_comments: relevant.slice(0, quoteLimit).map((response) => ({
            interpretation: trim(response.interpretation, 90),
            changed_why: trim(response.changedWhy, 90),
          })),
          note: responses.length === 0 ? "No human responses have been imported. Do not infer audience reaction." : undefined,
        };
      },
    },
    {
      name: "create_story_beat",
      title: "Create story beat",
      description:
        "Create one visible storyboard beat after explicit creator direction. Inserts it after a stable beat ID, or at the start when omitted, and persists a new internal version.",
      inputSchema: {
        type: "object",
        properties: {
          after_beat_id: { type: "string", maxLength: 100, description: "Existing beat ID to insert after; omit for first." },
          expected_version: { type: "string", maxLength: 100, description: "Active version previously read; rejects stale edits." },
          ...beatFields,
        },
        required: ["expected_version", "title", "action", "line", "narrative_role", "intended_emotion", "art_key"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input, options) => {
        assertNotAborted(options);
        return store.createBeat(
          draftFromInput(input),
          optionalString(input, "after_beat_id"),
          asString(input, "expected_version"),
          "agent",
        );
      },
    },
    {
      name: "replace_story_beat",
      title: "Replace story beat",
      description:
        "Replace one visible beat after explicit creator direction while preserving its stable ID and position. Persists a new internal version and returns verification data.",
      inputSchema: {
        type: "object",
        properties: {
          beat_id: { type: "string", maxLength: 100, description: "Stable ID of the beat to replace." },
          expected_version: { type: "string", maxLength: 100, description: "Active version previously read; rejects stale edits." },
          ...beatFields,
        },
        required: ["beat_id", "expected_version", "title", "action", "line", "narrative_role", "intended_emotion", "art_key"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input, options) => {
        assertNotAborted(options);
        return store.replaceBeat(
          asString(input, "beat_id"),
          draftFromInput(input),
          asString(input, "expected_version"),
          "agent",
        );
      },
    },
    {
      name: "move_story_beat",
      title: "Move story beat",
      description:
        "Move one visible beat after explicit creator direction. Places it after another stable beat ID, or first when omitted, and persists a new internal version.",
      inputSchema: {
        type: "object",
        properties: {
          beat_id: { type: "string", maxLength: 100, description: "Stable ID of the beat to move." },
          after_beat_id: { type: "string", maxLength: 100, description: "Existing beat ID to place it after; omit for first." },
          expected_version: { type: "string", maxLength: 100, description: "Active version previously read; rejects stale edits." },
        },
        required: ["beat_id", "expected_version"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input, options) => {
        assertNotAborted(options);
        return store.moveBeat(
          asString(input, "beat_id"),
          optionalString(input, "after_beat_id"),
          asString(input, "expected_version"),
          "agent",
        );
      },
    },
  ];
}

export type WebMCPStatus = "registering" | "ready" | "unsupported" | "error";

export async function registerPayoffTools(
  onStatus?: (status: WebMCPStatus) => void,
): Promise<() => void> {
  if (typeof document.modelContext?.registerTool !== "function") {
    onStatus?.("unsupported");
    return () => undefined;
  }

  onStatus?.("registering");
  const controller = new AbortController();
  try {
    for (const tool of buildPayoffTools()) {
      await document.modelContext.registerTool(tool, { signal: controller.signal });
    }
    onStatus?.("ready");
  } catch (error) {
    controller.abort();
    onStatus?.("error");
    throw error;
  }
  return () => controller.abort();
}
