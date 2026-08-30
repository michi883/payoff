import {
  RevisionModelOutputSchema,
  RevisionStructuredOutputSchema,
  type ReviseRequest,
  type RevisionModelOutput,
  type RevisionStructuredOutput,
} from "./aiSchemas.ts";

export type RevisionFailureCategory =
  | "schema_validation"
  | "unknown_beat"
  | "duplicate_beat"
  | "selected_scope"
  | "empty_revision"
  | "invalid_revision_shape"
  | "invalid_clarification_shape"
  | "no_material_change";

export type RevisionValidationFailure = {
  category: RevisionFailureCategory;
  details?: Record<string, unknown>;
  repairFeedback: string;
};

export type RevisionTargetingContext = {
  selected_beat_id: string | null;
  high_confidence_beat_id: string | null;
  likely_beats: Array<{ beat_id: string; order: number; title: string; score: number }>;
};

export type RevisionNormalizationResult =
  | { ok: true; output: RevisionModelOutput; resolvedBeatIds: string[]; normalizedBeatIds: boolean }
  | { ok: false; failure: RevisionValidationFailure; resolvedBeatIds: string[] };

const CONCRETE_REVISION_NOUNS = ["floor", "flower", "table", "wall", "door", "drawer", "counter", "refrigerator", "fridge", "chair", "phone", "paper", "frame"];

const STOP_WORDS = new Set([
  "a", "an", "and", "at", "be", "but", "by", "change", "do", "for", "from", "have", "her", "him", "his",
  "i", "in", "instead", "it", "keep", "make", "of", "on", "scene", "she", "so", "story", "than", "that", "the",
  "their", "them", "this", "to", "want", "when", "with",
]);

function canonicalToken(raw: string) {
  const token = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  if (["fridge", "refrigerator"].includes(token)) return "refrigerator";
  if (/^(stick|sticking|stuck|pin|pins|pinned|pinning|attach|attaches|attached|attaching|tape|taped)$/.test(token)) return "attach";
  if (/^(draw|drawing|drawings|picture|pictures)$/.test(token)) return "drawing";
  if (/^(leave|leaves|leaving|left|walk|walks|walking|turn|turns|turned|turning)$/.test(token)) return "leave";
  if (/^(end|ending|final|finale|resolution)$/.test(token)) return "ending";
  if (/^(dad|father)$/.test(token)) return "dad";
  if (/^(funny|funnier|comedy|comic)$/.test(token)) return "funny";
  if (token.endsWith("ing") && token.length > 6) return token.slice(0, -3);
  if (token.endsWith("s") && token.length > 4) return token.slice(0, -1);
  return token;
}

function tokens(value: string) {
  return value.split(/\s+/).map(canonicalToken).filter((token) => token && !STOP_WORDS.has(token));
}

function editDistance(left: string, right: string) {
  const previous = Array.from({ length: right.length + 1 }, (_, index) => index);
  for (let leftIndex = 1; leftIndex <= left.length; leftIndex += 1) {
    const current = [leftIndex];
    for (let rightIndex = 1; rightIndex <= right.length; rightIndex += 1) {
      current[rightIndex] = Math.min(
        current[rightIndex - 1] + 1,
        previous[rightIndex] + 1,
        previous[rightIndex - 1] + (left[leftIndex - 1] === right[rightIndex - 1] ? 0 : 1),
      );
    }
    previous.splice(0, previous.length, ...current);
  }
  return previous[right.length];
}

function sharedPrefixLength(left: string, right: string) {
  let length = 0;
  while (length < left.length && length < right.length && left[length] === right[length]) length += 1;
  return length;
}

export function creatorLanguageClarification(input: ReviseRequest): RevisionModelOutput | null {
  const rawTokens = input.creator_request.toLowerCase().match(/[a-z]{4,}/g) ?? [];
  for (const rawToken of rawTokens) {
    if (CONCRETE_REVISION_NOUNS.includes(rawToken)) continue;
    const candidates = CONCRETE_REVISION_NOUNS
      .map((word) => ({ word, distance: editDistance(rawToken, word) }))
      .filter((candidate) => candidate.distance <= 2 && sharedPrefixLength(rawToken, candidate.word) >= 3)
      .sort((left, right) => left.distance - right.distance || CONCRETE_REVISION_NOUNS.indexOf(left.word) - CONCRETE_REVISION_NOUNS.indexOf(right.word));
    if (candidates.length < 2) continue;
    const words = new Set(candidates.slice(0, 2).map((candidate) => candidate.word));
    if (words.has("floor") && words.has("flower")) {
      return {
        kind: "clarification",
        summary: "One object in the request could mean two different things.",
        why: null,
        clarification_question: "Did you mean the floor or a flower?",
        changes: [],
      };
    }
    const [first, second] = [...words];
    return {
      kind: "clarification",
      summary: "One object in the request could mean two different things.",
      why: null,
      clarification_question: `Did you mean ${first} or ${second}?`,
      changes: [],
    };
  }
  return null;
}

function textForTargeting(beat: ReviseRequest["story"]["beats"][number]) {
  return [
    beat.title,
    beat.action,
    beat.visual.spec.focalAction,
    beat.visual.spec.focalObject,
    ...beat.visual.spec.characters.map((character) => character.action),
  ].join(" ");
}

export function deriveRevisionTargeting(input: ReviseRequest): RevisionTargetingContext {
  if (input.selected_beat_id) {
    const beat = input.story.beats.find((candidate) => candidate.id === input.selected_beat_id)!;
    return {
      selected_beat_id: input.selected_beat_id,
      high_confidence_beat_id: input.selected_beat_id,
      likely_beats: [{ beat_id: beat.id, order: beat.order, title: beat.title, score: 100 }],
    };
  }

  const explicitNumber = input.creator_request.match(/\b(?:beat|scene)\s*#?\s*([1-6])\b/i)?.[1];
  if (explicitNumber) {
    const beat = input.story.beats[Number(explicitNumber) - 1];
    return {
      selected_beat_id: null,
      high_confidence_beat_id: beat.id,
      likely_beats: [{ beat_id: beat.id, order: beat.order, title: beat.title, score: 100 }],
    };
  }

  const requestTokens = tokens(input.creator_request);
  const requestSet = new Set(requestTokens);
  const asksForEnding = requestSet.has("ending") || /\bpayoff\b/i.test(input.creator_request);
  const scores = input.story.beats.map((beat) => {
    const titleTokens = tokens(beat.title);
    const actionTokens = tokens(beat.action);
    const coreTokens = tokens(textForTargeting(beat));
    const titleScore = titleTokens.filter((token) => requestSet.has(token)).length * 5;
    const actionScore = actionTokens.filter((token) => requestSet.has(token)).length * 2;
    const coreScore = coreTokens.filter((token) => requestSet.has(token)).length * 0.4;
    const exactTitle = input.creator_request.toLowerCase().includes(beat.title.toLowerCase()) ? 16 : 0;
    const attachmentAction = requestSet.has("attach") && requestSet.has("drawing")
      && actionTokens.includes("attach") && actionTokens.includes("drawing") ? 12 : 0;
    const departureAction = requestSet.has("leave") && requestSet.has("drawing")
      && actionTokens.includes("leave") && actionTokens.includes("drawing") ? 12 : 0;
    const ending = asksForEnding && beat.order === input.story.beats.length ? 18 : 0;
    return {
      beat_id: beat.id,
      order: beat.order,
      title: beat.title,
      score: titleScore + actionScore + coreScore + exactTitle + attachmentAction + departureAction + ending,
      strongAnchor: exactTitle > 0 || attachmentAction > 0 || departureAction > 0 || ending > 0,
    };
  }).sort((left, right) => right.score - left.score || left.order - right.order);
  const likely = scores.filter((item) => item.score > 0).slice(0, 3).map((item) => ({
    beat_id: item.beat_id,
    order: item.order,
    title: item.title,
    score: item.score,
  }));
  const top = likely[0];
  const second = likely[1];
  const topHasStrongAnchor = scores.find((item) => item.beat_id === top?.beat_id)?.strongAnchor === true;
  const highConfidence = top && topHasStrongAnchor && top.score >= 8 && (!second || top.score - second.score >= 3) ? top.beat_id : null;
  return { selected_beat_id: null, high_confidence_beat_id: highConfidence, likely_beats: likely };
}

function clipped(value: string, max: number) {
  const compact = value.trim().replace(/\s+/g, " ");
  if (compact.length <= max) return compact;
  const slice = compact.slice(0, max - 1);
  const boundary = slice.lastIndexOf(" ");
  return `${slice.slice(0, boundary > max * 0.65 ? boundary : max - 1).trim()}…`;
}

function sentence(value: string, max: number) {
  const compact = clipped(value, max);
  if (!compact) return compact;
  return /[.!?…]["']?$/.test(compact) ? compact : `${compact.replace(/[,:;]+$/, "")}.`;
}

function isFloorAttachmentRequest(value: string) {
  return /\b(?:floor|floower)\b/i.test(value) && /\b(?:stick|sticking|attach|attaching|pin|pinning|tape|taping)\w*\b/i.test(value)
    && /\b(?:drawing|drawings|picture|pictures|them)\b/i.test(value);
}

function normalizeFloorAttachmentLanguage(value: string) {
  return value
    .replace(/\bpins?\s+up\b/giu, "tapes")
    .replace(/\bpinning\b/giu, "taping")
    .replace(/\bpins\b/giu, "tapes")
    .replace(/\bpin\b/giu, "tape")
    .replace(/\bpinned\b/giu, "taped");
}

function resolveBeatReference(reference: string, input: ReviseRequest) {
  const exact = input.story.beats.find((beat) => beat.id === reference);
  if (exact) return exact.id;
  const numbered = reference.match(/\b(?:beat|scene)?\s*#?\s*([1-6])\b/i)?.[1];
  if (numbered) return input.story.beats[Number(numbered) - 1]?.id ?? null;
  const normalized = reference.trim().toLowerCase();
  return input.story.beats.find((beat) => beat.title.toLowerCase() === normalized)?.id ?? null;
}

function fail(category: RevisionFailureCategory, repairFeedback: string, resolvedBeatIds: string[] = [], details?: Record<string, unknown>): RevisionNormalizationResult {
  return { ok: false, failure: { category, details, repairFeedback }, resolvedBeatIds };
}

function normalizedVisual(
  before: ReviseRequest["story"]["beats"][number],
  change: RevisionStructuredOutput["changes"][number],
  action: string,
  creatorRequest: string,
  textualMeaningChanged: boolean,
) {
  const visual = structuredClone(before.visual.spec);
  const direction = change.visual_direction;
  if (direction) {
    if (direction.setting?.trim()) visual.setting = clipped(direction.setting, 280);
    for (const update of direction.character_updates) {
      const character = visual.characters.find((candidate) => candidate.id.toLowerCase() === update.id.toLowerCase());
      if (!character) continue;
      if (update.position?.trim()) character.position = clipped(update.position, 220);
      if (update.action?.trim()) character.action = clipped(update.action, 260);
    }
    if (direction.focal_action?.trim()) visual.focalAction = clipped(direction.focal_action, 320);
    if (direction.focal_object?.trim()) visual.focalObject = clipped(direction.focal_object, 260);
    if (direction.composition?.trim()) visual.composition = clipped(direction.composition, 360);
    if (direction.emotional_cue?.trim()) visual.emotionalCue = clipped(direction.emotional_cue, 220);
    if (direction.visible_text !== null) visual.visibleText = clipped(direction.visible_text, 80);
    if (direction.continuity_notes.length > 0) {
      visual.continuityNotes = direction.continuity_notes.slice(0, 4).map((note) => clipped(note, 240));
    }
  }
  if (textualMeaningChanged) {
    visual.focalAction = direction?.focal_action?.trim() ? visual.focalAction : clipped(action, 320);
    const note = clipped(`Revised creator direction: ${creatorRequest}`, 240);
    if (!visual.continuityNotes.some((item) => item === note)) {
      visual.continuityNotes = [...visual.continuityNotes.slice(0, 5), note];
    }
  }
  if (isFloorAttachmentRequest(creatorRequest)) {
    visual.focalAction = clipped(action, 320);
    visual.focalObject = "The drawing pressed flat against the floor beside the refrigerator.";
    visual.composition = "Keep the floor-mounted drawing prominent in the foreground, with the child rising to leave and Dad distant at the table.";
    const actor = visual.characters.find((character) => /daughter|child|girl/i.test(character.id))
      ?? visual.characters.find((character) => /drawing|picture/i.test(character.action));
    if (actor) {
      actor.position = "Crouched beside the refrigerator with both hands near the floor.";
      actor.action = "Tapes the new drawing flat to the floor, then rises and begins to leave.";
    }
  }
  return visual;
}

export function normalizeRevisionOutput(
  rawOutput: unknown,
  input: ReviseRequest,
  targeting = deriveRevisionTargeting(input),
): RevisionNormalizationResult {
  const parsed = RevisionStructuredOutputSchema.safeParse(rawOutput);
  if (!parsed.success) {
    return fail("schema_validation", "Return only the compact revision schema and use null for every unchanged optional field.", [], {
      issues: parsed.error.issues.slice(0, 8).map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })),
    });
  }
  const value = parsed.data;
  if (value.kind === "clarification") {
    if (!value.clarification_question?.trim()) {
      return fail("invalid_clarification_shape", "Return one concise clarification_question and an empty changes array.");
    }
    const output = RevisionModelOutputSchema.safeParse({
      kind: "clarification",
      summary: sentence(value.summary || "One detail needs clarification", 500),
      why: null,
      clarification_question: sentence(value.clarification_question, 300),
      changes: [],
    });
    if (!output.success) return fail("invalid_clarification_shape", "Return one short clarification question and no changes.");
    return { ok: true, output: output.data, resolvedBeatIds: [], normalizedBeatIds: false };
  }
  if (value.changes.length === 0) return fail("empty_revision", "Return at least one concrete beat patch for this actionable request.");
  if (input.selected_beat_id && value.changes.length !== 1) {
    return fail("selected_scope", `Change only selected beat ID ${input.selected_beat_id}.`);
  }

  let normalizedBeatIds = false;
  const resolvedBeatIds: string[] = [];
  const changes = value.changes.map((change) => {
    let beatId = resolveBeatReference(change.beat_id, input);
    if (input.selected_beat_id && beatId !== input.selected_beat_id) {
      beatId = input.selected_beat_id;
      normalizedBeatIds = true;
    } else if (value.changes.length === 1 && targeting.high_confidence_beat_id && beatId !== targeting.high_confidence_beat_id) {
      beatId = targeting.high_confidence_beat_id;
      normalizedBeatIds = true;
    }
    if (!beatId) return null;
    resolvedBeatIds.push(beatId);
    const before = input.story.beats.find((beat) => beat.id === beatId)!;
    const title = change.title?.trim() ? clipped(change.title, 48) : before.title;
    const proposedAction = change.action?.trim() ? change.action : before.action;
    const action = sentence(isFloorAttachmentRequest(input.creator_request)
      ? normalizeFloorAttachmentLanguage(proposedAction)
      : proposedAction, 180);
    const line = change.line === null ? before.line : clipped(change.line, 100);
    const narrativeRole = change.narrative_role ?? before.narrativeRole;
    const intendedEmotion = change.intended_emotion?.trim() ? clipped(change.intended_emotion, 48) : before.intendedEmotion;
    const textualMeaningChanged = title !== before.title || action !== before.action || line !== before.line
      || narrativeRole !== before.narrativeRole || intendedEmotion !== before.intendedEmotion;
    const visual = normalizedVisual(before, change, action, input.creator_request, textualMeaningChanged);
    return {
      beat_id: beatId,
      what_changes: sentence(isFloorAttachmentRequest(input.creator_request)
        ? "She tapes the drawing flat to the floor instead of attaching it to the refrigerator"
        : change.what_changes || `Update Beat ${before.order} to match the creator's direction`, 240),
      replacement: { title, action, line, narrativeRole, intendedEmotion, visual },
    };
  });

  if (changes.some((change) => change === null)) {
    return fail("unknown_beat", "Use an exact beat_id from the supplied storyboard or an explicit scene number.", resolvedBeatIds, {
      model_beat_ids: value.changes.map((change) => change.beat_id),
    });
  }
  if (new Set(resolvedBeatIds).size !== resolvedBeatIds.length) {
    return fail("duplicate_beat", "Return at most one patch for each affected beat_id.", resolvedBeatIds);
  }
  const concreteChanges = changes.filter((change): change is NonNullable<typeof change> => change !== null);
  const material = concreteChanges.filter((change) => {
    const before = input.story.beats.find((beat) => beat.id === change.beat_id)!;
    const after = change.replacement;
    return before.title !== after.title || before.action !== after.action || before.line !== after.line
      || before.narrativeRole !== after.narrativeRole || before.intendedEmotion !== after.intendedEmotion
      || JSON.stringify(before.visual.spec) !== JSON.stringify(after.visual);
  });
  if (material.length === 0) return fail("no_material_change", "Return a concrete changed field rather than only describing the request.", resolvedBeatIds);
  const output = RevisionModelOutputSchema.safeParse({
    kind: "revision",
    summary: sentence(value.summary || `Prepared ${material.length === 1 ? "one beat change" : `${material.length} beat changes`}`, 500),
    why: sentence(value.why || "This is the smallest change that follows the creator's direction while preserving unrelated beats", 500),
    clarification_question: null,
    changes: material,
  });
  if (!output.success) {
    return fail("invalid_revision_shape", "Keep every proposed field concise and return only valid patches for existing beats.", resolvedBeatIds, {
      issues: output.error.issues.slice(0, 8).map((issue) => ({ path: issue.path.join("."), code: issue.code, message: issue.message })),
    });
  }
  return { ok: true, output: output.data, resolvedBeatIds, normalizedBeatIds };
}
