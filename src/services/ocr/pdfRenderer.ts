import type { PDFDocumentProxy } from 'pdfjs-dist';

export interface PdfPageRenderer {
  pageCount: number;
  renderPage(pageNumber: number, scale?: number): Promise<Blob>;
  destroy(): Promise<void>;
}

const DEFAULT_RENDER_SCALE = 2;

export async function openPdfRenderer(blob: Blob): Promise<PdfPageRenderer> {
  const pdfjs = await import('pdfjs-dist');
  const workerModule = await import('pdfjs-dist/build/pdf.worker.min.mjs?url');
  pdfjs.GlobalWorkerOptions.workerSrc = workerModule.default;

  const data = await blob.arrayBuffer();
  const pdf: PDFDocumentProxy = await pdfjs.getDocument({ data }).promise;

  return {
    pageCount: pdf.numPages,
    async renderPage(pageNumber, scale = DEFAULT_RENDER_SCALE) {
      const page = await pdf.getPage(pageNumber);
      const viewport = page.getViewport({ scale });
      const canvas = document.createElement('canvas');
      canvas.width = Math.max(1, Math.floor(viewport.width));
      canvas.height = Math.max(1, Math.floor(viewport.height));
      const context = canvas.getContext('2d');
      if (!context) {
        throw new Error('Canvas is unavailable for OCR rendering');
      }
      context.fillStyle = '#ffffff';
      context.fillRect(0, 0, canvas.width, canvas.height);
      await page.render({ canvasContext: context, viewport }).promise;

      return new Promise<Blob>((resolve, reject) => {
        canvas.toBlob((result) => {
          if (result) {
            resolve(result);
          } else {
            reject(new Error('The page could not be converted for OCR'));
          }
        }, 'image/png');
      });
    },
    destroy() {
      return pdf.destroy();
    },
  };
}
