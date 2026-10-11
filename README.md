# hrd-mcp-proxy

한국산업인력공단 MCP 서버(`openapi.hrdkorea.or.kr/mcp`)용 CORS 중계 프록시 (Vercel Serverless Function).

## 배경

공단 MCP 서버는 브라우저의 preflight(OPTIONS) 요청에 `400 Bad Request`를 반환하므로,
브라우저에서 직접 `fetch` 호출이 불가능하다(CORS 차단). 이 프록시가 서버 측에서
중계하고 `Access-Control-Allow-Origin: *`를 붙여 브라우저에 돌려준다.

## 사용법

```
POST https://<배포도메인>/api/proxy?area=qual
Content-Type: application/json

{"jsonrpc":"2.0","id":1,"method":"tools/list","params":{}}
```

- `area`: `qual` | `overseas` | `ncs` | `dual` | `master` | `eps`
- body는 JSON-RPC 2.0만 허용 (그 외는 400)
- 응답: upstream SSE 텍스트 그대로 + `Content-Type: text/event-stream`

## 배포

Vercel에 이 저장소를 import하면 자동 배포된다. `vercel.json`에서 함수 타임아웃 60초 설정.
