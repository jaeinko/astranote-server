/* ============================================================================
   ASTRANOTE — 리포트 본문 가독성 통일 (상품 4종 공통)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/type.js
   ▣ 카페24 order_result.html 맨 아래에 한 줄만 넣습니다.
        script src="https://astranote-server.vercel.app/type.js"   (태그로 감싸서)

   ▣ 왜 필요한가

   네 상품 본문이 전부 font-weight:300 으로 되어 있었습니다.
   300 은 흰 배경용 굵기입니다. 검은 배경에서는 얇은 획이 뭉개져서
   글자가 흐릿하게 보이고, 읽는 사람 눈이 금방 피로해집니다.
   1만 자가 넘는 리포트에서는 이게 "내용은 좋은데 읽기 싫다"로 이어집니다.

   화면마다 선택자가 달라서 네 곳을 각각 잡아야 합니다.
        배우자 (9)   .card-content
        VVIP  (11)  .vip-card-content
        30일  (14)  .mtg-card .ct
        궁합  (15)  .cpr-ct

   ▣ 바꾸는 값
        굵기      300 → 400          획이 살아남
        크기      16 → 16.5px        한글 세리프 기준
        줄간격    1.95~2.0 → 2.06    문단이 숨 쉬게
        색        #dcdcdc → #ded7cc  차가운 회색 → 웜그레이
        문단 간격 13px → 20px        <br><br> 사이
        강조      밑줄 → 금색 형광펜

   ▣ 이 파일은 CSS 만 넣습니다. 어떤 동작도 건드리지 않습니다.
      couple.js 를 이미 쓰고 계셔도 충돌하지 않습니다(같은 값이라 결과가 같습니다).
   ============================================================================ */
(function () {
  'use strict';
  if (window.__astroType) return;
  window.__astroType = true;

  var SEL = [
    '#astro-result-container .card-content',          /* 배우자 9 */
    '#astro-vip-result-container .vip-card-content',  /* VVIP 11 */
    '#mtg .mtg-card .ct',                             /* 30일 14 (새 화면) */
    '#mtr .mtr-ct',                                   /* 30일 14 (옛 화면) */
    '#cpr .cpr-ct',                                   /* 궁합 15 */
    '#chd .chd-ct'                                    /* 양육설명서 16 */
  ];
  var B = SEL.map(function (s) { return s + ' b, ' + s + ' strong'; }).join(',');
  var BR = SEL.map(function (s) { return s + ' br + br'; }).join(',');
  var RED = SEL.map(function (s) { return s + ' span[style*="ff3b30"]'; }).join(',');
  var QUOTE = SEL.map(function (s) { return s + ' blockquote'; }).join(',');
  var P = SEL.map(function (s) { return s + ' p'; }).join(',');

  var CSS = [
    /* ── 본문 ── */
    SEL.join(',') + '{',
    '  font-family:"Noto Serif KR",serif!important;',
    '  font-weight:400!important;',          /* 300 은 검은 배경에서 획이 날아간다 */
    '  font-size:16.5px!important;',
    '  line-height:2.06!important;',
    '  color:#ded7cc!important;',
    '  letter-spacing:-.03em!important;',
    '  text-align:left!important;',          /* justify 는 단어 사이를 벌린다 */
    '  word-break:keep-all!important;',
    '  overflow-wrap:anywhere!important;',
    '}',
    /* ── 문단 사이 ── */
    BR + '{display:block;content:"";margin-top:20px!important;}',
    P + '{margin-bottom:20px!important;}',
    /* ── 강조 : 밑줄 대신 금색 형광펜 ── */
    B + '{',
    '  color:#f7e7a8!important;font-weight:700!important;',
    '  border-bottom:0!important;padding:0 3px!important;border-radius:2px!important;',
    '  background:linear-gradient(180deg,rgba(255,255,255,0) 60%,rgba(212,175,55,.26) 40%)!important;',
    '}',
    /* ── 경고 ── */
    RED + '{background:rgba(255,59,48,.12)!important;padding:2px 6px!important;',
    '  border-radius:4px!important;color:#ff6b60!important;font-weight:800!important;}',
    /* ── 인용 ── */
    QUOTE + '{',
    '  background:linear-gradient(135deg,rgba(212,175,55,.1),rgba(142,36,170,.05))!important;',
    '  border:0!important;border-left:3px solid #d4af37!important;',
    '  border-radius:0 14px 14px 0!important;margin:28px 0!important;padding:22px 20px!important;',
    '  color:#f0d77b!important;font-size:16px!important;line-height:1.92!important;',
    '  font-weight:600!important;font-style:normal!important;}',
    /* ── 카드 제목 ── */
    '#astro-result-container .card-title,#cpr .cpr-tt,#mtg .mtg-card .tt{',
    '  font-size:20px!important;line-height:1.42!important;letter-spacing:-.05em!important;}',
    /* ── 모바일 ── */
    '@media screen and (max-width:480px){',
    SEL.join(',') + '{font-size:15.5px!important;line-height:1.99!important;}',
    BR + '{margin-top:17px!important;}',
    P + '{margin-bottom:17px!important;}',
    '#astro-result-container .card-title,#cpr .cpr-tt,#mtg .mtg-card .tt{font-size:18px!important;}',
    '}'
  ].join('\n');

  function inject() {
    if (document.getElementById('astro-type')) return;
    var st = document.createElement('style');
    st.id = 'astro-type';
    st.textContent = CSS;
    /* head 맨 뒤에 넣어야 기존 규칙을 확실히 덮는다 */
    document.head.appendChild(st);
    console.log('[타이포] 본문 가독성 적용 (굵기 400 · 줄간격 2.06 · 웜그레이)');
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', inject);
  else inject();

  /* 리포트 화면이 나중에 그려지면서 자기 style 을 뒤에 붙이는 경우가 있다.
     그때 우리 규칙이 앞으로 밀리므로 한 번 더 맨 뒤로 옮긴다. */
  var n = 0;
  var iv = setInterval(function () {
    n++;
    var st = document.getElementById('astro-type');
    if (st && st !== document.head.lastElementChild) document.head.appendChild(st);
    if (n > 40) clearInterval(iv);   /* 20초 */
  }, 500);
})();
