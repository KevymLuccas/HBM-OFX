import { ParsedTransaction } from '@/types/bank-layout';

export class Itau2Parser {
  private monthMap: { [key: string]: string } = {
    'jan': '01', 'fev': '02', 'mar': '03', 'abr': '04',
    'mai': '05', 'jun': '06', 'jul': '07', 'ago': '08',
    'set': '09', 'out': '10', 'nov': '11', 'dez': '12'
  };

  private monthNameMap: { [key: string]: string } = {
    'janeiro': '01', 'fevereiro': '02', 'março': '03', 'abril': '04',
    'maio': '05', 'junho': '06', 'julho': '07', 'agosto': '08',
    'setembro': '09', 'outubro': '10', 'novembro': '11', 'dezembro': '12'
  };

  validateFormat(pdfText: string): boolean {
    const hasItau = /ita[uú]/i.test(pdfText);
    const hasLancamentos = /lan[cç]amentos/i.test(pdfText);
    const hasMonthFormat = /\d{2}\s*\/\s*(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/i.test(pdfText);
    return hasItau && hasLancamentos && hasMonthFormat;
  }

  parsePDFText(pdfText: string): ParsedTransaction[] {
    console.log('=== ITAÚ 2 PARSER START ===');
    
    // Normalize text - remove extra spaces, normalize date separators
    let text = pdfText
      .replace(/\s+/g, ' ')
      .replace(/\s*\/\s*/g, '/')
      .replace(/R\s*\$\s*/g, 'R$');
    
    // Remove page footers - only the contact/SAC text, preserve transactions
    text = text.replace(/Em caso de dúvidas,?\s+de posse do comprovante[^]*?(?:0800\s*\d{3}\s*\d{4}|auditivo\/fala[^]*?0800[^]*?\d{4})/gi, ' ');
    text = text.replace(/contate seu gerente ou a Central[^]*?demais localidades\)?\.?/gi, ' ');
    text = text.replace(/Reclamações,?\s*informações e cancelamentos[^]*?www\.itau\.com\.br[^\s]*/gi, ' ');
    text = text.replace(/Se não ficar satisfeito[^]*?das\s+\d+h\s+às\s+\d+h\.?/gi, ' ');
    text = text.replace(/Deficiente auditivo[^]*?0800\s*\d{3}\s*\d{4}/gi, ' ');
    
    // Debug: find text around 10/abr and 11/abr transition
    const idx10abr = text.indexOf('10/abr');
    if (idx10abr > -1) {
      console.log('🔎 Text around 10/abr-11/abr:', text.substring(idx10abr, idx10abr + 500));
    }
    
    console.log('First 1500 chars:', text.substring(0, 1500));

    const transactions: ParsedTransaction[] = [];
    
    // FIRST: Handle transactions that appear BETWEEN month headers ("abril 2025") and the next date ("01/abr")
    // Pattern: "mês ano DESCRIPTION VALUE DD/mmm" - the transaction belongs to DD/mmm date (the one AFTER the value)
    // Example: "abril 2025 PIX TRANSF SOUZA C01/04 25.000,00 01/abr" => date is 01/abr
    const monthHeaderTxPattern = /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+\d{4}\s+([A-Z][A-Z0-9\s\/\-#]+?)\s+(-?[\d.]+,\d{2})\s+(\d{2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/gi;
    
    let monthMatch;
    while ((monthMatch = monthHeaderTxPattern.exec(text)) !== null) {
      const description = monthMatch[2].trim();
      const valueStr = monthMatch[3];
      const day = monthMatch[4];
      const monthAbbr = monthMatch[5].toLowerCase();
      const monthNum = this.monthMap[monthAbbr] || '01';
      
      // Skip SALDO lines
      if (/SALDO/i.test(description)) continue;
      
      const value = this.parseValue(valueStr);
      if (value === 0) continue;
      
      const type: 'debit' | 'credit' = value < 0 ? 'debit' : 'credit';
      const date = `${day}/${monthNum}`;
      
      transactions.push({
        date,
        description,
        value: Math.abs(value),
        type,
        balance: 0
      });
      
      console.log(`✅ Month header transaction: ${date} | ${description} | ${value}`);
    }
    
    // SECOND: Handle transactions that appear BEFORE their date (page break pattern)
    // Only capture after page break markers like "atualizado em DD/MM/YYYY HH:MM:SS"
    // Pattern: "atualizado em ... DESCRIPTION VALUE DD/mmm"
    const pageBreakPattern = /atualizado em \d{2}\/\d{2}\/\d{4}\s+\d{2}:\d{2}:\d{2}\s+([A-Z][A-Z\s]+?)\s+(-?[\d.]+,\d{2})\s+(\d{2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/gi;
    
    let pageBreakMatch;
    while ((pageBreakMatch = pageBreakPattern.exec(text)) !== null) {
      const description = pageBreakMatch[1].trim();
      const valueStr = pageBreakMatch[2];
      const day = pageBreakMatch[3];
      const monthAbbr = pageBreakMatch[4].toLowerCase();
      const monthNum = this.monthMap[monthAbbr] || '01';
      
      // Skip SALDO lines and very short descriptions
      if (/SALDO/i.test(description) || description.length < 5) continue;
      
      const value = this.parseValue(valueStr);
      if (value === 0) continue;
      
      const type: 'debit' | 'credit' = value < 0 ? 'debit' : 'credit';
      const date = `${day}/${monthNum}`;
      
      // Check if already captured
      const isDuplicate = transactions.some(t =>
        t.date === date &&
        Math.abs(t.value - Math.abs(value)) < 0.01
      );
      
      if (!isDuplicate) {
        transactions.push({
          date,
          description,
          value: Math.abs(value),
          type,
          balance: 0
        });
        
        console.log(`✅ Page-break transaction: ${date} | ${description} | ${value}`);
      }
    }
    
    // Now remove month headers to avoid interference with regular date-based parsing
    text = text.replace(/\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+\d{4}\b/gi, ' ');
    
    // Now handle regular DD/mmm transactions
    const datePattern = /(\d{2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)/gi;

    const dateMatches: { index: number; day: string; month: string; fullMatch: string }[] = [];
    let dateMatch;
    while ((dateMatch = datePattern.exec(text)) !== null) {
      dateMatches.push({
        index: dateMatch.index,
        day: dateMatch[1],
        month: dateMatch[2].toLowerCase(),
        fullMatch: dateMatch[0]
      });
    }

    console.log(`Found ${dateMatches.length} date occurrences`);

    // Helper to detect and extract "SALDO ... DIA" balance lines that may appear between date blocks.
    // Example: "01/jul SALDO TOTAL ... DIA 822,27" (sometimes duplicated as "01/jul 01/jul SALDO...")
    const saldoDiaPattern = /(\d{2})\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+(?:\1\/(?:jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s+)?SALDO[^\d-]*?(-?[\d.]+,\d{2})/i;

    // Process each chunk between dates
    for (let i = 0; i < dateMatches.length; i++) {
      const currentDate = dateMatches[i];
      const startIdx = currentDate.index;
      const endIdx = i < dateMatches.length - 1 ? dateMatches[i + 1].index : text.length;

      const chunk = text.substring(startIdx, endIdx).trim();

      const day = currentDate.day;
      const monthNum = this.monthMap[currentDate.month] || '01';
      const date = `${day}/${monthNum}`;

      // Remove date from chunk to get content
      const content = chunk
        .replace(/^\d{2}\/(jan|fev|mar|abr|mai|jun|jul|ago|set|out|nov|dez)\s*/i, '')
        .trim();

      // Debug: log chunks that might contain missing transactions
      if (content.includes('RICHELLE') || date === '11/04') {
        console.log(`📦 CHUNK ${date}: "${content.substring(0, 200)}..."`);
      }

      // If this chunk contains a "SALDO ..." marker, we may have TWO things merged in the same chunk:
      // - the SALDO line itself
      // - a real transaction that follows right after it (common in pdf text extraction)
      // In that case, we must split and register both.
      const hasSaldo = /^SALDO/i.test(content) || (/\bSALDO\b/i.test(content) && /\bDIA\b/i.test(content));
      if (hasSaldo) {
        const saldoMatch = saldoDiaPattern.exec(chunk);
        const saldoStr = saldoMatch?.[3];
        const saldoValue = saldoStr ? Math.abs(this.parseValue(saldoStr)) : 0;

        // 1) Add SALDO row
        transactions.push({
          date,
          description: content.split(/\b(REDE|PIX|SISPAG|TAR|IOF)\b/i)[0].replace(/\s+/g, ' ').trim(),
          value: 0,
          type: 'credit',
          balance: saldoValue
        });
        console.log(`ℹ️ SALDO LINE: ${date} | ${saldoStr ?? 'n/a'}`);

        // 2) Try to extract a transaction that may be appended after the saldo amount
        // Example: "SALDO ... DIA 822,27 REDE VISA ... 812,69"
        // OR: "SALDO ANTERIOR -1.509,28 abril 2025 PIX TRANSF SOUZA 25.000,00 01/abr"
        const afterSaldoIdx = saldoStr ? content.lastIndexOf(saldoStr) + saldoStr.length : -1;
        const tail = afterSaldoIdx > 0 ? content.substring(afterSaldoIdx).trim() : '';

        if (tail) {
          // Check if tail contains a month header (e.g., "abril 2025") - this means the transaction belongs to NEXT date
          const monthHeaderInTail = /\b(janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\s+\d{4}\b/i.exec(tail);
          
          // Determine the correct date to use
          let txDate = date; // default to current chunk date
          
          if (monthHeaderInTail) {
            // If there's a month header in tail, the transaction belongs to the NEXT date in dateMatches
            // The next date is NOT in this tail - it's the start of the next chunk
            if (i + 1 < dateMatches.length) {
              const nextDateMatch = dateMatches[i + 1];
              const nextDay = nextDateMatch.day;
              const nextMonthNum = this.monthMap[nextDateMatch.month] || '01';
              txDate = `${nextDay}/${nextMonthNum}`;
              console.log(`🔄 Month header detected in tail, using next date: ${txDate}`);
            }
          }
          
          // Extract the transaction value and description
          const tailValueMatches = [...tail.matchAll(/-?[\d.]+,\d{2}/g)];
          if (tailValueMatches.length > 0) {
            // Find the value that's NOT part of a date pattern (e.g., not "01/04" mistaken as value)
            const validValueMatch = tailValueMatches.find(m => {
              const idx = m.index ?? 0;
              // Check if this value is preceded by a "/" (part of date) - if so, skip it
              return idx === 0 || tail[idx - 1] !== '/';
            }) || tailValueMatches[0];
            
            const tailValueStr = validValueMatch[0];
            const tailValue = this.parseValue(tailValueStr);

            // Description: everything between month header (if any) and the value
            let descStart = monthHeaderInTail ? (monthHeaderInTail.index ?? 0) + monthHeaderInTail[0].length : 0;
            const tailValueIdx = validValueMatch.index ?? tail.indexOf(tailValueStr);
            let tailDesc = tail.substring(descStart, tailValueIdx)
              .replace(/^[-–—\s]+/, '')
              .replace(/\s+/g, ' ')
              .trim();

            // Check if already captured by monthHeaderTxPattern - check by date, value AND full description
            const isDuplicate = transactions.some(t =>
              t.date === txDate &&
              Math.abs(t.value - Math.abs(tailValue)) < 0.01 &&
              t.description === tailDesc
            );

            console.log(`🔍 After saldo check: txDate=${txDate}, tailDesc="${tailDesc}", tailValue=${tailValue}, isDuplicate=${isDuplicate}`);

            if (tailDesc && !/\bSALDO\b/i.test(tailDesc) && !isDuplicate && tailValue !== 0) {
              transactions.push({
                date: txDate,
                description: tailDesc,
                value: Math.abs(tailValue),
                type: tailValue < 0 ? 'debit' : 'credit',
                balance: 0
              });
              console.log(`✅ Transaction (after saldo): ${txDate} | ${tailDesc.substring(0, 40)} | ${tailValue}`);
            }
          }
        }

        continue;
      }

      // Skip empty content
      if (!content || content.length < 3) continue;

      // Find monetary values in content.
      // Prefer the FIRST value that appears AFTER the last letter in the content.
      // This avoids incorrectly picking balances that can appear later in the line.
      const allValueMatches = [...content.matchAll(/-?[\d.]+,\d{2}/g)];
      if (allValueMatches.length === 0) continue;

      const lastAlphaIdx = Math.max(
        content.lastIndexOf('A'), content.lastIndexOf('B'), content.lastIndexOf('C'),
        content.lastIndexOf('D'), content.lastIndexOf('E'), content.lastIndexOf('F'),
        content.lastIndexOf('G'), content.lastIndexOf('H'), content.lastIndexOf('I'),
        content.lastIndexOf('J'), content.lastIndexOf('K'), content.lastIndexOf('L'),
        content.lastIndexOf('M'), content.lastIndexOf('N'), content.lastIndexOf('O'),
        content.lastIndexOf('P'), content.lastIndexOf('Q'), content.lastIndexOf('R'),
        content.lastIndexOf('S'), content.lastIndexOf('T'), content.lastIndexOf('U'),
        content.lastIndexOf('V'), content.lastIndexOf('W'), content.lastIndexOf('X'),
        content.lastIndexOf('Y'), content.lastIndexOf('Z'),
        content.lastIndexOf('a'), content.lastIndexOf('b'), content.lastIndexOf('c'),
        content.lastIndexOf('d'), content.lastIndexOf('e'), content.lastIndexOf('f'),
        content.lastIndexOf('g'), content.lastIndexOf('h'), content.lastIndexOf('i'),
        content.lastIndexOf('j'), content.lastIndexOf('k'), content.lastIndexOf('l'),
        content.lastIndexOf('m'), content.lastIndexOf('n'), content.lastIndexOf('o'),
        content.lastIndexOf('p'), content.lastIndexOf('q'), content.lastIndexOf('r'),
        content.lastIndexOf('s'), content.lastIndexOf('t'), content.lastIndexOf('u'),
        content.lastIndexOf('v'), content.lastIndexOf('w'), content.lastIndexOf('x'),
        content.lastIndexOf('y'), content.lastIndexOf('z'),
        content.lastIndexOf('ç'), content.lastIndexOf('Ç'),
        content.lastIndexOf('á'), content.lastIndexOf('à'), content.lastIndexOf('â'), content.lastIndexOf('ã'),
        content.lastIndexOf('é'), content.lastIndexOf('ê'),
        content.lastIndexOf('í'),
        content.lastIndexOf('ó'), content.lastIndexOf('ô'), content.lastIndexOf('õ'),
        content.lastIndexOf('ú')
      );

      const preferredMatch = allValueMatches.find(m => (m.index ?? 0) > lastAlphaIdx);
      const valueMatch = preferredMatch ?? allValueMatches[0];

      const valueStr = valueMatch[0];
      const value = this.parseValue(valueStr);
      if (value === 0) continue;

      // Description is everything before the chosen value
      let description = content;
      const valueIdx = valueMatch.index ?? content.indexOf(valueStr);
      if (valueIdx > 0) {
        description = content.substring(0, valueIdx).trim();
      }

      description = description.replace(/\s+/g, ' ').trim();

      if (!description || description.length < 2) continue;
      if (/SALDO/i.test(description)) continue;

      // Check for duplicate (from month header extraction)
      const isDuplicate = transactions.some(t =>
        t.date === date &&
        t.description === description &&
        Math.abs(t.value - Math.abs(value)) < 0.01
      );

      if (isDuplicate) continue;

      const type: 'debit' | 'credit' = value < 0 ? 'debit' : 'credit';

      transactions.push({
        date,
        description,
        value: Math.abs(value),
        type,
        balance: 0
      });

      console.log(`✅ Transaction: ${date} | ${description.substring(0, 40)} | ${value}`);
    }
    
    // Sort by date
    transactions.sort((a, b) => {
      const [dayA, monthA] = a.date.split('/').map(Number);
      const [dayB, monthB] = b.date.split('/').map(Number);
      if (monthA !== monthB) return monthA - monthB;
      return dayA - dayB;
    });
    
    console.log(`Final transaction count: ${transactions.length}`);
    return transactions;
  }

  private parseValue(valueStr: string): number {
    if (!valueStr) return 0;
    const isNegative = valueStr.startsWith('-');
    const cleanValue = valueStr.replace(/-/g, '').replace(/\./g, '').replace(',', '.');
    const num = parseFloat(cleanValue);
    return isNegative ? -num : num;
  }
}
