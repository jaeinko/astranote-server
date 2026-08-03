// ============================================================================
//  lib/cors.js  —  CORS 화이트리스트 (전 API 공용 · 정본 하나)
// ----------------------------------------------------------------------------
//  ▣ 왜 바꾸나
//
//  지금까지 6개 API 전부 Access-Control-Allow-Origin: * 였습니다.
//  이 말은 "지구상 어떤 웹사이트든 우리 API 를 자기 사이트에서
//  브라우저로 직접 호출해도 된다"는 뜻입니다.
//
//  누가 아스트라노트 결과화면을 통째로 베낀 사이트를 만들어
//  우리 /api/gemini 를 그대로 쏘면 —
//  Gemini 비용과 Prokerala 크레딧은 우리가 내고, 매출은 그쪽이 가져갑니다.
//
//  ▣ 무엇을 막고, 무엇은 못 막나 (정직하게)
//
//    막는 것   : 남의 웹사이트가 방문자 브라우저를 시켜 우리 API 를 쓰는 것
//    못 막는 것: curl·서버에서 직접 때리는 호출 (CORS 는 브라우저 규약이라서)
//
//  서버 직접 호출까지 막으려면 레이트리밋이 필요합니다. 그건 별도 단계.
//  하지만 "베낀 사이트" 시나리오가 현실적으로 가장 흔한 도용이고,
//  그건 이 파일 하나로 끝납니다.
//
//  ▣ 도메인을 추가해야 할 때
//
//  코드 수정 없이 Vercel 환경변수 CORS_EXTRA 에 쉼표로 넣으면 됩니다.
//      CORS_EXTRA = https://new-domain.com,https://m.new-domain.com
//
//  ▣ Origin 헤더가 아예 없는 요청 (메일 링크 클릭, 주소창 직접 입력,
//     카페24 서버, curl)은 CORS 대상이 아니므로 그대로 통과시킵니다.
//     resolve.js 의 다시보기 조회가 여기에 해당합니다 — 깨지지 않습니다.
// ============================================================================

'use strict';

const ALLOWED = [
  'https://astra-note.com',
  'https://www.astra-note.com',
  'https://m.astra-note.com',
  'https://jaeinko.cafe24.com',
  'https://astranote-server.vercel.app'
];

/* 배포 후 코드 수정 없이 도메인을 늘릴 수 있는 비상구 */
(process.env.CORS_EXTRA || '')
  .split(',')
  .map(s => s.trim())
  .filter(Boolean)
  .forEach(d => { if (ALLOWED.indexOf(d) === -1) ALLOWED.push(d); });

function pickOrigin(req) {
  const o = req.headers && req.headers.origin;
  if (!o) return null;                        // 브라우저 교차출처 요청이 아님 → CORS 무관
  return ALLOWED.indexOf(o) !== -1 ? o : '';  // '' = 목록 밖 → 헤더를 안 붙여 차단
}

/* 기존 6개 파일의 allowCors 와 같은 모양(고차함수)이라 그대로 갈아끼우면 됩니다 */
function allowCors(fn) {
  return async (req, res) => {
    const origin = pickOrigin(req);

    if (origin) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      /* 🚨 캐시·CDN 이 A 도메인용 응답을 B 도메인에 재사용하지 않도록 */
      res.setHeader('Vary', 'Origin');
      res.setHeader('Access-Control-Allow-Credentials', 'true');
    }
    /* origin === '' (목록 밖) 이면 ACAO 헤더 자체를 붙이지 않는다.
       그러면 브라우저가 응답을 그 사이트에 넘겨주지 않는다. 이게 차단이다. */

    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    /* 목록 밖 사이트의 본요청(preflight 없는 단순 POST)도 실행 자체를 끊는다.
       ACAO 만 빼면 응답을 못 읽을 뿐 Gemini 비용은 이미 나간 뒤다.
       여기서 403 으로 끊어야 크레딧이 지켜진다. */
    if (origin === '') {
      return res.status(403).json({ error: '허용되지 않은 출처입니다.' });
    }

    return await fn(req, res);
  };
}

module.exports = { allowCors, ALLOWED };
