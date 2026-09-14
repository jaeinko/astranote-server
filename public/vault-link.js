/* ============================================================================
   ASTRANOTE — 보관소(주문내역)에 "리포트 다시 보기" 버튼 붙이기
   ----------------------------------------------------------------------------
   ▣ 왜 필요한가

   손님들이 계속 같은 말을 합니다.

       "궁합은 결제해도 다시 결제해야 하나요? 리포트를 다시 못 봐서요"
       "보고서 구매한 것 다시 보고 싶은데 잘 안 열리네요"
       "내 보관소에서 안 보여요"

   리포트는 서버에 멀쩡히 있습니다(365일 보관). 조회 기능도 정상입니다.
   문제는 단 하나 — 손님이 거기까지 갈 길이 없다는 것입니다.

   헤더의 "📜 내 보관소" 버튼은 카페24 기본 주문내역으로 갑니다.
   거기서 주문을 눌러도 카페24 주문상세로 갈 뿐,
   리포트 화면(order_result.html?order_id=...)으로 가는 링크가 어디에도 없습니다.

   이 스크립트가 그 길을 만듭니다.

   ▣ 어떻게 찾나

   카페24 주문내역 페이지의 HTML 구조는 스킨마다 다릅니다.
   그래서 특정 클래스명에 기대지 않고, 화면에 보이는 글자 중
   주문번호 모양(20260906-0000098)을 직접 찾아 그 옆에 버튼을 답니다.
   스킨을 바꿔도 계속 동작합니다.

   ▣ 넣는 위치
   카페24 관리자 → 디자인 → 주문내역 페이지(/myshop/order/list.html)
   맨 아래에 script 태그로 감싸서 붙여넣으세요.
   주문 상세 페이지에도 같이 넣으면 거기서도 버튼이 뜹니다.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__astroVaultLink) return;
  window.__astroVaultLink = true;

  /* ⚠️ 리포트 화면의 주소입니다. 실제 주소와 다르면 여기만 고치세요.
     확인 방법: 결제 완료 직후 리포트가 뜬 화면의 주소창을 보시면 됩니다.
     (자동 발송 메일의 링크를 봐도 됩니다) */
  var REPORT_PATH = '/order/order_result.html';

  /* 주문번호 모양 : 20260906-0000098 (날짜 8자리 - 연번 7자리) */
  var ORDER_RE = /\b(\d{8}-\d{7})\b/;

  function css() {
    if (document.getElementById('astro-vault-css')) return;
    var s = document.createElement('style');
    s.id = 'astro-vault-css';
    s.textContent =
      '.astro-vlink{display:inline-flex;align-items:center;gap:5px;' +
      'margin:6px 0 6px 8px;padding:7px 14px;border-radius:16px;' +
      'background:linear-gradient(135deg,#d4af37,#8e24aa);' +
      'color:#fff!important;text-decoration:none!important;' +
      "font-family:'Noto Sans KR','Apple SD Gothic Neo',sans-serif;" +
      'font-size:12.5px;font-weight:700;letter-spacing:-.3px;' +
      'white-space:nowrap;vertical-align:middle;' +
      'box-shadow:0 3px 10px rgba(142,36,170,.3);transition:transform .15s;}' +
      '.astro-vlink:active{transform:scale(.95);}' +
      '@media screen and (max-width:480px){' +
      '.astro-vlink{display:flex;margin:8px 0 4px;justify-content:center;' +
      'padding:10px 14px;font-size:13px;}}';
    document.head.appendChild(s);
  }

  /* 화면에 실제로 보이는 글자에서만 주문번호를 찾는다.
     숨은 입력값이나 스크립트 안의 숫자를 잡으면 엉뚱한 곳에 버튼이 붙는다. */
  function findOrderNodes() {
    var walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT, {
      acceptNode: function (n) {
        if (!n.nodeValue || !ORDER_RE.test(n.nodeValue)) return NodeFilter.FILTER_REJECT;
        var p = n.parentElement;
        if (!p) return NodeFilter.FILTER_REJECT;
        var tag = p.tagName;
        if (tag === 'SCRIPT' || tag === 'STYLE' || tag === 'NOSCRIPT') return NodeFilter.FILTER_REJECT;
        if (!p.offsetParent && p.tagName !== 'BODY') return NodeFilter.FILTER_REJECT;  // 숨겨진 요소
        return NodeFilter.FILTER_ACCEPT;
      }
    });
    var out = [], n;
    while ((n = walker.nextNode())) out.push(n);
    return out;
  }

  function attach() {
    css();
    var nodes = findOrderNodes();
    var seen = {};

    nodes.forEach(function (node) {
      var m = node.nodeValue.match(ORDER_RE);
      if (!m) return;
      var orderId = m[1];

      /* 같은 주문번호가 화면에 여러 번 나와도 버튼은 하나만 */
      if (seen[orderId]) return;

      var host = node.parentElement;
      /* 이미 이 주문에 버튼이 달려 있으면 건너뛴다 */
      if (host.querySelector && host.querySelector('.astro-vlink[data-oid="' + orderId + '"]')) return;

      var a = document.createElement('a');
      a.className = 'astro-vlink';
      a.setAttribute('data-oid', orderId);
      a.href = REPORT_PATH + '?order_id=' + encodeURIComponent(orderId);
      a.textContent = '📜 리포트 다시 보기';

      /* 주문번호 바로 뒤에 끼워 넣는다 */
      if (host.nextSibling) host.parentNode.insertBefore(a, host.nextSibling);
      else host.parentNode.appendChild(a);

      seen[orderId] = true;
    });

    return Object.keys(seen).length;
  }

  function boot() {
    var n = attach();
    if (n === 0) {
      /* 주문 목록이 나중에 그려지는 스킨도 있어 잠깐 기다렸다 한 번 더 본다 */
      setTimeout(attach, 800);
      setTimeout(attach, 2000);
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
