import Link from "next/link";
import type { SessionUser } from "@/lib/auth";
import type { KnowledgeSourceDetail } from "@/lib/knowledge/manage";
import type { SourceSubmission } from "@/lib/knowledge/submissions";
import type { KnowledgeSuggestion } from "@/lib/knowledge/suggestions";
import type { KnowledgeReviewItem } from "@/lib/knowledge/review-items";
import { reviewStatusLabel, safeSourceUrl } from "@/lib/knowledge/review-display";
import { Badge } from "@/components/badge";
import { KnowledgeConflictReview, KnowledgeDiff } from "@/components/knowledge-diff";
import { KnowledgeForm } from "@/components/knowledge-form";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";

export type KnowledgeReviewEntry = { kind: "submission"; item: SourceSubmission }
  | { kind: "suggestion"; item: KnowledgeSuggestion } | { kind: "question"; item: KnowledgeReviewItem };

export function KnowledgeReviewDetail({ review, source, user, canApprove }: {
  review: KnowledgeReviewEntry; source: KnowledgeSourceDetail | null; user: SessionUser; canApprove: boolean;
}) {
  if (review.kind === "question") return <QuestionReview item={review.item}/>;
  const { item } = review;
  const isSubmission = review.kind === "submission";
  const action = isSubmission ? "/api/client/knowledge-submissions" : "/api/client/knowledge-suggestions";
  const idField = isSubmission ? "submissionId" : "suggestionId";
  const author = isSubmission ? review.item.submitted_by : review.item.created_by;
  const canRevise = author === user.userId && (isSubmission
    ? ["validation_failed", "revision_requested", "rejected", "published"].includes(item.status)
    : ["pending", "revision_requested", "rejected"].includes(item.status));
  const reference = isSubmission ? review.item.source_url ?? String(review.item.metadata.filename ?? "") : review.item.source_reference;
  const referenceUrl = safeSourceUrl(reference);
  return <div className="space-y-5">
    <section className="ui-panel p-5">
      <div className="flex flex-wrap items-center justify-between gap-3"><h2 className="font-semibold">{isSubmission ? "Submitted source" : "Proposed correction"}</h2>
        <Badge tone={item.status === "published" ? "green" : ["rejected", "validation_failed"].includes(item.status) ? "red" : "amber"}>{reviewStatusLabel(item.status)}</Badge></div>
      <p className="mt-2 text-xs text-muted">Revision {item.current_revision}{!isSubmission && review.item.author_name ? ` · ${review.item.author_name}` : ""}</p>
      {source && <p className="mt-3 text-sm">Updates <Link href={`/client/knowledge/${source.id}`} className="text-accent">{source.title}</Link></p>}
      {reference && <p className="mt-3 break-all text-sm text-muted">Reference: {referenceUrl ? <a href={referenceUrl} target="_blank" rel="noreferrer" className="text-accent">{reference}</a> : reference}</p>}
      {!isSubmission && <p className="mt-3 whitespace-pre-wrap text-sm"><span className="font-medium">Reason:</span> {review.item.reason}</p>}
      {item.review_note && <p className="mt-3 rounded-md bg-surface p-3 text-sm"><span className="font-medium">Reviewer note:</span> {item.review_note}</p>}
      {isSubmission && review.item.extraction_error && <p role="alert" className="mt-3 rounded-md bg-danger-bg p-3 text-sm text-danger">Import failed: {review.item.extraction_error}</p>}
    </section>
    {source && <KnowledgeConflictReview metadata={source.metadata}/>}
    {item.content && <section className="ui-panel p-5"><h2 className="mb-4 font-semibold">Review the changes</h2>
      <KnowledgeDiff before={source?.content ?? ""} after={isSubmission && review.item.action === "archive" ? "" : item.content}
        beforeLabel={source ? "Current document" : "No existing document"} afterLabel={isSubmission && review.item.action === "archive" ? "Proposed archive" : "Submitted revision"}/>
    </section>}
    {item.status === "pending" && canApprove && <section className="ui-panel p-5"><h2 className="mb-2 font-semibold">Review this revision</h2>
      <p className="mb-4 text-sm text-muted">Approval applies to this revision. Customer answers change after testing and publication.</p>
      <KnowledgeForm action={action}>
        <input type="hidden" name={idField} value={item.id}/><input type="hidden" name="revision" value={item.current_revision}/>
        <label className="text-sm font-medium">Review note<textarea name="note" required maxLength={1000} rows={3} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
        <div className="flex flex-wrap gap-2"><button name="action" value="approve" className="ui-primary-button px-4 py-2 text-sm">Approve revision</button>
          <button name="action" value="request_revision" className="ui-button px-3 py-2 text-sm">Request changes</button>
          <button name="action" value="reject" className="ui-button px-3 py-2 text-sm">Reject</button></div>
      </KnowledgeForm>
    </section>}
    {item.status === "pending" && !canApprove && <p className="text-sm text-muted">Waiting for an authorized business reviewer.</p>}
    {canRevise && <section className="ui-panel p-5"><h2 className="mb-4 font-semibold">Revise and resubmit</h2>
      <KnowledgeForm action={action} submitLabel="Submit new revision">
        <input type="hidden" name="action" value="revise"/><input type="hidden" name={idField} value={item.id}/><input type="hidden" name="revision" value={item.current_revision}/>
        <label className="text-sm font-medium">Title<input name="title" required maxLength={200} defaultValue={item.title} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
        {isSubmission ? <>
          <input type="hidden" name="sourceType" value={review.item.source_type}/><input type="hidden" name="sourceAction" value={review.item.action}/>
          <label className="text-sm font-medium">Description<input name="description" defaultValue={review.item.description} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
          {review.item.action !== "archive" && (review.item.source_type === "url"
            ? <label className="text-sm font-medium">Public webpage URL<input type="url" name="sourceUrl" required defaultValue={review.item.source_url ?? ""} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
            : <>{review.item.source_type !== "pdf" && <label className="text-sm font-medium">Source content<textarea name="content" rows={8} defaultValue={item.content} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>}
              <div><p className="mb-2 text-sm font-medium">{review.item.source_type === "pdf" ? "Replacement PDF" : "Replacement file (optional)"}</p><KnowledgeFileInput required={review.item.source_type === "pdf"} pdfOnly={review.item.source_type === "pdf"}/></div></>)}
        </> : <>
          <label className="text-sm font-medium">Proposed answer or policy<textarea name="content" required maxLength={8000} rows={6} defaultValue={item.content} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
          <label className="text-sm font-medium">Why should this change?<textarea name="reason" required maxLength={1000} rows={2} defaultValue={review.item.reason} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
          <label className="text-sm font-medium">Supporting source<input name="sourceReference" maxLength={500} defaultValue={review.item.source_reference ?? ""} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
          <input type="hidden" name="outletName" value={review.item.outlet_name ?? ""}/>
        </>}
      </KnowledgeForm>
    </section>}
  </div>;
}

function QuestionReview({ item }: { item: KnowledgeReviewItem }) {
  return <div className="space-y-5"><section className="ui-panel p-5"><h2 className="font-semibold">Question needing an answer</h2>
    <p className="mt-3 whitespace-pre-wrap text-sm">{item.question}</p><Link href={`/client/conversations/${item.conversation_id}`} className="mt-3 inline-block text-sm text-accent">View customer conversation</Link></section>
    {item.source_references.map(source => <section key={source.sourceId} className="space-y-3"><Link href={`/client/knowledge/${source.sourceId}`} className="text-sm text-accent">{source.title}</Link>
      {item.reason_code === "knowledge_conflict" && <KnowledgeConflictReview metadata={{ reviewStatus: "conflict", conflictingClaims: source.conflictingClaims }}/>}</section>)}
    {item.status === "open" ? <section className="ui-panel p-5"><h2 className="mb-4 font-semibold">Propose information for future answers</h2>
      <KnowledgeForm action="/api/client/knowledge-review" submitLabel="Submit correction for review">
        <input type="hidden" name="reviewItemId" value={item.id}/>
        <label className="text-sm font-medium">Title<input name="title" required maxLength={200} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
        <label className="text-sm font-medium">Proposed answer or policy<textarea name="content" required maxLength={8000} rows={5} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
        <label className="text-sm font-medium">Why does this resolve the question?<textarea name="reason" required maxLength={1000} rows={2} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
        <label className="text-sm font-medium">Supporting source<input name="sourceReference" maxLength={500} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
      </KnowledgeForm>
    </section> : item.suggestion_id && <Link href={`/client/knowledge/reviews/suggestion/${item.suggestion_id}`} className="text-sm text-accent">View proposed correction</Link>}
  </div>;
}
