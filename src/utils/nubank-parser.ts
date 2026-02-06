import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const MONTH_MAP: Record<string, string> = {
  JAN: "01",
  FEV: "02",
  MAR: "03",
  ABR: "04",
  MAI: "05",
  JUN: "06",
  JUL: "07",
  AGO: "08",
  SET: "09",
  OUT: "10",
  NOV: "11",
  DEZ: "12",
};

const normalizePdfText = (input: string) => {
  return input
    .replace(/\s+/g, " ")
    .replace(/\s*\/\s*/g, "/")
    .replace(/R\s*\$\s*/g, "R$")
    .replace(/\s*:\s*/g, ":")
    .trim();
};

export const nubankParser = {
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

    console.log("📄 Nubank - Texto normalizado (primeiros 2000 chars):");
    console.log(normalized.substring(0, 2000));

    const transactions: ParsedTransaction[] = [];

    // Pattern for date headers: "DD MMM YYYY"
    const datePattern = /\b(\d{2})\s+(JAN|FEV|MAR|ABR|MAI|JUN|JUL|AGO|SET|OUT|NOV|DEZ)\s+(\d{4})\b/gi;
    const dateMatches = [...normalized.matchAll(datePattern)];
    
    console.log(`📅 Nubank - Encontradas ${dateMatches.length} datas de movimentação`);

    for (let i = 0; i < dateMatches.length; i++) {
      const match = dateMatches[i];
      const day = match[1];
      const month = MONTH_MAP[match[2].toUpperCase()];
      const year = match[3];
      const isoDate = `${year}-${month}-${day}`;

      const chunkStart = match.index ?? 0;
      const next = dateMatches[i + 1];
      const chunkEnd = next?.index ?? normalized.length;
      const chunk = normalized.substring(chunkStart, chunkEnd);

      console.log(`\n📆 Processando data: ${isoDate}`);

      // Strategy: Parse the chunk looking for transaction patterns
      // Structure: "Total de entradas + X" followed by credit items
      //            "Total de saídas - X" followed by debit items
      //            Each item ends with a value like "980,00"

      // Split by key markers to identify sections
      let currentType: "credit" | "debit" | null = null;
      
      // Find positions of markers
      const entradaMatch = chunk.match(/Total de entradas\s*\+\s*([\d.,]+)/i);
      const saidaMatch = chunk.match(/Total de saídas\s*-\s*([\d.,]+)/i);
      const saldoMatch = chunk.match(/Saldo do dia\s*([\d.,]+)/i);

      const entradaPos = entradaMatch ? chunk.indexOf(entradaMatch[0]) : -1;
      const saidaPos = saidaMatch ? chunk.indexOf(saidaMatch[0]) : -1;
      const saldoPos = saldoMatch ? chunk.indexOf(saldoMatch[0]) : Infinity;

      // Extract transactions from each section
      // Section after "Total de entradas" until "Total de saídas" or "Saldo do dia" = credits
      if (entradaPos !== -1) {
        const sectionEnd = saidaPos !== -1 ? saidaPos : saldoPos;
        const creditSection = chunk.substring(entradaPos + (entradaMatch?.[0].length || 0), sectionEnd);
        const creditTxns = this.extractTransactionsFromSection(creditSection, isoDate, "credit");
        transactions.push(...creditTxns);
        console.log(`   ➕ Entradas encontradas: ${creditTxns.length}`);
      }

      // Section after "Total de saídas" until "Saldo do dia" = debits
      if (saidaPos !== -1) {
        const sectionEnd = saldoPos;
        const debitSection = chunk.substring(saidaPos + (saidaMatch?.[0].length || 0), sectionEnd);
        const debitTxns = this.extractTransactionsFromSection(debitSection, isoDate, "debit");
        transactions.push(...debitTxns);
        console.log(`   ➖ Saídas encontradas: ${debitTxns.length}`);
      }

      // If only one type exists and no clear marker
      if (entradaPos === -1 && saidaPos === -1) {
        // Try to infer from content
        const section = chunk.substring(chunk.indexOf(year) + 4, saldoPos !== Infinity ? saldoPos : undefined);
        const inferred = this.extractTransactionsInferred(section, isoDate);
        transactions.push(...inferred);
        console.log(`   🔍 Transações inferidas: ${inferred.length}`);
      }
    }

    // Keep all transactions - don't deduplicate as legitimate repeated transactions exist
    // (e.g., multiple "Tarifa Boleto de cobrança 1,65" on the same day)

    // Calculate running balance
    let balance = 0;
    for (const t of transactions) {
      const signedValue = t.type === "debit" ? -t.value : t.value;
      balance += signedValue;
      t.balance = balance;
    }

    console.log(`\n✅ Nubank - Total de transações: ${transactions.length}`);

    return transactions;
  },

  extractTransactionsFromSection(section: string, date: string, type: "credit" | "debit"): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    
    // Pattern: Description followed by value at end
    // Examples: 
    // "Pagamento Recebido Nelore Grill Churrascaria Ltda - 13.696.506/0001-29 240,00"
    // "Transferência enviada pelo Pix Henrique de Jesus Neves Lopes - •••.102.351-•• - PICPAY (0380) Agência:1 Conta:82392126-3 980,00"
    // "Tarifa Boleto de cobrança 1,65"
    
    // Split by values (number,decimal pattern at end of segments)
    const valuePattern = /\s([\d.]+,\d{2})(?=\s|$)/g;
    
    let lastEnd = 0;
    let valueMatch;
    
    while ((valueMatch = valuePattern.exec(section)) !== null) {
      const valueStr = valueMatch[1];
      const cleanValue = valueStr.replace(/\./g, "").replace(",", ".");
      const value = parseFloat(cleanValue);
      
      if (isNaN(value) || value === 0) continue;
      
      // Description is everything from lastEnd to before the value
      let description = section.substring(lastEnd, valueMatch.index).trim();
      
      // Clean up description
      description = description
        .replace(/^\s*[-|]\s*/, "")
        .replace(/\s+/g, " ")
        .trim();
      
      // Skip if description looks like a summary or is too short
      if (description.length < 3) continue;
      if (/^(total|saldo)/i.test(description)) continue;
      
      console.log(`      ✅ ${type === "debit" ? "-" : "+"}${valueStr} | ${description.substring(0, 60)}...`);
      
      transactions.push({
        date,
        description,
        value,
        balance: 0,
        type,
      });
      
      lastEnd = valueMatch.index + valueMatch[0].length;
    }
    
    return transactions;
  },

  extractTransactionsInferred(section: string, date: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    
    const valuePattern = /\s([\d.]+,\d{2})(?=\s|$)/g;
    
    let lastEnd = 0;
    let valueMatch;
    
    while ((valueMatch = valuePattern.exec(section)) !== null) {
      const valueStr = valueMatch[1];
      const cleanValue = valueStr.replace(/\./g, "").replace(",", ".");
      const value = parseFloat(cleanValue);
      
      if (isNaN(value) || value === 0) continue;
      
      let description = section.substring(lastEnd, valueMatch.index).trim();
      description = description.replace(/^\s*[-|]\s*/, "").replace(/\s+/g, " ").trim();
      
      if (description.length < 3) continue;
      if (/^(total|saldo)/i.test(description)) continue;
      
      // Infer type from description
      const descUpper = description.toUpperCase();
      let type: "credit" | "debit";
      
      if (
        descUpper.includes("RECEBIDO") ||
        descUpper.includes("ENTRADA") ||
        descUpper.includes("CRÉDITO") ||
        descUpper.includes("ESTORNO") ||
        descUpper.includes("PAGAMENTO RECEBIDO")
      ) {
        type = "credit";
      } else {
        type = "debit";
      }
      
      console.log(`      🔍 ${type === "debit" ? "-" : "+"}${valueStr} | ${description.substring(0, 60)}...`);
      
      transactions.push({
        date,
        description,
        value,
        balance: 0,
        type,
      });
      
      lastEnd = valueMatch.index + valueMatch[0].length;
    }
    
    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const descUpper = description.toUpperCase();

    if (descUpper.includes("PIX") && (descUpper.includes("ENVIADO") || descUpper.includes("ENVIADA"))) {
      return "XFER";
    }
    if (descUpper.includes("PIX") && descUpper.includes("RECEBIDO")) {
      return "DEP";
    }
    if (descUpper.includes("TRANSFERÊNCIA") && descUpper.includes("ENVIADA")) {
      return "XFER";
    }
    if (descUpper.includes("PAGAMENTO RECEBIDO")) {
      return "DEP";
    }
    if (descUpper.includes("TED") || descUpper.includes("DOC")) {
      return "XFER";
    }
    if (descUpper.includes("TARIFA") || descUpper.includes("TAR ")) {
      return "FEE";
    }
    if (descUpper.includes("BOLETO")) {
      return "PAYMENT";
    }
    if (descUpper.includes("ESTORNO")) {
      return "CREDIT";
    }

    return "OTHER";
  },
};
