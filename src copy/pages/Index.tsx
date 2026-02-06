import { useState, useEffect } from "react";
import hbmLogo from "@/assets/hbm-logo-new.jpeg";
import { FileUpload } from "@/components/FileUpload";
import { BankSelector } from "@/components/BankSelector";
import { DataPreviewTable, Transaction } from "@/components/DataPreviewTable";
import { ProcessButton } from "@/components/ProcessButton";
import { DownloadButton } from "@/components/DownloadButton";

import { ConversionCounter } from "@/components/ConversionCounter";
import { Card } from "@/components/ui/card";
import { ArrowRight, FileText, Shield, Zap } from "lucide-react";
import { toast } from "sonner";
import { GlobalWorkerOptions, getDocument } from "pdfjs-dist";
import workerSrc from "pdfjs-dist/build/pdf.worker.min.mjs?url";
import { sicoobParser } from "@/utils/sicoob-parser";
import { sicoob2Parser } from "@/utils/sicoob2-parser";
import { sicoob3Parser } from "@/utils/sicoob3-parser";
import { sicrediParser } from "@/utils/sicredi-parser";
import { sicredi2Parser } from "@/utils/sicredi2-parser";
import { safraParser } from "@/utils/safra-parser";
import { safra2Parser } from "@/utils/safra2-parser";
import { santanderParser } from "@/utils/santander-parser";
import { santander3Parser } from "@/utils/santander3-parser";
import { xpParser } from "@/utils/xp-parser";
import { pagseguroParser } from "@/utils/pagseguro-parser";
import { stoneParser } from "@/utils/stone-parser";
import { sisprime2Parser } from "@/utils/sisprime2-parser";
import { parseSantander2PDF } from "@/utils/santander2-parser";
import { parseBradescoPDF } from "@/utils/bradesco-parser";
import { OnlineUsersIndicator } from "@/components/OnlineUsersIndicator";
import { SupportButton } from "@/components/SupportButton";
import { ItauParser } from "@/utils/itau-parser";
import { Itau2Parser } from "@/utils/itau2-parser";
import { supabase } from "@/integrations/supabase/client";
import { BBParser } from "@/utils/bb-parser";
import { BB2Parser } from "@/utils/bb2-parser";
import { parseGrupoRevolutionPDF } from "@/utils/grupo-revolution-parser";
import { nubankParser } from "@/utils/nubank-parser";
import { btgParser } from "@/utils/btg-parser";
const itauParser = new ItauParser();
const itau2Parser = new Itau2Parser();
const bbParser = new BBParser();
const bb2Parser = new BB2Parser();
const Index = () => {
  const [selectedFile, setSelectedFile] = useState<File | null>(null);
  const [selectedBank, setSelectedBank] = useState("");
  const [isProcessing, setIsProcessing] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [ofxData, setOfxData] = useState<string | null>(null);

  // Configure PDF.js worker
  useEffect(() => {
    GlobalWorkerOptions.workerSrc = workerSrc;
  }, []);

  // Mock data generator for demonstration - generates extensive transaction list
  const generateMockTransactions = (): Transaction[] => {
    const transactions: Transaction[] = [];
    let currentBalance = 10000.0;
    const startDate = new Date("2024-01-01");

    // Generate 50+ transactions to demonstrate full data display
    const transactionTemplates = [{
      description: "Pagamento de salário",
      value: 5000.0,
      type: "credit" as const
    }, {
      description: "Supermercado",
      value: -350.5,
      type: "debit" as const
    }, {
      description: "Transferência recebida",
      value: 1200.0,
      type: "credit" as const
    }, {
      description: "Conta de luz",
      value: -180.75,
      type: "debit" as const
    }, {
      description: "Restaurante",
      value: -125.0,
      type: "debit" as const
    }, {
      description: "Farmácia",
      value: -85.3,
      type: "debit" as const
    }, {
      description: "Posto de gasolina",
      value: -250.0,
      type: "debit" as const
    }, {
      description: "PIX recebido",
      value: 500.0,
      type: "credit" as const
    }, {
      description: "Conta de internet",
      value: -120.0,
      type: "debit" as const
    }, {
      description: "Shopping",
      value: -450.8,
      type: "debit" as const
    }, {
      description: "Freelance - pagamento",
      value: 2500.0,
      type: "credit" as const
    }, {
      description: "Aluguel",
      value: -1500.0,
      type: "debit" as const
    }, {
      description: "Academia",
      value: -150.0,
      type: "debit" as const
    }, {
      description: "Netflix",
      value: -45.9,
      type: "debit" as const
    }, {
      description: "Spotify",
      value: -21.9,
      type: "debit" as const
    }, {
      description: "Uber",
      value: -35.5,
      type: "debit" as const
    }, {
      description: "iFood",
      value: -68.9,
      type: "debit" as const
    }, {
      description: "Reembolso",
      value: 200.0,
      type: "credit" as const
    }, {
      description: "Conta de água",
      value: -95.4,
      type: "debit" as const
    }, {
      description: "Mercado Livre - compra",
      value: -380.0,
      type: "debit" as const
    }, {
      description: "Cashback",
      value: 50.0,
      type: "credit" as const
    }, {
      description: "Padaria",
      value: -25.5,
      type: "debit" as const
    }, {
      description: "Rendimento poupança",
      value: 15.3,
      type: "credit" as const
    }, {
      description: "Livraria",
      value: -120.0,
      type: "debit" as const
    }, {
      description: "Seguro",
      value: -280.0,
      type: "debit" as const
    }];

    // Generate transactions spanning multiple months
    for (let i = 0; i < 60; i++) {
      const template = transactionTemplates[i % transactionTemplates.length];
      const date = new Date(startDate);
      date.setDate(startDate.getDate() + i);
      const value = template.value * (0.8 + Math.random() * 0.4); // Add variation
      currentBalance += value;
      transactions.push({
        date: date.toISOString().split("T")[0],
        description: `${template.description} ${i > 24 ? `(${Math.floor(i / 25) + 1})` : ""}`.trim(),
        value: Math.abs(value),
        balance: currentBalance,
        type: template.type
      });
    }
    return transactions.reverse(); // Most recent first
  };
  const extractTextFromPDF = async (file: File): Promise<string> => {
    try {
      console.log("Starting PDF extraction...");
      console.log("File name:", file.name);
      console.log("File size:", file.size);
      console.log("File type:", file.type);
      const arrayBuffer = await file.arrayBuffer();
      console.log("ArrayBuffer created, size:", arrayBuffer.byteLength);
      const loadingTask = getDocument({
        data: arrayBuffer
      });
      console.log("Loading task created");
      const pdf = await loadingTask.promise;
      console.log("PDF loaded successfully, pages:", pdf.numPages);
      let fullText = "";
      for (let i = 1; i <= pdf.numPages; i++) {
        console.log(`Processing page ${i}/${pdf.numPages}`);
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += pageText + "\n";
        console.log(`Page ${i} extracted, length:`, pageText.length);
      }
      console.log("Total text extracted, length:", fullText.length);
      console.log("First 500 chars:", fullText.substring(0, 500));
      return fullText;
    } catch (error) {
      console.error("Detailed error extracting PDF text:", error);
      console.error("Error name:", (error as Error).name);
      console.error("Error message:", (error as Error).message);
      console.error("Error stack:", (error as Error).stack);
      throw new Error(`Erro ao extrair texto do PDF: ${(error as Error).message}`);
    }
  };
  const handleProcess = async () => {
    if (!selectedFile || !selectedBank) {
      toast.error("Por favor, selecione um arquivo e um banco");
      return;
    }
    setIsProcessing(true);
    try {
      let extractedTransactions: Transaction[];
      if (selectedBank === "sicoob") {
        // Real parsing for Sicoob
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!sicoobParser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Sicoob");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = sicoobParser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "sicoob2") {
        // Real parsing for Sicoob v2
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!sicoob2Parser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Sicoob v2");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = sicoob2Parser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "sicoob3") {
        // Real parsing for Sicoob 3
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!sicoob3Parser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Sicoob 3");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = sicoob3Parser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "sicredi") {
        // Real parsing for Sicredi
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!sicrediParser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Sicredi");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = sicrediParser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "sicredi2") {
        // Real parsing for Sicredi 2
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!sicredi2Parser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Sicredi 2");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = sicredi2Parser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "itau") {
        // Real parsing for Itaú
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!itauParser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Itaú");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = itauParser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "itau2") {
        // Real parsing for Itaú 2
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!itau2Parser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Itaú 2");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = itau2Parser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "bb") {
        // Real parsing for Banco do Brasil
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!bbParser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Banco do Brasil");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = bbParser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "bb2") {
        // Real parsing for Banco do Brasil 2
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!bb2Parser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Banco do Brasil 2");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = bb2Parser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "safra") {
        // Real parsing for Safra
        toast.info("Processando extrato Safra...");
        const parsedTransactions = await safraParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "safra2") {
        // Real parsing for Safra 2
        toast.info("Processando extrato Safra 2...");
        const parsedTransactions = await safra2Parser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "santander") {
        // Real parsing for Santander
        toast.info("Processando extrato Santander...");
        const parsedTransactions = await santanderParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "xp") {
        // Real parsing for XP
        toast.info("Processando extrato XP...");
        const parsedTransactions = await xpParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "pagseguro") {
        // Real parsing for PagSeguro
        toast.info("Processando extrato PagSeguro...");
        const parsedTransactions = await pagseguroParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "stone") {
        // Real parsing for Stone
        toast.info("Processando extrato Stone...");
        const parsedTransactions = await stoneParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "bradesco") {
        // Real parsing for Bradesco
        toast.info("Processando extrato Bradesco...");
        const result = await parseBradescoPDF(selectedFile);
        if (result.transactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = result.transactions.map(t => ({
          date: t.date.length === 5 ? `2025-${t.date.split("/")[1]}-${t.date.split("/")[0]}` : 
                `${t.date.split("/")[2]}-${t.date.split("/")[1]}-${t.date.split("/")[0]}`,
          description: t.description,
          value: parseFloat(t.value.replace(/\./g, "").replace(",", ".")),
          balance: t.balance ? parseFloat(t.balance.replace(/\./g, "").replace(",", ".")) : 0,
          type: t.type === "C" ? "credit" as const : "debit" as const
        }));
        toast.success(`${extractedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "santander2") {
        // Real parsing for Santander 2
        toast.info("Processando extrato Santander 2...");
        const result = await parseSantander2PDF(selectedFile);
        if (result.transactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = result.transactions.map(t => ({
          date: t.date,
          description: t.description,
          value: Math.abs(t.amount),
          balance: 0,
          type: t.type === "C" ? "credit" as const : "debit" as const
        }));
        toast.success(`${extractedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "santander3") {
        // Real parsing for Santander 3
        toast.info("Processando extrato Santander 3...");
        const parsedTransactions = await santander3Parser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "sisprime2") {
        // Real parsing for Sisprime 2
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);

        // Validate format
        if (!sisprime2Parser.validateFormat(pdfText)) {
          toast.error("O arquivo não parece ser um extrato do Sisprime");
          setIsProcessing(false);
          return;
        }
        toast.info("Processando transações...");
        const parsedTransactions = sisprime2Parser.parsePDFText(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions.map(t => ({
          date: `${t.date.split("/")[2]}-${t.date.split("/")[1]}-${t.date.split("/")[0]}`,
          description: t.description,
          value: t.value,
          balance: t.balance || 0,
          type: t.type
        }));
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "cora") {
        // Real parsing for Grupo Revolution
        toast.info("Extraindo texto do PDF...");
        const pdfText = await extractTextFromPDF(selectedFile);
        
        toast.info("Processando transações...");
        const parsedTransactions = await parseGrupoRevolutionPDF(pdfText);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions.map(t => ({
          date: t.date.includes("/") ? 
            `${t.date.split("/")[2]}-${t.date.split("/")[1]}-${t.date.split("/")[0]}` : 
            t.date,
          description: t.description,
          value: t.value,
          balance: t.balance || 0,
          type: t.type
        }));
        toast.success(`${extractedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "nubank") {
        // Real parsing for Nubank
        toast.info("Processando extrato Nubank...");
        const parsedTransactions = await nubankParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else if (selectedBank === "btg") {
        // Real parsing for BTG Pactual
        toast.info("Processando extrato BTG Pactual...");
        const parsedTransactions = await btgParser.parse(selectedFile);
        if (parsedTransactions.length === 0) {
          toast.warning("Nenhuma transação encontrada no extrato");
          setIsProcessing(false);
          return;
        }
        extractedTransactions = parsedTransactions;
        toast.success(`${parsedTransactions.length} transações extraídas com sucesso!`);
      } else {
        // Mock data for other banks
        await new Promise(resolve => setTimeout(resolve, 1500));
        extractedTransactions = generateMockTransactions();
        toast.success("Arquivo processado (modo demonstração)");
      }
      console.log(`📊 Setting ${extractedTransactions.length} transactions to state`);
      const transactions_252_45_before_state = extractedTransactions.filter(t => t.value === 252.45);
      console.log(`📊 Transactions with value 252.45 before setState: ${transactions_252_45_before_state.length}`);
      if (transactions_252_45_before_state.length > 0) {
        transactions_252_45_before_state.forEach((t, i) => {
          console.log(`  ${i + 1}. Date: ${t.date}, Desc: "${t.description.substring(0, 60)}", Type: ${t.type}, Value: ${t.value}`);
        });
      }
      setTransactions(extractedTransactions);

      // Generate OFX data
      const ofxContent = generateOFXContent(extractedTransactions, selectedBank);
      setOfxData(ofxContent);

      // Record conversion with bank info
      const bankNames: Record<string, string> = {
        sicoob: "Sicoob",
        sicoob2: "Sicoob 2",
        sicoob3: "Sicoob 3",
        sicredi: "Sicredi",
        itau: "Itaú",
        itau2: "Itaú 2",
        bradesco: "Bradesco",
        safra: "Safra",
        safra2: "Safra 2",
        santander: "Santander",
        santander2: "Santander 2",
        santander3: "Santander 3",
        xp: "XP Investimentos",
        bb: "Banco do Brasil",
        bb2: "Banco do Brasil 2",
        pagseguro: "PagSeguro",
        stone: "Stone",
        sisprime2: "Sisprime",
        cora: "Cora",
        nubank: "Nubank",
        btg: "BTG Pactual",
      };
      try {
        await supabase.from("conversions").insert({
          bank_id: selectedBank,
          bank_name: bankNames[selectedBank] || selectedBank,
        });
      } catch (err) {
        console.log("Failed to record conversion:", err);
      }
    } catch (error) {
      console.error("Processing error:", error);
      toast.error("Erro ao processar o arquivo. Verifique se é um extrato válido.");
    } finally {
      setIsProcessing(false);
    }
  };
  const generateOFXContent = (transactions: Transaction[], bank: string): string => {
    const now = new Date();
    const timestamp = now.toISOString().replace(/[-:]/g, "").split(".")[0];

    // Sort transactions chronologically (oldest first) for OFX standard
    const sortedTransactions = [...transactions].sort((a, b) => a.date.localeCompare(b.date));

    // Get date range
    const startDate = sortedTransactions[0].date.replace(/-/g, "");
    const endDate = sortedTransactions[sortedTransactions.length - 1].date.replace(/-/g, "");

    // Get final balance (last transaction's balance)
    const finalBalance = sortedTransactions[sortedTransactions.length - 1].balance;
    let ofx = `OFXHEADER:100
DATA:OFXSGML
VERSION:102
SECURITY:NONE
ENCODING:USASCII
CHARSET:1252
COMPRESSION:NONE
OLDFILEUID:NONE
NEWFILEUID:NONE

<OFX>
  <SIGNONMSGSRSV1>
    <SONRS>
      <STATUS>
        <CODE>0</CODE>
        <SEVERITY>INFO</SEVERITY>
      </STATUS>
      <DTSERVER>${timestamp}</DTSERVER>
      <LANGUAGE>POR</LANGUAGE>
    </SONRS>
  </SIGNONMSGSRSV1>
  <BANKMSGSRSV1>
    <STMTTRNRS>
      <TRNUID>1</TRNUID>
      <STATUS>
        <CODE>0</CODE>
        <SEVERITY>INFO</SEVERITY>
      </STATUS>
      <STMTRS>
        <CURDEF>BRL</CURDEF>
        <BANKACCTFROM>
          <BANKID>756</BANKID>
          <ACCTID>XXXXXX</ACCTID>
          <ACCTTYPE>CHECKING</ACCTTYPE>
        </BANKACCTFROM>
        <BANKTRANLIST>
          <DTSTART>${startDate}</DTSTART>
          <DTEND>${endDate}</DTEND>`;
    sortedTransactions.forEach((transaction, index) => {
      // Get proper OFX transaction type
      let trnType = transaction.type === "credit" ? "CREDIT" : "DEBIT";
      if (bank === "sicoob") {
        trnType = sicoobParser.getOFXTransactionType(transaction.description);
      } else if (bank === "sicoob2") {
        trnType = sicoob2Parser.getOFXTransactionType(transaction.description);
      } else if (bank === "sicredi") {
        trnType = sicrediParser.getOFXTransactionType(transaction.description);
      } else if (bank === "safra") {
        trnType = safraParser.getOFXTransactionType(transaction.description);
      } else if (bank === "safra2") {
        trnType = safra2Parser.getOFXTransactionType(transaction.description);
      } else if (bank === "santander") {
        trnType = santanderParser.getOFXTransactionType(transaction.description);
      } else if (bank === "xp") {
        trnType = xpParser.getOFXTransactionType(transaction.description);
      } else if (bank === "pagseguro") {
        trnType = pagseguroParser.getOFXTransactionType(transaction.description);
      } else if (bank === "stone") {
        trnType = stoneParser.getOFXTransactionType(transaction.description);
      } else if (bank === "nubank") {
        trnType = nubankParser.getOFXTransactionType(transaction.description);
      } else if (bank === "bb" || bank === "bradesco") {
        // BB and Bradesco use simple credit/debit mapping
        trnType = transaction.type === "credit" ? "CREDIT" : "DEBIT";
      }

      // Amount should be positive for credits, negative for debits
      const amount = transaction.type === "credit" ? transaction.value : -transaction.value;

      // Generate unique FITID using date, amount, and description hash
      const fitidBase = `${transaction.date}${amount.toFixed(2)}${transaction.description.substring(0, 20)}${index}`;
      const fitid = Array.from(fitidBase).reduce((hash, char) => (hash << 5) - hash + char.charCodeAt(0), 0).toString(36).substring(0, 32);
      ofx += `
          <STMTTRN>
            <TRNTYPE>${trnType}</TRNTYPE>
            <DTPOSTED>${transaction.date.replace(/-/g, "")}</DTPOSTED>
            <TRNAMT>${amount.toFixed(2)}</TRNAMT>
            <FITID>${fitid}</FITID>
            <MEMO>${transaction.description}</MEMO>
          </STMTTRN>`;
    });
    ofx += `
        </BANKTRANLIST>
        <LEDGERBAL>
          <BALAMT>${finalBalance.toFixed(2)}</BALAMT>
          <DTASOF>${endDate}</DTASOF>
        </LEDGERBAL>
      </STMTRS>
    </STMTTRNRS>
  </BANKMSGSRSV1>
</OFX>`;
    return ofx;
  };
  const handleDownload = () => {
    if (!ofxData) return;
    const blob = new Blob([ofxData], {
      type: "application/x-ofx"
    });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `extrato_${selectedBank}_${new Date().getTime()}.ofx`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    document.body.removeChild(a);
    toast.success("Arquivo OFX baixado com sucesso!");
  };
  return <div className="min-h-screen bg-background">
      {/* Hero Section */}
      <header className="bg-gradient-hero text-primary-foreground py-12 px-4 shadow-xl">
        <div className="container max-w-6xl mx-auto flex flex-col md:flex-row items-center justify-center gap-8">
          {/* Logo - half of the blue area */}
          <div className="flex-shrink-0">
            <img 
              src={hbmLogo} 
              alt="HBM Assessores" 
              className="h-20 md:h-24 w-auto rounded-xl"
            />
          </div>
          
          {/* Text content */}
          <div className="text-center md:text-left">
            <h1 className="text-3xl md:text-4xl font-bold mb-2 text-primary-foreground">
              HBM OFX Converter
            </h1>
            <p className="text-lg md:text-xl text-primary-foreground/90 max-w-xl">
              Transforme seus extratos bancários em PDF para o formato OFX de forma rápida e segura
            </p>
          </div>
        </div>
      </header>

      {/* Features */}
      <section className="py-12 px-4 border-b">
        <div className="container max-w-6xl mx-auto">
          <div className="grid md:grid-cols-3 gap-6">
            <Card className="p-6 bg-gradient-card shadow-md hover:shadow-lg transition-smooth">
              <div className="bg-primary/10 rounded-lg w-12 h-12 flex items-center justify-center mb-4">
                <Zap className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Rápido e Eficiente</h3>
              <p className="text-muted-foreground">
                Processe extratos em segundos com tecnologia avançada de análise
              </p>
            </Card>
            <Card className="p-6 bg-gradient-card shadow-md hover:shadow-lg transition-smooth">
              <div className="bg-primary/10 rounded-lg w-12 h-12 flex items-center justify-center mb-4">
                <Shield className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Seguro e Confiável</h3>
              <p className="text-muted-foreground">
                Seus dados financeiros são processados com máxima segurança
              </p>
            </Card>
            <Card className="p-6 bg-gradient-card shadow-md hover:shadow-lg transition-smooth">
              <div className="bg-primary/10 rounded-lg w-12 h-12 flex items-center justify-center mb-4">
                <ArrowRight className="h-6 w-6 text-primary" />
              </div>
              <h3 className="text-lg font-semibold mb-2">Multi-Banco</h3>
              <p className="text-muted-foreground">
                Suporte para os principais bancos do Brasil
              </p>
            </Card>
          </div>
        </div>
      </section>

      {/* Main Converter Section */}
      <main className="py-16 px-4">
        <div className="container max-w-4xl mx-auto">
          <Card className="p-8 shadow-xl bg-gradient-card">
            <div className="space-y-8">
              {/* File Upload */}
              <div>
                <h2 className="text-2xl font-bold mb-6 text-foreground">
                  1. Selecione o extrato bancário
                </h2>
                <FileUpload onFileSelect={setSelectedFile} selectedFile={selectedFile} />
              </div>

              {/* Bank Selection */}
              <div>
                <h2 className="text-2xl font-bold mb-6 text-foreground">
                  2. Escolha o banco
                </h2>
                <BankSelector value={selectedBank} onValueChange={setSelectedBank} />
                
                {/* Bank Layout Preview */}
              </div>

              {/* Process Button */}
              <div>
                <h2 className="text-2xl font-bold mb-6 text-foreground">
                  3. Processar o arquivo
                </h2>
                <ProcessButton onClick={handleProcess} disabled={!selectedFile || !selectedBank} isProcessing={isProcessing} />
                <div className="mt-4">
                  <OnlineUsersIndicator />
                  <ConversionCounter />
                </div>
              </div>
            </div>
          </Card>

          {/* Data Preview */}
          {transactions.length > 0 && <div className="mt-12 space-y-6">
              <h2 className="text-3xl font-bold text-foreground">
                4. Revisar e baixar
              </h2>
              <DataPreviewTable transactions={transactions} />
              <DownloadButton onClick={handleDownload} disabled={!ofxData} />
            </div>}
        </div>
      </main>

      {/* Footer */}
      <footer className="border-t py-8 px-4 bg-muted/30">
        <div className="container max-w-6xl mx-auto text-center text-muted-foreground">
          
        </div>
      </footer>
      <SupportButton />
    </div>;
};
export default Index;