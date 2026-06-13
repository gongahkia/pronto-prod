import { expect, test, type Page } from "@playwright/test";

const operatorLogin = {
  email: "operator@pronto.sg",
  password: "pronto-operator",
};

const clientLogin = {
  email: "owner@northbridgenasi.sg",
  password: "pronto-client",
};

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Pronto MVP" })).toBeVisible();
  await expect(page.getByLabel("Email")).toBeVisible();
  await expect(page.getByLabel("Password")).toBeVisible();
});

test("protected pages redirect and protected APIs reject anonymous access", async ({
  page,
  request,
}) => {
  await page.goto("/operator");
  await expect(page).toHaveURL(/\/login$/);

  const response = await request.get("/api/client/settings");
  expect(response.status()).toBe(401);
  await expect(response.json()).resolves.toEqual({ error: "Unauthenticated." });
});

test("seeded operator can render the client portfolio", async ({ page }) => {
  await login(page, operatorLogin.email, operatorLogin.password);

  await expect(page).toHaveURL(/\/operator$/);
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expect(page.getByText("Client portfolio")).toBeVisible();
  await expect(page.getByRole("link", { name: "North Bridge Nasi" })).toBeVisible();
});

test("seeded client can render the overview dashboard", async ({ page }) => {
  await login(page, clientLogin.email, clientLogin.password);

  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByText("Needs your attention")).toBeVisible();
  await expect(page.getByText("Recent conversations")).toBeVisible();
});

test("login and dashboards avoid obvious mobile horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/login");
  await expectNoHorizontalOverflow(page);

  await login(page, operatorLogin.email, operatorLogin.password);
  await expect(page.getByRole("heading", { name: "Clients" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, clientLogin.email, clientLogin.password);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

async function login(page: Page, email: string, password: string) {
  await page.goto("/login");
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password").fill(password);
  await page.getByRole("button", { name: "Sign in" }).click();
}

async function expectNoHorizontalOverflow(page: Page) {
  const overflow = await page.evaluate(() => {
    const root = document.documentElement;
    return root.scrollWidth - root.clientWidth;
  });
  expect(overflow).toBeLessThanOrEqual(16);
}
