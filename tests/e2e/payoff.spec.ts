import { expect, test, type Page, type Route } from "@playwright/test";
import { Buffer } from "node:buffer";
import { continuityContentHash } from "../../src/domain/visuals";

type StoryBeatPayload = {
  id: string;
  order: number;
  title: string;
  action: string;
  line: string;
  narrativeRole: "setup" | "escalation" | "turn" | "payoff";
  intendedEmotion: string;
  visual: {
    source: "canonical" | "generated";
    key?: string;
    contentHash: string;
    spec: BeatVisualPayload;
  };
};

type BeatVisualPayload = {
  setting: string;
  characters: Array<{ id: string; appearance: string; position: string; action: string }>;
  focalAction: string;
  focalObject: string;
  composition: string;
  emotionalCue: string;
  visibleText: string;
  continuityNotes: string[];
};

const customContinuity = {
  characters: [
    { id: "dad", appearance: "Early 40s, short dark hair, navy jacket, warm brown skin." },
    { id: "daughter", appearance: "Ten years old, long dark braid, yellow performance dress, warm brown skin." },
  ],
  settings: [{ id: "auditorium", appearance: "Small school auditorium with a wooden stage, red curtain, and blue folding seats." }],
  importantProps: [{ id: "reserved-card", appearance: "White card printed MOM in bold black letters." }],
  style: "Minimal editorial storyboard illustration with clean shapes, expressive gestures, and a warm limited palette.",
};

const sceneImage = "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAusB9Y9ZB4sAAAAASUVORK5CYII=";
const referenceImage = "data:image/webp;base64,AAAA";

function continuityReference(body: {
  continuity: typeof customContinuity;
  continuity_reference?: unknown;
}) {
  return body.continuity_reference ?? {
    content_hash: continuityContentHash(body.continuity),
    environment_image_data_url: referenceImage,
    characters: body.continuity.characters.map((character) => ({ id: character.id, image_data_url: referenceImage })),
  };
}

function visual(focalAction: string, focalObject: string, characterActions: [string, string], visibleText = ""): BeatVisualPayload {
  return {
    setting: customContinuity.settings[0].appearance,
    characters: [
      { ...customContinuity.characters[0], position: "In the front row or aisle.", action: characterActions[0] },
      { ...customContinuity.characters[1], position: "On the stage or looking toward the front row.", action: characterActions[1] },
    ],
    focalAction,
    focalObject,
    composition: "Use one clear sightline between daughter, Dad, and the important seat so the relationship reads immediately.",
    emotionalCue: "Let posture and gaze carry the emotional change without decorative ambiguity.",
    visibleText,
    continuityNotes: ["Keep Dad, daughter, clothing, auditorium, and seat layout identical across all six beats."],
  };
}

const generatedBeats = [
  { title: "His entrance", action: "Dad strides into the school auditorium just as the lights dim.", line: "Made it.", narrativeRole: "setup", intendedEmotion: "confidence", visual: visual("Dad arrives confidently as the performance begins.", "Dad entering the lit aisle.", ["Strides toward the front row.", "Waits behind the curtain."]) },
  { title: "The solo", action: "His daughter steps into the light and searches the front row for him.", line: "", narrativeRole: "setup", intendedEmotion: "anticipation", visual: visual("The daughter enters the spotlight and scans the front row.", "Her searching gaze.", ["Sits proudly in the front row.", "Steps into the light and searches for Dad."]) },
  { title: "A proud wave", action: "Dad waves broadly; she gives him a small, uncertain smile.", line: "", narrativeRole: "escalation", intendedEmotion: "unease", visual: visual("Dad waves while his daughter's restrained response signals that something is wrong.", "Their mismatched gestures.", ["Waves broadly from his seat.", "Returns a small uncertain smile."]) },
  { title: "What she watches", action: "During her performance, she keeps looking at the empty chair beside him.", line: "", narrativeRole: "turn", intendedEmotion: "surprise", visual: visual("The daughter performs but repeatedly looks at the empty chair next to Dad.", "The conspicuously empty front-row chair.", ["Watches her, unaware of the empty chair's meaning.", "Performs while staring toward the empty chair."]) },
  { title: "The missing person", action: "Dad sees the reserved card on that chair: MOM.", line: "", narrativeRole: "payoff", intendedEmotion: "emotional sting", visual: visual("Dad discovers that the empty chair was reserved for Mom.", "The MOM card on the empty chair.", ["Looks down at the reserved card in realization.", "Watches from the stage."] , "MOM") },
  { title: "Make room", action: "He moves the card to his lap, holds the empty seat open, and watches quietly with her.", line: "I understand.", narrativeRole: "payoff", intendedEmotion: "warmth", visual: visual("Dad honors the missing person by keeping Mom's chair open while watching his daughter.", "The open seat and card held carefully on his lap.", ["Holds the card and leaves the neighboring chair open.", "Meets his warm, understanding gaze."]) },
] as const;

async function openClean(page: Page, path = "/") {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("payoff-e2e-cleaned")) {
      localStorage.clear();
      sessionStorage.setItem("payoff-e2e-cleaned", "true");
    }
  });
  await page.goto(path);
}

async function startExample(page: Page) {
  await page.getByRole("button", { name: "Try example: Looks Great" }).click();
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Building your story..." })).toBeVisible();
  await expect(page.locator(".story-card")).toHaveCount(6);
}

async function createCustomStory(page: Page) {
  await page.getByLabel("Story premise").fill("A confident dad shows up");
  await page.getByLabel("What should the audience feel?").fill("surprise, then a small emotional sting, then warmth");
  await page.getByLabel("Format").selectOption("45-second vertical short");
  await page.getByRole("button", { name: "Create storyboard" }).click();
  await expect(page.getByRole("heading", { name: "Building your story..." })).toBeVisible();
  await expect(page.locator(".story-card")).toHaveCount(6);
}

function revisionResponse(body: {
  expected_version: string;
  selected_beat_id: string | null;
  story: { beats: StoryBeatPayload[] };
}) {
  const beat = body.story.beats.find((candidate) => candidate.id === body.selected_beat_id) ?? body.story.beats[0];
  return {
    story_version: body.expected_version,
    kind: "revision",
    summary: "Give Dad's distraction a visible cause while preserving the emotional turn.",
    why: "The audience can read him as overloaded rather than uncaring without weakening the reveal.",
    clarification_question: null,
    changes: [{
      beat_id: beat.id,
      what_changes: "Dad's divided attention gets a clear, temporary cause.",
      replacement: {
        title: beat.title,
        action: "Dad arrives while silencing a work call, then puts the phone away and looks toward the stage.",
        line: beat.line,
        narrativeRole: beat.narrativeRole,
        intendedEmotion: beat.intendedEmotion,
        visual: {
          ...beat.visual.spec,
          characters: beat.visual.spec.characters.map((character) => character.id === "dad"
            ? { ...character, action: "Silences a work call, puts the phone away, and looks toward the stage." }
            : character),
          focalAction: "Dad visibly ends a work interruption, puts the phone away, and directs his full attention toward the stage.",
          focalObject: "Dad's lowered work phone and redirected gaze.",
        },
      },
    }],
  };
}

async function fulfillStoryboard(route: Route) {
  await route.fulfill({
    status: 200,
    contentType: "application/json",
    body: JSON.stringify({
      title: "The Empty Seat",
      target_payoff: "Confident surprise → small emotional sting → warmth",
      visual_continuity: customContinuity,
      beats: generatedBeats,
    }),
  });
}

async function mockSceneImages(page: Page, delay = 0) {
  await page.route("**/api/scene", async (route) => {
    const body = route.request().postDataJSON() as {
      content_hash: string;
      continuity: typeof customContinuity;
      continuity_reference?: unknown;
    };
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content_hash: body.content_hash,
        image_data_url: sceneImage,
        continuity_reference: continuityReference(body),
      }),
    });
  });
}

async function mockPayoffAI(page: Page, delay = 0) {
  const pause = async () => {
    if (delay > 0) await new Promise((resolve) => setTimeout(resolve, delay));
  };

  await page.route("**/api/storyboard", async (route) => {
    await pause();
    await fulfillStoryboard(route);
  });

  await page.route("**/api/revise", async (route) => {
    const body = route.request().postDataJSON() as Parameters<typeof revisionResponse>[0];
    await pause();
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(revisionResponse(body)) });
  });

  await mockSceneImages(page, Math.min(delay, 120));

  await page.route("**/api/audience", async (route) => {
    const body = route.request().postDataJSON() as {
      source: "ai" | "human";
      expected_version: string;
      story_hash?: string;
      beats: StoryBeatPayload[];
      responses?: Array<{ id: string }>;
    };
    await pause();
    const commonReport = {
      summary: "The reveal is clear, but the emotional repair may need more room.",
      audience_landing: body.source === "human"
        ? "Warmth, with a lingering guilty sting."
        : "Recognition, a small guilty sting, then cautious warmth.",
      match: body.source === "human" && (body.responses?.length ?? 0) < 4 ? "insufficient" : "partial",
      observed_arc: ["familiar amusement", "unease", "guilt", "cautious warmth"],
      what_landed: "The final reconnection felt warm and emotionally clear.",
      where_it_drifted: "Dad felt neglectful longer than the creator intended.",
      biggest_opportunity: "Show one earlier sign that he cares, even while distracted.",
      strongest_beat: { beat_id: body.beats[4].id, why: "The visual reveal makes the relationship pattern concrete." },
      weakest_beat: { beat_id: body.beats[5].id, why: "The final repair is emotionally clear but brief." },
      main_risk: "Guilt may linger more strongly than the intended warmth.",
      changed_audience: { beat_id: body.beats[4].id, why: "The reveal reframes the earlier behavior in one image." },
    };
    if (body.source === "human") {
      await route.fulfill({
        status: 200,
        contentType: "application/json",
        body: JSON.stringify({
          source: "human",
          story_version: body.expected_version,
          story_hash: body.story_hash,
          response_ids: body.responses?.map((response) => response.id) ?? [],
          ...commonReport,
        }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "ai",
        label: "AI-simulated audience",
        notice: "Useful as an early check. Not human evidence.",
        story_version: body.expected_version,
        ...commonReport,
        reactions: [
          { persona: "impatient_casual", note: "Understands the pattern quickly.", evidence: "The repeated visual behavior is easy to scan." },
          { persona: "emotionally_sensitive", note: "Feels the child's withdrawal strongly.", evidence: "The quiet turn carries more weight than the final repair." },
          { persona: "literal_low_context", note: "Follows the reveal without extra explanation.", evidence: "The decisive image is concrete." },
          { persona: "experienced_storyteller", note: "Reads the structure as clean and economical.", evidence: "The ending may need one more breath." },
        ],
        disagreements: ["The repair may feel earned to one lens and too quick to another."],
        confidence: { level: "medium", note: "A useful simulated signal based on four distinct reading lenses, not human evidence." },
      }),
    });
  });

  await page.route("**/api/diagnose", async (route) => {
    const body = route.request().postDataJSON() as { expected_version: string; audience_source: "ai" | "human"; story: { beats: StoryBeatPayload[] } };
    await pause();
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_version: body.expected_version,
        audience_source: body.audience_source,
        answer: "The reveal asks the audience to sit with the earlier distance, while the repair gets only one short beat. That makes guilt easier to retain than warmth.",
        evidence: [
          { beat_id: body.story.beats[4].id, observation: "The reveal retroactively sharpens the cost of the repeated behavior." },
          { beat_id: body.story.beats[5].id, observation: "The ending signals repair but gives the new connection little screen time." },
        ],
      }),
    });
  });
}

async function workspaceState(page: Page) {
  return page.evaluate(() => JSON.parse(localStorage.getItem("payoff.workspace.v4") ?? "null") as {
    activeVersionId: string;
    versions: Array<{ id: string; beats: Array<{ id: string; action: string }> }>;
    aiPreviews: Array<{ storyVersionId: string }>;
    humanReports: Array<{ storyVersionId: string; responseIds: string[] }>;
    reactionSet: { storyVersionId: string; responses: unknown[] };
    reactionHistory: Array<{ storyVersionId: string; responses: unknown[] }>;
    humanTest: {
      projectId: string;
      storyVersionId: string;
      storyHash: string;
      beats: Array<{ id: string }>;
    } | null;
  });
}

async function runTool<T>(page: Page, name: string, input: Record<string, unknown>) {
  return page.evaluate(async ({ toolName, toolInput }) => {
    const context = document.modelContext;
    if (!context) throw new Error("WebMCP is unavailable despite the enabled Chrome feature.");
    const tools = await context.getTools();
    const tool = tools.find((candidate) => candidate.name === toolName);
    if (!tool) throw new Error(`Missing WebMCP tool: ${toolName}`);
    const output = await context.executeTool(tool, JSON.stringify(toolInput));
    return JSON.parse(output ?? "{}") as T;
  }, { toolName: name, toolInput: input });
}

test("the starting experience is minimal, legible, and creator-facing", async ({ page }) => {
  await openClean(page);

  await expect(page.getByRole("heading", { name: "What story are you trying to tell?" })).toBeVisible();
  await expect(page.getByText("Turn a premise into a storyboard, then see whether the audience feels what you intended.")).toBeVisible();
  await expect(page.getByLabel("Story premise")).toBeVisible();
  await expect(page.getByLabel("What should the audience feel?")).toBeVisible();
  await expect(page.getByLabel("Format")).toHaveValue("45-second vertical short");
  await expect(page.getByRole("button", { name: "Create storyboard" })).toBeDisabled();
  await expect(page.getByText(/WebMCP|Site Tools|ModelContext|agent availability/i)).toHaveCount(0);

  await page.getByRole("button", { name: "Try example: Looks Great" }).click();
  await expect(page.getByLabel("Story premise")).toHaveValue(/distracted father/i);
  await expect(page.getByLabel("What should the audience feel?")).toHaveValue(/gut punch/i);
  await expect(page.getByLabel("Format")).toHaveValue("45-second vertical short");
  await expect(page.getByRole("button", { name: "Create storyboard" })).toBeEnabled();
});

test("a custom creator can generate, revise, diagnose, direct, and retest without WebMCP", async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(document, "modelContext", { configurable: true, value: undefined });
  });
  await mockPayoffAI(page, 200);
  await openClean(page);
  await createCustomStory(page);

  await expect(page.getByText("Creating scene...", { exact: true }).first()).toBeVisible();

  await expect(page.getByRole("heading", { name: "The Empty Seat" })).toBeVisible();
  await expect(page.getByText("45-second vertical short", { exact: true })).toBeVisible();
  await expect(page.getByText("Confident surprise → small emotional sting → warmth", { exact: true })).toBeVisible();
  await expect(page.locator(".story-card h3")).toHaveText(generatedBeats.map((beat) => beat.title));
  await expect(page.getByText("Add first beat", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/WebMCP|Site Tools|ModelContext/i)).toHaveCount(0);
  await expect(page.locator(".generated-scene")).toHaveCount(6);

  const composer = page.getByRole("textbox", { name: "Ask Payoff to change the story" });
  const firstCard = page.locator(".story-card").first();
  await expect(composer).toHaveCount(0);
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await composer.fill("Make Dad seem busy rather than uncaring.");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await expect(page.getByRole("button", { name: "Planning changes..." })).toBeDisabled();
  await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What I'll change" })).toBeVisible();
  await expect(page.getByText("Dad's divided attention gets a clear, temporary cause.")).toBeVisible();
  await expect(firstCard).toContainText("Dad strides into the school auditorium");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(firstCard).toContainText("Dad strides into the school auditorium");
  await expect(composer).toHaveCount(0);

  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(firstCard).toContainText("silencing a work call");
  await expect(page.getByText("Untested revision", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(firstCard).toContainText("Dad strides into the school auditorium");
  await expect(firstCard).not.toContainText("silencing a work call");

  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await expect(page.getByRole("heading", { name: "Did it land?" })).toBeVisible();
  await expect(page.getByText("You wanted:")).toBeVisible();
  await expect(page.getByRole("button", { name: "Run AI Audience" })).toHaveCount(1);
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByRole("heading", { name: "Testing the payoff..." })).toBeVisible();
  await expect(page.getByText("AI Audience · simulated", { exact: true })).toBeVisible();
  await expect(page.getByText("Useful as an early check. Not human evidence.", { exact: true })).toBeVisible();
  await expect(page.getByText("Partial match", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What landed" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Where it drifted" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Biggest opportunity" })).toBeVisible();
  await expect(page.getByText("Strongest beat", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "See details" }).click();
  await expect(page.getByText("Strongest beat", { exact: true })).toBeVisible();
  await expect(page.getByText("Weakest or confusing beat", { exact: true })).toBeVisible();
  await expect(page.getByText("What changed the audience", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Hide details" }).click();
  await expect(page.getByText("Strongest beat", { exact: true })).toHaveCount(0);

  const beforeDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"));
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why did this feel sad instead of warm?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByText("Payoff's diagnosis · story unchanged", { exact: true })).toBeVisible();
  await expect(page.getByText(/guilt easier to retain than warmth/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Did it land?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(beforeDiagnosis);

  await page.getByRole("button", { name: "Revise the story" }).click();
  await expect(page.getByRole("tab", { name: "Storyboard" })).toHaveAttribute("aria-selected", "true");
  await expect(composer).toHaveValue("");
  await expect(page.getByText(/Testing found: The reveal asks the audience/i)).toBeVisible();
  await composer.fill("Keep the reveal, but make Dad feel distracted rather than neglectful.");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(firstCard).toContainText("silencing a work call");
  await expect(page.getByText("Untested revision", { exact: true })).toBeVisible();
  await expect(page.getByRole("button", { name: "Test again" })).toBeVisible();

  const revisedState = await workspaceState(page);
  expect(revisedState.aiPreviews).toHaveLength(1);
  expect(revisedState.aiPreviews[0].storyVersionId).not.toBe(revisedState.activeVersionId);
  await page.getByRole("button", { name: "Test again" }).click();
  await expect(page.getByRole("button", { name: "Run AI Audience" })).toBeVisible();
  await expect(page.getByText("Recognition, a small guilty sting, then cautious warmth.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByText("Recognition, a small guilty sting, then cautious warmth.", { exact: true })).toBeVisible();

  await page.reload();
  await expect(page.getByRole("heading", { name: "Did it land?" })).toBeVisible();
  await expect(page.getByText("Recognition, a small guilty sting, then cautious warmth.", { exact: true })).toBeVisible();
});

test("storyboard generation failures preserve the brief and retry cleanly", async ({ page }) => {
  let attempts = 0;
  await mockSceneImages(page);
  await page.route("**/api/storyboard", async (route) => {
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "AI_TEMPORARILY_UNAVAILABLE", message: "Payoff couldn't finish your storyboard. Your brief is safe.", retryable: true } }),
      });
    } else await fulfillStoryboard(route);
  });
  await openClean(page);
  await page.getByLabel("Story premise").fill("A musician finds a note hidden inside an old guitar.");
  await page.getByLabel("What should the audience feel?").fill("curiosity, then bittersweet relief");
  await page.getByRole("button", { name: "Create storyboard" }).click();

  await expect(page.getByRole("heading", { name: "Payoff couldn't finish your storyboard." })).toBeVisible();
  await expect(page.getByText("A musician finds a note hidden inside an old guitar.", { exact: true })).toBeVisible();
  await expect(page.getByText("curiosity, then bittersweet relief", { exact: true })).toBeVisible();
  await expect(page.locator(".story-card")).toHaveCount(0);
  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.getByRole("heading", { name: "Building your story..." })).toBeVisible();
  await expect(page.locator(".story-card")).toHaveCount(6);
  expect(attempts).toBe(2);
});

test("scene generation failures keep the story usable and retry only that scene", async ({ page }) => {
  const attempts = new Map<string, number>();
  const pageErrors: string[] = [];
  page.on("pageerror", (error) => pageErrors.push(error.message));
  await page.route("**/api/storyboard", fulfillStoryboard);
  await page.route("**/api/scene", async (route) => {
    const body = route.request().postDataJSON() as {
      content_hash: string;
      continuity: typeof customContinuity;
      continuity_reference?: unknown;
    };
    const attempt = (attempts.get(body.content_hash) ?? 0) + 1;
    attempts.set(body.content_hash, attempt);
    if (attempt === 1) {
      await route.fulfill({
        status: 422,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "SCENE_MISMATCH", message: "Scene visual couldn't be created.", retryable: true } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content_hash: body.content_hash,
        image_data_url: sceneImage,
        continuity_reference: continuityReference(body),
      }),
    });
  });
  await openClean(page);
  await createCustomStory(page);

  await expect(page.getByText("Scene visual couldn't be created.", { exact: true })).toHaveCount(6);
  await expect(page.locator(".story-card h3")).toHaveText(generatedBeats.map((beat) => beat.title));
  await page.getByRole("button", { name: "Try again" }).first().click();
  await expect(page.locator(".generated-scene")).toHaveCount(1);
  await expect(page.getByText("Scene visual couldn't be created.", { exact: true })).toHaveCount(5);
  expect(pageErrors).toEqual([]);
});

test("revision proposals are image-independent and applied text survives a scene update failure", async ({ page }) => {
  let sceneAttempts = 0;
  let revisedBeatId = "";
  await page.route("**/api/revise", async (route) => {
    const body = route.request().postDataJSON() as {
      expected_version: string;
      story: { beats: StoryBeatPayload[] };
    };
    const beat = body.story.beats[3];
    revisedBeatId = beat.id;
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        story_version: body.expected_version,
        kind: "revision",
        summary: "Move the daughter's final drawing from the refrigerator to the floor.",
        why: "This preserves her withdrawal while changing the physical action.",
        clarification_question: null,
        changes: [{
          beat_id: beat.id,
          what_changes: "She leaves the drawing on the floor instead of pinning it to the refrigerator.",
          replacement: {
            title: beat.title,
            action: "The daughter quietly leaves her drawing on the floor beside her, then walks away.",
            line: beat.line,
            narrativeRole: beat.narrativeRole,
            intendedEmotion: beat.intendedEmotion,
            visual: {
              ...beat.visual.spec,
              focalAction: "The daughter places her drawing on the floor, straightens, and walks away without asking Dad.",
              focalObject: "The drawing lying alone on the kitchen floor.",
              composition: "Keep the drawing prominent on the floor and separate the daughter from distant Dad.",
              continuityNotes: [...beat.visual.spec.continuityNotes, "The newest drawing is on the floor, not attached to the refrigerator."],
            },
          },
        }],
      }),
    });
  });
  await page.route("**/api/scene", async (route) => {
    sceneAttempts += 1;
    const body = route.request().postDataJSON() as {
      content_hash: string;
      context: { beat_id: string };
      continuity: typeof customContinuity;
      continuity_reference?: unknown;
    };
    expect(body.context.beat_id).toBe(revisedBeatId);
    await new Promise((resolve) => setTimeout(resolve, 180));
    if (sceneAttempts === 1) {
      await route.fulfill({
        status: 429,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "SCENE_QUOTA_EXHAUSTED", message: "The Gemini project spending limit has been reached. Increase the limit, then try again.", retryable: true } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        content_hash: body.content_hash,
        image_data_url: sceneImage,
        continuity_reference: {
          content_hash: continuityContentHash(body.continuity),
          environment_image_data_url: referenceImage,
          characters: body.continuity.characters.map((character) => ({ id: character.id, image_data_url: referenceImage })),
        },
      }),
    });
  });

  await openClean(page);
  await startExample(page);
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await page.getByRole("textbox", { name: "Ask Payoff to change the story" }).fill("instead of sticking her drawing to the refrigerator, have her stick her drawing to the floower");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();
  expect(sceneAttempts).toBe(0);
  await expect(page.locator(".story-card").nth(3).getByText("The daughter quietly pins up her own drawing without asking Dad, then turns away.", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.getByText("The daughter quietly leaves her drawing on the floor beside her, then walks away.", { exact: true })).toBeVisible();
  await expect(page.getByText("Updating scene visual...", { exact: true })).toBeVisible();
  await expect(page.getByText("The story was updated, but the Gemini project spending limit has been reached. Increase the limit, then try again.", { exact: true })).toBeVisible();
  expect(sceneAttempts).toBe(1);
  let state = await workspaceState(page);
  expect(state.versions.find((version) => version.id === state.activeVersionId)?.beats[3].action).toContain("drawing on the floor");

  await page.getByRole("button", { name: "Try again" }).click();
  await expect(page.locator(".story-card").nth(3).locator(".generated-scene img")).toBeVisible();
  expect(sceneAttempts).toBe(2);

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.getByText("The daughter quietly pins up her own drawing without asking Dad, then turns away.", { exact: true })).toBeVisible();
  await expect(page.locator(".story-card").nth(3).locator('img[src*="canonical/quiet_fridge.jpg"]')).toBeVisible();
  state = await workspaceState(page);
  expect(state.versions.find((version) => version.id === state.activeVersionId)?.beats[3].action).toContain("pins up her own drawing");
});

test("the Looks Great storyboard keeps canonical order and hides editing behind one menu", async ({ page }) => {
  await openClean(page);
  await startExample(page);

  await expect(page.getByRole("heading", { name: "Looks Great" })).toBeVisible();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Another drawing", "The fridge fills up", "She stops asking", "A drawing of Dad", "He finally looks",
  ]);
  await expect(page.getByText("Make the story say and feel what you intend.", { exact: true })).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "Storyboard", exact: true })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Payoff to change the story" })).toHaveCount(0);
  const canonicalImages = page.locator(".story-card .generated-scene img");
  await expect(canonicalImages).toHaveCount(6);
  await expect(canonicalImages.nth(0)).toHaveAttribute("src", /\/canonical\/drawing_offer\.jpg$/);
  await expect(canonicalImages.nth(5)).toHaveAttribute("src", /\/canonical\/crayon_together\.jpg$/);
  await expect(page.locator(".story-card .generated-scene__text")).toHaveText(["DAY 2", "DAD"]);
  await expect(page.locator(".story-card blockquote")).toHaveCount(3);
  await expect(page.getByLabel(/More options for/)).toHaveCount(6);
  await expect(page.getByRole("button", { name: /Move .* left|Move .* right/ })).toHaveCount(0);

  await page.getByLabel("More options for Another drawing").click();
  await expect(page.getByRole("menuitem", { name: "Ask Payoff to change this beat" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit manually" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Ask Payoff to change this beat" }).click();
  await expect(page.getByRole("button", { name: "Beat 2 · Another drawing" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Payoff to change the story" })).toBeFocused();
  await page.getByRole("button", { name: "Beat 2 · Another drawing" }).click();

  await page.getByLabel("More options for Another drawing").click();
  await page.getByRole("menuitem", { name: "Move later" }).click();
  const moveDialog = page.getByRole("alertdialog", { name: "Move this beat later?" });
  await expect(moveDialog).toBeVisible();
  await expect(moveDialog).toContainText("saved as a new version");
  await moveDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Another drawing", "The fridge fills up", "She stops asking", "A drawing of Dad", "He finally looks",
  ]);

  await page.getByLabel("More options for Another drawing").click();
  await page.getByRole("menuitem", { name: "Move later" }).click();
  await page.getByRole("alertdialog", { name: "Move this beat later?" }).getByRole("button", { name: "Move beat" }).click();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "The fridge fills up", "Another drawing", "She stops asking", "A drawing of Dad", "He finally looks",
  ]);
  await page.getByRole("button", { name: "Undo" }).click();

  await page.getByLabel("More options for The fridge fills up").click();
  await page.getByRole("menuitem", { name: "Delete beat" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete this beat?" });
  await expect(deleteDialog).toContainText("You can undo this change");
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".story-card")).toHaveCount(6);

  await page.getByLabel("More options for A drawing of Dad").click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();
  await expect(page.getByRole("heading", { name: "Edit beat" })).toBeVisible();
  await expect(page.getByLabel("Beat title")).toBeVisible();
  await expect(page.getByLabel("What happens")).toBeVisible();
  await expect(page.getByLabel(/Dialogue \/ on-screen text/)).toBeVisible();
  await expect(page.getByText("Advanced", { exact: true })).toBeVisible();
  await expect(page.getByLabel("Narrative role")).not.toBeVisible();
  await page.getByLabel("Beat title").fill("He sees it");
  await page.getByLabel("What happens").fill("Dad studies the drawing for the first time.");
  await page.getByRole("button", { name: "Save beat" }).click();
  await expect(page.getByRole("heading", { name: "He sees it" })).toBeVisible();
  await expect(page.getByText("Untested revision", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Another drawing", "The fridge fills up", "She stops asking", "A drawing of Dad", "He finally looks",
  ]);
  await page.reload();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Another drawing", "The fridge fills up", "She stops asking", "A drawing of Dad", "He finally looks",
  ]);
});

test("start over uses Payoff's confirmation and clears the active story and results", async ({ page }) => {
  await mockPayoffAI(page);
  await openClean(page);
  await startExample(page);
  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByText("Partial match", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  const dialog = page.getByRole("alertdialog", { name: "Start a new story?" });
  await expect(dialog).toContainText("Your current storyboard and test results will be cleared.");
  await dialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.getByText("Partial match", { exact: true })).toBeVisible();

  await page.getByRole("button", { name: "Start over" }).click();
  await page.getByRole("alertdialog", { name: "Start a new story?" }).getByRole("button", { name: "Start over" }).click();
  await expect(page.getByRole("heading", { name: "What story are you trying to tell?" })).toBeVisible();
  const state = await workspaceState(page);
  expect(state.aiPreviews).toHaveLength(0);
  expect(state.humanReports).toHaveLength(0);
  expect(state.reactionSet.responses).toHaveLength(0);
});

test("Human Audience stays target-blind, version-bound, and separate from AI Audience", async ({ page }) => {
  await mockPayoffAI(page);
  await openClean(page);
  await startExample(page);
  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByText("Partial match", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: /Human Audience/ }).click();

  await expect(page.getByRole("heading", { name: "Test with real people" })).toBeVisible();
  await expect(page.getByText("Viewers see the complete story without seeing the feeling you're aiming for.")).toBeVisible();
  await expect(page.getByRole("button", { name: "Copy test link" })).toBeEnabled();
  await expect(page.getByRole("link", { name: /Open test/ })).toBeVisible();
  await expect(page.getByText(/0 responses · Waiting for viewers/)).toBeVisible();
  await expect(page.getByText("Your results will appear here.", { exact: true })).toHaveCount(0);
  await page.getByText("Test details", { exact: true }).click();
  await expect(page.getByText("Only valid responses for this exact story count. AI Audience data is never included.")).toBeVisible();

  const state = await workspaceState(page);
  expect(state.humanTest).not.toBeNull();
  const stimulus = state.humanTest!;
  const response = {
    schema: "payoff-study-response/v1",
    study: {
      projectId: stimulus.projectId,
      storyVersionId: stimulus.storyVersionId,
      storyHash: stimulus.storyHash,
      targetWasHidden: true,
      firstViewingWasUninterrupted: true,
    },
    response: {
      id: "anonymous-e2e-response",
      storyVersionId: stimulus.storyVersionId,
      storyHash: stimulus.storyHash,
      submittedAt: "2026-08-27T12:00:00.000Z",
      endingEmotion: "warm",
      interpretation: "He finally chooses to be present with her.",
      wasSurprised: true,
      predictionPoint: "beat_5",
      changedBeatId: stimulus.beats[4].id,
      changedWhy: "The drawing made his absence visible.",
      quoteConsent: true,
      secondPass: [
        { beatId: stimulus.beats[4].id, emotion: "moved" },
        { beatId: stimulus.beats[5].id, emotion: "warm" },
      ],
    },
  };
  await page.locator(".import-button input").setInputFiles({
    name: "anonymous-response.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(response)),
  });

  await expect(page.getByText("1 accepted · 0 duplicate · 0 rejected", { exact: true })).toBeVisible();
  await expect(page.getByText("Human Audience · 1 real viewer", { exact: true })).toBeVisible();
  await expect(page.getByText("Not enough evidence", { exact: true })).toBeVisible();
  await expect(page.getByText("Warmth, with a lingering guilty sting.", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What landed" })).toBeVisible();
  await expect(page.getByText("Collect more responses", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "See details" }).click();
  await expect(page.getByText("Anonymous viewer", { exact: true })).toBeVisible();
  await expect(page.getByText(/Early human signal · 1 valid target-blind response/)).toBeVisible();
  const interpreted = await workspaceState(page);
  expect(interpreted.humanReports).toHaveLength(1);
  expect(interpreted.humanReports[0].responseIds).toEqual(["anonymous-e2e-response"]);
  const beforeHumanDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"));
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why did viewers miss the payoff?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByText("Payoff's diagnosis · story unchanged", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(beforeHumanDiagnosis);

  await page.getByRole("tab", { name: "Storyboard" }).click();
  await page.getByLabel("More options for He finally looks").click();
  await page.getByRole("menuitem", { name: "Edit manually" }).click();
  await page.getByLabel("What happens").fill("Dad puts the phone away, apologizes, and lets her choose the next crayon.");
  await page.getByRole("button", { name: "Save beat" }).click();
  await expect(page.getByText("Untested revision", { exact: true })).toBeVisible();
  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await expect(page.getByText(/0 responses · Waiting for viewers/)).toBeVisible();
  await expect(page.getByText("Previous Human Audience evidence remains preserved on the story version it tested.")).toBeVisible();
  const revised = await workspaceState(page);
  expect(revised.reactionSet.responses).toHaveLength(0);
  expect(revised.reactionHistory.some((set) => set.storyVersionId === stimulus.storyVersionId && set.responses.length === 1)).toBe(true);
});

test("Human Audience interpretation failures keep real responses safe and retry cleanly", async ({ page }) => {
  let attempts = 0;
  await page.route("**/api/audience", async (route) => {
    const body = route.request().postDataJSON() as {
      source: "human";
      expected_version: string;
      story_hash: string;
      beats: StoryBeatPayload[];
      responses: Array<{ id: string }>;
    };
    attempts += 1;
    if (attempts === 1) {
      await route.fulfill({
        status: 502,
        contentType: "application/json",
        body: JSON.stringify({ error: { code: "AI_TEMPORARILY_UNAVAILABLE", message: "Payoff couldn't make sense of those viewer responses. Your responses are safe.", retryable: true } }),
      });
      return;
    }
    await route.fulfill({
      status: 200,
      contentType: "application/json",
      body: JSON.stringify({
        source: "human",
        story_version: body.expected_version,
        story_hash: body.story_hash,
        response_ids: body.responses.map((response) => response.id),
        summary: "The viewer recognized the repair, but the sample is still early.",
        audience_landing: "A guilty realization followed by warmth.",
        match: "insufficient",
        observed_arc: ["recognition", "guilt", "warmth"],
        what_landed: "The final reconnection felt warm.",
        where_it_drifted: "Dad felt absent for longer than intended.",
        biggest_opportunity: "Make his care visible before the reveal.",
        strongest_beat: { beat_id: body.beats[5].id, why: "The final shared action supports the warmth." },
        weakest_beat: { beat_id: body.beats[3].id, why: "Her withdrawal lets guilt accumulate." },
        main_risk: "Guilt may remain stronger than warmth.",
        changed_audience: { beat_id: body.beats[4].id, why: "The drawing reframes the earlier pattern." },
      }),
    });
  });

  await openClean(page);
  await startExample(page);
  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await page.getByRole("tab", { name: /Human Audience/ }).click();
  const state = await workspaceState(page);
  const stimulus = state.humanTest!;
  const response = {
    schema: "payoff-study-response/v1",
    study: {
      projectId: stimulus.projectId,
      storyVersionId: stimulus.storyVersionId,
      storyHash: stimulus.storyHash,
      targetWasHidden: true,
      firstViewingWasUninterrupted: true,
    },
    response: {
      id: "human-retry-response",
      storyVersionId: stimulus.storyVersionId,
      storyHash: stimulus.storyHash,
      submittedAt: "2026-08-27T13:00:00.000Z",
      endingEmotion: "warm",
      interpretation: "He chooses to be present.",
      wasSurprised: true,
      predictionPoint: "beat_5",
      changedBeatId: stimulus.beats[4].id,
      changedWhy: "The drawing made his absence visible.",
      quoteConsent: false,
    },
  };
  await page.locator(".import-button input").setInputFiles({
    name: "human-retry-response.json",
    mimeType: "application/json",
    buffer: Buffer.from(JSON.stringify(response)),
  });

  await expect(page.getByRole("alert")).toContainText("Your responses are safe");
  let persisted = await workspaceState(page);
  expect(persisted.reactionSet.responses).toHaveLength(1);
  expect(persisted.humanReports).toHaveLength(0);
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Human Audience · 1 real viewer", { exact: true })).toBeVisible();
  persisted = await workspaceState(page);
  expect(persisted.reactionSet.responses).toHaveLength(1);
  expect(persisted.humanReports).toHaveLength(1);
  expect(attempts).toBe(2);
});

test("AI operation failures leave state intact and provide retry", async ({ page }) => {
  let revisionAttempts = 0;
  let audienceAttempts = 0;
  await page.route("**/api/revise", async (route) => {
    revisionAttempts += 1;
    if (revisionAttempts === 1) {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "AI_TEMPORARILY_UNAVAILABLE", message: "Payoff couldn't finish that revision. Your story was not changed.", retryable: true } }) });
      return;
    }
    const body = route.request().postDataJSON() as Parameters<typeof revisionResponse>[0];
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify(revisionResponse(body)) });
  });
  await page.route("**/api/audience", async (route) => {
    audienceAttempts += 1;
    if (audienceAttempts === 1) {
      await route.fulfill({ status: 502, contentType: "application/json", body: JSON.stringify({ error: { code: "AI_TEMPORARILY_UNAVAILABLE", message: "Payoff couldn't finish the audience check. Your story was not changed.", retryable: true } }) });
      return;
    }
    const body = route.request().postDataJSON() as { expected_version: string; beats: StoryBeatPayload[] };
    await route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
      source: "ai",
      label: "AI-simulated audience",
      notice: "Useful as an early check. Not human evidence.",
      story_version: body.expected_version,
      summary: "The reveal is clear.",
      audience_landing: "A guilty sting, then warmth.",
      match: "partial",
      observed_arc: ["amusement", "guilt", "warmth"],
      what_landed: "The reveal is easy to understand.",
      where_it_drifted: "The repair feels quick after the guilt builds.",
      biggest_opportunity: "Give the warm ending one more emotional beat.",
      strongest_beat: { beat_id: body.beats[4].id, why: "The reveal is legible." },
      weakest_beat: { beat_id: body.beats[5].id, why: "The repair is quick." },
      main_risk: "Guilt lingers.",
      changed_audience: { beat_id: body.beats[4].id, why: "It reframes the setup." },
      reactions: [
        { persona: "impatient_casual", note: "Gets it.", evidence: "Clear pattern." },
        { persona: "emotionally_sensitive", note: "Feels guilt.", evidence: "Quiet turn." },
        { persona: "literal_low_context", note: "Follows it.", evidence: "Concrete reveal." },
        { persona: "skeptical_viewer", note: "Questions the repair.", evidence: "Short ending." },
      ],
      disagreements: ["The repair may or may not feel sufficient."],
      confidence: { level: "medium", note: "Simulated early signal only." },
    }) });
  });
  await page.route("**/api/diagnose", async (route) => route.fulfill({
    status: 502,
    contentType: "application/json",
    body: JSON.stringify({ error: { code: "AI_TEMPORARILY_UNAVAILABLE", message: "Payoff couldn't explain the result just now. Your story was not changed.", retryable: true } }),
  }));

  await openClean(page);
  await startExample(page);
  const initialOrder = ["Dad, look", "Another drawing", "The fridge fills up", "She stops asking", "A drawing of Dad", "He finally looks"];
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await page.getByRole("textbox", { name: "Ask Payoff to change the story" }).fill("Make the opening faster.");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await expect(page.getByRole("alert")).toContainText("Your story was not changed");
  await expect(page.locator(".story-card h3")).toHaveText(initialOrder);
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();

  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByRole("alert")).toContainText("Your story was not changed");
  await expect(page.getByText("A guilty sting, then warmth.", { exact: true })).toHaveCount(0);
  await page.getByRole("alert").getByRole("button", { name: "Try again" }).click();
  await expect(page.getByText("A guilty sting, then warmth.", { exact: true })).toBeVisible();
  const beforeDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"));
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why was the reveal predictable?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByRole("alert")).toContainText("Your story was not changed");
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(beforeDiagnosis);
});

test("desktop, tablet, and mobile keep both primary views in bounds", async ({ page }) => {
  for (const viewport of [{ width: 1440, height: 900 }, { width: 834, height: 1112 }, { width: 390, height: 844 }]) {
    await page.setViewportSize(viewport);
    await page.goto("/");
    await page.evaluate(() => { localStorage.clear(); sessionStorage.clear(); });
    await page.reload();
    await startExample(page);
    await expect(page.getByRole("tab", { name: "Storyboard" })).toBeVisible();
    await expect(page.getByRole("tab", { name: "Test the payoff" })).toBeVisible();
    let width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(width.document).toBe(width.viewport);

    await page.getByRole("tab", { name: "Test the payoff" }).click();
    await expect(page.getByRole("heading", { name: "Did it land?" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /AI Audience/ })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Human Audience/ })).toBeVisible();
    width = await page.evaluate(() => ({ viewport: window.innerWidth, document: document.documentElement.scrollWidth }));
    expect(width.document).toBe(width.viewport);

    await page.getByRole("tab", { name: "Storyboard" }).click();
    await page.getByLabel("More options for Dad, look").click();
    await page.getByRole("menuitem", { name: "Edit manually" }).click();
    const dialog = page.getByRole("dialog", { name: "Edit beat" });
    await expect(dialog).toBeVisible();
    const rect = await dialog.evaluate((element) => element.getBoundingClientRect().toJSON());
    expect(rect.x).toBeGreaterThanOrEqual(0);
    expect(rect.width).toBeLessThanOrEqual(viewport.width);
    await page.getByRole("button", { name: "Close editor" }).click();
  }
});

test("the first Human Audience viewing is uninterrupted and target-blind", async ({ page }) => {
  await page.clock.install();
  await openClean(page, "/study");
  await expect(page.getByText("No emotional target is shown")).toBeVisible();
  await expect(page.getByText(/gut punch|warmth/i)).toHaveCount(0);
  await page.getByRole("button", { name: /Begin uninterrupted viewing/ }).click();
  await expect(page.getByText("There are no questions until it ends.")).toBeVisible();
  await expect(page.getByText(/What emotion did the ending leave you with/)).toHaveCount(0);
  for (let beat = 1; beat <= 6; beat += 1) await page.clock.fastForward(5_650);
  await expect(page.getByText("What emotion did the ending leave you with?")).toBeVisible();
  await expect(page.getByText("The creator’s intended response is intentionally hidden.")).toBeVisible();
});

test("demo=1 repeats the canonical production workflow deterministically without live scene generation", async ({ page }) => {
  test.setTimeout(120_000);
  const apiRequests: Array<{ path: string; demoHeader: string | undefined }> = [];
  page.on("request", (request) => {
    const url = new URL(request.url());
    if (url.pathname.startsWith("/api/")) {
      apiRequests.push({ path: url.pathname, demoHeader: request.headers()["x-payoff-demo"] });
    }
  });

  await openClean(page, "/?demo=1&reset=1");
  const demoIndicator = page.getByRole("img", { name: "Demo mode" });
  await expect(demoIndicator).toBeVisible();
  const indicatorBounds = await demoIndicator.boundingBox();
  expect(indicatorBounds).not.toBeNull();
  expect(indicatorBounds!.width).toBeLessThanOrEqual(6);
  expect(indicatorBounds!.height).toBeLessThanOrEqual(6);
  expect(1440 - indicatorBounds!.x - indicatorBounds!.width).toBeLessThanOrEqual(8);
  expect(900 - indicatorBounds!.y - indicatorBounds!.height).toBeLessThanOrEqual(8);
  const outcomes: Array<Record<string, unknown>> = [];
  const initialTitles = ["Dad, look", "Another drawing", "The fridge fills up", "She stops asking", "A drawing of Dad", "He finally looks"];

  for (let iteration = 0; iteration < 10; iteration += 1) {
    await page.getByRole("button", { name: "Try example: Looks Great" }).click();
    await page.getByRole("button", { name: "Create storyboard" }).click();
    await expect(page.getByRole("heading", { name: "Building your story..." })).toBeVisible();
    await expect(page.locator(".story-card")).toHaveCount(6);
    await expect(page.locator(".story-card h3")).toHaveText(initialTitles);

    const originalAssetSources = await page.locator(".story-card .generated-scene img").evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).src));
    expect(originalAssetSources).toHaveLength(6);

    await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
    await page.getByRole("textbox", { name: "Ask Payoff to change the story" }).fill("Make the opening faster");
    await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
    await expect(page.getByRole("button", { name: "Planning changes..." })).toBeDisabled();
    await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();
    await expect(page.getByText("Dad answers reflexively before the drawing is fully raised.", { exact: true })).toBeVisible();
    await page.getByRole("button", { name: "Apply changes" }).click();

    const firstCard = page.locator(".story-card").first();
    await expect(firstCard.getByRole("heading", { name: "Already answering" })).toBeVisible();
    await expect(firstCard).toContainText("Before his daughter finishes raising the drawing");
    await expect(page.getByText("Untested revision", { exact: true })).toBeVisible();
    await expect(firstCard.getByText("Updating scene visual...", { exact: true })).toBeVisible();
    const revisedOpening = firstCard.locator(".generated-scene img");
    await expect(revisedOpening).toBeVisible();
    await expect(revisedOpening).toHaveAttribute("src", /drawing-offer-faster/);
    const revisedAssetSources = await page.locator(".story-card .generated-scene img").evaluateAll((images) =>
      images.map((image) => (image as HTMLImageElement).src));
    expect(revisedAssetSources.slice(1)).toEqual(originalAssetSources.slice(1));

    const stateAfterRevision = await page.evaluate(() => ({
      demo: JSON.parse(localStorage.getItem("payoff.demo.workspace.v5") ?? "null") as {
        activeVersionId: string;
        versions: Array<{ id: string }>;
        aiPreviews: unknown[];
        humanReports: unknown[];
      },
      normal: localStorage.getItem("payoff.workspace.v4"),
    }));
    expect(stateAfterRevision.normal).toBeNull();
    expect(stateAfterRevision.demo.activeVersionId).toBe("looks-great-r2");
    expect(stateAfterRevision.demo.versions.map((version) => version.id)).toEqual(["looks-great-v1", "looks-great-r2"]);
    expect(stateAfterRevision.demo.aiPreviews).toHaveLength(0);
    expect(stateAfterRevision.demo.humanReports).toHaveLength(0);

    await page.getByRole("tab", { name: "Test the payoff" }).click();
    await page.getByRole("button", { name: "Run AI Audience" }).click();
    await expect(page.getByRole("heading", { name: "Testing the payoff..." })).toBeVisible();
    await expect(page.getByText("AI Audience · simulated", { exact: true })).toBeVisible();
    await expect(page.getByText("Strong match", { exact: true })).toBeVisible();
    await expect(page.getByText("Quick recognition, a clean gut punch, then earned warmth.", { exact: true })).toBeVisible();
    await expect(page.getByRole("heading", { name: "What landed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where it drifted" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Biggest opportunity" })).toBeVisible();
    await expect(page.getByRole("tab", { name: /Human Audience/ })).toContainText("Rehearsal data · not real viewers");
    if (iteration === 0) {
      await page.getByRole("button", { name: "See details" }).click();
      await expect(page.getByText("Strongest beat", { exact: true })).toBeVisible();
      await page.getByRole("button", { name: "Hide details" }).click();
      const beforeDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.demo.workspace.v5"));
      await page.getByRole("button", { name: "Understand why" }).click();
      await page.getByRole("button", { name: "Why did this feel sad instead of warm?" }).click();
      await page.getByRole("button", { name: "Ask why" }).click();
      await expect(page.getByText("Payoff's diagnosis · story unchanged", { exact: true })).toBeVisible();
      await expect(page.getByText(/four beats build distance, while one final beat carries the repair/i)).toBeVisible();
      expect(await page.evaluate(() => localStorage.getItem("payoff.demo.workspace.v5"))).toBe(beforeDiagnosis);
    }

    await page.getByRole("tab", { name: /Human Audience/ }).click();
    await expect(page.getByRole("heading", { name: "Organizing rehearsal responses..." })).toBeVisible();
    await expect(page.getByText("Human Audience · Rehearsal data", { exact: true })).toBeVisible();
    await expect(page.getByText("Synthetic development fixture. Not real viewer evidence.", { exact: true })).toBeVisible();
    await expect(page.getByText("A guilty sting followed by reassuring warmth.", { exact: true })).toBeVisible();
    await expect(page.getByText(/Human Audience · \d+ real viewers?/)).toHaveCount(0);
    await expect(page.getByRole("heading", { name: "What landed" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Where it drifted" })).toBeVisible();
    await expect(page.getByRole("heading", { name: "Biggest opportunity" })).toBeVisible();

    const functionalOutcome = await page.evaluate(() => {
      const state = JSON.parse(localStorage.getItem("payoff.demo.workspace.v5") ?? "null");
      return {
        activeVersionId: state.activeVersionId,
        storyHash: state.reactionSet.storyHash,
        evidenceKind: state.reactionSet.evidenceKind,
        responseIds: state.reactionSet.responses.map((response: { id: string }) => response.id),
        aiMatch: state.aiPreviews[0].targetMatch,
        humanMatch: state.humanReports[0].match,
        humanReportVersion: state.humanReports[0].storyVersionId,
      };
    });
    outcomes.push(functionalOutcome);
    expect(functionalOutcome).toEqual({
      activeVersionId: "looks-great-r2",
      storyHash: "fnv1a:5e561bf4",
      evidenceKind: "rehearsal",
      responseIds: [
        "rehearsal-only-opening-faster-01",
        "rehearsal-only-opening-faster-02",
        "rehearsal-only-opening-faster-03",
        "rehearsal-only-opening-faster-04",
      ],
      aiMatch: "strong",
      humanMatch: "partial",
      humanReportVersion: "looks-great-r2",
    });

    await page.getByRole("tab", { name: "Storyboard" }).click();
    await expect(firstCard.getByRole("heading", { name: "Already answering" })).toBeVisible();
    await page.getByRole("button", { name: "Start over" }).click();
    await page.getByRole("alertdialog", { name: "Start a new story?" }).getByRole("button", { name: "Start over" }).click();
    await expect(page.getByRole("heading", { name: "What story are you trying to tell?" })).toBeVisible();
  }

  expect(outcomes.every((outcome) => JSON.stringify(outcome) === JSON.stringify(outcomes[0]))).toBe(true);
  expect(apiRequests.filter((request) => request.path === "/api/revise")).toHaveLength(10);
  expect(apiRequests.filter((request) => request.path === "/api/audience")).toHaveLength(20);
  expect(apiRequests.filter((request) => request.path === "/api/diagnose")).toHaveLength(1);
  expect(apiRequests.filter((request) => request.path === "/api/storyboard")).toHaveLength(0);
  expect(apiRequests.filter((request) => request.path === "/api/scene")).toHaveLength(0);
  expect(apiRequests.every((request) => request.demoHeader === "1")).toBe(true);
});

test("revision composer opens centered, remains in the viewport while dragged, and stays closable", async ({ page }) => {
  await openClean(page, "/?demo=1&reset=1");
  await startExample(page);
  const scrollBefore = await page.evaluate(() => window.scrollY);
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  const composer = page.getByRole("dialog", { name: "Ask Payoff to revise" });
  await expect(composer).toBeVisible();
  const centered = await composer.boundingBox();
  expect(centered).not.toBeNull();
  expect(Math.abs(centered!.x + centered!.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(Math.abs(centered!.y + centered!.height / 2 - 450)).toBeLessThanOrEqual(2);
  expect(await page.evaluate(() => window.scrollY)).toBe(scrollBefore);

  const dragHandle = composer.locator("header");
  const handleBounds = await dragHandle.boundingBox();
  expect(handleBounds).not.toBeNull();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2, handleBounds!.y + 20);
  await page.mouse.down();
  await page.mouse.move(handleBounds!.x + handleBounds!.width / 2 + 140, handleBounds!.y + 110, { steps: 6 });
  await page.mouse.up();
  const moved = await composer.boundingBox();
  expect(moved).not.toBeNull();
  expect(moved!.x - centered!.x).toBeGreaterThan(100);
  expect(moved!.y - centered!.y).toBeGreaterThan(60);
  expect(moved!.x).toBeGreaterThanOrEqual(12);
  expect(moved!.y).toBeGreaterThanOrEqual(12);
  expect(moved!.x + moved!.width).toBeLessThanOrEqual(1428);
  expect(moved!.y + moved!.height).toBeLessThanOrEqual(888);

  await composer.getByRole("button", { name: "Close revision composer" }).click();
  await expect(composer).toHaveCount(0);
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  const reopened = await composer.boundingBox();
  expect(reopened).not.toBeNull();
  expect(Math.abs(reopened!.x + reopened!.width / 2 - 720)).toBeLessThanOrEqual(2);
  expect(Math.abs(reopened!.y + reopened!.height / 2 - 450)).toBeLessThanOrEqual(2);
  await page.keyboard.press("Escape");
  await expect(composer).toHaveCount(0);
});

test("the punctuated cached revision produces the exact AI Audience fixture", async ({ page }) => {
  await openClean(page, "/?demo=1&reset=1");
  await startExample(page);
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await page.getByRole("textbox", { name: "Ask Payoff to change the story" }).fill("Make the opening faster.");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.locator(".story-card").first().locator(".generated-scene img")).toHaveAttribute("src", /drawing-offer-faster/);
  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByText("AI Audience · simulated", { exact: true })).toBeVisible();
  await expect(page.getByText("Strong match", { exact: true })).toBeVisible();
  await expect(page.getByText("Quick recognition, a clean gut punch, then earned warmth.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Missing demo fixture: ai-audience/)).toHaveCount(0);
});

test("the clean demo baseline has its own cached AI Audience report", async ({ page }) => {
  await openClean(page, "/?demo=1&reset=1");
  await startExample(page);
  await page.getByRole("tab", { name: "Test the payoff" }).click();
  await page.getByRole("button", { name: "Run AI Audience" }).click();
  await expect(page.getByText("AI Audience · simulated", { exact: true })).toBeVisible();
  await expect(page.getByText("Strong match", { exact: true })).toBeVisible();
  await expect(page.getByText("Familiar amusement, a clear guilty sting, then gentle warmth.", { exact: true })).toBeVisible();
  await expect(page.getByText(/Missing demo fixture: ai-audience/)).toHaveCount(0);
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why was the reveal predictable?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByText(/The main opportunity is pace/i)).toBeVisible();
});

test("demo revision Undo restores the reviewed baseline and cached original asset", async ({ page }) => {
  await openClean(page, "/?demo=1&reset=1");
  await startExample(page);
  const originalSource = await page.locator(".story-card").first().locator("img").getAttribute("src");
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await page.getByRole("textbox", { name: "Ask Payoff to change the story" }).fill("Make the opening faster.");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes" }).click();
  const revisedCard = page.locator(".story-card").first();
  await expect(revisedCard.getByRole("heading", { name: "Already answering" })).toBeVisible();
  await expect(revisedCard.locator(".generated-scene img")).toHaveAttribute("src", /drawing-offer-faster/);
  await expect(revisedCard.getByText("Scene visual couldn't be updated.", { exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Undo" }).click();
  await expect(page.locator(".story-card").first().getByRole("heading", { name: "Dad, look" })).toBeVisible();
  await expect(page.locator(".story-card").first().locator("img")).toHaveAttribute("src", originalSource!);
  const state = await page.evaluate(() => JSON.parse(localStorage.getItem("payoff.demo.workspace.v5") ?? "null"));
  expect(state.activeVersionId).toBe("looks-great-v1");
  expect(state.aiPreviews).toHaveLength(0);
  expect(state.humanReports).toHaveLength(0);
});

test("demo persistence and hard reset stay isolated from the normal workspace", async ({ page }) => {
  await openClean(page);
  await expect(page.getByRole("img", { name: "Demo mode" })).toHaveCount(0);
  await startExample(page);
  const normalWorkspace = await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"));
  expect(normalWorkspace).not.toBeNull();

  await page.goto("/?demo=1&reset=1");
  await expect(page.getByRole("img", { name: "Demo mode" })).toBeVisible();
  await startExample(page);
  await page.getByRole("button", { name: "Ask Payoff to revise" }).click();
  await page.getByRole("textbox", { name: "Ask Payoff to change the story" }).fill("Make the opening faster");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await page.getByRole("button", { name: "Apply changes" }).click();
  await expect(page.locator(".story-card").first().getByRole("heading", { name: "Already answering" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(normalWorkspace);
  expect(await page.evaluate(() => localStorage.getItem("payoff.demo.workspace.v5"))).not.toBeNull();

  await page.goto("/");
  await expect(page.getByRole("img", { name: "Demo mode" })).toHaveCount(0);
  await expect(page.locator(".story-card").first().getByRole("heading", { name: "Dad, look" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(normalWorkspace);

  await page.goto("/?demo=1&reset=1&debug=1");
  await expect(page.getByRole("heading", { name: "What story are you trying to tell?" })).toBeVisible();
  const demoReset = await page.evaluate(() => JSON.parse(localStorage.getItem("payoff.demo.workspace.v5") ?? "null"));
  expect(demoReset).toBeNull();
  await startExample(page);
  await expect(page.getByText("Developer details", { exact: true })).toBeVisible();
  await page.getByText("Developer details", { exact: true }).click();
  await expect(page.getByText(/Demo cache active/)).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(normalWorkspace);

  const currentDemo = await page.evaluate(() => localStorage.getItem("payoff.demo.workspace.v5"));
  expect(currentDemo).not.toBeNull();
  await page.evaluate((staleDemo) => {
    localStorage.setItem("payoff.demo.workspace.v4", staleDemo!);
    localStorage.removeItem("payoff.demo.workspace.v5");
  }, currentDemo);
  await page.goto("/?demo=1");
  await expect(page.getByRole("heading", { name: "What story are you trying to tell?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.demo.workspace.v5"))).toBeNull();
  expect(await page.evaluate(() => localStorage.getItem("payoff.demo.workspace.v4"))).toBe(currentDemo);
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v4"))).toBe(normalWorkspace);
});

test("WebMCP remains an opt-in primitive collaboration layer", async ({ page }) => {
  await openClean(page, "/?debug=1");
  await startExample(page);
  await expect(page.getByText("Developer details", { exact: true })).toBeVisible();

  const names = await page.evaluate(async () => {
    const context = document.modelContext;
    if (!context) throw new Error("WebMCP is unavailable despite the enabled Chrome feature.");
    return (await context.getTools()).map((tool) => tool.name).sort();
  });
  const brief = await runTool<{ active_version: string }>(page, "get_story_brief", {});
  const reactions = await runTool<{ valid_response_count: number; note: string }>(page, "get_audience_reactions", {});
  const preview = await runTool<{ storyVersionId: string }>(page, "save_ai_preview", {
    expected_version: brief.active_version,
    summary: "Viewer lenses may disagree on whether the warm repair outweighs the guilt.",
    perspectives: [
      { persona: "impatient_casual", likely_response: "Gets the pattern quickly.", watch_for: "May predict the reveal." },
      { persona: "emotionally_sensitive", likely_response: "Feels the withdrawal sharply.", watch_for: "May retain guilt after the repair." },
    ],
    disagreements: ["The ending may feel warm to one lens and too neat to another."],
    audience_landing: "A guilty sting, then warmth.",
    target_match: "partial",
    strongest_beat_id: "beat-5",
    strongest_beat_why: "The drawing reveal is immediate.",
    weakest_beat_id: "beat-6",
    weakest_beat_why: "The repair is brief.",
    main_risk: "Guilt may linger.",
    observed_arc: ["amusement", "guilt", "warmth"],
    changed_audience_beat_id: "beat-5",
    changed_audience_why: "It reframes the pattern.",
    confidence: "medium",
    confidence_note: "Simulated perspective check only.",
  });
  const replacement = await runTool<{ affectedBeatIds: string[] }>(page, "replace_story_beat", {
    beat_id: "beat-5",
    expected_version: brief.active_version,
    title: "He sees it",
    action: "Dad studies the drawing for the first time.",
    line: "DAD",
    narrative_role: "turn",
    intended_emotion: "recognition",
    visual: {
      setting: "The same family kitchen beside the refrigerator.",
      characters: [{
        id: "dad",
        appearance: "Early 40s, short dark hair, charcoal sweater, dark trousers, gentle face that looks tired when distracted.",
        position: "Standing beside the refrigerator.",
        action: "Studies the drawing with his real phone lowered.",
      }],
      focal_action: "Dad studies the drawing for the first time and understands that the phone has taken his place.",
      focal_object: "The daughter's drawing of a phone in Dad's chair.",
      composition: "Keep Dad's gaze, lowered phone, and drawing on one clear sightline.",
      emotional_cue: "Specific recognition.",
      visible_text: "DAD",
      continuity_notes: ["Keep Dad, his clothes, the phone, and kitchen consistent."],
    },
  });

  expect(names).toEqual(["create_story_beat", "get_ai_preview", "get_audience_reactions", "get_story_brief", "list_story_beats", "move_story_beat", "replace_story_beat", "save_ai_preview"]);
  expect(reactions.valid_response_count).toBe(0);
  expect(reactions.note).toMatch(/No human responses/);
  expect(preview.storyVersionId).toBe("looks-great-v1");
  expect(replacement.affectedBeatIds).toEqual(["beat-5"]);
  await expect(page.getByRole("heading", { name: "He sees it" })).toBeVisible();
  await expect(page.getByText("Untested revision", { exact: true })).toBeVisible();

  await page.goto("/");
  await expect(page.getByText("Developer details", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/WebMCP|Site Tools|ModelContext/i)).toHaveCount(0);
});
