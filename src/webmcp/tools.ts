import { RESEARCH_MIN_SAMPLE } from "../domain/seed";
import {
  countEndingEmotions,
  countTurningBeats,
  getActiveBeats,
  getActivePreview,
  getEvidenceLabel,
  predictionSummary,
} from "../domain/selectors";
import { payoffStore, type PayoffStore } from "../domain/store";
import { AI_PERSONAS, NARRATIVE_ROLES, REACTION_EMOTIONS, type AIPersona, type BeatDraft } from "../domain/types";

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
  intended_emotion: { type: "string", maxLength: 48, description: "Emotion this beat should create." },
  visual: {
    type: "object",
    description: "Structured direction for the exact visible scene. A changed meaning requires changed visual direction.",
    properties: {
      setting: { type: "string", maxLength: 280 },
      characters: {
        type: "array",
        maxItems: 8,
        items: {
          type: "object",
          properties: {
            id: { type: "string", maxLength: 80 },
            appearance: { type: "string", maxLength: 260 },
            position: { type: "string", maxLength: 220 },
            action: { type: "string", maxLength: 260 },
          },
          required: ["id", "appearance", "position", "action"],
          additionalProperties: false,
        },
      },
      focal_action: { type: "string", maxLength: 320 },
      focal_object: { type: "string", maxLength: 260 },
      composition: { type: "string", maxLength: 360 },
      emotional_cue: { type: "string", maxLength: 220 },
      visible_text: { type: "string", maxLength: 80 },
      continuity_notes: { type: "array", maxItems: 6, items: { type: "string", maxLength: 240 } },
    },
    required: ["setting", "characters", "focal_action", "focal_object", "composition", "emotional_cue", "visible_text", "continuity_notes"],
    additionalProperties: false,
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
  if (!input.visual || typeof input.visual !== "object" || Array.isArray(input.visual)) throw new Error("visual is required.");
  const visual = input.visual as Record<string, unknown>;
  if (!Array.isArray(visual.characters)) throw new Error("visual.characters is required.");
  if (!Array.isArray(visual.continuity_notes) || !visual.continuity_notes.every((item) => typeof item === "string")) {
    throw new Error("visual.continuity_notes must be an array of text values.");
  }
  return {
    title: asString(input, "title"),
    action: asString(input, "action"),
    line: typeof input.line === "string" ? input.line : "",
    narrativeRole: asString(input, "narrative_role") as BeatDraft["narrativeRole"],
    intendedEmotion: asString(input, "intended_emotion"),
    visual: {
      setting: asString(visual, "setting"),
      characters: visual.characters.map((value) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Each visual character must be an object.");
        const character = value as Record<string, unknown>;
        return {
          id: asString(character, "id"),
          appearance: asString(character, "appearance"),
          position: asString(character, "position"),
          action: asString(character, "action"),
        };
      }),
      focalAction: asString(visual, "focal_action"),
      focalObject: asString(visual, "focal_object"),
      composition: asString(visual, "composition"),
      emotionalCue: asString(visual, "emotional_cue"),
      visibleText: typeof visual.visible_text === "string" ? visual.visible_text : "",
      continuityNotes: visual.continuity_notes as string[],
    },
  };
}

function previewFromInput(input: Record<string, unknown>) {
  if (!Array.isArray(input.perspectives)) throw new Error("perspectives is required.");
  if (!Array.isArray(input.disagreements)) throw new Error("disagreements is required.");
  const observedArc = input.observed_arc;
  if (observedArc !== undefined && (!Array.isArray(observedArc) || !observedArc.every((item) => typeof item === "string"))) {
    throw new Error("observed_arc must be an array of text values.");
  }
  return {
    summary: asString(input, "summary"),
    perspectives: input.perspectives.map((value) => {
      if (!value || typeof value !== "object") throw new Error("Each perspective must be an object.");
      const perspective = value as Record<string, unknown>;
      return {
        persona: asString(perspective, "persona") as AIPersona,
        likelyResponse: asString(perspective, "likely_response"),
        watchFor: asString(perspective, "watch_for"),
      };
    }),
    disagreements: input.disagreements.map((value) => {
      if (typeof value !== "string") throw new Error("Each disagreement must be text.");
      return value;
    }),
    likelyEmotionalLanding: optionalString(input, "audience_landing") ?? undefined,
    targetMatch: (optionalString(input, "target_match") ?? undefined) as "strong" | "partial" | "weak" | "missed" | "unclear" | undefined,
    strongestBeatId: optionalString(input, "strongest_beat_id") ?? undefined,
    strongestBeatWhy: optionalString(input, "strongest_beat_why") ?? undefined,
    weakestBeatId: optionalString(input, "weakest_beat_id") ?? undefined,
    weakestBeatWhy: optionalString(input, "weakest_beat_why") ?? undefined,
    mainRisk: optionalString(input, "main_risk") ?? undefined,
    observedArc: observedArc as string[] | undefined,
    changedAudienceBeatId: optionalString(input, "changed_audience_beat_id") ?? undefined,
    changedAudienceWhy: optionalString(input, "changed_audience_why") ?? undefined,
    confidence: (optionalString(input, "confidence") ?? undefined) as "low" | "medium" | "high" | undefined,
    confidenceNote: optionalString(input, "confidence_note") ?? undefined,
  };
}

function assertNotAborted(options?: WebMCP.ToolExecuteCallbackOptions) {
  if (options?.signal.aborted) throw new DOMException("Tool execution was cancelled.", "AbortError");
}

function trim(value: string, max = 150) {
  return value.length <= max ? value : `${value.slice(0, max - 1)}…`;
}

type ToolErrorCode =
  | "unknown_beat_id"
  | "stale_expected_version"
  | "invalid_replacement_payload"
  | "invalid_tool_payload"
  | "tool_execution_failed";

type ToolErrorResult = {
  content: [{ type: "text"; text: string }];
  isError: true;
  error: {
    code: ToolErrorCode;
    message: string;
  };
};

function toolErrorResult(toolName: string, error: unknown): ToolErrorResult {
  const detail = error instanceof Error ? error.message : String(error);
  const unknownBeat = /^Unknown beat ID:\s*(.+)$/.exec(detail);
  if (unknownBeat) {
    const message = `Unknown beat_id: ${unknownBeat[1]}. Call list_story_beats and use one of its returned beat IDs.`;
    return {
      content: [{ type: "text", text: message }],
      isError: true,
      error: { code: "unknown_beat_id", message },
    };
  }

  const staleVersion = /^Stale story version\. Expected ([^;]+); received ([^.]+)\./.exec(detail);
  if (staleVersion) {
    const message = `Stale expected_version: active version is ${staleVersion[1]}, but received ${staleVersion[2]}. Call get_story_brief or list_story_beats again before editing.`;
    return {
      content: [{ type: "text", text: message }],
      isError: true,
      error: { code: "stale_expected_version", message },
    };
  }

  if (toolName === "replace_story_beat") {
    const message = `Invalid replacement payload: ${detail}`;
    return {
      content: [{ type: "text", text: message }],
      isError: true,
      error: { code: "invalid_replacement_payload", message },
    };
  }

  if (["create_story_beat", "move_story_beat", "save_ai_preview"].includes(toolName)) {
    const message = `Invalid tool payload for ${toolName}: ${detail}`;
    return {
      content: [{ type: "text", text: message }],
      isError: true,
      error: { code: "invalid_tool_payload", message },
    };
  }

  const message = `Tool execution failed in ${toolName}: ${detail}`;
  return {
    content: [{ type: "text", text: message }],
    isError: true,
    error: { code: "tool_execution_failed", message },
  };
}

export type AgentCapability =
  | "webmcp-unavailable"
  | "tools-exposed"
  | "agent-interacted";

export function buildPayoffTools(
  store: PayoffStore = payoffStore,
  onAgentInteraction?: (toolName: string) => void,
): WebMCP.ModelContextTool[] {
  const tools: WebMCP.ModelContextTool[] = [
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
          workflow_stage: state.workflow.stage,
          evidence_priority: "Human Audience evidence outweighs AI Audience simulation; simulation-only conclusions are provisional.",
        };
      },
    },
    {
      name: "list_story_beats",
      title: "Read storyboard",
      description:
        "Read the complete active storyboard in order. Returns stable beat IDs, story content, structural intent, and visual direction. This never changes the story.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true },
      execute: async (_input, options) => {
        assertNotAborted(options);
        const state = store.getSnapshot();
        const beats = getActiveBeats(state);
        return {
          active_version: state.activeVersionId,
          visual_continuity: state.versions.find((version) => version.id === state.activeVersionId)?.visualContinuity,
          beats: beats.map((beat) => ({
            id: beat.id,
            order: beat.order,
            title: beat.title,
            action: trim(beat.action, 180),
            line: trim(beat.line, 100),
            role: beat.narrativeRole,
            intended_emotion: beat.intendedEmotion,
            visual: {
              source: beat.visual.source,
              content_hash: beat.visual.contentHash,
              setting: beat.visual.spec.setting,
              characters: beat.visual.spec.characters,
              focal_action: beat.visual.spec.focalAction,
              focal_object: beat.visual.spec.focalObject,
              composition: beat.visual.spec.composition,
              emotional_cue: beat.visual.spec.emotionalCue,
              visible_text: beat.visual.spec.visibleText,
              continuity_notes: beat.visual.spec.continuityNotes,
            },
          })),
        };
      },
    },
    {
      name: "get_ai_preview",
      title: "Read AI Audience result",
      description:
        "Read the latest browser-agent-simulated perspective preview for the active story version. This is provisional analysis, never human audience evidence, and never changes state.",
      inputSchema: emptySchema,
      annotations: { readOnlyHint: true },
      execute: async (_input, options) => {
        assertNotAborted(options);
        const state = store.getSnapshot();
        const preview = getActivePreview(state);
        return preview ? {
          label: "AI-simulated, not human evidence",
          provisional: true,
          story_version: preview.storyVersionId,
          created_at: preview.createdAt,
          summary: preview.summary,
          likely_emotional_landing: preview.likelyEmotionalLanding,
          target_match: preview.targetMatch,
          strongest_beat: preview.strongestBeatId ? {
            beat_id: preview.strongestBeatId,
            why: preview.strongestBeatWhy,
          } : undefined,
          main_risk: preview.mainRisk,
          weakest_beat: preview.weakestBeatId ? {
            beat_id: preview.weakestBeatId,
            why: preview.weakestBeatWhy,
          } : undefined,
          observed_arc: preview.observedArc,
          changed_audience: preview.changedAudienceBeatId ? {
            beat_id: preview.changedAudienceBeatId,
            why: preview.changedAudienceWhy,
          } : undefined,
          perspectives: preview.perspectives,
          disagreements: preview.disagreements,
          confidence: preview.confidence,
          confidence_note: preview.confidenceNote,
          investigate_next: preview.investigateNext,
        } : {
          label: "AI-simulated, not human evidence",
          provisional: true,
          story_version: state.activeVersionId,
          note: "No AI Audience result has been saved for this story version.",
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
          evidence_kind: "real target-blind human responses",
          evidence_priority: "strongest basis for diagnosis",
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
          prior_tests: state.reactionHistory.map((set) => ({
            story_version: set.storyVersionId,
            valid_response_count: set.responses.length,
            collected_at: set.collectedAt,
          })),
          note: responses.length === 0 ? "No human responses have been imported for the current prepared test. Do not infer audience reaction." : undefined,
        };
      },
    },
    {
      name: "create_story_beat",
      title: "Create story beat",
      description:
        "Create one visible beat in a custom storyboard after creator direction. Inserts it after a stable beat ID, or first when omitted, and persists a new immutable version. The board holds six beats.",
      inputSchema: {
        type: "object",
        properties: {
          beat_id: { type: "string", maxLength: 100, description: "Stable ID for the new beat; use starter blueprint IDs when provided." },
          after_beat_id: { type: "string", maxLength: 100, description: "Existing beat ID to insert after; omit for first." },
          expected_version: { type: "string", maxLength: 100, description: "Active version previously read; rejects stale edits." },
          ...beatFields,
        },
        required: ["expected_version", "title", "action", "line", "narrative_role", "intended_emotion", "visual"],
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
          optionalString(input, "beat_id") ?? undefined,
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
        required: ["beat_id", "expected_version", "title", "action", "line", "narrative_role", "intended_emotion", "visual"],
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
    {
      name: "save_ai_preview",
      title: "Save AI Audience result",
      description:
        "Save provisional AI Audience perspective findings for the exact active story version. This never changes story beats or human evidence and must not be described as real audience response.",
      inputSchema: {
        type: "object",
        properties: {
          expected_version: { type: "string", maxLength: 100, description: "Exact story version evaluated; rejects stale previews." },
          summary: { type: "string", maxLength: 500, description: "Provisional cross-perspective takeaway without a universal score." },
          perspectives: {
            type: "array",
            minItems: 2,
            maxItems: 6,
            description: "Distinct perspective-based viewer reactions without demographic stereotypes.",
            items: {
              type: "object",
              properties: {
                persona: { type: "string", enum: [...AI_PERSONAS], description: "Allowed perspective lens." },
                likely_response: { type: "string", maxLength: 240, description: "Likely response from this lens." },
                watch_for: { type: "string", maxLength: 240, description: "Specific story risk or strength this lens notices." },
              },
              required: ["persona", "likely_response", "watch_for"],
              additionalProperties: false,
            },
          },
          disagreements: {
            type: "array",
            minItems: 1,
            maxItems: 4,
            description: "Useful ways the perspectives disagree.",
            items: { type: "string", maxLength: 240 },
          },
          audience_landing: { type: "string", maxLength: 240, description: "Likely overall emotional landing." },
          target_match: { type: "string", enum: ["strong", "partial", "weak", "missed", "unclear"], description: "Qualitative match to the target." },
          strongest_beat_id: { type: "string", maxLength: 100, description: "Existing strongest beat ID." },
          strongest_beat_why: { type: "string", maxLength: 240, description: "Why that beat works best." },
          weakest_beat_id: { type: "string", maxLength: 100, description: "Existing weakest or confusing beat ID." },
          weakest_beat_why: { type: "string", maxLength: 240, description: "Why that beat is weak or confusing." },
          main_risk: { type: "string", maxLength: 300, description: "Most important unintended-response risk." },
          observed_arc: { type: "array", maxItems: 6, items: { type: "string", maxLength: 80 }, description: "Likely observed emotional sequence." },
          changed_audience_beat_id: { type: "string", maxLength: 100, description: "Existing beat most responsible for the final response." },
          changed_audience_why: { type: "string", maxLength: 240, description: "Why that beat changes the audience." },
          confidence: { type: "string", enum: ["low", "medium", "high"], description: "Simulation confidence." },
          confidence_note: { type: "string", maxLength: 240, description: "Creator-facing confidence caveat." },
        },
        required: ["expected_version", "summary", "perspectives", "disagreements"],
        additionalProperties: false,
      },
      annotations: { readOnlyHint: false },
      execute: async (input, options) => {
        assertNotAborted(options);
        return store.saveAIPreview(previewFromInput(input), asString(input, "expected_version"), "agent");
      },
    },
  ];

  return tools.map((tool) => ({
    ...tool,
    execute: async (input, options) => {
      onAgentInteraction?.(tool.name);
      try {
        return await tool.execute(input, options);
      } catch (error) {
        if (error instanceof Error && error.name === "AbortError") throw error;
        return toolErrorResult(tool.name, error);
      }
    },
  }));
}

export async function registerPayoffTools(
  onCapability?: (capability: AgentCapability) => void,
  store: PayoffStore = payoffStore,
): Promise<() => void> {
  if (typeof document.modelContext?.registerTool !== "function") {
    onCapability?.("webmcp-unavailable");
    return () => undefined;
  }

  const controller = new AbortController();
  let capability: AgentCapability | null = null;
  const updateCapability = (next: AgentCapability) => {
    if (capability === "agent-interacted" && next !== "agent-interacted") return;
    if (capability === next) return;
    capability = next;
    onCapability?.(next);
  };

  try {
    for (const tool of buildPayoffTools(store, () => updateCapability("agent-interacted"))) {
      await document.modelContext.registerTool(tool, { signal: controller.signal });
    }
    updateCapability("tools-exposed");
  } catch (error) {
    controller.abort();
    updateCapability("webmcp-unavailable");
    throw error;
  }
  return () => controller.abort();
}
