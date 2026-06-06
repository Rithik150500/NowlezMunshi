import { execFile } from "node:child_process";
import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { promisify } from "node:util";
import type { BinaryRef, BlobStore } from "@nowlez/contracts";

const execFileAsync = promisify(execFile);

/** Run an office converter on `input`, writing `source.pdf` into `outDir`. Injectable for tests. */
export type OfficeConvert = (input: string, outDir: string) => Promise<void>;

export interface LibreOfficeConfig {
  readonly blobs: BlobStore;
  /** soffice binary. Defaults to $NOWLEZ_SOFFICE_PATH, else `soffice.com` (Windows) / `soffice`. */
  readonly sofficePath?: string;
  /** Injectable converter (defaults to spawning LibreOffice headless) — for tests. */
  readonly convert?: OfficeConvert;
}

function defaultSoffice(): string {
  if (process.env.NOWLEZ_SOFFICE_PATH) {
    return process.env.NOWLEZ_SOFFICE_PATH;
  }
  // On Windows, soffice.com is the console wrapper that *blocks* until conversion finishes;
  // soffice.exe is a launcher that returns immediately. On Linux, `soffice` blocks.
  return process.platform === "win32" ? "soffice.com" : "soffice";
}

/**
 * docx -> PDF via LibreOffice headless (ADR-0005): bytes in, a stored PDF BinaryRef out. Each call
 * runs in a private temp dir with a private soffice user profile, so concurrent conversions don't
 * collide on LibreOffice's single-instance lock. The soffice binary itself is the operator's
 * go-live step (set NOWLEZ_SOFFICE_PATH); CI/tests inject `convert`.
 */
export function buildLibreOfficeDocxToPdf(
  config: LibreOfficeConfig,
): (docx: BinaryRef) => Promise<BinaryRef> {
  const soffice = config.sofficePath ?? defaultSoffice();
  const convert: OfficeConvert =
    config.convert ??
    (async (input, outDir) => {
      const profile = `file:///${join(outDir, "profile").replace(/\\/g, "/")}`;
      await execFileAsync(soffice, [
        "--headless",
        `-env:UserInstallation=${profile}`,
        "--convert-to",
        "pdf",
        "--outdir",
        outDir,
        input,
      ]);
    });

  return async (docx) => {
    const bytes = await config.blobs.get(docx);
    const dir = await mkdtemp(join(tmpdir(), "nowlez-docx-"));
    try {
      const input = join(dir, "source.docx");
      await writeFile(input, bytes);
      await convert(input, dir);
      const pdf = await readFile(join(dir, "source.pdf"));
      return await config.blobs.put(new Uint8Array(pdf), "application/pdf");
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  };
}
