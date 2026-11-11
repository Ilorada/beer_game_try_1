// Extraction du texte des supports : PDF, Word (.docx), texte, Markdown, CSV, JSON.
import path from "node:path";
import mammoth from "mammoth";
import { PDFParse } from "pdf-parse";

export async function extractText(buffer, filename) {
  const ext = path.extname(filename).toLowerCase();
  if (ext === ".pdf") {
    const parser = new PDFParse({ data: new Uint8Array(buffer) });
    try {
      const result = await parser.getText();
      return result.text;
    } finally {
      await parser.destroy?.();
    }
  }
  if (ext === ".docx") {
    const result = await mammoth.extractRawText({ buffer });
    return result.value;
  }
  if ([".txt", ".md", ".csv", ".json", ".text", ""].includes(ext)) {
    return buffer.toString("utf8");
  }
  throw new Error(`Format non pris en charge : ${ext} (utilise PDF, DOCX, TXT, MD, CSV ou JSON)`);
}

/** Découpe un long texte en morceaux d'environ `size` caractères, sur des fins de paragraphe. */
export function chunkText(text, size = 12000) {
  const paragraphs = text.replace(/\r/g, "").split(/\n{2,}/);
  const chunks = [];
  let current = "";
  for (const p of paragraphs) {
    if (current && current.length + p.length > size) {
      chunks.push(current);
      current = "";
    }
    if (p.length > size) {
      for (let i = 0; i < p.length; i += size) chunks.push(p.slice(i, i + size));
    } else {
      current += (current ? "\n\n" : "") + p;
    }
  }
  if (current.trim()) chunks.push(current);
  return chunks.filter((c) => c.trim().length > 200 || chunks.length === 1);
}
