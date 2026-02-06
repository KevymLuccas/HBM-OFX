import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export const pagseguroParser = {
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

    // Normalize text - remove extra spaces
    fullText = fullText
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/R\s*\$\s*/g, "R$")
      .replace(/-\s*R\$/g, "-R$");

    console.log("📄 PAGSEGURO - Primeiros 500 caracteres do texto extraído:");
    console.log(fullText.substring(0, 500));

    // Find the start of transaction table - after "Descrição Data Valor" or similar header
    const tableHeaderMatch = fullText.match(/Descri[çc][aã]o\s+Data\s+Valor/i);
    if (tableHeaderMatch && tableHeaderMatch.index !== undefined) {
      fullText = fullText.substring(tableHeaderMatch.index + tableHeaderMatch[0].length);
      console.log("✅ Encontrou cabeçalho da tabela, texto após:", fullText.substring(0, 200));
    }

    const transactions: ParsedTransaction[] = [];

    // Pattern: DD/MM/YYYY Description R$Value or -R$Value
    // PagSeguro format: "01/10/2025 Rendimento da conta - Rendimento líquido sobre dinheiro em conta R$ 1,13"
    const transactionRegex = /(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(-?R\$[\d.,]+)/g;

    let match;
    while ((match = transactionRegex.exec(fullText)) !== null) {
      const dateStr = match[1];
      const description = match[2].trim();
      const valueStr = match[3];

      // Skip "Saldo do dia" lines
      if (description.toLowerCase().includes("saldo do dia")) {
        console.log(`⏭️ Ignorando saldo: ${description}`);
        continue;
      }

      // Parse date
      const [day, month, year] = dateStr.split("/").map(Number);
      
      // Validate date
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        console.log(`❌ Data inválida: ${dateStr}`);
        continue;
      }

      const formattedDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;

      // Parse value - handle -R$ prefix for debits
      const isDebit = valueStr.startsWith("-");
      const cleanValue = valueStr
        .replace("-", "")
        .replace("R$", "")
        .replace(/\./g, "")
        .replace(",", ".")
        .trim();

      const value = parseFloat(cleanValue);

      if (isNaN(value)) {
        console.log(`❌ Valor inválido: ${valueStr}`);
        continue;
      }

      const finalValue = isDebit ? -value : value;

      console.log(`✅ ${dateStr} | ${description} | ${finalValue}`);

      transactions.push({
        date: formattedDate,
        description: description,
        value: finalValue,
        balance: 0,
        type: isDebit ? "debit" : "credit",
      });
    }

    // Sort by date
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Calculate running balance
    let runningBalance = 0;
    for (const transaction of transactions) {
      runningBalance += transaction.value;
      transaction.balance = Math.round(runningBalance * 100) / 100;
    }

    console.log(`✅ PAGSEGURO - Total de transações extraídas: ${transactions.length}`);

    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const desc = description.toUpperCase();

    if (desc.includes("PIX RECEBIDO")) return "XFER";
    if (desc.includes("PIX ENVIADO") || desc.includes("QR CODE PIX")) return "XFER";
    if (desc.includes("PAGAMENTO DE CONTA") || desc.includes("PAGAMENTO DE FATURA")) return "PAYMENT";
    if (desc.includes("RENDIMENTO")) return "INT";
    if (desc.includes("CARTÃO DE CRÉDITO")) return "PAYMENT";
    if (desc.includes("DARF")) return "PAYMENT";

    return "OTHER";
  },
};
