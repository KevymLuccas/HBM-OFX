import { ParsedTransaction } from "@/types/bank-layout";

interface ExtratoDados {
  empresa: string;
  cnpj: string;
  agencia: string;
  conta: string;
  periodo: string;
  saldoInicial: number;
  totalEntradas: number;
  totalSaidas: number;
  saldoFinal: number;
}

export const parseGrupoRevolutionPDF = async (text: string): Promise<ParsedTransaction[]> => {
  console.log("=== GRUPO REVOLUTION PARSER START ===");
  
  const transactions: ParsedTransaction[] = [];
  
  // Normalizar texto - remover quebras de linha extras
  const textoNormalizado = text.replace(/\s+/g, " ");
  
  // ========== CAPTURA DADOS DA EMPRESA ==========
  const dados: ExtratoDados = {
    empresa: "",
    cnpj: "",
    agencia: "",
    conta: "",
    periodo: "",
    saldoInicial: 0,
    totalEntradas: 0,
    totalSaidas: 0,
    saldoFinal: 0
  };
  
  if (/GRUPO REVOLUTION/i.test(textoNormalizado)) {
    dados.empresa = "GRUPO REVOLUTION";
  }
  
  const matchCnpj = textoNormalizado.match(/CNPJ\s+([\d.\/-]+)/);
  if (matchCnpj) dados.cnpj = matchCnpj[1];
  
  const matchAgencia = textoNormalizado.match(/Ag[êe]ncia:\s*(\d+)/i);
  if (matchAgencia) dados.agencia = matchAgencia[1];
  
  const matchConta = textoNormalizado.match(/Conta:\s*([\d-]+)/);
  if (matchConta) dados.conta = matchConta[1];
  
  const matchPeriodo = textoNormalizado.match(/(\d{2}\/\d{2}\/\d{4})\s*a\s*(\d{2}\/\d{2}\/\d{4})/);
  if (matchPeriodo) dados.periodo = `${matchPeriodo[1]} a ${matchPeriodo[2]}`;
  
  // Captura resumo financeiro
  const padroes: Record<string, RegExp> = {
    saldoInicial: /Saldo inicial(?:\s+do per[ií]odo)?\s*R\$\s*([\d.,]+)/i,
    totalEntradas: /Total de entradas\s*\+?\s*R\$\s*([\d.,]+)/i,
    totalSaidas: /Total de sa[ií]das\s*-?\s*R\$\s*([\d.,]+)/i,
    saldoFinal: /Saldo final(?:\s+do per[ií]odo)?\s*R\$\s*([\d.,]+)/i
  };
  
  for (const [campo, padrao] of Object.entries(padroes)) {
    const match = textoNormalizado.match(padrao);
    if (match) {
      const valorStr = match[1].replace(/\./g, "").replace(",", ".");
      (dados as any)[campo] = parseFloat(valorStr);
    }
  }
  
  console.log("=== DADOS DA EMPRESA ===");
  console.log(`Empresa: ${dados.empresa}`);
  console.log(`CNPJ: ${dados.cnpj}`);
  console.log(`Período: ${dados.periodo}`);
  console.log(`Saldo inicial: R$ ${dados.saldoInicial.toFixed(2)}`);
  console.log(`Total entradas: R$ ${dados.totalEntradas.toFixed(2)}`);
  console.log(`Total saídas: R$ ${dados.totalSaidas.toFixed(2)}`);
  console.log(`Saldo final: R$ ${dados.saldoFinal.toFixed(2)}`);
  
  // ========== CAPTURA TRANSAÇÕES ==========
  // Padrão: encontrar cada bloco "DD/MM/YYYY Saldo do dia R$ X.XXX,XX" seguido de transações
  
  // Primeiro, extrair todas as datas com saldo do dia - guardar posição do INÍCIO (data)
  const regexSaldoDia = /(\d{2}\/\d{2}\/\d{4})\s*Saldo do dia\s*R\$\s*([\d.,]+)/g;
  const blocosDia: { data: string; saldo: number; inicioData: number; fimSaldo: number }[] = [];
  
  let matchSaldo;
  while ((matchSaldo = regexSaldoDia.exec(textoNormalizado)) !== null) {
    blocosDia.push({
      data: matchSaldo[1],
      saldo: parseFloat(matchSaldo[2].replace(/\./g, "").replace(",", ".")),
      inicioData: matchSaldo.index, // onde começa a data
      fimSaldo: matchSaldo.index + matchSaldo[0].length // onde termina "Saldo do dia R$ X.XXX,XX"
    });
  }
  
  console.log(`\n=== BLOCOS DE DIA ENCONTRADOS: ${blocosDia.length} ===`);
  blocosDia.forEach(b => console.log(`  ${b.data} | Saldo: R$ ${b.saldo.toFixed(2)} | Início: ${b.inicioData} | Fim: ${b.fimSaldo}`));
  
  // Para cada bloco de dia, extrair as transações até o INÍCIO do próximo bloco (próxima data)
  for (let i = 0; i < blocosDia.length; i++) {
    const bloco = blocosDia[i];
    const proximoBloco = blocosDia[i + 1];
    
    // Extrair texto: do fim do "Saldo do dia" atual até o INÍCIO da próxima data
    const inicioTexto = bloco.fimSaldo;
    const fimTexto = proximoBloco ? proximoBloco.inicioData : textoNormalizado.length;
    const textoBloco = textoNormalizado.substring(inicioTexto, fimTexto);
    
    console.log(`\n--- ${bloco.data} ---`);
    console.log(`Texto do bloco (primeiros 300 chars): "${textoBloco.substring(0, 300)}"`);
    
    // Estratégia: dividir o texto por padrões de valor "[+-] R$ X.XXX,XX"
    // E depois processar cada segmento
    
    // Primeiro, encontrar todas as ocorrências de valores
    const regexValor = /([+-])\s*R\$\s*([\d.,]+)/g;
    const valores: { sinal: string; valor: number; posicao: number; fim: number }[] = [];
    
    let matchVal;
    while ((matchVal = regexValor.exec(textoBloco)) !== null) {
      valores.push({
        sinal: matchVal[1],
        valor: parseFloat(matchVal[2].replace(/\./g, "").replace(",", ".")),
        posicao: matchVal.index,
        fim: matchVal.index + matchVal[0].length
      });
    }
    
    console.log(`  Valores encontrados: ${valores.length}`);
    
    // Para cada valor, a descrição está DEPOIS do valor até o próximo valor
    for (let j = 0; j < valores.length; j++) {
      const val = valores[j];
      const proximoVal = valores[j + 1];
      
      // Descrição: do fim do valor atual até o início do próximo valor (ou fim do bloco)
      const inicioDesc = val.fim;
      const fimDesc = proximoVal ? proximoVal.posicao : textoBloco.length;
      let descricao = textoBloco.substring(inicioDesc, fimDesc).trim();
      
      // Limpar descrição - remover cabeçalhos de página que possam estar grudados
      descricao = descricao.replace(/GRUPO REVOLUTION.*?Conta:\s*[\d-]+/gi, "").trim();
      descricao = descricao.replace(/Cora SCFI.*?(?:Extrato do período|período)/gi, "").trim();
      descricao = descricao.replace(/\d{2}\/\d{2}\/\d{4}\s*a\s*\d{2}\/\d{2}\/\d{4}/g, "").trim();
      descricao = descricao.replace(/\d{2}\/\d{2}\/\d{4}\s*Saldo do dia\s*R\$\s*[\d.,]+/g, "").trim();
      descricao = descricao.replace(/Impresso em.*$/gi, "").trim();
      
      // Ignorar se descrição ficou vazia ou muito curta
      if (descricao.length < 3) {
        console.log(`  ⏭️ Ignorado (desc curta): ${val.sinal}R$${val.valor.toFixed(2)}`);
        continue;
      }
      
      // Ignorar linhas de resumo
      if (descricao.match(/^(Total de|Saldo inicial|Saldo final)/i)) {
        console.log(`  ⏭️ Ignorado (resumo): ${descricao.substring(0, 30)}`);
        continue;
      }
      
      const isCredit = val.sinal === "+";
      
      transactions.push({
        date: bloco.data,
        description: descricao.substring(0, 200),
        value: val.valor,
        balance: bloco.saldo,
        type: isCredit ? "credit" : "debit"
      });
      
      console.log(`  ✅ ${val.sinal}R$${val.valor.toFixed(2)} | ${descricao.substring(0, 50)}`);
    }
    
    console.log(`  Total transações neste dia: ${valores.length}`);
  }
  
  // Ordenar transações cronologicamente (mais antiga primeiro)
  transactions.sort((a, b) => {
    const [dayA, monthA, yearA] = a.date.split("/").map(Number);
    const [dayB, monthB, yearB] = b.date.split("/").map(Number);
    const dateA = new Date(yearA, monthA - 1, dayA);
    const dateB = new Date(yearB, monthB - 1, dayB);
    return dateA.getTime() - dateB.getTime();
  });
  
  console.log(`\n=== GRUPO REVOLUTION PARSER END ===`);
  console.log(`Total transações capturadas: ${transactions.length}`);
  
  // Validação
  const totalEntradasCalculado = transactions
    .filter(t => t.type === "credit")
    .reduce((sum, t) => sum + t.value, 0);
  const totalSaidasCalculado = transactions
    .filter(t => t.type === "debit")
    .reduce((sum, t) => sum + t.value, 0);
  
  console.log(`\n=== VALIDAÇÃO ===`);
  console.log(`Entradas: R$ ${totalEntradasCalculado.toFixed(2)} (esperado: R$ ${dados.totalEntradas.toFixed(2)})`);
  console.log(`Saídas: R$ ${totalSaidasCalculado.toFixed(2)} (esperado: R$ ${dados.totalSaidas.toFixed(2)})`);
  
  const diffEntradas = Math.abs(totalEntradasCalculado - dados.totalEntradas);
  const diffSaidas = Math.abs(totalSaidasCalculado - dados.totalSaidas);
  
  if (diffEntradas < 1 && diffSaidas < 1) {
    console.log("✅ Valores conferem!");
  } else {
    console.log(`⚠️ Diferença entradas: R$ ${diffEntradas.toFixed(2)}`);
    console.log(`⚠️ Diferença saídas: R$ ${diffSaidas.toFixed(2)}`);
  }
  
  return transactions;
};
