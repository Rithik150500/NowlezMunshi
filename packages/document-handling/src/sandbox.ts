import { runInNewContext } from "node:vm";
import type { DocxCompiler } from "@nowlez/contracts";
import * as docx from "docx";

export interface DocxSandboxOptions {
  /** Max wall-clock ms the model's code may run while building the document. */
  readonly timeoutMs?: number;
}

/**
 * Compiles docx-js code into a `.docx` by **executing** it (ADR-0012). The code is
 * expected to `return` a `docx.Document` built from the injected `docx` library.
 *
 * ⚠️ SECURITY: `node:vm` restricts the code's *scope* (no `require`, `process`, or
 * module locals) and bounds its runtime, but it is **NOT a security boundary**
 * against deliberately malicious code — V8's docs are explicit about this. For
 * untrusted input in production, swap this adapter for a real isolate
 * (`isolated-vm`) or a locked-down worker thread, behind the same `DocxCompiler`
 * port. See ADR-0012.
 */
export class NodeVmDocxSandbox implements DocxCompiler {
  constructor(private readonly options: DocxSandboxOptions = {}) {}

  async compile(docxJsCode: string): Promise<Uint8Array> {
    const wrapped = `(function () { "use strict";\n${docxJsCode}\n})()`;
    const result = runInNewContext(wrapped, { docx }, { timeout: this.options.timeoutMs ?? 1000 });
    if (!(result instanceof docx.Document)) {
      throw new Error("docx-js code must return a docx.Document");
    }
    const buffer = await docx.Packer.toBuffer(result);
    return new Uint8Array(buffer);
  }
}
