import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { KnowledgeReviewDetail } from "@/components/knowledge-review-detail";
import { KnowledgeConflictReview } from "@/components/knowledge-diff";
import type { SourceSubmission } from "@/lib/knowledge/submissions";
import type { SessionUser } from "@/lib/auth";

vi.mock("next/navigation", () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }));
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });
const user = { userId: "reviewer", clientId: "client-1", role: "client", email: "reviewer@example.com" } as SessionUser;
const submission: SourceSubmission = {
  id: "submission-1", client_id: "client-1", target_source_id: "source-1", source_type: "text", action: "upsert", status: "pending", current_revision: 3,
  submitted_by: "author-1", reviewed_by: null, reviewed_revision: null, reviewed_at: null, review_note: null, staged_edit_version: null, extraction_error: null,
  title: "Menu", description: "Latest menu", outlet_name: null, content: "Vegetarian pasta is available.", content_sha256: "hash", source_url: null,
  metadata: { filename: "menu.docx", parser: "mammoth" }, created_at: new Date(), updated_at: new Date(),
};

describe("knowledge document review UI", () => {
  it("retains pending source visibility and explains who can approve", () => {
    render(<KnowledgeReviewDetail review={{ kind: "submission", item: submission }} source={null} user={user} canApprove={false}/>);
    expect(screen.getByText("Pending review")).toBeTruthy();
    expect(screen.getByText("Vegetarian pasta is available.")).toBeTruthy();
    expect(screen.getByText("Waiting for an authorized business reviewer.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Approve revision" })).toBeNull();
  });

  it("submits the displayed revision and shows a stale-review error inline", async () => {
    const fetch = vi.fn(async () => new Response(JSON.stringify({ error: "Source changed; reload the current revision." }), { status: 409 }));
    vi.stubGlobal("fetch", fetch);
    render(<KnowledgeReviewDetail review={{ kind: "submission", item: submission }} source={null} user={user} canApprove/>);
    fireEvent.change(screen.getByRole("textbox", { name: "Review note" }), { target: { value: "Verified against the current menu." } });
    fireEvent.click(screen.getByRole("button", { name: "Approve revision" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("Source changed"));
    const payload = (fetch.mock.calls[0] as unknown as [string, { body: FormData }])[1].body;
    expect(payload.get("submissionId")).toBe("submission-1");
    expect(payload.get("revision")).toBe("3");
    expect(payload.get("action")).toBe("approve");
    expect(screen.getByRole("button", { name: "Approve revision" }).hasAttribute("disabled")).toBe(false);
  });

  it("opens the recorded conflict as a cited comparison without selecting a winner", () => {
    const { container } = render(<KnowledgeConflictReview metadata={{ reviewStatus: "policy_conflict_withheld", conflictingClaims: [
      { cutoff: "17:30", sourceUrl: "https://example.com/restaurant" }, { cutoff: "18:00", sourceUrl: "https://example.com/booking" },
    ] }}/>);
    expect(screen.getByRole("heading", { name: "What needs review" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "https://example.com/restaurant" }).getAttribute("href")).toBe("https://example.com/restaurant");
    expect(screen.getByLabelText("Conflicting statements comparison").textContent).toContain("17:30");
    expect(screen.getByLabelText("Conflicting statements comparison").textContent).toContain("18:00");
    expect(screen.getByText(/Neither version has been confirmed/)).toBeTruthy();
    expect(container.querySelector("script")).toBeNull();
  });
});
