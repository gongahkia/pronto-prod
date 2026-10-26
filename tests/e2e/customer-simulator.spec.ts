import { test, expect, type Page } from "@playwright/test";
import { spawn, type ChildProcess } from "node:child_process";
import { getPool } from "../../src/lib/db";
import { setupPsCafeDemo, PS_CAFE_DEMO_CLIENT_ID } from "../../scripts/demo/ps-cafe-raffles-city";
import { setupCustomerSimulator } from "../../src/lib/customer-demo-setup";

// The existing local-mail browser profile runs Next in development mode. The
// simulator intentionally remains unavailable in a production server.
const enabled=process.env.PRONTO_TEST_LOCAL_MAIL==="1" && process.env.PRONTO_CUSTOMER_DEMO_ENABLED==="1";
test.skip(!enabled,"Requires the opt-in, marked local customer-demo environment.");
let worker: ChildProcess | undefined;
test.beforeAll(async()=>{
  if(!enabled)return;
  await setupPsCafeDemo(); await setupCustomerSimulator();
  worker=spawn("pnpm",["demo:customer:worker"],{cwd:process.cwd(),detached:true,stdio:"ignore",
    env:{...process.env,PRONTO_WORKER_OUTBOX_INTERVAL_MS:"1000"}});
});
test.afterAll(async()=>{
  if(worker?.pid && worker.exitCode===null){
    const pid=worker.pid;
    const exited=new Promise<void>(resolve=>worker!.once("exit",()=>resolve()));
    process.kill(-pid,"SIGINT");
    await Promise.race([exited,new Promise<void>(resolve=>setTimeout(resolve,5000))]);
    if(worker.exitCode===null)process.kill(-pid,"SIGTERM");
  }
});
test.beforeEach(async({page})=>{
  const expected=new URL(process.env.PLAYWRIGHT_BASE_URL??"http://localhost:3000").origin;
  await page.context().route("**/*",route=>new URL(route.request().url()).origin===expected?route.continue():route.abort());
});
async function login(page:Page){
  await page.goto("/login");
  await page.getByLabel("Email",{exact:true}).fill("responder@ps-cafe-demo.test");
  await page.getByLabel("Password",{exact:true}).fill("pronto-ps-demo");
  await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/client$/);
}

test("real AI mode shows missing credentials and creates no mock session",async({page})=>{
  await login(page); await page.goto("/demo/customer");
  await expect(page.getByText("Real AI unavailable",{exact:true})).toBeVisible();
  await expect(page.getByLabel("AI mode")).toHaveValue("gemini-flash");
  const response=page.waitForResponse(response=>response.url().endsWith("/api/demo/customer") && response.request().method()==="POST");
  await page.getByRole("button",{name:"New conversation",exact:true}).click();
  expect((await response).status()).toBe(503);
  await expect(page.getByRole("alert").filter({hasText:"GEMINI_API_KEY"})).toBeVisible();
  await expect(page.getByLabel("Message PS.Cafe demo")).toBeDisabled();
});

test("model choices are explicit, server allowlisted and do not rewrite an existing Mock conversation",async({page})=>{
  await login(page);await page.goto("/demo/customer");
  const mode=page.getByLabel("AI mode");
  for(const choice of ["gemini-flash","groq-oss","gemini-lite"]){
    await mode.selectOption(choice);
    const pending=page.waitForResponse(r=>r.url().endsWith("/api/demo/customer")&&r.request().method()==="POST");
    await page.getByRole("button",{name:"New conversation",exact:true}).click();expect((await pending).status()).toBe(503);
    await expect(page.getByLabel("Message PS.Cafe demo")).toBeDisabled();
  }
  expect((await page.request.post("/api/demo/customer",{headers:{origin:new URL(page.url()).origin},
    data:{action:"create",mode:"real",choice:"arbitrary-paid-model"}})).status()).toBe(400);
  await mode.selectOption("mock");await page.getByRole("button",{name:"New conversation",exact:true}).click();
  await expect(page.getByLabel("Message PS.Cafe demo")).toBeEnabled();
  const before=await(await page.request.get("/api/demo/customer")).json();
  await mode.selectOption("groq-oss");await page.getByRole("button",{name:"Refresh status",exact:true}).click();
  await expect(page.getByText("Mock AI — deterministic test responses",{exact:false})).toBeVisible();
  const after=await(await page.request.get("/api/demo/customer")).json();
  expect(after.sessions[0]).toMatchObject({id:before.sessions[0].id,ai_mode:"mock",ai_selection:"mock"});
});

test("customer and owner share a durable conversation, independent triage, takeover, reply and release",async({page})=>{
  test.setTimeout(90_000);
  await login(page); await page.goto("/demo/customer");
  await page.getByLabel("AI mode").selectOption("mock");
  await page.getByRole("button",{name:"New conversation",exact:true}).click();
  const input=page.getByLabel("Message PS.Cafe demo"); await expect(input).toBeEnabled();
  await input.fill("What time do you close today?"); await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByLabel("Message history")).toContainText("10:00pm",{timeout:25000});
  await expect(page.getByText(/mock response/)).toBeVisible();
  const state=await(await page.request.get("/api/demo/customer")).json();
  const conversationId=state.sessions[0].conversation_id;
  const owner=await page.context().newPage(); await owner.goto("/demo/customer");
  await owner.getByRole("link", { name: "Open business inbox", exact: true }).click();
  await expect(owner).toHaveURL(/\/client\/inbox$/);
  await expect(owner.getByRole("heading", { name: "Inbox", exact: true })).toBeVisible();
  await expect(owner.getByTestId("workspace-loading")).toHaveCount(0);
  await owner.locator(`a[href="/client/conversations/${conversationId}"]`).click();
  await expect(owner).toHaveURL(new RegExp(`/client/conversations/${conversationId}$`));
  await expect(owner.getByText("AI responds: yes",{exact:true})).toBeVisible();
  await owner.getByLabel("Conversation urgency").selectOption("short_term");
  await owner.getByLabel("Owner action required").selectOption("true");
  await owner.getByRole("button",{name:"Save classification",exact:true}).click();
  await expect(owner.getByText("Owner action: required",{exact:true})).toBeVisible();
  await expect(owner.getByText("AI responds: yes",{exact:true})).toBeVisible();
  await owner.getByRole("button",{name:"Take over and pause AI",exact:true}).click();
  await expect(owner.getByText("AI responds: no",{exact:true})).toBeVisible();
  await page.bringToFront(); await page.getByRole("button",{name:"Refresh status",exact:true}).click();
  await expect(page.getByText(/A person is handling this conversation/)).toBeVisible();
  await input.fill("Please have a team member reply."); await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect.poll(async()=>{
    const jobs=await getPool().query("select status from inbound_jobs where client_id=$1 and conversation_id=$2 order by sequence desc limit 1",[PS_CAFE_DEMO_CLIENT_ID,conversationId]);
    return jobs.rows[0]?.status;
  }).toBe("skipped");
  await expect(page.getByText(/mock response/)).toHaveCount(1);
  await owner.bringToFront(); await owner.reload();
  await owner.getByPlaceholder("Write the reply the customer will receive").fill("Our team will help with your request.");
  await owner.getByRole("button",{name:"Send reply and resolve",exact:true}).click();
  await expect(owner.getByRole("button",{name:"Release conversation to AI",exact:true})).toBeVisible();
  await page.bringToFront(); await page.getByRole("button",{name:"Refresh status",exact:true}).click();
  await expect(page.getByLabel("Message history")).toContainText("Our team will help with your request.");
  await expect(input).toBeDisabled();
  await owner.bringToFront(); await owner.getByRole("button",{name:"Release conversation to AI",exact:true}).click();
  await page.bringToFront(); await page.getByRole("button",{name:"Refresh status",exact:true}).click();
  await expect(input).toBeEnabled();
  await input.fill("What time do you close tomorrow?"); await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByText(/mock response/)).toHaveCount(2,{timeout:25000});
  const created=page.waitForResponse(response=>response.url().endsWith("/api/demo/customer") && response.request().method()==="POST");
  await page.getByRole("button",{name:"New conversation",exact:true}).click();
  expect((await created).status()).toBe(201); await expect(input).toBeEnabled();
  await input.fill("My order has a missing item and I want a refund."); await page.getByRole("button",{name:"Send message",exact:true}).click();
  await expect(page.getByText(/A person is handling this conversation/)).toBeVisible({timeout:25000});
  await expect(page.getByLabel("Message history")).not.toContainText("10:00pm");
  await owner.close();
});

test("anonymous and another tenant cannot inject or inspect demo sessions",async({page})=>{
  const anonymous=await page.request.get("/api/demo/customer"); expect(anonymous.status()).toBe(401);
  await page.goto("/login"); await page.getByLabel("Email",{exact:true}).fill("owner@northbridgenasi.sg");
  await page.getByLabel("Password",{exact:true}).fill("pronto-client"); await page.getByRole("button",{name:"Sign in",exact:true}).click();
  await expect(page).toHaveURL(/\/client$/);
  expect((await page.request.get("/api/demo/customer")).status()).toBe(403);
  const response=await page.request.post("/api/demo/customer",{headers:{origin:new URL(page.url()).origin},data:{action:"create",mode:"mock"}});
  expect(response.status()).toBe(403);
});
