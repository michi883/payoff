import {
  AudienceModelOutputSchema,
  AudienceRequestSchema,
  DiagnoseRequestSchema,
  DiagnosisModelOutputSchema,
  HumanAudienceModelOutputSchema,
  HumanAudienceRequestSchema,
  ReviseRequestSchema,
  RevisionModelOutputSchema,
  StoryboardModelOutputSchema,
  StoryboardRequestSchema,
  type AudienceRequest,
  type DiagnoseRequest,
  type HumanAudienceRequest,
  type ReviseRequest,
  type RevisionModelOutput,
} from "./aiSchemas.ts";
import { AIConfigurationError, type PayoffAIProvider } from "./openaiProvider.ts";

export const AI_AUDIENCE_LABEL = "AI-simulated audience";
export const AI_AUDIENCE_NOTICE = "Useful as an early check. Not human evidence.";

export type ApiResult = {
  status: number;
  body: Record<string, unknown>;
  allow?: string;
};

function errorResult(status: number, code: string, message: string, retryable = false): ApiResult {
  return { status, body: { error: { code, message, retryable } } };
}

function parseBody(body: unknown): unknown {
  if (typeof body !== "string") return body;
  try { return JSON.parse(body) as unknown; } catch { return null; }
}

function issueMessage(result: { error: { issues: Array<{ message: string }> } }) {
  return result.error.issues[0]?.message ?? "The request is invalid.";
}

function invalidRequest(message: string) {
  return errorResult(400, "INVALID_REQUEST", message);
}

function isCompleteProse(value: string) {
  return /[.!?…]["'”’)]?$/u.test(value.trim());
}

function methodGuard(method: string | undefined): ApiResult | null {
  return method === "POST" ? null : { ...errorResult(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint."), allow: "POST" };
}

function safeProviderFailure(error: unknown, task: "storyboard" | "audience" | "diagnosis" | "revision"): ApiResult {
  if (error instanceof AIConfigurationError) {
    return errorResult(503, "AI_NOT_CONFIGURED", "Payoff's AI service is not configured on this server.");
  }
  console.error(`[Payoff AI:${task}]`, error instanceof Error ? error.message : "Unknown provider failure");
  const messages = {
    storyboard: "Payoff couldn't finish your storyboard. Your brief is safe.",
    audience: "Payoff couldn't finish the audience check. Your story was not changed.",
    diagnosis: "Payoff couldn't explain the result just now. Your story was not changed.",
    revision: "Payoff couldn't finish that revision. Your story was not changed.",
  };
  return errorResult(502, "AI_TEMPORARILY_UNAVAILABLE", messages[task], true);
}

function validateAudienceOutput(output: unknown, input: AudienceRequest) {
  const parsed = AudienceModelOutputSchema.safeParse(output);
  if (!parsed.success) return null;
  const prose = [
    parsed.data.summary,
    parsed.data.audience_landing,
    parsed.data.what_landed,
    parsed.data.where_it_drifted,
    parsed.data.biggest_opportunity,
    parsed.data.strongest_beat.why,
    parsed.data.weakest_beat.why,
    parsed.data.main_risk,
    parsed.data.changed_audience.why,
    parsed.data.confidence.note,
    ...parsed.data.disagreements,
    ...parsed.data.reactions.flatMap((item) => [item.note, item.evidence]),
  ];
  if (!prose.every(isCompleteProse)) return null;
  const beatIds = new Set(input.beats.map((beat) => beat.id));
  const referenced = [
    parsed.data.strongest_beat.beat_id,
    parsed.data.weakest_beat.beat_id,
    parsed.data.changed_audience.beat_id,
  ];
  if (referenced.some((id) => !beatIds.has(id))) return null;
  if (new Set(parsed.data.reactions.map((item) => item.persona)).size !== parsed.data.reactions.length) return null;
  return parsed.data;
}

function validateHumanAudienceOutput(output: unknown, input: HumanAudienceRequest) {
  const parsed = HumanAudienceModelOutputSchema.safeParse(output);
  if (!parsed.success) return null;
  const prose = [
    parsed.data.summary,
    parsed.data.audience_landing,
    parsed.data.what_landed,
    parsed.data.where_it_drifted,
    parsed.data.biggest_opportunity,
    parsed.data.strongest_beat.why,
    parsed.data.weakest_beat.why,
    parsed.data.main_risk,
    parsed.data.changed_audience.why,
  ];
  if (!prose.every(isCompleteProse)) return null;
  const beatIds = new Set(input.beats.map((beat) => beat.id));
  const referenced = [
    parsed.data.strongest_beat.beat_id,
    parsed.data.weakest_beat.beat_id,
    parsed.data.changed_audience.beat_id,
  ];
  if (referenced.some((id) => !beatIds.has(id))) return null;
  return {
    ...parsed.data,
    match: input.responses.length < 4 ? "insufficient" as const : parsed.data.match,
  };
}

function hasMaterialChange(input: ReviseRequest, change: RevisionModelOutput["changes"][number]) {
  const before = input.story.beats.find((beat) => beat.id === change.beat_id);
  if (!before) return false;
  const after = change.replacement;
  return before.title !== after.title || before.action !== after.action || before.line !== after.line
    || before.narrativeRole !== after.narrativeRole || before.intendedEmotion !== after.intendedEmotion
    || before.artKey !== after.artKey;
}

function validateRevisionOutput(output: unknown, input: ReviseRequest) {
  const parsed = RevisionModelOutputSchema.safeParse(output);
  if (!parsed.success) return null;
  const value = parsed.data;
  const prose = [
    value.summary,
    value.why,
    value.clarification_question,
    ...value.changes.flatMap((change) => [change.what_changes, change.replacement.action]),
  ].filter((item): item is string => item !== null);
  if (!prose.every(isCompleteProse)) return null;
  const beatIds = new Set(input.story.beats.map((beat) => beat.id));
  const changedIds = value.changes.map((change) => change.beat_id);
  if (new Set(changedIds).size !== changedIds.length || changedIds.some((id) => !beatIds.has(id))) return null;
  const materialChanges = value.changes.filter((change) => hasMaterialChange(input, change));
  if (input.selected_beat_id && materialChanges.some((change) => change.beat_id !== input.selected_beat_id)) return null;
  if (value.kind === "revision") {
    if (materialChanges.length === 0 || !value.why || value.clarification_question !== null) return null;
    return { ...value, changes: materialChanges };
  }
  if (value.changes.length !== 0 || value.why !== null || !value.clarification_question) return null;
  return value;
}

function validateDiagnosisOutput(output: unknown, input: DiagnoseRequest) {
  const parsed = DiagnosisModelOutputSchema.safeParse(output);
  if (!parsed.success) return null;
  if (![parsed.data.answer, ...parsed.data.evidence.map((item) => item.observation)].every(isCompleteProse)) return null;
  const beatIds = new Set(input.story.beats.map((beat) => beat.id));
  if (parsed.data.evidence.some((item) => item.beat_id !== null && !beatIds.has(item.beat_id))) return null;
  return parsed.data;
}

export async function handleStoryboard(method: string | undefined, body: unknown, provider: PayoffAIProvider): Promise<ApiResult> {
  const blocked = methodGuard(method);
  if (blocked) return blocked;
  const input = StoryboardRequestSchema.safeParse(parseBody(body));
  if (!input.success) return invalidRequest(issueMessage(input));
  try {
    const output = StoryboardModelOutputSchema.safeParse(await provider.storyboard(input.data));
    if (!output.success || output.data.beats.some((beat) => !isCompleteProse(beat.action))) {
      return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't finish that storyboard. Your brief is safe.", true);
    }
    return { status: 200, body: output.data };
  } catch (error) { return safeProviderFailure(error, "storyboard"); }
}

export async function handleAudience(method: string | undefined, body: unknown, provider: PayoffAIProvider): Promise<ApiResult> {
  const blocked = methodGuard(method);
  if (blocked) return blocked;
  const parsedBody = parseBody(body);
  if (parsedBody && typeof parsedBody === "object" && "source" in parsedBody && parsedBody.source === "human") {
    const input = HumanAudienceRequestSchema.safeParse(parsedBody);
    if (!input.success) return invalidRequest(issueMessage(input));
    try {
      const output = validateHumanAudienceOutput(await provider.humanAudience(input.data), input.data);
      if (!output) return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't make sense of those viewer responses. Your responses are safe.", true);
      return {
        status: 200,
        body: {
          source: "human",
          story_version: input.data.expected_version,
          story_hash: input.data.story_hash,
          response_ids: input.data.responses.map((response) => response.id),
          ...output,
        },
      };
    } catch (error) { return safeProviderFailure(error, "audience"); }
  }
  const aiBody = parsedBody && typeof parsedBody === "object" && !("source" in parsedBody)
    ? { ...parsedBody, source: "ai" }
    : parsedBody;
  const input = AudienceRequestSchema.safeParse(aiBody);
  if (!input.success) return invalidRequest(issueMessage(input));
  try {
    const output = validateAudienceOutput(await provider.audience(input.data), input.data);
    if (!output) return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't finish that audience check. Your story was not changed.", true);
    return {
      status: 200,
      body: {
        label: AI_AUDIENCE_LABEL,
        notice: AI_AUDIENCE_NOTICE,
        source: "ai",
        story_version: input.data.expected_version,
        ...output,
      },
    };
  } catch (error) { return safeProviderFailure(error, "audience"); }
}

/** Backwards-compatible route for older local clients; the creator UI uses /api/audience. */
export const handlePreview = handleAudience;

export async function handleDiagnose(method: string | undefined, body: unknown, provider: PayoffAIProvider): Promise<ApiResult> {
  const blocked = methodGuard(method);
  if (blocked) return blocked;
  const input = DiagnoseRequestSchema.safeParse(parseBody(body));
  if (!input.success) return invalidRequest(issueMessage(input));
  try {
    const output = validateDiagnosisOutput(await provider.diagnose(input.data), input.data);
    if (!output) return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't explain that result just now. Your story was not changed.", true);
    return {
      status: 200,
      body: {
        story_version: input.data.expected_version,
        audience_source: input.data.audience_source,
        ...output,
      },
    };
  } catch (error) { return safeProviderFailure(error, "diagnosis"); }
}

export async function handleRevise(method: string | undefined, body: unknown, provider: PayoffAIProvider): Promise<ApiResult> {
  const blocked = methodGuard(method);
  if (blocked) return blocked;
  const input = ReviseRequestSchema.safeParse(parseBody(body));
  if (!input.success) return invalidRequest(issueMessage(input));
  try {
    const output = validateRevisionOutput(await provider.revise(input.data), input.data);
    if (!output) return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't finish that revision. Your story was not changed.", true);
    return { status: 200, body: { story_version: input.data.expected_version, ...output } };
  } catch (error) { return safeProviderFailure(error, "revision"); }
}
