import { ParsedTransaction } from "@/types/bank-layout";
import sicrediLayout from "@/config/banks/sicredi.json";

interface SicrediLayout {
  version: string;
  name: string;
  description: string;
  locale: string;
  encoding: string;
  header: {
    patterns: {
      [key: string]: {
        regex: string;
        groups: { [key: string]: number };
      };
    };
  };
  section_movements: {
    starts_after: string;
    previous_balance_regex: string;
    transaction_regex: string;
    groups: {
      date: number;
      description: number;
      document: number;
      amount: number;
      balance: number;
    };
    date: {
      format_in: string;
    };
    amount: {
      locale: string;
      negative_sign: string;
    };
  };
  mapping: {
    trntype: {
      rules: Array<{
        contains?: string[];
        ofx: string;
      }>;
    };
  };
}

export class SicrediParser {
  private layout: SicrediLayout;

  constructor() {
    this.layout = sicrediLayout as SicrediLayout;
  }

  /**
   * Parse PDF text content extracted from Sicredi bank statement
   * @param pdfText - Raw text content from PDF
   * @returns Array of parsed transactions
   */
  parsePDFText(pdfText: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    
    console.log("🏦 Parsing Sicredi bank statement...");
    
    // Extract header information (period for year hint)
    const periodMatch = pdfText.match(new RegExp(this.layout.header.patterns.period.regex));
    let startDate: Date | null = null;
    let endDate: Date | null = null;
    
    if (periodMatch) {
      const startDateStr = periodMatch[this.layout.header.patterns.period.groups.start];
      const endDateStr = periodMatch[this.layout.header.patterns.period.groups.end];
      
      const [startDay, startMonth, startYear] = startDateStr.split('/');
      const [endDay, endMonth, endYear] = endDateStr.split('/');
      
      startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
      endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));
      
      console.log(`📅 Period: ${startDateStr} to ${endDateStr}`);
    } else {
      console.warn("⚠️ Period not found in PDF");
      return transactions;
    }

    // Find the movements section
    const movementsStartIndex = pdfText.indexOf(this.layout.section_movements.starts_after);
    if (movementsStartIndex === -1) {
      console.warn("Movements section not found in PDF");
      return transactions;
    }

    const movementsText = pdfText.substring(movementsStartIndex);
    
    // Parse transactions using the transaction regex
    const transactionRegex = new RegExp(this.layout.section_movements.transaction_regex, 'gm');
    let match;

    while ((match = transactionRegex.exec(movementsText)) !== null) {
      const dateStr = match[this.layout.section_movements.groups.date];
      const description = match[this.layout.section_movements.groups.description].trim();
      const document = match[this.layout.section_movements.groups.document].trim();
      const amountStr = match[this.layout.section_movements.groups.amount];
      const balanceStr = match[this.layout.section_movements.groups.balance];

      // Skip "SALDO ANTERIOR" line
      if (description.includes("SALDO ANTERIOR")) {
        continue;
      }

      // Parse date
      const [day, month, year] = dateStr.split('/');
      const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;

      // Parse amount (handle negative sign)
      const amount = parseFloat(amountStr.replace(/\./g, '').replace(',', '.'));
      const isNegative = amountStr.includes('-');
      const value = Math.abs(amount);
      const type = isNegative ? "debit" : "credit";

      // Parse balance
      const balance = parseFloat(balanceStr.replace(/\./g, '').replace(',', '.'));

      console.log(`🔍 Transaction: ${date} - ${description} - ${value.toFixed(2)} (${type}) -> Balance: ${balance.toFixed(2)}`);

      transactions.push({
        date,
        description: description.substring(0, 100),
        value,
        balance,
        type,
        document: document || undefined,
      });
    }

    // Sort transactions chronologically
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    console.log(`✅ Parsed ${transactions.length} Sicredi transactions`);
    
    return transactions;
  }

  /**
   * Get transaction type mapping for OFX generation
   * @param description - Transaction description
   * @returns OFX transaction type
   */
  getOFXTransactionType(description: string): string {
    const upperDesc = description.toUpperCase();
    
    for (const rule of this.layout.mapping.trntype.rules) {
      if (rule.contains) {
        const matches = rule.contains.some(keyword => 
          upperDesc.includes(keyword.toUpperCase())
        );
        if (matches) return rule.ofx;
      }
    }
    
    return "OTHER";
  }

  /**
   * Validate if the PDF text matches Sicredi bank format
   * @param pdfText - Raw text content from PDF
   * @returns boolean indicating if it's a valid Sicredi statement
   */
  validateFormat(pdfText: string): boolean {
    const hasPeriodPattern = new RegExp(this.layout.header.patterns.period.regex).test(pdfText);
    const hasCooperativePattern = new RegExp(this.layout.header.patterns.cooperative.regex).test(pdfText);
    const hasMovementsSection = pdfText.includes(this.layout.section_movements.starts_after);
    const hasSicrediName = pdfText.includes("Sicredi");
    
    return hasPeriodPattern && (hasCooperativePattern || hasMovementsSection || hasSicrediName);
  }
}

export const sicrediParser = new SicrediParser();
