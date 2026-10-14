// HRD MCP 프록시 — 한국산업인력공단 MCP 서버는 브라우저 preflight(OPTIONS)에 400을
// 반환하므로 브라우저 직결이 불가. 이 서버리스 함수가 중계한다.
// 호출: POST /api/proxy?area=qual  (body: JSON-RPC 2.0)
// 응답: upstream의 SSE 텍스트를 그대로 전달 + CORS 허용 헤더

const UPSTREAM = 'https://openapi.hrdkorea.or.kr/mcp';
const ALLOWED_AREAS = new Set(['qual', 'overseas', 'ncs', 'dual', 'master', 'eps']);

// upstream이 SSE 스트림이라 무한정 열려 있을 수 있음 → 유한 시간만 수집 후 반환
const MAX_WAIT_MS = 20000;

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
      signal: AbortSignal.timeout(MAX_WAIT_MS),
    });

    res.setHeader('Content-Type', 'text/event-stream; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    res.status(upstream.status);

    // 스트림을 유한 시간 동안만 읽고(끊어질 때까지 기다리지 않음) 받은 만큼 반환
    const reader = upstream.body.getReader();
    const decoder = new TextDecoder();
    let out = '';
    const deadline = Date.now() + MAX_WAIT_MS;
    try {
      while (Date.now() < deadline) {
        const msLeft = deadline - Date.now();
        const { done, value } = await Promise.race([
          reader.read(),
          new Promise((resolve) => setTimeout(() => resolve({ done: true, value: null, _timeout: true }), msLeft)),
        ]);
        if (done) break;
        if (value) out += decoder.decode(value, { stream: true });
        // JSON-RPC 응답이 완결되면 즉시 종료
        if (/"result"\s*:/.test(out) && out.includes('}')) break;
      }
    } catch { /* 부분 응답 그대로 반환 */ }
    try { reader.cancel(); } catch { /* noop */ }
    out += decoder.decode();
    res.send(out || JSON.stringify({ jsonrpc: '2.0', id: null, error: { code: -32603, message: 'upstream empty response' } }));
  } catch (e) {
    res.status(502).json({ error: 'upstream unreachable' });
  }
}
