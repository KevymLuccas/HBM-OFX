import type { BankLayout, ParsedTransaction } from "@/types/bank-layout";
import itauLayout from "@/config/banks/itau.json";

export class ItauParser {
  private layout: BankLayout;

  constructor() {
    this.layout = itauLayout as BankLayout;
  }

  validateFormat(pdfText: string): boolean {
    console.log("📄 Validating Itaú format...");
    
    const normalizeText = (text: string) => {
      return text
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    const normalizedText = normalizeText(pdfText);

    const hasConta = normalizedText.includes("CONTA");
    const hasAgencia = normalizedText.includes("AGENCIA");
    const hasLancamentos = normalizedText.includes("LANCAMENTOS");
    const hasPeriodo = normalizedText.includes("PERIODO");
    const hasCNPJ = normalizedText.includes("CNPJ");
    const hasPIX = normalizedText.includes("PIX");
    const hasSaldo = normalizedText.includes("SALDO");

    console.log(`  Markers: CONTA=${hasConta}, AGENCIA=${hasAgencia}, LANCAMENTOS=${hasLancamentos}, PERIODO=${hasPeriodo}`);

    const markers = [hasConta, hasAgencia, hasLancamentos, hasPeriodo, hasCNPJ, hasPIX, hasSaldo].filter(m => m).length;
    const isValid = markers >= 4;

    if (isValid) {
      console.log(`✅ Valid Itaú format detected (${markers} markers found)`);
    } else {
      console.warn(`❌ Not a valid Itaú format (markers: ${markers})`);
    }

    return isValid;
  }

  parsePDFText(pdfText: string): ParsedTransaction[] {
    console.log("🏦 Parsing Itaú bank statement...");
    console.log("📄 PDF text length:", pdfText.length);

    const transactions: ParsedTransaction[] = [];
    
    // Remove "Lançamentos futuros" section and everything after
    let cleanText = pdfText;
    const futureIndex = pdfText.toLowerCase().indexOf('lançamentos futuros');
    if (futureIndex !== -1) {
      cleanText = pdfText.substring(0, futureIndex);
      console.log("📌 Removido seção de lançamentos futuros");
    }
    
    // Extract period to get the year
    const periodPattern = /(?:Lançamentos do período|período)[:\s]+(\d{2}\/\d{2}\/\d{4})\s+(?:até|a)\s+(\d{2}\/\d{2}\/\d{4})/i;
    const periodMatch = cleanText.match(periodPattern);
    
    let year = new Date().getFullYear().toString();
    if (periodMatch) {
      const startDate = periodMatch[1];
      const endDate = periodMatch[2];
      console.log(`📅 Período: ${startDate} até ${endDate}`);
      year = endDate.split('/')[2];
    }

    // Extract SALDO ANTERIOR
    let currentBalance = 0;
    const saldoAnteriorPattern = /SALDO\s+ANTERIOR\s+([-\d.,]+)/i;
    const saldoAnteriorMatch = cleanText.match(saldoAnteriorPattern);
    if (saldoAnteriorMatch) {
      currentBalance = this.parseValue(saldoAnteriorMatch[1]);
      console.log(`💰 Saldo Anterior: ${currentBalance}`);
    }

    // The PDF text appears to be continuous with transactions in format:
    // DD/MM/YYYY LANCAMENTO RAZAO_SOCIAL CPF/CNPJ VALOR SALDO
    // Example: "03/11/2025 PIX QR CODE RECEBIDO FRANCISCO I01/11 FRANCISCO IVAN SIQUEIRA FILHO 026.543.141-70 86,13"

    // Pattern to match transactions with full date (DD/MM/YYYY)
    const transactionPattern = /(\d{2}\/\d{2}\/\d{4})\s+([A-ZÁÉÍÓÚÂÊÎÔÛÃÕÇ][^\d]*?)\s+((?:\d{2,3}\.){2,3}\d{3}(?:\/\d{4})?-\d{2}|\d{3}\.\d{3}\.\d{3}-\d{2})\s+([-]?[\d.,]+)\s*/gi;

    let match;
    let count = 0;

    while ((match = transactionPattern.exec(cleanText)) !== null) {
      const dateStr = match[1];
      const description = match[2].trim();
      const cpfCnpj = match[3];
      const valueStr = match[4];

      // Skip SALDO lines
      if (description.toUpperCase().includes('SALDO')) continue;

      const value = this.parseValue(valueStr);
      if (value === 0) continue;

      // Convert date to ISO format
      const dateParts = dateStr.split('/');
      const isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      // Determine type based on description keywords
      let type: 'credit' | 'debit' = 'credit';
      const upperDesc = description.toUpperCase();
      if (upperDesc.includes('PIX ENVIADO') || 
          upperDesc.includes('PAGAMENTO') || 
          upperDesc.includes('TARIFA') ||
          upperDesc.includes('DÉBITO') ||
          upperDesc.includes('DEB ') ||
          upperDesc.includes('TRANSFERIDO')) {
        type = 'debit';
      }

      const signedValue = type === 'debit' ? -Math.abs(value) : Math.abs(value);
      currentBalance += signedValue;

      const transaction: ParsedTransaction = {
        date: isoDate,
        description: `${description} (${cpfCnpj})`,
        value: Math.abs(value),
        balance: currentBalance,
        type
      };

      transactions.push(transaction);
      count++;
      if (count <= 10) {
        console.log(`✅ ${isoDate} | ${description.substring(0, 30)}... | ${signedValue.toFixed(2)}`);
      }
    }

    console.log(`📊 Método 1: ${transactions.length} transações`);

    // Alternative method: simpler pattern without CPF/CNPJ requirement
    if (transactions.length < 10) {
      console.log("🔄 Trying alternative method...");
      this.parseSimpleFormat(cleanText, transactions, year, currentBalance);
    }

    console.log(`✅ Total de transações extraídas: ${transactions.length}`);
    return transactions;
  }

  private parseSimpleFormat(pdfText: string, transactions: ParsedTransaction[], year: string, initialBalance: number): void {
    // Pattern: DD/MM/YYYY followed by description and ending with a monetary value
    // Match lines that start with a date
    const lines = pdfText.split(/(?=\d{2}\/\d{2}\/\d{4}\s)/);
    let currentBalance = initialBalance;

    console.log(`📝 Processing ${lines.length} segments...`);

    for (const line of lines) {
      // Match date at the beginning
      const dateMatch = line.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+)/s);
      if (!dateMatch) continue;

      const dateStr = dateMatch[1];
      let content = dateMatch[2];

      // Skip SALDO lines
      if (content.toUpperCase().includes('SALDO ANTERIOR') || 
          content.toUpperCase().includes('SALDO TOTAL')) continue;

      // Find all monetary values in the content (Brazilian format: -1.234,56 or 123,45)
      // Also check for negative indicators before the value
      const valuePattern = /(-)?R?\$?\s*(-)?(?:\d{1,3}\.)*\d{1,3},\d{2}/g;
      const valueMatches = content.match(valuePattern);
      
      if (!valueMatches || valueMatches.length === 0) continue;

      // Get the first value (transaction amount)
      const rawValue = valueMatches[0];
      const isNegative = rawValue.includes('-');
      const value = this.parseValue(rawValue);
      if (value === 0) continue;

      // Extract description - everything before the first value
      const firstValueIndex = content.indexOf(rawValue);
      let description = content.substring(0, firstValueIndex).trim();
      
      // Clean up description - remove multiple spaces and newlines
      description = description.replace(/\s+/g, ' ').trim();

      if (!description || description.length < 3) continue;

      // Convert date to ISO format
      const dateParts = dateStr.split('/');
      const isoDate = `${dateParts[2]}-${dateParts[1]}-${dateParts[0]}`;

      // Determine type based on sign of value (negative = debit)
      const type: 'credit' | 'debit' = isNegative ? 'debit' : 'credit';

      const signedValue = type === 'debit' ? -Math.abs(value) : Math.abs(value);
      currentBalance += signedValue;

      const transaction: ParsedTransaction = {
        date: isoDate,
        description,
        value: Math.abs(value),
        balance: currentBalance,
        type
      };

      // Avoid duplicates
      const exists = transactions.some(t => 
        t.date === isoDate && 
        t.description === description && 
        Math.abs(t.value - Math.abs(value)) < 0.01
      );

      if (!exists) {
        transactions.push(transaction);
        console.log(`✅ [ALT] ${isoDate} | ${description.substring(0, 35)}... | ${signedValue.toFixed(2)}`);
      }
    }
  }

  private parseValue(valueStr: string): number {
    if (!valueStr) return 0;
    // Remove spaces and convert Brazilian format to number
    const cleaned = valueStr.replace(/\s/g, '').replace(/\./g, '').replace(',', '.');
    const value = parseFloat(cleaned);
    return isNaN(value) ? 0 : value;
  }
}
