// ============================================================================
//  api/admin-seal.js  —  저장된 '모든 상품' 리포트 영구 봉인 (재인님 전용)
// ----------------------------------------------------------------------------
//  ▣ 왜 필요한가
//
//  예전엔 모든 리포트가 365일 뒤 KV 에서 사라지게 저장됐습니다.
//  사라진 뒤 손님이 보관소에서 '리포트 다시 보기'를 누르면, 서버에 남은
//  출생정보로 '그때의 최신 프롬프트'로 다시 만듭니다 → 예전과 다른 리포트가 나옵니다.
//
//  이 주소를 한 번 열면 저장된 리포트 전부의 만료를 지웁니다.
//
//    https://astranote-server.vercel.app/api/admin-seal?key=●●●
//
//  · 대상: 배우자 · VVIP · 30일 운세 · 궁합 · 양육설명서 (전 상품)
//  · 내용은 한 글자도 바꾸지 않습니다. 만료 시간만 없앱니다(Redis PERSIST).
//  · '완성된 리포트'만 봉인합니다.
//    궁합·양육설명서는 같은 칸에 '생성 중(pending)'·'실패(failed)' 표시를 잠깐 넣어둡니다.
//    그걸 영구로 만들면 그 손님은 영원히 "만드는 중"에 갇힙니다. 그래서 건너뜁니다.
//  · 여러 번 열어도 안전합니다. 이미 봉인된 건 그대로입니다.
//  · 리포트가 아주 많으면 한 번에 다 못 끝냅니다. 화면의 '이어서 계속'을 누르면 됩니다.
//
//  ▣ 한 상품만 하고 싶으면 &p=spouse / vip / monthly / couple / child
//  ▣ 환경변수: ADMIN_KEY (admin-order.js 와 같은 값)
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');

/* 각 API 파일이 실제로 쓰는 저장 칸 이름 (2026-10-02 코드에서 직접 확인) */
const PRODUCTS = [
  { id: 'spouse',  label: '배우자 리포트',   prefix: 'report:' },          // api/gemini.js
  { id: 'vip',     label: 'VVIP 운명 리포트', prefix: 'vip-report:' },      // api/gemini-vip.js
  { id: 'monthly', label: '30일 운세',       prefix: 'monthly:' },         // api/gemini-monthly.js
  { id: 'couple',  label: '궁합 리포트',     prefix: 'couple-report:' },   // api/gemini-couple.js
  { id: 'child',   label: '양육설명서',      prefix: 'child-report:' }     // api/gemini-child.js
];

const TIME_BUDGET_MS = 45000;   // vercel.json maxDuration 60초 안에서 여유를 둔다
const PAGE = 50;                // 리포트 본문을 읽어 상태를 확인하므로 한 번에 너무 많이 읽지 않는다

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

/* 완성된 리포트인가 — 생성 중·실패 표시는 봉인하면 안 된다 */
function isFinished(v) {
  if (!v || typeof v !== 'object') return false;
  if (v.error) return false;
  if (v.status && v.status !== 'completed') return false;   // pending · failed
  if (v.state && v.state !== 'completed') return false;
  return true;
}

module.exports = async function handler(req, res) {
  const q = req.query || {};
  const admin = process.env.ADMIN_KEY || process.env.REVIEW_ADMIN_KEY;
  res.setHeader('Cache-Control', 'no-store');
  if (!admin) return res.status(500).send('ADMIN_KEY 환경변수가 없습니다.');
  if (q.key !== admin) return res.status(403).send('403');

  /* 대상 목록: 기본은 전 상품. &p= 로 한 상품만 고를 수 있다 */
  const list = q.p ? PRODUCTS.filter(function (x) { return x.id === q.p; }) : PRODUCTS;
  if (!list.length) return res.status(400).send('p 값은 spouse / vip / monthly / couple / child 중 하나');

  const t0 = Date.now();
  let idx = Math.max(0, Math.min(list.length, parseInt(q.i || '0', 10) || 0));
  let cursor = q.cursor ? String(q.cursor) : '0';
  const stat = {};
  list.forEach(function (x) { stat[x.id] = { scanned: 0, sealed: 0, already: 0, skipped: 0 }; });
  let allDone = false;

  try {
    outer:
    while (idx < list.length) {
      const P = list[idx];
      const S = stat[P.id];
      do {
        if (Date.now() - t0 > TIME_BUDGET_MS) break outer;
        const r = await kv.scan(cursor, { match: P.prefix + '*', count: PAGE });
        cursor = String(r[0]);
        const keys = r[1] || [];
        if (keys.length) {
          const pr = kv.pipeline();
          keys.forEach(function (k) { pr.ttl(k); pr.get(k); });
          const out = await pr.exec();
          const targets = [];
          keys.forEach(function (k, i) {
            const ttl = Number(out[i * 2]), val = out[i * 2 + 1];
            if (ttl <= 0) { S.already++; return; }          // -1 = 이미 영구, -2 = 그 사이 사라짐
            if (!isFinished(val)) { S.skipped++; return; }  // 생성 중·실패 표시
            targets.push(k);
          });
          if (targets.length) {
            const pp = kv.pipeline();
            targets.forEach(function (k) { pp.persist(k); });
            const done = await pp.exec();
            S.sealed += done.filter(function (x) { return Number(x) === 1; }).length;
          }
          S.scanned += keys.length;
        }
      } while (cursor !== '0');
      idx++; cursor = '0';                                   // 이 상품 끝 → 다음 상품
    }
    if (idx >= list.length) allDone = true;
  } catch (e) {
    return res.status(500).send('KV 오류: ' + esc(e.message) +
      ' (상품 ' + esc(list[idx] && list[idx].id) + ', cursor=' + esc(cursor) + ')');
  }

  const rows = list.map(function (x) {
    const s = stat[x.id];
    return `<tr><td>${esc(x.label)}</td><td>${s.scanned}</td><td><b>${s.sealed}</b></td><td>${s.already}</td><td>${s.skipped}</td></tr>`;
  }).join('');
  const next = allDone ? '' :
    `<p style="margin-top:18px"><a style="color:#0A0C16;background:#E7CE8E;padding:12px 18px;border-radius:10px;text-decoration:none;font-weight:800"
       href="?key=${encodeURIComponent(q.key)}${q.p ? '&p=' + encodeURIComponent(q.p) : ''}&i=${idx}&cursor=${encodeURIComponent(cursor)}">이어서 계속 →</a></p>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  return res.status(200).send(`<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<body style="background:#0A0C16;color:#E8E6EF;font:15px/1.8 -apple-system,'Noto Sans KR',sans-serif;padding:24px">
<h2 style="color:#C9A24B;margin:0 0 14px">리포트 봉인 ${allDone ? '완료 ✅' : '진행 중 ⏳ (아래 버튼을 눌러 이어가세요)'}</h2>
<table style="border-collapse:collapse;font-size:14px" cellpadding="7">
<tr style="color:#C9A24B;text-align:left"><th>상품</th><th>확인</th><th>이번에 봉인</th><th>이미 영구</th><th>건너뜀*</th></tr>
${rows}
</table>
<div style="color:#7d7a90;font-size:12.5px;margin-top:12px">* 건너뜀 = 아직 만드는 중이거나 실패 표시라 봉인하지 않은 칸. 정상입니다.<br>
${Math.round((Date.now() - t0) / 1000)}초 소요 · 이 화면은 여러 번 열어도 안전합니다.</div>
${next}
</body>`);
};
