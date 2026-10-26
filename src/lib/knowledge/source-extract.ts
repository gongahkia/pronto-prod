import "server-only";
import { createHash } from "node:crypto";
import { lookup } from "node:dns/promises";
import http from "node:http";
import https from "node:https";
import { isIP } from "node:net";
import { parseKnowledgeUpload, MAX_KNOWLEDGE_UPLOAD_BYTES } from "@/lib/knowledge/parse-upload";
import { readableHtmlText } from "@/lib/knowledge/html-text";

const MAX_PAGE_BYTES = 1_000_000;
const MAX_TEXT_CHARS = 200_000;

export type ExtractedSource = { sourceType: "text" | "pdf" | "url"; content: string;
  metadata: Record<string, unknown>; sourceUrl?: string };

export async function extractTextSource(text: string): Promise<ExtractedSource> {
  const content = text.trim();
  if (!content || content.length > MAX_TEXT_CHARS) throw new Error("Source text must be 1–200,000 characters.");
  return { sourceType: "text", content, metadata: { extraction: "plain_text" } };
}

export async function extractPdfSource(file: File): Promise<ExtractedSource> {
  if (file.size > MAX_KNOWLEDGE_UPLOAD_BYTES || file.size < 8 ||
      !file.name.toLowerCase().endsWith(".pdf") ||
      !["application/pdf", "application/octet-stream", ""].includes(file.type))
    throw new Error("Upload a PDF no larger than 8 MB.");
  const bytes = new Uint8Array(await file.arrayBuffer());
  if (new TextDecoder().decode(bytes.subarray(0, 5)) !== "%PDF-") throw new Error("Malformed PDF signature.");
  const parsed = await parseKnowledgeUpload(new File([bytes], file.name, { type: "application/pdf" }));
  if (Number(parsed.metadata.pages) > 50) throw new Error("PDF exceeds the 50-page limit.");
  if (parsed.content.length < 30) throw new Error("This PDF has too little selectable text; scanned PDFs need a text version.");
  if (parsed.content.length > MAX_TEXT_CHARS) throw new Error("Extracted PDF text exceeds the 200,000-character limit.");
  return { sourceType: "pdf", content: parsed.content,
    metadata: { ...parsed.metadata, fileSha256: createHash("sha256").update(bytes).digest("hex") } };
}

export async function extractFileSource(file: File): Promise<ExtractedSource> {
  if (file.name.toLowerCase().endsWith(".pdf")) return extractPdfSource(file);
  const parsed = await parseKnowledgeUpload(file);
  const content = parsed.content.trim();
  if (!content) throw new Error("This document contains no readable text.");
  if (content.length > MAX_TEXT_CHARS) throw new Error("Extracted document text exceeds the 200,000-character limit.");
  return { sourceType: "text", content, metadata: { ...parsed.metadata, originalFormat: parsed.sourceType,
    fileSha256: createHash("sha256").update(new Uint8Array(await file.arrayBuffer())).digest("hex") } };
}

export async function extractHtmlSource(html: string): Promise<ExtractedSource> {
  if (Buffer.byteLength(html, "utf8") > MAX_PAGE_BYTES) throw new Error("HTML exceeds the 1 MB limit.");
  const result = await extractTextSource(readableHtmlText(html));
  return { ...result, metadata: { extraction: "html_text" } };
}

export type ResolvedAddress = { address: string; family: 4 };
export type PageTransport = (url: URL, address: ResolvedAddress) => Promise<{
  status: number; headers: Record<string, string | string[] | undefined>; body: Buffer;
}>;

export async function extractUrlSource(value: string, options: {
  resolve?: (hostname: string) => Promise<ResolvedAddress[]>;
  transport?: PageTransport;
  timeoutMs?: number;
} = {}): Promise<ExtractedSource> {
  if (value.length > 2000) throw new Error("Source URL is too long.");
  let current = new URL(value);
  const original = current.href;
  const resolve = options.resolve ?? resolvePublicAddresses;
  const transport = options.transport ?? requestPinnedPage;
  const timeoutMs = Math.max(1, Math.min(8000, options.timeoutMs ?? 8000));
  for (let hop = 0; hop <= 3; hop += 1) {
    validateUrl(current);
    const addresses = await withDeadline(resolve(current.hostname), timeoutMs, "Source DNS lookup timed out.");
    if (!addresses.length || addresses.some((entry) => !isPublicIpv4(entry.address)))
      throw new Error("Source URL resolves to a restricted network address.");
    const response = await withDeadline(transport(current, addresses[0]), timeoutMs + 1000, "Source page timed out.");
    if ([301, 302, 303, 307, 308].includes(response.status)) {
      if (hop === 3) throw new Error("Source URL redirected too many times.");
      const location = oneHeader(response.headers.location);
      if (!location) throw new Error("Source redirect lacks a location.");
      const next = new URL(location, current);
      validateUrl(next);
      if (next.hostname !== current.hostname) throw new Error("Source redirects must stay on the submitted host.");
      current = next;
      continue;
    }
    if (response.status !== 200) throw new Error(`Source page returned HTTP ${response.status}.`);
    const type = oneHeader(response.headers["content-type"])?.toLowerCase() ?? "";
    if (!/^text\/html(?:\s*;|$)/.test(type)) throw new Error("Source URL must return HTML.");
    if (response.body.length > MAX_PAGE_BYTES) throw new Error("Source page exceeds the 1 MB limit.");
    const html = response.body.toString("utf8");
    const content = readableHtmlText(html);
    if (content.length < 30) throw new Error("Source page has too little readable text.");
    if (content.length > MAX_TEXT_CHARS) throw new Error("Source page has too much readable text.");
    return { sourceType: "url", content, sourceUrl: original,
      metadata: { requestedUrl: original, finalUrl: current.href, observedAt: new Date().toISOString(),
        extraction: "bounded_html", contentSha256: createHash("sha256").update(content).digest("hex") } };
  }
  throw new Error("Source redirect limit exceeded.");
}

function validateUrl(url: URL) {
  if (!["http:", "https:"].includes(url.protocol) || url.username || url.password ||
      (url.port && url.port !== (url.protocol === "https:" ? "443" : "80")) || url.hostname.endsWith(".local") ||
      url.hostname.endsWith(".internal") || url.hostname === "localhost" || isIP(url.hostname))
    throw new Error("Source URL must be a public HTTP or HTTPS webpage without credentials.");
}
async function resolvePublicAddresses(hostname: string): Promise<ResolvedAddress[]> {
  const addresses = await lookup(hostname, { family: 4, all: true });
  return addresses.map(({ address }) => ({ address, family: 4 as const }));
}
export function isPublicIpv4(address: string): boolean {
  if (isIP(address) !== 4) return false;
  const [a, b, c] = address.split(".").map(Number);
  return !(a === 0 || a === 10 || a === 127 || a >= 224 ||
    (a === 100 && b >= 64 && b <= 127) || (a === 169 && b === 254) ||
    (a === 172 && b >= 16 && b <= 31) || (a === 192 && (b === 168 || b === 0 || b === 88 && c === 99)) ||
    (a === 198 && (b === 18 || b === 19 || b === 51 && c === 100)) ||
    (a === 203 && b === 0 && c === 113));
}
function requestPinnedPage(url: URL, address: ResolvedAddress): Promise<{
  status: number; headers: Record<string, string | string[] | undefined>; body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const transport = url.protocol === "https:" ? https : http;
    const req = transport.request(url, { method: "GET", timeout: 8000, maxHeaderSize: 16_384,
      headers: { Accept: "text/html", "User-Agent": "ProntoKnowledgeReview/1.0" },
      lookup: (_host, _opts, callback) => callback(null, address.address, 4),
      agent: false }, (response) => {
      const body: Buffer[] = []; let size = 0;
      response.on("data", (part: Buffer) => { size += part.length;
        if (size > MAX_PAGE_BYTES) { req.destroy(new Error("Source page exceeds the 1 MB limit.")); return; }
        body.push(part); });
      response.on("end", () => resolve({ status: response.statusCode ?? 0, headers: response.headers,
        body: Buffer.concat(body) }));
      response.on("error", reject);
    });
    req.on("timeout", () => req.destroy(new Error("Source page timed out.")));
    req.on("error", reject); req.end();
  });
}
function oneHeader(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}
function withDeadline<T>(promise: Promise<T>, ms: number, message: string): Promise<T> {
  let timer: ReturnType<typeof setTimeout>;
  return Promise.race([promise, new Promise<never>((_resolve, reject) => {
    timer = setTimeout(() => reject(new Error(message)), ms);
  })]).finally(() => clearTimeout(timer));
}
