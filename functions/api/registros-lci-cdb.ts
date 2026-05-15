function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

const CLOSED_MESSAGE =
  'Persistência direta de registros foi removida desta superfície pública. Use o fluxo autenticado de salvar análise.';

export const onRequestPost = async () => jsonResponse({ ok: false, error: CLOSED_MESSAGE }, 410);

export const onRequestDelete = async () => jsonResponse({ ok: false, error: CLOSED_MESSAGE }, 410);
