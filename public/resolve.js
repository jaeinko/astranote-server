/* ============================================================================
   ASTRANOTE — 주문번호로 상품 자동 판정 (이메일 링크 대응)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/resolve.js  (GitHub 저장소)
   ▣ 카페24 order_result.html 의 도메인 가드 바로 아래,
      다른 어떤 스크립트보다 먼저 넣어야 합니다.

        script src="https://astranote-server.vercel.app/resolve.js"  (태그로 감싸서)

   ▣ 무엇을 고치나

   자동 발송 메일 링크에는 주문번호만 들어 있습니다.

        order_result.html?order_id=20260725-0000082

   상품번호가 없으면 결과페이지가 추측을 하는데, 그 추측이 이렇게 끝납니다.

        PRODUCT = (hint && PRODUCTS[hint]) ? hint : (hint ? hint : '9');
                                                              ↑ 모르면 9번

   서버에 물어보는 경로도 11·9번만 봅니다. 14·15번은 목록에 없습니다.
   그래서 메일로 들어오면 궁합·30일 손님까지 배우자 리포트가 떴습니다.

   이 파일은 다른 스크립트가 읽기 전에 4개 엔드포인트를 동시에 조회해
   상품을 확정하고, 주소에 product_no 를 붙여 다시 엽니다.
   그러면 그다음부터는 추측이 필요 없습니다.

   ▣ 이미 product_no 가 있으면 아무 일도 하지 않습니다.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__astroResolve) return;
  window.__astroResolve = true;

  var BASE = 'https://astranote-server.vercel.app';
  var MARK = 'astro_resolved';   // 무한 새로고침 방지 표식

  /* 🚨 여기에 빠진 상품이 있으면, 그 상품 손님은 메일 링크로 들어올 때
     엉뚱한 리포트를 보게 됩니다(맨 아래 9번으로 흘러내림).
     상품을 새로 낼 때마다 반드시 이 목록에 추가하세요. */
  var ENDPOINTS = [
    { no: '11', path: '/api/gemini-vip',     label: 'VVIP 심층 리포트' },
    { no: '16', path: '/api/gemini-child',   label: '우리 아이 양육설명서' },
    { no: '15', path: '/api/gemini-couple',  label: '궁합 리포트' },
    { no: '14', path: '/api/gemini-monthly', label: '30일 운세' },
    { no: '9',  path: '/api/gemini',         label: '배우자 분석 리포트' }
  ];

  function qs(k) {
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }

  var orderId  = qs('order_id') || qs('orderId');
  var product  = qs('product_no') || qs('productNo');

  /* 이미 상품을 알거나, 주문번호가 없으면 할 일이 없다 */
  if (product || !orderId) return;
  /* 한 번 조회하고도 못 찾았으면 다시 돌지 않는다 */
  if (qs(MARK)) return;

  /* ── 조회하는 동안 보여줄 화면 ──────────────────────────────
     이게 없으면 손님이 잠깐 배우자 리포트 로딩을 보게 된다. */
  var veil = document.createElement('div');
  veil.id = 'astro-resolve-veil';
  veil.style.cssText =
    'position:fixed;inset:0;z-index:2147483600;background:#050308;' +
    'display:flex;flex-direction:column;align-items:center;justify-content:center;' +
    'text-align:center;padding:20px;' +
    "font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;";
  veil.innerHTML =
    '<div style="width:52px;height:52px;border-radius:50%;margin-bottom:24px;' +
    'border:3px solid rgba(212,175,55,.14);border-top-color:#d4af37;' +
    'animation:astroRv 1s linear infinite"></div>' +
    '<div style="color:#f0d77b;font-size:16px;font-weight:800;letter-spacing:-.04em;' +
    'margin-bottom:10px">보관된 리포트를 찾는 중입니다</div>' +
    '<div style="color:#8b829e;font-size:13px;line-height:1.7;letter-spacing:-.03em">' +
    '주문번호 ' + String(orderId).replace(/[<>&"]/g, '') + '</div>' +
    '<style>@keyframes astroRv{to{transform:rotate(360deg)}}</style>';

  function showVeil() {
    if (document.body) document.body.appendChild(veil);
    else document.addEventListener('DOMContentLoaded', function () { document.body.appendChild(veil); });
  }
  function hideVeil() {
    if (veil && veil.parentNode) veil.parentNode.removeChild(veil);
  }
  showVeil();

  /* ── 4개를 동시에 물어본다 ─────────────────────────────────
     순서대로 하면 앞의 것이 느릴 때 전부 밀린다. */
  function probe(ep) {
    return fetch(BASE + ep.path + '?orderId=' + encodeURIComponent(orderId), { cache: 'no-store' })
      .then(function (r) {
        return r.json().catch(function () { return null; }).then(function (d) {
          if (r.status === 200 && d && !d.error) return ep;
          /* 30일 운세는 기간이 지나면 404 + stale 을 준다.
             리포트는 다시 만들어야 하지만 상품이 무엇인지는 확실하다. */
          if (d && d.stale) return ep;
          return null;
        });
      })
      .catch(function () { return null; });
  }

  var timedOut = false;
  var timer = setTimeout(function () {
    timedOut = true;
    console.warn('[resolve] 조회가 6초를 넘겨 그대로 진행합니다');
    hideVeil();
  }, 6000);

  Promise.all(ENDPOINTS.map(probe)).then(function (hits) {
    if (timedOut) return;
    clearTimeout(timer);

    /* ENDPOINTS 순서가 곧 우선순위다.
       오판했을 때 손해가 큰 VVIP 를 맨 앞에 둔다. */
    var found = null;
    for (var i = 0; i < hits.length; i++) { if (hits[i]) { found = hits[i]; break; } }

    if (!found) {
      console.log('[resolve] 저장된 리포트를 못 찾았습니다 → 기존 흐름에 맡깁니다');
      hideVeil();
      /* 다시 물어보지 않도록 표식만 남긴다 */
      try {
        var u0 = new URL(location.href);
        u0.searchParams.set(MARK, '1');
        history.replaceState(null, '', u0.toString());
      } catch (e) {}
      return;
    }

    console.log('[resolve] 주문 ' + orderId + ' → ' + found.no + '번 (' + found.label + ')');

    /* 주소에 상품번호를 붙여 다시 연다.
       이후 스크립트들은 추측 없이 product_no 를 그대로 읽는다. */
    try {
      var u = new URL(location.href);
      u.searchParams.set('product_no', found.no);
      u.searchParams.set(MARK, '1');
      location.replace(u.toString());
    } catch (e) {
      var sep = location.search ? '&' : '?';
      location.replace(location.pathname + location.search + sep +
        'product_no=' + found.no + '&' + MARK + '=1');
    }
  }).catch(function (e) {
    console.warn('[resolve] 조회 실패:', e);
    clearTimeout(timer);
    hideVeil();
  });
})();
