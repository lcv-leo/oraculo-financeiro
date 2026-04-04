// Módulo: oraculo-financeiro/functions/api/tesouro-ipca-vision.ts
// Versão: v01.02.05
// Descrição: OCR multimodal via Gemini 2.5 Pro — extrai lotes do Tesouro IPCA+ a partir de imagens de extratos.
// Alinhado ao padrão do analisar-ia.ts: retry, thought filtering, jsonResponse, safety BLOCK_ONLY_HIGH.

import { GoogleGenAI } from '@google/genai';

// ─── TYPES ────────────────────────────────────────────────────────────────────

interface Env {
  GEMINI_API_KEY: string
}

interface Context {
  env: Env
  request: Request
}

// ─── UTILIDADES ───────────────────────────────────────────────────────────────

const GEMINI_CONFIG = {
  model: 'gemini-3.1-pro-preview',
  maxTokensInput: 120000,
  maxOutputTokens: 8192,
  temperature: 0.1
};

function structuredLog(level: string, message: string, context = {}) {
  const logEntry = {
    timestamp: new Date().toISOString(),
    level: level.toUpperCase(),
    message,
    ...context
  };
  console.log(JSON.stringify(logEntry));
}

function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store' },
  })
}

// ─── HANDLER PRINCIPAL ────────────────────────────────────────────────────────

export const onRequestPost = async ({ request, env }: Context) => {
  const envRec = env as unknown as Record<string, unknown>
  const apiKey = (env?.GEMINI_API_KEY || envRec['GEMINI_APP_KEY'] || envRec['gemini-api-key'] || envRec['gemini-app-key']) as string
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

  const ai = new GoogleGenAI({ apiKey });
  const modelName = GEMINI_CONFIG.model;

  const safetySettings = [
    { category: 'HARM_CATEGORY_DANGEROUS_CONTENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HARASSMENT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_HATE_SPEECH', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_SEXUALLY_EXPLICIT', threshold: 'BLOCK_ONLY_HIGH' },
    { category: 'HARM_CATEGORY_CIVIC_INTEGRITY', threshold: 'BLOCK_ONLY_HIGH' }
  ];

  try {
    const countRes = await ai.models.countTokens({ 
      model: modelName, 
      contents: [{
            inlineData: {
              data: payload.imageBase64,
              mimeType: payload.mimeType,
            },
          },
          'Extraia os dados estruturados deste arquivo (imagem ou PDF).'
      ]
    });
    const inputTokens = countRes.totalTokens || 0;
    if (inputTokens > GEMINI_CONFIG.maxTokensInput) {
      structuredLog('error', 'Token limit exceeded in Vision', { endpoint: 'tesouro-ipca-vision', tokens: inputTokens });
      return jsonResponse({ ok: false, error: `Documento muito grande para análise de ML: ${inputTokens} tokens.` }, 413);
    }
  } catch (countError) {
    structuredLog('warn', 'Token count failed in Vision', { endpoint: 'tesouro-ipca-vision', error: String(countError) });
  }

  let rawText = '';
  let usageDetails = {};
  for (let tentativa = 0; tentativa < 2; tentativa++) {
    try {
      const response = await ai.models.generateContent({
        model: modelName,
        contents: [
          {
            inlineData: {
              data: payload.imageBase64,
              mimeType: payload.mimeType,
            },
          },
          'Extraia os dados estruturados deste arquivo (imagem ou PDF).'
        ],
        config: {
          systemInstruction: systemInstruction,
          responseMimeType: 'application/json',
          temperature: GEMINI_CONFIG.temperature,
          maxOutputTokens: GEMINI_CONFIG.maxOutputTokens,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          thinkingConfig: { thinkingBudgetTokens: 1024 } as any,
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          safetySettings: safetySettings as any,
        }
      });
      
      if (response.text) {
        rawText = response.text;
        const metadata = response.usageMetadata || {};
        usageDetails = {
           promptTokens: metadata.promptTokenCount || 0,
           outputTokens: metadata.candidatesTokenCount || 0,
           cachedTokens: metadata.cachedContentTokenCount || 0
        };
        structuredLog('info', 'Geracao Gemini concluida', { endpoint: 'tesouro-ipca-vision', attempt: tentativa + 1, usage: usageDetails });
        break;
      } else {
        throw new Error('Gemini retornou resposta vazia ou bloqueada pelos filtros de segurança.');
      }
    } catch (error) {
      const errMsg = error instanceof Error ? error.message : String(error);
      structuredLog('warn', 'Falha ao requisitar Gemini (Vision)', { endpoint: 'tesouro-ipca-vision', attempt: tentativa + 1, error: errMsg });
      if (tentativa === 1) {
        return jsonResponse(
          { ok: false, error: `Falha na requisição AI Gemini: ${errMsg}` },
          500
        );
      }
      await new Promise(r => setTimeout(r, 800));
    }
  }

  if (!rawText) {
    structuredLog('error', 'Gemini retornou vazio em extacao OCR', { endpoint: 'tesouro-ipca-vision' });
    return jsonResponse({ ok: false, error: 'Gemini retornou resposta vazia ou bloqueada pelos filtros de segurança.' }, 500);
  }

  // Parse do array JSON estruturado retornado pelo modelo
  let extractedData: unknown[]
  try {
    const parsed = JSON.parse(rawText)
    if (!Array.isArray(parsed)) {
      throw new Error('A IA não retornou um array JSON.')
    }
    extractedData = parsed
  } catch (error) {
    structuredLog('error', 'Impossivel fazer parse da IA (Vision)', { endpoint: 'tesouro-ipca-vision', response: String(error) });
    return jsonResponse({ ok: false, error: 'A IA não retornou um formato JSON válido.', raw: rawText.slice(0, 500) }, 500)
  }

  return jsonResponse({ ok: true, data: extractedData })
}

