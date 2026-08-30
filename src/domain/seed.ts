import type { BeatVisual, ProjectBrief, ReactionSet, StoryBeat, StoryVersion, StudyStimulus, VisualContinuity, Workspace } from "./types";
import { EMPTY_VISUAL_CONTINUITY, canonicalArtwork, stableHash } from "./visuals";

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

export const LOOKS_GREAT_CONTINUITY: VisualContinuity = {
  characters: [
    { id: "dad", appearance: "Early 40s, short dark hair, charcoal sweater, dark trousers, gentle face that looks tired when distracted." },
    { id: "daughter", appearance: "Eight years old, dark ponytail, orange shirt, indigo trousers, expressive round face." },
  ],
  settings: [
    { id: "home", appearance: "Warm contemporary apartment kitchen-dining room with a pale refrigerator, small round wooden table, and soft cream walls." },
  ],
  importantProps: [
    { id: "phone", appearance: "Black smartphone with a cool blue screen." },
    { id: "drawings", appearance: "Child-made drawings on white paper in bold coral, yellow, and blue crayon." },
    { id: "orange-crayon", appearance: "Bright orange wax crayon." },
  ],
  timeOfDay: "Consistent warm daytime across all six beats; no time jump is part of the story.",
  lighting: "Soft cream daylight from the apartment window with stable warm-neutral exposure and color temperature; emotion must not change the environmental lighting.",
  style: "Polished minimal editorial storyboard illustration, warm geometric shapes, expressive body language, textured paper, limited cream-coral-yellow-blue palette.",
};

function visual(value: BeatVisual) {
  return value;
}

export const BASELINE_BEATS: StoryBeat[] = [
  {
    id: "beat-1",
    order: 1,
    title: "Dad, look",
    action: "The daughter proudly holds up her drawing while Dad keeps his eyes on his phone.",
    line: "Looks great.",
    narrativeRole: "setup",
    intendedEmotion: "familiar amusement",
    visual: canonicalArtwork("drawing_offer", visual({
      setting: "The family dining area in their warm apartment, beside the small table.",
      characters: [
        { id: "daughter", appearance: LOOKS_GREAT_CONTINUITY.characters[1].appearance, position: "Standing at the left edge of the table, leaning toward Dad.", action: "Offers a colorful drawing with both hands and watches Dad hopefully." },
        { id: "dad", appearance: LOOKS_GREAT_CONTINUITY.characters[0].appearance, position: "Seated on the right side of the table.", action: "Looks down at the phone in his hand instead of at the drawing." },
      ],
      focalAction: "Her drawing reaches toward Dad, but his gaze and body remain directed at the phone.",
      focalObject: "The offered drawing between them, contrasted with Dad's phone.",
      composition: "Place the drawing on the center sightline between daughter and Dad; make their opposing gaze directions instantly readable.",
      emotionalCue: "Her open hopeful posture contrasts with his unintentional inattention.",
      visibleText: "",
      continuityNotes: ["Establish the exact daughter, Dad, apartment, phone, and drawing palette reused in all six beats."],
    })),
  },
  {
    id: "beat-2",
    order: 2,
    title: "Another drawing",
    action: "The next day she brings another drawing. Dad praises it without looking away from his phone.",
    line: "Love it.",
    narrativeRole: "setup",
    intendedEmotion: "amused recognition",
    visual: canonicalArtwork("drawing_again", visual({
      setting: "The same dining area on the next day, under the same warm-neutral daytime lighting, with no calendar, date signage, or readable text.",
      characters: [
        { id: "daughter", appearance: LOOKS_GREAT_CONTINUITY.characters[1].appearance, position: "Standing in the same place with a different drawing.", action: "Offers a new heart drawing, slightly less exuberantly than before." },
        { id: "dad", appearance: LOOKS_GREAT_CONTINUITY.characters[0].appearance, position: "Seated in the same chair in the same clothes.", action: "Keeps his face and eyes angled down at the phone, never looking toward the daughter or drawing; his free hand rests passively." },
      ],
      focalAction: "A clearly different heart drawing is offered while Dad remains visibly absorbed in the phone, with his face and eyes directed downward and away from the drawing.",
      focalObject: "The new heart drawing held clearly between the daughter and Dad.",
      composition: "Echo beat one deliberately with the daughter offering the new heart drawing and Dad seated opposite her, still looking down at his phone. Preserve the same window light and leave a clean, uncluttered lower-center area. Show no other drawings, calendar, date signage, or readable text.",
      emotionalCue: "Recognition of a recurring pattern, with the daughter's hope beginning to soften.",
      visibleText: "DAY 2",
      continuityNotes: ["Same Dad, daughter, clothes, dining area, phone, and drawing style as beat one."],
    })),
  },
  {
    id: "beat-3",
    order: 3,
    title: "The fridge fills up",
    action: "Her drawings fill the refrigerator while Dad keeps offering the same distracted praise.",
    line: "",
    narrativeRole: "escalation",
    intendedEmotion: "recognition",
    visual: canonicalArtwork("fridge_gallery", visual({
      setting: "The same apartment kitchen, now dominated by the pale refrigerator covered in drawings.",
      characters: [
        { id: "daughter", appearance: LOOKS_GREAT_CONTINUITY.characters[1].appearance, position: "Near the refrigerator with one more picture.", action: "Looks from the accumulated drawings toward Dad." },
        { id: "dad", appearance: LOOKS_GREAT_CONTINUITY.characters[0].appearance, position: "At the dining table in the background.", action: "Raises one absent approving hand while still looking at his phone." },
      ],
      focalAction: "Many drawings visibly accumulate while Dad's unchanged phone-focused response continues in the same frame.",
      focalObject: "A refrigerator crowded with distinct child drawings.",
      composition: "Let the drawing-filled refrigerator occupy most of the frame; keep distracted Dad clearly readable in the remaining third.",
      emotionalCue: "The once-cute repetition now feels established and quietly consequential.",
      visibleText: "",
      continuityNotes: ["Reuse earlier drawings among the larger collection.", "Same Dad, daughter, clothes, refrigerator, table, and phone."],
    })),
  },
  {
    id: "beat-4",
    order: 4,
    title: "She stops asking",
    action: "The daughter quietly pins up her own drawing without asking Dad, then turns away.",
    line: "",
    narrativeRole: "turn",
    intendedEmotion: "small hurt",
    visual: canonicalArtwork("quiet_fridge", visual({
      setting: "The same kitchen and crowded refrigerator under the exact same soft cream daytime lighting as the earlier scenes.",
      characters: [
        { id: "daughter", appearance: LOOKS_GREAT_CONTINUITY.characters[1].appearance, position: "Alone at the refrigerator, turned partly away from Dad.", action: "Pins up a new drawing herself with lowered shoulders, then begins to leave." },
        { id: "dad", appearance: LOOKS_GREAT_CONTINUITY.characters[0].appearance, position: "Small and distant at the table on the far right.", action: "Remains absorbed in his phone and does not participate." },
      ],
      focalAction: "She completes the display ritual alone and no longer turns to Dad for approval.",
      focalObject: "Her hand pinning the newest drawing beside the accumulated pictures.",
      composition: "Separate daughter and Dad with strong empty space; focus on her self-sufficient pinning gesture and turned-away posture.",
      emotionalCue: "Quiet withdrawal rather than overt sadness.",
      visibleText: "",
      continuityNotes: ["Keep the same warm-neutral daytime exposure and color temperature; express the hurt only through her lowered shoulders, turned back, distance, and Dad's inattention."],
    })),
  },
  {
    id: "beat-5",
    order: 5,
    title: "A drawing of Dad",
    action: "Dad finally notices her drawing: a large phone labeled DAD sits in his chair beside her.",
    line: "DAD",
    narrativeRole: "payoff",
    intendedEmotion: "gut punch",
    visual: canonicalArtwork("phone_dad_drawing", visual({
      setting: "At the same refrigerator under the established warm-neutral daytime light, where one newest child drawing is pinned at Dad's eye level.",
      characters: [
        { id: "dad", appearance: LOOKS_GREAT_CONTINUITY.characters[0].appearance, position: "Large in the right foreground beside the refrigerator, face visible in profile.", action: "Lowers his real phone and locks his gaze on the phone-in-chair drawing with startled recognition." },
        { id: "daughter", appearance: LOOKS_GREAT_CONTINUITY.characters[1].appearance, position: "Depicted in simplified crayon form inside the drawing, seated alone at the left side of the family table.", action: "Faces the chair where Dad should be." },
      ],
      focalAction: "Dad unmistakably realizes that the daughter's drawing has replaced him with a giant phone in his usual chair across from her.",
      focalObject: "One large, simple child drawing of the familiar table: a small daughter alone in one chair and an oversized smartphone occupying Dad's opposite chair.",
      composition: "Use one close shot, never a split panel. Fill the left two thirds with one drawing and center the oversized phone in Dad's chair; show no duplicate. In the right third, align Dad's widened eyes and lowered real phone directly toward the drawn phone. Leave clean lower-center space below it for the DAD overlay.",
      emotionalCue: "A specific, immediate realization—not generic sadness.",
      visibleText: "DAD",
      continuityNotes: ["The chair and table inside the one drawing must match the real family dining area.", "Dad remains the same person in the same clothes and same light.", "The phone occupying Dad's chair is the first and dominant read; omit all other displayed drawings from this close framing."],
    })),
  },
  {
    id: "beat-6",
    order: 6,
    title: "He finally looks",
    action: "Dad puts his phone face down and joins his daughter as she offers him a crayon.",
    line: "",
    narrativeRole: "payoff",
    intendedEmotion: "warmth",
    visual: canonicalArtwork("crayon_together", visual({
      setting: "The same small dining table under the established soft cream daytime lighting.",
      characters: [
        { id: "dad", appearance: LOOKS_GREAT_CONTINUITY.characters[0].appearance, position: "Seated close beside his daughter at the table, turned fully toward her.", action: "Reaches for the crayon and joins the drawing instead of holding his phone." },
        { id: "daughter", appearance: LOOKS_GREAT_CONTINUITY.characters[1].appearance, position: "Beside Dad at the table.", action: "Smiles gently and places the orange crayon into his open hand." },
      ],
      focalAction: "The daughter hands Dad a crayon while he actively joins her; his phone is visibly face down and out of reach.",
      focalObject: "The orange crayon passing between their hands, with the face-down phone separated at frame edge.",
      composition: "Center their shared hands, crayon, and drawing; create one connected triangular grouping and isolate the discarded phone in a far corner.",
      emotionalCue: "Warm participation and earned reconnection.",
      visibleText: "",
      continuityNotes: ["Same Dad, daughter, clothes, table, apartment, phone, drawings, and orange crayon."],
    })),
  },
];

export function storyContentHash(projectId: string, versionId: string, beats: StoryBeat[], visualContinuity: VisualContinuity = EMPTY_VISUAL_CONTINUITY) {
  const normalizedBeats = beats.map((beat) => ({
    id: beat.id,
    order: beat.order,
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    intendedEmotion: beat.intendedEmotion,
    visual: beat.visual,
  }));
  return `fnv1a:${stableHash({ projectId, versionId, visualContinuity, beats: normalizedBeats })}`;
}

export const BASELINE_CONTENT_HASH = storyContentHash(PROJECT_BRIEF.id, BASELINE_VERSION_ID, BASELINE_BEATS, LOOKS_GREAT_CONTINUITY);

export function studyBeatsWithoutTarget(beats: StoryBeat[]): StudyStimulus["beats"] {
  return beats.map((beat) => ({
    id: beat.id,
    order: beat.order,
    title: beat.title,
    action: beat.action,
    line: beat.line,
    narrativeRole: beat.narrativeRole,
    visual: structuredClone(beat.visual),
  }));
}

export const CANONICAL_STUDY: StudyStimulus = {
  schema: "payoff-study/v2",
  projectId: PROJECT_BRIEF.id,
  title: PROJECT_BRIEF.title,
  format: PROJECT_BRIEF.format,
  storyVersionId: BASELINE_VERSION_ID,
  storyHash: BASELINE_CONTENT_HASH,
  visualContinuity: structuredClone(LOOKS_GREAT_CONTINUITY),
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
    visualContinuity: structuredClone(EMPTY_VISUAL_CONTINUITY),
    beats: [],
  };
}

export function createSeedWorkspace(): Workspace {
  return {
    schemaVersion: 4,
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
    visualContinuity: structuredClone(LOOKS_GREAT_CONTINUITY),
    beats: structuredClone(BASELINE_BEATS),
  }];
  workspace.humanTest = structuredClone(CANONICAL_STUDY);
  return workspace;
}
