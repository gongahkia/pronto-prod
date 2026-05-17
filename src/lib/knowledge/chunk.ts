export type ChunkOptions = {
  maxCharacters: number;
  overlap: number;
};

export type TextChunk = {
  content: string;
  tokenEstimate: number;
};

export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

export function chunkText(text: string, options: ChunkOptions): TextChunk[] {
  const paragraphs = text
    .split(/\n{2,}/)
    .map((paragraph) => paragraph.trim())
    .filter(Boolean);

  const chunks: TextChunk[] = [];
  let current = "";

  for (const paragraph of paragraphs) {
    const candidate = current ? `${current}\n\n${paragraph}` : paragraph;
    if (candidate.length <= options.maxCharacters) {
      current = candidate;
      continue;
    }

    if (current) {
      chunks.push({
        content: current,
        tokenEstimate: estimateTokens(current),
      });
    }

    if (paragraph.length <= options.maxCharacters) {
      current = paragraph;
      continue;
    }

    for (let index = 0; index < paragraph.length; index += options.maxCharacters - options.overlap) {
      const part = paragraph.slice(index, index + options.maxCharacters).trim();
      if (part) {
        chunks.push({ content: part, tokenEstimate: estimateTokens(part) });
      }
    }
    current = "";
  }

  if (current) {
    chunks.push({ content: current, tokenEstimate: estimateTokens(current) });
  }

  return chunks;
}
