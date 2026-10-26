import { randomUUID } from "node:crypto";
import Link from "next/link";
import { BookOpenText, ChevronDown, FileText, Inbox, PenLine, Plus } from "lucide-react";
import type { SessionUser } from "@/lib/auth";
import type { Client } from "@/lib/types";
import { getBusinessKnowledgeSources } from "@/lib/business-portal";
import { listKnowledgeSuggestions } from "@/lib/knowledge/suggestions";
import { listSourceSubmissions } from "@/lib/knowledge/submissions";
import { describeConflictClaims, listKnowledgeReviewItems } from "@/lib/knowledge/review-items";
import { Badge } from "@/components/badge";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";

export async function KnowledgeInformationCard({ user, client, canApprove, showReviews }: {
  user: SessionUser; client: Client; canApprove: boolean; showReviews: boolean;
}) {
  const [sources, suggestions, submissions, reviewItems] = await Promise.all([
    getBusinessKnowledgeSources(client.id), listKnowledgeSuggestions(client.id),
    listSourceSubmissions(client.id), listKnowledgeReviewItems(client.id),
  ]);
  const outlet = String(client.business_profile.outletName ?? "");
  const pendingCount = suggestions.filter(item => item.status === "pending").length
    + submissions.filter(item => item.status === "pending").length + reviewItems.filter(item => item.status === "open").length;
  return <section id="knowledge" className="ui-panel scroll-mt-6 overflow-hidden" aria-labelledby="knowledge-heading">
    <div className="flex flex-wrap items-start justify-between gap-3 p-5">
      <div className="flex items-start gap-3"><BookOpenText size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true"/>
        <div><h2 id="knowledge-heading" className="text-lg font-semibold">Knowledge</h2>
          <p className="mt-1 text-sm text-muted">The facts, policies and documents behind customer answers.</p></div>
      </div><Badge>{sources.length} {sources.length === 1 ? "source" : "sources"}</Badge>
    </div>
    {sources.length ? <ul className="divide-y divide-line border-t border-line">{sources.map(source => {
      const needsReview = String(source.metadata.reviewStatus ?? "").includes("conflict");
      return <li key={source.id}><Link href={`/client/knowledge/${source.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-hover">
        <FileText size={19} className="shrink-0 text-muted" aria-hidden="true"/>
        <div className="min-w-0 flex-1"><p className="text-sm font-medium">{source.title}</p>
          <p className="mt-1 truncate text-xs text-muted">{needsReview ? "Conflicting information · withheld from answers" : String(source.metadata.sourceReference ?? source.metadata.sourceUrl ?? source.source_type)}
            {source.last_reviewed_at ? ` · Updated ${new Date(source.last_reviewed_at).toLocaleDateString("en-SG")}` : ""}</p></div>
        <Badge tone={needsReview ? "amber" : "green"}>{needsReview ? "Needs review" : "Published"}</Badge>
      </Link></li>;
    })}</ul> : <p className="px-5 pb-5 text-sm text-muted">No business information yet. Add a source to get started.</p>}
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <Plus size={17} aria-hidden="true"/>Add information<ChevronDown size={16} aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180"/>
      </summary><div className="px-5 pb-5"><p className="text-sm text-muted">Paste text, upload a PDF or share a public webpage. New information is reviewed before it goes live.</p>
      <form action="/api/client/knowledge" method="post" encType="multipart/form-data" className="mt-3 grid gap-3">
        <input type="hidden" name="requestKey" value={randomUUID()}/>
        <input name="title" aria-label="Source title" placeholder="Source title" required className="ui-input px-3 py-2"/>
        <input name="description" aria-label="Source description" placeholder="What does this source cover?" className="ui-input px-3 py-2"/>
        <input name="outletName" aria-label="Outlet" defaultValue={outlet} placeholder="Outlet, if applicable" className="ui-input px-3 py-2"/>
        <textarea name="content" aria-label="Source content" rows={4} placeholder="Paste business information here" className="ui-input px-3 py-2"/>
        <input name="sourceUrl" type="url" aria-label="Public source webpage" placeholder="https://example.com/your-page" className="ui-input px-3 py-2"/>
        <KnowledgeFileInput/><button className="ui-button w-fit px-3 py-2">Submit source draft</button></form>
      </div></details>
    <details className="group border-t border-line">
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <PenLine size={17} aria-hidden="true"/>Suggest a correction<ChevronDown size={16} aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180"/>
      </summary><div className="px-5 pb-5"><p className="mb-3 text-sm text-muted">Propose a new fact or update. Customer answers change after review and publication.</p>
      <form action="/api/client/knowledge-suggestions" method="post" className="grid gap-3">
        <input type="hidden" name="requestKey" value={randomUUID()}/>
        <label className="text-sm">Existing information, if applicable<select name="sourceId" className="ui-input mt-1 block w-full px-3 py-2">
          <option value="">New fact or policy</option>{sources.map((source) => <option key={source.id} value={source.id}>{source.title}</option>)}
        </select></label>
        <label className="text-sm">Title<input name="title" required maxLength={200} className="ui-input mt-1 block w-full px-3 py-2"/></label>
        <label className="text-sm">Proposed answer or policy<textarea name="content" required maxLength={8000} rows={4} className="ui-input mt-1 block w-full px-3 py-2"/></label>
        <label className="text-sm">Why should this change?<textarea name="reason" required maxLength={1000} rows={2} className="ui-input mt-1 block w-full px-3 py-2"/></label>
        <div className="grid gap-3 sm:grid-cols-2"><label className="text-sm">Supporting source (optional)
          <input name="sourceReference" maxLength={500} className="ui-input mt-1 block w-full px-3 py-2"/></label>
          <label className="text-sm">Outlet (optional)<input name="outletName" defaultValue={outlet}
            maxLength={200} className="ui-input mt-1 block w-full px-3 py-2"/></label></div>
        <button className="ui-primary-button w-fit px-4 py-2">Submit suggestion</button>
      </form>
      </div></details>
    <details className="group border-t border-line" open={showReviews}>
      <summary className="flex cursor-pointer list-none items-center gap-2 px-5 py-4 text-sm font-medium [&::-webkit-details-marker]:hidden">
        <Inbox size={17} aria-hidden="true"/>Changes and reviews
        {pendingCount > 0 && <Badge tone="amber">{pendingCount} to review</Badge>}
        <ChevronDown size={16} aria-hidden="true" className="ml-auto transition-transform group-open:rotate-180"/>
      </summary>
    <section className="border-t border-line"><div className="px-5 pt-5 pb-2"><h3 className="font-semibold">Suggested changes</h3></div>
      {suggestions.length === 0 ? <p className="p-4 text-sm text-muted">No suggestions yet.</p>
        : <ul className="divide-y divide-line">{suggestions.map((item) => <li key={item.id} className="p-4">
          <div className="flex flex-wrap items-center justify-between gap-2"><h3 className="font-medium">{item.title}</h3>
            <Badge tone={item.status === "published" ? "green" : item.status === "rejected" ? "red" : "amber"}>
              {item.status.replace(/_/g, " ")}</Badge></div>
          <p className="mt-1 text-xs text-muted">Revision {item.current_revision} · suggested by {item.author_name ?? "former staff member"}
            {item.outlet_name ? ` · ${item.outlet_name}` : ""}</p>
          <details className="mt-2 text-sm"><summary className="cursor-pointer font-medium">Review proposed information</summary>
            <p className="mt-2 whitespace-pre-wrap">{item.content}</p><p className="mt-2">Reason: {item.reason}</p>
            <p className="mt-1 text-muted">Source: {item.source_reference ?? "Not supplied; verify before approval"}</p>
            {item.review_note ? <p className="mt-2">Review: {item.review_note} · {item.reviewer_name ?? "Business approver"}</p> : null}
          </details>
          {item.status === "pending" && canApprove ? <form action="/api/client/knowledge-suggestions" method="post" className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="suggestionId" value={item.id}/><input type="hidden" name="revision" value={item.current_revision}/>
            <input name="note" required maxLength={1000} aria-label={`Review note for ${item.title}`}
              placeholder="Approval or review note" className="ui-input min-w-52 flex-1 px-3 py-2"/>
            <button name="action" value="approve" className="ui-primary-button px-3 py-2">Approve</button>
            <button name="action" value="request_revision" className="ui-button px-3 py-2">Request revision</button>
            <button name="action" value="reject" className="ui-button px-3 py-2">Reject</button>
          </form> : null}
          {(item.status === "revision_requested" || item.status === "rejected") && item.created_by === user.userId ?
            <details className="mt-3"><summary className="cursor-pointer text-sm font-medium text-accent">Revise suggestion</summary>
              <form action="/api/client/knowledge-suggestions" method="post" className="mt-2 grid gap-2">
                <input type="hidden" name="action" value="revise"/><input type="hidden" name="suggestionId" value={item.id}/>
                <input type="hidden" name="revision" value={item.current_revision}/>
                <input name="title" required defaultValue={item.title} aria-label="Revised title" className="ui-input px-3 py-2"/>
                <textarea name="content" required defaultValue={item.content} aria-label="Revised answer" rows={4} className="ui-input px-3 py-2"/>
                <textarea name="reason" required defaultValue={item.reason} aria-label="Revised reason" rows={2} className="ui-input px-3 py-2"/>
                <input name="sourceReference" defaultValue={item.source_reference ?? ""} aria-label="Revised source" className="ui-input px-3 py-2"/>
                <input name="outletName" defaultValue={item.outlet_name ?? ""} aria-label="Revised outlet" className="ui-input px-3 py-2"/>
                <button className="ui-button w-fit px-3 py-2">Submit new revision</button>
              </form></details> : null}
        </li>)}</ul>}
    </section>
    <section className="border-t border-line"><div className="px-5 pt-5 pb-2"><h3 className="font-semibold">Submitted sources</h3></div>
      {submissions.length === 0 ? <p className="p-4 text-sm text-muted">No sources awaiting review.</p>
        : <ul className="divide-y divide-line">{submissions.map((source) => <li key={source.id} className="p-4 text-sm">
          <div className="flex items-center justify-between gap-2"><strong>{source.title}</strong><Badge tone={source.status === "published" ? "green" : source.status === "rejected" ? "red" : "amber"}>{source.status.replace(/_/g," ")}</Badge></div>
          <p className="mt-1 text-muted">{source.source_type.toUpperCase()} · revision {source.current_revision}{source.outlet_name ? ` · ${source.outlet_name}` : ""} · {source.source_url ?? String(source.metadata.filename ?? "Owner-supplied text")}</p>
          {source.extraction_error ? <p role="alert" className="mt-2 text-red-700">Could not read source: {source.extraction_error}</p> : null}
          {source.status === "pending" && canApprove ? <form action="/api/client/knowledge-submissions" method="post" className="mt-3 flex flex-wrap gap-2">
            <input type="hidden" name="submissionId" value={source.id}/><input type="hidden" name="revision" value={source.current_revision}/>
            <input name="note" required maxLength={1000} aria-label={`Review note for ${source.title}`} className="ui-input min-w-52 flex-1 px-3 py-2" placeholder="Review note"/>
            <button name="action" value="approve" className="ui-primary-button px-3 py-2">Approve revision</button>
            <button name="action" value="request_revision" className="ui-button px-3 py-2">Request revision</button>
            <button name="action" value="reject" className="ui-button px-3 py-2">Reject</button></form> : null}
          {(["validation_failed", "revision_requested", "rejected", "published"].includes(source.status) && source.submitted_by === user.userId) ?
            <details className="mt-3"><summary className="cursor-pointer text-accent">Submit a new revision</summary>
              <form action="/api/client/knowledge-submissions" method="post" encType="multipart/form-data" className="mt-3 grid gap-2">
                <input type="hidden" name="action" value="revise"/><input type="hidden" name="submissionId" value={source.id}/>
                <input type="hidden" name="revision" value={source.current_revision}/><input type="hidden" name="sourceType" value={source.source_type}/>
                <input type="hidden" name="sourceAction" value={source.action}/>
                <input className="ui-input px-3 py-2" name="title" defaultValue={source.title} required aria-label="Revised source title"/>
                <input className="ui-input px-3 py-2" name="description" defaultValue={source.description} aria-label="Revised source description"/>
                {source.source_type === "url" ? <input className="ui-input px-3 py-2" type="url" name="sourceUrl" defaultValue={source.source_url ?? ""} required aria-label="Refresh public URL"/> : null}
                {source.source_type === "pdf" ? <input className="ui-input px-3 py-2" type="file" name="file" accept="application/pdf,.pdf" required aria-label="Replacement PDF"/> : null}
                {source.source_type === "text" && source.action !== "archive" ? <textarea className="ui-input px-3 py-2" name="content" rows={5} defaultValue={source.content} required aria-label="Revised source text"/> : null}
                <button className="ui-button w-fit px-3 py-2">Submit revision for review</button>
              </form></details> : null}
        </li>)}</ul>}
    </section>
    <section className="border-t border-line"><div className="px-5 pt-5 pb-2"><h3 className="font-semibold">Questions needing a better answer</h3></div>
      {reviewItems.length ? <ul className="divide-y divide-line">{reviewItems.map((item) => <li key={item.id} className="p-4 text-sm">
        <strong>{item.reason_code === "knowledge_conflict" ? "Conflicting information" : "Answer needs review"}</strong> · {item.status}
        <p className="mt-2 whitespace-pre-wrap">{item.question}</p>
        {item.source_references.length ? <ul className="mt-2 text-muted">{item.source_references.map((source) =>
          <li key={source.sourceId} className="break-words">{source.title} · {source.sourceUrl ?? "source link unavailable"}
            {describeConflictClaims(source.conflictingClaims).length ? ` · Conflicting claims: ${describeConflictClaims(source.conflictingClaims).join(" / ")}` : ""}</li>)}</ul> : null}
        <Link className="mt-2 inline-block text-accent" href={`/client/conversations/${item.conversation_id}`}>Open secure conversation</Link>
        {item.status === "open" ? <form action="/api/client/knowledge-review" method="post" className="mt-3 grid gap-2">
          <input type="hidden" name="reviewItemId" value={item.id}/>
          <input className="ui-input px-3 py-2" name="title" required placeholder="Fact or policy title" aria-label="Reviewed fact title"/>
          <textarea className="ui-input px-3 py-2" name="content" required rows={3} placeholder="Proposed answer" aria-label="Proposed reviewed answer"/>
          <input className="ui-input px-3 py-2" name="reason" required placeholder="Why this resolves the question" aria-label="Review reason"/>
          <input className="ui-input px-3 py-2" name="sourceReference" placeholder="Supporting source" aria-label="Supporting source"/>
          <button className="ui-button w-fit px-3 py-2">Submit correction for approval</button></form> : null}
      </li>)}</ul> : <p className="p-4 text-sm text-muted">No unanswered questions are waiting for review.</p>}
    </section>

    </details>
  </section>;
}
