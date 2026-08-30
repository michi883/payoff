import type { NormalizedAudienceEvidence } from "../ai/contracts";
import { getActivePreview, getTargetPayoff } from "./selectors";
import type { AIPreview, AudienceReaction, ReactionEmotion, Workspace } from "./types";

export type AudienceResultViewModel = {
  source: "ai" | "human";
  evidenceKind: "simulation" | "human" | "rehearsal";
  audienceSize: number;
  intendedPayoff: string;
  audienceLanding: string;
  match: "strong" | "partial" | "missed" | "insufficient";
  observedArc: string[];
  whatLanded: string;
  whereItDrifted: string;
  biggestOpportunity: string;
  strongestBeat: { beatId: string | null; why: string };
  weakestBeat: { beatId: string | null; why: string };
  mainRisk: string;
  changedAudience: { beatId: string | null; why: string };
  reactions: Array<{ label: string; note: string; evidence?: string }>;
  disagreements: string[];
  evidenceStrength: string;
  methodology: string;
  provenance: string;
  testedAt: string | null;
  storyVersionId: string;
};

const personaLabels: Record<string, string> = {
  impatient_casual: "Casual fast-scrolling viewer",
  emotionally_sensitive: "Emotionally attentive viewer",
  comedy_oriented: "Comedy-sensitive viewer",
  literal_low_context: "Literal viewer",
  experienced_storyteller: "Story-savvy viewer",
  skeptical_viewer: "Skeptical viewer",
};

function previewMatch(preview: AIPreview): AudienceResultViewModel["match"] {
  if (preview.targetMatch === "strong") return "strong";
  if (preview.targetMatch === "partial") return "partial";
  if (preview.targetMatch === "weak" || preview.targetMatch === "missed") return "missed";
  return "insufficient";
}

export function getAIAudienceResult(workspace: Workspace): AudienceResultViewModel | null {
  const preview = getActivePreview(workspace);
  if (!preview) return null;
  const strongestWhy = preview.strongestBeatWhy ?? "No single strongest beat was identified.";
  const weakestWhy = preview.weakestBeatWhy ?? "No single weak beat was identified.";
  const mainRisk = preview.mainRisk ?? "No dominant unintended response was identified.";
  const changedWhy = preview.changedAudienceWhy ?? preview.investigateNext ?? "The decisive transition is still uncertain.";
  return {
    source: "ai",
    evidenceKind: "simulation",
    audienceSize: preview.perspectives.length,
    intendedPayoff: getTargetPayoff(workspace),
    audienceLanding: preview.likelyEmotionalLanding ?? preview.summary,
    match: previewMatch(preview),
    observedArc: preview.observedArc ?? [preview.likelyEmotionalLanding ?? "Unclear"],
    whatLanded: preview.whatLanded ?? strongestWhy,
    whereItDrifted: preview.whereItDrifted ?? weakestWhy,
    biggestOpportunity: preview.biggestOpportunity ?? changedWhy,
    strongestBeat: { beatId: preview.strongestBeatId ?? null, why: strongestWhy },
    weakestBeat: { beatId: preview.weakestBeatId ?? null, why: weakestWhy },
    mainRisk,
    changedAudience: { beatId: preview.changedAudienceBeatId ?? null, why: changedWhy },
    reactions: preview.perspectives.map((perspective) => ({
      label: personaLabels[perspective.persona] ?? perspective.persona,
      note: perspective.likelyResponse,
      evidence: perspective.watchFor,
    })),
    disagreements: preview.disagreements,
    evidenceStrength: preview.confidenceNote
      ?? `${preview.confidence ? `${preview.confidence[0].toUpperCase()}${preview.confidence.slice(1)}` : "Limited"} confidence for an AI simulation.`,
    methodology: "Six behavior and interpretation lenses read the same storyboard independently, then Payoff compared their likely reactions with your target.",
    provenance: "AI-simulated perspectives. No human responses are included.",
    testedAt: preview.createdAt,
    storyVersionId: preview.storyVersionId,
  };
}

function countsByEmotion(responses: AudienceReaction[]) {
  return responses.reduce<Partial<Record<ReactionEmotion, number>>>((counts, response) => {
    counts[response.endingEmotion] = (counts[response.endingEmotion] ?? 0) + 1;
    return counts;
  }, {});
}

function humanReactionNotes(responses: AudienceReaction[]) {
  const consented = responses.filter((response) => response.quoteConsent).slice(0, 4);
  if (consented.length > 0) {
    return consented.map((response) => ({
      label: "Anonymous viewer",
      note: response.interpretation,
      evidence: response.changedWhy,
    }));
  }
  const counts = countsByEmotion(responses);
  const [topEmotion, topCount] = Object.entries(counts).sort((a, b) => b[1] - a[1])[0] ?? ["unclear", 0];
  return [
    { label: "Ending response", note: `${topCount} of ${responses.length} viewers reported ${topEmotion}.` },
    { label: "Surprise", note: `${responses.filter((response) => response.wasSurprised).length} of ${responses.length} viewers said the story surprised them.` },
  ];
}

function humanEvidenceStrength(count: number) {
  if (count >= 12) return `Stronger human evidence · ${count} valid target-blind responses.`;
  if (count >= 4) return `Developing human evidence · ${count} valid target-blind responses.`;
  return `Early human signal · ${count} valid target-blind ${count === 1 ? "response" : "responses"}.`;
}

export function getHumanAudienceResult(workspace: Workspace): AudienceResultViewModel | null {
  const reactionSet = workspace.reactionSet;
  if (reactionSet.storyVersionId !== workspace.activeVersionId || reactionSet.responses.length === 0) return null;
  const responseIds = reactionSet.responses.map((response) => response.id).sort();
  const report = workspace.humanReports.find((candidate) =>
    candidate.storyVersionId === workspace.activeVersionId
    && candidate.storyHash === reactionSet.storyHash
    && candidate.responseIds.length === responseIds.length
    && [...candidate.responseIds].sort().every((id, index) => id === responseIds[index]),
  );
  if (!report) return null;
  const rehearsal = reactionSet.evidenceKind === "rehearsal";
  return {
    source: "human",
    evidenceKind: rehearsal ? "rehearsal" : "human",
    audienceSize: reactionSet.responses.length,
    intendedPayoff: getTargetPayoff(workspace),
    audienceLanding: report.audienceLanding,
    match: report.match,
    observedArc: report.observedArc,
    whatLanded: report.whatLanded,
    whereItDrifted: report.whereItDrifted,
    biggestOpportunity: report.biggestOpportunity,
    strongestBeat: { beatId: report.strongestBeatId, why: report.strongestBeatWhy },
    weakestBeat: { beatId: report.weakestBeatId, why: report.weakestBeatWhy },
    mainRisk: report.mainRisk,
    changedAudience: { beatId: report.changedAudienceBeatId, why: report.changedAudienceWhy },
    reactions: humanReactionNotes(reactionSet.responses),
    disagreements: [],
    evidenceStrength: rehearsal
      ? `Rehearsal data · ${reactionSet.responses.length} synthetic fixture ${reactionSet.responses.length === 1 ? "response" : "responses"}. Not human evidence.`
      : humanEvidenceStrength(reactionSet.responses.length),
    methodology: rehearsal
      ? "Synthetic responses exercise the same target-blind import, normalization, version binding, and report rendering used for Human Audience evidence."
      : "Real viewers watched the full story without seeing your target, then answered the same response questions. Payoff organized those responses into this report.",
    provenance: rehearsal
      ? "Development-only rehearsal fixture for this exact story. No real viewer claim is made."
      : `${reactionSet.responses.length} anonymous target-blind ${reactionSet.responses.length === 1 ? "response" : "responses"} from this exact story. AI Audience data is not included.`,
    testedAt: reactionSet.collectedAt ?? report.createdAt,
    storyVersionId: report.storyVersionId,
  };
}

export function toDiagnosisEvidence(result: AudienceResultViewModel): NormalizedAudienceEvidence {
  return {
    audience_landing: result.audienceLanding,
    match: result.match,
    observed_arc: result.observedArc,
    what_landed: result.whatLanded,
    where_it_drifted: result.whereItDrifted,
    biggest_opportunity: result.biggestOpportunity,
    strongest_beat: { beat_id: result.strongestBeat.beatId, why: result.strongestBeat.why },
    weakest_beat: { beat_id: result.weakestBeat.beatId, why: result.weakestBeat.why },
    main_risk: result.mainRisk,
    changed_audience: { beat_id: result.changedAudience.beatId, why: result.changedAudience.why },
    reaction_notes: result.reactions.map((reaction) => [reaction.label, reaction.note, reaction.evidence].filter(Boolean).join(": ")),
    evidence_strength: result.evidenceStrength,
  };
}
