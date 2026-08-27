import type { ProjectBrief, ReactionSet, StoryBeat, StoryVersion, StudyStimulus, Workspace } from "./types";

export const RESEARCH_MIN_SAMPLE = 12;
export const BASELINE_VERSION_ID = "looks-great-v1";
export const INITIAL_VERSION_ID = "payoff-start-v0";

export const PROJECT_BRIEF: ProjectBrief = {
  id: "looks-great",
  title: "Looks Great",
  topic: "A distracted father finally sees what his daughter has been trying to show him",
  format: "45-second vertical short",
  audienceFeeling: "Familiar amusement, then a small gut punch, then warmth",
  targetSummary: "Familiar amusement → small gut punch → warmth",
  target: {
    setupEmotion: "Familiar amusement",
    payoffEmotion: "Small gut punch → warmth",
    realization: "His automatic praise made the phone feel more present than he was.",
    constraints: [
      "Keep the story visual and understandable with minimal language.",
      "Let the father repair the moment without turning him into a villain.",
    ],
  },
};

export const BASELINE_BEATS: StoryBeat[] = [
  {
    id: "beat-1",
    order: 1,
    title: "Dad, look",
    action: "A girl proudly holds up a drawing. Dad stays focused on his phone.",
    line: "Looks great.",
    narrativeRole: "setup",
    intendedEmotion: "familiar amusement",
    artKey: "drawing_offer",
  },
  {
    id: "beat-2",
    order: 2,
    title: "Again",
    action: "On another day, she brings a new drawing. Dad still does not look up.",
    line: "Love it.",
    narrativeRole: "setup",
    intendedEmotion: "amused recognition",
    artKey: "drawing_again",
  },
  {
    id: "beat-3",
    order: 3,
    title: "The pattern",
    action: "Drawings accumulate on the refrigerator as the same distracted praise repeats.",
    line: "",
    narrativeRole: "escalation",
    intendedEmotion: "recognition",
    artKey: "fridge_gallery",
  },
  {
    id: "beat-4",
    order: 4,
    title: "She stops asking",
    action: "The girl quietly adds one more drawing herself, then walks away.",
    line: "",
    narrativeRole: "turn",
    intendedEmotion: "small hurt",
    artKey: "quiet_fridge",
  },
  {
    id: "beat-5",
    order: 5,
    title: "The payoff",
    action: "Dad finally notices: a large phone sits in his place beside the girl.",
    line: "DAD",
    narrativeRole: "payoff",
    intendedEmotion: "gut punch",
    artKey: "phone_dad_drawing",
  },
  {
    id: "beat-6",
    order: 6,
    title: "The response",
    action: "Dad puts his phone face down and sits beside her. She slides him a crayon.",
    line: "",
    narrativeRole: "payoff",
    intendedEmotion: "warmth",
    artKey: "crayon_together",
  },
];

function fnv1a(value: string) {
  let hash = 0x811c9dc5;
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

export function storyContentHash(projectId: string, versionId: string, beats: StoryBeat[]) {
  const normalizedBeats = beats.map((beat) => ({
    id: beat.id,
    order: beat.order,
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    intendedEmotion: beat.intendedEmotion,
    artKey: beat.artKey,
  }));
  return `fnv1a:${fnv1a(JSON.stringify({ projectId, versionId, beats: normalizedBeats }))}`;
}

export const BASELINE_CONTENT_HASH = storyContentHash(PROJECT_BRIEF.id, BASELINE_VERSION_ID, BASELINE_BEATS);

export function studyBeatsWithoutTarget(beats: StoryBeat[]): StudyStimulus["beats"] {
  return beats.map((beat) => ({
    id: beat.id,
    order: beat.order,
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    artKey: beat.artKey,
  }));
}

export const CANONICAL_STUDY: StudyStimulus = {
  schema: "payoff-study/v1",
  projectId: PROJECT_BRIEF.id,
  title: PROJECT_BRIEF.title,
  format: PROJECT_BRIEF.format,
  storyVersionId: BASELINE_VERSION_ID,
  storyHash: BASELINE_CONTENT_HASH,
  beats: studyBeatsWithoutTarget(BASELINE_BEATS),
};

function canonicalReactionSet(): ReactionSet {
  return {
    id: "looks-great-study-v1",
    storyVersionId: BASELINE_VERSION_ID,
    storyHash: BASELINE_CONTENT_HASH,
    collectedAt: null,
    method:
      "Target-blind uninterrupted first viewing, immediate post-view questionnaire, optional labeled second pass.",
    responses: [],
  };
}

function emptyVersion(id = INITIAL_VERSION_ID): StoryVersion {
  return {
    id,
    number: 0,
    parentVersionId: null,
    createdAt: "2026-08-26T16:00:00.000Z",
    source: "system",
    reason: "Empty storyboard",
    beats: [],
  };
}

export function createSeedWorkspace(): Workspace {
  return {
    schemaVersion: 3,
    workflow: { stage: "define", source: null },
    project: structuredClone(PROJECT_BRIEF),
    activeVersionId: INITIAL_VERSION_ID,
    testedVersionId: BASELINE_VERSION_ID,
    revisionSequence: 0,
    versions: [emptyVersion()],
    reactionSet: canonicalReactionSet(),
    reactionHistory: [],
    humanTest: null,
    aiPreviews: [],
    humanReports: [],
    activity: [],
  };
}

export function createCanonicalWorkspace(): Workspace {
  const workspace = createSeedWorkspace();
  workspace.workflow = { stage: "storyboard", source: "starter" };
  workspace.activeVersionId = BASELINE_VERSION_ID;
  workspace.revisionSequence = 1;
  workspace.versions = [{
    id: BASELINE_VERSION_ID,
    number: 1,
    parentVersionId: null,
    createdAt: "2026-08-26T16:00:00.000Z",
    source: "system",
    reason: "Original storyboard",
    beats: structuredClone(BASELINE_BEATS),
  }];
  workspace.humanTest = structuredClone(CANONICAL_STUDY);
  return workspace;
}
