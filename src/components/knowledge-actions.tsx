"use client";

import { useId, useRef, useState, type ReactNode } from "react";
import { FileText, Globe, PenLine, Plus, Upload, X } from "lucide-react";
import { KnowledgeFileInput } from "@/components/knowledge-file-input";
import { KnowledgeForm } from "@/components/knowledge-form";

type SourceOption = { id: string; title: string };

function ActionDialog({ label, primary, children }: { label: string; primary?: boolean; children: ReactNode }) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  return <>
    <button type="button" onClick={() => dialog.current?.showModal()} className={`${primary ? "ui-primary-button" : "ui-button"} inline-flex items-center gap-2 px-3 py-2 text-sm`}>
      {primary ? <Plus size={16} aria-hidden="true"/> : <PenLine size={16} aria-hidden="true"/>}{label}
    </button>
    <dialog ref={dialog} aria-labelledby={titleId} onClick={event => { if (event.target === event.currentTarget) dialog.current?.close(); }}
      className="fixed inset-0 m-auto max-h-[85dvh] w-[calc(100%_-_2rem)] max-w-2xl overflow-y-auto rounded-xl border border-line bg-panel p-0 text-foreground shadow-xl backdrop:bg-black/35">
      <div className="sticky top-0 z-10 flex items-center justify-between gap-3 border-b border-line bg-panel px-5 py-4">
        <h2 id={titleId} className="text-lg font-semibold">{label}</h2>
        <button type="button" aria-label="Close dialog" onClick={() => dialog.current?.close()}
          className="inline-flex h-9 w-9 items-center justify-center rounded-full text-muted hover:bg-surface-hover"><X size={19} aria-hidden="true"/></button>
      </div>
      <div className="p-5">{children}</div>
    </dialog>
  </>;
}

export function KnowledgeActions({ sources, outletName, requestKey, defaultSourceId = "", onlyCorrection = false }: {
  sources: SourceOption[]; outletName: string; requestKey: string; defaultSourceId?: string; onlyCorrection?: boolean;
}) {
  return <div className="flex flex-wrap items-center gap-2">
    {!onlyCorrection && <ActionDialog label="Add information" primary><AddInformationForm outletName={outletName} requestKey={requestKey}/></ActionDialog>}
    <ActionDialog label="Suggest a correction"><CorrectionForm sources={sources} outletName={outletName} requestKey={`${requestKey}:correction`} defaultSourceId={defaultSourceId}/></ActionDialog>
  </div>;
}

function AddInformationForm({ outletName, requestKey }: { outletName: string; requestKey: string }) {
  const [mode, setMode] = useState("url");
  const urlHelpId = useId();
  const modes = [{ id: "url", label: "Webpage", icon: Globe }, { id: "file", label: "Upload file", icon: Upload }, { id: "text", label: "Paste content", icon: FileText }];
  return <KnowledgeForm action="/api/client/knowledge" submitLabel="Submit for review">
    <p className="text-sm text-muted">Add a reference for customer answers. It becomes available after review and publication.</p>
    <input type="hidden" name="requestKey" value={requestKey}/>
    <label className="text-sm font-medium">Source title<input name="title" required maxLength={200} placeholder="For example, our current menu" className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
    <div className="flex flex-wrap gap-2" role="group" aria-label="Source input type">{modes.map(({ id, label, icon: Icon }) =>
      <button key={id} type="button" aria-pressed={mode === id} onClick={() => setMode(id)}
        className={`${mode === id ? "ui-primary-button" : "ui-button"} inline-flex items-center gap-2 px-3 py-2 text-sm`}><Icon size={16} aria-hidden="true"/>{label}</button>)}</div>
    {mode === "url" && <div><label className="text-sm font-medium">Public webpage URL<input name="sourceUrl" type="url" required aria-describedby={urlHelpId} placeholder="https://example.com/menu" className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
      <p id={urlHelpId} className="mt-2 text-xs text-muted">Imports readable content from this page when you submit it.</p></div>}
    {mode === "file" && <KnowledgeFileInput required/>}
    {mode === "text" && <div className="grid gap-3"><label className="text-sm font-medium">Content format<select name="textFormat" className="ui-input mt-1 block w-full px-3 py-2 font-normal">
      <option value="text">Text or Markdown</option><option value="html">HTML</option></select></label>
      <label className="text-sm font-medium">Source content<textarea name="content" required maxLength={200000} rows={7} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label></div>}
    <details className="text-sm"><summary className="cursor-pointer text-muted">Description and outlet (optional)</summary>
      <div className="mt-3 grid gap-3"><label>Description<input name="description" maxLength={1000} className="ui-input mt-1 block w-full px-3 py-2"/></label>
        <label>Outlet<input name="outletName" defaultValue={outletName} maxLength={200} className="ui-input mt-1 block w-full px-3 py-2"/></label></div></details>
  </KnowledgeForm>;
}

function CorrectionForm({ sources, outletName, requestKey, defaultSourceId }: {
  sources: SourceOption[]; outletName: string; requestKey: string; defaultSourceId: string;
}) {
  return <KnowledgeForm action="/api/client/knowledge-suggestions" submitLabel="Submit correction">
    <p className="text-sm text-muted">Propose the correct information and include evidence for the reviewer.</p>
    <input type="hidden" name="requestKey" value={requestKey}/>
    <label className="text-sm font-medium">Source to update<select name="sourceId" defaultValue={defaultSourceId} className="ui-input mt-1 block w-full px-3 py-2 font-normal">
      <option value="">New fact or policy</option>{sources.map(source => <option key={source.id} value={source.id}>{source.title}</option>)}</select></label>
    <label className="text-sm font-medium">Title<input name="title" required maxLength={200} defaultValue={sources.find(source => source.id === defaultSourceId)?.title ?? ""} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
    <label className="text-sm font-medium">Proposed answer or policy<textarea name="content" required maxLength={8000} rows={5} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
    <label className="text-sm font-medium">Why should this change?<textarea name="reason" required maxLength={1000} rows={2} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
    <label className="text-sm font-medium">Supporting source (optional)<input name="sourceReference" maxLength={500} className="ui-input mt-1 block w-full px-3 py-2 font-normal"/></label>
    <input type="hidden" name="outletName" value={outletName}/>
  </KnowledgeForm>;
}
