import { randomUUID } from "node:crypto";
import { expect, test, type Page } from "@playwright/test";
import { getPool } from "../../src/lib/db";
import { PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID,
  setupPsCafeDemo } from "../../scripts/demo/ps-cafe-raffles-city";

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
  await expect(page.getByRole("heading", { name: "Needs Attention" })).toBeVisible();
  await expect(page.getByRole("heading", { name: "Conversations needing a person" })).toBeVisible();
  for (const label of ["Needs Attention", "Recent Activity", "Business Knowledge", "Connected Channels"])
    await expect(page.getByRole("navigation").getByRole("link", { name: label }).first()).toBeVisible();
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
  await expect(page.getByRole("heading", { name: "Needs Attention" })).toBeVisible();
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

test("business destinations remain usable by keyboard on mobile", async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await login(page, clientLogin.email, clientLogin.password);
  for (const [route, heading] of [
    ["/client", "Needs Attention"], ["/client/activity", "Recent Activity"],
    ["/client/knowledge", "Business Knowledge"], ["/client/channels", "Connected Channels"],
  ]) {
    await page.goto(route);
    await expect(page.getByRole("heading", { name: heading, exact: true })).toBeVisible();
    await expectNoHorizontalOverflow(page);
    const skip = page.getByRole("link", { name: "Skip to main content" });
    await skip.focus();
    await expect(skip).toBeFocused();
    await page.keyboard.press("Enter");
    await expect(page).toHaveURL(/#main-content$/);
  }
});

test("PS.Cafe synthetic staff proposes knowledge and confirms a local policy command", async ({ page }) => {
  await setupPsCafeDemo();
  const suggestionTitle = `Dietary caveat demo ${Date.now()}`;
  await login(page, "responder@ps-cafe-demo.test", "pronto-ps-demo");
  await expect(page).toHaveURL(/\/client$/);
  await expect(page.getByRole("heading", { name: "Needs Attention" })).toBeVisible();
  await page.goto("/client/knowledge");
  await expect(page.getByRole("heading", { name: "Business Knowledge" })).toBeVisible();
  await page.getByRole("textbox", { name: "Title", exact: true }).fill(suggestionTitle);
  await page.getByRole("textbox", { name: "Proposed answer or policy" }).fill("Ask staff to confirm ingredients before making a dietary promise.");
  await page.getByRole("textbox", { name: "Why should this change?" }).fill("Ingredients can change.");
  await page.getByRole("button", { name: "Submit suggestion" }).click();
  await expect(page.getByText("Saved for review. Customer answers have not changed.")).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await login(page, "approver@ps-cafe-demo.test", "pronto-ps-demo");
  await page.goto("/client/knowledge");
  await expect(page.getByText(suggestionTitle)).toBeVisible();
  await page.getByRole("textbox", { name: `Review note for ${suggestionTitle}` }).fill("Synthetic business review only");
  await page.getByRole("button", { name: "Approve", exact: true }).click();
  await expect(page.getByText(suggestionTitle)).toBeVisible();
  await page.getByRole("button", { name: "Log out" }).click();
  await login(page, "policy@ps-cafe-demo.test", "pronto-ps-demo");
  await page.goto("/client/contact-pronto");
  await page.getByRole("textbox", { name: "Your request" }).fill("Change our escalation response target to 30 minutes");
  await page.getByRole("button", { name: "Send request" }).click();
  await expect(page.getByText(/Change response target from (?:unset|\d+) to 30 minutes/)).toBeVisible();
  await page.getByRole("button", { name: "Confirm change" }).click();
  await expect(page.getByText(/Response target saved/)).toBeVisible();
  await page.goto("/client/settings");
  await expect(page.getByText("Current: 30 minutes")).toBeVisible();
});

test("PS.Cafe responder claims, replies and explicitly releases a local email handoff", async ({ page }) => {
  test.skip(process.env.PRONTO_TEST_LOCAL_MAIL !== "1", "Requires opt-in loopback Mailpit transport.");
  test.setTimeout(60_000);
  await setupPsCafeDemo();
  const conversationId = randomUUID();
  const messageId = randomUUID();
  const inserted = await getPool().query<{ id: string }>(
    `with conversation as (
       insert into conversations (id, client_id, channel_id, external_thread_id, customer_handle, status)
       values ($1, $2, $3, $4, $4, 'escalated') returning id
     ), message as (
       insert into messages (id, client_id, channel_id, conversation_id, external_message_id, sender_role, body)
       values ($5, $2, $3, $1, $6, 'customer', 'Please help with my special request') returning id
     )
     insert into escalations (client_id, conversation_id, message_id, reason_code, reason_detail)
     values ($2, $1, $5, 'other', 'Synthetic local handoff') returning id`,
    [conversationId, PS_CAFE_DEMO_CLIENT_ID, PS_CAFE_DEMO_EMAIL_ID,
      `local-${conversationId}@example.test`, messageId, `local-${messageId}`]);
  const escalationId = inserted.rows[0].id;
  try {
    await login(page, "staff@ps-cafe-demo.test", "pronto-ps-demo");
    await page.goto(`/client/conversations/${conversationId}`);
    await expect(page.getByRole("heading", { name: "This Pronto view is unavailable." })).toBeVisible();
    await page.goto("/client");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, clientLogin.email, clientLogin.password);
    await page.goto(`/client/conversations/${conversationId}`);
    await expect(page.getByRole("heading", { name: "This Pronto view is unavailable." })).toBeVisible();
    await page.goto("/client");
    await page.getByRole("button", { name: "Log out" }).click();
    await login(page, "responder@ps-cafe-demo.test", "pronto-ps-demo");
    await expect(page.getByRole("heading", { name: "Needs Attention" })).toBeVisible();
    await page.locator(`a[href="/client/conversations/${conversationId}"]`).click();
    await expect(page).toHaveURL(new RegExp(`/client/conversations/${conversationId}`));
    await page.getByRole("button", { name: "Claim", exact: true }).click();
    await expect(page.getByText("claimed", { exact: true })).toBeVisible();
    await page.getByPlaceholder("Write the reply the customer will receive").fill("We can help with this request.");
    await page.getByRole("button", { name: "Send reply and resolve" }).click();
    await expect(page.getByRole("button", { name: "Release conversation to AI" })).toBeVisible();
    const outbound = await getPool().query<{ status: string }>(
      "select status from outbound_messages where client_id = $1 and escalation_id = $2",
      [PS_CAFE_DEMO_CLIENT_ID, escalationId]);
    expect(outbound.rows[0]?.status).toBe("sent");
    const captured = await fetch("http://127.0.0.1:8025/api/v1/messages");
    expect(captured.ok).toBe(true);
    const mailbox = await captured.json() as { messages: Array<{ To: Array<{ Address: string }> }> };
    expect(mailbox.messages.some((message) => message.To.some((recipient) =>
      recipient.Address === `local-${conversationId}@example.test`))).toBe(true);
    await page.getByRole("button", { name: "Release conversation to AI" }).click();
    const state = await getPool().query<{ status: string }>(
      "select status from conversations where id = $1 and client_id = $2", [conversationId, PS_CAFE_DEMO_CLIENT_ID]);
    expect(state.rows[0].status).toBe("active");
  } finally {
    await getPool().query("delete from conversations where id = $1 and client_id = $2",
      [conversationId, PS_CAFE_DEMO_CLIENT_ID]);
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
