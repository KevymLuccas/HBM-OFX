import { ParsedTransaction } from "@/types/bank-layout";

export class Sicredi2Parser {
  /**
   * Parse PDF text content extracted from Sicredi bank statement (Layout 2)
   * This layout has tabular format with columns: Data, Descrição, Documento, Valor (R$), Saldo (R$)
   * @param pdfText - Raw text content from PDF
   * @returns Array of parsed transactions
   */
  parsePDFText(pdfText: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    
    console.log("🏦 Parsing Sicredi 2 bank statement...");
    
    // Extract period for year hint
    const periodMatch = pdfText.match(/período\s+(\d{2}\/\d{2}\/\d{4})\s+a\s+(\d{2}\/\d{2}\/\d{4})/i);
    if (periodMatch) {
      console.log(`📅 Period: ${periodMatch[1]} to ${periodMatch[2]}`);
    }

    // Find where transactions start - after "SALDO" line
    const saldoMatch = pdfText.match(/SALDO\s+[\d.,]+\s+/);
    const startIndex = saldoMatch ? pdfText.indexOf(saldoMatch[0]) + saldoMatch[0].length : 0;
    const transactionText = pdfText.substring(startIndex);
    
    console.log("📝 Trying full text regex approach...");
    
    // Universal transaction regex - captures date, then everything until value pattern
    // Pattern 1: Date + Description + Document(optional) + Value + Balance
    // Value format: [-]X.XXX,XX or [-]XXX,XX
    
    // Split into potential transaction chunks starting with dates
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
    const dateMatches = [...transactionText.matchAll(datePattern)];
    
    for (let i = 0; i < dateMatches.length; i++) {
      const currentMatch = dateMatches[i];
      const nextMatch = dateMatches[i + 1];
      
      const startPos = currentMatch.index!;
      const endPos = nextMatch ? nextMatch.index! : transactionText.length;
      
      const chunk = transactionText.substring(startPos, endPos).trim();
      
      // Extract components from chunk
      // Format: DD/MM/YYYY Description [Document] Value Balance
      // Values are at the end, looking for patterns like: 289,50 362.391,49 or -16.694,92 348.173,47
      
      const dateStr = currentMatch[1];
      
      // Find all monetary values in the chunk (format: [-]X.XXX,XX or [-]XXX,XX)
      const valuePattern = /([-]?\d{1,3}(?:\.\d{3})*,\d{2})/g;
      const values = [...chunk.matchAll(valuePattern)].map(m => m[1]);
      
      if (values.length < 2) continue; // Need at least value and balance
      
      // Last two values are Value and Balance
      const balanceStr = values[values.length - 1];
      const amountStr = values[values.length - 2];
      
      // Extract description - everything between date and the amount value
      const amountIndex = chunk.lastIndexOf(amountStr);
      let descriptionPart = chunk.substring(11, amountIndex).trim(); // 11 = "DD/MM/YYYY ".length
      
      // Check for document code at the end of description
      // Common patterns: PIX_CRED, PIX_DEB, COB000005, 755316119, 6JRX---04
      let document = "";
      const docPatterns = [
        /\s+(PIX_(?:CRED|DEB))\s*$/,
        /\s+(SICREDI_(?:CRED|DEB))\s*$/,
        /\s+(COB\d+)\s*$/,
        /\s+(\d{6,})\s*$/,
        /\s+([A-Z0-9]{4,}---\d+)\s*$/
      ];
      
      for (const pattern of docPatterns) {
        const docMatch = descriptionPart.match(pattern);
        if (docMatch) {
          document = docMatch[1];
          descriptionPart = descriptionPart.replace(pattern, '').trim();
          break;
        }
      }
      
      // Clean description - remove extra spaces, normalize pipes
      let description = descriptionPart
        .replace(/\s+/g, ' ')
        .replace(/\s*\|\s*/g, ' | ')
        .trim();
      
      // Skip if description is empty or looks like header
      if (!description || 
          description.toLowerCase().includes('saldo') && !description.toLowerCase().includes('sicredi')) {
        continue;
      }
      
      // Parse date (DD/MM/YYYY format)
      const [day, month, yearStr] = dateStr.split('/');
      const date = `${yearStr}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      // Parse amount - negative values indicate debit
      const isNegative = amountStr.startsWith('-');
      const cleanAmount = amountStr.replace('-', '').replace(/\./g, '').replace(',', '.');
      const value = parseFloat(cleanAmount);
      const type = isNegative ? "debit" : "credit";

      // Parse balance
      const cleanBalance = balanceStr.replace('-', '').replace(/\./g, '').replace(',', '.');
      const balance = parseFloat(cleanBalance);

      transactions.push({
        date,
        description: description.substring(0, 150),
        value,
        balance,
        type,
        document: document || undefined,
      });
    }

    // Sort transactions chronologically
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`✅ Parsed ${transactions.length} Sicredi 2 transactions`);
    
    return transactions;
  }

  /**
   * Get transaction type mapping for OFX generation
   * @param description - Transaction description
   * @returns OFX transaction type
   */
  getOFXTransactionType(description: string): string {
    const upperDesc = description.toUpperCase();
    
    if (upperDesc.includes("PIX")) return "PIX";
    if (upperDesc.includes("TED")) return "XFER";
    if (upperDesc.includes("BOLETO") || upperDesc.includes("LIQUIDACAO")) return "PAYMENT";
    if (upperDesc.includes("TARIFA")) return "FEE";
    if (upperDesc.includes("COBRANCA") || upperDesc.includes("LIQ.COBRANCA")) return "DEP";
    if (upperDesc.includes("CREDITO") || upperDesc.includes("SICREDI CREDITO")) return "POS";
    if (upperDesc.includes("DEBITO") || upperDesc.includes("SICREDI DEBITO")) return "POS";
    if (upperDesc.includes("FOLHA") || upperDesc.includes("PAGTO")) return "PAYMENT";
    if (upperDesc.includes("SAQUE")) return "ATM";
    if (upperDesc.includes("IOF")) return "FEE";
    
    return "OTHER";
  }

  /**
   * Validate if the PDF text matches Sicredi Layout 2 format
   * @param pdfText - Raw text content from PDF
   * @returns boolean indicating if it's a valid Sicredi 2 statement
   */
  validateFormat(pdfText: string): boolean {
    const hasInternetBanking = pdfText.includes("Internet Banking Sicredi");
    const hasPeriodPattern = /período\s+\d{2}\/\d{2}\/\d{4}\s+a\s+\d{2}\/\d{2}\/\d{4}/i.test(pdfText);
    const hasTableHeader = pdfText.includes("Valor (R$)") || pdfText.includes("Saldo (R$)");
    const hasFullDateFormat = /\d{2}\/\d{2}\/\d{4}/.test(pdfText);
    
    return hasInternetBanking && hasPeriodPattern && hasTableHeader && hasFullDateFormat;
  }
}

export const sicredi2Parser = new Sicredi2Parser();
