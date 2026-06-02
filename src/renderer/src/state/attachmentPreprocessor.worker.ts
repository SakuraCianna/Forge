// 本文件说明: 在后台 Worker 中解析输入框附件, 避免 OCR 和文档解析阻塞界面
import { GlobalWorkerOptions, getDocument, type PDFPageProxy } from "pdfjs-dist";
import pdfWorkerUrl from "pdfjs-dist/build/pdf.worker.mjs?url";
import mammoth from "mammoth";
import { readSheet } from "read-excel-file/web-worker";
import Tesseract from "tesseract.js";
import type {
  AttachmentPreprocessorRequest,
  AttachmentPreprocessorResponse
} from "./attachmentPreprocessorTypes";

GlobalWorkerOptions.workerSrc = pdfWorkerUrl;
Tesseract.setLogging(false);

const maxTextFileChars = 18_000;
const maxPdfPagesToRead = 20;
const maxPdfPagesToOcr = 4;
const maxSpreadsheetRowsPerSheet = 60;
const maxSpreadsheetCols = 16;
let ocrWorkerPromise: ReturnType<typeof Tesseract.createWorker> | null = null;

self.onmessage = (event: MessageEvent<AttachmentPreprocessorRequest>): void => {
  void processAttachment(event.data)
    .then((response) => self.postMessage(response))
    .catch((error) =>
      self.postMessage({
        id: event.data.id,
        kind: event.data.kind,
        error: formatAttachmentError(error)
      } satisfies AttachmentPreprocessorResponse)
    );
};

async function processAttachment(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  if (request.kind === "image") {
    return processImageAttachment(request);
  }

  if (request.kind === "pdf") {
    return processPdfAttachment(request);
  }

  if (request.kind === "word") {
    return processWordAttachment(request);
  }

  if (request.kind === "spreadsheet") {
    return processSpreadsheetAttachment(request);
  }

  return processTextAttachment(request);
}

async function processImageAttachment(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  const imageDataUrl = await arrayBufferToDataUrl(request.buffer, request.mediaType || "image/png");

  try {
    const extractedText = await recognizeTextFromImage(imageDataUrl);

    return {
      id: request.id,
      kind: request.kind,
      imageDataUrl,
      extractedText
    };
  } catch (error) {
    return {
      id: request.id,
      kind: request.kind,
      imageDataUrl,
      error: formatAttachmentError(error)
    };
  }
}

async function processPdfAttachment(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  const loadingTask = getDocument({
    data: new Uint8Array(request.buffer),
    useWorkerFetch: false
  });
  const pdf = await loadingTask.promise;
  const textBlocks: string[] = [];
  let ocrPages = 0;

  for (let pageNumber = 1; pageNumber <= Math.min(pdf.numPages, maxPdfPagesToRead); pageNumber += 1) {
    const page = await pdf.getPage(pageNumber);
    const pageText = await extractPdfPageText(page);

    if (pageText) {
      textBlocks.push(`Page ${pageNumber}\n${pageText}`);
      continue;
    }

    if (ocrPages >= maxPdfPagesToOcr) {
      continue;
    }

    const ocrText = await recognizePdfPage(page);
    ocrPages += 1;

    if (ocrText) {
      textBlocks.push(`Page ${pageNumber} OCR\n${ocrText}`);
    }
  }

  await loadingTask.destroy();

  return {
    id: request.id,
    kind: request.kind,
    extractedText: textBlocks.join("\n\n").trim()
  };
}

async function processWordAttachment(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  if (!request.name.toLowerCase().endsWith(".docx")) {
    throw new Error("Only DOCX Word files can be parsed locally right now.");
  }

  const result = await mammoth.extractRawText({ arrayBuffer: request.buffer });

  return {
    id: request.id,
    kind: request.kind,
    extractedText: result.value.trim()
  };
}

async function processSpreadsheetAttachment(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  if (/\.(csv|tsv)$/iu.test(request.name)) {
    return processTextAttachment(request);
  }

  const rows = await readSheet(request.buffer);
  const formattedRows = rows
    .slice(0, maxSpreadsheetRowsPerSheet)
    .map((row) =>
      row
        .slice(0, maxSpreadsheetCols)
        .map(formatSpreadsheetCell)
        .join("\t")
        .trimEnd()
    )
    .filter(Boolean);

  return {
    id: request.id,
    kind: request.kind,
    extractedText: formattedRows.join("\n").trim()
  };
}

async function processTextAttachment(
  request: AttachmentPreprocessorRequest
): Promise<AttachmentPreprocessorResponse> {
  const text = new TextDecoder("utf-8", { fatal: false }).decode(request.buffer);

  return {
    id: request.id,
    kind: request.kind,
    extractedText: trimText(text, maxTextFileChars)
  };
}

async function extractPdfPageText(page: PDFPageProxy): Promise<string> {
  const content = await page.getTextContent();

  return content.items
    .map(getPdfTextItemString)
    .join(" ")
    .replace(/\s+/gu, " ")
    .trim();
}

async function recognizePdfPage(page: PDFPageProxy): Promise<string> {
  if (typeof OffscreenCanvas === "undefined") {
    return "";
  }

  const viewport = page.getViewport({ scale: 1.6 });
  const canvas = new OffscreenCanvas(Math.ceil(viewport.width), Math.ceil(viewport.height));
  const canvasContext = canvas.getContext("2d");

  if (!canvasContext) {
    return "";
  }

  const renderOptions = {
      canvas,
      canvasContext,
      viewport
    } as unknown as Parameters<PDFPageProxy["render"]>[0];

  await page.render(renderOptions).promise;

  const blob = await canvas.convertToBlob({ type: "image/png" });
  const dataUrl = await blobToDataUrl(blob);

  return recognizeTextFromImage(dataUrl);
}

async function recognizeTextFromImage(image: string): Promise<string> {
  const worker = await getOcrWorker();
  const result = await worker.recognize(image);

  return result.data.text.trim();
}

async function getOcrWorker(): ReturnType<typeof Tesseract.createWorker> {
  if (!ocrWorkerPromise) {
    ocrWorkerPromise = Tesseract.createWorker("eng+chi_sim").then(async (worker) => {
      await worker.setParameters({
        preserve_interword_spaces: "1",
        user_defined_dpi: "150"
      });

      return worker;
    });
  }

  return ocrWorkerPromise;
}

function arrayBufferToDataUrl(buffer: ArrayBuffer, mediaType: string): Promise<string> {
  return blobToDataUrl(new Blob([buffer], { type: mediaType }));
}

function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();

    reader.onerror = () => reject(reader.error ?? new Error("Failed to read attachment"));
    reader.onload = () => {
      resolve(typeof reader.result === "string" ? reader.result : "");
    };
    reader.readAsDataURL(blob);
  });
}

function trimText(text: string, limit: number): string {
  const normalized = text.replace(/\r\n?/gu, "\n").trim();

  return normalized.length <= limit ? normalized : normalized.slice(0, limit).trimEnd();
}

function formatSpreadsheetCell(value: unknown): string {
  if (value instanceof Date) {
    return value.toISOString();
  }

  return String(value ?? "").trim();
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

function getPdfTextItemString(item: unknown): string {
  if (!isRecord(item)) {
    return "";
  }

  const text = item["str"];

  return typeof text === "string" ? text : "";
}

function formatAttachmentError(error: unknown): string {
  return error instanceof Error ? error.message : "Attachment parsing failed";
}
