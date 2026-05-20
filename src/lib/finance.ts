/*
 * Copyright (C) 2026 LCV Ideas & Software
 * SPDX-License-Identifier: AGPL-3.0-or-later
 */
/**
 * Oráculo Financeiro — Biblioteca de Cálculos Financeiros
 *
 * Fontes e referências:
 *  - Lei 11.033/2004 e Decreto 4.494/2002 (tributação renda fixa)
 *  - ANBIMA: Manual de Precificação de Renda Fixa (2023)
 *  - B3: Especificação Técnica das NTN-B (Tesouro IPCA+)
 *  - Fabozzi, F. J. "Fixed Income Mathematics, Analysis, and Valuation" (CFA Institute, 4ª ed.)
 *  - Hull, J. "Options, Futures and Other Derivatives" — convexidade e sensibilidade de preços
 */

// ─── TRIBUTAÇÃO ──────────────────────────────────────────────────────────────

/**
 * Alíquota de IR para renda fixa tributável — tabela regressiva (Lei 11.033/2004).
 *
 * Faixas:
 *   Até 180 dias:    22,5%
 *   181–360 dias:    20,0%
 *   361–720 dias:    17,5%
 *   Acima de 720:    15,0%
 *
 * Fonte oficial: https://www.tesourodireto.com.br/b/impostos-e-taxas-no-tesouro-direto
 *
 * @param diasCorridos   - Dias desde a aplicação
 * @param _dataCompraISO - (reservado para uso futuro)
 */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
export function aliquotaIrRegressiva(diasCorridos: number, _dataCompraISO?: string): number {
  if (diasCorridos <= 180) return 22.5;
  if (diasCorridos <= 360) return 20;
  if (diasCorridos <= 720) return 17.5;
  return 15;
}

/**
 * Tabela regressiva de IOF — primeiros 30 dias (Decreto 4.494/2002, Art. 29).
 * Índice pelo número de dias completos: IOF[0] = 96%, ..., IOF[29] = 0%.
 */
const IOF_TABELA = [
  96, 93, 90, 86, 83, 80, 76, 73, 70, 66, 63, 60, 56, 53, 50, 46, 43, 40, 36, 33, 30, 26, 23, 20, 16, 13, 10, 6, 3, 0,
];

export function aliquotaIof(diasCorridos: number): number {
  if (diasCorridos >= 30) return 0;
  return IOF_TABELA[Math.max(0, diasCorridos - 1)] ?? 0;
}

// ─── TEMPO ───────────────────────────────────────────────────────────────────

/** Dias corridos entre a data ISO de compra e hoje. */
export function diasDecorridos(dataCompraISO: string): number {
  const compra = new Date(dataCompraISO);
  const hoje = new Date();
  return Math.max(0, Math.floor((hoje.getTime() - compra.getTime()) / 86_400_000));
}

/**
 * Aproximação de dias úteis a partir de dias corridos.
 * Base: 252 dias úteis / 365 dias corridos (padrão ANBIMA).
 */
export function diasUteisAproximados(diasCorridos: number): number {
  return Math.round(diasCorridos * (252 / 365));
}

/**
 * Dias corridos restantes até o IR mínimo (15%) — 720 dias após a compra.
 * Fonte: tabela regressiva Lei 11.033/2004.
 */
export function diasParaMenorIr(dataCompraISO: string): number {
  return Math.max(0, 720 - diasDecorridos(dataCompraISO));
}

// ─── LCI / LCA / CDB ─────────────────────────────────────────────────────────

/**
 * Taxa CDB BRUTA equivalente a uma LCI/LCA isenta de IR.
 *
 * Derivação (ambos produzem mesmo ganho líquido):
 *   CDB_líq = CDB_bruto × (1 − IR)
 *   LCI_líq = LCI_bruto          (isenta)
 *   CDB_líq = LCI_líq  →  CDB_bruto = LCI_bruto / (1 − IR)
 *
 * @param taxaLciPctCdi  - Taxa da LCI/LCA em % do CDI (ex: 91.5)
 * @param aliquotaIr     - Alíquota de IR do CDB para o prazo (ex: 15)
 */
export function cdbEquivalenteALciLca(taxaLciPctCdi: number, aliquotaIr: number): number {
  const fatorLiquido = 1 - aliquotaIr / 100;
  if (fatorLiquido <= 0) return 0;
  return taxaLciPctCdi / fatorLiquido;
}

/**
 * Rendimento bruto absoluto no período (capitalização composta, base 252 d.u.).
 *
 * Fórmula: R = PV × [(1 + CDI_anual × pctCDI / 100)^(DU/252) − 1]
 *
 * @param capital       - Valor investido em R$
 * @param cdiAnualPct   - Taxa CDI anual em % (ex: 10.65 para 10,65% a.a.)
 * @param percentualCdi - Percentual do CDI (ex: 92 para 92% do CDI)
 * @param diasCorridos  - Prazo em dias corridos
 */
export function rendimentoBrutoPeriodo(
  capital: number,
  cdiAnualPct: number,
  percentualCdi: number,
  diasCorridos: number,
): number {
  const du = diasUteisAproximados(diasCorridos);
  const taxaEfetivaAnual = (cdiAnualPct / 100) * (percentualCdi / 100);
  const fatorPeriodo = (1 + taxaEfetivaAnual) ** (du / 252) - 1;
  return capital * fatorPeriodo;
}

/**
 * Rendimento LÍQUIDO para LCI/LCA (isenta de IR e IOF).
 * Idêntico ao bruto — apenas por clareza semântica.
 */
export function rendimentoLiquidoLciLca(
  capital: number,
  cdiAnualPct: number,
  percentualCdi: number,
  diasCorridos: number,
): number {
  return rendimentoBrutoPeriodo(capital, cdiAnualPct, percentualCdi, diasCorridos);
}

/**
 * Rendimento LÍQUIDO para CDB tributável (desconta IOF + IR).
 */
export function rendimentoLiquidoCdb(
  capital: number,
  cdiAnualPct: number,
  percentualCdi: number,
  diasCorridos: number,
): number {
  const bruto = rendimentoBrutoPeriodo(capital, cdiAnualPct, percentualCdi, diasCorridos);
  const iof = aliquotaIof(diasCorridos);
  const ir = aliquotaIrRegressiva(diasCorridos);
  const aposIof = bruto * (1 - iof / 100);
  return aposIof * (1 - ir / 100);
}

/**
 * Ganho real anualizado, descontada a inflação (Fisher equation).
 *
 * Taxa real = [(1 + nominal) / (1 + inflação)] − 1
 *
 * @param nominalAnualPct - Rentabilidade nominal anual em %
 * @param ipcaAnualPct    - Inflação projetada anual em %
 */
export function ganhoRealAnualizado(nominalAnualPct: number, ipcaAnualPct: number): number {
  const nominal = 1 + nominalAnualPct / 100;
  const inflacao = 1 + ipcaAnualPct / 100;
  return (nominal / inflacao - 1) * 100;
}

/**
 * Converte rendimento do período para taxa efetiva anual equivalente (base 252 d.u.).
 */
export function taxaEfetivaAnualDoPeriodo(rendimentoPeriodoPct: number, diasCorridos: number): number {
  const du = diasUteisAproximados(diasCorridos);
  if (du <= 0) return 0;
  return ((1 + rendimentoPeriodoPct / 100) ** (252 / du) - 1) * 100;
}

export type ClassificacaoLci = 'excelente' | 'muito-bom' | 'regular' | 'abaixo';

/**
 * Benchmark da LCI/LCA em relação ao CDI bruto.
 * Referências de mercado (2024-2025): grandes bancos oferecem ~85-90%; médios, ~92-100%.
 */
export function classificarLciLca(percentualCdi: number): {
  classe: ClassificacaoLci;
  label: string;
  descricao: string;
} {
  if (percentualCdi >= 96) {
    return {
      classe: 'excelente',
      label: 'Excelente',
      descricao: 'Acima de 96% CDI — raramente disponível; típico de bancos médios ou CRIs/CRAs.',
    };
  }
  if (percentualCdi >= 91) {
    return {
      classe: 'muito-bom',
      label: 'Muito bom',
      descricao: 'Entre 91-96% CDI — acima da média; vale confirmar solidez do emissor.',
    };
  }
  if (percentualCdi >= 86) {
    return {
      classe: 'regular',
      label: 'Regular',
      descricao: 'Entre 86-91% CDI — faixa típica dos grandes bancos para LCI/LCA.',
    };
  }
  return {
    classe: 'abaixo',
    label: 'Abaixo da média',
    descricao: 'Abaixo de 86% CDI — questione a proposta; Tesouro Selic ou CDB podem ser superiores.',
  };
}

// ─── TESOURO DIRETO IPCA+ ────────────────────────────────────────────────────

/**
 * Duration Modificada (Modified Duration).
 *
 * Fórmula: MD = D_Macaulay / (1 + y/m)
 * onde y = yield to maturity anual (em decimal) e m = frequência de cupons.
 *
 * Para Tesouro IPCA+ Principal (sem cupom): m = 1
 * Para Tesouro IPCA+ com cupons semestrais: m = 2
 *
 * Fonte: Fabozzi (2006), cap. 4
 */
export function durationModificada(macaulayDurationAnos: number, yieldAnualPct: number, mFrequencia = 2): number {
  return macaulayDurationAnos / (1 + yieldAnualPct / 100 / mFrequencia);
}

/**
 * Convexidade aproximada para título de renda fixa.
 *
 * Aproximação: C ≈ D × (D + 1) / (1 + y)²
 * (Válida para títulos com fluxo de pagamentos approximadamente contínuo.)
 *
 * Fonte: Fabozzi (2006), cap. 5; Hull (2018), cap. 9
 */
export function convexidade(macaulayDurationAnos: number, yieldAnualPct: number): number {
  const y = yieldAnualPct / 100;
  return (macaulayDurationAnos * (macaulayDurationAnos + 1)) / (1 + y) ** 2;
}

/**
 * Variação percentual do preço por variação de yield (segunda ordem — com convexidade).
 *
 * ΔP/P ≈ −MD × Δy + ½ × C × (Δy)²
 *
 * Resultado positivo  → preço subiu (ganho para o detentor)
 * Resultado negativo  → preço caiu  (perda para o detentor)
 *
 * Fonte: Fabozzi (2006), eq. 4.12; CFA Institute L1 Fixed Income
 *
 * @param md       - Duration Modificada (anos)
 * @param conv     - Convexidade
 * @param deltaYield - Variação do yield em decimal (taxaAtual − taxaContratada)/100
 */
export function variacaoPrecoPorDuration(md: number, conv: number, deltaYield: number): number {
  return -md * deltaYield + 0.5 * conv * deltaYield * deltaYield;
}

// ─── ANÁLISE DE LOTE TESOURO IPCA+ ───────────────────────────────────────────

export type AnaliseTesouroLote = {
  diasDecorridos: number;
  aliquotaIrAtual: number;
  diasParaMenorIr: number;
  md: number;
  conv: number;
  deltaYield: number; // taxaAtual − taxaContratada (em decimal)
  mtmPct: number; // variação % no preço do título
  mtmR$: number; // ganho/perda absoluto em R$
  ganhoLiquidoHoje: number; // R$ líquido de IR se vender agora
  ganhoLiquidoIrMin: number; // R$ líquido se esperar IR 15%
  economiaIrAguardando: number; // diferença entre os dois (R$)
  taxaEfetivaAbsolutos: number; // rendimento total líquido estimado (bruto IPCA+ + MTM)
};

/**
 * Análise completa de um único lote de Tesouro IPCA+.
 *
 * @param dataCompra        - Data ISO de compra (ex: '2022-03-15')
 * @param valorInvestido    - Capital aplicado em R$
 * @param taxaContratada    - Spread IPCA+ na compra em % a.a. (ex: 6.45)
 * @param taxaAtual         - Spread IPCA+ hoje em % a.a. (ex: 5.80)
 * @param durationAnos      - Macaulay Duration estimada em anos
 */
export function analisarLote(
  dataCompra: string,
  valorInvestido: number,
  taxaContratada: number,
  taxaAtual: number,
  durationAnos: number,
): AnaliseTesouroLote {
  const dias = diasDecorridos(dataCompra);
  const irAtual = aliquotaIrRegressiva(dias, dataCompra);
  const diasIrMin = diasParaMenorIr(dataCompra);

  const md = durationModificada(durationAnos, taxaContratada);
  const conv = convexidade(durationAnos, taxaContratada);
  const deltaYield = (taxaAtual - taxaContratada) / 100; // positivo = taxa subiu = preço caiu

  const varPct = variacaoPrecoPorDuration(md, conv, deltaYield);
  const mtm = valorInvestido * varPct;

  // IR incide apenas sobre o ganho real; prejuízo de MTM não gera crédito fiscal no TD
  const ganhoHoje = mtm > 0 ? mtm * (1 - irAtual / 100) : mtm;
  const ganhoIrMin = mtm > 0 ? mtm * (1 - 0.15) : mtm;
  const economia = ganhoHoje < ganhoIrMin ? ganhoIrMin - ganhoHoje : 0;

  return {
    diasDecorridos: dias,
    aliquotaIrAtual: irAtual,
    diasParaMenorIr: diasIrMin,
    md,
    conv,
    deltaYield,
    mtmPct: varPct * 100,
    mtmR$: mtm,
    ganhoLiquidoHoje: ganhoHoje,
    ganhoLiquidoIrMin: ganhoIrMin,
    economiaIrAguardando: economia,
    taxaEfetivaAbsolutos: valorInvestido + ganhoHoje, // valor líquido estimado hoje
  };
}

// ─── SINAL DE DECISÃO — CARTEIRA TESOURO IPCA+ ───────────────────────────────

export type ForcaSinal = 'forte' | 'moderado' | 'fraco';

export type SinalTesouro = {
  sinal: 'VENDER' | 'AVALIAR' | 'MANTER' | 'AGUARDAR IR';
  forca: ForcaSinal;
  texto: string;
  subTexto: string;
};

/**
 * Gerador de sinal de compra/venda para carteira de Tesouro IPCA+.
 *
 * Lógica baseada em múltiplos fatores simultâneos:
 *  1. Direção do spread IPCA+ (taxa subiu vs caiu vs estável)
 *  2. Magnitude do ganho de MTM
 *  3. Eficiência fiscal (alíquota de IR atual vs mínima 15%)
 *  4. Proximidade do marco de IR mínimo (720 dias)
 *
 * @param taxaMediaContratada   - Spread médio ponderado da carteira (% a.a.)
 * @param taxaAtual             - Spread ofertado hoje (% a.a.)
 * @param diasMediosParaMenorIr - Média ponderada de dias até IR 15%
 * @param aliquotaIrMedia       - Alíquota de IR média ponderada da carteira
 * @param mtmTotal              - Ganho/perda total de MTM em R$
 * @param economiaIrTotal       - Economia total de IR esperando (R$)
 */
export function gerarSinalTesouro(
  taxaMediaContratada: number,
  taxaAtual: number,
  diasMediosParaMenorIr: number,
  aliquotaIrMedia: number,
  mtmTotal: number,
  economiaIrTotal: number,
): SinalTesouro {
  const deltaYield = taxaAtual - taxaMediaContratada; // positivo = taxa subiu = perda

  // ── Taxa subiu → detentor sofre depreciação → manter até vencimento ──────
  if (deltaYield > 0.5) {
    return {
      sinal: 'MANTER',
      forca: 'forte',
      texto: 'Taxa de mercado subiu: carteira sofreu depreciação de MTM.',
      subTexto:
        `Venda antecipada realizaria prejuízo estimado de R$ ${Math.abs(mtmTotal).toFixed(2)}. ` +
        'Manter até o vencimento garante o retorno contratado (IPCA + spread).',
    };
  }

  if (deltaYield > 0.05) {
    return {
      sinal: 'MANTER',
      forca: 'moderado',
      texto: 'Taxa de mercado levemente acima da contratada.',
      subTexto: 'Variação pequena — aguardar reversão antes de agir.',
    };
  }

  if (deltaYield > -0.1) {
    return {
      sinal: 'MANTER',
      forca: 'fraco',
      texto: 'Taxa praticamente estável. Ganho de MTM irrelevante.',
      subTexto: `Diferencial atual: ${deltaYield.toFixed(2)} p.p. Sem catalisador para venda.`,
    };
  }

  // ── Taxa caiu → papel valorizou → avaliar venda ──────────────────────────
  const quedaTaxa = -deltaYield; // valor positivo

  if (quedaTaxa < 0.2) {
    return {
      sinal: 'MANTER',
      forca: 'fraco',
      texto: 'Taxa caiu levemente. Ganho de MTM ainda é marginal.',
      subTexto: `Ganho de mercado: R$ ${mtmTotal.toFixed(2)}. Monitorar evolução.`,
    };
  }

  // Há ganho relevante; verificar eficiência fiscal
  const irMinimo = aliquotaIrMedia <= 15 || diasMediosParaMenorIr === 0;

  if (!irMinimo && diasMediosParaMenorIr > 90) {
    return {
      sinal: 'AGUARDAR IR',
      forca: quedaTaxa > 0.5 ? 'forte' : 'moderado',
      texto: `Aguardar ${diasMediosParaMenorIr} dias para atingir IR mínimo.`,
      subTexto:
        `Economia fiscal esperada: R$ ${economiaIrTotal.toFixed(2)}. ` +
        'Vender agora tem custo tributário alto — a não ser que haja necessidade de liquidez.',
    };
  }

  if (!irMinimo && diasMediosParaMenorIr <= 90) {
    return {
      sinal: 'AVALIAR',
      forca: 'moderado',
      texto: `Janela de decisão: faltam apenas ${diasMediosParaMenorIr} dias para IR mínimo.`,
      subTexto:
        `Economia fiscal esperando: R$ ${economiaIrTotal.toFixed(2)}. ` +
        'Compare com seu custo de oportunidade no período.',
    };
  }

  // IR já no mínimo (15%) — avaliar magnitude
  const irLabel = '15%';
  const fatorLiquido = 1 - aliquotaIrMedia / 100;
  return {
    sinal: 'VENDER',
    forca: quedaTaxa > 0.5 ? 'forte' : 'moderado',
    texto: `Condições favoráveis: taxa caiu e IR já está no mínimo (${irLabel}).`,
    subTexto:
      `Ganho líquido estimado: R$ ${mtmTotal > 0 ? (mtmTotal * fatorLiquido).toFixed(2) : '0,00'}. ` +
      'Janela de venda ativa — realize o lucro ou reaplique em taxa mais alta.',
  };
}

// ─── HELPERS DE CARTEIRA ─────────────────────────────────────────────────────

/**
 * Média ponderada de um campo numérico em relação ao valor investido.
 */
export function mediasPonderadasPorCapital<T extends { valorInvestido: number }>(
  lotes: T[],
  campo: (l: T) => number,
): number {
  const totalCapital = lotes.reduce((s, l) => s + l.valorInvestido, 0);
  if (totalCapital <= 0) return 0;
  return lotes.reduce((s, l) => s + campo(l) * l.valorInvestido, 0) / totalCapital;
}

/**
 * Data média ponderada pelo capital (representação ISO YYYY-MM-DD).
 */
export function dataMediaPonderada<T extends { valorInvestido: number; dataCompra: string }>(lotes: T[]): string {
  const total = lotes.reduce((s, l) => s + l.valorInvestido, 0);
  if (total <= 0) return '';
  const epochMedio = lotes.reduce((s, l) => s + new Date(l.dataCompra).getTime() * l.valorInvestido, 0) / total;
  return new Date(epochMedio).toISOString().slice(0, 10);
}
