import OpenAI from "openai";
import { zodTextFormat } from "openai/helpers/zod";
import type { VisualContinuity } from "../src/domain/types.ts";
import {
  SceneQualityStructuredOutputSchema,
  type SceneGenerationRequest,
  type SceneQualityReview,
} from "./aiSchemas.ts";
import { AIConfigurationError, AIProviderError } from "./openaiProvider.ts";

export type GeneratedSceneImage = {
  dataUrl: string;
  mimeType: "image/webp" | "image/png" | "image/jpeg";
};

export type SceneContinuityReference = {
  environment: GeneratedSceneImage;
  characters: Array<{ id: string; image: GeneratedSceneImage }>;
  previousScene?: { beatNumber: number; beatTitle: string; image: GeneratedSceneImage };
};

export type SceneImageProvider = {
  providerName?: string;
  model?: string;
  reviewModel?: string;
  prepareEnvironmentReference: (continuity: VisualContinuity) => Promise<GeneratedSceneImage>;
  prepareCharacterReference: (character: VisualContinuity["characters"][number], style: string) => Promise<GeneratedSceneImage>;
  generate: (input: SceneGenerationRequest, reference: SceneContinuityReference) => Promise<GeneratedSceneImage>;
  repair: (
    input: SceneGenerationRequest,
    reference: SceneContinuityReference,
    rejected: GeneratedSceneImage,
    clarification: string,
    strategy: "edit" | "regenerate",
  ) => Promise<GeneratedSceneImage>;
  review: (input: SceneGenerationRequest, reference: SceneContinuityReference, image: GeneratedSceneImage) => Promise<SceneQualityReview>;
};

const PRODUCT_VISUAL_STYLE = "Full-bleed minimal editorial storyboard illustration with clean hand-painted shapes, restrained texture, limited detail, expressive silhouette and body language, absolutely no photographic realism, and no outer matte, frame, border, or page margin.";

function continuityPrompt(input: SceneGenerationRequest) {
  const continuity = input.continuity;
  const visibleCharacterIds = new Set(input.beat.visual.characters.map((character) => character.id.toLowerCase()));
  const visibleCharacters = continuity.characters.filter((character) => visibleCharacterIds.has(character.id.toLowerCase()));
  const sceneLanguage = [
    input.beat.action,
    input.beat.visual.focalAction,
    input.beat.visual.focalObject,
    input.beat.visual.composition,
    ...input.beat.visual.characters.flatMap((character) => [character.action, character.position]),
    ...input.beat.visual.continuityNotes,
  ].join(" ").toLowerCase().replace(/[^a-z0-9]+/gu, " ");
  const relevantProps = continuity.importantProps.filter((prop) => {
    const tokens = prop.id.toLowerCase().split(/[^a-z0-9]+/gu).filter((token) => token.length > 1);
    return tokens.length > 0 && tokens.every((token) => sceneLanguage.includes(token));
  });
  return [
    `CHARACTER CONTINUITY FOR THIS FRAME ONLY:\n${visibleCharacters.map((item) => `- ${item.id}: ${item.appearance}`).join("\n") || "- No recurring named character is authorized in this frame."}`,
    `SETTING CONTINUITY:\n${continuity.settings.map((item) => `- ${item.id}: ${item.appearance}`).join("\n") || "- Use the beat setting."}`,
    `TIME-OF-DAY CONTINUITY:\n${continuity.timeOfDay || "Preserve one neutral time of day across the sequence unless this beat explicitly requires a transition."}`,
    `LIGHTING CONTINUITY:\n${continuity.lighting || "Preserve stable neutral lighting and color temperature across the sequence."}`,
    `PROP CONTINUITY FOR THIS FRAME ONLY:\n${relevantProps.map((item) => `- ${item.id}: ${item.appearance}`).join("\n") || "- No recurring prop is authorized beyond objects explicitly named in the beat."}`,
    `STYLE CONTINUITY:\n${continuity.style}`,
  ].join("\n\n");
}

export function scenePrompt(input: SceneGenerationRequest, clarification = "") {
  const visual = input.beat.visual;
  const withoutOverlayText = (value: string) => {
    if (!visual.visibleText) return value;
    return value
      .split(`labeled ${visual.visibleText}`).join("")
      .split(`labelled ${visual.visibleText}`).join("")
      .split(visual.visibleText).join("")
      .replace(/\s{2,}/gu, " ");
  };
  const characters = visual.characters.map((character) =>
    `- ${withoutOverlayText(character.id)} (${withoutOverlayText(character.appearance)}); position: ${withoutOverlayText(character.position)}; visible action: ${withoutOverlayText(character.action)}`,
  ).join("\n") || "- No character is required unless the focal action names one.";
  const exactTextInstruction = visual.visibleText
    ? "Leave a clean, uncluttered lower-center area. Do not draw any letters, numbers, symbols, captions, callouts, signage, or placeholder text anywhere. The action must remain understandable without typography."
    : "Do not include captions, labels, speech bubbles, watermarks, logos, or any other typography.";
  return `Use the supplied continuity reference only as the authoritative identity, wardrobe, prop, setting, palette, and drawing-style guide. Create an entirely new landscape composition for this exact narrative moment; do not reproduce the reference-sheet layout.

BEAT COPY:
Title: ${withoutOverlayText(input.beat.title)}
Visible action: ${withoutOverlayText(input.beat.action)}
Intended emotion: ${withoutOverlayText(input.beat.intendedEmotion)}

MANDATORY LITERAL TITLE PROMISE:
Every concrete person, object, action, and location named by “${withoutOverlayText(input.beat.title)}” must be plainly visible in the frame. A named door or doorway requires the actual doorway/opening in shot; “at the door” cannot be staged only at a table elsewhere in the room. Do not substitute an inferred or off-camera title element.

SCENE SPECIFICATION:
Setting: ${withoutOverlayText(visual.setting)}
Visible characters:
${characters}
Focal action: ${withoutOverlayText(visual.focalAction)}
Focal object: ${withoutOverlayText(visual.focalObject)}
Composition: ${withoutOverlayText(visual.composition)}
Emotional body-language cue: ${withoutOverlayText(visual.emotionalCue)}
Continuity notes: ${withoutOverlayText(visual.continuityNotes.join(" ") || "None.")}

${withoutOverlayText(continuityPrompt(input))}

ACCURACY RULES:
- Match every visible recurring person's face, age, hair, skin tone, body cues, and clothing to the supplied reference. Do not reinterpret or substitute a character.
- Preserve the reference environment's architecture, room layout, time of day, exposure, and color temperature unless this exact beat explicitly requires a visible change. Never use darkness, blue tint, weather, or cinematic grading merely to express emotion; use posture, gaze, distance, facial expression, and staging.
- Show exactly the recurring characters listed under Visible characters and no others. The continuity sheet is a design reference, not the cast list for this frame. Do not reveal an unlisted recurring person or animal in the background, a doorway, a reflection, or a partial silhouette. When a beat intentionally conceals someone, show only the exact clue named in the scene specification.
- Treat the structured scene specification as an exhaustive list of narrative clues. Do not invent an additional track, footprint type, personal item, animal trace, message, prop, evidence, reaction, or reveal. If a clue is not named for this beat, it must not appear, even as background detail.
- Render in this Payoff product style: ${PRODUCT_VISUAL_STYLE}
- The composition must communicate the relationship and action before decorative detail.
- Every required character and focal object must be clearly visible and spatially related as specified.
- When literal motion would be ambiguous in one frame, show the clearest resulting body position and object spacing: recoil through a strong backward body angle; retreat through an obvious gap; realization through an unbroken gaze line.
- When separation or retreat is the focal action, make the near object's edge end clearly before the moved person or object and expose uninterrupted floor or wall through the gap. Do not use perspective or an elongated table/counter that visually closes the required gap.
- Show one instance of each focal or important prop unless the beat explicitly requires multiples. Keep ordinary set dressing sparse and visually subordinate.
- Prefer a simpler accurate scene over a prettier ambiguous one.
- Show one readable moment, not a collage, montage, multi-panel layout, or generic stock pose.
- Fill the entire landscape canvas edge to edge with the scene. Do not add a white or black matte, inset frame, picture border, screenshot border, or empty margin around the illustration.
- ${exactTextInstruction}
- Keep faces and hands simple but expressive; do not make the image photorealistic.
${clarification ? `\nREPAIR DIRECTION FROM SEMANTIC REVIEW:\n${clarification}` : ""}`;
}

export function environmentReferencePrompt(continuity: VisualContinuity) {
  const settings = continuity.settings.map((setting) => `- ${setting.id}: ${setting.appearance}`).join("\n") || "- No recurring setting.";
  return `Create one landscape environment continuity reference for a six-scene storyboard. This is an internal image-model reference, not a story scene.

RECURRING SETTINGS:
${settings}

STORY-SPECIFIC STYLE NOTES:
${continuity.style}

TIME OF DAY:
${continuity.timeOfDay || "One stable neutral time across the sequence."}

LIGHTING BASELINE:
${continuity.lighting || "Stable neutral storyboard lighting with no arbitrary color-temperature changes."}

REFERENCE-SHEET RULES:
- Fill the complete landscape canvas edge to edge with the environment. The outermost pixels on all four sides must belong to the illustrated room; do not place the room inside a white or black matte, frame, outline rectangle, storyboard panel, page, border, or empty margin.
- Show clean, recognizable, unoccupied environment views with stable architecture, palette, shapes, and colors.
- Do not include story props, tracks, footprints, evidence, messages, clues, or reveal-specific objects. Those are supplied separately for the exact frame that needs them.
- Do not include any person, human figure, animal, face, portrait, reflection, silhouette, mannequin, or clothing display anywhere in the image.
- Use one unified Payoff product style: ${PRODUCT_VISUAL_STYLE}
- Translate mood and palette from the story-specific notes, but never render a photograph, film still, 3D scene, comic page, or multi-scene narrative.
- Do not draw names, captions, letters, numbers, logos, speech bubbles, watermarks, or other typography.`;
}

export function characterReferencePrompt(character: VisualContinuity["characters"][number], style: string) {
  return `Create one square identity reference portrait for exactly one recurring storyboard character.

CHARACTER IDENTITY:
${character.id}: ${character.appearance}

STORY-SPECIFIC STYLE NOTES:
${style}

IDENTITY-REFERENCE RULES:
- Show exactly one person or animal, waist-up, in a relaxed neutral three-quarter pose with the face, hair, skin or fur, body cues, and clothing clearly readable.
- Preserve every stated age, skin tone, hair detail, body cue, garment, accessory, and color exactly.
- Do not add a second person, companion, duplicate, inset portrait, setting, narrative action, prop not worn or carried, or background crowd.
- Use a plain warm neutral background and this unified Payoff product style: ${PRODUCT_VISUAL_STYLE}
- Never render a photograph, film still, or 3D character.
- Do not draw names, captions, letters, numbers, logos, speech bubbles, watermarks, or other typography.`;
}

function providerFailure(error: unknown, task: string): never {
  if (error instanceof AIProviderError || error instanceof AIConfigurationError) throw error;
  throw new AIProviderError(error instanceof Error ? error.message : `${task} failed.`, { cause: error });
}

export function createOpenAISceneReviewer(config: {
  apiKey?: string;
  model?: string;
}): SceneImageProvider["review"] {
  const apiKey = config.apiKey?.trim();
  if (!apiKey) return async () => { throw new AIConfigurationError("OPENAI_API_KEY is not configured."); };
  const reviewModel = config.model?.trim() || "gpt-5.4";
  const openai = new OpenAI({ apiKey, timeout: 100_000, maxRetries: 1 });
  return async (input, reference, image) => {
      try {
        const requiredIds = new Set(input.beat.visual.characters.map((character) => character.id.toLowerCase()));
        const characterReferences = reference.characters.filter((character) => requiredIds.has(character.id.toLowerCase()));
        const referenceContent = characterReferences.flatMap((character) => [
          { type: "input_text" as const, text: `Authoritative identity reference for recurring character ${character.id}:` },
          { type: "input_image" as const, image_url: character.image.dataUrl, detail: "high" as const },
        ]);
        const previousSceneContent = reference.previousScene ? [
          { type: "input_text" as const, text: `Immediately preceding accepted scene, beat ${reference.previousScene.beatNumber} “${reference.previousScene.beatTitle}”. Use it to audit room, wardrobe, lighting, and only story-relevant persistent state required by the current beat or continuity notes. It is not a checklist of every visible movable prop:` },
          { type: "input_image" as const, image_url: reference.previousScene.image.dataUrl, detail: "high" as const },
        ] : [];
        const response = await openai.responses.parse({
          model: reviewModel,
          store: false,
          instructions: `You are a strict but practical semantic storyboard image reviewer. The supplied images include authoritative environment and character continuity references, optionally the immediately preceding accepted scene, and then the candidate story scene. Compare the candidate with the structured beat and every labeled reference. The previous scene is authoritative for persistent room design, wardrobe, lighting, and story-relevant accumulated state, but camera angle and beat-required action may change. The previous frame is not a checklist of every object visible in it. Require a prior prop to remain visible only when the current beat, continuity notes, focal action, or accumulated narrative state makes that prop materially relevant. Ordinary movable props and set dressing—including cups, plates, food, and chairs not involved in the current action—may move, be occluded, or leave frame. Do not let explicitly required accumulated drawings, evidence, damage, or other story state disappear unless the current beat says it changes. The candidate must fill its canvas edge to edge; a white or black matte, inset frame, picture border, screenshot border, or empty outer margin is a material layout failure. Ignore artistic polish and judge at storyboard-card granularity: pass when a first-time viewer can quickly understand the beat title, prose action, emotional relationship, and story consequence without reading the description. Set story_core_clear true only when the candidate agrees with the title, prose action, dialogue or on-screen text context, and focal story action. Audit every concrete title promise literally: if a title names a doorway, door, entrance, exit, table, chair, handoff, or other visible place, object, or action, that promised element and relationship must be visibly present in the candidate; being merely off-camera or inferable is not enough. Set emotional_purpose_clear true only when staging, gaze, expression, or body language clearly conveys the intended emotional purpose. Set material_failure true only for a defect that would mislead a creator about the story beat, reveal, continuity, or focal relationship; cosmetic deviations and optional polish are never material failures. passed must reflect material storytelling correctness and should be true whenever story_core_clear and emotional_purpose_clear are true and material_failure is false. The title, prose action, focal story action, required cast, recognizable focal object, and emotional purpose are material requirements. Composition notes and character-level prop gestures are production direction: fail them only when their absence makes the promised story moment ambiguous, contradictory, or misleading. Do not reject an unmistakable pause, realization, recoil, or relationship merely because a secondary mug, hand, chair, or gaze cue is not in the ideal exact position. A clear post-action state may communicate motion: a person visibly leaning back can communicate recoil, and a chair plus seated person visibly separated from a table can communicate retreat. Do not demand an invisible instant of motion when the resulting spatial state is immediately legible. Candidate pixels must not contain narrative typography that substitutes for the scene, duplicates beat.visual.visibleText, exposes a clue, changes story meaning, or is conspicuously garbled or distracting. When beat.visual.visibleText is nonempty, explicitly inspect the candidate for that exact word or phrase: if the pixels already draw it, set unexpected_object_or_clue and material_failure true because Payoff will overlay it separately. Captions, dialogue, speech bubbles, watermarks, logos, story-specific labels, device messages, and attempted overlay text are material failures. A context-neutral single digit or ordinary environmental marking—such as a small contestant number at a bake-off—is cosmetic and must not fail an otherwise correct scene. Do not fail abstract crayon strokes, non-alphanumeric decorative marks, blank screen highlights, or a shape that merely resembles one letter. focal_object_present means the recognizable object category and function are visible; record harmless exact-detail variance under prop_continuity_consistent instead of claiming the object is absent. Pass only if every required character and recognizable focal object is present, the focal story action and spatial relationship are understandable, and nothing materially contradicts the beat. contradiction means a narrative or physical contradiction, never a cosmetic wardrobe or prop-detail variance. Fail physically impossible or narratively confusing spatial staging, such as a person apparently seated on one chair while carrying an unexplained duplicate chair when the chair movement is the focal action. Grade continuity explicitly: identity_consistent covers face, age, hair, skin tone, and body cues; wardrobe_consistent covers stated garments and colors while allowing incidental visibility differences such as socks, shoes, rolled sleeves, or occlusion unless they visibly replace or contradict a declared garment; setting_consistent covers the recurring location and architecture; room_layout_consistent covers stable architecture and major room design while allowing a new camera angle, normal movable furniture, and story-required furniture movement; lighting_consistent covers the declared time of day, exposure, and color temperature with no unmotivated darkness, blue tint, weather, or cinematic grading; prop_continuity_consistent covers only recurring props that materially matter in this frame, including their recognizable identity, function, material, dominant color, and accumulated narrative state. Do not mark prop continuity false merely because an ordinary movable prop from the previous frame is now off-camera or occluded. Allow harmless minor geometry or quantity variation in ordinary consumables and set dressing—such as triangular versus rectangular toast—unless that exact shape or count is itself a story clue, title promise, or required focal action. A minor wardrobe or prop variance may make its specific continuity flag false while passed remains true and material_failure remains false. continuity_consistent may be true only when all six specific continuity checks are true. Emotional change should appear through body language, staging, distance, gaze, and expression rather than environmental drift. Treat beat.visual.characters as the complete allowed recurring cast for this exact frame: if any recurring person or animal appears without being listed there, unexpected_character_or_reveal and material_failure must be true and the scene must fail. Treat the beat's structured visual specification as the complete allowed set of narrative clues: if the candidate adds any undeclared footprint type, track, personal item, animal trace, message, evidence, prop, or other clue that changes what the viewer can infer, unexpected_object_or_clue and material_failure must be true and the scene must fail. Ordinary context-neutral set dressing is allowed: do not fail an extra blank breakfast plate, cup, chair, plant, lamp, or similar object merely because it was not enumerated, unless it creates an impossible focal action, changes story meaning, introduces a clue, or materially breaks established continuity. Do not treat an expected plate beneath toast as an unexpected clue. Also fail when a character, object, clue, or relationship reserved for a later reveal appears early, or when continuity notes require concealment but the candidate exposes more than the specified clue. If failing, name the single highest-leverage exact edit in one concise clarification that an image editor can apply to the supplied candidate while preserving everything already correct.`,
          input: [{
            role: "user",
            content: [
              { type: "input_text", text: JSON.stringify({ continuity: input.continuity, beat: input.beat }) },
              { type: "input_text", text: "People-free environment and prop continuity reference:" },
              { type: "input_image", image_url: reference.environment.dataUrl, detail: "high" },
              ...referenceContent,
              ...previousSceneContent,
              { type: "input_text", text: `MANDATORY TITLE AUDIT: The candidate must visibly and literally fulfill every concrete person, object, action, and location named by the title “${input.beat.title}”. A named door or doorway requires the actual doorway/opening in frame; an off-camera location does not pass. Also fail if the candidate pixels already draw the exact product-overlay text “${input.beat.visual.visibleText || "(none)"}”.` },
              { type: "input_text", text: "Candidate story scene to judge:" },
              { type: "input_image", image_url: image.dataUrl, detail: "high" },
            ],
          }],
          max_output_tokens: 1200,
          text: { format: zodTextFormat(SceneQualityStructuredOutputSchema, "payoff_scene_quality") },
        });
        if (!response.output_parsed) throw new AIProviderError("The scene review was incomplete.");
        return response.output_parsed;
      } catch (error) { return providerFailure(error, "Scene review"); }
    };
}
