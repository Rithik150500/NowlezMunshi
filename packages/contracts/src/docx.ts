/**
 * Compiles model-emitted docx-js code into a `.docx` (docx-js -> .docx; ADR-0005,
 * ADR-0012). The Munshi's `write_docx` tool uses this.
 *
 * The implementation **executes** the code, so it must run in a sandbox — see the
 * security note in ADR-0012. The port keeps the sandbox swappable (a `node:vm`
 * containment adapter today; a real isolate for untrusted input in production).
 */
export interface DocxCompiler {
  compile(docxJsCode: string): Promise<Uint8Array>;
}
