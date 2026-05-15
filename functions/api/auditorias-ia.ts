function jsonResponse(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
      'Cache-Control': 'no-store',
    },
  });
}

const CLOSED_MESSAGE = 'Endpoint desativado. Auditorias de IA não são expostas publicamente.';

export const onRequestGet = async () => jsonResponse({ ok: false, error: CLOSED_MESSAGE }, 410);

export const onRequestPost = async () => jsonResponse({ ok: false, error: CLOSED_MESSAGE }, 410);
