import type { BankLayout, ParsedTransaction } from "@/types/bank-layout";
import bbLayout from "@/config/banks/bb.json";

export class BBParser {
  private layout: BankLayout;

  constructor() {
    this.layout = bbLayout as BankLayout;
  }

  validateFormat(pdfText: string): boolean {
    console.log("📄 Validating Banco do Brasil format...");
    
    const normalizeText = (text: string) => {
      return text
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    const normalizedText = normalizeText(pdfText);

    // Check for BB-specific markers
    const hasBB = normalizedText.includes("BANCO DO BRASIL") || normalizedText.includes("BB");
    const hasAgencia = normalizedText.includes("AGENCIA");
    const hasContaCorrente = normalizedText.includes("CONTA CORRENTE");
    const hasLancamentos = normalizedText.includes("LANCAMENTOS");
    const hasPeriodo = normalizedText.includes("PERIODO DO EXTRATO");

    console.log(
      `  Markers: BB=${hasBB}, AGENCIA=${hasAgencia}, CONTA=${hasContaCorrente}, LANCAMENTOS=${hasLancamentos}, PERIODO=${hasPeriodo}`
    );

    const markers = [hasAgencia, hasContaCorrente, hasLancamentos, hasPeriodo].filter(
      (m) => m
    ).length;
    const isValid = markers >= 3;

    if (isValid) {
      console.log(`✅ Valid Banco do Brasil format detected (${markers} markers found)`);
    } else {
      console.warn(`❌ Not a valid Banco do Brasil format (markers: ${markers})`);
    }

    return isValid;
  }

  parsePDFText(pdfText: string): ParsedTransaction[] {
    console.log("🏦 Parsing Banco do Brasil bank statement...");
    console.log("📄 PDF text length:", pdfText.length);

    // Show sample of PDF text for debugging
    console.log("📋 First 1000 chars of PDF:");
    console.log(pdfText.substring(0, 1000));
    
    // Extract period for year inference - try multiple patterns
    let periodPattern = /Período do extrato:\s*(\d{2})\s*\/\s*(\d{4})/i;
    let periodMatch = pdfText.match(periodPattern);
    
    // Try alternative pattern without colon
    if (!periodMatch) {
      periodPattern = /Período do extrato\s*(\d{2})\s*\/\s*(\d{4})/i;
      periodMatch = pdfText.match(periodPattern);
    }
    
    // Try with more flexible spacing
    if (!periodMatch) {
      periodPattern = /Período\s+do\s+extrato[:\s]*(\d{2})\s*\/\s*(\d{4})/i;
      periodMatch = pdfText.match(periodPattern);
    }

    if (!periodMatch) {
      console.error("❌ Could not find period in PDF");
      console.error("📄 Searching in text:", pdfText.substring(0, 500));
      throw new Error("Período não encontrado no extrato");
    }

    const month = periodMatch[1];
    const year = periodMatch[2];
    console.log(`📅 Period: ${month}/${year}`);

    // Pattern to match transaction lines in real PDF text (not markdown)
    // Format: DD/MM/YYYY spaces AG(4digits) spaces LOTE(5digits) spaces HISTORICO spaces DOC spaces VALOR,DD C/D spaces [SALDO,DD C/D]
    // Example: "02/06/2025 0000 14134 Recebimento Fornecedor 270.065 406,57 C"
    // Example with balance: "09/06/2025 0000 13128 BB GIRO PRONAMPE 868.505.909.000.641 3.817,97 D 3.604,11 C"
    const transactionPattern = /(\d{2}\/\d{2}\/\d{4})\s+(\d{4})\s+(\d{3,5})\s+(.+?)\s+([\d.]*)\s+([\d.,]+)\s+([CD])(?:\s+([\d.,]+)\s+([CD]))?/gi;

    console.log("🔍 Searching for transactions...");
    
    const transactions: ParsedTransaction[] = [];
    let match;
    let lastBalance = 0;

    // First, find "Saldo Anterior" to get initial balance
    const saldoAnteriorPattern = /Saldo Anterior\s+\|\s*\|\s*([\d.,]+)\s+([CD])/i;
    const saldoMatch = pdfText.match(saldoAnteriorPattern);
    
    if (saldoMatch) {
      const saldoStr = saldoMatch[1].replace(/\./g, "").replace(",", ".");
      const saldoSign = saldoMatch[2];
      lastBalance = parseFloat(saldoStr) * (saldoSign === 'D' ? -1 : 1);
      console.log(`💰 Initial balance: ${lastBalance}`);
    }

    while ((match = transactionPattern.exec(pdfText)) !== null) {
      const dateStr = match[1]; // DD/MM/YYYY
      const agOrigem = match[2];
      const lote = match[3];
      let historico = match[4].trim();
      const documento = match[5] ? match[5].trim() : "";
      const valorStr = match[6];
      const tipoValor = match[7]; // C or D
      const saldoStr = match[8] || "";
      const tipoSaldo = match[9] || "";

      // Clean up historico - remove document number if it got captured as part of description
      // The regex might capture part of the document number in historico
      const historicoClean = historico.replace(/[\d.]+$/, '').trim();
      
      // Skip "Saldo Anterior" and "S A L D O" lines
      if (
        historicoClean.toUpperCase().includes('SALDO ANTERIOR') ||
        historicoClean.toUpperCase().includes('S A L D O') ||
        historicoClean.toUpperCase().includes('SALDO')
      ) {
        console.log(`⏭️ Skipping balance line: ${historicoClean}`);
        continue;
      }

      // Parse value
      const value = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
      const signedValue = value * (tipoValor === 'D' ? -1 : 1);

      // Calculate balance
      if (saldoStr && saldoStr.trim() !== '') {
        // Use the balance from the statement
        const saldoValue = parseFloat(saldoStr.replace(/\./g, "").replace(",", "."));
        lastBalance = saldoValue * (tipoSaldo === 'D' ? -1 : 1);
      } else {
        // Calculate running balance
        lastBalance += signedValue;
      }

      // Convert DD/MM/YYYY to YYYY-MM-DD
      const [day, monthPart, yearPart] = dateStr.split('/');
      const isoDate = `${yearPart}-${monthPart}-${day}`;

      const type: "credit" | "debit" = tipoValor === 'C' ? "credit" : "debit";

      // Build description with document reference
      let description = historicoClean;
      if (documento && documento !== '') {
        description += ` - DOC ${documento}`;
      }
      description += ` - AG ${agOrigem}`;

      const transaction: ParsedTransaction = {
        date: isoDate,
        description,
        value: Math.abs(signedValue),
        balance: lastBalance,
        type,
        document: documento || undefined,
      };

      transactions.push(transaction);
      console.log(`✅ ${isoDate} | ${historicoClean.substring(0, 30)} | ${signedValue.toFixed(2)} | Balance: ${lastBalance.toFixed(2)}`);
    }

    console.log(`✅ Parsed ${transactions.length} Banco do Brasil transactions`);
    
    if (transactions.length === 0) {
      console.warn("⚠️ No transactions found! Check PDF format.");
    }

    return transactions;
  }
}
