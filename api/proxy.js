// HRD MCP 프록시 — 한국산업인력공단 MCP 서버는 브라우저 preflight(OPTIONS)에 400을
// 반환하므로 브라우저 직결이 불가. 이 서버리스 함수가 중계한다.
// 호출: POST /api/proxy?area=qual  (body: JSON-RPC 2.0)
// 응답: upstream의 SSE 텍스트를 그대로 전달 + CORS 허용 헤더

const UPSTREAM = 'https://openapi.hrdkorea.or.kr/mcp';
const ALLOWED_AREAS = new Set(['qual', 'overseas', 'ncs', 'dual', 'master', 'eps']);

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Accept');

  if (req.method === 'OPTIONS') {
    res.status(204).end();
    return;
  }
  if (req.method !== 'POST') {
    res.status(405).json({ error: 'POST only' });
    return;
  }

  const area = String(req.query.area || '');
  if (!ALLOWED_AREAS.has(area)) {
    res.status(400).json({ error: 'invalid area (qual|overseas|ncs|dual|master|eps)' });
    return;
  }

  let body = req.body;
  if (typeof body !== 'string') {
    try { body = JSON.stringify(body); } catch { body = '{}'; }
  }
  // 최소 검증: JSON-RPC 2.0 형태만 전달
  try {
    const parsed = JSON.parse(body);
    if (parsed.jsonrpc !== '2.0' || typeof parsed.method !== 'string') throw new Error('bad rpc');
  } catch {
    res.status(400).json({ error: 'invalid JSON-RPC body' });
    return;
  }

  try {
    const upstream = await fetch(`${UPSTREAM}/${area}`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json, text/event-stream',
      },
      body,
    });
    const text = await upstream.text();
    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status).send(text);
  } catch (e) {
    res.status(502).json({ error: 'upstream unreachable' });
  }
}
