import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

type TransactionRow = {
  date: string; // yyyy-mm-dd
  description: string;
  amount: number;
};

const normalizePdfText = (input: string) => {
  // pdfjs costuma inserir espaços extras (ex: 27 / 11 / 2025, R$  1.234,56)
  return input
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/R\s*\$\s*/g, "R$")
    .replace(/\s*:\s*/g, ":")
    .trim();
};

const isValidDayMonth = (ddmm: string) => {
  const [d, m] = ddmm.split("/").map(Number);
  return d >= 1 && d <= 31 && m >= 1 && m <= 12;
};

const SKIP_KEYWORDS = [
  "SALDO TOTAL",
  "SALDO APLIC",
  "SALDO CONTA",
  "CENTRAL DE SUPORTE",
  "SAC",
  "OUVIDORIA",
  "PÁGINA",
  "BANCO SAFRA",
  "CNPJ:",
];

export const safra2Parser = {
  async parse(file: File): Promise<ParsedTransaction[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(" ");
      fullText += pageText + "\n";
    }

    const normalized = normalizePdfText(fullText);

    // Período: aceita variações e espaços em datas
    const periodMatch = normalized.match(
      /Per[ií]odo\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i
    );
    if (!periodMatch) {
      throw new Error("Período não encontrado no extrato Safra 2");
    }

    const startDate = periodMatch[1];
    const endDate = periodMatch[2];
    const startYear = parseInt(startDate.split("/")[2]);
    const endYear = parseInt(endDate.split("/")[2]);
    const startMonth = parseInt(startDate.split("/")[1]);

    // Seção de lançamentos: no vinculado pode variar; tenta âncoras comuns
    const anchors = ["LANÇAMENTOS REALIZADOS", "LANÇAMENTOS"];
    const startIdx = anchors
      .map((a) => normalized.toUpperCase().indexOf(a))
      .find((idx) => idx !== -1);

    if (startIdx === undefined) {
      throw new Error("Seção de lançamentos não encontrada (Safra 2)");
    }

    const movementsText = normalized.substring(startIdx);

    // Estratégia robusta (igual Safra atual): capturar blocos por data DD/MM e pegar o último valor monetário do bloco
    const dateMatches = [...movementsText.matchAll(/(\d{2}\/\d{2})/g)].filter(
      (m) => isValidDayMonth(m[1])
    );

    const rows: TransactionRow[] = [];

    for (let i = 0; i < dateMatches.length; i++) {
      const current = dateMatches[i];
      const dateStr = current[1];
      const chunkStart = current.index ?? 0;
      const next = dateMatches[i + 1];
      const chunkEnd = next?.index ?? movementsText.length;
      const chunk = movementsText.substring(chunkStart, chunkEnd).trim();

      const upper = chunk.toUpperCase();
      if (upper.includes("DATA") && upper.includes("VALOR")) continue;
      if (SKIP_KEYWORDS.some((k) => upper.includes(k))) continue;

      // Último valor monetário pt-BR no bloco. Aceita: -R$1.234,56 | -1.234,56 | 1.234,56
      const values = [...chunk.matchAll(/(-?)(?:R\$)?\s*([\d.]+,\d{2})/g)];
      if (values.length === 0) continue;

      const last = values[values.length - 1];
      const sign = last[1] === "-" ? -1 : 1;
      const amountStr = last[2];
      const cleanAmount = amountStr.replace(/\./g, "").replace(",", ".");
      const amount = parseFloat(cleanAmount) * sign;
      if (Number.isNaN(amount)) continue;

      // descrição = tudo entre data e o último valor
      const descStart = chunk.indexOf(dateStr) + dateStr.length;
      const amountIndex = chunk.lastIndexOf(amountStr);
      const description = chunk.substring(descStart, amountIndex).trim();
      if (!description) continue;

      // Ignorar linhas de saldo que passaram
      const descUpper = description.toUpperCase();
      if (descUpper.includes("SALDO TOTAL") || descUpper.includes("SALDO APLIC") || descUpper.includes("SALDO CONTA")) {
        continue;
      }

      const [day, month] = dateStr.split("/").map(Number);
      let year = startYear;
      if (startYear !== endYear && month < startMonth) {
        year = endYear;
      }

      rows.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        description,
        amount,
      });
    }

    return rows.map((r) => ({
      date: r.date,
      description: r.description,
      value: Math.abs(r.amount),
      balance: 0,
      type: r.amount < 0 ? "debit" : "credit",
      document: "",
    }));
  },

  getOFXTransactionType(description: string): string {
    // Reutiliza as mesmas regras do Safra atual
    const descUpper = description.toUpperCase();

    if (descUpper.includes("PIX ENVIADO") || descUpper.includes("PIX QR")) return "XFER";
    if (descUpper.includes("PIX RECEBIDO")) return "DEP";
    if (descUpper.includes("PAGAMENTO") || descUpper.includes("TAR ") || descUpper.includes("TARIFA")) return "PAYMENT";
    if (descUpper.includes("APLICACAO") || descUpper.includes("RESGATE")) return "XFER";
    if (descUpper.includes("CREDITO COBRANCA") || descUpper.includes("LIBERACAO")) return "CREDIT";
    if (descUpper.includes("LIQUIDACAO")) return "DEBIT";

    return "OTHER";
  },
};
