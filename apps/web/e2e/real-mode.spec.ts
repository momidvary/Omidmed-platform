import { expect, test, type Page } from "@playwright/test";

interface Credentials {
  email: string;
  password: string;
}

function credentials(role: "OWNER" | "THERAPIST" | "STAFF" | "PATIENT"):
  | Credentials
  | null {
  const email = process.env[`REAL_E2E_${role}_EMAIL`];
  const password = process.env[`REAL_E2E_${role}_PASSWORD`];
  return email && password ? { email, password } : null;
}

async function clinicianLogin(page: Page, account: Credentials) {
  await page.goto("/");
  await page.getByLabel("Email").fill(account.email);
  await page.getByLabel("Password").fill(account.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(page.getByText("Quick Clinical Tools", { exact: true })).toBeVisible();
}

test("notification drain exists, is configured and rejects public callers", async ({
  request,
}) => {
  const response = await request.get("/api/internal/notifications/drain");
  expect(response.status()).toBe(401);
  expect(await response.json()).toEqual({ error: "unauthorized" });
});

test("owner reaches the real patient registry through Supabase Auth/RLS", async ({
  page,
}) => {
  const account = credentials("OWNER");
  test.skip(!account, "REAL_E2E_OWNER_EMAIL/PASSWORD are not configured");
  await clinicianLogin(page, account!);
  await page.goto("/patients");
  await expect(
    page.getByRole("heading", { name: "Patient Registry", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Demo registry is empty", { exact: true })).toHaveCount(0);
  await expect(page.getByText("Clinical access required", { exact: true })).toHaveCount(0);
  await page.goto("/clinical-records");
  await expect(
    page.getByRole("heading", { name: "Clinical Records", exact: true })
  ).toBeVisible();
});

test("clinic staff is blocked before the registry sends a patient query", async ({
  page,
}) => {
  const account = credentials("STAFF");
  test.skip(!account, "REAL_E2E_STAFF_EMAIL/PASSWORD are not configured");
  const clinicalRequests: string[] = [];
  page.on("request", (request) => {
    if (
      ["/rest/v1/patients", "/rest/v1/tickets", "/rest/v1/clinical_alerts"].some(
        (path) => request.url().includes(path)
      )
    ) {
      clinicalRequests.push(request.url());
    }
  });
  await clinicianLogin(page, account!);
  await page.goto("/patients");
  await expect(
    page.getByText("Clinical access required", { exact: true })
  ).toBeVisible();
  expect(clinicalRequests).toEqual([]);
  await page.goto("/clinical-records");
  await expect(
    page.getByText("Clinical access required", { exact: true })
  ).toBeVisible();
  expect(clinicalRequests).toEqual([]);

  await page.goto("/tickets");
  await expect(
    page.getByText("Clinical access required", { exact: true })
  ).toBeVisible();
  expect(clinicalRequests).toEqual([]);

  await page.goto("/alerts");
  await expect(
    page.getByText("Clinical alert access required", { exact: true })
  ).toBeVisible();
  expect(clinicalRequests).toEqual([]);
});

test("assigned therapist can open the real registry without owner controls", async ({
  page,
}) => {
  const account = credentials("THERAPIST");
  test.skip(!account, "REAL_E2E_THERAPIST_EMAIL/PASSWORD are not configured");
  await clinicianLogin(page, account!);
  await page.goto("/patients");
  await expect(
    page.getByRole("heading", { name: "Patient Registry", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Clinical access required", { exact: true })).toHaveCount(0);
  await page.goto("/clinical-records");
  await expect(
    page.getByRole("heading", { name: "Clinical Records", exact: true })
  ).toBeVisible();
  await expect(page.getByText("Clinical access required", { exact: true })).toHaveCount(0);
});

test("linked patient enters only the patient portal and is refused clinician UI", async ({
  page,
}) => {
  const account = credentials("PATIENT");
  test.skip(!account, "REAL_E2E_PATIENT_EMAIL/PASSWORD are not configured");
  await page.goto("/patient");
  await page.getByLabel("ایمیل").fill(account!.email);
  await page.getByLabel("رمز عبور").fill(account!.password);
  await page.getByRole("button", { name: "ورود به پرتال", exact: true }).click();
  await expect(page.getByText("حساب شما هنوز به پرونده‌ای متصل نشده است")).toHaveCount(0);
  await expect(page.getByText("پرتال بیمار", { exact: true }).first()).toBeVisible();

  await page.goto("/");
  await expect(
    page.getByText("This account is a patient account.", { exact: false })
  ).toBeVisible();
});

test("logout and account switch clear owner access before staff navigation", async ({
  page,
}) => {
  const owner = credentials("OWNER");
  const staff = credentials("STAFF");
  test.skip(
    !owner || !staff,
    "REAL_E2E_OWNER and REAL_E2E_STAFF credentials are not configured"
  );

  await clinicianLogin(page, owner!);
  await page.goto("/patients");
  await expect(
    page.getByRole("heading", { name: "Patient Registry", exact: true })
  ).toBeVisible();

  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true })
  ).toBeVisible();

  const patientRequests: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/rest/v1/patients")) {
      patientRequests.push(request.url());
    }
  });

  await page.getByLabel("Email").fill(staff!.email);
  await page.getByLabel("Password").fill(staff!.password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByText("Quick Clinical Tools", { exact: true })
  ).toBeVisible();

  await page.goto("/patients");
  await expect(
    page.getByText("Clinical access required", { exact: true })
  ).toBeVisible();
  expect(patientRequests).toEqual([]);
});
