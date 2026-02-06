interface ParsedTransaction {
  date: string;
  description: string;
  value: number;
  type: 'credit' | 'debit';
  balance?: number;
}

class Sisprime2Parser {
  parsePDFText(pdfText: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    
    console.log("=== SISPRIME PARSER START ===");
    
    // Normalize text - join all lines and clean up
    const normalizedText = pdfText.replace(/\n/g, ' ').replace(/\s+/g, ' ');
    
    console.log("Normalized text (first 800):", normalizedText.substring(0, 800));
    
    // Split by date pattern - each transaction starts with DD/MM/YYYY
    // Use lookbehind to keep the date in each chunk
    const datePattern = /(\d{2}\/\d{2}\/\d{4})/g;
    const matches = [...normalizedText.matchAll(datePattern)];
    
    console.log(`Found ${matches.length} date matches`);
    
    if (matches.length === 0) return transactions;
    
    // Process each transaction chunk
    for (let i = 0; i < matches.length; i++) {
      const currentMatch = matches[i];
      const nextMatch = matches[i + 1];
      
      const startIndex = currentMatch.index!;
      const endIndex = nextMatch ? nextMatch.index! : normalizedText.length;
      
      const chunk = normalizedText.substring(startIndex, endIndex).trim();
      
      // Skip header-related chunks
      if (chunk.includes('Período do extrato') || 
          chunk.includes('Saldo Anterior') ||
          chunk.includes('Data Documento')) {
        continue;
      }
      
      console.log(`\nChunk ${i}: "${chunk.substring(0, 100)}..."`);
      
      // Parse the chunk: DD/MM/YYYY DOCUMENTO HISTÓRICO R$SALDO R$VALOR
      const date = currentMatch[1];
      const restOfChunk = chunk.substring(10).trim();
      
      // Find all R$ values in this chunk
      const valueRegex = /-?R\$\s*[\d.,]+/g;
      const valueMatches = [...restOfChunk.matchAll(valueRegex)];
      
      if (valueMatches.length < 2) {
        console.log(`Skipping - not enough values (${valueMatches.length})`);
        continue;
      }
      
      console.log(`Values found:`, valueMatches.map(m => m[0]));
      
      // Get the position of first R$ to extract description
      const firstValuePos = restOfChunk.search(/-?R\$\s*[\d.,]+/);
      if (firstValuePos === -1) continue;
      
      const beforeValues = restOfChunk.substring(0, firstValuePos).trim();
      
      // Split by multiple spaces to get document and description
      const parts = beforeValues.split(/\s{2,}/);
      let documento = '';
      let description = '';
      
      if (parts.length >= 2) {
        documento = parts[0];
        description = parts.slice(1).join(' ').trim();
      } else {
        // Single space split
        const singleParts = beforeValues.split(/\s+/);
        if (singleParts.length >= 2) {
          documento = singleParts[0];
          description = singleParts.slice(1).join(' ').trim();
        } else {
          description = beforeValues;
        }
      }
      
      if (!description) {
        console.log(`Skipping - no description found`);
        continue;
      }
      
      // Parse values
      const parsedValues: number[] = [];
      for (const match of valueMatches) {
        const valueStr = match[0]
          .replace('R$', '')
          .replace(/\s/g, '')
          .replace(/\./g, '')
          .replace(',', '.');
        
        const numValue = parseFloat(valueStr);
        if (!isNaN(numValue)) {
          parsedValues.push(Math.abs(numValue));
        }
      }
      
      if (parsedValues.length < 2) continue;
      
      // Format: SALDO comes first, then DÉBITO or CRÉDITO
      // Looking at: "R$ 39,28 R$ 3,40" -> saldo=39.28, débito=3.40
      // And: "R$ 150.035,88 R$ 150.000,00" -> saldo=150035.88, crédito=150000.00
      
      const balance = parsedValues[0];
      const value = parsedValues[1];
      
      // Determine type based on description
      const descLower = description.toLowerCase();
      let type: 'credit' | 'debit' = 'debit';
      
      if (descLower.includes('crédito') || descLower.includes('credito')) {
        type = 'credit';
      }
      
      console.log(`✅ Transaction: ${date} | ${description} | ${value} | ${type} | bal: ${balance}`);
      
      transactions.push({
        date,
        description,
        value,
        type,
        balance
      });
    }
    
    console.log(`=== SISPRIME PARSER END: ${transactions.length} transactions ===`);
    return transactions;
  }

  getOFXTransactionType(description: string): string {
    const desc = description.toUpperCase();
    if (desc.includes('PIX')) return 'PIX';
    if (desc.includes('TED') || desc.includes('TRANSF')) return 'XFER';
    if (desc.includes('TARIFA') || desc.includes('TAR ')) return 'SRVCHG';
    if (desc.includes('IOF') || desc.includes('JRS') || desc.includes('JUROS')) return 'INT';
    if (desc.includes('PAGAMENTO') || desc.includes('PAG')) return 'PAYMENT';
    if (desc.includes('CONVÊNIO') || desc.includes('CONVENIO')) return 'PAYMENT';
    if (desc.includes('PARCELA') || desc.includes('LIQ')) return 'PAYMENT';
    return 'OTHER';
  }

  validateFormat(pdfText: string): boolean {
    const hasSisprime = pdfText.toLowerCase().includes('sisprime');
    const hasExtratoConta = pdfText.toLowerCase().includes('extrato de conta');
    const hasDateFormat = /\d{2}\/\d{2}\/\d{4}/.test(pdfText);
    
    return (hasSisprime || hasExtratoConta) && hasDateFormat;
  }
}

export const sisprime2Parser = new Sisprime2Parser();
