// ============================================================================
//  api/review.js  —  아스트라노트 후기 수집
// ----------------------------------------------------------------------------
//  ▣ 결과 페이지에서 별점+후기를 받아 Redis에 저장합니다.
//  ▣ 게시판 없이도 오늘부터 후기를 모을 수 있습니다.
//
//  [저장]  POST /api/review
//  [조회]  GET  /api/review?key=관리자키          ← 재인님만 보는 목록
//
//  ⚠️ 이메일 알림은 선택입니다.
//     RESEND_API_KEY 와 REVIEW_NOTIFY_EMAIL 을 Vercel 환경변수에 넣으면 켜지고,
//     없으면 저장만 하고 조용히 넘어갑니다. (없어도 후기는 절대 유실되지 않습니다)
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');

const LIST_KEY = 'reviews:list';      // 최신순 인덱스
const ITEM_PREFIX = 'reviews:item:';
const MAX_KEEP = 500;

const PRODUCT_NAME = {
  '9':  '배우자 분석 리포트',
  '11': 'VVIP 심층 리포트',
  '14': '30일 운세',
  '15': '궁합 리포트'
};

/* -------------------------------------------------------------------------
   CORS
------------------------------------------------------------------------- */
function allowCors(fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    return await fn(req, res);
  };
}

function clean(v, max) {
  return String(v == null ? '' : v).trim().replace(/[<>]/g, '').slice(0, max || 100);
}

/* -------------------------------------------------------------------------
   이메일 알림 (선택 — 키가 없으면 그냥 건너뜀)
------------------------------------------------------------------------- */
async function notify(item) {
  const key = process.env.RESEND_API_KEY;
  const to = process.env.REVIEW_NOTIFY_EMAIL;
  if (!key || !to) return;                 // 설정 안 했으면 조용히 통과

  const stars = '★'.repeat(item.rating) + '☆'.repeat(5 - item.rating);
  const html =
    `<div style="font-family:sans-serif;line-height:1.7">
      <h2 style="margin:0 0 12px">새 후기 ${stars}</h2>
      <p><b>상품</b> ${item.productName}<br>
         <b>작성</b> ${item.who || '미기재'}<br>
         <b>공개동의</b> ${item.consent ? '예' : '아니오'}<br>
         <b>주문번호</b> ${item.orderId || '-'}</p>
      <blockquote style="border-left:3px solid #d4af37;padding:8px 14px;margin:14px 0;background:#faf7ef">
        ${String(item.text || '').replace(/\n/g, '<br>')}
      </blockquote>
    </div>`;

  try {
    await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        from: 'Astranote <onboarding@resend.dev>',
        to: [to],
        subject: `[아스트라노트] 새 후기 ${stars} — ${item.productName}`,
        html
      })
    });
  } catch (e) {
    console.log('이메일 알림 실패(저장은 정상):', e.message);
  }
}

/* -------------------------------------------------------------------------
   핸들러
------------------------------------------------------------------------- */
const handler = async (req, res) => {

  /* ---------- 관리자 조회 ---------- */
  if (req.method === 'GET') {
    const key = req.query && req.query.key;
    const admin = process.env.REVIEW_ADMIN_KEY;

    if (!admin) return res.status(500).json({ error: 'REVIEW_ADMIN_KEY 미설정' });
    if (key !== admin) return res.status(403).json({ error: '권한 없음' });

    try {
      const ids = (await kv.get(LIST_KEY)) || [];
      const limit = Math.min(Number(req.query.limit) || 100, 300);
      const picked = ids.slice(0, limit);

      const items = [];
      for (const id of picked) {
        const it = await kv.get(ITEM_PREFIX + id);
        if (it) items.push(it);
      }

      /* 브라우저로 열면 읽기 좋은 표로, ?format=json 이면 원본으로 */
      if (req.query.format === 'json') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json({ total: ids.length, items });
      }

      const avg = items.length
        ? (items.reduce((s, x) => s + (x.rating || 0), 0) / items.length).toFixed(2)
        : '-';

      const rows = items.map(it => {
        const stars = '★'.repeat(it.rating) + '☆'.repeat(5 - it.rating);
        const d = new Date(it.at);
        const when = `${d.getFullYear()}.${String(d.getMonth() + 1).padStart(2, '0')}.${String(d.getDate()).padStart(2, '0')}`;
        return `<tr>
          <td class="s">${stars}</td>
          <td>${it.productName || '-'}</td>
          <td>${it.who || '-'}</td>
          <td class="t">${String(it.text || '').replace(/</g, '&lt;').replace(/\n/g, '<br>')}</td>
          <td class="${it.consent ? 'ok' : 'no'}">${it.consent ? '공개OK' : '비공개'}</td>
          <td class="d">${when}</td>
        </tr>`;
      }).join('');

      const html = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>후기 관리 · 아스트라노트</title>
<style>
 body{background:#0b0910;color:#eee;font-family:-apple-system,'Noto Sans KR',sans-serif;padding:20px;margin:0}
 h1{color:#d4af37;font-size:20px;margin:0 0 6px}
 .sum{color:#9a8cc0;font-size:14px;margin-bottom:18px}
 table{width:100%;border-collapse:collapse;font-size:13.5px}
 th{background:rgba(212,175,55,.12);color:#d4af37;text-align:left;padding:10px 8px;position:sticky;top:0}
 td{padding:12px 8px;border-bottom:1px solid rgba(255,255,255,.07);vertical-align:top}
 .s{color:#f0d77b;white-space:nowrap}
 .t{line-height:1.7;min-width:240px}
 .d{color:#777;white-space:nowrap}
 .ok{color:#6dd47e}.no{color:#888}
 @media(max-width:640px){table,thead,tbody,tr,td,th{display:block}th{display:none}
  tr{border:1px solid rgba(255,255,255,.1);border-radius:10px;margin-bottom:12px;padding:8px}
  td{border:0;padding:5px 6px}}
</style>
<h1>후기 관리</h1>
<div class="sum">전체 ${ids.length}건 · 평균 ${avg}점 · 최근 ${items.length}건 표시</div>
<table>
 <thead><tr><th>별점</th><th>상품</th><th>작성자</th><th>내용</th><th>공개</th><th>날짜</th></tr></thead>
 <tbody>${rows || '<tr><td colspan="6">아직 후기가 없습니다.</td></tr>'}</tbody>
</table>`;

      res.setHeader('Content-Type', 'text/html; charset=utf-8');
      res.setHeader('Cache-Control', 'no-store');
      return res.status(200).send(html);

    } catch (e) {
      return res.status(500).json({ error: '조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 또는 GET만 받습니다.' });

  /* ---------- 후기 저장 ---------- */
  try {
    const b = req.body || {};
    const rating = Math.max(1, Math.min(5, Number(b.rating) || 0));
    if (!rating) return res.status(400).json({ error: '별점을 선택해주세요.' });

    const text = clean(b.text, 2000);
    const productNo = clean(b.productNo, 5);

    const item = {
      id: 'r' + Date.now().toString(36) + Math.random().toString(36).slice(2, 6),
      rating,
      text,
      productNo,
      productName: PRODUCT_NAME[productNo] || ('상품 ' + (productNo || '?')),
      who: clean(b.who, 40),               // 예: "34세 여" (선택 입력)
      consent: !!b.consent,                // 사이트 공개 동의
      orderId: clean(b.orderId, 60),
      at: Date.now()
    };

    await kv.set(ITEM_PREFIX + item.id, item);          // 후기는 만료 없음

    const ids = (await kv.get(LIST_KEY)) || [];
    ids.unshift(item.id);
    await kv.set(LIST_KEY, ids.slice(0, MAX_KEEP));

    /* 이메일은 실패해도 저장에 영향 없음 */
    await notify(item);

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json({ ok: true });

  } catch (e) {
    console.error('🔥 review.js 에러:', e);
    return res.status(500).json({ error: '저장에 실패했습니다. 잠시 후 다시 시도해주세요.' });
  }
};

module.exports = allowCors(handler);
