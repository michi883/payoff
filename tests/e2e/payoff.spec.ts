import { expect, test, type Page } from "@playwright/test";

async function openClean(page: Page, path: string) {
  await page.addInitScript(() => {
    if (!sessionStorage.getItem("payoff-e2e-cleaned")) {
      localStorage.clear();
      sessionStorage.setItem("payoff-e2e-cleaned", "true");
    }
  });
  await page.goto(path);
}

test("workspace opens on the immutable baseline with honest empty evidence", async ({ page }) => {
  await openClean(page, "/");

  await expect(page.getByRole("heading", { name: "Nothing Urgent", exact: true })).toBeVisible();
  await expect(page.getByText("Research in progress · 0/12 minimum")).toBeVisible();
  await expect(page.getByText("No audience verdict yet")).toBeVisible();
  await expect(page.getByText(/Findings stay blank until real responses are imported/)).toBeVisible();
  await expect(page.getByRole("article")).toHaveCount(6);
});

test("a human edit uses the shared versioned command path", async ({ page }) => {
  await openClean(page, "/");
  await page.getByRole("button", { name: "Edit beat" }).nth(4).click();
  await page.getByLabel("Beat title").fill("A different turn");
  await page.getByLabel("What happens").fill("Mom sees the auto-generated message and pauses.");
  await page.getByLabel("Dialogue or on-screen line").fill("Generated warmly");
  await page.getByRole("button", { name: "Save replacement" }).click();

  await expect(page.getByRole("heading", { name: "A different turn" })).toBeVisible();
  await expect(page.getByText("Untested revision · based on tested v1")).toBeVisible();
  await page.reload();
  await expect(page.getByRole("heading", { name: "A different turn" })).toBeVisible();
});

test("the first audience viewing is uninterrupted and target-blind", async ({ page }) => {
  await page.clock.install();
  await openClean(page, "/study");

  await expect(page.getByText("No emotional target is shown")).toBeVisible();
  await expect(page.getByText(/oh-shit realization/i)).toHaveCount(0);
  await page.getByRole("button", { name: /Begin uninterrupted viewing/ }).click();
  await expect(page.getByText("There are no questions until it ends.")).toBeVisible();
  await expect(page.getByText(/What emotion did the ending leave you with/)).toHaveCount(0);

  for (let beat = 1; beat <= 6; beat += 1) {
    await page.clock.fastForward(5_650);
  }

  await expect(page.getByText("What emotion did the ending leave you with?")).toBeVisible();
  await expect(page.getByText("The creator’s intended response is intentionally hidden.")).toBeVisible();
});

test("real Chrome WebMCP discovers tools and executes the shared command path", async ({ page }) => {
  await openClean(page, "/");
  await expect(page.getByText("Agent ready", { exact: true })).toBeVisible();

  const result = await page.evaluate(async () => {
    const context = document.modelContext;
    if (!context) throw new Error("WebMCP is unavailable despite the enabled Chrome feature.");
    const tools = await context.getTools();
    const run = async (name: string, input: Record<string, unknown>) => {
      const tool = tools.find((candidate) => candidate.name === name);
      if (!tool) throw new Error(`Missing WebMCP tool: ${name}`);
      const output = await context.executeTool(tool, JSON.stringify(input));
      return JSON.parse(output ?? "{}");
    };
    const brief = await run("get_story_brief", {});
    const reactions = await run("get_audience_reactions", {});
    const replacement = await run("replace_story_beat", {
      beat_id: "beat-5",
      expected_version: brief.active_version,
      title: "Warmly, again",
      action: "Across town, Mom taps her own suggested reply without listening to Eli's note.",
      line: "Make it sound more maternal ✦",
      narrative_role: "turn",
      intended_emotion: "recognition",
      art_key: "mother_autoreply",
    });
    return {
      names: tools.map((tool) => tool.name).sort(),
      reactions,
      replacement,
    };
  });

  expect(result.names).toEqual([
    "create_story_beat",
    "get_audience_reactions",
    "get_story_brief",
    "list_story_beats",
    "move_story_beat",
    "replace_story_beat",
  ]);
  expect(result.reactions.valid_response_count).toBe(0);
  expect(result.reactions.note).toMatch(/No human responses/);
  expect(result.replacement.affectedBeatIds).toEqual(["beat-5"]);
  await expect(page.getByRole("heading", { name: "Warmly, again" })).toBeVisible();
  await expect(page.getByText("Untested revision · based on tested v1", { exact: true })).toBeVisible();
});
