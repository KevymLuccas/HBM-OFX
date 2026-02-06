import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export const btgParser = {
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

    console.log("📄 BTG - Texto bruto (primeiros 2000 caracteres):");
    console.log(fullText.substring(0, 2000));

    // Normalize text - fix spacing issues from PDF extraction
    // The PDF adds spaces within dates and numbers like "0 1/1 0/2 5" and "6.3 4 3,4 7"
    fullText = fullText
      .replace(/\s+/g, " ")
      // Fix dates: "0 1/1 0/2 5" -> "01/10/25"
      .replace(/(\d)\s+(\d)/g, "$1$2")
      .replace(/(\d)\s+(\d)/g, "$1$2") // Run twice for consecutive spaces
      .replace(/(\d)\s*\/\s*(\d)/g, "$1/$2")
      // Fix decimal: ", 4 7" -> ",47"
      .replace(/,\s*(\d)\s*(\d)/g, ",$1$2")
      // Fix thousand separator with spaces
      .replace(/(\d)\.\s*(\d)\s*(\d)\s*(\d)/g, "$1.$2$3$4")
      // Fix negative: "- 1 3 4" -> "-134"
      .replace(/-\s+(\d)/g, "-$1");

    console.log("📄 BTG - Texto normalizado (primeiros 2000 caracteres):");
    console.log(fullText.substring(0, 2000));

    const transactions: ParsedTransaction[] = [];

    // Pattern 1: Date + Value + Balance (most common in BTG)
    // Format: 01/10/25 8.262,00 14.605,47
    // Or with negative: 02/10/25 -134,97 16.609,00
    const linePattern = /(\d{2}\/\d{2}\/\d{2})\s+(-?[\d.]+,\d{2})\s+([\d.]+,\d{2})/g;

    let match;
    const seenEntries = new Set<string>();

    while ((match = linePattern.exec(fullText)) !== null) {
      const dateStr = match[1];
      const valueStr = match[2];
      const balanceStr = match[3];

      // Skip duplicate entries and header/footer patterns
      const entryKey = `${dateStr}-${valueStr}-${balanceStr}`;
      if (seenEntries.has(entryKey)) continue;
      seenEntries.add(entryKey);

      // Parse date (DD/MM/YY -> YYYY-MM-DD)
      const [day, month, yearShort] = dateStr.split("/").map(Number);
      const year = yearShort < 50 ? 2000 + yearShort : 1900 + yearShort;
      const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Parse value (Brazilian format: 1.234,56)
      const isDebit = valueStr.startsWith("-");
      const cleanValue = valueStr
        .replace(/^-/, "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();

      const value = parseFloat(cleanValue);

      // Parse balance
      const cleanBalance = balanceStr
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();
      const balance = parseFloat(cleanBalance);

      // Skip if value is 0 or very small (likely header rows)
      if (isNaN(value) || value < 0.01) continue;

      // Skip "Saldo Anterior" entries (first balance entry with no movement)
      // These typically appear as standalone balance without a real transaction
      
      // Generate description based on transaction type
      const description = isDebit ? "Débito BTG" : "Crédito BTG";

      console.log(`✅ ${isoDate} | ${description} | ${value} | ${isDebit ? "D" : "C"} | Saldo: ${balance}`);

      transactions.push({
        date: isoDate,
        description,
        value,
        balance,
        type: isDebit ? "debit" : "credit",
      });
    }

    console.log(`✅ BTG - Total de transações: ${transactions.length}`);

    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const descUpper = description.toUpperCase();

    if (descUpper.includes("PIX")) return "XFER";
    if (descUpper.includes("TED") || descUpper.includes("TRANSFERENCIA")) return "XFER";
    if (descUpper.includes("LIQ BOLSA")) return "XFER";
    if (descUpper.includes("AJ POS") || descUpper.includes("AJ NEG")) return "OTHER";
    if (descUpper.includes("PAGAMENTO") || descUpper.includes("DARF")) return "PAYMENT";
    if (descUpper.includes("TARIFA")) return "FEE";
    if (descUpper.includes("DEPOSITO")) return "DEP";
    if (descUpper.includes("SAQUE")) return "ATM";
    if (descUpper.includes("RENDIMENTO")) return "INT";
    if (descUpper.includes("DÉBITO")) return "DEBIT";
    if (descUpper.includes("CRÉDITO")) return "CREDIT";

    return "OTHER";
  },
};
