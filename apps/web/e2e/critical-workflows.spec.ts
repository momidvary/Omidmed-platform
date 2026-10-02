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
