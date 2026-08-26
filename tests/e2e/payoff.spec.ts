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
