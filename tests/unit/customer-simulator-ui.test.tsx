import { beforeEach, describe, expect, it, vi } from "vitest";
import { render, screen, waitFor, cleanup } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { CustomerSimulator } from "@/components/customer-simulator";

const id="00000000-0000-4000-8000-000000000001";
const state = { now: "2026-10-25T05:00:00Z", sessions: [{ id, conversation_id: id, ai_mode: "mock", created_at: "2026-10-25T04:00:00Z" }],
  realAi: { available: false, detail: "Real AI is unavailable. Configure OPENAI_API_KEY securely on the server." },
  session: null as null | { id: string; conversation_id: string; ai_mode: string; status: string }, messages: [] as unknown[], job: null as unknown, providerError:false };
const response = (value: unknown, status=200) => Promise.resolve(new Response(JSON.stringify(value), { status,headers:{"Content-Type":"application/json"} }));
beforeEach(() => { cleanup(); HTMLElement.prototype.scrollIntoView=vi.fn(); });

describe("customer simulator states", () => {
  it("shows missing real configuration and never selects mock implicitly", async () => {
    const fetcher=vi.fn((url: string, options?: RequestInit) => options?.method==="POST"
      ? response({error:"Configure OPENAI_API_KEY securely on the server."},503) : response(state));
    vi.stubGlobal("fetch",fetcher); render(<CustomerSimulator/>);
    await screen.findByText("Real AI unavailable");
    expect((screen.getByLabelText("AI mode") as HTMLSelectElement).value).toBe("real");
    await userEvent.click(screen.getByRole("button",{name:"New conversation"}));
    await screen.findByRole("alert");
    expect(JSON.parse(String(fetcher.mock.calls.find(call=>call[1]?.method==="POST")?.[1]?.body))).toMatchObject({mode:"real"});
  });
  it("keeps an unsuccessful send retry bound to the same idempotency key", async () => {
    const sent: Record<string,unknown>[]=[];
    vi.stubGlobal("fetch",vi.fn((url: string, options?:RequestInit) => {
      if(options?.method==="POST") {
        const body=JSON.parse(String(options.body)); sent.push(body);
        return sent.length===1 ? Promise.reject(new Error("Network interrupted")) : response({jobId:id},202);
      }
      return response(url.includes("sessionId") ? {...state,session:{id,conversation_id:id,ai_mode:"mock",status:"active"}} : state);
    }));
    render(<CustomerSimulator/>); await userEvent.click(await screen.findByRole("button",{name:/Conversation 1/}));
    const input=await screen.findByLabelText("Message PS.Cafe demo");
    await waitFor(()=>expect((input as HTMLTextAreaElement).disabled).toBe(false));
    await userEvent.type(input,"What time do you close?"); await userEvent.click(screen.getByRole("button",{name:"Send message"}));
    await screen.findByText("Network interrupted"); await userEvent.click(screen.getByRole("button",{name:/^Retry$/}));
    await waitFor(()=>expect(sent).toHaveLength(2)); expect(sent[1].requestId).toBe(sent[0].requestId);
  });
  it("renders delivered replies, booking links, a slow queue and explicit human ownership", async () => {
    const snapshot={...state,session:{id,conversation_id:id,ai_mode:"mock",status:"escalated"},
      job:{status:"processing",created_at:"2026-10-25T04:00:00Z"},messages:[
        {id:"customer",body:"Can I book?",sender:"customer",created_at:state.now,generation_mode:null},
        {id:"business",body:"Please check https://www.chope.co/singapore-restaurants/restaurant/ps-cafe-raffles-city",sender:"business",created_at:state.now,generation_mode:"mock"}]};
    vi.stubGlobal("fetch",vi.fn((url:string)=>response(url.includes("sessionId")?snapshot:state)));
    render(<CustomerSimulator/>); await userEvent.click(await screen.findByRole("button",{name:/Conversation 1/}));
    await screen.findByText(/A person is handling this conversation/);
    expect(screen.getByText(/Processing is taking longer/)).toBeTruthy();
    expect(screen.getByRole("link",{name:/https:\/\/www.chope.co/}).getAttribute("rel")).toContain("noopener");
    expect(screen.getByText(/mock response/)).toBeTruthy();
  });
  it("disables the old composer while creating another conversation and sends only to the new session", async () => {
    const nextId="00000000-0000-4000-8000-000000000002";
    let finishCreate!: (response: Response) => void;
    const sent: Record<string,unknown>[]=[];
    vi.stubGlobal("fetch",vi.fn((url:string, options?:RequestInit) => {
      if(options?.method==="POST") {
        const body=JSON.parse(String(options.body));
        if(body.action==="create") return new Promise<Response>(resolve=>{finishCreate=resolve;});
        sent.push(body); return response({jobId:nextId},202);
      }
      const selected=url.includes(nextId)?nextId:id;
      return response(url.includes("sessionId")?{...state,session:{id:selected,conversation_id:selected,ai_mode:"mock",status:"active"}}:state);
    }));
    render(<CustomerSimulator/>); await userEvent.click(await screen.findByRole("button",{name:/Conversation 1/}));
    const input=screen.getByLabelText("Message PS.Cafe demo") as HTMLTextAreaElement;
    await waitFor(()=>expect(input.disabled).toBe(false));
    await userEvent.click(screen.getByRole("button",{name:"New conversation"}));
    expect(input.disabled).toBe(true);
    finishCreate(new Response(JSON.stringify({id:nextId}),{status:201}));
    await waitFor(()=>expect(input.disabled).toBe(false));
    await userEvent.type(input,"A new enquiry"); await userEvent.click(screen.getByRole("button",{name:"Send message"}));
    await waitFor(()=>expect(sent).toHaveLength(1)); expect(sent[0].sessionId).toBe(nextId);
  });
  it("shows a delivery failure instead of presenting a saved but undelivered answer", async () => {
    const snapshot={...state,session:{id,conversation_id:id,ai_mode:"mock",status:"active"},
      job:{status:"completed",created_at:state.now,delivery_status:"failed"}};
    vi.stubGlobal("fetch",vi.fn((url:string)=>response(url.includes("sessionId")?snapshot:state)));
    render(<CustomerSimulator/>); await userEvent.click(await screen.findByRole("button",{name:/Conversation 1/}));
    await screen.findByText(/reply has not been delivered/);
    expect(screen.queryByText(/Pronto assistant/)).toBeNull();
  });
});
