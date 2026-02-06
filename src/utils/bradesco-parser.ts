import * as pdfjsLib from "pdfjs-dist";

pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
  "pdfjs-dist/build/pdf.worker.min.mjs",
  import.meta.url
).toString();

export interface BradescoTransaction {
  date: string;
  description: string;
  value: string;
  type: "D" | "C";
  balance?: string;
  document?: string;
}

export interface BradescoExtractedData {
  bankName: string;
  accountInfo: string;
  period: string;
  transactions: BradescoTransaction[];
}

export async function parseBradescoPDF(file: File): Promise<BradescoExtractedData> {
  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  
  let fullText = "";
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(" ");
    fullText += pageText + "\n";
  }

  console.log("Bradesco - Texto bruto:", fullText.substring(0, 3000));

  // Extract account info
  const accountMatch = fullText.match(/Ag[:\s]*(\d+)\s*\|\s*CC[:\s]*(\d+-?\d*)/i);
  const accountInfo = accountMatch 
    ? `Ag: ${accountMatch[1]} CC: ${accountMatch[2]}` 
    : "Conta não identificada";

  // Extract period
  const periodMatch = fullText.match(/Entre\s*(\d{2}\/\d{2}\/\d{4})\s*e\s*(\d{2}\/\d{2}\/\d{4})/i);
  const period = periodMatch 
    ? `${periodMatch[1]} a ${periodMatch[2]}` 
    : "Período não identificado";

  const transactions: BradescoTransaction[] = [];
  
  // Normalize text - collapse multiple spaces but preserve structure
  let normalizedText = fullText.replace(/\s+/g, " ");
  
  // Value pattern: optional minus, digits with dots, comma, 2 decimals
  const valuePattern = /-?\d{1,3}(?:\.\d{3})*,\d{2}/g;
  
  // Date pattern DD/MM/YYYY
  const datePattern = /\d{2}\/\d{2}\/\d{4}/;
  
  // Split into potential transaction segments
  // Each segment starts with either a date or is a continuation line
  
  // Strategy: Find all values and work backwards to find descriptions
  // A transaction line looks like: [DATE?] DESCRIPTION [DOC] VALUE [VALUE] BALANCE
  
  // Split by dates to create blocks
  const dateRegex = /(\d{2}\/\d{2}\/\d{4})/g;
  const parts = normalizedText.split(dateRegex);
  
  let currentDate = "";
  
  // Process parts - odd indices are dates, even indices are content
  for (let i = 0; i < parts.length; i++) {
    const part = parts[i].trim();
    
    // Check if this part is a date
    if (datePattern.test(part) && part.length === 10) {
      const [day, month, year] = part.split("/").map(Number);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12 && year >= 2000) {
        currentDate = part.substring(0, 5); // DD/MM
        continue;
      }
    }
    
    if (!currentDate || !part) continue;
    
    // Skip header content
    if (part.includes("SALDO ANTERIOR")) continue;
    if (part.includes("Lançamento") || part.includes("Crédito (R$)")) continue;
    if (part.includes("Total Disponível")) continue;
    
    // This part contains one or more transactions for currentDate
    // Split by looking for description patterns followed by values
    
    // Find all transaction entries in this block
    // Each entry: DESCRIPTION [DOC_NUMBER] VALUE(s) BALANCE
    
    // Use regex to find transaction boundaries
    // A transaction entry has: text, optional 5+ digit doc, and 1-3 numeric values at the end
    
    const entryPattern = /([A-Za-zÀ-ÿ][^0-9]*?)(?:\s+(\d{5,}))?\s+((?:-?\d{1,3}(?:\.\d{3})*,\d{2}\s*)+)/g;
    
    let match;
    while ((match = entryPattern.exec(part)) !== null) {
      let description = match[1].trim();
      const document = match[2];
      const valuesStr = match[3];
      
      // Skip if description is empty or is header-like
      if (!description) continue;
      if (description === "SALDO" || description.startsWith("Total")) continue;
      
      // Extract all values from the values string
      const values = valuesStr.match(valuePattern) || [];
      
      if (values.length === 0) continue;
      
      // Determine transaction value and balance
      // If multiple values: usually [credit/debit] [balance] or [credit] [debit] [balance]
      // The last value is typically balance
      // Transaction value is the first non-zero value before balance
      
      let transactionValue = "";
      let transactionType: "D" | "C" = "C";
      let balance = values[values.length - 1];
      
      for (let v = 0; v < values.length; v++) {
        const val = values[v];
        const numVal = parseFloat(val.replace(/\./g, "").replace(",", "."));
        
        // Skip if this is the last value (balance) and there are other values
        if (v === values.length - 1 && values.length > 1) continue;
        
        if (numVal !== 0) {
          transactionValue = Math.abs(numVal).toFixed(2).replace(".", ",");
          transactionType = numVal < 0 ? "D" : "C";
          break;
        }
      }
      
      // If only one value, it's both transaction and balance
      if (values.length === 1) {
        const numVal = parseFloat(values[0].replace(/\./g, "").replace(",", "."));
        if (numVal !== 0) {
          transactionValue = Math.abs(numVal).toFixed(2).replace(".", ",");
          transactionType = numVal < 0 ? "D" : "C";
          balance = values[0];
        }
      }
      
      if (!transactionValue) continue;
      
      transactions.push({
        date: currentDate,
        description: description,
        value: transactionValue,
        type: transactionType,
        document: document,
        balance: balance
      });
    }
    
    // If regex didn't find entries, try simpler line-based approach
    if (transactions.length === 0 || !part.match(entryPattern)) {
      // Look for simple value patterns in the text
      const simpleValues = part.match(valuePattern);
      if (simpleValues && simpleValues.length > 0) {
        // Get text before first value as description
        const firstValIdx = part.indexOf(simpleValues[0]);
        const descText = part.substring(0, firstValIdx).trim();
        
        // Split description by known separators if multiple transactions
        // Sometimes lines are concatenated without clear separators
        
        if (descText && !descText.includes("Total") && !descText.includes("SALDO ANTERIOR")) {
          // Check if we already have this transaction
          const exists = transactions.some(t => 
            t.date === currentDate && 
            t.description === descText
          );
          
          if (!exists) {
            const numVal = parseFloat(simpleValues[0].replace(/\./g, "").replace(",", "."));
            if (numVal !== 0) {
              transactions.push({
                date: currentDate,
                description: descText,
                value: Math.abs(numVal).toFixed(2).replace(".", ","),
                type: numVal < 0 ? "D" : "C",
                balance: simpleValues[simpleValues.length - 1]
              });
            }
          }
        }
      }
    }
  }

  // Second pass: handle continuation lines (lines without dates in the original text)
  // These are transactions that belong to the previous date
  // The pattern shows: after a dated line, non-dated lines continue until next date
  
  // Re-process using a different approach: split by value patterns to find each transaction
  const allEntries: BradescoTransaction[] = [];
  
  // Pattern to capture: [optional date] description [doc] values
  // The challenge is that multiple transactions may be on the same "line" in extracted text
  
  // Try splitting the normalized text into transaction chunks
  // Each chunk ends with a balance value (typically after credit/debit values)
  
  // Find all potential transaction descriptions followed by values
  const txPattern = /([A-Za-zÀ-ÿ\*\/\.\-][A-Za-zÀ-ÿ0-9\s\*\/\.\-:]*?)(?:\s+(\d{5,}))?\s+(-?\d{1,3}(?:\.\d{3})*,\d{2})(?:\s+(-?\d{1,3}(?:\.\d{3})*,\d{2}))?/g;
  
  let currentDateForSecondPass = "";
  let textToProcess = normalizedText;
  
  // Remove header sections
  const headerEnd = textToProcess.indexOf("Saldo (R$)");
  if (headerEnd > 0) {
    textToProcess = textToProcess.substring(headerEnd + 10);
  }
  
  // Remove footer sections
  const footerStart = textToProcess.indexOf("Os dados acima");
  if (footerStart > 0) {
    textToProcess = textToProcess.substring(0, footerStart);
  }
  
  // Also remove "Últimos Lançamentos" and "Saldos Invest" sections
  const ultimosIdx = textToProcess.indexOf("Últimos Lançamentos");
  if (ultimosIdx > 0) {
    textToProcess = textToProcess.substring(0, ultimosIdx);
  }
  
  const saldosIdx = textToProcess.indexOf("Saldos Invest");
  if (saldosIdx > 0) {
    textToProcess = textToProcess.substring(0, saldosIdx);
  }
  
  console.log("Bradesco - Texto a processar:", textToProcess);
  
  // Split by dates and process each segment
  const segments = textToProcess.split(/(\d{2}\/\d{2}\/\d{4})/);
  
  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i].trim();
    
    // Check if this is a date
    if (/^\d{2}\/\d{2}\/\d{4}$/.test(seg)) {
      const [day, month] = seg.split("/").map(Number);
      if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
        currentDateForSecondPass = seg.substring(0, 5);
      }
      continue;
    }
    
    if (!currentDateForSecondPass || !seg) continue;
    if (seg.includes("SALDO ANTERIOR")) continue;
    
    // Process this segment to find all transactions
    // Each transaction: DESCRIPTION [DOC] VALUE BALANCE
    // Multiple transactions can be concatenated
    
    // Strategy: find all value sequences and work backwards to find descriptions
    const allValues = [...seg.matchAll(/-?\d{1,3}(?:\.\d{3})*,\d{2}/g)];
    
    if (allValues.length === 0) continue;
    
    // Group values into transactions (usually 2 values per transaction: amount + balance)
    // Or 3 values: credit, debit, balance (but one is usually 0 so shows as 2)
    
    let lastEndIdx = 0;
    
    for (let v = 0; v < allValues.length; v++) {
      const valueMatch = allValues[v];
      const valueStr = valueMatch[0];
      const valueIdx = valueMatch.index!;
      
      // Skip if this appears to be a balance from previous transaction
      // (indicated by being immediately after another value)
      if (v > 0) {
        const prevValue = allValues[v - 1];
        const gapBetween = valueIdx - (prevValue.index! + prevValue[0].length);
        // If gap is small, these values belong together
        if (gapBetween < 3) continue;
      }
      
      // Get description: text from lastEndIdx to current value
      const descText = seg.substring(lastEndIdx, valueIdx).trim();
      
      // Clean up description - remove document numbers at the end
      let cleanDesc = descText.replace(/\s+\d{5,}$/, "").trim();
      
      // Skip empty or invalid descriptions
      if (!cleanDesc || cleanDesc.length < 3) continue;
      if (cleanDesc === "Total" || cleanDesc.includes("Total ")) continue;
      
      // Get document number if present
      const docMatch = descText.match(/(\d{5,})$/);
      const doc = docMatch ? docMatch[1] : undefined;
      
      // Get the transaction value
      const numVal = parseFloat(valueStr.replace(/\./g, "").replace(",", "."));
      
      if (numVal === 0) continue;
      
      // Get balance (next value)
      let balance = valueStr;
      if (v + 1 < allValues.length) {
        balance = allValues[v + 1][0];
      }
      
      allEntries.push({
        date: currentDateForSecondPass,
        description: cleanDesc,
        value: Math.abs(numVal).toFixed(2).replace(".", ","),
        type: numVal < 0 ? "D" : "C",
        document: doc,
        balance: balance
      });
      
      // Update lastEndIdx to after the balance value
      if (v + 1 < allValues.length) {
        lastEndIdx = allValues[v + 1].index! + allValues[v + 1][0].length;
        v++; // Skip the balance value
      } else {
        lastEndIdx = valueIdx + valueStr.length;
      }
    }
  }

  console.log(`Bradesco - Primeira passagem: ${transactions.length} transações`);
  console.log(`Bradesco - Segunda passagem: ${allEntries.length} transações`);
  console.log("Bradesco - Todas transações:", allEntries);

  // Use the result with more transactions
  const finalTransactions = allEntries.length >= transactions.length ? allEntries : transactions;

  return {
    bankName: "Bradesco",
    accountInfo,
    period,
    transactions: finalTransactions
  };
}
