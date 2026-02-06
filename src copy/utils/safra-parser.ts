import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

interface SafraTransaction {
  date: string;
  lancamento: string;
  complemento: string;
  documento: string;
  amount: number;
}

const SKIP_KEYWORDS = [
  "SALDO TOTAL",
  "SALDO APLIC",
  "SALDO CONTA CORRENTE",
  "CENTRAL DE SUPORTE",
  "SAC E DEFICIENTES",
  "OUVIDORIA",
  "Página",
  "Banco Safra",
  "CNPJ: 58.160.789",
];

export const safraParser = {
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

    console.log("📄 SAFRA - Primeiras 500 caracteres do texto extraído:");
    console.log(fullText.substring(0, 500));

    // Extract period from header - more flexible regex
    const periodMatch = fullText.match(
      /Per[ií]odo\s+de\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i
    );
    if (!periodMatch) {
      console.error("❌ SAFRA - Período não encontrado no texto");
      console.log("Procurando por variações do padrão de período...");
      throw new Error("Período não encontrado no extrato Safra");
    }

    const startDate = periodMatch[1];
    const endDate = periodMatch[2];
    const startYear = parseInt(startDate.split("/")[2]);
    const endYear = parseInt(endDate.split("/")[2]);
    const startMonth = parseInt(startDate.split("/")[1]);
    const endMonth = parseInt(endDate.split("/")[1]);

    console.log(`📅 Período: ${startDate} a ${endDate}`);

    // Find the movements section
    const movementsStart = fullText.indexOf("LANÇAMENTOS");
    if (movementsStart === -1) {
      throw new Error("Seção LANÇAMENTOS REALIZADOS não encontrada");
    }

    const movementsText = fullText.substring(movementsStart);
    console.log("✅ Encontrou seção de lançamentos");
    console.log("📝 Primeiros 300 caracteres da seção:");
    console.log(movementsText.substring(0, 300));

    // Find all transaction patterns: DD/MM followed by description and value
    // Strategy: Find all valid dates, then extract everything between date and next date or end
    const allDates = [...movementsText.matchAll(/(\d{2}\/\d{2})/g)].filter(match => {
      const [day, month] = match[1].split("/").map(Number);
      // Only valid dates (day 1-31, month 1-12)
      return day >= 1 && day <= 31 && month >= 1 && month <= 12;
    });
    
    console.log(`📍 Total de datas válidas encontradas: ${allDates.length}`);

    const transactions: SafraTransaction[] = [];

    for (let i = 0; i < allDates.length; i++) {
      const currentMatch = allDates[i];
      const dateStr = currentMatch[1];
      const startPos = currentMatch.index!;
      
      // Find the end position (next date or end of text)
      const nextMatch = allDates[i + 1];
      const endPos = nextMatch ? nextMatch.index! : movementsText.length;
      
      // Extract the chunk between this date and next date
      const chunk = movementsText.substring(startPos, endPos).trim();
      
      // Skip if it's a header line
      if (chunk.includes("Data") || chunk.includes("Lançamento") || chunk.includes("Valor (R$)")) {
        continue;
      }

      // Extract value: find last monetary value in format -1.234,56 or 1.234,56 (pt-BR)
      // Look for values with comma as decimal separator (pt-BR format)
      const allValues = [...chunk.matchAll(/([-]?[\d.]+,\d{2})/g)];
      if (allValues.length === 0) {
        continue;
      }

      // Get the last valid monetary value found
      const amountStr = allValues[allValues.length - 1][1];
      
      // Extract description (everything between date and value)
      const descStart = chunk.indexOf(dateStr) + dateStr.length;
      const descEnd = chunk.lastIndexOf(amountStr);
      const fullDescription = chunk.substring(descStart, descEnd).trim();

      // Skip SALDO lines (they're not actual transactions)
      if (fullDescription.includes("SALDO TOTAL") || 
          fullDescription.includes("SALDO APLIC") || 
          fullDescription.includes("SALDO CONTA")) {
        continue;
      }

      // Parse date
      const [day, month] = dateStr.split("/").map(Number);
      let year = startYear;

      // Handle year transitions
      if (startYear !== endYear) {
        if (month < startMonth) {
          year = endYear;
        }
      }

      // Parse amount (pt-BR format: 1.234,56)
      const cleanAmount = amountStr.replace(/\./g, "").replace(",", ".");
      const amount = parseFloat(cleanAmount);

      if (isNaN(amount)) {
        console.warn(`⚠️ Valor inválido: ${amountStr}`);
        continue;
      }

      console.log(`✅ ${dateStr} | ${fullDescription.substring(0, 60)} | ${amountStr}`);

      transactions.push({
        date: `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`,
        lancamento: fullDescription,
        complemento: "",
        documento: "",
        amount,
      });
    }

    console.log(`✅ Total de transações extraídas: ${transactions.length}`);

    // Convert to ParsedTransaction format
    const parsedTransactions: ParsedTransaction[] = transactions.map((t) => {
      const description = [t.lancamento, t.complemento, t.documento]
        .filter(Boolean)
        .join(" | ");

      return {
        date: t.date,
        description,
        value: Math.abs(t.amount),
        balance: 0, // Will be calculated later
        type: t.amount < 0 ? "debit" : "credit",
        document: t.documento,
      };
    });

    return parsedTransactions;
  },

  getOFXTransactionType(description: string): string {
    const descUpper = description.toUpperCase();

    if (descUpper.includes("PIX ENVIADO") || descUpper.includes("PIX QR")) {
      return "XFER";
    }
    if (descUpper.includes("PIX RECEBIDO")) {
      return "DEP";
    }
    if (
      descUpper.includes("PAGAMENTO") ||
      descUpper.includes("TAR ") ||
      descUpper.includes("TARIFA")
    ) {
      return "PAYMENT";
    }
    if (descUpper.includes("APLICACAO") || descUpper.includes("RESGATE")) {
      return "XFER";
    }
    if (
      descUpper.includes("CREDITO COBRANCA") ||
      descUpper.includes("LIBERACAO")
    ) {
      return "CREDIT";
    }
    if (descUpper.includes("LIQUIDACAO")) {
      return "DEBIT";
    }

    return "OTHER";
  },
};
