export async function onRequestPost({ request, env }: { request: Request; env: any }) {
  try {
    const payload = await request.json() as { imageBase64: string, mimeType: string }

    if (!payload.imageBase64 || !payload.mimeType) {
      return Response.json({ ok: false, error: 'Imagem base64 e mimeType são obrigatórios.' }, { status: 400 })
    }

    const GEMINI_API_KEY = env.GEMINI_API_KEY
    if (!GEMINI_API_KEY) {
      return Response.json({ ok: false, error: 'GEMINI_API_KEY não configurada no ambiente.' }, { status: 500 })
    }

    const systemInstruction = `
Você é um consultor financeiro especialista em marcação a mercado do Tesouro Direto.
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
5. Não retorne markdown, crases ou explicações. Apenas um array JSON válido listando todos os lotes identificados na imagem.
`

    const apiUrl = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-pro-latest:generateContent?key=${GEMINI_API_KEY}`

    const requestBody = {
      systemInstruction: {
        parts: [{ text: systemInstruction }]
      },
      contents: [{
        role: "user",
        parts: [
          {
            inlineData: {
              data: payload.imageBase64,
              mimeType: payload.mimeType
            }
          },
          { text: "Extraia os dados estruturados desta imagem." }
        ]
      }],
      generationConfig: {
        temperature: 0.1,
        responseMimeType: "application/json"
      },
      safetySettings: [
        { category: "HARM_CATEGORY_HARASSMENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_HATE_SPEECH", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_SEXUALLY_EXPLICIT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_DANGEROUS_CONTENT", threshold: "BLOCK_ONLY_HIGH" },
        { category: "HARM_CATEGORY_CIVIC_INTEGRITY", threshold: "BLOCK_ONLY_HIGH" }
      ]
    }

    const gdResponse = await fetch(apiUrl, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(requestBody)
    })

    if (!gdResponse.ok) {
      const gErr = await gdResponse.text()
      try {
        const jErr = JSON.parse(gErr)
        return Response.json({ ok: false, error: jErr.error?.message ?? 'Falha na API Gemini.' }, { status: gdResponse.status })
      } catch {
        return Response.json({ ok: false, error: `Falha na API Gemini (HTTP ${gdResponse.status})` }, { status: gdResponse.status })
      }
    }

    const gdData = await gdResponse.json() as any
    const rawText = gdData.candidates?.[0]?.content?.parts?.[0]?.text

    if (!rawText) {
      return Response.json({ ok: false, error: 'A resposta da IA veio vazia ou foi bloqueada pelos filtros de segurança.' }, { status: 400 })
    }

    let extractedData = []
    try {
      extractedData = JSON.parse(rawText)
      if (!Array.isArray(extractedData)) {
        throw new Error('A IA não retornou um array JSON.')
      }
    } catch (err) {
      return Response.json({ ok: false, error: 'A IA não retornou um formato JSON válido.', debug: rawText }, { status: 400 })
    }

    return Response.json({ ok: true, data: extractedData })

  } catch (error: any) {
    return Response.json({ ok: false, error: error.message ?? 'Erro interno no processamento da imagem.' }, { status: 500 })
  }
}
