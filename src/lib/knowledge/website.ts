export type WebsiteKnowledgeCrawl = {
  title: string;
  content: string;
  metadata: {
    entryMode: "website";
    url: string;
    crawledPages: string[];
    crawlDepth: number;
    maxPages: number;
    warnings: string[];
  };
};

type CrawlPage = {
  url: string;
  depth: number;
};

type ExtractedPage = {
  url: string;
  title: string;
  text: string;
  links: string[];
};

export async function crawlWebsiteKnowledge(input: {
  url: string;
  crawlDepth?: number;
  maxPages?: number;
  fetchImpl?: typeof fetch;
}): Promise<WebsiteKnowledgeCrawl> {
  const fetchImpl = input.fetchImpl ?? fetch;
  const startUrl = parseWebsiteUrl(input.url);
  const crawlDepth = boundedInteger(input.crawlDepth, 1, 0, 2);
  const maxPages = boundedInteger(input.maxPages, 5, 1, 10);
  const warnings: string[] = [];
  const robots = await loadRobotsRules(startUrl, fetchImpl, warnings);

  const queue: CrawlPage[] = [{ url: startUrl.toString(), depth: 0 }];
  const seen = new Set<string>();
  const pages: ExtractedPage[] = [];

  for (let index = 0; index < queue.length && pages.length < maxPages; index += 1) {
    const current = queue[index];
    if (seen.has(current.url)) {
      continue;
    }
    seen.add(current.url);

    const currentUrl = new URL(current.url);
    if (isRobotsDisallowed(currentUrl, robots)) {
      warnings.push(`robots.txt may disallow ${currentUrl.pathname || "/"}.`);
    }

    const page = await fetchHtmlPage(currentUrl, fetchImpl, warnings, current.depth === 0);
    if (!page) {
      continue;
    }

    pages.push(page);
    if (current.depth >= crawlDepth) {
      continue;
    }

    for (const href of page.links) {
      const next = normalizeSameOriginLink(href, currentUrl, startUrl);
      if (!next || seen.has(next)) {
        continue;
      }
      queue.push({ url: next, depth: current.depth + 1 });
    }
  }

  const content = pages
    .map((page) => [`# ${page.title || page.url}`, `Source URL: ${page.url}`, page.text].join("\n"))
    .join("\n\n---\n\n")
    .trim();

  if (!content) {
    throw new Error("Website crawl did not extract readable text.");
  }

  return {
    title: pages[0]?.title || startUrl.hostname,
    content,
    metadata: {
      entryMode: "website",
      url: startUrl.toString(),
      crawledPages: pages.map((page) => page.url),
      crawlDepth,
      maxPages,
      warnings,
    },
  };
}

function parseWebsiteUrl(value: string): URL {
  let url: URL;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Enter a valid website URL.");
  }

  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new Error("Website URL must start with http:// or https://.");
  }
  url.hash = "";
  return url;
}

function boundedInteger(
  value: number | undefined,
  fallback: number,
  min: number,
  max: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value)) {
    return fallback;
  }
  return Math.min(max, Math.max(min, Math.floor(value)));
}

async function loadRobotsRules(
  startUrl: URL,
  fetchImpl: typeof fetch,
  warnings: string[],
): Promise<string[]> {
  const robotsUrl = new URL("/robots.txt", startUrl);
  try {
    const response = await fetchImpl(robotsUrl.toString(), {
      headers: { Accept: "text/plain" },
      redirect: "follow",
    });
    if (!response.ok) {
      return [];
    }
    return parseRobotsDisallowRules(await response.text());
  } catch (error) {
    warnings.push(`Could not read robots.txt: ${errorToMessage(error)}`);
    return [];
  }
}

function parseRobotsDisallowRules(text: string): string[] {
  const rules: string[] = [];
  let appliesToAllAgents = false;

  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.replace(/#.*/, "").trim();
    if (!line) {
      continue;
    }

    const separatorIndex = line.indexOf(":");
    if (separatorIndex === -1) {
      continue;
    }
    const key = line.slice(0, separatorIndex).trim().toLowerCase();
    const value = line.slice(separatorIndex + 1).trim();

    if (key === "user-agent") {
      appliesToAllAgents = value === "*";
      continue;
    }
    if (appliesToAllAgents && key === "disallow" && value) {
      rules.push(value);
    }
  }

  return rules;
}

function isRobotsDisallowed(url: URL, rules: string[]): boolean {
  return rules.some((rule) => url.pathname.startsWith(rule));
}

async function fetchHtmlPage(
  url: URL,
  fetchImpl: typeof fetch,
  warnings: string[],
  required: boolean,
): Promise<ExtractedPage | null> {
  let response: Response;
  try {
    response = await fetchImpl(url.toString(), {
      headers: { Accept: "text/html,application/xhtml+xml" },
      redirect: "follow",
    });
  } catch (error) {
    if (required) {
      throw new Error(`Website fetch failed: ${errorToMessage(error)}`);
    }
    warnings.push(`Skipped ${url.toString()}: ${errorToMessage(error)}`);
    return null;
  }

  if (!response.ok) {
    const message = `Website fetch failed with HTTP ${response.status}.`;
    if (required) {
      throw new Error(message);
    }
    warnings.push(`Skipped ${url.toString()}: HTTP ${response.status}.`);
    return null;
  }

  const contentType = response.headers.get("content-type") ?? "";
  if (contentType && !contentType.includes("text/html")) {
    const message = `Website returned ${contentType}; only static HTML pages are supported.`;
    if (required) {
      throw new Error(message);
    }
    warnings.push(`Skipped ${url.toString()}: ${message}`);
    return null;
  }

  return extractHtmlPage(url.toString(), await response.text());
}

function extractHtmlPage(url: string, html: string): ExtractedPage {
  const title = decodeHtmlEntities(
    html.match(/<title[^>]*>([\s\S]*?)<\/title>/i)?.[1]?.trim() ?? "",
  );
  const links = Array.from(html.matchAll(/\s(?:href)=["']([^"']+)["']/gi)).map(
    (match) => match[1],
  );
  const text = decodeHtmlEntities(
    html
      .replace(/<script[\s\S]*?<\/script>/gi, " ")
      .replace(/<style[\s\S]*?<\/style>/gi, " ")
      .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/(p|div|li|h[1-6]|tr|section|article)>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\u00a0/g, " ")
      .replace(/[ \t]{2,}/g, " ")
      .replace(/[ \t]+\n/g, "\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim(),
  );

  return {
    url,
    title: title || new URL(url).hostname,
    text,
    links,
  };
}

function normalizeSameOriginLink(
  href: string,
  currentUrl: URL,
  startUrl: URL,
): string | null {
  if (!href || /^(mailto|tel|sms|javascript):/i.test(href)) {
    return null;
  }

  let next: URL;
  try {
    next = new URL(href, currentUrl);
  } catch {
    return null;
  }

  if (next.origin !== startUrl.origin) {
    return null;
  }
  if (next.protocol !== "http:" && next.protocol !== "https:") {
    return null;
  }

  next.hash = "";
  return next.toString();
}

function decodeHtmlEntities(value: string): string {
  return value
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'");
}

function errorToMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}
