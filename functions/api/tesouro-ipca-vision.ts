// Módulo: oraculo-financeiro/functions/api/tesouro-ipca-vision.ts
// Versão: v01.02.05
// Descrição: OCR multimodal via Gemini 2.5 Pro — extrai lotes do Tesouro IPCA+ a partir de imagens de extratos.
// Alinhado ao padrão do analisar-ia.ts: retry, thought filtering, jsonResponse, safety BLOCK_ONLY_HIGH.

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  GEMINI_API_KEY: string
}

interface Context {
  env: Env
  request: Request
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }: Context) => {
  const apiKey = env?.GEMINI_API_KEY
  if (!apiKey) {
    return jsonResponse({ ok: false, error: 'GEMINI_API_KEY não configurada no ambiente Cloudflare Pages.' }, 503)
  }

  let payload: { imageBase64: string; mimeType: string }
  try {
    payload = await request.json() as { imageBase64: string; mimeType: string }
  } catch {
    return jsonResponse({ ok: false, error: 'Payload JSON inválido.' }, 400)
  }

  if (!payload.imageBase64 || !payload.mimeType) {
    return jsonResponse({ ok: false, error: 'Arquivo base64 e mimeType são obrigatórios.' }, 400)
  }

  const systemInstruction = `Você é um consultor financeiro especialista em marcação a mercado do Tesouro Direto brasileiro.
Extraia TODOS os lotes de investimento do extrato do Tesouro IPCA+ enviado na imagem ou PDF.

ATENÇÃO: as datas no extrato estão em formato BRASILEIRO: dd/mm/aaaa (dia/mês/ano).
Exemplo: "26/02/2026" significa 26 de fevereiro de 2026 e deve ser convertido para "2026-02-26".

Retorne EXATAMENTE um array JSON contendo um objeto para CADA lote encontrado na imagem:
[
  {
    "dataCompra": "2026-02-26",
    "valorInvestido": 15491.04,
    "taxaContratada": 7.41
  },
  {
    "dataCompra": "2026-03-03",
    "valorInvestido": 1011.09,
    "taxaContratada": 7.59
  }
]

Regras de Extração e Conversão:
1. dataCompra: Encontre a coluna "Data da Aplicação" ou "Data de Compra". O formato é dd/mm/aaaa (BRASILEIRO). Converta para YYYY-MM-DD (ISO). ATENÇÃO: o ano está nos 4 últimos dígitos (ex: 26/02/2026 → ano é 2026, NÃO 2024).
2. valorInvestido: Encontre a coluna "Valor Investido" (AxB). Use o formato numérico com ponto decimal (ex: 15.491,04 → 15491.04). NÃO use o preço unitário do título.
3. taxaContratada: Encontre "Rentabilidade Contratada" (ex: IPCA + 7,41%). Extraia apenas o número após o "+". Converta vírgula para ponto (7,41 → 7.41).
4. Extraia TODOS os lotes da tabela — cada linha é um lote separado.
5. Ignore Tesouro Selic e Tesouro Prefixado. Extraia apenas Tesouro IPCA+.
6. Não retorne markdown, crases ou explicações. Apenas o array JSON.`

  // Gemini 3 Pro Preview — modelo com suporte a visão multimodal + thinking
  // Modelo definido pelo usuário: gemini-3.1-pro-preview
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-pro-preview:generateContent?key=${apiKey}`

  const geminiBody = {
    system_instruction: {
      parts: [{ text: systemInstruction }],
    },
    contents: [{
      role: 'user',
      parts: [
        {
          inlineData: {
            data: payload.imageBase64,
            mimeType: payload.mimeType,
          },
        },
        { text: 'Extraia os dados estruturados deste arquivo (imagem ou PDF).' },
      ],
    }],
    generationConfig: {
      temperature: 0.1,
      responseMimeType: 'application/json',
      thinkingConfig: {
        thinkingLevel: 'HIGH',
      },
    },
    safetySettings: [
      { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
      { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' },
    ],
  }

  // Retry: 1 tentativa extra em caso de falha transitória (padrão analisar-ia.ts)
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

  // Extrai texto da resposta, filtrando thought parts (padrão analisar-ia.ts)
  const geminiData = await geminiResponse.json() as {
    candidates?: Array<{
      content?: { parts?: Array<{ text?: string; thought?: boolean }> }
    }>
  }

  const parts = geminiData?.candidates?.[0]?.content?.parts ?? []
  const visibleParts = parts.filter(p => !p.thought && p.text)
  const rawText = visibleParts.map(p => p.text).join('\n')

  if (!rawText) {
    return jsonResponse({ ok: false, error: 'Gemini retornou resposta vazia ou bloqueada pelos filtros de segurança.' }, 502)
  }

  // Parse do array JSON estruturado retornado pelo modelo
  let extractedData: unknown[]
  try {
    const parsed = JSON.parse(rawText)
    if (!Array.isArray(parsed)) {
      throw new Error('A IA não retornou um array JSON.')
    }
    extractedData = parsed
  } catch {
    return jsonResponse({ ok: false, error: 'A IA não retornou um formato JSON válido.', raw: rawText.slice(0, 500) }, 502)
  }

  return jsonResponse({ ok: true, data: extractedData })
}
