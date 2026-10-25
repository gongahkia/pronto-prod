import { beforeEach, describe, expect, it, vi } from "vitest";
const mocks=vi.hoisted(()=>({getSessionUser:vi.fn(),hasStaffCapability:vi.fn(),updateConversationAction:vi.fn()}));
vi.mock("@/lib/auth",()=>({getSessionUser:mocks.getSessionUser}));
vi.mock("@/lib/staff-permissions",()=>({hasStaffCapability:mocks.hasStaffCapability}));
vi.mock("@/lib/conversation-actions",()=>({updateConversationAction:mocks.updateConversationAction}));
import { POST } from "@/app/api/client/conversations/[conversationId]/route";
import { DemoError } from "@/lib/customer-demo-boundary";

const id="00000000-0000-4000-8000-000000000001";
const actor={userId:"staff",role:"client",clientId:"own-tenant"};
const context={params:Promise.resolve({conversationId:id})};
function request(fields:Record<string,string>={action:"takeover"},origin="http://localhost:3000"){
  return new Request(`http://localhost:3000/api/client/conversations/${id}`,{method:"POST",
    headers:{origin,host:"localhost:3000","content-type":"application/x-www-form-urlencoded"},body:new URLSearchParams(fields)});
}
beforeEach(()=>{vi.resetAllMocks();mocks.getSessionUser.mockResolvedValue(actor);mocks.hasStaffCapability.mockResolvedValue(true);});
describe("business conversation action authorization",()=>{
  it("rejects unauthenticated, cross-origin, operator and unprivileged mutations",async()=>{
    mocks.getSessionUser.mockResolvedValue(null);expect((await POST(request(),context)).status).toBe(401);
    expect((await POST(request({},"https://untrusted.example"),context)).status).toBe(403);
    mocks.getSessionUser.mockResolvedValue({...actor,role:"operator"});expect((await POST(request(),context)).status).toBe(403);
    mocks.getSessionUser.mockResolvedValue(actor);mocks.hasStaffCapability.mockResolvedValue(false);
    expect((await POST(request(),context)).status).toBe(403);expect(mocks.updateConversationAction).not.toHaveBeenCalled();
  });
  it("binds classification to the authenticated tenant and uses a fixed redirect",async()=>{
    const result=await POST(request({action:"classify",urgency:"short_term",ownerActionRequired:"true",clientId:"foreign-tenant",returnTo:"https://untrusted.example"}),context);
    expect(result.status).toBe(303);expect(result.headers.get("location")).toBe(`http://localhost:3000/client/conversations/${id}`);
    expect(mocks.updateConversationAction).toHaveBeenCalledWith({actor,clientId:"own-tenant",conversationId:id,action:"classify",urgency:"short_term",ownerActionRequired:true});
    expect((await POST(request({action:"classify",urgency:"invented"}),context)).status).toBe(400);
  });
  it("preserves a tenant-scoped not-found result and sanitizes internal failures",async()=>{
    mocks.updateConversationAction.mockRejectedValueOnce(new DemoError("Conversation not found.",404));
    expect((await POST(request(),context)).status).toBe(404);
    mocks.updateConversationAction.mockRejectedValueOnce(new Error("private database details"));
    const result=await POST(request(),context);expect(result.status).toBe(409);
    expect(JSON.stringify(await result.json())).not.toContain("private database");
  });
});
