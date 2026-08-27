import { expect, test, type Page, type Route } from "@playwright/test";
import { Buffer } from "node:buffer";

type StoryBeatPayload = {
  id: string;
  order: number;
  title: string;
  action: string;
  line: string;
  narrativeRole: "setup" | "escalation" | "turn" | "payoff";
  intendedEmotion: string;
  artKey: string;
};

const generatedBeats = [
  { title: "His entrance", action: "Dad strides into the school auditorium just as the lights dim.", line: "Made it.", narrativeRole: "setup", intendedEmotion: "confidence", artKey: "conversation" },
  { title: "The solo", action: "His daughter steps into the light and searches the front row for him.", line: "", narrativeRole: "setup", intendedEmotion: "anticipation", artKey: "window_light" },
  { title: "A proud wave", action: "Dad waves broadly; she gives him a small, uncertain smile.", line: "", narrativeRole: "escalation", intendedEmotion: "unease", artKey: "conversation" },
  { title: "What she watches", action: "During her performance, she keeps looking at the empty chair beside him.", line: "", narrativeRole: "turn", intendedEmotion: "surprise", artKey: "clock" },
  { title: "The missing person", action: "Dad sees the reserved card on that chair: MOM.", line: "", narrativeRole: "payoff", intendedEmotion: "emotional sting", artKey: "phone_closeup" },
  { title: "Make room", action: "He moves the card to his lap, holds the empty seat open, and watches quietly with her.", line: "I understand.", narrativeRole: "payoff", intendedEmotion: "warmth", artKey: "window_light" },
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
        artKey: beat.artKey,
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
      beats: generatedBeats,
    }),
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
  return page.evaluate(() => JSON.parse(localStorage.getItem("payoff.workspace.v3") ?? "null") as {
    activeVersionId: string;
    versions: Array<{ id: string }>;
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

  await expect(page.getByRole("heading", { name: "The Empty Seat" })).toBeVisible();
  await expect(page.getByText("45-second vertical short", { exact: true })).toBeVisible();
  await expect(page.getByText("Confident surprise → small emotional sting → warmth", { exact: true })).toBeVisible();
  await expect(page.locator(".story-card h3")).toHaveText(generatedBeats.map((beat) => beat.title));
  await expect(page.getByText("Add first beat", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/WebMCP|Site Tools|ModelContext/i)).toHaveCount(0);

  const composer = page.getByRole("textbox", { name: "Ask Payoff to change the story" });
  const firstCard = page.locator(".story-card").first();
  await composer.fill("Make Dad seem busy rather than uncaring.");
  await page.getByRole("button", { name: "Ask Payoff", exact: true }).click();
  await expect(page.getByRole("button", { name: "Planning changes..." })).toBeDisabled();
  await expect(page.getByText("Proposed revision · story unchanged", { exact: true })).toBeVisible();
  await expect(page.getByRole("heading", { name: "What I'll change" })).toBeVisible();
  await expect(page.getByText("Dad's divided attention gets a clear, temporary cause.")).toBeVisible();
  await expect(firstCard).toContainText("Dad strides into the school auditorium");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(firstCard).toContainText("Dad strides into the school auditorium");

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

  const beforeDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.workspace.v3"));
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why did this feel sad instead of warm?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByText("Payoff's diagnosis · story unchanged", { exact: true })).toBeVisible();
  await expect(page.getByText(/guilt easier to retain than warmth/i)).toBeVisible();
  await expect(page.getByRole("heading", { name: "Did it land?" })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v3"))).toBe(beforeDiagnosis);

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

test("the Looks Great storyboard keeps canonical order and hides editing behind one menu", async ({ page }) => {
  await openClean(page);
  await startExample(page);

  await expect(page.getByRole("heading", { name: "Looks Great" })).toBeVisible();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Again", "The pattern", "She stops asking", "The payoff", "The response",
  ]);
  await expect(page.getByLabel(/More options for/)).toHaveCount(6);
  await expect(page.getByRole("button", { name: /Move .* left|Move .* right/ })).toHaveCount(0);

  await page.getByLabel("More options for Again").click();
  await expect(page.getByRole("menuitem", { name: "Ask Payoff to change this beat" })).toBeVisible();
  await expect(page.getByRole("menuitem", { name: "Edit manually" })).toBeVisible();
  await page.getByRole("menuitem", { name: "Ask Payoff to change this beat" }).click();
  await expect(page.getByRole("button", { name: "Beat 2 · Again" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Ask Payoff to change the story" })).toBeFocused();
  await page.getByRole("button", { name: "Beat 2 · Again" }).click();

  await page.getByLabel("More options for Again").click();
  await page.getByRole("menuitem", { name: "Move later" }).click();
  const moveDialog = page.getByRole("alertdialog", { name: "Move this beat later?" });
  await expect(moveDialog).toBeVisible();
  await expect(moveDialog).toContainText("saved as a new version");
  await moveDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Again", "The pattern", "She stops asking", "The payoff", "The response",
  ]);

  await page.getByLabel("More options for Again").click();
  await page.getByRole("menuitem", { name: "Move later" }).click();
  await page.getByRole("alertdialog", { name: "Move this beat later?" }).getByRole("button", { name: "Move beat" }).click();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "The pattern", "Again", "She stops asking", "The payoff", "The response",
  ]);
  await page.getByRole("button", { name: "Undo" }).click();

  await page.getByLabel("More options for The pattern").click();
  await page.getByRole("menuitem", { name: "Delete beat" }).click();
  const deleteDialog = page.getByRole("alertdialog", { name: "Delete this beat?" });
  await expect(deleteDialog).toContainText("You can undo this change");
  await deleteDialog.getByRole("button", { name: "Cancel" }).click();
  await expect(page.locator(".story-card")).toHaveCount(6);

  await page.getByLabel("More options for The payoff").click();
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
    "Dad, look", "Again", "The pattern", "She stops asking", "The payoff", "The response",
  ]);
  await page.reload();
  await expect(page.locator(".story-card h3")).toHaveText([
    "Dad, look", "Again", "The pattern", "She stops asking", "The payoff", "The response",
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
  const beforeHumanDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.workspace.v3"));
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why did viewers miss the payoff?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByText("Payoff's diagnosis · story unchanged", { exact: true })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v3"))).toBe(beforeHumanDiagnosis);

  await page.getByRole("tab", { name: "Storyboard" }).click();
  await page.getByLabel("More options for The response").click();
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
  const initialOrder = ["Dad, look", "Again", "The pattern", "She stops asking", "The payoff", "The response"];
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
  const beforeDiagnosis = await page.evaluate(() => localStorage.getItem("payoff.workspace.v3"));
  await page.getByRole("button", { name: "Understand why" }).click();
  await page.getByRole("button", { name: "Why was the reveal predictable?" }).click();
  await page.getByRole("button", { name: "Ask why" }).click();
  await expect(page.getByRole("alert")).toContainText("Your story was not changed");
  expect(await page.evaluate(() => localStorage.getItem("payoff.workspace.v3"))).toBe(beforeDiagnosis);
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
    art_key: "phone_dad_drawing",
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
