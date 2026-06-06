import { existsSync } from "node:fs";
import { writeFile } from "node:fs/promises";
import { join } from "node:path";
import { NodeVmDocxSandbox } from "@nowlez/document-handling";
import { InMemoryBlobStore } from "@nowlez/storage";
import { describe, expect, it } from "vitest";
import { buildLibreOfficeDocxToPdf, type OfficeConvert } from "./docx-converter";

const DOCX_CT = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";

// A real LibreOffice for the integration test; skip where none is installed (e.g. CI).
const SOFFICE = [
  process.env.NOWLEZ_SOFFICE_PATH,
  "C:\\Program Files\\LibreOffice\\program\\soffice.com",
  "/usr/bin/soffice",
  "/usr/bin/libreoffice",
].find((p) => p && existsSync(p));

describe("buildLibreOfficeDocxToPdf", () => {
  it("writes the docx to a temp file, runs the converter, and stores the produced PDF", async () => {
    const blobs = new InMemoryBlobStore();
    const src = await blobs.put(new Uint8Array([1, 2, 3]), DOCX_CT);
    let sawInput: string | undefined;
    const convert: OfficeConvert = async (input, outDir) => {
      sawInput = input;
      await writeFile(join(outDir, "source.pdf"), Buffer.from("%PDF-1.4\nstub\n"));
    };

    const ref = await buildLibreOfficeDocxToPdf({ blobs, convert })(src);

    expect(ref.contentType).toBe("application/pdf");
    expect(sawInput?.endsWith("source.docx")).toBe(true);
    const pdf = await blobs.get(ref);
    expect([...pdf.subarray(0, 5)]).toEqual([0x25, 0x50, 0x44, 0x46, 0x2d]); // "%PDF-"
  });

  it.skipIf(!SOFFICE)(
    "really converts a docx to a PDF with LibreOffice",
    async () => {
      const blobs = new InMemoryBlobStore();
      const docx = await new NodeVmDocxSandbox().compile(
        'return new docx.Document({ sections: [{ children: [new docx.Paragraph("Hello NowLez")] }] });',
      );
      const src = await blobs.put(docx, DOCX_CT);

      const ref = await buildLibreOfficeDocxToPdf({ blobs, sofficePath: SOFFICE })(src);

      const pdf = await blobs.get(ref);
      expect(new TextDecoder().decode(pdf.subarray(0, 5))).toBe("%PDF-");
      expect(pdf.length).toBeGreaterThan(1000);
    },
    60_000,
  );
});
