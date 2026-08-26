import { RESEARCH_MIN_SAMPLE } from "./seed";
import type { AudienceReaction, ReactionEmotion, StoryBeat, StoryVersion, Workspace } from "./types";

export function getActiveVersion(workspace: Workspace): StoryVersion {
  const version = workspace.versions.find((candidate) => candidate.id === workspace.activeVersionId);
  if (!version) throw new Error("The active story version is missing.");
  return version;
}

export function getTestedVersion(workspace: Workspace): StoryVersion {
  const version = workspace.versions.find((candidate) => candidate.id === workspace.testedVersionId);
  if (!version) throw new Error("The tested story version is missing.");
  return version;
}

export function getActiveBeats(workspace: Workspace): StoryBeat[] {
  return [...getActiveVersion(workspace).beats].sort((a, b) => a.order - b.order);
}

export function isActiveVersionTested(workspace: Workspace): boolean {
  return workspace.activeVersionId === workspace.testedVersionId;
}

export function getEvidenceLabel(workspace: Workspace): string {
  const count = workspace.reactionSet.responses.length;
  if (!isActiveVersionTested(workspace)) return "Untested revision · based on tested v1";
  if (count >= RESEARCH_MIN_SAMPLE) return `Tested v1 · ${count} ${count === 1 ? "viewer" : "viewers"}`;
  return `Research in progress · ${count}/${RESEARCH_MIN_SAMPLE} minimum`;
}

export function countEndingEmotions(responses: AudienceReaction[]): Partial<Record<ReactionEmotion, number>> {
  return responses.reduce<Partial<Record<ReactionEmotion, number>>>((counts, response) => {
    counts[response.endingEmotion] = (counts[response.endingEmotion] ?? 0) + 1;
    return counts;
  }, {});
}

export function countTurningBeats(responses: AudienceReaction[]): Record<string, number> {
  return responses.reduce<Record<string, number>>((counts, response) => {
    counts[response.changedBeatId] = (counts[response.changedBeatId] ?? 0) + 1;
    return counts;
  }, {});
}

export function predictionSummary(responses: AudienceReaction[]) {
  const predicted = responses.filter((response) => response.predictionPoint !== "not_predicted");
  return {
    predictedCount: predicted.length,
    notPredictedCount: responses.length - predicted.length,
    earliestPrediction: predicted
      .map((response) => response.predictionPoint)
      .sort()[0] ?? null,
  };
}
