import type { ParsedTransaction } from "@/types/bank-layout";

export class BB2Parser {
  validateFormat(pdfText: string): boolean {
    console.log("📄 Validating Banco do Brasil 2 format...");
    
    const normalizeText = (text: string) => {
      return text
        .replace(/\u00A0/g, " ")
        .replace(/\s+/g, " ")
        .normalize("NFD")
        .replace(/[\u0300-\u036f]/g, "")
        .toUpperCase();
    };

    const normalizedText = normalizeText(pdfText);

    // Check for BB2-specific markers - this format has "Extrato de conta corrente" header style
    const hasExtratoConta = normalizedText.includes("EXTRATO DE CONTA CORRENTE");
    const hasAgencia = normalizedText.includes("AGENCIA");
    const hasContaCorrente = normalizedText.includes("CONTA CORRENTE");
    const hasLancamentos = normalizedText.includes("LANCAMENTOS");
    const hasDtBalancete = normalizedText.includes("DT. BALANCETE") || normalizedText.includes("DT BALANCETE");
    const hasPeriodoExtrato = normalizedText.includes("PERIODO DO EXTRATO");

    console.log(
      `  Markers: EXTRATO=${hasExtratoConta}, AGENCIA=${hasAgencia}, CONTA=${hasContaCorrente}, LANCAMENTOS=${hasLancamentos}, DT_BALANCETE=${hasDtBalancete}, PERIODO=${hasPeriodoExtrato}`
    );

    // This format is identified by having "Extrato de conta corrente" and the table headers
    const markers = [hasExtratoConta, hasAgencia, hasContaCorrente, hasLancamentos, hasDtBalancete].filter(
      (m) => m
    ).length;
    const isValid = markers >= 4;

    if (isValid) {
      console.log(`✅ Valid Banco do Brasil 2 format detected (${markers} markers found)`);
    } else {
      console.warn(`❌ Not a valid Banco do Brasil 2 format (markers: ${markers})`);
    }

    return isValid;
  }

  parsePDFText(pdfText: string): ParsedTransaction[] {
    console.log("🏦 Parsing Banco do Brasil 2 bank statement...");
    console.log("📄 PDF text length:", pdfText.length);

    // Normalize text - remove excessive spaces
    const normalizedText = pdfText
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ");

    // Show sample for debugging
    console.log("📋 First 500 chars:", normalizedText.substring(0, 500));
    
    // Extract period - format: "Período do extrato: Mês atual" or similar
    // Try to find a date to infer year from first transaction
    let year = new Date().getFullYear().toString();
    
    // Look for dates in format DD/MM/YYYY to get the year
    const yearMatch = pdfText.match(/(\d{2})\/(\d{2})\/(\d{4})/);
    if (yearMatch) {
      year = yearMatch[3];
      console.log(`📅 Year inferred from data: ${year}`);
    }

    const transactions: ParsedTransaction[] = [];
    let runningBalance = 0;

    // Pattern for BB2 format:
    // DD/MM/YYYY | empty | AGORIGEM | LOTE | HISTORICO | DOCUMENTO | VALOR | C/D
    // Example: 05/11/2025 | | 0000 | 14397 | Pix - Recebido | 51.518.357.785.812 | 78.000,00 | C
    
    // Split by lines and process each
    const lines = pdfText.split('\n');
    
    // First pass: find initial balance (Saldo Anterior)
    for (const line of lines) {
      const saldoMatch = line.match(/Saldo\s+Anterior\s+([\d.,]+)\s*([CD])/i);
      if (saldoMatch) {
        const saldoStr = saldoMatch[1].replace(/\./g, "").replace(",", ".");
        const sign = saldoMatch[2].toUpperCase() === 'C' ? 1 : -1;
        runningBalance = parseFloat(saldoStr) * sign;
        console.log(`💰 Initial balance: ${runningBalance}`);
        break;
      }
    }

    // Transaction pattern for this format
    // Matches: DD/MM/YYYY ... HISTORICO ... VALOR C/D
    const transactionPattern = /(\d{2}\/\d{2}\/\d{4})\s+\d{4}\s+\d{3,5}\s+(.+?)\s+([\d.,]+)\s*([CD])\s*$/i;
    
    // Alternative pattern for lines in parsed markdown table format
    // | DD/MM/YYYY | | AGORIGEM | LOTE | HISTORICO | DOCUMENTO | VALOR | C/D |
    const tablePattern = /\|\s*(\d{2}\/\d{2}\/\d{4})\s*\|[^|]*\|\s*\d{4}\s*\|\s*\d{3,5}\s*\|\s*([^|]+)\|\s*([^|]*)\|\s*([\d.,]+)\s*\|\s*([CD\*])\s*\|?/i;

    console.log("🔍 Searching for transactions...");

    for (const line of lines) {
      // Skip empty lines
      if (!line.trim()) continue;
      
      // Skip header/footer lines
      if (line.includes('Dt. balancete') || line.includes('Dt. movimento')) continue;
      if (line.includes('OBSERVAÇÕES') || line.includes('SAC') || line.includes('Ouvidoria')) continue;
      if (line.includes('S A L D O') || line.includes('SALDO')) {
        // Check if it's the final balance line
        const saldoFinalMatch = line.match(/S\s*A\s*L\s*D\s*O\s+([\d.,]+)\s*([CD])/i);
        if (saldoFinalMatch) {
          console.log(`📊 Final balance line: ${line.substring(0, 60)}`);
        }
        continue;
      }
      
      // Try table pattern first (for parsed markdown)
      let match = line.match(tablePattern);
      if (match) {
        const dateStr = match[1]; // DD/MM/YYYY
        const historico = match[2].trim();
        const documento = match[3].trim();
        const valorStr = match[4];
        const tipo = match[5].toUpperCase();
        
        // Skip saldo anterior and blocked deposits with *
        if (historico.toLowerCase().includes('saldo anterior')) continue;
        if (tipo === '*') {
          console.log(`⏭️ Skipping blocked deposit: ${historico}`);
          continue;
        }
        
        const value = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
        const signedValue = value * (tipo === 'D' ? -1 : 1);
        runningBalance += signedValue;
        
        // Convert DD/MM/YYYY to YYYY-MM-DD
        const [day, month, yearPart] = dateStr.split('/');
        const isoDate = `${yearPart}-${month}-${day}`;
        
        let description = historico;
        if (documento && documento.trim() !== '') {
          description += ` - DOC ${documento}`;
        }
        
        const transaction: ParsedTransaction = {
          date: isoDate,
          description,
          value: Math.abs(value),
          balance: runningBalance,
          type: tipo === 'C' ? "credit" : "debit",
          document: documento || undefined,
        };
        
        transactions.push(transaction);
        console.log(`✅ ${isoDate} | ${historico.substring(0, 30)} | ${signedValue.toFixed(2)} | Balance: ${runningBalance.toFixed(2)}`);
        continue;
      }
      
      // Try direct pattern
      match = line.match(transactionPattern);
      if (match) {
        const dateStr = match[1];
        const historico = match[2].trim();
        const valorStr = match[3];
        const tipo = match[4].toUpperCase();
        
        // Skip saldo lines
        if (historico.toLowerCase().includes('saldo anterior')) continue;
        if (historico.toLowerCase().includes('s a l d o')) continue;
        
        const value = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
        const signedValue = value * (tipo === 'D' ? -1 : 1);
        runningBalance += signedValue;
        
        const [day, month, yearPart] = dateStr.split('/');
        const isoDate = `${yearPart}-${month}-${day}`;
        
        const transaction: ParsedTransaction = {
          date: isoDate,
          description: historico,
          value: Math.abs(value),
          balance: runningBalance,
          type: tipo === 'C' ? "credit" : "debit",
        };
        
        transactions.push(transaction);
        console.log(`✅ ${isoDate} | ${historico.substring(0, 30)} | ${signedValue.toFixed(2)}`);
      }
    }

    console.log(`✅ Parsed ${transactions.length} Banco do Brasil 2 transactions`);
    
    if (transactions.length === 0) {
      console.warn("⚠️ No transactions found! Trying alternative parsing...");
      // Try to parse from raw text with more flexible pattern
      return this.parseRawText(pdfText, year);
    }

    return transactions;
  }

  private parseRawText(pdfText: string, year: string): ParsedTransaction[] {
    console.log("🔄 Attempting raw text parsing...");
    
    const transactions: ParsedTransaction[] = [];
    let runningBalance = 0;
    
    // Normalize spaces
    const normalizedText = pdfText
      .replace(/\u00A0/g, " ")
      .replace(/\s+/g, " ");
    
    // Find initial balance
    const saldoMatch = normalizedText.match(/Saldo\s+Anterior\s+([\d.,]+)\s*([CD])/i);
    if (saldoMatch) {
      const saldoStr = saldoMatch[1].replace(/\./g, "").replace(",", ".");
      runningBalance = parseFloat(saldoStr) * (saldoMatch[2] === 'C' ? 1 : -1);
      console.log(`💰 Initial balance: ${runningBalance}`);
    }
    
    // Pattern: DD/MM/YYYY AGORIGEM LOTE HISTORICO [DOCUMENTO] VALOR C/D
    // More flexible pattern to capture various formats
    const pattern = /(\d{2}\/\d{2}\/\d{4})\s+\d{4}\s+\d{3,5}\s+(.+?)\s+([\d.,]+)\s+([CD])\b/gi;
    
    let match;
    while ((match = pattern.exec(normalizedText)) !== null) {
      const dateStr = match[1];
      let historico = match[2].trim();
      const valorStr = match[3];
      const tipo = match[4].toUpperCase();
      
      // Skip saldo lines
      if (historico.toLowerCase().includes('saldo anterior')) continue;
      if (historico.toLowerCase().includes('s a l d o')) continue;
      
      // Extract document number if present (sequence of digits with dots)
      let documento = '';
      const docMatch = historico.match(/([\d.]+)\s*$/);
      if (docMatch && docMatch[1].includes('.')) {
        documento = docMatch[1];
        historico = historico.replace(docMatch[0], '').trim();
      }
      
      const value = parseFloat(valorStr.replace(/\./g, "").replace(",", "."));
      const signedValue = value * (tipo === 'D' ? -1 : 1);
      runningBalance += signedValue;
      
      const [day, month, yearPart] = dateStr.split('/');
      const isoDate = `${yearPart}-${month}-${day}`;
      
      let description = historico;
      if (documento) {
        description += ` - DOC ${documento}`;
      }
      
      const transaction: ParsedTransaction = {
        date: isoDate,
        description,
        value: Math.abs(value),
        balance: runningBalance,
        type: tipo === 'C' ? "credit" : "debit",
        document: documento || undefined,
      };
      
      transactions.push(transaction);
      console.log(`✅ ${isoDate} | ${historico.substring(0, 30)} | ${signedValue.toFixed(2)}`);
    }
    
    console.log(`✅ Raw parsing found ${transactions.length} transactions`);
    return transactions;
  }
}
