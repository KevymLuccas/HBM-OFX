import { ParsedTransaction } from "@/types/bank-layout";
import sicoob2Layout from "@/config/banks/sicoob-v5.json";

class Sicoob2Parser {
  private layout = sicoob2Layout as any;

  parsePDFText(pdfText: string): ParsedTransaction[] {
    console.log("🏦 Parsing Sicoob v2 (tabela) format...");
    console.log("📄 SICOOB V2 - Primeiras 500 caracteres do texto extraído:");
    console.log(pdfText.substring(0, 500));
    
    // Extract period from header - flexible regex for "Periodo:" or "Período:"
    const periodMatch = pdfText.match(/Per[ií]odo:?\s*(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/i);
    if (!periodMatch) {
      console.warn("⚠️ Period not found in header");
      return [];
    }
    
    const startDate = this.parseDate(periodMatch[1]);
    const endDate = this.parseDate(periodMatch[2]);
    console.log(`📅 Período: ${periodMatch[1]} a ${periodMatch[2]}`);

    // Find movements section
    const movementsStart = pdfText.indexOf("HISTÓRICO DE MOVIMENTAÇÃO");
    let movementsText = pdfText;
    if (movementsStart !== -1) {
      movementsText = pdfText.substring(movementsStart);
      console.log("✅ Encontrou seção de movimentações");
    } else {
      console.warn("⚠️ Seção de movimentações não encontrada, processando texto completo");
    }

    // Extract daily balances first
    const dailyBalances: { [key: string]: number } = {};
    const saldoRegex = /(\d{2}\/\d{2})\s+SALDO\s+DO\s+DIA\s+R\$\s*([\d.,]+)\s*([DC])/g;
    let saldoMatch;
    
    while ((saldoMatch = saldoRegex.exec(movementsText)) !== null) {
      const dateStr = saldoMatch[1];
      const balanceValue = this.parseAmount(saldoMatch[2]);
      const dc = saldoMatch[3];
      const signedBalance = dc === 'D' ? -balanceValue : balanceValue;
      
      // Convert to full date
      const [day, month] = dateStr.split("/").map(Number);
      const year = this.inferYear(day, month, startDate, endDate);
      const fullDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      dailyBalances[fullDate] = signedBalance;
      console.log(`💰 Saldo do dia ${dateStr} (${fullDate}): R$ ${balanceValue} ${dc} = ${signedBalance}`);
    }

    // Main transaction extraction regex
    // Format: DD/MM   DOC   DESCRIPTION   R$ VALUE D/C
    // The regex must handle multiple spaces between fields
    const transactionRegex = /(\d{2}\/\d{2})\s+([A-Za-z0-9\-\.]+)\s+(.+?)\s+R\$\s*([\d.,]+)\s*([DC])/g;
    
    const transactions: ParsedTransaction[] = [];
    let match;
    let runningBalance = 0;
    
    console.log("🔍 Procurando transações com regex...");
    
    while ((match = transactionRegex.exec(movementsText)) !== null) {
      const dateStr = match[1];
      const document = match[2].trim();
      let description = match[3].trim();
      const valueStr = match[4];
      const dcIndicator = match[5];
      
      // Skip SALDO lines
      if (description.includes("SALDO DO DIA") || 
          description.includes("SALDO ANTERIOR") ||
          description.includes("SALDO BLOQ") ||
          description.startsWith("SALDO ")) {
        continue;
      }
      
      // Skip header lines
      if (description.includes("Data") && description.includes("Documento") ||
          description.includes("Histórico") && description.includes("Valor")) {
        continue;
      }
      
      // Parse date
      const [day, month] = dateStr.split("/").map(Number);
      
      // Validate date
      if (day < 1 || day > 31 || month < 1 || month > 12) {
        console.log(`⚠️ Data inválida: ${dateStr} - ignorando`);
        continue;
      }
      
      const year = this.inferYear(day, month, startDate, endDate);
      const transactionDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      
      // Parse amount
      const amount = this.parseAmount(valueStr);
      
      // Determine type from D/C indicator
      const isCredit = dcIndicator === 'C';
      const type = isCredit ? "credit" : "debit";
      const signedAmount = isCredit ? amount : -amount;
      
      // Calculate running balance
      runningBalance += signedAmount;
      
      // Clean description - remove extra spaces
      description = description.replace(/\s+/g, ' ').trim();
      
      const transaction: ParsedTransaction = {
        date: transactionDate,
        description: description.substring(0, 100),
        value: Math.abs(amount),
        balance: runningBalance,
        type: type,
        document: document === "Pix" ? undefined : document
      };
      
      transactions.push(transaction);
      
      console.log(`✅ ${dateStr} | ${document} | ${description.substring(0, 50)}... | ${dcIndicator} | R$ ${amount}`);
    }

    console.log(`📊 Extraídas ${transactions.length} transações com regex principal`);

    // If no transactions found, try alternative approach - line by line
    if (transactions.length === 0) {
      console.log("🔄 Tentando abordagem alternativa por linhas...");
      return this.parseLineByLine(movementsText, startDate, endDate);
    }

    // Sort transactions chronologically
    transactions.sort((a, b) => a.date.localeCompare(b.date));

    // Adjust balances using daily balances
    if (Object.keys(dailyBalances).length > 0) {
      this.adjustBalances(transactions, dailyBalances);
    }

    console.log(`✅ Total de ${transactions.length} transações do Sicoob v2`);
    
    return transactions;
  }

  private parseLineByLine(text: string, startDate: Date, endDate: Date): ParsedTransaction[] {
    // Split by potential transaction boundaries (dates)
    const chunks = text.split(/(?=\d{2}\/\d{2}\s+)/);
    const transactions: ParsedTransaction[] = [];
    let runningBalance = 0;
    
    for (const chunk of chunks) {
      const match = chunk.match(/^(\d{2}\/\d{2})\s+([A-Za-z0-9\-\.]+)\s+(.+?)\s+R\$\s*([\d.,]+)\s*([DC])/);
      
      if (match) {
        const dateStr = match[1];
        const document = match[2].trim();
        let description = match[3].trim();
        const valueStr = match[4];
        const dcIndicator = match[5];
        
        // Skip SALDO and header lines
        if (description.includes("SALDO") || 
            description.includes("Data") && description.includes("Documento")) {
          continue;
        }
        
        const [day, month] = dateStr.split("/").map(Number);
        
        if (day < 1 || day > 31 || month < 1 || month > 12) {
          continue;
        }
        
        const year = this.inferYear(day, month, startDate, endDate);
        const transactionDate = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
        
        const amount = this.parseAmount(valueStr);
        const isCredit = dcIndicator === 'C';
        const signedAmount = isCredit ? amount : -amount;
        runningBalance += signedAmount;
        
        transactions.push({
          date: transactionDate,
          description: description.replace(/\s+/g, ' ').trim().substring(0, 100),
          value: Math.abs(amount),
          balance: runningBalance,
          type: isCredit ? "credit" : "debit",
          document: document === "Pix" ? undefined : document
        });
        
        console.log(`✅ [Alt] ${dateStr} | ${document} | ${description.substring(0, 40)}... | ${dcIndicator} | R$ ${amount}`);
      }
    }
    
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

  private isCredit(description: string): boolean {
    const creditKeywords = ["CRÉD", "CRED.", "PIX RECEBIDO", "TRANSF.RECEBIDA", "ESTORNO PIX EMITIDO", "CRED.TRANSF", "CR ANTECIPAÇÃO", "CR COMPRAS"];
    const debitKeywords = ["DÉB", "TARIFA", "PIX EMITIDO", "PIX ENVIADO", "DEB.", "JUROS"];
    
    const upperDesc = description.toUpperCase();
    
    for (const keyword of creditKeywords) {
      if (upperDesc.includes(keyword.toUpperCase())) {
        return true;
      }
    }
    
    for (const keyword of debitKeywords) {
      if (upperDesc.includes(keyword.toUpperCase())) {
        return false;
      }
    }
    
    return false;
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

  private formatDate(date: Date): string {
    const year = date.getFullYear();
    const month = String(date.getMonth() + 1).padStart(2, "0");
    const day = String(date.getDate()).padStart(2, "0");
    return `${year}-${month}-${day}`;
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
      periodo: /per[ií]odo/i.test(pdfText),
      historico: normalizedText.includes("MOVIMENTAÇÃO") || normalizedText.includes("MOVIMENTACAO")
    };

    const validMarkers = Object.values(markers).filter(Boolean).length;
    console.log("🔍 Sicoob v2 format validation:", markers, `(${validMarkers}/7 markers)`);
    
    return validMarkers >= 4;
  }

  getOFXTransactionType(description: string): string {
    const rules = this.layout.mapping?.trntype?.rules || [];
    
    for (const rule of rules) {
      if (rule.contains) {
        for (const keyword of rule.contains) {
          if (description.toUpperCase().includes(keyword.toUpperCase())) {
            return rule.ofx;
          }
        }
      }
    }
    
    return "OTHER";
  }
}

export const sicoob2Parser = new Sicoob2Parser();
