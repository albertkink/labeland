declare module "pdf-lib" {
  export interface PDFPage {
    // minimal type for addPage
  }

  export class PDFDocument {
    static create(): Promise<PDFDocument>;
    static load(data: ArrayBuffer | Uint8Array): Promise<PDFDocument>;
    getPageCount(): number;
    copyPages(
      src: PDFDocument,
      pageIndices: number[]
    ): Promise<PDFPage[]>;
    addPage(page: PDFPage): void;
    save(): Promise<Uint8Array>;
  }
}
