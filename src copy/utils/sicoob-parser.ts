import { BankLayout, ParsedTransaction } from "@/types/bank-layout";
import sicoobLayoutV1 from "@/config/banks/sicoob.json";
import sicoobLayoutV2 from "@/config/banks/sicoob-v2.json";
import sicoobLayoutV3 from "@/config/banks/sicoob-v3.json";
import sicoobLayoutV4 from "@/config/banks/sicoob-v4.json";

export class SicoobParser {
  private layouts: BankLayout[];
  private layout: BankLayout;

  constructor() {
    this.layouts = [
      sicoobLayoutV4 as BankLayout, // Try v4 first (most permissive with Documento column)
      sicoobLayoutV3 as BankLayout, // Try v3 (with Documento column)
      sicoobLayoutV2 as BankLayout,
      sicoobLayoutV1 as BankLayout
    ];
    this.layout = this.layouts[0]; // Default to v4
  }

  /**
   * Detect which layout to use based on PDF content
   * @param pdfText - Raw text content from PDF
   * @returns The matching layout or null
   */
  private detectLayout(pdfText: string): BankLayout | null {
    for (const layout of this.layouts) {
      // Try to match the period pattern
      const periodMatch = pdfText.match(new RegExp(layout.header.patterns.period.regex));
      if (periodMatch) {
        console.log(`✅ Detected layout: ${layout.name} (${layout.version})`);
        return layout;
      }
    }
    
    console.warn("⚠️ No matching layout found, using default");
    return this.layouts[0]; // Fallback to first layout
  }

  /**
   * Parse PDF text content extracted from Sicoob bank statement
   * @param pdfText - Raw text content from PDF
   * @returns Array of parsed transactions
   */
  parsePDFText(pdfText: string): ParsedTransaction[] {
    const transactions: ParsedTransaction[] = [];
    
    // Detect and use the appropriate layout
    const detectedLayout = this.detectLayout(pdfText);
    if (!detectedLayout) {
      console.error("❌ Could not detect PDF layout");
      return transactions;
    }
    this.layout = detectedLayout;
    
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
      // Fallback: try to detect any date range dd/mm/yyyy - dd/mm/yyyy anywhere in the document
      const genericPeriod = pdfText.match(/(\d{2}\/\d{2}\/\d{4})\s*[-–]\s*(\d{2}\/\d{2}\/\d{4})/);
      if (genericPeriod) {
        const startDateStr = genericPeriod[1];
        const endDateStr = genericPeriod[2];
        const [startDay, startMonth, startYear] = startDateStr.split('/');
        const [endDay, endMonth, endYear] = endDateStr.split('/');
        startDate = new Date(parseInt(startYear), parseInt(startMonth) - 1, parseInt(startDay));
        endDate = new Date(parseInt(endYear), parseInt(endMonth) - 1, parseInt(endDay));
        console.warn("⚠️ Period header not matched with layout regex; using generic range detection.");
        console.log(`📅 Period (fallback): ${startDateStr} to ${endDateStr}`);
      } else {
        console.warn("⚠️ Period not found in PDF (no date range detected)");
        return transactions;
      }
    }

    // Find the movements section (try exact, then normalized, then fallback to full text)
    const startsAfter = this.layout.section_movements.starts_after;
    const exactIndex = pdfText.indexOf(startsAfter);
    let movementsText = pdfText;
    if (exactIndex !== -1) {
      movementsText = pdfText.substring(exactIndex);
    } else {
      // Try accent/case-insensitive search on normalized text
      const normalize = (s: string) => s
        .replace(/\u00A0/g, ' ')
        .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
        .toUpperCase();
      const normFull = normalize(pdfText);
      const normMarker = normalize(startsAfter);
      const normIdx = normFull.indexOf(normMarker);
      if (normIdx !== -1) {
        console.warn("⚠️ Movements marker matched only after normalization; parsing full text to avoid index mismatch.");
      } else {
        console.warn("⚠️ Movements section not found; parsing entire text as fallback");
      }
      movementsText = pdfText;
    }
    
    // Extract daily balances from "SALDO DO DIA" lines
    const dailyBalances = new Map<string, number>();
    const balanceRegex = /(\d{2}\/\d{2})\s+SALDO DO DIA\s+(?:R\$\s*)?([\d.,]+)\s*([DC\*])/gm;
    let balanceMatch;
    
    while ((balanceMatch = balanceRegex.exec(movementsText)) !== null) {
      const dateStr = balanceMatch[1];
      const [day, month] = dateStr.split('/');
      
      // Determine year based on the period
      let year = startDate.getFullYear();
      const monthNum = parseInt(month);
      
      // If month is less than start month, it's in the next year (cross-year period)
      if (monthNum < (startDate.getMonth() + 1) && monthNum <= (endDate.getMonth() + 1)) {
        year = endDate.getFullYear();
      }
      
      const fullDate = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      const balanceStr = balanceMatch[2].replace(/\./g, '').replace(',', '.');
      const balance = parseFloat(balanceStr);
      const dcIndicator = balanceMatch[3];
      
      // Apply sign to balance (C = positive, D = negative)
      const signedBalance = dcIndicator === 'D' ? -balance : balance;
      dailyBalances.set(fullDate, signedBalance);
      console.log(`💰 Daily balance ${fullDate}: ${signedBalance.toFixed(2)}`);
    }
    
    // ============================================
    // PARSE TRANSACTIONS directly from text
    // ============================================
    // O pdfjs-dist extrai o texto com múltiplos espaços entre campos, não quebras de linha consistentes
    // Vamos usar o regex diretamente no texto completo
    
    const rawPattern = this.layout.section_movements.transaction_anchor_regex;
    const jsNamedGroupsPattern = rawPattern.replace(/\(\?P<([a-zA-Z0-9_]+)>/g, '(?<$1>');
    const anchorRegex = new RegExp(jsNamedGroupsPattern, 'gm');
    let match;
    const matches: Array<{ index: number; groups: any }> = [];

    console.log(`🔍 Using regex pattern: ${jsNamedGroupsPattern}`);
    console.log(`📄 Searching in text (first 800 chars): ${movementsText.substring(0, 800)}`);
    console.log(`\n📄 Last 1000 chars (page 20 area): ${movementsText.substring(movementsText.length - 1000)}`);
    
    // Debug: Check for the specific missing transaction
    const missingTransactionTest = /30\/06\s+Pix\s+DÉBITO DEVOLUÇÃO PIX.*?252,45D/;
    const hasMissingTransaction = missingTransactionTest.test(movementsText);
    console.log(`\n🔍 Testing for missing transaction "30/06 Pix DÉBITO DEVOLUÇÃO PIX 252,45D": ${hasMissingTransaction ? '✅ FOUND in text' : '❌ NOT FOUND'}`);
    
    if (hasMissingTransaction) {
      // Find the exact position and context
      const debugMatch = movementsText.match(/30\/06\s+Pix\s+D[ÉE]BITO.*?252,45D/);
      if (debugMatch) {
        const startPos = movementsText.indexOf(debugMatch[0]);
        const contextStart = Math.max(0, startPos - 100);
        const contextEnd = Math.min(movementsText.length, startPos + debugMatch[0].length + 100);
        const context = movementsText.substring(contextStart, contextEnd);
        
        console.log(`📋 Exact match: "${debugMatch[0]}"`);
        console.log(`📋 Context (200 chars): "${context}"`);
        console.log(`📋 Match length: ${debugMatch[0].length} chars`);
        
        // Test if our regex can capture it
        const testRegex = new RegExp(jsNamedGroupsPattern);
        const testResult = testRegex.exec(debugMatch[0]);
        console.log(`📋 Our regex matches this text: ${testResult ? '✅ YES' : '❌ NO'}`);
        
        if (testResult) {
          console.log(`✅ SUCCESS! Groups captured:`, testResult.groups);
        } else {
          console.log(`❌ PROBLEM: Our regex pattern cannot match this transaction!`);
          console.log(`💡 The transaction exists in PDF but regex needs adjustment`);
          
          // Try a simplified version
          const simpleTest = /(\d{2}\/\d{2})\s+([^\s]+)\s+(.+?)\s+R\$\s+(\d{1,3}(?:\.\d{3})*,\d{2})([CD\*])/;
          const simpleResult = simpleTest.exec(debugMatch[0]);
          console.log(`📋 Simple regex test: ${simpleResult ? '✅ Works' : '❌ Failed'}`);
          if (simpleResult) {
            console.log(`📋 Simple groups: date=${simpleResult[1]}, doc=${simpleResult[2]}, name=${simpleResult[3]}, amount=${simpleResult[4]}, dc=${simpleResult[5]}`);
          }
        }
      }
    }
    
    // Collect all matches with their positions
    let totalMatches = 0;
    let skippedPageNumbers = 0;
    let skippedHeaders = 0;
    let skippedExcluded = 0;
    let skippedCrossLine = 0;
    
    console.log(`\n🔄 Starting regex loop to collect all matches...`);
    
    while ((match = anchorRegex.exec(movementsText)) !== null) {
      const groups = match.groups;
      if (!groups) continue;
      
      const dateStr = groups.date;
      const name = groups.name?.trim();
      const amount = groups.amount;
      const fullMatch = match[0];
      
      // Debug ALL matches with 252,45 - log IMMEDIATELY when regex captures it
      if (amount === '252,45') {
        console.log(`\n🎯 REGEX CAPTURED 252,45 at position ${match.index}!`);
        console.log(`  📅 Date captured by regex: "${dateStr}"`);
        console.log(`  📄 Doc: "${groups.doc}"`);
        console.log(`  📝 Name (first 100 chars): "${name?.substring(0, 100)}"`);
        console.log(`  💰 Amount: "${amount}${groups.dc}"`);
        console.log(`  📋 Full match (first 250 chars): "${fullMatch.substring(0, 250)}"`);
      }
      
      // FILTER 1: Validate date FIRST (day 1-31, month 1-12) - skip invalid dates immediately
      if (dateStr) {
        const [day, month] = dateStr.split('/').map(n => parseInt(n));
        if (day < 1 || day > 31 || month < 1 || month > 12) {
          if (amount === '252,45') {
            console.log(`  ❌ 252,45 REJECTED: Invalid date ${dateStr} (day=${day}, month=${month})`);
          }
          skippedPageNumbers++;
          
          // Special case: Invalid date (like page numbers) might have captured a valid transaction
          // Split the fullMatch into lines and search each line for valid transaction patterns
          const lines = fullMatch.split(/\n/);
          
          if (amount === '252,45') {
            console.log(`  🔍 Attempting line-by-line recovery for 252,45...`);
            console.log(`  📋 Lines found: ${lines.length}`);
            lines.forEach((line, i) => console.log(`    Line ${i}: "${line.substring(0, 120)}"`));
          }
          
          for (const line of lines) {
            // Try to match a complete transaction in this line (NOT anchored to start/end)
            const lineMatch = line.match(/(\d{2}\/\d{2})\s+(?:([^\s]+)\s+)?(.+?)\s+R\$\s+(\d{1,3}(?:\.\d{3})*,\d{2})([CD\*])/);
            if (lineMatch) {
              const lineDate = lineMatch[1];
              const lineAmount = lineMatch[4];
              const [lineDay, lineMonth] = lineDate.split('/').map(n => parseInt(n));
              
              if (lineAmount === '252,45') {
                console.log(`  🎯 Found 252,45 in line! Date: ${lineDate}, day=${lineDay}, month=${lineMonth}`);
              }
              
              if (lineDay >= 1 && lineDay <= 31 && lineMonth >= 1 && lineMonth <= 12) {
                console.log(`✅ Recovered valid transaction: ${lineDate} ${lineAmount}${lineMatch[5]}`);
                
                const recoveredGroups = {
                  date: lineDate,
                  doc: lineMatch[2]?.trim() || '',
                  name: lineMatch[3]?.trim() || '',
                  amount: lineAmount,
                  dc: lineMatch[5],
                  matchEnd: match.index + fullMatch.indexOf(line) + line.length
                };
                
                matches.push({
                  index: match.index + fullMatch.indexOf(line),
                  groups: recoveredGroups
                });
                
                totalMatches++;
              }
            }
          }
          
          continue; // Skip the invalid date match
        }
      }
      
      if (amount === '252,45') {
        console.log(`  ✅ 252,45 PASSED date validation! Continuing to other filters...`);
      }
      
      totalMatches++;
      
      // Debug specific transactions - show what was captured
      if (amount === '0,90' || amount === '252,45') {
        console.log(`\n🔍 DEBUG transaction ${amount}:`);
        console.log(`  📅 Date: "${dateStr}"`);
        console.log(`  📄 Doc: "${groups.doc}"`);
        console.log(`  📝 Name: "${name?.substring(0, 100)}"`);
        console.log(`  💰 Amount: "${amount}${groups.dc}"`);
        console.log(`  📋 Full match (150 chars): "${fullMatch.substring(0, 150)}"`);
      }
      
      // FILTER 2: Skip if name contains table header keywords
      if (name && (
        (name.includes('Data') && name.includes('Documento') && name.includes('Histórico')) ||
        (name.includes('Documento') && name.includes('Histórico') && name.includes('Valor'))
      )) {
        skippedHeaders++;
        if (amount === '0,90' || amount === '252,45') {
          console.log(`  ❌ FILTER 2 (header): Header keywords detected`);
        }
        continue;
      }
      
      // FILTER 3: Skip if name starts with excluded patterns
      const shouldSkip = this.layout.section_movements.skip_if_name_startswith.some(
        pattern => name?.startsWith(pattern)
      );
      
      if (shouldSkip) {
        skippedExcluded++;
        if (amount === '0,90' || amount === '252,45') {
          console.log(`  ❌ FILTER 3 (excluded pattern): Name starts with excluded pattern`);
        }
        continue;
      }
      
      // FILTER 4: Skip if name contains date pattern DD/MM (not dates like 12.466/2025)
      // Only consider XX/YY where both are 2 digits as cross-line dates
      const validDatePattern = (name?.match(/\b\d{2}\/\d{2}\b/g) || []).length;
      if (validDatePattern > 0) {
        skippedCrossLine++;
        if (amount === '0,90' || amount === '252,45') {
          console.log(`  ❌ FILTER 4 (cross-line, ${validDatePattern} dates in name): Detected date pattern in description`);
        }
        continue;
      }

      if (amount === '0,90' || amount === '252,45') {
        console.log(`  ✅ PASSED all filters! Adding to matches array.`);
      }
      
      // Debug: flag the specific missing transaction if found
      if (groups.date === '30/06' && groups.doc === 'Pix' && groups.amount === '252,45') {
        console.log(`🎯 FOUND THE MISSING TRANSACTION! "${name}"`);
      }

      matches.push({
        index: match.index,
        groups: { ...groups, matchEnd: match.index + match[0].length }
      });
    }
    
    console.log(`📊 Regex captured: ${totalMatches} total matches`);
    console.log(`📊 Filters removed: ${skippedPageNumbers} page numbers, ${skippedHeaders} headers, ${skippedExcluded} excluded, ${skippedCrossLine} cross-line`);
    console.log(`📊 Final result: ${matches.length} valid transactions`);
    
    // Count 252,45 transactions in matches array
    const matches_252_45 = matches.filter(m => m.groups.amount === '252,45');
    console.log(`📊 Transactions with 252,45 in matches array: ${matches_252_45.length}`);
    if (matches_252_45.length > 0) {
      matches_252_45.forEach((m, i) => {
        console.log(`  ${i+1}. Date: ${m.groups.date}, Name: "${m.groups.name?.substring(0, 60)}"`);
      });
    }
    
    console.log(`📊 Total matches found: ${matches.length}`);
    
    // Count 30/06 transactions
    const matches_30_06 = matches.filter(m => m.groups.date === '30/06');
    console.log(`📊 Transactions on 30/06: ${matches_30_06.length}`);

    // Process each match and capture additional details
    for (let i = 0; i < matches.length; i++) {
      const groups = matches[i].groups;
      const matchEnd = groups.matchEnd;
      const nextMatchStart = i < matches.length - 1 ? matches[i + 1].index : movementsText.length;

      const name = groups.name?.trim();
      const document = groups.doc?.trim() || '';
      
      // Debug 252,45 in final processing
      if (groups.amount === '252,45') {
        console.log(`\n🔍 Processing recovered 252,45 in final loop (match ${i}/${matches.length})`);
        console.log(`  📅 Date: ${groups.date}`);
        console.log(`  📝 Name: "${name?.substring(0, 80)}"`);
        console.log(`  📄 Doc: "${document}"`);
      }
      
      // Capture any additional text between this match and the next (for multi-line details)
      const betweenText = movementsText.substring(matchEnd, nextMatchStart).trim();
      const additionalDetails = betweenText.split(/\s{2,}/)[0]?.trim() || ''; // Get first chunk before large gap

      // Extract DOC reference if not already captured
      let docRef = document;
      if (!docRef && additionalDetails) {
        const docMatch = additionalDetails.match(/DOC\.\:\s*([^\s]+)/i);
        if (docMatch) {
          docRef = docMatch[1];
        }
      }

      // Parse date with correct year/month
      const [day, month] = groups.date.split('/');
      const dayNum = parseInt(day);
      const monthNum = parseInt(month);
      
      // Validate day and month ranges
      if (dayNum < 1 || dayNum > 31 || monthNum < 1 || monthNum > 12) {
        console.warn(`⚠️ Invalid date: ${groups.date} (day=${dayNum}, month=${monthNum}) - skipping transaction`);
        if (groups.amount === '252,45') {
          console.log(`  ❌ 252,45 REJECTED in final processing: Invalid date validation`);
        }
        continue;
      }
      
      if (groups.amount === '252,45') {
        console.log(`  ✅ 252,45 passed date validation in final processing`);
      }
      
      let year = startDate.getFullYear();
      
      // If month is less than start month, it's in the next year (cross-year period)
      if (monthNum < (startDate.getMonth() + 1) && monthNum <= (endDate.getMonth() + 1)) {
        year = endDate.getFullYear();
      }
      
      const date = `${year}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
      
      console.log(`📅 Transaction date: ${groups.date} -> ${date} (year=${year}, month=${monthNum}, day=${dayNum})`);

      // Parse amount
      const amountStr = groups.amount.replace(/\./g, '').replace(',', '.');
      const amount = parseFloat(amountStr);
      
      // Determine transaction type based on D/C indicator
      const dcIndicator = groups.dc;
      const sign = this.layout.section_movements.amount.sign_by_dc[dcIndicator] || 1;
      const value = Math.abs(amount);
      const type = sign > 0 ? "credit" : "debit";

      // Build memo: name | details (if exists and different from name)
      let memo = name;
      if (additionalDetails && additionalDetails !== name && !name.includes(additionalDetails)) {
        memo += ` | ${additionalDetails}`;
      }
      if (docRef) {
        memo += ` | DOC: ${docRef}`;
      }

      transactions.push({
        date,
        description: memo.substring(0, 100), // Limit description length
        value,
        balance: 0, // Will be calculated below
        type,
        document: docRef || undefined,
      });
      
      if (groups.amount === '252,45') {
        console.log(`  ✅ 252,45 ADDED to transactions array! Total transactions now: ${transactions.length}`);
        console.log(`    Date: ${date}, Description: "${memo.substring(0, 60)}", Value: ${value}, Type: ${type}`);
      }
    }

    // Sort transactions chronologically (oldest first)
    transactions.sort((a, b) => a.date.localeCompare(b.date));
    
    console.log(`📊 After sort: ${transactions.length} transactions`);
    const transactions_252_45 = transactions.filter(t => t.value === 252.45);
    console.log(`📊 Transactions with value 252.45 after sort: ${transactions_252_45.length}`);
    if (transactions_252_45.length > 0) {
      transactions_252_45.forEach((t, i) => {
        console.log(`  ${i+1}. Date: ${t.date}, Description: "${t.description.substring(0, 60)}", Type: ${t.type}`);
      });
    }
    
    // Apply balances: group transactions by date and apply daily balance
    if (dailyBalances.size > 0) {
      // Get all unique dates from transactions
      const uniqueDates = [...new Set(transactions.map(t => t.date))].sort();
      
      console.log(`📊 Processing ${transactions.length} transactions across ${uniqueDates.length} days`);
      
      for (const date of uniqueDates) {
        // Get all transactions for this date
        const dayTransactions = transactions.filter(t => t.date === date);
        
        // Get the daily balance (end of day balance)
        const endOfDayBalance = dailyBalances.get(date);
        
        if (endOfDayBalance !== undefined) {
          // Calculate start of day balance by subtracting day's transactions from end balance
          let dayTotal = 0;
          dayTransactions.forEach(t => {
            const sign = t.type === "credit" ? 1 : -1;
            dayTotal += sign * t.value;
          });
          
          const startOfDayBalance = endOfDayBalance - dayTotal;
          
          // Apply cumulative balance to each transaction during the day
          let runningBalance = startOfDayBalance;
          dayTransactions.forEach(t => {
            const sign = t.type === "credit" ? 1 : -1;
            runningBalance += sign * t.value;
            t.balance = runningBalance;
            console.log(`  💰 ${t.date} ${t.description.substring(0, 30)} ${t.type} ${t.value.toFixed(2)} -> balance: ${t.balance.toFixed(2)}`);
          });
          
          console.log(`📅 ${date}: Start=${startOfDayBalance.toFixed(2)}, End=${endOfDayBalance.toFixed(2)}, Transactions=${dayTransactions.length}`);
        } else {
          console.warn(`⚠️ No balance found for date ${date}`);
        }
      }
    }

    console.log(`✅ Parsed ${transactions.length} transactions`);
    
    // Final check for 252,45
    const final_252_45 = transactions.filter(t => t.value === 252.45);
    console.log(`📊 Final count of 252.45 transactions before return: ${final_252_45.length}`);
    if (final_252_45.length > 0) {
      final_252_45.forEach((t, i) => {
        console.log(`  ${i+1}. Date: ${t.date}, Desc: "${t.description.substring(0, 50)}", Value: ${t.value}, Balance: ${t.balance}, Type: ${t.type}`);
      });
    }
    
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
      
      if (rule.startswith) {
        const matches = rule.startswith.some(keyword => 
          upperDesc.startsWith(keyword.toUpperCase())
        );
        if (matches) return rule.ofx;
      }
    }
    
    // Default transaction type
    return "OTHER";
  }

  /**
   * Validate if the PDF text matches Sicoob bank format
   * @param pdfText - Raw text content from PDF
   * @returns boolean indicating if it's a valid Sicoob statement
   */
  validateFormat(pdfText: string): boolean {
    console.log("🔍 Validating Sicoob format...");
    console.log("📄 PDF text length:", pdfText.length);
    console.log("📄 First 1000 chars:", pdfText.substring(0, 1000));
    
    // Normalize text for comparison (remove accents, normalize spaces, uppercase)
    const normalizeText = (text: string) => {
      return text
        .replace(/\u00A0/g, ' ')  // Replace non-breaking spaces
        .replace(/\s+/g, ' ')     // Collapse multiple spaces
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')  // Remove accents
        .toUpperCase();
    };
    
    const normalizedText = normalizeText(pdfText);
    
    // Basic Sicoob identifiers - very flexible
    const hasSicoob = normalizedText.includes("SICOOB");
    const hasExtrato = normalizedText.includes("EXTRATO");
    const hasConta = normalizedText.includes("CONTA");
    const hasCooperativa = normalizedText.includes("COOPERATIVA");
    const hasHistorico = normalizedText.includes("HISTORICO") || normalizedText.includes("MOVIMENTACAO");
    const hasPeriodo = normalizedText.includes("PERIODO");
    
    console.log(`  Markers: SICOOB=${hasSicoob}, EXTRATO=${hasExtrato}, CONTA=${hasConta}, COOPERATIVA=${hasCooperativa}, HISTORICO=${hasHistorico}, PERIODO=${hasPeriodo}`);
    
    // Accept if we have SICOOB + at least 2 other bank statement markers
    const markers = [hasExtrato, hasConta, hasCooperativa, hasHistorico, hasPeriodo].filter(m => m).length;
    const isValid = hasSicoob && markers >= 2;
    
    if (isValid) {
      console.log(`✅ Valid Sicoob format detected (${markers} markers found)`);
    } else {
      console.warn(`❌ Not a valid Sicoob format (markers: ${markers})`);
    }
    
    return isValid;
  }
}

export const sicoobParser = new SicoobParser();
