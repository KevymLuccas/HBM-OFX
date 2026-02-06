interface Transaction {
  date: string;
  description: string;
  amount: number;
  type: 'C' | 'D';
}

interface ParseResult {
  transactions: Transaction[];
  periodStart: string;
  periodEnd: string;
}

export async function parseSantander2PDF(file: File): Promise<ParseResult> {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL(
    'pdfjs-dist/build/pdf.worker.min.mjs',
    import.meta.url
  ).toString();

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

  let fullText = '';
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    const pageText = textContent.items
      .map((item: any) => item.str)
      .join(' ');
    fullText += pageText + '\n';
  }

  // Normalize text
  fullText = fullText
    .replace(/\s+/g, ' ')
    .replace(/\s*\/\s*/g, '/')
    .replace(/R\s*\$\s*/g, 'R$');

  console.log('Santander 2 - Extracted text:', fullText.substring(0, 2000));

  const transactions: Transaction[] = [];

  // Map month names to numbers
  const monthMap: Record<string, string> = {
    'janeiro': '01',
    'fevereiro': '02',
    'março': '03',
    'marco': '03',
    'abril': '04',
    'maio': '05',
    'junho': '06',
    'julho': '07',
    'agosto': '08',
    'setembro': '09',
    'outubro': '10',
    'novembro': '11',
    'dezembro': '12'
  };

  // Pattern to find dates like "Segunda, 30 de junho de 2025" or "Sexta, 27 de junho de 2025"
  const datePattern = /(?:Segunda|Terça|Quarta|Quinta|Sexta|Sábado|Domingo)[,\s]+(\d{1,2})\s+de\s+(\w+)\s+de\s+(\d{4})/gi;
  
  // Pattern for transaction lines: DESCRIPTION DEBITO/CREDITO R$VALUE
  const transactionPattern = /([A-ZÁÉÍÓÚÀÃÕÇÊ][A-ZÁÉÍÓÚÀÃÕÇÊ\s.\/\-]+?)\s+(DEBITO|CREDITO)\s+R\$([\d.,]+)/gi;

  // Find all dates and their positions
  const dateMatches: Array<{ date: string; index: number }> = [];
  let dateMatch;
  while ((dateMatch = datePattern.exec(fullText)) !== null) {
    const day = dateMatch[1].padStart(2, '0');
    const monthName = dateMatch[2].toLowerCase();
    const year = dateMatch[3];
    const month = monthMap[monthName] || '01';
    const formattedDate = `${year}-${month}-${day}`;
    dateMatches.push({ date: formattedDate, index: dateMatch.index });
  }

  console.log('Santander 2 - Found dates:', dateMatches);

  // Extract transactions for each date section
  for (let i = 0; i < dateMatches.length; i++) {
    const currentDate = dateMatches[i];
    const nextDateIndex = i + 1 < dateMatches.length ? dateMatches[i + 1].index : fullText.length;
    const section = fullText.substring(currentDate.index, nextDateIndex);

    console.log(`Santander 2 - Processing section for ${currentDate.date}:`, section.substring(0, 300));

    let txMatch;
    const sectionTransactionPattern = /([A-ZÁÉÍÓÚÀÃÕÇÊ][A-ZÁÉÍÓÚÀÃÕÇÊ\s.\/\-]+?)\s+(DEBITO|CREDITO)\s+R\$([\d.,]+)/gi;
    
    while ((txMatch = sectionTransactionPattern.exec(section)) !== null) {
      const description = txMatch[1].trim();
      const debitCredit = txMatch[2].toUpperCase();
      const valueStr = txMatch[3].replace(/\./g, '').replace(',', '.');
      const value = parseFloat(valueStr);

      // Skip invalid entries
      if (isNaN(value) || value === 0) continue;
      if (description.length < 3) continue;
      
      // Skip footer/header content
      if (description.includes('SAC') || 
          description.includes('ATENDIMENTO') ||
          description.includes('OUVIDORIA') ||
          description.includes('CENTRAL')) continue;

      const type = debitCredit === 'CREDITO' ? 'C' : 'D';
      const amount = type === 'D' ? -Math.abs(value) : Math.abs(value);

      transactions.push({
        date: currentDate.date,
        description,
        amount,
        type
      });

      console.log(`Santander 2 - Transaction: ${currentDate.date} | ${description} | ${amount} | ${type}`);
    }
  }

  // Sort by date descending (most recent first)
  transactions.sort((a, b) => b.date.localeCompare(a.date));

  // Determine period
  const dates = transactions.map(t => t.date).sort();
  const periodStart = dates[0] || '';
  const periodEnd = dates[dates.length - 1] || '';

  console.log(`Santander 2 - Total transactions: ${transactions.length}`);
  console.log(`Santander 2 - Period: ${periodStart} to ${periodEnd}`);

  return {
    transactions,
    periodStart,
    periodEnd
  };
}
