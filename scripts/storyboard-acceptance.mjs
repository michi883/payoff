import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";

const baseUrl = process.env.PAYOFF_ACCEPTANCE_URL ?? "http://127.0.0.1:5173";
const outputRoot = process.env.PAYOFF_ACCEPTANCE_OUTPUT ?? "/private/tmp/payoff-storyboard-acceptance";
const includeImages = process.argv.includes("--images");
const reuseText = process.argv.includes("--reuse-text");
const reportOnly = process.argv.includes("--report-only");
const selectedCase = process.argv.find((value) => value.startsWith("--case="))?.slice("--case=".length);
const selectedBeatValue = process.argv.find((value) => value.startsWith("--beat="))?.slice("--beat=".length);
const selectedBeat = selectedBeatValue ? Number.parseInt(selectedBeatValue, 10) : null;
if (selectedBeat !== null && (selectedBeat < 1 || selectedBeat > 6)) throw new Error("--beat must be between 1 and 6.");

const premises = [
  {
    id: "comedy",
    premise: "At a serious neighborhood bake-off, a nervous baker mistakes the judges' flour sneezes for disgust until they reveal his cake won.",
    intended_feeling: "Escalating awkward comedy, then delighted relief",
    format: "45-second vertical comedy short",
  },
  {
    id: "warm-family",
    premise: "A grandmother struggles to join a family video call, then realizes her granddaughter has quietly come to teach her in person.",
    intended_feeling: "Tender concern, then warm family connection",
    format: "45-second vertical short",
  },
  {
    id: "awkward-social",
    premise: "A new employee waves enthusiastically at a coworker who was greeting someone behind him, and the coworker turns it into a genuine introduction.",
    intended_feeling: "Secondhand embarrassment, then friendly relief",
    format: "30-second horizontal short",
  },
  {
    id: "suspense-reveal",
    premise: "A museum night guard follows a trail of wet footprints toward a supposedly empty gallery and discovers a child sheltering a rescued stray dog.",
    intended_feeling: "Mounting suspense, a surprising reveal, then relief",
    format: "60-second vertical short",
  },
  {
    id: "bittersweet",
    premise: "A widower cooks his late wife's anniversary soup alone, then gives her handwritten recipe to their granddaughter and tastes it with her.",
    intended_feeling: "Quiet grief, bittersweet remembrance, then gentle hope",
    format: "60-second horizontal short",
  },
];

function stableHash(value) {
  const source = typeof value === "string" ? value : JSON.stringify(value);
  let hash = 0x811c9dc5;
  for (let index = 0; index < source.length; index += 1) {
    hash ^= source.charCodeAt(index);
    hash = Math.imul(hash, 0x01000193);
  }
  return (hash >>> 0).toString(16).padStart(8, "0");
}

function sceneHash(spec, continuity) {
  return `scene:${stableHash({ schema: 1, continuity, spec })}`;
}

async function post(path, body) {
  const response = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json", Accept: "application/json" },
    body: JSON.stringify(body),
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${path} returned ${response.status}: ${JSON.stringify(payload)}`);
  return payload;
}

async function generateAcceptedStoryboard(input, id) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      return { story: await post("/api/storyboard", input), attempts: attempt };
    } catch (error) {
      lastError = error;
      console.log(`[${id}] quality gate withheld attempt ${attempt}/2`);
    }
  }
  throw lastError;
}

async function generateAcceptedScene(input, id, beatNumber, forceFirstAttempt = false) {
  let lastError;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const scene = await post("/api/scene", { ...input, force: forceFirstAttempt || attempt > 1 || undefined });
      return { ...scene, attempts: attempt };
    } catch (error) {
      lastError = error;
      console.log(`[${id}] semantic scene gate withheld beat ${beatNumber}, attempt ${attempt}/2`);
    }
  }
  throw lastError;
}

function validateStoryboard(story) {
  const issues = [];
  if (!story || !Array.isArray(story.beats) || story.beats.length !== 6) issues.push("Storyboard must contain six beats.");
  const titles = new Set();
  for (const [index, beat] of (story?.beats ?? []).entries()) {
    const titleWords = beat.title.trim().split(/\s+/u).length;
    const actionWords = beat.action.trim().split(/\s+/u).length;
    if (titleWords < 2 || titleWords > 5) issues.push(`Beat ${index + 1} title has ${titleWords} words.`);
    const normalized = beat.title.toLowerCase().replace(/[^a-z0-9]/gu, "");
    if (titles.has(normalized)) issues.push(`Beat ${index + 1} duplicates a title.`);
    titles.add(normalized);
    if (actionWords < 8 || actionWords > 26) issues.push(`Beat ${index + 1} description has ${actionWords} words.`);
    if (!beat.visual?.focalAction || !beat.visual?.composition || !beat.visual?.focalObject) issues.push(`Beat ${index + 1} lacks complete visual direction.`);
    for (const character of beat.visual?.characters ?? []) {
      const established = story.visual_continuity?.characters?.find((candidate) => candidate.id.toLowerCase() === character.id.toLowerCase());
      if (established && established.appearance !== character.appearance) issues.push(`Beat ${index + 1} changes ${character.id}'s appearance.`);
    }
  }
  if (story?.beats?.at(-1)?.narrativeRole !== "payoff") issues.push("Final beat is not a payoff.");
  return issues;
}

function escapeXml(value) {
  return String(value).replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}

function wrap(value, max = 52) {
  const words = value.split(/\s+/u);
  const lines = [];
  let current = "";
  for (const word of words) {
    if (`${current} ${word}`.trim().length > max && current) {
      lines.push(current);
      current = word;
    } else current = `${current} ${word}`.trim();
  }
  if (current) lines.push(current);
  return lines.slice(0, 3);
}

function reviewSheet(story, sceneResults) {
  const width = 1400;
  const cardWidth = 426;
  const cardHeight = 395;
  const imageWidth = 398;
  const imageHeight = 265;
  const cards = story.beats.map((beat, index) => {
    const column = index % 3;
    const row = Math.floor(index / 3);
    const x = 40 + column * 453;
    const y = 90 + row * 420;
    const image = sceneResults[index]?.image_data_url;
    const description = wrap(beat.action);
    return `<g transform="translate(${x} ${y})">
      <rect width="${cardWidth}" height="${cardHeight}" rx="18" fill="#fffdf8" stroke="#d7d0c3"/>
      ${image ? `<image href="${image}" x="14" y="14" width="${imageWidth}" height="${imageHeight}" preserveAspectRatio="xMidYMid slice"/>` : `<rect x="14" y="14" width="${imageWidth}" height="${imageHeight}" fill="#ece7dc"/>`}
      <rect x="26" y="26" width="34" height="24" rx="6" fill="#25231e"/><text x="43" y="43" text-anchor="middle" fill="#fff" font-size="11" font-family="monospace">${String(index + 1).padStart(2, "0")}</text>
      <text x="18" y="307" fill="#25231e" font-size="20" font-weight="700" font-family="Arial, sans-serif">${escapeXml(beat.title)}</text>
      <text x="18" y="332" fill="#5e594f" font-size="13" font-family="Arial, sans-serif">${description.map((line, lineIndex) => `<tspan x="18" dy="${lineIndex === 0 ? 0 : 18}">${escapeXml(line)}</tspan>`).join("")}</text>
    </g>`;
  }).join("\n");
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="940" viewBox="0 0 ${width} 940">
    <rect width="100%" height="100%" fill="#f8f5ee"/>
    <text x="40" y="48" fill="#25231e" font-size="28" font-weight="750" font-family="Arial, sans-serif">${escapeXml(story.title)}</text>
    <text x="40" y="72" fill="#686259" font-size="13" font-family="Arial, sans-serif">${escapeXml(story.target_payoff)}</text>
    ${cards}
  </svg>`;
}

async function withConcurrency(values, limit, operation) {
  const results = new Array(values.length);
  let next = 0;
  async function worker() {
    while (next < values.length) {
      const index = next;
      next += 1;
      results[index] = await operation(values[index], index);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, values.length) }, worker));
  return results;
}

await mkdir(outputRoot, { recursive: true });
const report = [];
for (const premise of premises.filter((candidate) => !selectedCase || candidate.id === selectedCase)) {
  console.log(`[${premise.id}] generating storyboard`);
  const generated = reuseText
    ? { story: JSON.parse(await readFile(join(outputRoot, premise.id, "storyboard.json"), "utf8")).story, attempts: "reused" }
    : await generateAcceptedStoryboard({
      premise: premise.premise,
      intended_feeling: premise.intended_feeling,
      format: premise.format,
    }, premise.id);
  const story = generated.story;
  const issues = validateStoryboard(story);
  if (issues.length > 0) throw new Error(`[${premise.id}] ${issues.join(" ")}`);
  const directory = join(outputRoot, premise.id);
  await mkdir(directory, { recursive: true });
  let continuityReference = null;
  const sceneResults = includeImages && reportOnly
    ? await Promise.all(story.beats.map(async (_beat, index) => ({
      content_hash: sceneHash(story.beats[index].visual, story.visual_continuity),
      image_data_url: `data:image/jpeg;base64,${(await readFile(join(directory, `beat-${index + 1}.jpg`))).toString("base64")}`,
      attempts: "artifact",
    })))
    : includeImages ? await withConcurrency(story.beats, 1, async (beat, index) => {
    if (selectedBeat !== null && selectedBeat !== index + 1) {
      return {
        content_hash: sceneHash(beat.visual, story.visual_continuity),
        image_data_url: `data:image/jpeg;base64,${(await readFile(join(directory, `beat-${index + 1}.jpg`))).toString("base64")}`,
        attempts: "artifact",
      };
    }
    console.log(`[${premise.id}] creating scene ${index + 1}/6`);
    const content_hash = sceneHash(beat.visual, story.visual_continuity);
    const scene = await generateAcceptedScene({
      content_hash,
      continuity: story.visual_continuity,
      beat,
      context: {
        story_id: `acceptance-${premise.id}`,
        version_id: "acceptance-v1",
        beat_id: `beat-${index + 1}`,
        beat_number: index + 1,
      },
      continuity_reference: continuityReference || undefined,
    }, premise.id, index + 1, selectedBeat !== null);
    continuityReference = scene.continuity_reference;
    const encoded = scene.image_data_url.split(",")[1];
    await writeFile(join(directory, `beat-${index + 1}.jpg`), Buffer.from(encoded, "base64"));
    return scene;
    }) : [];
  if (includeImages) await writeFile(join(directory, "review-sheet.svg"), reviewSheet(story, sceneResults));
  await writeFile(join(directory, "storyboard.json"), `${JSON.stringify({ premise, story }, null, 2)}\n`);
  report.push({
    id: premise.id,
    title: story.title,
    target: story.target_payoff,
    titles: story.beats.map((beat) => beat.title),
    descriptions: story.beats.map((beat) => beat.action),
    finalBeat: story.beats.at(-1),
    sceneCount: sceneResults.length,
    sceneGenerationAttempts: sceneResults.map((scene) => scene.attempts),
    generationAttempts: generated.attempts,
  });
  console.log(`[${premise.id}] accepted: ${story.beats.map((beat) => beat.title).join(" → ")}`);
}
await writeFile(join(outputRoot, "report.json"), `${JSON.stringify(report, null, 2)}\n`);
console.log(`Acceptance artifacts: ${outputRoot}`);
