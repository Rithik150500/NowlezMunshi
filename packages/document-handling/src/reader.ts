import type { DocxReader } from "@nowlez/contracts";
import mammoth from "mammoth";

/** Extracts plain text from a `.docx` using mammoth — backs the Munshi's read_docx. */
export class MammothDocxReader implements DocxReader {
  async extractText(docx: Uint8Array): Promise<string> {
    const { value } = await mammoth.extractRawText({ buffer: Buffer.from(docx) });
    return value;
  }
}
