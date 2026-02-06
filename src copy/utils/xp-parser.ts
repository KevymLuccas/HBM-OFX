import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export const xpParser = {
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
      fullText += pageText + "\n";
    }

    // Normalize text
    let normalizedText = fullText
      .replace(/\s*\/\s*/g, "/")
      .replace(/\s*,\s*/g, ",")
      .replace(/\s*:\s*/g, ":")
      .replace(/R\s*\$\s*/g, "R$")            // "R $ " or "R$ " -> "R$"
      .replace(/(\d)\s+\.\s+(\d)/g, "$1.$2")
      .replace(/(\d)\s*\.\s*(\d)/g, "$1.$2")
      .replace(/-\s*R\$/g, "-R$")             // "- R$" -> "-R$"
      .replace(/\s+/g, " ");

    // Find where transactions start
    const transactionStart = normalizedText.indexOf("Liq Mov Histórico Valor Saldo");
    if (transactionStart !== -1) {
      normalizedText = normalizedText.substring(transactionStart);
    }

    console.log("📄 XP - Texto após cabeçalho (primeiros 600 chars):");
    console.log(normalizedText.substring(0, 600));

    const transactions: ParsedTransaction[] = [];

    // Pattern: DD/MM/YYYY DD/MM/YYYY DESCRIPTION -R$VALUE R$BALANCE
    // Value can be negative (-R$) or positive (R$)
    const transactionPattern = /(\d{2}\/\d{2}\/\d{4})\s+\d{2}\/\d{2}\/\d{4}\s+(.+?)\s+(-)?R\$([\d.,]+)\s+R\$([\d.,]+)/g;

    let match;
    while ((match = transactionPattern.exec(normalizedText)) !== null) {
      const dateStr = match[1];
      let description = match[2].trim();
      const isNegative = match[3] === "-";
      const valueStr = match[4];

      description = description.replace(/\s*-\s*$/, "").trim();

      const [day, month, yearStr] = dateStr.split("/");
      const isoDate = `${yearStr}-${month}-${day}`;

      const cleanValue = valueStr.replace(/\./g, "").replace(",", ".");
      const value = parseFloat(cleanValue);

      if (isNaN(value)) continue;

      const type: "credit" | "debit" = isNegative ? "debit" : "credit";

      console.log(`✅ ${isoDate} | ${description.substring(0, 50)}... | ${isNegative ? "-" : ""}R$${valueStr} | ${type}`);

      transactions.push({
        date: isoDate,
        description,
        value,
        balance: 0,
        type,
      });
    }

    // Calculate running balance
    let balance = 0;
    for (const t of transactions) {
      const signedValue = t.type === "debit" ? -t.value : t.value;
      balance += signedValue;
      t.balance = balance;
    }

    console.log(`✅ XP - Total de transações extraídas: ${transactions.length}`);

    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const descUpper = description.toUpperCase();

    if (descUpper.includes("TED") && descUpper.includes("RETIRADA")) {
      return "XFER";
    }
    if (descUpper.includes("RECEBIMENTO DE TED") || descUpper.includes("RECEBIMENTO TED")) {
      return "DEP";
    }
    if (descUpper.includes("RESGATE")) {
      return "XFER";
    }
    if (descUpper.includes("APLICAÇÃO") || descUpper.includes("APLICACAO")) {
      return "XFER";
    }
    if (descUpper.includes("IRRF") || descUpper.includes("IOF")) {
      return "FEE";
    }
    if (descUpper.includes("RECOMPRA") || descUpper.includes("COMPROMISSADA")) {
      return "XFER";
    }

    return "OTHER";
  },
};
