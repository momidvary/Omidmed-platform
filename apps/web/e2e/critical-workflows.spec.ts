import { expect, test } from "@playwright/test";

test("clinician education route stays inside the clinician shell", async ({
  page,
}) => {
  await page.goto("/patient-education");

  await expect(
    page.getByRole("heading", { name: "Patient Education Generator" })
  ).toBeVisible();
  await expect(
    page.locator('aside a[href="/patient-education"]')
  ).toBeVisible();
});

test("patient portal does not inherit the clinician shell", async ({ page }) => {
  await page.goto("/patient");

  await expect(page.locator("aside")).toHaveCount(0);
  await expect(page.locator("html")).toHaveAttribute("dir", "rtl");
});

test("safety screen starts unknown and posture claims stay disabled", async ({
  page,
}) => {
  await page.goto("/red-flags");
  await expect(
    page.getByText("Safety screen not completed", { exact: true })
  ).toBeVisible();
  await expect(page.getByText("No red flags selected", { exact: true })).toHaveCount(
    0
  );
  await expect(
    page.getByRole("button", { name: "Complete and save safety screen" })
  ).toBeDisabled();

  await page.goto("/posture-analysis");
  await expect(
    page.getByRole("heading", { name: "Posture sandbox is disabled" })
  ).toBeVisible();
  await expect(page.locator('input[type="file"]')).toHaveCount(0);
});

test("mock mode never pretends to deliver clinical alerts", async ({ page }) => {
  await page.goto("/alerts");

  await expect(
    page.getByRole("heading", { name: "Clinical Alerts", level: 2 })
  ).toBeVisible();
  await expect(
    page.getByText("Demo mode has no safety queue", { exact: true })
  ).toBeVisible();
  await expect(
    page.getByText("No real clinician notification is sent", { exact: false })
  ).toBeVisible();
});

test("demo settings and clinical records never claim cloud persistence", async ({
  page,
}) => {
  await page.goto("/settings");
  await expect(
    page.getByText("Explicit demo mode — no cloud writes", { exact: true })
  ).toBeVisible();
  await expect(page.getByLabel("Demo clinic name")).toBeVisible();
  await expect(page.getByText("All data in this MVP stays in your browser.")).toHaveCount(0);

  await page.goto("/clinical-records");
  await expect(
    page.getByRole("heading", { name: "No fabricated clinical documentation" })
  ).toBeVisible();

  await page.goto("/case-analysis");
  await page.getByLabel("Patient case").selectOption({ index: 1 });
  await expect(
    page.getByRole("heading", { name: "Signed assessment history" })
  ).toBeVisible();
  await expect(
    page.getByText("This is a local demo case.", { exact: false })
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "Correct record" })
  ).toHaveCount(0);
});

test("sidebar keeps care steps inside the patient flow", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav");
  await expect(nav.locator('a[href="/patients"]')).toBeVisible();
  await expect(nav.locator('a[href="/new-case"]')).toHaveCount(0);
  await expect(nav.locator('a[href="/case-analysis"]')).toHaveCount(0);
  // The library and protocols are everyday tools, listed without expanding.
  await expect(nav.locator('a[href="/exercise-library"]')).toBeVisible();
  await expect(nav.locator('a[href="/protocols"]')).toBeVisible();
  await expect(nav.locator('a[href="/red-flags"]')).toHaveCount(0);

  await nav.getByRole("button", { name: "Tools" }).click();
  await expect(nav.locator('a[href="/red-flags"]')).toBeVisible();

  await page.goto("/new-case");
  await expect(nav.locator('a[href="/patients"]')).toHaveAttribute(
    "aria-current",
    "page"
  );
  await expect(page.getByRole("heading", { name: "New Assessment", level: 1 })).toBeVisible();
});

test("assessment is split into steps and still requires the safety screen", async ({
  page,
}) => {
  await page.goto("/new-case");
  const form = page.locator("main form");

  await form.getByRole("button", { name: "Next" }).click();
  await expect(page.getByText("Main complaint is required.")).toBeVisible();

  await page.getByLabel("Patient name").fill("Step Test");
  await page.getByLabel("Body region").selectOption("knee");
  await page.getByLabel("Main complaint").fill("Knee pain on stairs");
  await form.getByRole("button", { name: "Next" }).click();
  await form.getByRole("button", { name: "Skip" }).click();

  await form.getByRole("button", { name: "Save and continue to examination" }).click();
  await expect(
    page.getByText("Complete the structured red-flag screen before creating the case.")
  ).toBeVisible();

  await form.getByRole("checkbox").check();
  await form.getByRole("button", { name: "Save and continue to examination" }).click();
  await expect(page).toHaveURL(/\/case-analysis/);
});

test("expanded library marks unreviewed exercises and links progression ladders", async ({
  page,
}) => {
  await page.goto("/exercise-library");
  await page.getByText("More filters").click();
  await page.getByRole("combobox", { name: "Reviewed and pending" }).selectOption("pending");
  await page.getByRole("button", { name: "Knee", exact: true }).click();
  await expect(page.getByRole("button", { name: "Knee", exact: true })).toHaveAttribute("aria-pressed", "true");

  await page.getByRole("link", { name: "Open Straight Leg Raise" }).click();
  await expect(page).toHaveURL(/\/exercise-library\/ex_slr$/);
  await expect(page.getByRole("heading", { level: 1, name: "Straight Leg Raise" })).toBeVisible();
  await expect(page.getByText(/cannot be added to a home program/)).toBeVisible();
  await expect(page.getByRole("link", { name: "Prescribe from a patient's record" })).toHaveCount(0);
  await expect(page.getByRole("img", { name: "Animated demonstration of Straight Leg Raise" })).toBeVisible();
  await page.getByRole("button", { name: "End position" }).click();
  await expect(page.getByRole("button", { name: "Play" })).toBeVisible();
  await expect(page.locator('[aria-current="step"]').first()).toContainText("Straight Leg Raise");

  // A reviewed step of the same ladder opens its own page.
  await page.getByRole("link", { name: /Quad Sets/ }).first().click();
  await expect(page).toHaveURL(/\/exercise-library\/ex_quad_sets$/);
  await expect(page.getByText(/cannot be added to a home program/)).toHaveCount(0);
  await expect(page.getByRole("link", { name: "Prescribe from a patient's record" })).toHaveAttribute("href", "/patients");
});

test("treatment protocols link phases to library exercises", async ({ page }) => {
  await page.goto("/");
  const nav = page.locator("aside nav");
  await nav.locator('a[href="/protocols"]').click();
  await expect(page.getByRole("heading", { level: 2, name: "Treatment protocols" })).toBeVisible();
  await expect(page.getByText(/Draft · awaiting clinical review/)).toBeVisible();

  await page.getByRole("link", { name: "Open protocol: Patellofemoral pain" }).click();
  await expect(page).toHaveURL(/\/protocols\/pfp$/);
  await expect(page.getByRole("heading", { level: 1, name: "Patellofemoral pain" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Settle symptoms and start loading" })).toBeVisible();
  await expect(page.getByText("Move to the next phase when").first()).toBeVisible();
  await expect(page.getByText(/Willy RW, et al\./)).toBeVisible();
  // Home programs are built only in the live clinic workspace, never in the demo.
  await expect(page.getByText(/not available in the demo/).first()).toBeVisible();
  await expect(page.getByRole("link", { name: "Start a home program from this phase" })).toHaveCount(0);

  await page.getByRole("link", { name: /Quad Sets/ }).first().click();
  await expect(page).toHaveURL(/\/exercise-library\/ex_quad_sets$/);
  await expect(page.getByRole("link", { name: "Patellofemoral pain" })).toHaveAttribute("href", "/protocols/pfp");
});
