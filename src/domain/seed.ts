import type { ProjectBrief, StoryBeat, Workspace } from "./types";

export const RESEARCH_MIN_SAMPLE = 12;
export const BASELINE_VERSION_ID = "nothing-urgent-v1";

export const PROJECT_BRIEF: ProjectBrief = {
  id: "nothing-urgent",
  title: "Nothing Urgent",
  topic: "Outsourcing intimacy to AI",
  format: "60-second vertical short",
  target: {
    setupEmotion: "Amused by the convenience",
    payoffEmotion: "An oh-shit realization",
    realization: "Neither person is participating in the relationship anymore.",
    constraints: ["Keep the setup quick and recognizably funny."],
  },
};

export const BASELINE_BEATS: StoryBeat[] = [
  {
    id: "beat-1",
    order: 1,
    title: "Perfect response",
    action: "A suggested emoji appears over a long message from Mom. Eli taps it without reading.",
    line: "Suggested reply: 😂❤️",
    narrativeRole: "setup",
    intendedEmotion: "amused",
    artKey: "emoji_glow",
  },
  {
    id: "beat-2",
    order: 2,
    title: "Nothing urgent",
    action: "Mom's two-minute voice note compresses into a tidy three-word summary.",
    line: "Nothing urgent.",
    narrativeRole: "setup",
    intendedEmotion: "amused",
    artKey: "voice_wave",
  },
  {
    id: "beat-3",
    order: 3,
    title: "Warmly generated",
    action: "A loving paragraph writes itself while Eli keeps scrolling another feed.",
    line: "Make it warmer ✦",
    narrativeRole: "escalation",
    intendedEmotion: "amused",
    artKey: "auto_reply",
  },
  {
    id: "beat-4",
    order: 4,
    title: "A perfect streak",
    action: "Thirty effortless days of hearts, check-ins, and good-night texts flick past.",
    line: "30 day connection streak!",
    narrativeRole: "escalation",
    intendedEmotion: "uneasy",
    artKey: "message_streak",
  },
  {
    id: "beat-5",
    order: 5,
    title: "One unheard note",
    action: "The room is quiet. Mom's chair is empty. One last voice note remains unheard.",
    line: "2:14 · Not played",
    narrativeRole: "turn",
    intendedEmotion: "sad",
    artKey: "empty_chair",
  },
  {
    id: "beat-6",
    order: 6,
    title: "Automate grief",
    action: "At the funeral, Eli's phone lights his face with one final offer.",
    line: "Would you like help grieving?",
    narrativeRole: "payoff",
    intendedEmotion: "surprised",
    artKey: "funeral_phone",
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

export const BASELINE_CONTENT_HASH = `fnv1a:${fnv1a(JSON.stringify({
  projectId: PROJECT_BRIEF.id,
  versionId: BASELINE_VERSION_ID,
  beats: BASELINE_BEATS,
}))}`;

export const REVISED_ENDING: Record<"beat-5" | "beat-6", Omit<StoryBeat, "id" | "order">> = {
  "beat-5": {
    title: "Warmly, again",
    action: "Across town, Mom taps her own suggested reply without listening to Eli's note.",
    line: "Make it sound more maternal ✦",
    narrativeRole: "turn",
    intendedEmotion: "recognition",
    artKey: "mother_autoreply",
  },
  "beat-6": {
    title: "Still talking",
    action: "They sit alive in separate rooms while their phones continue the loving conversation alone.",
    line: "Connection streak: 31 days",
    narrativeRole: "payoff",
    intendedEmotion: "alarmed",
    artKey: "two_rooms",
  },
};

export function createSeedWorkspace(): Workspace {
  return {
    schemaVersion: 1,
    project: structuredClone(PROJECT_BRIEF),
    activeVersionId: BASELINE_VERSION_ID,
    testedVersionId: BASELINE_VERSION_ID,
    revisionSequence: 1,
    versions: [
      {
        id: BASELINE_VERSION_ID,
        number: 1,
        parentVersionId: null,
        createdAt: "2026-08-26T16:00:00.000Z",
        source: "system",
        reason: "Immutable audience-test baseline",
        beats: structuredClone(BASELINE_BEATS),
      },
    ],
    reactionSet: {
      id: "nothing-urgent-study-v1",
      storyVersionId: BASELINE_VERSION_ID,
      storyHash: BASELINE_CONTENT_HASH,
      collectedAt: null,
      method:
        "Target-blind uninterrupted first viewing, immediate post-view questionnaire, optional labeled second pass.",
      responses: [],
    },
    activity: [],
  };
}
