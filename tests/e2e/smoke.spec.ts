import { expect, test, type Page } from "@playwright/test";

const operatorLogin = {
  email: "operator@pronto.sg",
  password: "pronto-operator",
};

const clientLogin = {
  email: "owner@northbridgenasi.sg",
  password: "pronto-client",
};

test.beforeEach(async ({ page }) => {
  await page.route("**/*", (route) => {
    const url = new URL(route.request().url());
    if (url.hostname === "localhost" && url.port === "3000") {
      return route.continue();
    }
    return route.abort("blockedbyclient");
  });
});

test("login page renders", async ({ page }) => {
  await page.goto("/login");

  await expect(page.getByRole("heading", { name: "Customer service grounded in your business." })).toBeVisible();
  await expect(page.getByText("Human handoff when a question needs care")).toBeVisible();
  await expect(page.getByText("pronto-operator")).toHaveCount(0);
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
  await expect(page.getByRole("heading", { name: "Businesses" })).toBeVisible();
  await expect(page.getByText("Client portfolio")).toBeVisible();
  await expect(page.getByRole("link", { name: "North Bridge Nasi", exact: true })).toBeVisible();
});

test("operator workspace shows channel state, failures and Chope handoff setup", async ({ page }) => {
  await login(page, operatorLogin.email, operatorLogin.password);
  await page.getByRole("link", { name: "North Bridge Nasi", exact: true }).click();
  await expect(page.getByText("Channels configured")).toBeVisible();
  await expect(page.getByRole("heading", { name: "Processing and delivery attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Chope booking handoff" })).toBeVisible();
  await expect(page.getByRole("textbox", { name: "Chope outlet ID" })).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Business workspace" }).getByRole("link", { name: "Integrations" })).toBeVisible();
});

test("seeded client can render the overview dashboard", async ({ page }) => {
  await login(page, clientLogin.email, clientLogin.password);

  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Needs your reply" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Recent conversations" })).toBeVisible();
});

test("client account cannot open operator diagnostics", async ({ page }) => {
  await login(page, clientLogin.email, clientLogin.password);
  await page.goto("/operator/operations");
  await expect(page).not.toHaveURL(/\/operator\/operations/);
  await expect(page.getByRole("heading", { name: "Operations", exact: true })).toHaveCount(0);
});

test("client can follow setup to a response preview without sending a customer message", async ({ page }) => {
  await login(page, clientLogin.email, clientLogin.password);
  await page.goto("/client/assistant");
  await expect(page.getByRole("heading", { name: "Test & publish" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Before customers write in" })).toBeVisible();
  await expect(page.getByText("Nothing here is sent to a customer.")).toBeVisible();
  await expect(page.getByRole("navigation", { name: "Assistant setup" }).getByRole("link", { name: "Knowledge" })).toBeVisible();
});

test("login and dashboards avoid obvious mobile horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });

  await page.goto("/login");
  await expectNoHorizontalOverflow(page);

  await login(page, operatorLogin.email, operatorLogin.password);
  await expect(page.getByRole("heading", { name: "Businesses" })).toBeVisible();
  await expectNoHorizontalOverflow(page);

  await page.getByRole("button", { name: "Log out" }).click();
  await expect(page).toHaveURL(/\/login$/);

  await login(page, clientLogin.email, clientLogin.password);
  await expect(page.getByRole("heading", { name: "Overview" })).toBeVisible();
  await expectNoHorizontalOverflow(page);
});

test("operator can navigate the five work areas and find a business", async ({ page }) => {
  await login(page, operatorLogin.email, operatorLogin.password);
  await page.getByRole("textbox", { name: "Search businesses" }).fill("North Bridge");
  await page.getByRole("button", { name: "Search", exact: true }).click();
  await expect(page.getByRole("link", { name: "North Bridge Nasi", exact: true })).toBeVisible();
  await page.getByRole("link", { name: "Create client" }).first().click();
  await expect(page.getByRole("heading", { name: "Create client" })).toBeVisible();
  await expect(page.getByText("New businesses begin in draft.")).toBeVisible();
  for (const [route, heading] of [
    ["/operator/overview", "Overview"], ["/operator/conversations", "Inbox"],
    ["/operator/knowledge-connections", "Knowledge & Connections"],
    ["/operator/operations", "Operations"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
  }
});

test("operator areas retain keyboard entry and mobile width", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, operatorLogin.email, operatorLogin.password);
  for (const route of ["/operator/overview", "/operator", "/operator/conversations",
    "/operator/knowledge-connections", "/operator/operations"]) {
    await page.goto(route);
    await expectNoHorizontalOverflow(page);
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  }
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
