// Módulo: oraculo-financeiro/src/lib/api.ts
// Descrição: Helper de parsing defensivo para chamadas fetch ao backend.
// Garante que respostas não-JSON (HTML 500 da Cloudflare, etc.) não estourem
// o JSON.parse silenciosamente — retorna envelope padronizado para a UI.

export interface ApiEnvelope<T = Record<string, unknown>> {
  ok: boolean;
  status: number;
  data: T | null;
  error?: string;
}

function isJsonContentType(contentType: string | null): boolean {
  if (!contentType) return false;
  return contentType.toLowerCase().includes('application/json');
}

export async function fetchJson<T = Record<string, unknown>>(
  input: RequestInfo | URL,
  init?: RequestInit,
): Promise<ApiEnvelope<T>> {
  try {
    const res = await fetch(input, init);
    const contentType = res.headers.get('content-type');
    if (!isJsonContentType(contentType)) {
      return {
        ok: false,
        status: res.status,
        data: null,
        error:
          res.status >= 500
            ? 'Servidor indisponível no momento. Tente novamente em alguns instantes.'
            : `Resposta inesperada do servidor (${res.status}).`,
      };
    }

    const data = (await res.json()) as T;
    return {
      ok: res.ok,
      status: res.status,
      data,
    };
  } catch {
    return {
      ok: false,
      status: 0,
      data: null,
      error: 'Erro de rede — Não foi possível conectar ao servidor.',
    };
  }
}
