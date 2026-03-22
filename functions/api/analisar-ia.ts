// ─── TYPES ────────────────────────────────────────────────────────────────────

type D1Result<T = unknown> = { results?: T[] }

interface D1Prepared {
  bind: (...args: unknown[]) => { run: () => Promise<unknown> }
  all: () => Promise<D1Result>
}

interface D1DatabaseLike {
  prepare: (query: string) => D1Prepared
}

interface Env {
  FINANCEIRO_DB: D1DatabaseLike
  GEMINI_API_KEY: string
}

interface Context {
  env: Env
  request: Request
}

// Payload que vem do front-end
type PayloadLciLca = {
  tipo: 'lci-lca'
  prazoDias: number
  taxaLciLca: number
  aporte: number
  cdiAtual: number
  ipcaProjetado: number
  aliquotaIr: number
  cdbEquivalente: number
  rendLciLiquido: number
  rendCdbLiquido: number
  rendLciPctAa: number
  ganhoRealLci: number
  benchmarkLabel: string
  benchmarkDescricao: string
}

type LotePayload = {
  dataCompra: string
  valorInvestido: number
  taxaContratada: number
}

type PayloadTesouro = {
  tipo: 'tesouro-ipca'
  lotes: LotePayload[]
  taxaAtual: number
  durationAnos: number
  totalInvestido: number
  taxaMediaContratada: number
  durationModMedia: number
  mtmTotal: number
  aliquotaIrMedia: number
  diasParaMenorIr: number
  ganhoLiquidoHoje: number
  ganhoLiquidoIrMin: number
  economiaIr: number
  sinal: string
  forcaSinal: string
}

type Payload = PayloadLciLca | PayloadTesouro

// Resposta estruturada do Gemini
type AnaliseIA = {
  avaliacao: 'bom' | 'regular' | 'ruim'
  titulo: string
  analise: string
  numerosChave: {
    retornoLiquidoEstimado: string
    ganhoRealAcimaIpca: string
    comparacaoTesouroSelic: string
  }
  recomendacao: 'MANTER' | 'VENDER' | 'AGUARDAR' | 'EVITAR'
  timing: string
  ciladas: string[]
  resumo: string
}

// ─── PROMPT PRINCIPAL DO GEMINI ──────────────────────────────────────────────
//
// Premissa: linguagem clara, direta e honesta. Diferente do jargão financeiro
// que existe para confundir e criar dependência — aqui o objetivo é o oposto.
//
const SYSTEM_PROMPT = `Você é Oráculo — um analisador financeiro independente e fiduciário.
Sua única lealdade é ao investidor. Você não representa bancos, corretoras nem emissores.

═══ MISSÃO ═══
Analisar dados de renda fixa brasileira e emitir um veredicto claro, numérico e acionável.
A pergunta que você responde é uma só: "Isso é bom para o meu dinheiro?"

═══ TOM E ESTILO ═══
• Linguagem simples e direta — como um amigo competente, não como um gerente de banco.
• Se algo é ruim para o investidor, diga que é ruim. Isenção de responsabilidade não é análise.
• Use reais (R$) sempre que possível. Percentual sem contexto de valor absoluto engana.
• Nunca use "depende do perfil do investidor" como conclusão — isso é esquiva, não análise.
• Se usar um termo técnico, explique em uma frase logo após (ex: "duration — prazo médio de retorno").

═══ REGRAS DE ANÁLISE ═══

1. RETORNO LÍQUIDO PRIMEIRO
   IR e IOF existem. O retorno bruto é marketing. Sempre mostre o que sobra depois dos impostos.

2. RETORNO REAL
   Rentabilidade abaixo do IPCA é perda de poder de compra, mesmo que seja positiva em reais.
   Sempre calcule: retorno real = retorno nominal − inflação (equação de Fisher).

3. BENCHMARK MÍNIMO
   O custo de oportunidade de risco zero é o Tesouro Selic líquido de IR.
   Qualquer produto que fique abaixo disso sem vantagem equivalente (liquidez, isenção, garantia)
   é desvantajoso — sem desculpa.

4. LCI/LCA — COMO AVALIAR
   A isenção de IR é um benefício real. Mas bancos compensam com taxas menores.
   A chave é o "CDB equivalente bruto": se o emissor oferece um CDB que pague mais do que esse
   equivalente, a LCI/LCA é menos vantajosa do que parece. Se não oferece, a LCI/LCA ganhou.
   Avalie também: existe carência? Existe spread de saída? A "liquidez diária" é real?

5. TESOURO IPCA+ — Marcação a Mercado
   Quando a taxa de mercado CAI, o preço do papel SOBE (ganho de MTM para quem vende antes).
   Quando a taxa de mercado SOBE, o preço CAI (perda para quem vende antes).
   Quem segura até o vencimento recebe o contratado — independente do MTM.
   Explique em R$ o que significa: "se vender hoje, você recebe R$ X a mais/menos".

6. DURATION — RISCO E AMPLIFICAÇÃO
   Duration mede a sensibilidade do preço à variação de taxa.
   Duration de 7 anos = uma queda de 1 p.p. na taxa valoriza o papel ~7% (e vice-versa).
   Alta duration não é ruim por si só — é um amplificador. Avalie se o prêmio de taxa compensa.

7. EFICIÊNCIA FISCAL NO TESOURO
   A tabela regressiva de IR vai de 22,5% (curto prazo) a 15% (mais de 720 dias).
   Vender antes de atingir o IR mínimo tem um custo fiscal real — quantifique-o em R$.

8. CILADAS COMUNS — IDENTIFIQUE E NOMEIE (se presentes):
   - Comparação de taxa bruta de um produto com taxa líquida de outro (fraude comparativa)
   - "Liquidez diária" com carência ou spread de saída embutido
   - Prazo longo sem prêmio de taxa proporcional ao risco
   - Retorno nominal positivo com retorno real negativo (perde para a inflação)
   - CDB de banco grande abaixo do CDI líquido do Tesouro Selic (o banco ganha, você perde)

═══ FORMATO DE RESPOSTA ═══
Responda EXCLUSIVAMENTE com o JSON abaixo — sem texto antes, sem texto depois, sem markdown:

{
  "avaliacao": "bom" | "regular" | "ruim",
  "titulo": "string — 1 frase de impacto resumindo o veredicto",
  "analise": "string — 3 a 5 parágrafos em linguagem simples com a análise completa (use \\n para parágrafos)",
  "numerosChave": {
    "retornoLiquidoEstimado": "string — ex: '9,2% a.a. líquido de IR'",
    "ganhoRealAcimaIpca": "string — ex: '+4,1% a.a. acima do IPCA projetado'",
    "comparacaoTesouroSelic": "string — ex: '+0,6 p.p. acima do Tesouro Selic líquido'"
  },
  "recomendacao": "MANTER" | "VENDER" | "AGUARDAR" | "EVITAR",
  "timing": "string — ex: 'imediato', 'aguardar 43 dias para IR mínimo de 15%', 'manter até vencimento'",
  "ciladas": ["lista de alertas específicos ao caso — pode ser vazia []"],
  "resumo": "string — 1 frase conclusiva que qualquer pessoa sem conhecimento financeiro entende"
}`

// ─── BUILDERS DE PROMPT POR TIPO ─────────────────────────────────────────────

function buildPromptLciLca(p: PayloadLciLca): string {
  const fmtR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (v: number) => v.toFixed(2)
  const diffCdb = p.taxaLciLca - p.cdbEquivalente

  return `INVESTIMENTO EM ANÁLISE: LCI/LCA (isenta de IR e IOF)

Dados brutos:
• Prazo: ${p.prazoDias} dias corridos
• Taxa da LCI/LCA: ${fmtPct(p.taxaLciLca)}% do CDI
• CDI anual atual: ${fmtPct(p.cdiAtual)}% a.a.
• IPCA projetado 12 meses: ${fmtPct(p.ipcaProjetado)}% a.a.
• Aporte: R$ ${fmtR(p.aporte)}

Métricas calculadas (use-as diretamente na análise):
• Alíquota IR do CDB equivalente no prazo: ${p.aliquotaIr.toFixed(1)}%
• CDB bruto equivalente para empatar com esta LCI/LCA: ${fmtPct(p.cdbEquivalente)}% do CDI
  → Interpretação: só compensa trocar esta LCI/LCA por um CDB que pague ACIMA de ${fmtPct(p.cdbEquivalente)}% do CDI.
  → Diferença atual taxa LCI vs CDB equiv.: ${diffCdb > 0 ? '+' : ''}${fmtPct(diffCdb)} p.p. ${diffCdb > 0 ? '(LCI mais vantajosa na comparação direta)' : '(LCI menos vantajosa — o banco capturou o benefício fiscal)'}
• Rendimento líquido da LCI/LCA no período: R$ ${fmtR(p.rendLciLiquido)}
• Rendimento líquido do CDB equivalente no mesmo período: R$ ${fmtR(p.rendCdbLiquido)}
• Taxa efetiva anual líquida da LCI/LCA: ${fmtPct(p.rendLciPctAa)}% a.a.
• Ganho real acima do IPCA projetado: ${p.ganhoRealLci >= 0 ? '+' : ''}${fmtPct(p.ganhoRealLci)}% a.a.
• Avaliação de mercado da taxa: ${p.benchmarkLabel} — "${p.benchmarkDescricao}"

Por favor, analise este investimento para um investidor brasileiro de pessoa física.
Concentre-se em responder: a isenção de IR foi capturada pelo emissor (taxa baixa) ou repassada ao investidor?`
}

function buildPromptTesouro(p: PayloadTesouro): string {
  const fmtR = (v: number) => v.toLocaleString('pt-BR', { minimumFractionDigits: 2, maximumFractionDigits: 2 })
  const fmtPct = (v: number) => v.toFixed(2)
  const delta = p.taxaAtual - p.taxaMediaContratada
  const direcaoTaxa = delta > 0
    ? `SUBIU ${fmtPct(delta)} p.p. → papel DESVALORIZOU (perda de MTM)`
    : `CAIU ${fmtPct(Math.abs(delta))} p.p. → papel VALORIZOU (ganho de MTM)`

  const loteLines = p.lotes.map((l, i) =>
    `  Lote ${i + 1}: compra ${l.dataCompra} | R$ ${fmtR(l.valorInvestido)} | ${fmtPct(l.taxaContratada)}% a.a.`,
  ).join('\n')

  return `INVESTIMENTO EM ANÁLISE: CARTEIRA TESOURO DIRETO IPCA+

Lotes registrados (${p.lotes.length} lote${p.lotes.length > 1 ? 's' : ''}):
${loteLines}

Cenário atual de mercado:
• Taxa IPCA+ ofertada HOJE: ${fmtPct(p.taxaAtual)}% a.a.
• Duration Macaulay estimada: ${p.durationAnos} anos

Análise de Marcação a Mercado (método Duration Modificada + Convexidade — padrão ANBIMA/Fabozzi):
• Total investido: R$ ${fmtR(p.totalInvestido)}
• Taxa média contratada (ponderada pelo capital): ${fmtPct(p.taxaMediaContratada)}% a.a.
• Duration Modificada média: ${fmtPct(p.durationModMedia)} anos
• Variação de taxa: ${fmtPct(Math.abs(delta))} p.p. — taxa ${direcaoTaxa}
• MTM total estimado (ganho/perda se vender hoje): ${p.mtmTotal >= 0 ? '+' : ''}R$ ${fmtR(p.mtmTotal)}

Análise fiscal:
• Alíquota IR média atual (ponderada): ${p.aliquotaIrMedia.toFixed(1)}%
• Dias médios para atingir IR mínimo (15%): ${p.diasParaMenorIr === 0 ? 'já atingido em todos os lotes' : p.diasParaMenorIr + ' dias'}
• Ganho líquido se vender HOJE (IR atual): ${p.ganhoLiquidoHoje >= 0 ? '+' : ''}R$ ${fmtR(p.ganhoLiquidoHoje)}
• Ganho líquido aguardando IR 15%: ${p.ganhoLiquidoIrMin >= 0 ? '+' : ''}R$ ${fmtR(p.ganhoLiquidoIrMin)}
• Economia fiscal esperando: ${p.economiaIr > 0 ? '+R$ ' + fmtR(p.economiaIr) : 'nenhuma (IR já no mínimo)'}
• Sinal quantitativo calculado: ${p.sinal} (força: ${p.forcaSinal})

Por favor, analise esta carteira para um investidor brasileiro de pessoa física.
Foque especialmente na decisão de VENDER AGORA vs AGUARDAR, justificando com os números acima.
Se há lotes com perfis muito diferentes, destaque o mais relevante.`
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export const onRequestPost = async ({ env, request }: Context) => {
  const apiKey = env?.GEMINI_API_KEY
  if (!apiKey) {
    return jsonResponse({ ok: false, error: 'GEMINI_API_KEY não configurada no ambiente Cloudflare Pages.' }, 503)
  }

  let payload: Payload
  try {
    payload = (await request.json()) as Payload
  } catch {
    return jsonResponse({ ok: false, error: 'Payload JSON inválido.' }, 400)
  }

  if (!payload?.tipo || !['lci-lca', 'tesouro-ipca'].includes(payload.tipo)) {
    return jsonResponse({ ok: false, error: 'Campo "tipo" inválido.' }, 400)
  }

  // Monta o prompt de usuário de acordo com o tipo
  const userPrompt = payload.tipo === 'lci-lca'
    ? buildPromptLciLca(payload as PayloadLciLca)
    : buildPromptTesouro(payload as PayloadTesouro)

  // Alias "latest" aponta sempre para o Pro mais recente
  // Ref: https://ai.google.dev/gemini-api/docs/models#latest
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-pro-latest:generateContent?key=${apiKey}`

  const geminiBody = {
    system_instruction: {
      parts: [{ text: SYSTEM_PROMPT }],
    },
    contents: [
      {
        role: 'user',
        parts: [{ text: userPrompt }],
      },
    ],
    generationConfig: {
      responseMimeType: 'application/json',
      temperature: 0.3,
      thinkingConfig: {
        thinkingBudget: -1,  // dinâmico: o modelo decide a profundidade
      },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_NONE' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  }

  // Retry: 1 tentativa extra em caso de falha transitória
  let geminiResponse!: Response
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      geminiResponse = await fetch(geminiUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(geminiBody),
      })
      if (geminiResponse.ok) break
      if (tentativa === 0) await new Promise(r => setTimeout(r, 800))
    } catch {
      if (tentativa === 1) return jsonResponse({ ok: false, error: 'Falha de rede ao contactar a API Gemini.' }, 502)
      await new Promise(r => setTimeout(r, 800))
    }
  }

  if (!geminiResponse.ok) {
    const errorText = await geminiResponse.text().catch(() => '')
    return jsonResponse(
      { ok: false, error: `Gemini retornou erro ${geminiResponse.status}: ${errorText.slice(0, 400)}` },
      502,
    )
  }

  // Extrai o texto da resposta do Gemini
  const geminiData = await geminiResponse.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string }> }
    }>
  }

  const rawText = geminiData?.candidates?.[0]?.content?.parts?.[0]?.text ?? ''
  if (!rawText) {
    return jsonResponse({ ok: false, error: 'Gemini retornou resposta vazia.' }, 502)
  }

  // Parse do JSON estruturado retornado pelo modelo
  let analise: AnaliseIA
  try {
    analise = JSON.parse(rawText) as AnaliseIA
  } catch {
    return jsonResponse({ ok: false, error: 'Resposta do Gemini não é JSON válido.', raw: rawText.slice(0, 500) }, 502)
  }

  // Persiste no D1 para auditoria histórica
  try {
    const db = env?.FINANCEIRO_DB
    if (db && typeof db.prepare === 'function') {
      const risco = analise.avaliacao === 'ruim' ? 'alto' : analise.avaliacao === 'regular' ? 'medio' : 'baixo'
      await db.prepare(
        `INSERT INTO auditorias_ia (id, created_at, observacao, risco, recomendacao)
         VALUES (?1, ?2, ?3, ?4, ?5)`,
      )
        .bind(
          crypto.randomUUID(),
          new Date().toISOString(),
          `[${payload.tipo}] ${analise.titulo} — ${analise.resumo}`,
          risco,
          analise.recomendacao,
        )
        .run()
    }
  } catch {
    // Persitência no D1 é secundária — não bloqueia a resposta ao client
  }

  return jsonResponse({ ok: true, analise })
}
