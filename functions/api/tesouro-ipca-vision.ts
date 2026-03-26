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
    return jsonResponse({ ok: false, error: 'Imagem base64 e mimeType são obrigatórios.' }, 400)
  }

  const systemInstruction = `Você é um consultor financeiro especialista em marcação a mercado do Tesouro Direto.
Extraia os dados do extrato do tesouro IPCA+ enviado em imagem.

Retorne EXATAMENTE um array JSON contendo objetos com o formato:
[
  {
    "dataCompra": "YYYY-MM-DD",
    "valorInvestido": 12500.50,
    "taxaContratada": 6.15
  }
]

Regras de Extração e Conversão:
1. dataCompra: Encontre a data de aplicação/compra e converta para formato YYYY-MM-DD.
2. valorInvestido: Encontre o "Valor investido" original (NÃO O VALOR LÍQUIDO ATUAL). Converta para número (1250.50).
3. taxaContratada: Encontre a taxa IPCA+ de compra (ex: IPCA + 6,15%). Converta para número (6.15).
4. Ignore Tesouro Selic e Tesouro Prefixado. Extraia apenas Tesouro IPCA+.
5. Não retorne markdown, crases ou explicações. Apenas um array JSON válido listando todos os lotes identificados na imagem.`

  // Gemini 2.5 Pro — último modelo Pro com suporte nativo a visão multimodal + thinking
  // Ref: https://ai.google.dev/gemini-api/docs/models#gemini-2.5-pro
  const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-pro-latest:generateContent?key=${apiKey}`

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
        { text: 'Extraia os dados estruturados desta imagem.' },
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
