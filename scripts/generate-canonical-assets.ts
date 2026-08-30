import { mkdir, mkdtemp, rename, rm, stat, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { loadEnv } from "vite";
import {
  SceneContinuityReferenceSchema,
  type SceneContinuityReference,
} from "../server/aiSchemas.ts";
import {
  createGeminiSceneImageProvider,
  DEFAULT_GEMINI_IMAGE_MODEL,
} from "../server/geminiSceneImageProvider.ts";
import { handleScene } from "../server/sceneHandler.ts";
import { BASELINE_BEATS, LOOKS_GREAT_CONTINUITY } from "../src/domain/seed.ts";
import { sceneContentHash } from "../src/domain/visuals.ts";

const workspaceRoot = process.cwd();
const fileEnv = loadEnv("development", workspaceRoot, "");
const runtimeEnv = { ...fileEnv, ...process.env };
const outputRoot = resolve(workspaceRoot, "public/canonical");
const selectedModel = runtimeEnv.GEMINI_IMAGE_MODEL?.trim() || DEFAULT_GEMINI_IMAGE_MODEL;
const force = process.argv.includes("--force");
const selectedBeatValue = process.argv.find((value) => value.startsWith("--beat="))?.slice("--beat=".length);
const selectedBeats = selectedBeatValue
  ? selectedBeatValue.split(",").map((value) => Number.parseInt(value, 10))
  : [];
const MAX_CURATION_ATTEMPTS = 1;

if (selectedBeats.some((beatNumber) => !Number.isInteger(beatNumber) || beatNumber < 1 || beatNumber > BASELINE_BEATS.length)) {
  throw new Error(`--beat must be one or more comma-separated values between 1 and ${BASELINE_BEATS.length}.`);
}
if (!runtimeEnv.GEMINI_API_KEY?.trim()) throw new Error("GEMINI_API_KEY is not configured in .env or the runtime environment.");
if (!runtimeEnv.OPENAI_API_KEY?.trim()) throw new Error("OPENAI_API_KEY is required for the production semantic image review gate.");
if (selectedModel !== DEFAULT_GEMINI_IMAGE_MODEL) {
  throw new Error(`Canonical production assets must use ${DEFAULT_GEMINI_IMAGE_MODEL}; received ${selectedModel}.`);
}

const provider = createGeminiSceneImageProvider({
  apiKey: runtimeEnv.GEMINI_API_KEY,
  model: selectedModel,
  reviewApiKey: runtimeEnv.OPENAI_API_KEY,
  reviewModel: runtimeEnv.OPENAI_SCENE_REVIEW_MODEL,
});

function scopedReference(reference: SceneContinuityReference | undefined, characterIds: string[]) {
  if (!reference) return undefined;
  const requiredIds = new Set(characterIds.map((id) => id.toLowerCase()));
  return {
    ...reference,
    characters: reference.characters.filter((character) => requiredIds.has(character.id.toLowerCase())),
  };
}

function mergeReference(
  previous: SceneContinuityReference | undefined,
  next: SceneContinuityReference,
): SceneContinuityReference {
  const characters = new Map(previous?.characters.map((character) => [character.id.toLowerCase(), character]));
  for (const character of next.characters) characters.set(character.id.toLowerCase(), character);
  return { ...next, characters: [...characters.values()] };
}

function parseAcceptedScene(body: Record<string, unknown>) {
  const imageDataUrl = body.image_data_url;
  const reference = SceneContinuityReferenceSchema.safeParse(body.continuity_reference);
  const imageMatch = typeof imageDataUrl === "string"
    ? /^data:image\/jpeg;base64,([A-Za-z0-9+/=]+)$/u.exec(imageDataUrl)
    : null;
  if (!imageMatch || !reference.success) throw new Error("The production scene flow returned an invalid accepted image.");
  return { image: Buffer.from(imageMatch[1], "base64"), reference: reference.data };
}

async function exists(path: string) {
  try {
    await stat(path);
    return true;
  } catch {
    return false;
  }
}

await mkdir(outputRoot, { recursive: true });
const stagingRoot = await mkdtemp(resolve(outputRoot, ".generation-"));
let continuityReference: SceneContinuityReference | undefined;
const beats = selectedBeats.length === 0
  ? BASELINE_BEATS
  : selectedBeats.map((beatNumber) => BASELINE_BEATS[beatNumber - 1]);
const stagedAssets: Array<{ stagedPath: string; outputPath: string }> = [];

console.log(`Generating ${beats.length} canonical asset${beats.length === 1 ? "" : "s"} through production model ${selectedModel}.`);
try {
  for (const beat of beats) {
    const filename = `${beat.visual.key}.jpg`;
    const outputPath = resolve(outputRoot, filename);
    const stagedPath = resolve(stagingRoot, filename);
    if (!force && await exists(outputPath)) throw new Error(`${outputPath} already exists. Use --force to replace it.`);
    const draft = {
      title: beat.title,
      action: beat.action,
      line: beat.line,
      narrativeRole: beat.narrativeRole,
      intendedEmotion: beat.intendedEmotion,
      visual: beat.visual.spec,
    };
    const request = {
      content_hash: sceneContentHash(beat.visual.spec, LOOKS_GREAT_CONTINUITY),
      continuity: LOOKS_GREAT_CONTINUITY,
      beat: draft,
      context: {
        story_id: "looks-great",
        version_id: "looks-great-v1",
        beat_id: beat.id,
        beat_number: beat.order,
      },
      continuity_reference: scopedReference(
        continuityReference,
        beat.visual.spec.characters.map((character) => character.id),
      ),
      force: true,
    };

    console.log(`[${beat.order}/6] ${beat.title}: generating references, scene, and semantic review...`);
    let accepted: Awaited<ReturnType<typeof handleScene>> | undefined;
    for (let attempt = 1; attempt <= MAX_CURATION_ATTEMPTS; attempt += 1) {
      accepted = await handleScene("POST", request, provider);
      if (accepted.status === 200) break;
      console.log(`[${beat.order}/6] Production quality gate withheld curation attempt ${attempt}/${MAX_CURATION_ATTEMPTS}.`);
    }
    if (!accepted || accepted.status !== 200) {
      throw new Error(`[${beat.order}/6] Production scene flow failed: ${JSON.stringify(accepted?.body)}`);
    }

    const result = parseAcceptedScene(accepted.body);
    continuityReference = mergeReference(continuityReference, result.reference);
    await writeFile(stagedPath, result.image);
    stagedAssets.push({ stagedPath, outputPath });
    console.log(`[${beat.order}/6] Accepted and staged ${filename} (${result.image.length.toLocaleString()} bytes).`);
  }

  for (const asset of stagedAssets) await rename(asset.stagedPath, asset.outputPath);
  console.log("Canonical Gemini asset generation complete; the accepted set is now live.");
} finally {
  await rm(stagingRoot, { recursive: true, force: true });
}
