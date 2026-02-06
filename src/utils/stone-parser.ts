import { ParsedTransaction } from "@/types/bank-layout";
import * as pdfjsLib from "pdfjs-dist";

export const stoneParser = {
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

    // Normalize text - remove extra spaces around operators
    const normalizedText = fullText
      .replace(/\s+/g, " ")
      .replace(/\s*\/\s*/g, "/")
      .replace(/R\s*\$\s*/g, "R$")
      .replace(/-\s*R\$/g, "-R$");

    console.log("Stone - Normalized text sample:", normalizedText.substring(0, 2000));

    const transactions: ParsedTransaction[] = [];
    
    // Stone format: DD/MM/YY Entrada/Saída Descrição Valor Saldo Contraparte
    // Example: 31/10/25 Saída Investimento - R$ 166,00 R$ 0,50
    // Example: 31/10/25 Entrada Recebimento vendas R$ 7,90 R$ 166,50 Maestro | Débito
    
    // Pattern to match Stone transactions
    const transactionPattern = /(\d{2}\/\d{2}\/\d{2})\s+(Entrada|Saída)\s+(.+?)\s+(-?R?\$?\s*[\d.,]+)\s+R\$([\d.,]+)/gi;
    
    let match;
    while ((match = transactionPattern.exec(normalizedText)) !== null) {
      const [, dateStr, tipo, descricao, valorStr, saldoStr] = match;
      
      // Validate date
      const [day, month] = dateStr.split("/").map(Number);
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        continue;
      }

      // Parse value - remove R$, spaces, handle negative
      let cleanValue = valorStr.replace(/R\$\s*/g, "").replace(/\s/g, "").trim();
      const isNegative = cleanValue.startsWith("-") || tipo === "Saída";
      cleanValue = cleanValue.replace("-", "");
      
      // Convert from pt-BR format (1.234,56) to number
      const value = parseFloat(cleanValue.replace(/\./g, "").replace(",", "."));
      if (isNaN(value)) continue;

      // Parse balance
      const balance = parseFloat(saldoStr.replace(/\./g, "").replace(",", "."));

      // Clean description - remove trailing value patterns
      let cleanDescription = descricao.trim();
      
      // Determine transaction type based on Entrada/Saída
      const transactionType: "credit" | "debit" = tipo === "Entrada" ? "credit" : "debit";

      // Format date to YYYY-MM-DD (assuming 2025 for 25)
      const [d, m, y] = dateStr.split("/");
      const fullYear = parseInt(y) < 50 ? `20${y}` : `19${y}`;
      const formattedDate = `${fullYear}-${m.padStart(2, "0")}-${d.padStart(2, "0")}`;

      transactions.push({
        date: formattedDate,
        description: cleanDescription,
        value: isNegative ? -Math.abs(value) : Math.abs(value),
        balance: isNaN(balance) ? 0 : balance,
        type: transactionType,
      });
    }

    console.log(`Stone parser extracted ${transactions.length} transactions`);

    // Sort by date descending (most recent first, as in the PDF)
    transactions.sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());

    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const upperDesc = description.toUpperCase();
    
    if (upperDesc.includes("PIX") || upperDesc.includes("TRANSFERÊNCIA")) {
      return "XFER";
    }
    if (upperDesc.includes("RECEBIMENTO") || upperDesc.includes("VENDAS")) {
      return "PAYMENT";
    }
    if (upperDesc.includes("INVESTIMENTO")) {
      return "OTHER";
    }
    if (upperDesc.includes("TARIFA") || upperDesc.includes("TAXA")) {
      return "SRVCHG";
    }
    
    return "OTHER";
  },
};
