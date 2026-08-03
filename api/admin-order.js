// ============================================================================
//  api/admin-order.js  —  주문 진단·복구 콘솔 (재인님 전용)
// ----------------------------------------------------------------------------
//  ▣ 왜 만들었나
//
//  "8월 2일 결제했는데 20260802-0000059 리포트가 안 열립니다"
//
//  이 문의가 왔을 때, 지금까지는 확인할 방법이 없었습니다.
//  Vercel 로그를 뒤져도 어느 요청이 그 손님인지 알 수 없고,
//  손님 출생정보는 손님 브라우저에만 있어서 수동 제작도 다시 물어봐야 했습니다.
//  왕복 3~4번, 반나절이 그렇게 갑니다. 그 사이 손님은 환불을 생각합니다.
//
//  이제 주소창에 주문번호만 넣으면 끝납니다.
//
//    https://astranote-server.vercel.app/api/admin-order?key=●●●&orderId=20260802-0000059
//
//  · 어느 상품인지          · 출생정보가 무엇이었는지
//  · 리포트가 만들어졌는지  · 실패했다면 정확히 무슨 에러였는지
//  · 손님이 볼 다시보기 링크
//
//  ▣ 최근 실패 주문 한눈에 (문의가 오기 전에 먼저 찾아내는 용도)
//
//    https://astranote-server.vercel.app/api/admin-order?key=●●●&mode=failed
//
//  ▣ 환경변수
//    ADMIN_KEY  — 아무 긴 문자열. Vercel > Settings > Environment Variables 에 추가.
//                 (REVIEW_ADMIN_KEY 를 이미 쓰고 있다면 그 값도 자동으로 허용합니다)
//
//  ⚠️ 이 파일은 손님 개인정보를 보여줍니다. key 를 절대 공유하지 마세요.
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');

/* 상품별 저장 규칙이 파일마다 다르게 자라났습니다.
   여기 한 곳에 정리해 두면 앞으로 상품이 늘어도 이 표만 고치면 됩니다. */
const PRODUCTS = [
  { no: '9',  label: '배우자 분석 리포트',  reportKey: id => `report:${id}`,        api: '/api/gemini' },
  { no: '11', label: 'VVIP 심층 리포트',    reportKey: id => `vip-report:${id}`,    api: '/api/gemini-vip' },
  { no: '14', label: '30일 운세',           reportKey: id => `monthly-report:${id}`, api: '/api/gemini-monthly' },
  { no: '15', label: '궁합 리포트',         reportKey: id => `couple-report:${id}`, api: '/api/gemini-couple' },
  { no: '16', label: '우리 아이 양육설명서', reportKey: id => `child-report:${id}`,  api: '/api/gemini-child' }
];

const RESULT_PAGE = 'https://astra-note.com/order/order_result.html';

function esc(v) {
  return String(v == null ? '' : v)
    .replace(/&/g, '&amp;').replace(/</g, '&lt;')
    .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

function when(ts) {
  if (!ts) return '-';
  const d = new Date(ts);
  const p = n => String(n).padStart(2, '0');
  return `${d.getFullYear()}.${p(d.getMonth() + 1)}.${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}

/* KV 가 잠깐 흔들려도 콘솔 전체가 죽지 않게 감싼다 */
async function safeGet(key) {
  try { return await kv.get(key); } catch (e) { return { __err: e.message }; }
}

const PAGE_HEAD = `<!doctype html><meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>주문 진단 — 아스트라노트</title>
<style>
 body{background:#0A0C16;color:#E8E6EF;font:15px/1.75 -apple-system,"Apple SD Gothic Neo","Noto Sans KR",sans-serif;
      margin:0;padding:22px 16px 60px;letter-spacing:-.03em}
 .wrap{max-width:720px;margin:0 auto}
 h1{font-size:19px;color:#C9A24B;margin:0 0 4px;letter-spacing:-.05em}
 .sub{color:#7d7a90;font-size:12.5px;margin-bottom:22px}
 .card{background:#151827;border:1px solid rgba(201,162,75,.22);border-radius:14px;padding:18px;margin-bottom:14px}
 .card h2{font-size:15px;color:#E7CE8E;margin:0 0 12px;letter-spacing:-.04em}
 .row{display:flex;gap:12px;padding:7px 0;border-bottom:1px solid rgba(255,255,255,.05);font-size:13.5px}
 .row:last-child{border-bottom:0}
 .k{width:104px;flex:none;color:#8b829e}
 .v{flex:1;word-break:break-all}
 .ok{color:#7ee59b;font-weight:700}
 .bad{color:#E8654F;font-weight:700}
 .warn{color:#E7CE8E;font-weight:700}
 .muted{color:#6b687a}
 a.btn{display:inline-block;margin:6px 8px 0 0;padding:10px 15px;border-radius:10px;
       background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;font-weight:800;
       text-decoration:none;font-size:13px}
 a.btn.ghost{background:transparent;border:1px solid rgba(201,162,75,.4);color:#C9A24B}
 pre{background:#0A0C16;border:1px solid rgba(255,255,255,.08);border-radius:9px;padding:12px;
     overflow-x:auto;font-size:11.5px;color:#b9b5c8;margin:8px 0 0}
 form{display:flex;gap:8px;margin-bottom:20px}
 input{flex:1;background:#151827;border:1px solid rgba(201,162,75,.3);border-radius:10px;
       padding:12px;color:#E8E6EF;font-size:15px}
 button{background:linear-gradient(135deg,#E7CE8E,#C9A24B);border:0;border-radius:10px;
        padding:12px 18px;font-weight:800;color:#1a1206;font-size:14px}
</style>`;

const handler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  const q = req.query || {};
  const admin = process.env.ADMIN_KEY || process.env.REVIEW_ADMIN_KEY;

  if (!admin) {
    return res.status(500).send(PAGE_HEAD +
      '<div class="wrap"><h1>설정이 필요합니다</h1><div class="card">' +
      'Vercel > Settings > Environment Variables 에 <b>ADMIN_KEY</b> 를 추가한 뒤 재배포하세요.' +
      '</div></div>');
  }
  if (q.key !== admin) return res.status(403).send('403');

  /* ── 최근 실패 주문 목록 ───────────────────────────────────
     손님이 문의하기 전에 우리가 먼저 찾아내는 쪽이 훨씬 낫습니다. */
  if (q.mode === 'failed') {
    let rows = '<div class="muted">실패한 주문이 없습니다. 좋은 신호입니다.</div>';
    try {
      const keys = await kv.keys('status:*');
      const items = [];
      for (const k of keys.slice(0, 300)) {
        const st = await kv.get(k);
        if (st && st.state === 'failed') items.push({ id: k.slice(7), st });
      }
      items.sort((a, b) => (b.st.at || 0) - (a.st.at || 0));
      if (items.length) {
        rows = items.map(it =>
          `<div class="row"><div class="k">${esc(when(it.st.at))}</div>` +
          `<div class="v"><a class="btn ghost" href="?key=${encodeURIComponent(q.key)}&orderId=${encodeURIComponent(it.id)}">${esc(it.id)}</a>` +
          `<div class="muted" style="font-size:11.5px;margin-top:4px">${esc(String(it.st.error || '').slice(0, 160))}</div></div></div>`
        ).join('');
      }
    } catch (e) {
      rows = `<div class="bad">조회 실패: ${esc(e.message)}</div>`;
    }
    return res.status(200).send(PAGE_HEAD +
      `<div class="wrap"><h1>실패한 주문</h1><div class="sub">최신순 · 주문번호를 누르면 상세로 갑니다</div>` +
      `<div class="card">${rows}</div></div>`);
  }

  const orderId = (q.orderId || q.order_id || '').trim();

  /* ── 입력 화면 ── */
  if (!orderId) {
    return res.status(200).send(PAGE_HEAD +
      `<div class="wrap"><h1>주문 진단</h1>
       <div class="sub">문의가 들어온 주문번호를 넣으세요</div>
       <form method="get">
         <input type="hidden" name="key" value="${esc(q.key)}">
         <input name="orderId" placeholder="20260802-0000059" autofocus>
         <button>조회</button>
       </form>
       <a class="btn ghost" href="?key=${encodeURIComponent(q.key)}&mode=failed">최근 실패 주문 보기</a>
       </div>`);
  }

  /* ── 상세 진단 ───────────────────────────────────────────
     어느 상품인지 모르므로 5개 저장소를 전부 훑습니다. */
  const intake = await safeGet(`intake:${orderId}`);
  const status = await safeGet(`status:${orderId}`);

  const found = [];
  for (const p of PRODUCTS) {
    const r = await safeGet(p.reportKey(orderId));
    if (r && !r.__err) found.push({ p, r });
  }

  let head = '';
  if (found.length) {
    const f = found[0];
    const st = (f.r.status === 'pending') ? 'pending' : 'completed';
    head = st === 'pending'
      ? `<div class="card"><h2>진단</h2><span class="warn">⏳ 생성 중이거나 중단된 상태입니다</span>
         <div class="muted" style="margin-top:8px">아래 "다시보기 링크"를 손님에게 보내면 재생성이 걸립니다.</div></div>`
      : `<div class="card"><h2>진단</h2><span class="ok">✅ 리포트는 서버에 정상 저장되어 있습니다</span>
         <div class="muted" style="margin-top:8px">손님 화면 문제입니다. 아래 링크를 그대로 보내주세요. 바로 열립니다.</div></div>`;
  } else if (status && status.state === 'failed') {
    head = `<div class="card"><h2>진단</h2><span class="bad">🔥 생성이 실패했습니다</span>
      <pre>${esc(status.error)}</pre>
      <div class="muted" style="margin-top:8px">출생정보가 아래에 남아 있으면 링크만 보내도 재생성됩니다.</div></div>`;
  } else if (intake && !intake.__err) {
    head = `<div class="card"><h2>진단</h2><span class="warn">⚠️ 출생정보는 받았으나 리포트가 없습니다</span>
      <div class="muted" style="margin-top:8px">손님이 생성 도중 창을 닫았을 가능성이 높습니다. 링크를 보내면 됩니다.</div></div>`;
  } else {
    head = `<div class="card"><h2>진단</h2><span class="bad">❌ 이 주문번호로 아무 기록이 없습니다</span>
      <div class="muted" style="margin-top:8px">
        손님이 결제 후 출생정보 입력을 안 했거나, 주문번호가 다릅니다.<br>
        카페24 주문내역에서 번호를 다시 확인하고, 손님께 출생정보를 요청하세요.</div></div>`;
  }

  const intakeRows = (intake && !intake.__err) ? `
    <div class="row"><div class="k">이름</div><div class="v">${esc(intake.name)}</div></div>
    <div class="row"><div class="k">생년월일</div><div class="v">${esc(intake.date)}</div></div>
    <div class="row"><div class="k">태어난 시각</div><div class="v">${esc(intake.time)}${intake.timeUnknown ? ' <span class="muted">(모름)</span>' : ''}</div></div>
    <div class="row"><div class="k">출생지</div><div class="v">${esc(intake.city)}</div></div>
    <div class="row"><div class="k">성별</div><div class="v">${esc(intake.myGender)} → ${esc(intake.targetGender)}</div></div>
    <div class="row"><div class="k">입력 시각</div><div class="v">${esc(when(intake.at))}</div></div>`
    : '<div class="muted">저장된 출생정보가 없습니다.</div>';

  const prodRows = PRODUCTS.map(p => {
    const hit = found.find(f => f.p.no === p.no);
    const mark = hit
      ? (hit.r.status === 'pending' ? '<span class="warn">생성 중</span>' : '<span class="ok">있음</span>')
      : '<span class="muted">-</span>';
    return `<div class="row"><div class="k">${esc(p.no)}번</div><div class="v">${esc(p.label)} &nbsp; ${mark}</div></div>`;
  }).join('');

  const link = found.length
    ? `${RESULT_PAGE}?order_id=${encodeURIComponent(orderId)}&product_no=${found[0].p.no}`
    : `${RESULT_PAGE}?order_id=${encodeURIComponent(orderId)}`;

  return res.status(200).send(PAGE_HEAD + `
  <div class="wrap">
    <h1>${esc(orderId)}</h1>
    <div class="sub">주문 진단 결과</div>
    ${head}

    <div class="card">
      <h2>손님께 보낼 링크</h2>
      <div class="v" style="font-size:12px;color:#b9b5c8;word-break:break-all">${esc(link)}</div>
      <a class="btn" href="${esc(link)}" target="_blank">직접 열어보기</a>
    </div>

    <div class="card"><h2>출생정보</h2>${intakeRows}</div>
    <div class="card"><h2>상품별 저장 상태</h2>${prodRows}</div>
    <div class="card"><h2>상태 기록</h2>
      <div class="row"><div class="k">state</div><div class="v">${esc(status && status.state || '-')}</div></div>
      <div class="row"><div class="k">시각</div><div class="v">${esc(when(status && status.at))}</div></div>
      ${status && status.error ? `<pre>${esc(status.error)}</pre>` : ''}
    </div>

    <a class="btn ghost" href="?key=${encodeURIComponent(q.key)}">다른 주문 조회</a>
    <a class="btn ghost" href="?key=${encodeURIComponent(q.key)}&mode=failed">실패 목록</a>
  </div>`);
};

module.exports = handler;
