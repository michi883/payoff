import { GoogleGenAI } from "@google/genai";
import sharp from "sharp";
import type { VisualContinuity } from "../src/domain/types.ts";
import { sceneContentHash } from "../src/domain/visuals.ts";
import type { SceneGenerationRequest } from "./aiSchemas.ts";
import { AIConfigurationError, AIProviderError } from "./openaiProvider.ts";
import {
  characterReferencePrompt,
  createOpenAISceneReviewer,
  environmentReferencePrompt,
  scenePrompt,
  type GeneratedSceneImage,
  type SceneContinuityReference,
  type SceneImageProvider,
} from "./sceneImageProvider.ts";

export const DEFAULT_GEMINI_IMAGE_MODEL = "gemini-3.1-flash-lite-image";

type GeminiInput =
  | { type: "text"; text: string }
  | { type: "image"; mime_type: GeneratedSceneImage["mimeType"]; data: string };

function providerFailure(error: unknown, task: string): never {
  if (error instanceof AIProviderError || error instanceof AIConfigurationError) throw error;
  throw new AIProviderError(error instanceof Error ? error.message : `${task} failed.`, { cause: error });
}

function imageInput(image: GeneratedSceneImage): GeminiInput {
  const match = /^data:(image\/(?:webp|png|jpeg));base64,([A-Za-z0-9+/=]+)$/u.exec(image.dataUrl);
  if (!match) throw new AIProviderError("The visual reference was not a valid image.");
  return { type: "image", mime_type: match[1] as GeneratedSceneImage["mimeType"], data: match[2] };
}

async function generatedImage(output: { data?: string; mime_type?: string } | undefined): Promise<GeneratedSceneImage> {
  const data = output?.data;
  const mimeType = output?.mime_type;
  if (!data || !/^[A-Za-z0-9+/=]+$/u.test(data)) throw new AIProviderError("The Gemini image model did not return image data.");
  if (mimeType !== "image/jpeg" && mimeType !== "image/png" && mimeType !== "image/webp") {
    throw new AIProviderError("The Gemini image model returned an unsupported image format.");
  }
  const normalized = await sharp(Buffer.from(data, "base64"), { limitInputPixels: 20_000_000 })
    .rotate()
    .resize({ width: 1024, height: 1024, fit: "inside", withoutEnlargement: true })
    .jpeg({ quality: 78, progressive: true, mozjpeg: true })
    .toBuffer();
  return { dataUrl: `data:image/jpeg;base64,${normalized.toString("base64")}`, mimeType: "image/jpeg" };
}

function sceneReferenceInput(input: SceneGenerationRequest, reference: SceneContinuityReference, clarification = "") {
  const requiredIds = new Set(input.beat.visual.characters.map((character) => character.id.toLowerCase()));
  const characters = reference.characters.filter((character) => requiredIds.has(character.id.toLowerCase()));
  if (characters.length !== requiredIds.size) throw new AIProviderError("A required character identity reference was missing.");

  const labels = [
    "REFERENCE IMAGE ORDER:",
    "- Image 1 is the authoritative people-free environment and palette reference.",
    ...characters.map((character, index) => `- Image ${index + 2} is the authoritative identity and wardrobe reference for ${character.id}.`),
    ...(reference.previousScene
      ? [`- Image ${characters.length + 2} is the immediately preceding accepted scene, beat ${reference.previousScene.beatNumber} “${reference.previousScene.beatTitle}”. Preserve its room, wardrobe, lighting, and only story state required by the current beat or continuity notes. Ordinary movable props may move, be occluded, or leave frame.`]
      : []),
    "Use the references only for continuity. Compose a new scene and do not reproduce a reference-sheet layout.",
  ].join("\n");

  return [
    { type: "text", text: `${scenePrompt(input, clarification)}\n\n${labels}` } satisfies GeminiInput,
    imageInput(reference.environment),
    ...characters.map((character) => imageInput(character.image)),
    ...(reference.previousScene ? [imageInput(reference.previousScene.image)] : []),
  ];
}

export function createGeminiSceneImageProvider(config: {
  apiKey?: string;
  model?: string;
  reviewApiKey?: string;
  reviewModel?: string;
}): SceneImageProvider {
  const apiKey = config.apiKey?.trim();
  const review = createOpenAISceneReviewer({ apiKey: config.reviewApiKey, model: config.reviewModel });
  if (!apiKey) {
    const unavailable = async () => { throw new AIConfigurationError("GEMINI_API_KEY is not configured."); };
    return { providerName: "google", model: DEFAULT_GEMINI_IMAGE_MODEL, reviewModel: config.reviewModel, prepareEnvironmentReference: unavailable, prepareCharacterReference: unavailable, generate: unavailable, repair: unavailable, review };
  }

  const model = config.model?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
  const gemini = new GoogleGenAI({
    apiKey,
    httpOptions: { timeout: 100_000 },
  });

  const createImage = async (input: string | GeminiInput[], task: string, aspectRatio: "1:1" | "16:9") => {
    const inputItems = typeof input === "string" ? 1 : input.length;
    const inputBytes = typeof input === "string"
      ? Buffer.byteLength(input)
      : input.reduce((sum, item) => sum + Buffer.byteLength(item.type === "text" ? item.text : item.data), 0);
    const startedAt = Date.now();
    console.info("[Payoff AI:gemini-request]", JSON.stringify({ task, model, aspect_ratio: aspectRatio, input_items: inputItems, input_bytes: inputBytes }));
    try {
      const response = await gemini.interactions.create({
        model,
        input,
        response_format: {
          type: "image",
          mime_type: "image/jpeg",
          aspect_ratio: aspectRatio,
          image_size: "1K",
        },
      }, { timeout_ms: 100_000 });
      if (!response.output_image) {
        const providerErrors = response.errors
          ?.map((error) => [error.code, error.message].filter(Boolean).join(": "))
          .filter(Boolean)
          .join("; ");
        throw new AIProviderError(providerErrors
          ? `Gemini did not return an image: ${providerErrors}`
          : "Gemini did not return an image or an actionable provider error.");
      }
      const image = await generatedImage(response.output_image);
      console.info("[Payoff AI:gemini-response]", JSON.stringify({
        task,
        model,
        interaction_id: response.id,
        latency_ms: Date.now() - startedAt,
        provider_error_count: response.errors?.length ?? 0,
        output_mime_type: image.mimeType,
        output_bytes: image.dataUrl.length,
      }));
      return image;
    } catch (error) {
      return providerFailure(error, task);
    }
  };

  return {
    providerName: "google",
    model,
    reviewModel: config.reviewModel?.trim() || "gpt-5.4",
    prepareEnvironmentReference: (continuity: VisualContinuity) =>
      createImage(environmentReferencePrompt(continuity), "Environment reference generation", "16:9"),
    prepareCharacterReference: (character: VisualContinuity["characters"][number], style: string) =>
      createImage(characterReferencePrompt(character, style), "Character reference generation", "1:1"),
    generate: async (input, reference) => {
      if (sceneContentHash(input.beat.visual, input.continuity) !== input.content_hash) {
        throw new AIProviderError("The requested scene hash does not match its visual specification.");
      }
      const references = sceneReferenceInput(input, reference);
      return createImage(references, "Scene generation", "16:9");
    },
    repair: async (input, reference, rejected, clarification, strategy) => {
      if (sceneContentHash(input.beat.visual, input.continuity) !== input.content_hash) {
        throw new AIProviderError("The requested scene hash does not match its visual specification.");
      }
      const references = sceneReferenceInput(input, reference, clarification);
      if (strategy === "regenerate") {
        references.push({
          type: "text",
          text: `STRUCTURAL REPAIR — compose a fresh single-frame scene from the continuity references. Do not imitate the rejected layout. Apply every part of this direction:\n${clarification}\nUse exactly one continuous environment and no split panel, inset, border, second room, duplicated table, or duplicated focal furniture. Return only the corrected scene.`,
        });
        return createImage(references, "Structural scene regeneration", "16:9");
      }
      const prompt = references[0];
      if (prompt.type === "text") {
        prompt.text += `\n\nCANDIDATE-AWARE REPAIR TASK:\nThe final supplied image is the rejected candidate, not another continuity reference. Edit that candidate into a corrected version. Preserve its character identities, wardrobe, environment, lighting, palette, and every already-correct element. Change only what is necessary to apply this semantic-review direction:\n${clarification}\nReturn only the corrected full scene, never a comparison, split panel, before/after layout, contact sheet, or reference sheet.`;
      }
      references.push(
        { type: "text", text: "REJECTED CANDIDATE TO EDIT:" },
        imageInput(rejected),
        {
          type: "text",
          text: `FINAL REQUIRED EDIT — apply this to the immediately preceding candidate image:\n${clarification}\n\nBefore returning, verify every item in this scene checklist is visibly true:\n- Focal action: ${input.beat.visual.focalAction}\n- Focal object: ${input.beat.visual.focalObject}\n${input.beat.visual.characters.map((character) => `- ${character.id}: ${character.action}; position: ${character.position}`).join("\n")}\n- Preserve the same character identities, wardrobe, environment architecture, time of day, lighting, and palette.\nReturn one corrected full scene only. Do not return the candidate unchanged. Do not add a comparison, panel, duplicate focal prop, extra person, or typography.`,
        },
      );
      return createImage(references, "Candidate-aware scene repair", "16:9");
    },
    review,
  };
}
