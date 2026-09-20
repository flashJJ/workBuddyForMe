import type { ChunkOptions, ChunkSlice } from './types';

interface Atom {
  text: string;
  start: number;
  end: number;
}

const SENTENCE_BREAK = /(?<=[。！？!?；;\n])/;

/** 超长段落按句子贪心切分，仍超长则按字符硬切并保留 overlap */
function splitLongParagraph(paragraph: Atom, size: number, overlap: number): Atom[] {
  const sentences = paragraph.text
    .split(SENTENCE_BREAK)
    .map((raw) => raw.trim())
    .filter(Boolean);

  const pieces: Atom[] = [];
  let cursor = paragraph.start;
  for (const sentence of sentences) {
    let offset = 0;
    while (offset < sentence.length) {
      const piece = sentence.slice(offset, offset + size);
      pieces.push({ text: piece, start: cursor + offset, end: cursor + offset + piece.length });
      offset += Math.max(1, size - overlap);
    }
    cursor += sentence.length;
  }
  return pieces;
}

/** 段落友好分片：先按空行拆段落，贪心打包；记录在原文中的字符区间 */
export function chunkText(
  text: string,
  { chunkSize, chunkOverlap }: ChunkOptions,
): ChunkSlice[] {
  const normalized = text.replace(/\r\n/g, '\n').trim();
  if (!normalized) return [];
  const size = Math.max(50, Math.floor(chunkSize));
  const overlap = Math.min(Math.max(0, Math.floor(chunkOverlap)), size - 1);

  const paragraphMatches = [...normalized.matchAll(/(.+?)(?=\n{2,}|$)/gs)];
  const atoms: Atom[] = paragraphMatches.flatMap((match) => {
    const raw = match[0]!;
    const start = match.index ?? 0;
    const atom: Atom = { text: raw.trim(), start, end: start + raw.length };
    return atom.text.length > size ? splitLongParagraph(atom, size, overlap) : [atom];
  });

  const chunks: ChunkSlice[] = [];
  let current: Atom[] = [];
  let currentLength = 0;

  const flush = (next: Atom | null) => {
    if (current.length === 0) return;
    chunks.push({
      content: current.map((a) => a.text).join('\n\n'),
      charStart: current[0]!.start,
      charEnd: current[current.length - 1]!.end,
    });
    if (next) {
      const tailText = chunks[chunks.length - 1]!.content;
      if (overlap > 0 && tailText.length >= overlap && overlap + 2 + next.text.length <= size) {
        const tail = tailText.slice(-overlap);
        current = [{ text: tail, start: next.start, end: next.start }];
        currentLength = tail.length + 2;
        return;
      }
    }
    current = [];
    currentLength = 0;
  };

  for (const atom of atoms) {
    if (currentLength > 0 && currentLength + atom.text.length > size) flush(atom);
    current.push(atom);
    currentLength += (currentLength > 0 ? 2 : 0) + atom.text.length;
    if (currentLength >= size) flush(null);
  }
  flush(null);
  return chunks;
}
