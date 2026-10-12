import { randomUUID } from "node:crypto";
import Link from "next/link";
import { requireUser } from "@/lib/auth";
import { getClient } from "@/lib/dashboard";
import { getAssistantDraft } from "@/lib/assistant-drafts";
import { getBusinessKnowledgeSources } from "@/lib/business-portal";
import { listKnowledgeSuggestions } from "@/lib/knowledge/suggestions";
import { listSourceSubmissions } from "@/lib/knowledge/submissions";
import { describeConflictClaims, listKnowledgeReviewItems } from "@/lib/knowledge/review-items";
import { hasStaffCapability } from "@/lib/staff-permissions";
import { AppShell } from "@/components/shell";
import { Badge } from "@/components/badge";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";

export default async function ClientKnowledgePage({ searchParams }: {
  searchParams?: Promise<{ updated?: string; staged?: string; submitted?: string }>;
}) {
  const user = await requireUser("client");
  if (!user.clientId) throw new Error("Business assignment required.");
  const [client, sources, suggestions, submissions, reviewItems, draft, canApprove, params] = await Promise.all([
    getClient(user.clientId), getBusinessKnowledgeSources(user.clientId),
    listKnowledgeSuggestions(user.clientId), listSourceSubmissions(user.clientId),
    listKnowledgeReviewItems(user.clientId), getAssistantDraft(user.clientId),
    hasStaffCapability(user, user.clientId, "knowledge.approve"),
    searchParams ?? Promise.resolve({} as { updated?: string; staged?: string; submitted?: string }),
  ]);
  if (!client) throw new Error("Business not found.");
  const outlet = String(client.business_profile.outletName ?? "");
  return <AppShell user={user} active="client" clientActive="knowledge" workspaceName={client.name}>
    <h1 className="text-2xl font-semibold">Business Knowledge</h1>
    <p className="mb-5 mt-1 text-sm text-muted">Review approved information and suggest corrections. Pronto publishes only reviewed changes.</p>
    {params.updated || params.staged || params.submitted ? <p role="status" className="mb-4 rounded bg-success-bg p-3 text-sm text-success">
      Saved for review. Customer answers have not changed.</p> : null}
    <section className="ui-panel"><div className="ui-panel-header"><h2 className="font-semibold">Information currently used in customer answers</h2></div>
      {sources.length === 0 ? <p className="p-4 text-sm text-muted">No published business information yet. Suggest a fact below.</p>
        : <ul className="divide-y divide-line">{sources.map((source) => <li key={source.id} className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div><Link href={`/client/knowledge/${source.id}`} className="font-medium text-accent">{source.title}</Link>
            <p className="mt-1 text-xs text-muted">Source: {String(source.metadata.sourceReference ?? source.metadata.sourceUrl ?? source.source_type)}
              {source.last_reviewed_at ? ` · last published ${new Date(source.last_reviewed_at).toLocaleDateString("en-SG")}` : " · review date unavailable"}</p></div>
          <Badge tone="green">Published</Badge>
        </li>)}</ul>}
    </section>
    <section className="ui-panel mt-5 p-4"><h2 className="font-semibold">Suggest a correction</h2>
      <p className="mb-3 text-sm text-muted">A suggestion stays pending until a designated approver reviews it and Pronto completes publication.</p>
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
    </section>
    <section className="ui-panel mt-5"><div className="ui-panel-header"><h2 className="font-semibold">Suggested changes</h2></div>
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
    {draft ? <p className="mt-4 text-sm text-muted">An assistant update is awaiting a private test, business approval or Pronto publication. <Link href="/client/approvals" className="text-accent">Review pending decisions</Link>.</p> : null}
    <section className="ui-panel mt-5"><div className="ui-panel-header"><h2 className="font-semibold">Submitted sources</h2></div>
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
    <section className="ui-panel mt-5"><div className="ui-panel-header"><h2 className="font-semibold">Questions needing a better answer</h2></div>
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
    <details className="mt-5 rounded border border-line p-4"><summary className="cursor-pointer text-sm font-medium">Submit business information</summary>
      <p className="mt-2 text-sm text-muted">Text, a selectable-text PDF, or one public webpage. Your submission stays pending until business approval and Pronto publication.</p>
      <form action="/api/client/knowledge" method="post" encType="multipart/form-data" className="mt-3 grid gap-3">
        <input type="hidden" name="requestKey" value={randomUUID()}/>
        <input name="title" aria-label="Source title" placeholder="Source title" required className="ui-input px-3 py-2"/>
        <input name="description" aria-label="Source description" placeholder="What does this source cover?" className="ui-input px-3 py-2"/>
        <input name="outletName" aria-label="Outlet" defaultValue={outlet} placeholder="Outlet, if applicable" className="ui-input px-3 py-2"/>
        <textarea name="content" aria-label="Source content" rows={4} placeholder="Paste business information here" className="ui-input px-3 py-2"/>
        <input name="sourceUrl" type="url" aria-label="Public source webpage" placeholder="https://example.com/your-page" className="ui-input px-3 py-2"/>
        <KnowledgeFileInput/><button className="ui-button w-fit px-3 py-2">Submit source draft</button></form>
    </details>
  </AppShell>;
}
