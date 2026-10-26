import { randomUUID } from "node:crypto";
import Link from "next/link";
import { ArrowRight, BookOpenText, FileText, MessageSquareText } from "lucide-react";
import type { Client } from "@/lib/types";
import { getBusinessKnowledgeSources } from "@/lib/business-portal";
import { listKnowledgeSuggestions } from "@/lib/knowledge/suggestions";
import { listSourceSubmissions } from "@/lib/knowledge/submissions";
import { listKnowledgeReviewItems } from "@/lib/knowledge/review-items";
import { reviewStatusLabel } from "@/lib/knowledge/review-display";
import { Badge } from "@/components/badge";
import { KnowledgeActions } from "@/components/knowledge-actions";

export async function KnowledgeInformationCard({ client }: { client: Client }) {
  const [sources, suggestions, submissions, questions] = await Promise.all([
    getBusinessKnowledgeSources(client.id), listKnowledgeSuggestions(client.id),
    listSourceSubmissions(client.id), listKnowledgeReviewItems(client.id),
  ]);
  const sourceIds = new Set(sources.map(source => source.id));
  const activeSubmissions = submissions.filter(item => item.status !== "published");
  const activeSuggestions = suggestions.filter(item => item.status !== "published");
  const newSubmissions = activeSubmissions.filter(item => !sourceIds.has(item.target_source_id));
  const newSuggestions = activeSuggestions.filter(item => !sourceIds.has(item.target_source_id));
  const unanswered = questions.filter(item => item.status === "open" && !item.source_references.some(ref => sourceIds.has(ref.sourceId)));
  const sourceCount = new Set([...sourceIds, ...newSubmissions.map(item => item.target_source_id), ...newSuggestions.map(item => item.target_source_id)]).size;
  return <section id="knowledge" className="ui-panel scroll-mt-6 overflow-hidden" aria-labelledby="knowledge-heading">
    <div className="flex flex-wrap items-start justify-between gap-4 p-5">
      <div className="flex min-w-0 items-start gap-3"><BookOpenText size={20} className="mt-0.5 shrink-0 text-accent" aria-hidden="true"/>
        <div><div className="flex flex-wrap items-center gap-3"><h2 id="knowledge-heading" className="text-lg font-semibold">Knowledge</h2>
          <span className="text-xs text-muted">{sourceCount} {sourceCount === 1 ? "source" : "sources"}</span></div>
          <p className="mt-1 text-sm text-muted">The facts, policies and documents behind customer answers.</p></div>
      </div>
      <KnowledgeActions sources={sources.map(({ id, title }) => ({ id, title }))} outletName={String(client.business_profile.outletName ?? "")} requestKey={randomUUID()}/>
    </div>
    {sourceCount || unanswered.length ? <ul className="divide-y divide-line border-t border-line">
      {sources.map(source => {
        const conflict = String(source.metadata.reviewStatus ?? "").includes("conflict");
        const pending = activeSubmissions.filter(item => item.target_source_id === source.id).length
          + activeSuggestions.filter(item => item.target_source_id === source.id).length;
        const reference = String(source.metadata.filename ?? source.metadata.sourceReference ?? source.metadata.sourceUrl ?? source.source_type);
        return <li key={source.id}><Link href={`/client/knowledge/${source.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-hover">
          <FileText size={19} className="shrink-0 text-muted" aria-hidden="true"/>
          <div className="min-w-0 flex-1"><p className="text-sm font-medium">{source.title}</p>
            <p className="mt-1 truncate text-xs text-muted" title={reference}>{conflict ? "Conflicting statements · open to compare sources" : reference}</p>
            {pending > 0 && <p className="mt-1 text-xs text-warning">{pending} proposed {pending === 1 ? "update" : "updates"} · open to review</p>}</div>
          <Badge tone={conflict ? "amber" : "green"}>{conflict ? "Needs review" : "Published"}</Badge>
          <ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true"/>
        </Link></li>;
      })}
      {newSubmissions.map(item => <li key={`submission:${item.id}`}><Link href={`/client/knowledge/reviews/submission/${item.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-hover">
        <FileText size={19} className="shrink-0 text-muted" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p>
          <p className="mt-1 text-xs text-muted">{String(item.metadata.filename ?? item.source_url ?? "New source")} · revision {item.current_revision}</p></div>
        <Badge tone={item.status === "rejected" || item.status === "validation_failed" ? "red" : "amber"}>{reviewStatusLabel(item.status)}</Badge><ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true"/>
      </Link></li>)}
      {newSuggestions.map(item => <li key={`suggestion:${item.id}`}><Link href={`/client/knowledge/reviews/suggestion/${item.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-hover">
        <FileText size={19} className="shrink-0 text-muted" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="text-sm font-medium">{item.title}</p>
          <p className="mt-1 text-xs text-muted">Proposed fact or policy · revision {item.current_revision}</p></div>
        <Badge tone={item.status === "rejected" ? "red" : "amber"}>{reviewStatusLabel(item.status)}</Badge><ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true"/>
      </Link></li>)}
      {unanswered.map(item => <li key={`question:${item.id}`}><Link href={`/client/knowledge/reviews/question/${item.id}`} className="flex items-center gap-3 px-5 py-4 hover:bg-surface-hover">
        <MessageSquareText size={19} className="shrink-0 text-muted" aria-hidden="true"/><div className="min-w-0 flex-1"><p className="line-clamp-2 text-sm font-medium">{item.question}</p>
          <p className="mt-1 text-xs text-muted">Customer question · propose information to improve future answers</p></div>
        <Badge tone="amber">Needs an answer</Badge><ArrowRight size={16} className="shrink-0 text-muted" aria-hidden="true"/>
      </Link></li>)}
    </ul> : <p className="border-t border-line p-5 text-sm text-muted">No sources yet. Add a webpage, document or business information to get started.</p>}
  </section>;
}
