import * as pdfjsLib from "pdfjs-dist";
import { ParsedTransaction } from "@/types/bank-layout";

pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

const SKIP_KEYWORDS = [
  "SALDO ANTERIOR",
  "SALDO TOTAL", 
  "SALDO FINAL",
  "SALDO DISPONÍVEL",
  "SALDO EM",
  "SALDO BLOQUEIO",
  "CENTRAL DE ATENDIMENTO",
  "SAC",
  "www.santander",
  "EXTRATO DE CONTA",
  "Data Histórico",
  "MOVIMENTAÇÃO",
  "Movimentação",
  "Descrição",
  "Nº Documento",
  "Movimentos (R$)",
  "Saldo (R$)",
  "Pagina:",
  "BALP_",
  "Extrato_PJ",
  "setembro/",
  "outubro/",
  "novembro/",
  "dezembro/",
  "janeiro/",
  "fevereiro/",
  "março/",
  "abril/",
  "maio/",
  "junho/",
  "julho/",
  "agosto/",
];

export const santanderParser = {
  async parse(file: File): Promise<ParsedTransaction[]> {
    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;

    let fullText = "";
    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item: any) => item.str)
        .join("\n");
      fullText += pageText + "\n";
    }

    console.log("📄 SANTANDER - Primeiros 3000 caracteres do texto extraído:");
    console.log(fullText.substring(0, 3000));

    // Extract year from header (e.g., "setembro/2025")
    const yearMatch = fullText.match(/(?:janeiro|fevereiro|março|abril|maio|junho|julho|agosto|setembro|outubro|novembro|dezembro)\/(\d{4})/i);
    const year = yearMatch ? parseInt(yearMatch[1]) : new Date().getFullYear();
    console.log(`📅 Ano extraído: ${year}`);

    const transactions: ParsedTransaction[] = [];
    
    // Split text into lines
    const lines = fullText.split(/\n/).map(l => l.trim()).filter(l => l.length > 0);
    
    console.log(`📝 Total de linhas: ${lines.length}`);

    let currentDate: string | null = null;
    let pendingDescription: string | null = null;

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Skip header/footer lines
      const shouldSkip = SKIP_KEYWORDS.some(kw => 
        line.toUpperCase().includes(kw.toUpperCase())
      );
      if (shouldSkip) {
        pendingDescription = null;
        continue;
      }

      // Check if line starts with a date (DD/MM format)
      const dateMatch = line.match(/^(\d{2}\/\d{2})$/);
      if (dateMatch) {
        const [day, month] = dateMatch[1].split("/").map(Number);
        if (day >= 1 && day <= 31 && month >= 1 && month <= 12) {
          currentDate = dateMatch[1];
          console.log(`📅 Nova data: ${currentDate}`);
          pendingDescription = null;
          continue;
        }
      }

      // Skip if no current date set yet
      if (!currentDate) continue;

      // Check for value pattern (with or without trailing dash for debit)
      // Format: 1.234,56 or 1.234,56- or just 234,56 or 234,56-
      const valueMatch = line.match(/^(\d{1,3}(?:\.\d{3})*,\d{2})(-)?$/);
      
      if (valueMatch) {
        // This is a value line - use pending description
        if (pendingDescription) {
          const amountStr = valueMatch[1];
          const isDebit = valueMatch[2] === "-";
          
          const cleanAmount = amountStr.replace(/\./g, "").replace(",", ".");
          const amount = parseFloat(cleanAmount);
          
          if (!isNaN(amount) && amount > 0) {
            const [day, month] = currentDate.split("/").map(Number);
            const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            
            console.log(`✅ ${isoDate} | ${pendingDescription.substring(0, 50)}... | ${amountStr} | ${isDebit ? "D" : "C"}`);
            
            transactions.push({
              date: isoDate,
              description: pendingDescription,
              value: amount,
              balance: 0,
              type: isDebit ? "debit" : "credit",
            });
          }
          pendingDescription = null;
        }
        continue;
      }

      // Check if this is a document number line (like "192201" or "131757" or "3656/000630220")
      const isDocNumber = /^\d{6}$/.test(line) || /^\d{4}\/\d+$/.test(line) || /^\d{16}\s*\/\s*\d+$/.test(line);
      if (isDocNumber) {
        // Append to pending description if exists
        if (pendingDescription) {
          pendingDescription += " " + line;
        }
        continue;
      }

      // Check if line has a hyphen separator (description line without value yet)
      // Format: "A CR COB BLOQ COMP CONF RECEBIMENTO" or "TARIFA MENSALIDADE..."
      if (line === "-") {
        continue; // Skip standalone dash
      }

      // Check for lines like "0000000005886 / 000630220" (reference numbers)
      if (/^\d+\s*\/\s*\d+$/.test(line)) {
        if (pendingDescription) {
          pendingDescription += " " + line;
        }
        continue;
      }

      // This is likely a description line
      // Check if it's a continuation of previous description or a new one
      const hasValue = /\d+,\d{2}-?$/.test(line);
      
      if (!hasValue) {
        // Pure description line - set as pending or append
        if (pendingDescription && line.length < 40 && !line.includes("PIX") && !line.includes("PAGAMENTO") && !line.includes("TARIFA") && !line.includes("RESGATE") && !line.includes("CR COB")) {
          // Likely a continuation (like company name after "PIX ENVIADO")
          pendingDescription += " " + line;
        } else {
          // New description
          pendingDescription = line;
        }
      } else {
        // Line has value at the end
        const match = line.match(/^(.+?)\s+(\d{1,3}(?:\.\d{3})*,\d{2})(-)?$/);
        if (match) {
          const description = match[1].trim();
          const amountStr = match[2];
          const isDebit = match[3] === "-";
          
          const cleanAmount = amountStr.replace(/\./g, "").replace(",", ".");
          const amount = parseFloat(cleanAmount);
          
          if (!isNaN(amount) && amount > 0 && description.length > 2) {
            const [day, month] = currentDate.split("/").map(Number);
            const isoDate = `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
            
            console.log(`✅ ${isoDate} | ${description.substring(0, 50)}... | ${amountStr} | ${isDebit ? "D" : "C"}`);
            
            transactions.push({
              date: isoDate,
              description,
              value: amount,
              balance: 0,
              type: isDebit ? "debit" : "credit",
            });
          }
        }
        pendingDescription = null;
      }
    }

    // Calculate running balance
    let balance = 0;
    for (const t of transactions) {
      const signedValue = t.type === "debit" ? -t.value : t.value;
      balance += signedValue;
      t.balance = Math.round(balance * 100) / 100;
    }

    console.log(`✅ SANTANDER - Total de transações extraídas: ${transactions.length}`);

    return transactions;
  },

  getOFXTransactionType(description: string): string {
    const descUpper = description.toUpperCase();

    if (descUpper.includes("PIX ENVIADO") || descUpper.includes("PIX TRANSF")) {
      return "XFER";
    }
    if (descUpper.includes("PIX RECEBIDO")) {
      return "DEP";
    }
    if (descUpper.includes("TED") || descUpper.includes("TRANSFERENCIA")) {
      return "XFER";
    }
    if (descUpper.includes("PAGAMENTO") || descUpper.includes("PAG ")) {
      return "PAYMENT";
    }
    if (descUpper.includes("TARIFA") || descUpper.includes("TAR ")) {
      return "FEE";
    }
    if (descUpper.includes("RESGATE") || descUpper.includes("CONTAMAX")) {
      return "XFER";
    }
    if (descUpper.includes("CR COB") || descUpper.includes("RECEBIMENTO")) {
      return "DEP";
    }
    if (descUpper.includes("DARF") || descUpper.includes("IOF")) {
      return "PAYMENT";
    }
    if (descUpper.includes("APLICACAO")) {
      return "XFER";
    }
    if (descUpper.includes("BAIXA") || descUpper.includes("DUPL")) {
      return "PAYMENT";
    }
    if (descUpper.includes("ENCARGOS")) {
      return "FEE";
    }

    return "OTHER";
  },
};
