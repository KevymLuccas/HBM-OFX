/// <reference types="vite/client" />

declare module "*.json" {
  const value: any;
  export default value;
}

declare module "pdfjs-dist/build/pdf.worker.min.mjs?url" {
  const src: string;
  export default src;
}
