import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const SKIP_KEYWORDS = [
  "SALDO DO DIA CC",
  "SALDO ANTERIOR",
  "SALDO TOTAL",
  "SALDO FINAL",
  "CENTRAL DE ATENDIMENTO",
  "SAC",
  "OUVIDORIA",
  "0800",
  "4004",
  "INTERNET BANKING",
  "AGÊNCIA",
  "CONTA",
  "DATA HISTÓRICO VALOR",
];

export const santander3Parser = {
  async parse(file: File): Promise<ParsedTransaction[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join(" ");
      fullText += pageText + " ";
    }

    // Normalize text - remove extra spaces and fix R$ formatting
    fullText = fullText
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/-\s*R\s*\$\s*/g, "-R$")
      .replace(/R\s*\$\s*/g, "R$");

    console.log("📄 SANTANDER 3 - Texto extraído (primeiros 3000 caracteres):");
    console.log(fullText.substring(0, 3000));

    const transactions: ParsedTransaction[] = [];

    // Pattern: DD/MM/YYYY followed by description and value (R$ with optional negative)
    const linePattern = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?R\$[\d.,]+)/g;
    
    let match;
    while ((match = linePattern.exec(fullText)) !== null) {
      const dateStr = match[1];
      const description = match[2].trim();
      const valueStr = match[3];

      // Skip only "Saldo do dia Cc" lines
      const shouldSkip = description.toUpperCase().includes("SALDO DO DIA");
      if (shouldSkip) continue;

      // Parse date (DD/MM/YYYY)
      const [day, month, year] = dateStr.split("/").map(Number);
      const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Parse value
      const isDebit = valueStr.startsWith("-");
      const cleanValue = valueStr
        .replace(/^-/, "")
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();
      
      const value = parseFloat(cleanValue);

      if (!isNaN(value) && value > 0 && description.length > 2) {
        console.log(`✅ ${isoDate} | ${description.substring(0, 50)} | ${value} | ${isDebit ? "D" : "C"}`);
        
        transactions.push({
          date: isoDate,
          description,
          value,
          balance: 0,
          type: isDebit ? "debit" : "credit",
        });
      }
    }

    // Calculate running balance
    let balance = 0;
    for (const t of transactions) {
      const signedValue = t.type === "debit" ? -t.value : t.value;
      balance += signedValue;
      t.balance = Math.round(balance * 100) / 100;
    }

    console.log(`✅ SANTANDER 3 - Total de transações: ${transactions.length}`);

    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const descUpper = description.toUpperCase();

    if (descUpper.includes("PIX ENVIADO")) return "XFER";
    if (descUpper.includes("PIX RECEBIDO")) return "DEP";
    if (descUpper.includes("TED") || descUpper.includes("TRANSFERENCIA")) return "XFER";
    if (descUpper.includes("PAGAMENTO") || descUpper.includes("DARF")) return "PAYMENT";
    if (descUpper.includes("TARIFA")) return "FEE";
    if (descUpper.includes("RESGATE") || descUpper.includes("CONTAMAX")) return "XFER";
    if (descUpper.includes("DEPOSITO")) return "DEP";
    if (descUpper.includes("SAQUE")) return "ATM";

    return "OTHER";
  },
};
