import { ParsedTransaction } from "@/types/bank-layout";

class Sicoob3Parser {
  parsePDFText(pdfText: string): ParsedTransaction[] {
    console.log("🏦 Parsing Sicoob 3 format...");
    console.log("📄 SICOOB 3 - Primeiras 2000 caracteres do texto extraído:");
    console.log(pdfText.substring(0, 2000));
    
    // Normalize text - reduce multiple spaces to single
    const normalizedText = pdfText.replace(/\s+/g, ' ');
    
    // This layout uses DD/MM/YYYY format for dates
    // Extract all dates to determine period
    const allDates = pdfText.match(/\d{2}\/\d{2}\/\d{4}/g) || [];
    console.log(`📅 Datas encontradas: ${allDates.length}`, allDates.slice(0, 5));
    
    if (allDates.length < 2) {
      console.error("❌ Não foi possível encontrar datas suficientes no PDF");
      return [];
    }
    
    // Parse all dates and find min/max for period
    const parsedDates = allDates.map(d => {
      const [day, month, year] = d.split('/').map(Number);
      return new Date(year, month - 1, day);
    }).filter(d => !isNaN(d.getTime()));
    
    parsedDates.sort((a, b) => a.getTime() - b.getTime());
    const startDate = parsedDates[0];
    const endDate = parsedDates[parsedDates.length - 1];
    
    console.log(`📅 Período detectado: ${startDate.toISOString().split('T')[0]} a ${endDate.toISOString().split('T')[0]}`);

    // Extract daily balances from "SALDO DO DIA" lines
    const dailyBalances: { [key: string]: number } = {};
    // Format: SALDO DO DIA ===== > 6.406,26C
    const saldoRegex = /SALDO\s+DO\s+DIA\s*[=>\s]+\s*([\d.,]+)([DC\*])/gi;
    let saldoMatch;
    
    // We need to associate balance with the date that precedes it
    // Split by SALDO DO DIA and find the date before each
    const saldoSplits = pdfText.split(/SALDO\s+DO\s+DIA/i);
    
    for (let i = 0; i < saldoSplits.length - 1; i++) {
      const chunk = saldoSplits[i];
      const nextChunk = saldoSplits[i + 1];
      
      // Find the last date in this chunk
      const datesInChunk = chunk.match(/\d{2}\/\d{2}\/\d{4}/g);
      if (!datesInChunk || datesInChunk.length === 0) continue;
      
      const lastDate = datesInChunk[datesInChunk.length - 1];
      
      // Find the balance value in the next chunk
      const balanceMatch = nextChunk.match(/^\s*[=>\s]+\s*([\d.,]+)([DC\*])/i);
      if (balanceMatch) {
        const [day, month, year] = lastDate.split('/').map(Number);
        const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        const balanceValue = this.parseAmount(balanceMatch[1]);
        const dc = balanceMatch[2].toUpperCase();
        const signedBalance = dc === 'D' ? -balanceValue : balanceValue;
        
        dailyBalances[fullDate] = signedBalance;
        console.log(`💰 Saldo do dia ${lastDate} (${fullDate}): R$ ${balanceValue} ${dc} = ${signedBalance}`);
      }
    }

    const transactions: ParsedTransaction[] = [];
    let runningBalance = 0;
    
    // This format: DD/MM/YYYY   DOC   DESCRIPTION   VALUE[D/C]   [additional details until next date]
    // Example: 01/10/2024   Pix   PIX RECEBIDO   -   OUTRA IF   625,00C  Recebimento Pix  PAX RIO VERDE...
    // The additional text after VALUE[DC] is part of the description
    
    // Split text by date pattern to get chunks for each transaction
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
    const chunks: { date: string; content: string }[] = [];
    
    let lastIndex = 0;
    let dateMatch;
    const dates: { date: string; index: number }[] = [];
    
    // Find all date positions
    while ((dateMatch = datePattern.exec(normalizedText)) !== null) {
      dates.push({ date: dateMatch[1], index: dateMatch.index });
    }
    
    // Create chunks between dates
    for (let i = 0; i < dates.length; i++) {
      const start = dates[i].index;
      const end = i < dates.length - 1 ? dates[i + 1].index : normalizedText.length;
      const content = normalizedText.substring(start, end).trim();
      chunks.push({ date: dates[i].date, content });
    }
    
    console.log(`📊 Encontrados ${chunks.length} chunks de transações`);
    
    for (const chunk of chunks) {
      // Pattern: DATE DOC DESCRIPTION VALUE[DC] [additional_text]
      // Match the main transaction pattern - more flexible regex with 's' flag for multiline
      let match = chunk.content.match(/^(\d{2}\/\d{2}\/\d{4})\s+([A-Za-z0-9]+)\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})([DC\*])(.*)$/s);
      
      let dateStr: string;
      let document: string;
      let mainDescription: string;
      let valueStr: string;
      let dcIndicator: string;
      let additionalText: string;
      
      if (match) {
        dateStr = match[1];
        document = match[2].trim();
        mainDescription = match[3].trim();
        valueStr = match[4];
        dcIndicator = match[5].toUpperCase();
        additionalText = match[6]?.trim() || '';
      } else {
        // Try alternative pattern without document field
        const altMatch = chunk.content.match(/^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})([DC\*])(.*)$/s);
        if (!altMatch) continue;
        
        dateStr = altMatch[1];
        document = '';
        mainDescription = altMatch[2].trim();
        valueStr = altMatch[3];
        dcIndicator = altMatch[4].toUpperCase();
        additionalText = altMatch[5]?.trim() || '';
      }
      
      // Clean additionalText - remove footer content before checking filters
      // This prevents valid transactions from being filtered out just because they're followed by footer
      let cleanedAdditionalText = additionalText
        .split(/CHEQUE\s+ESPECIAL/i)[0]
        .split(/LIMITES\s+DE\s+CR[ÉE]DITO/i)[0]
        .split(/PREVIS[ÃA]O\s+CPMF/i)[0]
        .split(/Acesse\s+o\s+menu/i)[0]
        .trim();
      
      // Skip SALDO lines
      if (mainDescription.toUpperCase().includes("SALDO ANTERIOR") ||
          mainDescription.toUpperCase().includes("SALDO BLOQUEADO") ||
          mainDescription.toUpperCase().includes("SALDO DO DIA") ||
          mainDescription.toUpperCase().startsWith("SALDO ")) {
        continue;
      }
      
      // Skip header lines
      if (mainDescription.includes("HISTÓRICO") || mainDescription.includes("DOCUMENTO")) {
        continue;
      }
      
      // Skip informational/footer lines (check only mainDescription, not additionalText)
      if (mainDescription.toUpperCase().includes("CHEQUE ESPECIAL") ||
          mainDescription.toUpperCase().includes("PREVISÃO") ||
          mainDescription.toUpperCase().includes("LIMITES DE CRÉDITO") ||
          mainDescription.toUpperCase().includes("LIMITES DE CREDITO") ||
          mainDescription.toUpperCase().includes("ACESSE O MENU")) {
        continue;
      }
      
      // Parse date
      const [day, month, year] = dateStr.split("/").map(Number);
      
      // Validate date
      if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) {
        continue;
      }
      
      const transactionDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Parse amount
      const amount = this.parseAmount(valueStr);
      
      // Determine type from D/C indicator (skip * which is used for zero balances)
      if (dcIndicator === '*') continue;
      
      const isCredit = dcIndicator === 'C';
      const type = isCredit ? "credit" : "debit";
      const signedAmount = isCredit ? amount : -amount;
      
      runningBalance += signedAmount;
      
      // Combine main description with cleaned additional text
      let fullDescription = mainDescription;
      if (cleanedAdditionalText && !cleanedAdditionalText.toUpperCase().includes("SALDO DO DIA")) {
        // Clean additional text - remove SALDO DO DIA and anything after
        const cleanAdditional = cleanedAdditionalText.split(/SALDO\s+DO\s+DIA/i)[0].trim();
        if (cleanAdditional) {
          fullDescription = `${mainDescription} | ${cleanAdditional}`;
        }
      }
      
      // Clean description
      fullDescription = fullDescription.replace(/\s+/g, ' ').trim();
      
      const transaction: ParsedTransaction = {
        date: transactionDate,
        description: fullDescription.substring(0, 200),
        value: Math.abs(amount),
        balance: runningBalance,
        type: type,
        document: document !== "Pix" ? document : undefined
      };
      
      transactions.push(transaction);
      console.log(`✅ ${dateStr} | ${document} | ${fullDescription.substring(0, 60)}... | ${dcIndicator} | R$ ${amount}`);
    }
    
    console.log(`📊 Total: ${transactions.length} transações encontradas`);

    // Sort transactions chronologically
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Adjust balances using daily balances
    if (Object.keys(dailyBalances).length > 0) {
      this.adjustBalances(transactions, dailyBalances);
    }

    console.log(`✅ Total de ${transactions.length} transações do Sicoob 3`);
    
    return transactions;
  }

  private parseAlternative(
    text: string, 
    startDate: Date, 
    endDate: Date,
    dailyBalances: { [key: string]: number }
  ): ParsedTransaction[] {
    console.log("📋 Tentando padrão alternativo com datas completas...");
    
    const transactions: ParsedTransaction[] = [];
    let runningBalance = 0;
    
    // Split by full date pattern DD/MM/YYYY
    const chunks = text.split(/(?=\d{2}\/\d{2}\/\d{4})/);
    
    for (const chunk of chunks) {
      // Pattern for DD/MM/YYYY DOC DESCRIPTION VALUE[DC]
      const patterns = [
        /^(\d{2}\/\d{2}\/\d{4})\s+([A-Za-z0-9]+)\s+(.+?)\s+([\d.,]+)([DC])/i,
        /^(\d{2}\/\d{2}\/\d{4})\s+(.+?)\s+([\d.,]+)([DC])/i
      ];
      
      for (let i = 0; i < patterns.length; i++) {
        const match = chunk.match(patterns[i]);
        
        if (match) {
          let dateStr: string;
          let document: string = '';
          let description: string;
          let valueStr: string;
          let dcIndicator: string;
          
          if (i === 0) {
            dateStr = match[1];
            document = match[2].trim();
            description = match[3].trim();
            valueStr = match[4];
            dcIndicator = match[5].toUpperCase();
          } else {
            dateStr = match[1];
            description = match[2].trim();
            valueStr = match[3];
            dcIndicator = match[4].toUpperCase();
          }
          
          // Skip SALDO and header lines
          if (description.toUpperCase().includes("SALDO") || 
              description.includes("HISTÓRICO") ||
              description.includes("DOCUMENTO")) {
            break;
          }
          
          const [day, month, year] = dateStr.split("/").map(Number);
          
          if (day < 1 || day > 31 || month < 1 || month > 12 || year < 2000) {
            break;
          }
          
          const transactionDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
          
          const amount = this.parseAmount(valueStr);
          const isCredit = dcIndicator === 'C';
          const signedAmount = isCredit ? amount : -amount;
          runningBalance += signedAmount;
          
          transactions.push({
            date: transactionDate,
            description: description.replace(/\s+/g, ' ').trim().substring(0, 150),
            value: Math.abs(amount),
            balance: runningBalance,
            type: isCredit ? "credit" : "debit",
            document: document && document !== "Pix" ? document : undefined
          });
          
          console.log(`✅ [Alt] ${dateStr} | ${document || '-'} | ${description.substring(0, 40)}... | ${dcIndicator} | R$ ${amount}`);
          break;
        }
      }
    }
    
    // Adjust balances using daily balances
    if (Object.keys(dailyBalances).length > 0) {
      this.adjustBalances(transactions, dailyBalances);
    }
    
    console.log(`📊 Padrão alternativo: ${transactions.length} transações`);
    return transactions;
  }

  private adjustBalances(transactions: ParsedTransaction[], dailyBalances: { [key: string]: number }): void {
    console.log("🔄 Ajustando saldos com base nos saldos diários...");
    
    const dates = [...new Set(transactions.map(t => t.date))].sort();
    
    for (const date of dates) {
      const targetBalance = dailyBalances[date];
      if (targetBalance === undefined) continue;
      
      const dayTransactions = transactions.filter(t => t.date === date);
      if (dayTransactions.length === 0) continue;
      
      // Calculate day's total movement
      const dayDelta = dayTransactions.reduce((sum, t) => {
        return sum + (t.type === "credit" ? t.value : -t.value);
      }, 0);
      
      // The start balance for this day
      const dayStartBalance = targetBalance - dayDelta;
      
      // Update each transaction's balance progressively
      let currentBalance = dayStartBalance;
      for (const transaction of dayTransactions) {
        currentBalance += transaction.type === "credit" ? transaction.value : -transaction.value;
        transaction.balance = currentBalance;
      }
      
      console.log(`📅 ${date}: Início=${dayStartBalance.toFixed(2)}, Fim=${targetBalance.toFixed(2)}, Transações=${dayTransactions.length}`);
    }
  }

  private parseAmount(amountStr: string): number {
    const cleaned = amountStr
      .replace(/R\$/g, "")
      .replace(/\s/g, "")
      .replace(/\./g, "")
      .replace(",", ".");
    
    return parseFloat(cleaned);
  }

  private parseDate(dateStr: string): Date {
    const [day, month, year] = dateStr.split("/").map(Number);
    return new Date(year, month - 1, day);
  }

  private inferYear(day: number, month: number, startDate: Date, endDate: Date): number {
    const startYear = startDate.getFullYear();
    const startMonth = startDate.getMonth() + 1;
    const endYear = endDate.getFullYear();
    const endMonth = endDate.getMonth() + 1;
    
    // If period spans two years
    if (endYear > startYear) {
      if (month <= endMonth) {
        return endYear;
      }
      return startYear;
    }
    
    return startYear;
  }

  validateFormat(pdfText: string): boolean {
    const normalizedText = pdfText.toUpperCase();
    
    const markers = {
      sicoob: normalizedText.includes("SICOOB"),
      sisbr: normalizedText.includes("SISBR"),
      extrato: normalizedText.includes("EXTRATO"),
      conta: normalizedText.includes("CONTA"),
      cooperativa: normalizedText.includes("COOPERATIVA"),
      periodo: /per[ií]odo/i.test(pdfText) || /\d{2}\/\d{2}\/\d{4}\s*(a|[-–])\s*\d{2}\/\d{2}\/\d{4}/i.test(pdfText),
      historico: normalizedText.includes("MOVIMENTAÇÃO") || normalizedText.includes("MOVIMENTACAO") || normalizedText.includes("LANÇAMENTO")
    };

    const validMarkers = Object.values(markers).filter(Boolean).length;
    console.log("🔍 Sicoob 3 format validation:", markers, `(${validMarkers}/7 markers)`);
    
    return validMarkers >= 3;
  }

  getOFXTransactionType(description: string): string {
    const upperDesc = description.toUpperCase();
    
    if (upperDesc.includes("PIX") && (upperDesc.includes("RECEB") || upperDesc.includes("CRÉD") || upperDesc.includes("CRED"))) {
      return "XFER";
    }
    if (upperDesc.includes("PIX") && (upperDesc.includes("EMIT") || upperDesc.includes("ENVIADO"))) {
      return "XFER";
    }
    if (upperDesc.includes("TED") || upperDesc.includes("TRANSF")) {
      return "XFER";
    }
    if (upperDesc.includes("TARIFA") || upperDesc.includes("IOF")) {
      return "FEE";
    }
    if (upperDesc.includes("DÉB") || upperDesc.includes("DEB")) {
      return "PAYMENT";
    }
    if (upperDesc.includes("CRÉD") || upperDesc.includes("CRED")) {
      return "CREDIT";
    }
    
    return "OTHER";
  }
}

export const sicoob3Parser = new Sicoob3Parser();
