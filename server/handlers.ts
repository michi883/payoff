import {
  AudienceModelOutputSchema,
  AudienceRequestSchema,
  DiagnoseRequestSchema,
  DiagnosisModelOutputSchema,
  HumanAudienceModelOutputSchema,
  HumanAudienceRequestSchema,
  ReviseRequestSchema,
  StoryboardModelOutputSchema,
  StoryboardQualityReviewSchema,
  StoryboardRepairVerificationSchema,
  StoryboardRequestSchema,
  type AudienceRequest,
  type DiagnoseRequest,
  type HumanAudienceRequest,
  type StoryboardModelOutput,
} from "./aiSchemas.ts";
import { AIConfigurationError, type PayoffAIProvider } from "./openaiProvider.ts";
import { DemoFixtureError } from "./demoErrors.ts";
import { creatorLanguageClarification, deriveRevisionTargeting, normalizeRevisionOutput, type RevisionValidationFailure } from "./revision.ts";

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

const GENERIC_TITLES = new Set([
  "again", "setup", "escalation", "turn", "reveal", "resolution", "the pattern", "the payoff", "the response", "the setup", "the turn", "the reveal", "the resolution",
]);
const DEVICE_TERMS = /\b(?:phone|smartphone|tablet|laptop|computer|device)\b/iu;
const TINY_INTERFACE_TERMS = /\b(?:button|icon|loading ring|contact list|contacts screen|status banner|screen label|interface|app menu|tile)\b/iu;
const STORY_DEPENDENT_WRITING = /\b(?:(?:open|closed|winning|winner|score|result|reveal|confirm\w*)\s+(?:scorecards?|score sheets?)|(?:scorecards?|score sheets?)\s+(?:open|closed|show\w*|confirm\w*|reveal\w*|display\w*))\b/iu;

function words(value: string) {
  return value.trim().split(/\s+/u).filter(Boolean);
}

function normalizedPhrase(value: string) {
  return value.toLowerCase().replace(/[^a-z0-9\s]/gu, " ").replace(/\s+/gu, " ").trim();
}

export function deterministicStoryboardIssues(output: StoryboardModelOutput) {
  const parsed = StoryboardModelOutputSchema.safeParse(output);
  if (!parsed.success) return ["The storyboard did not match the required structured contract."];
  const value = parsed.data;
  const issues: string[] = [];
  if (!value.visual_continuity.timeOfDay) {
    issues.push("Visual continuity must declare one explicit time-of-day baseline for the sequence.");
  }
  if (!value.visual_continuity.lighting) {
    issues.push("Visual continuity must declare one explicit lighting and color-temperature baseline for the sequence.");
  }
  const titles = new Set<string>();
  value.beats.forEach((beat, index) => {
    const title = normalizedPhrase(beat.title);
    const titleWords = words(beat.title).length;
    const actionWords = words(beat.action).length;
    if (titleWords < 2 || titleWords > 5) issues.push(`Beat ${index + 1} title must contain 2 to 5 words.`);
    if (GENERIC_TITLES.has(title)) issues.push(`Beat ${index + 1} uses the generic or structural title “${beat.title}”.`);
    if (titles.has(title)) issues.push(`Beat ${index + 1} duplicates the title “${beat.title}”.`);
    titles.add(title);
    if (actionWords < 8 || actionWords > 26) issues.push(`Beat ${index + 1} description should stay near 10 to 22 words and describe one visible action.`);
    if (!isCompleteProse(beat.action)) issues.push(`Beat ${index + 1} description is not a complete sentence.`);
    const visualLanguage = `${beat.action} ${beat.visual.focalAction} ${beat.visual.focalObject} ${beat.visual.composition}`;
    if (DEVICE_TERMS.test(visualLanguage) && TINY_INTERFACE_TERMS.test(visualLanguage)) {
      issues.push(`Beat ${index + 1} depends on a tiny device interface; recompose it around physical orientation, framing, gesture, or a person-to-person action.`);
    }
    if (STORY_DEPENDENT_WRITING.test(visualLanguage)) {
      issues.push(`Beat ${index + 1} depends on reading or inferring a scorecard state; recompose the result around a large physical reveal, gesture, or character reaction.`);
    }
    if (index > 0) {
      const previous = value.beats[index - 1];
      if (normalizedPhrase(previous.action) === normalizedPhrase(beat.action)
        || normalizedPhrase(previous.visual.focalAction) === normalizedPhrase(beat.visual.focalAction)) {
        issues.push(`Beats ${index} and ${index + 1} repeat the same visible event.`);
      }
    }
    for (const character of beat.visual.characters) {
      const established = value.visual_continuity.characters.find((candidate) => candidate.id.toLowerCase() === character.id.toLowerCase());
      if (!established) {
        issues.push(`Beat ${index + 1} uses character “${character.id}” without an established continuity identity.`);
      } else if (normalizedPhrase(established.appearance) !== normalizedPhrase(character.appearance)) {
        issues.push(`Beat ${index + 1} changes the established appearance of character “${character.id}”.`);
      }
    }
  });
  if (value.beats.at(-1)?.narrativeRole !== "payoff") issues.push("Beat 6 must provide the visible emotional landing as a payoff beat.");
  return issues;
}

function reviewIssues(output: unknown) {
  const review = StoryboardQualityReviewSchema.safeParse(output);
  if (!review.success) return ["The storyboard quality review was incomplete."];
  if (review.data.passed !== (review.data.issues.length === 0)) return ["The storyboard quality review contradicted its own findings."];
  return review.data.issues.map((issue) => `${issue.beat_number ? `Beat ${issue.beat_number}: ` : ""}${issue.problem} Repair: ${issue.repair_instruction}`);
}

function repairVerificationIssues(output: unknown, originalIssueCount: number) {
  const verification = StoryboardRepairVerificationSchema.safeParse(output);
  if (!verification.success) return ["The storyboard repair verification was incomplete."];
  if (verification.data.passed !== (verification.data.unresolved.length === 0)) {
    return ["The storyboard repair verification contradicted its own findings."];
  }
  const indexes = verification.data.unresolved.map((issue) => issue.issue_number);
  if (new Set(indexes).size !== indexes.length || indexes.some((index) => index > originalIssueCount)) {
    return ["The storyboard repair verification referenced an unknown quality issue."];
  }
  return verification.data.unresolved.map((issue) => `Original issue ${issue.issue_number} remains unresolved: ${issue.explanation}`);
}

function methodGuard(method: string | undefined): ApiResult | null {
  return method === "POST" ? null : { ...errorResult(405, "METHOD_NOT_ALLOWED", "Use POST for this endpoint."), allow: "POST" };
}

function safeProviderFailure(error: unknown, task: "storyboard" | "audience" | "diagnosis" | "revision"): ApiResult {
  if (error instanceof DemoFixtureError) {
    console.error(`[Payoff demo:${task}]`, error.message);
    return errorResult(500, "MISSING_DEMO_FIXTURE", error.message, false);
  }
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
  const traceId = `storyboard:${Date.now().toString(36)}`;
  const startedAt = Date.now();
  const log = (level: "info" | "warn" | "error", event: string, details: Record<string, unknown> = {}) => {
    console[level]("[Payoff AI:storyboard-diagnostic]", JSON.stringify({
      event,
      at: new Date().toISOString(),
      trace_id: traceId,
      premise_characters: input.data.premise.length,
      format: input.data.format,
      ...details,
    }));
  };
  log("info", "storyboard_generation_started");
  try {
    let initial = StoryboardModelOutputSchema.safeParse(await provider.storyboard(input.data));
    if (!initial.success) {
      const issue = initial.error.issues[0];
      log("warn", "storyboard_generation_retry_started", {
        classification: "malformed_output",
        issue: issue?.message,
        path: issue?.path.join("."),
        attempt: 2,
        max_attempts: 2,
      });
      initial = StoryboardModelOutputSchema.safeParse(await provider.storyboard(input.data));
    }
    if (!initial.success) {
      const issue = initial.error.issues[0];
      log("error", "storyboard_generation_failed", {
        classification: "malformed_output",
        issue: issue?.message,
        path: issue?.path.join("."),
        attempts: 2,
      });
      return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't finish that storyboard. Your brief is safe.", true);
    }
    log("info", "storyboard_visual_briefs_ready", {
      beat_count: initial.data.beats.length,
      character_count: initial.data.visual_continuity.characters.length,
      setting_count: initial.data.visual_continuity.settings.length,
      prop_count: initial.data.visual_continuity.importantProps.length,
      time_of_day: initial.data.visual_continuity.timeOfDay,
      lighting: initial.data.visual_continuity.lighting,
    });
    const initialIssues = [
      ...deterministicStoryboardIssues(initial.data),
      ...reviewIssues(await provider.reviewStoryboard(input.data, initial.data)),
    ];
    log(initialIssues.length === 0 ? "info" : "warn", "storyboard_quality_reviewed", { issue_count: initialIssues.length, issues: initialIssues });
    if (initialIssues.length === 0) {
      log("info", "storyboard_generation_completed", { phase: "initial", latency_ms: Date.now() - startedAt });
      return { status: 200, body: initial.data };
    }

    log("warn", "storyboard_repair_started", { issue_count: initialIssues.length });
    const repaired = StoryboardModelOutputSchema.safeParse(await provider.repairStoryboard(input.data, initial.data, initialIssues));
    if (!repaired.success) {
      log("error", "storyboard_repair_failed", { classification: "malformed_output", issue: repaired.error.issues[0]?.message });
      return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't finish that storyboard. Your brief is safe.", true);
    }
    const repairedIssues = deterministicStoryboardIssues(repaired.data);
    if (repairedIssues.length === 0) {
      repairedIssues.push(...repairVerificationIssues(
        await provider.verifyStoryboardRepair(input.data, repaired.data, initialIssues),
        initialIssues.length,
      ));
    }
    if (repairedIssues.length > 0) {
      console.warn("[Payoff AI:storyboard-quality]", JSON.stringify({ initial_issues: initialIssues, repaired_issues: repairedIssues }));
      log("error", "storyboard_repair_failed", { classification: "quality_gate", repaired_issues: repairedIssues, latency_ms: Date.now() - startedAt });
      return errorResult(502, "INVALID_AI_RESPONSE", "Payoff couldn't finish that storyboard. Your brief is safe.", true);
    }
    log("info", "storyboard_generation_completed", { phase: "repair", latency_ms: Date.now() - startedAt });
    return { status: 200, body: repaired.data };
  } catch (error) {
    log("error", "storyboard_generation_failed", {
      classification: error instanceof AIConfigurationError ? "configuration" : "provider_error",
      latency_ms: Date.now() - startedAt,
      message: error instanceof Error ? error.message : "Unknown provider failure",
    });
    return safeProviderFailure(error, "storyboard");
  }
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
  const canonicalCreatorRequest = provider.canonicalizeRevisionRequest?.(input.data.creator_request) ?? input.data.creator_request;
  const revisionInput = canonicalCreatorRequest === input.data.creator_request
    ? input.data
    : { ...input.data, creator_request: canonicalCreatorRequest };
  const requestId = `revision:${Date.now().toString(36)}:${Math.random().toString(36).slice(2, 8)}`;
  const startedAt = Date.now();
  const baseDiagnostic = {
    request_id: requestId,
    story_id: input.data.story.id,
    version_id: input.data.expected_version,
    creator_request: input.data.creator_request,
    selected_beat_id: input.data.selected_beat_id,
  };
  const targeting = deriveRevisionTargeting(revisionInput);
  console.info("[Payoff AI:revision-diagnostic]", JSON.stringify({ event: "revision_request_received", at: new Date().toISOString(), ...baseDiagnostic, targeting }));
  const languageClarification = creatorLanguageClarification(revisionInput);
  if (languageClarification) {
    console.info("[Payoff AI:revision-diagnostic]", JSON.stringify({
      event: "revision_clarification_ready",
      ...baseDiagnostic,
      provider_response_status: "not_called",
      structured_output_parse_result: "not_needed",
      schema_validation_result: "passed",
      resolved_beat_ids: [],
      failure_category: null,
      retry_result: "not_needed",
      latency_ms: Date.now() - startedAt,
    }));
    return { status: 200, body: { story_version: input.data.expected_version, ...languageClarification } };
  }
  let recoveryFeedback: string | undefined;
  let lastValidationFailure: RevisionValidationFailure | null = null;
  let lastProviderError: unknown = null;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const providerStartedAt = Date.now();
      const rawOutput = await provider.revise(revisionInput, { requestId, attempt, repairFeedback: recoveryFeedback, targetingContext: targeting });
      console.info("[Payoff AI:revision-diagnostic]", JSON.stringify({ event: "revision_model_completed", ...baseDiagnostic, attempt, model_latency_ms: Date.now() - providerStartedAt, provider_response_status: "completed", structured_output_parse_result: "parsed" }));
      const normalized = normalizeRevisionOutput(rawOutput, revisionInput, targeting);
      if (normalized.ok) {
        console.info("[Payoff AI:revision-diagnostic]", JSON.stringify({
          event: "revision_proposal_ready",
          ...baseDiagnostic,
          attempt,
          schema_validation_result: "passed",
          resolved_beat_ids: normalized.resolvedBeatIds,
          beat_ids_normalized: normalized.normalizedBeatIds,
          failure_category: null,
          retry_result: attempt === 1 ? "not_needed" : "recovered",
          latency_ms: Date.now() - startedAt,
        }));
        return { status: 200, body: { story_version: input.data.expected_version, ...normalized.output } };
      }
      lastValidationFailure = normalized.failure;
      recoveryFeedback = normalized.failure.repairFeedback;
      console.warn("[Payoff AI:revision-diagnostic]", JSON.stringify({
        event: "revision_validation_failed",
        ...baseDiagnostic,
        attempt,
        schema_validation_result: normalized.failure.category,
        resolved_beat_ids: normalized.resolvedBeatIds,
        failure_category: normalized.failure.category,
        details: normalized.failure.details ?? null,
        retry_result: attempt === 1 ? "retrying" : "exhausted",
        latency_ms: Date.now() - startedAt,
      }));
    } catch (error) {
      if (error instanceof AIConfigurationError || error instanceof DemoFixtureError) return safeProviderFailure(error, "revision");
      lastProviderError = error;
      recoveryFeedback = "Return one compact proposal or clarification using the required structured schema.";
      console.error("[Payoff AI:revision-diagnostic]", JSON.stringify({
        event: "revision_provider_attempt_failed",
        ...baseDiagnostic,
        attempt,
        provider_response_status: typeof (error as { status?: unknown })?.status === "number" ? (error as { status: number }).status : null,
        structured_output_parse_result: "failed",
        failure_category: "provider_or_network",
        retry_result: attempt === 1 ? "retrying" : "exhausted",
        latency_ms: Date.now() - startedAt,
      }));
    }
  }
  if (lastProviderError && !lastValidationFailure) return errorResult(502, "REVISION_PROVIDER_UNAVAILABLE", "Payoff couldn't prepare that revision. Try again.", true);
  const category = lastValidationFailure?.category ?? "internal_code_error";
  const unknownBeat = category === "unknown_beat" || category === "selected_scope";
  return errorResult(502, unknownBeat ? "REVISION_BEAT_UNRESOLVED" : "REVISION_OUTPUT_INVALID", unknownBeat
    ? "Payoff couldn't match that request to a storyboard beat. Try naming the scene or beat number."
    : "Payoff couldn't prepare that revision. Try again.", true);
}
