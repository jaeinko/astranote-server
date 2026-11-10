/* ============================================================================
   ASTRANOTE — 신년운세 결과화면 (product_no=18 · 14,900원)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/newyear.js
   ▣ 카페24 order_result.html 에 한 줄 (reunion.js 바로 아래):
        script src="https://astranote-server.vercel.app/newyear.js"  (태그로 감싸서)
   ▣ 상품번호가 18이 아니면 아래 NO 한 줄만 바꾸세요 (서버·intake.js·resolve.js·save.js 도 함께)
   ============================================================================ */
(function () {
  'use strict';

  var NO = '18';
  var BASE = 'https://astranote-server.vercel.app';
  var API = BASE + '/api/gemini-newyear';
  var DATA_KEY = 'astro_newyear_data';
  var REP_PREFIX = 'astro_rep:18:';

  function qs(k) { try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; } }
  /* 이 기기에 저장된 입력값 — localStorage 가 막힌 브라우저(일부 인앱)는 쿠키에서 */
  var DATA = null;
  try { DATA = JSON.parse(localStorage.getItem(DATA_KEY) || 'null'); } catch (e) {}
  if (!DATA) {
    try {
      var ck = document.cookie.match(new RegExp('(^| )' + DATA_KEY + '=([^;]+)'));
      if (ck) DATA = JSON.parse(decodeURIComponent(ck[2]));
    } catch (e) {}
  }
  /* 🚨 결제 직후 주문완료 화면 주소에는 product_no 가 없다.
     그때는 상세페이지가 남긴 입력값의 productNo 로 판단한다.
     (상세페이지가 결제 직전에 다른 상품 입력값을 전부 지우므로 오판하지 않는다) */
  var hinted = qs('product_no') || qs('productNo') || (DATA && DATA.productNo) || null;
  if (String(hinted) !== NO) return;
  if (window.__astroReportInit) return;
  window.__astroReportInit = true;
  window.__astroNewyearV1 = true;
  var ORDER_ID = qs('order_id') || qs('orderId') || null;

  var CSS = [
'#astro-result-container,#data-loading,#retry-screen,#astro-vip-result-container,#vip-data-loading,#vip-retry-screen,',
'#cpr,#cpr-load,#cpr-retry,#mtg,#mtg-load,#mtr,#chd,#chd-load,#chd-retry,#rnn,#rnn-load,#rnn-retry{display:none!important;}',
'#header,#footer,.titleArea,.ec-base-step1,#aside,.topLogo,.path,.order-complete-wrap,.contentsBox,.snsIntroBox{display:none!important;}',
'html,body{max-width:100vw;overflow-x:hidden;margin:0;padding:0;background:#0A0C16!important;}',
'#nyr,#nyr *{box-sizing:border-box!important;}',
'#nyr{width:100%;min-height:100vh;position:absolute;top:0;left:0;z-index:999999;color:#E8E6EF;',
'  background:radial-gradient(circle at 50% -6%,#2a2614 0%,#0A0C16 46%,#050308 100%);',
'  font-family:"Noto Serif KR",serif;letter-spacing:-.04em;padding:72px 16px 130px;display:flex;flex-direction:column;align-items:center;}',
'@media(max-width:480px){#nyr{padding:60px 13px 120px;}}',
'#nyr>*{width:100%;max-width:640px;margin-left:auto;margin-right:auto;}',
'#nyr-load,#nyr-retry,#nyr-form{position:fixed;inset:0;z-index:1000000;background:#050308;display:flex;flex-direction:column;',
'  justify-content:center;align-items:center;text-align:center;padding:22px;font-family:"Noto Sans KR",sans-serif;transition:opacity .5s ease;}',
'#nyr-retry,#nyr-form{display:none;z-index:1000001;}',
'#nyr-retry.on{display:flex;}',
'#nyr-form.on{display:block;overflow-y:auto;padding:30px 14px 60px;}',
'.nyr-orb{position:relative;width:124px;height:124px;margin-bottom:30px;display:flex;align-items:center;justify-content:center;}',
'.nyr-orb .c{width:26px;height:26px;border-radius:50%;animation:nyrP 1.8s ease-in-out infinite;',
'  background:radial-gradient(circle at 35% 35%,#fff,#E7CE8E 40%,#C9A24B 70%);box-shadow:0 0 34px rgba(201,162,75,.95);}',
'@keyframes nyrP{0%,100%{transform:scale(1)}50%{transform:scale(1.2)}}',
'.nyr-orb .r{position:absolute;border-radius:50%;border:1px solid rgba(201,162,75,.28);}',
'.nyr-orb .r1{width:58px;height:58px;border-top-color:rgba(231,206,142,.95);animation:nyrS 1.6s linear infinite;}',
'.nyr-orb .r2{width:92px;height:92px;border-top-color:rgba(140,180,255,.8);animation:nyrS 2.6s linear infinite reverse;}',
'.nyr-orb .r3{width:124px;height:124px;border-top-color:rgba(201,162,75,.55);animation:nyrS 3.8s linear infinite;}',
'@keyframes nyrS{to{transform:rotate(360deg)}}',
'#nyr-load h3,#nyr-retry h3{color:#E7CE8E;font:900 19.5px "Noto Sans KR",sans-serif;margin:0 0 13px;}',
'#nyr-step{color:#ddd;font:500 14.5px/1.7 "Noto Sans KR",sans-serif;max-width:330px;display:block;min-height:76px;margin:0 auto 24px;word-break:keep-all;transition:opacity .4s ease;}',
'#nyr-step b{color:#E7CE8E;}',
'#nyr-load .hint{color:#6b687a;font:500 12px/1.7 "Noto Sans KR",sans-serif;max-width:300px;word-break:keep-all;}',
'#nyr-retry p{color:#b9b5c8;font:500 14px/1.8 "Noto Sans KR",sans-serif;margin:0 0 24px;max-width:320px;word-break:keep-all;}',
'#nyr-retry p strong{color:#7ee59b;}',
'#nyr-retry .oid{margin-top:16px;font-size:12px;color:#8b829e;line-height:1.7;}',
'#nyr-retry .oid b{color:#C9A24B;}',
'#nyr-retry button{background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;border:none;border-radius:12px;padding:15px 34px;font:900 15px "Noto Sans KR",sans-serif;cursor:pointer;}',
/* 표지 */
'.nyr-cover{text-align:center;padding:18px 0 4px;}',
'.nyr-cover .yr{font:900 64px/1 "Cormorant Garamond","Noto Serif KR",serif;color:#E7CE8E;letter-spacing:.02em;',
'  text-shadow:0 0 30px rgba(201,162,75,.35);}',
'.nyr-cover .lb{color:#C9A24B;font:700 11.5px "Noto Sans KR",sans-serif;letter-spacing:.34em;margin:12px 0 14px;}',
'.nyr-cover h1{color:#fff;font:900 24px/1.45 "Noto Serif KR",serif;margin:0 0 12px;word-break:keep-all;}',
'.nyr-cover h1 em{font-style:normal;color:#E7CE8E;}',
'.nyr-cover .who{color:#8b829e;font:500 12.5px/1.7 "Noto Sans KR",sans-serif;}',
'.nyr-line{width:56px;height:1px;margin:22px auto;background:linear-gradient(90deg,transparent,#C9A24B,transparent);}',
'.nyr-hero{background:linear-gradient(160deg,#2a2614,#151827);border:1px solid rgba(201,162,75,.45);border-radius:18px;padding:28px 22px;text-align:center;margin-bottom:22px;}',
'.nyr-hero .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:12px;}',
'.nyr-hero .h{color:#fff;font:700 20px/1.75 "Noto Serif KR",serif;word-break:keep-all;}',
'.nyr-hero .h b,.nyr-hero .h strong{color:#E7CE8E;}',
'.nyr-kw{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:16px;}',
'.nyr-kw span{padding:5px 12px;border-radius:16px;border:1px solid rgba(201,162,75,.45);color:#E7CE8E;font:700 12px "Noto Sans KR",sans-serif;}',
/* 점수판 */
'.nyr-sc{background:#151827;border:1px solid rgba(201,162,75,.3);border-radius:18px;padding:22px 20px;margin-bottom:22px;font-family:"Noto Sans KR",sans-serif;}',
'.nyr-sc .top{display:flex;align-items:center;gap:18px;margin-bottom:16px;}',
'.nyr-ring{position:relative;width:96px;height:96px;flex:none;}',
'.nyr-ring svg{width:100%;height:100%;display:block;transform:rotate(-90deg);}',
'.nyr-ring .v{position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;}',
'.nyr-ring .v b{font:900 28px "Noto Sans KR",sans-serif;color:#E7CE8E;line-height:1;}',
'.nyr-ring .v small{font:700 10.5px "Noto Sans KR",sans-serif;color:#8b829e;margin-top:4px;}',
'.nyr-prof .k{color:#C9A24B;font:800 11px "Noto Sans KR",sans-serif;letter-spacing:.18em;margin-bottom:5px;}',
'.nyr-prof .w{color:#fff;font:900 16.5px/1.45 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.nyr-prof .y{color:#9a93ad;font:500 12px/1.6 "Noto Sans KR",sans-serif;margin-top:4px;word-break:keep-all;}',
'.nyr-dm .row{display:flex;align-items:center;gap:10px;margin-bottom:9px;}',
'.nyr-dm .nm{width:56px;flex:none;font:700 12.5px "Noto Sans KR",sans-serif;color:#b9b5c8;}',
'.nyr-dm .tr{flex:1;height:9px;border-radius:5px;background:rgba(255,255,255,.06);overflow:hidden;}',
'.nyr-dm .fl{display:block;height:100%;width:0;border-radius:5px;transition:width 1.1s ease .2s;background:linear-gradient(90deg,#C9A24B,#E7CE8E);}',
'.nyr-dm .pc{width:30px;flex:none;text-align:right;font:800 12.5px "Noto Sans KR",sans-serif;color:#ded7cc;}',
'.nyr-dm .bm{width:44px;flex:none;text-align:right;font:600 11px "Noto Sans KR",sans-serif;color:#8b829e;}',
/* 곡선 */
'.nyr-flow{background:#151827;border:1px solid rgba(201,162,75,.25);border-radius:18px;padding:20px 14px 14px;margin-bottom:22px;}',
'.nyr-flow .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;text-align:center;margin-bottom:10px;}',
'.nyr-flow svg{width:100%;height:auto;display:block;}',
'.nyr-flow .cap{color:#6b687a;font:500 11px/1.7 "Noto Sans KR",sans-serif;text-align:center;margin-top:8px;word-break:keep-all;}',
'.nyr-flow .cap b{color:#E7CE8E;} .nyr-flow .cap i{font-style:normal;color:#E8654F;}',
/* 목성·토성 방 */
'.nyr-rooms{display:flex;gap:8px;margin-bottom:24px;font-family:"Noto Sans KR",sans-serif;}',
'.nyr-conv{background:linear-gradient(160deg,#1d1a2e,#151827);border:1px solid rgba(201,162,75,.45);border-radius:16px;padding:18px 16px;margin-bottom:24px;font-family:"Noto Sans KR",sans-serif;}',
'.nyr-conv .k{color:#E7CE8E;font:800 14px "Noto Sans KR",sans-serif;margin-bottom:4px;}',
'.nyr-conv .s{color:#8b829e;font:500 11.5px/1.6 "Noto Sans KR",sans-serif;margin-bottom:12px;word-break:keep-all;}',
'.nyr-conv .cv-row{padding:10px 0;border-top:1px solid rgba(255,255,255,.07);}',
'.nyr-conv .cv-a{color:#fff;font:900 15.5px "Noto Sans KR",sans-serif;margin-bottom:6px;}',
'.nyr-conv .cv-t{display:flex;flex-wrap:wrap;gap:5px;}',
'.nyr-conv .cv-t span{font:700 11px "Noto Sans KR",sans-serif;color:#E7CE8E;background:rgba(201,162,75,.12);border:1px solid rgba(201,162,75,.35);border-radius:10px;padding:3px 8px;}',
'.nyr-conv .cv-none{color:#b9b5c8;font:500 13px "Noto Sans KR",sans-serif;padding:8px 0;border-top:1px solid rgba(255,255,255,.07);}',
'.nyr-conv .cv-x{color:#b9b5c8;font:500 12.5px/1.6 "Noto Sans KR",sans-serif;padding-top:8px;word-break:keep-all;}',
'.nyr-conv .cv-x b{color:#E7CE8E;margin-right:4px;}',
'.nyr-conv .cv-m{display:flex;flex-wrap:wrap;gap:6px;margin-top:12px;}',
'.nyr-conv .cv-m span{font:800 12px "Noto Sans KR",sans-serif;border-radius:12px;padding:5px 10px;}',
'.nyr-conv .cv-m .g{background:rgba(201,162,75,.18);color:#E7CE8E;}',
'.nyr-conv .cv-m .c{background:rgba(232,101,79,.14);color:#f19a8a;}',
'.nyr-rooms>div{flex:1;border-radius:14px;padding:14px 13px;}',
'.nyr-rooms .j{background:rgba(201,162,75,.09);border:1px solid rgba(201,162,75,.4);}',
'.nyr-rooms .s{background:rgba(140,180,255,.07);border:1px solid rgba(140,180,255,.35);}',
'.nyr-rooms .k{font:800 11px "Noto Sans KR",sans-serif;letter-spacing:.12em;margin-bottom:6px;}',
'.nyr-rooms .j .k{color:#E7CE8E;} .nyr-rooms .s .k{color:#bcd2ff;}',
'.nyr-rooms .seg{color:#ded7cc;font:600 12px/1.6 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.nyr-rooms .seg small{color:#7d7590;font-weight:500;}',
/* 챕터 */
'.nyr-card{background:#151827;border:1px solid rgba(201,162,75,.22);border-radius:16px;padding:28px 22px 30px;margin-bottom:24px;',
'  opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease;}',
'.nyr-card.show{opacity:1;transform:none;}',
'.nyr-card.focus{border-color:rgba(201,162,75,.6);background:linear-gradient(180deg,#221d14,#151827);}',
'.nyr-no{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:9px;}',
'.nyr-no em{font-style:normal;margin-left:8px;padding:2px 8px;border-radius:10px;background:rgba(201,162,75,.18);color:#E7CE8E;letter-spacing:0;}',
'.nyr-tt{color:#fff;font:900 20px/1.5 "Noto Serif KR",serif;margin-bottom:18px;word-break:keep-all;}',
'.nyr-ct{font-family:"Noto Serif KR",serif;font-weight:400;font-size:16.5px;line-height:2.06;color:#ded7cc;letter-spacing:-.03em;word-break:keep-all;}',
'.nyr-ct b,.nyr-ct strong{color:#E7CE8E;font-weight:700;background:linear-gradient(transparent 62%,rgba(201,162,75,.22) 62%);}',
'.nyr-ct span[style*="ff3b30"]{background:rgba(255,59,48,.12);padding:2px 5px;border-radius:4px;}',
'.nyr-ct blockquote{margin:22px 0 6px;padding:16px 18px;border-left:3px solid #C9A24B;background:rgba(201,162,75,.07);border-radius:0 10px 10px 0;color:#f0e9d8;}',
'.nyr-ct br+br{display:block;content:"";margin-top:18px;}',
'@media(max-width:480px){.nyr-card{padding:24px 16px 26px;}.nyr-ct{font-size:15.5px;line-height:1.98;}.nyr-tt{font-size:18.5px;}}',
/* 월별 카드 */
'.nyr-months{margin-bottom:24px;}',
'.nyr-months .hd{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;text-align:center;margin:6px 0 4px;}',
'.nyr-months .hd2{color:#fff;font:900 20px/1.5 "Noto Serif KR",serif;text-align:center;margin-bottom:16px;}',
'.nyr-m{background:#151827;border:1px solid rgba(255,255,255,.08);border-radius:14px;padding:16px 16px 17px;margin-bottom:10px;',
'  opacity:0;transform:translateY(14px);transition:opacity .6s ease,transform .6s ease;}',
'.nyr-m.show{opacity:1;transform:none;}',
'.nyr-m.best{border-color:rgba(201,162,75,.6);} .nyr-m.care{border-color:rgba(232,101,79,.45);}',
'.nyr-m.past{opacity:.82;}',
'.nyr-m .mh{display:flex;align-items:center;gap:8px;margin-bottom:8px;font-family:"Noto Sans KR",sans-serif;}',
'.nyr-m .mn{font:900 17px "Noto Sans KR",sans-serif;color:#fff;}',
'.nyr-m .tg{font:800 10.5px "Noto Sans KR",sans-serif;padding:2px 8px;border-radius:10px;}',
'.nyr-m .tg.b{background:rgba(201,162,75,.2);color:#E7CE8E;} .nyr-m .tg.c{background:rgba(232,101,79,.15);color:#f19a8a;}',
'.nyr-m .tg.p{background:rgba(255,255,255,.08);color:#9a93ad;}',
'.nyr-m .mb{flex:1;height:5px;border-radius:3px;background:rgba(255,255,255,.06);overflow:hidden;margin-left:4px;}',
'.nyr-m .mb i{display:block;height:100%;background:#C9A24B;border-radius:3px;}',
'.nyr-m .mt{font:400 15px/1.95 "Noto Serif KR",serif;color:#d6cfc3;word-break:keep-all;}',
'.nyr-m .mt b{color:#E7CE8E;font-weight:700;}',
/* 날짜 타임라인 */
'.nyr-tl{margin-top:22px;font-family:"Noto Sans KR",sans-serif;}',
'.nyr-tl .it{position:relative;padding:0 0 16px 24px;}',
'.nyr-tl .it:before{content:"";position:absolute;left:5px;top:6px;bottom:-2px;width:1px;background:rgba(201,162,75,.25);}',
'.nyr-tl .it:last-child:before{display:none;}',
'.nyr-tl .dt{position:absolute;left:0;top:4px;width:11px;height:11px;border-radius:50%;}',
'.nyr-tl .wh{font:800 13px "Noto Sans KR",sans-serif;margin-bottom:2px;}',
'.nyr-tl .wy{color:#9a93ad;font:500 12px/1.55 "Noto Sans KR",sans-serif;word-break:keep-all;}',
/* 끝 */
'.nyr-close{background:linear-gradient(160deg,#2a2614,#0f1120);border:1px solid rgba(201,162,75,.5);border-radius:18px;padding:30px 22px;margin:30px 0 10px;}',
'.nyr-close .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:14px;text-align:center;}',
'.nyr-close .c{color:#f0e9d8;font:500 16.5px/2.05 "Noto Serif KR",serif;word-break:keep-all;}',
'.nyr-close .c b{color:#E7CE8E;}',
'.nyr-close blockquote{margin:18px 0 0;padding:14px 16px;border-left:3px solid #C9A24B;background:rgba(201,162,75,.08);border-radius:0 10px 10px 0;}',
'.nyr-teaser{margin:20px 0 0;padding:20px 18px;border-radius:14px;border:1px dashed rgba(201,162,75,.45);color:#b9b5c8;font:500 14px/1.9 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.nyr-teaser a{display:block;margin-top:14px;text-align:center;padding:13px;border-radius:11px;background:rgba(201,162,75,.14);color:#E7CE8E;font:800 14px "Noto Sans KR",sans-serif;text-decoration:none;}',
'#nyr-save-wrap{text-align:center;margin-top:26px;}',
'#nyr-save-btn{background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;border:none;border-radius:12px;padding:16px 36px;font:900 15px "Noto Sans KR",sans-serif;cursor:pointer;}',
'.nyr-foot{text-align:center;color:#565368;font:500 11px "Noto Sans KR",sans-serif;letter-spacing:.22em;margin-top:36px;}'
  ].join('');

  function h(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  function safe(html) {
    return String(html == null ? '' : html).replace(/<\s*(\/?)\s*([a-z]+)([^>]*)>/gi, function (m, close, tag, attrs) {
      tag = tag.toLowerCase();
      if (tag === 'span') { if (close) return '</span>'; return /#ff3b30/i.test(attrs) ? '<span style="color:#ff3b30;font-weight:900;">' : '<span>'; }
      if (/^(b|strong|br|blockquote|p|em|i)$/.test(tag)) return '<' + close + tag + '>';
      return '';
    });
  }
  function $(id) { return document.getElementById(id); }
  var AREA = { 1: '나 자신·새 출발', 2: '돈·수입', 3: '공부·계약·이동', 4: '집·가족', 5: '연애·취미',
    6: '일·몸 관리', 7: '결혼·파트너', 8: '큰돈·정리', 9: '여행·유학·자격증', 10: '커리어·평판',
    11: '인맥·오래 품은 꿈', 12: '휴식·마무리' };
  function kd(ymd) { var p = String(ymd).split('-'); return (+p[1]) + '월 ' + (+p[2]) + '일'; }

  function inject() {
    if ($('nyr')) return;
    var st = document.createElement('style'); st.id = 'nyr-style'; st.textContent = CSS; document.head.appendChild(st);
    var load = document.createElement('div'); load.id = 'nyr-load';
    load.innerHTML = '<div class="nyr-orb"><div class="r r1"></div><div class="r r2"></div><div class="r r3"></div><div class="c"></div></div>' +
      '<h3>신년운세를 만들고 있습니다</h3><div id="nyr-step">태어난 순간의 하늘을<br>다시 그리고 있습니다.</div>' +
      '<div class="hint">약 1~3분 걸립니다. 완성되면 주문내역에서 언제든 다시 열 수 있습니다.</div>';
    var retry = document.createElement('div'); retry.id = 'nyr-retry';
    retry.innerHTML = '<h3>잠시 문제가 생겼습니다</h3><p id="nyr-retry-msg"><strong>결제는 정상 완료되었습니다.</strong><br>아래 버튼을 눌러 다시 시도해 주세요.</p>' +
      '<button id="nyr-retry-btn">다시 시도하기</button><div class="oid" id="nyr-oid"></div>';
    var form = document.createElement('div'); form.id = 'nyr-form';
    var root = document.createElement('div'); root.id = 'nyr';
    function mount() {
      document.body.appendChild(load); document.body.appendChild(retry); document.body.appendChild(form); document.body.appendChild(root);
      $('nyr-retry-btn').onclick = function () {
        $('nyr-retry').classList.remove('on');
        var l = $('nyr-load'); l.style.display = 'flex'; l.style.opacity = '1';
        start(true);
      };
      if (ORDER_ID) $('nyr-oid').innerHTML = '계속 안 열리면 아래 주문번호로 문의해주세요.<br><b>' + h(ORDER_ID) + '</b>';
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  }

  var stepTimer = null;
  function startLoading() {
    var steps = ['태어난 순간의 하늘을<br>다시 그리고 있습니다.',
      '나의 새해 <b>메인테마</b>를<br>찾고 있습니다.',
      '<b>365일</b> 하늘을<br>하루씩 넘겨 보고 있습니다.',
      '복이 들어오는 <b>자리</b>와<br>고비가 오는 자리를 찾고 있습니다.',
      '일식과 월식이 내 차트의<br><b>어디에 떨어지는지</b> 보고 있습니다.',
      '열두 달을 한 장씩<br>써 내려가고 있습니다.'];
    var i = 0, el = $('nyr-step'); if (!el) return;
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = setInterval(function () {
      i = (i + 1) % steps.length; el.style.opacity = '0';
      setTimeout(function () { el.innerHTML = steps[i]; el.style.opacity = '1'; }, 400);
    }, 4200);
  }
  function hideLoad() {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    var l = $('nyr-load'); if (!l) return;
    l.style.opacity = '0'; setTimeout(function () { l.style.display = 'none'; }, 500);
  }
  function showRetry(msg) {
    if (rendered) return;
    hideLoad();
    if (msg) $('nyr-retry-msg').innerHTML = msg;
    $('nyr-retry').classList.add('on');
  }
  function needInput() {
    hideLoad();
    var box = $('nyr-form'); box.classList.add('on');
    box.innerHTML = '<div style="color:#8b829e;font:500 13px Noto Sans KR,sans-serif;text-align:center;padding:40px 0">입력폼을 불러오는 중…</div>';
    function go() {
      window.AstroIntake.mountInto(box, NO, function (data) {
        DATA = data; box.classList.remove('on'); box.innerHTML = '';
        var l = $('nyr-load'); l.style.display = 'flex'; l.style.opacity = '1';
        start(true);
      });
    }
    if (window.AstroIntake) return go();
    var sc = document.createElement('script'); sc.src = BASE + '/intake.js'; sc.onload = go;
    sc.onerror = function () { box.classList.remove('on'); showRetry('입력폼을 불러오지 못했습니다. 새로고침해 주세요.<br><strong>결제는 정상 완료되었습니다.</strong>'); };
    document.head.appendChild(sc);
  }

  /* ══════════════ 시각 요소 ══════════════ */
  function ringHTML(v) {
    var C = 2 * Math.PI * 42, off = C * (1 - Math.max(0, Math.min(100, v)) / 100);
    return '<div class="nyr-ring"><svg viewBox="0 0 100 100"><circle cx="50" cy="50" r="42" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="8"/>' +
      '<circle cx="50" cy="50" r="42" fill="none" stroke="#C9A24B" stroke-width="8" stroke-linecap="round" stroke-dasharray="' + C.toFixed(1) +
      '" stroke-dashoffset="' + off.toFixed(1) + '"/></svg><div class="v"><b>' + v + '</b><small>올해 총운</small></div></div>';
  }
  function scoreHTML(meta) {
    var s = meta.scores || {}, p = meta.profection || {}, bb = meta.bestBy || {};
    var D = [['애정', 'love'], ['금전', 'money'], ['일·성취', 'work'], ['컨디션', 'body']];
    var rows = D.map(function (d) {
      return '<div class="row"><span class="nm">' + d[0] + '</span><span class="tr"><i class="fl" data-w="' + (s[d[1]] || 0) + '"></i></span>' +
        '<span class="pc">' + (s[d[1]] || 0) + '</span><span class="bm">' + (bb[d[1]] ? bb[d[1]] + '월★' : '') + '</span></div>';
    }).join('');
    var turn = (p.before && p.after && p.before !== p.after) ? '생일(' + kd(p.birthday) + ')부터는 \'' + (AREA[p.after] || '') + '\'의 해로 바뀌어요' : '';
    var th = String(p.theme || '').split(' — ');
    return '<div class="nyr-sc"><div class="top">' + ringHTML(s.total || 0) +
      '<div class="nyr-prof"><div class="k">' + h(meta.year || '') + ' 메인테마</div><div class="w">' + h(th[0]) + '</div>' +
      (th[1] ? '<div class="y" style="margin-top:2px">' + h(th[1]) + '</div>' : '') +
      '<div class="y">올해를 이끄는 별 <b style="color:#E7CE8E">' + h(p.lord || '') + '</b>' + (turn ? '<br>' + h(turn) : '') + '</div></div></div>' +
      '<div class="nyr-dm">' + rows + '</div></div>';
  }
  function flowHTML(meta) {
    var M = meta.months || []; if (M.length !== 12) return '';
    var best = meta.bestMonths || [], care = meta.careMonths || [];
    var W = 600, H = 210, PX = 30, PY = 26;
    var X = function (i) { return PX + i * (W - PX * 2) / 11; };
    var Y = function (v) { return H - PY - (Math.max(0, Math.min(100, v)) / 100) * (H - PY * 2); };
    var pts = M.map(function (m, i) { return [X(i), Y(m.flow)]; });
    /* 부드러운 곡선 (카디널 스플라인) */
    var d = 'M' + pts[0][0].toFixed(1) + ',' + pts[0][1].toFixed(1);
    for (var i = 0; i < pts.length - 1; i++) {
      var p0 = pts[i - 1] || pts[i], p1 = pts[i], p2 = pts[i + 1], p3 = pts[i + 2] || p2;
      var c1x = p1[0] + (p2[0] - p0[0]) / 6, c1y = p1[1] + (p2[1] - p0[1]) / 6;
      var c2x = p2[0] - (p3[0] - p1[0]) / 6, c2y = p2[1] - (p3[1] - p1[1]) / 6;
      d += ' C' + c1x.toFixed(1) + ',' + c1y.toFixed(1) + ' ' + c2x.toFixed(1) + ',' + c2y.toFixed(1) + ' ' + p2[0].toFixed(1) + ',' + p2[1].toFixed(1);
    }
    var area = d + ' L' + X(11) + ',' + (H - PY) + ' L' + X(0) + ',' + (H - PY) + ' Z';
    var dots = '', labels = '';
    M.forEach(function (m, i) {
      var isB = best.indexOf(m.m) !== -1, isC = care.indexOf(m.m) !== -1;
      var col = isB ? '#E7CE8E' : (isC ? '#E8654F' : 'rgba(201,162,75,.55)');
      dots += '<circle cx="' + X(i).toFixed(1) + '" cy="' + Y(m.flow).toFixed(1) + '" r="' + (isB || isC ? 5.5 : 3.2) + '" fill="' + col + '"' + (m.passed ? ' opacity=".45"' : '') + '/>';
      labels += '<text x="' + X(i).toFixed(1) + '" y="' + (H - 6) + '" fill="' + (isB ? '#E7CE8E' : (isC ? '#f19a8a' : '#6b687a')) +
        '" font-size="11" font-weight="' + (isB || isC ? 800 : 500) + '" text-anchor="middle" font-family="sans-serif">' + m.m + '월</text>';
    });
    return '<div class="nyr-flow"><div class="t">' + (meta.year || '') + ' FLOW</div>' +
      '<svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg"><defs><linearGradient id="nyrG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="rgba(201,162,75,.32)"/><stop offset="1" stop-color="rgba(201,162,75,0)"/></linearGradient></defs>' +
      '<line x1="' + PX + '" y1="' + (H - PY) + '" x2="' + (W - PX) + '" y2="' + (H - PY) + '" stroke="rgba(255,255,255,.12)"/>' +
      '<path d="' + area + '" fill="url(#nyrG)"/><path d="' + d + '" fill="none" stroke="#E7CE8E" stroke-width="2.4" stroke-linecap="round"/>' +
      dots + labels + '</svg>' +
      '<div class="cap"><b>● 가장 좋은 달 ' + best.map(function (m) { return m + '월'; }).join('·') + '</b> &nbsp; <i>● 숨 고를 달 ' +
      care.map(function (m) { return m + '월'; }).join('·') + '</i><br>1년 365일 하늘을 내 차트에 하루씩 겹쳐 본 결과예요. 높을수록 일이 잘 풀리는 달이에요.</div></div>';
  }
  function roomsHTML(meta) {
    /* '5하우스' 같은 숫자 대신 생활 영역으로 보여준다 */
    var seg = function (arr) {
      var full = arr && arr.length === 1;
      return (arr || []).map(function (s) {
        return '<b style="color:inherit">' + h(AREA[s.house] || '') + '</b><br><small>' +
          (full ? '1년 내내' : kd(s.from) + ' ~ ' + kd(s.to)) + '</small>';
      }).join('<br>');
    };
    return '<div class="nyr-rooms"><div class="j"><div class="k">🍀 행운이 들어오는 곳</div><div class="seg">' + seg(meta.jupiter) + '</div></div>' +
      '<div class="s"><div class="k">🌿 미리 챙길 곳</div><div class="seg">' + seg(meta.saturn) + '</div></div></div>';
  }
  /* 네 가지 기법이 겹친 곳 — 시각 미상이면 생일 차트·진행 달이 없어 카드 자체를 뺀다 */
  function convHTML(meta) {
    var c = meta.converge, sr = meta.solarReturn, pm = meta.progMoon;
    if (!c || !sr) return '';
    var rows = (c.themes || []).map(function (t) {
      return '<div class="cv-row"><div class="cv-a">' + h(t.areas.join(' · ')) + '</div><div class="cv-t">' +
        t.techs.map(function (x) { return '<span>' + h(x) + '</span>'; }).join('') + '</div></div>';
    }).join('');
    if (!rows) rows = '<div class="cv-none">한 곳에 몰리지 않고 고르게 흘러가는 해예요.</div>';
    var pmTxt = (pm || []).map(function (s, i) {
      return (i === 0 ? '' : kd(s.from) + '부터 ') + '\'' + h(AREA[s.house] || '') + '\'';
    }).join(' → ');
    var mos = (c.months || []).filter(function (x) { return x.tone !== 'mixed'; }).map(function (x) {
      return '<span class="' + (x.tone === 'good' ? 'g' : 'c') + '">' + x.m + '월 ' + (x.tone === 'good' ? '순풍' : '숨 고르기') + '</span>';
    }).join('');
    return '<div class="nyr-conv"><div class="k">🔭 여러 기법이 함께 가리킨 곳</div>' +
      '<div class="s">1년의 행성 이동 · 메인테마 · 올해 생일 차트 · 마음의 시계 — 네 가지로 따로 보고, 겹치는 곳만 골랐어요</div>' +
      rows +
      '<div class="cv-x"><b>올해 생일 차트</b> ' + h(sr.ascSign) + ' 상승 · \'' + h(AREA[sr.ascHouse] || '') + '\'의 얼굴</div>' +
      (pmTxt ? '<div class="cv-x"><b>마음의 시계</b> ' + pmTxt + '</div>' : '') +
      (mos ? '<div class="cv-m">' + mos + '</div>' : '') + '</div>';
  }
  function datesHTML(meta) {
    var items = [];
    (meta.eclipses || []).forEach(function (e) {
      items.push({ ymd: e.ymd, c: e.personal ? '#E7CE8E' : '#a07fb0', w: kd(e.ymd) + ' · ' + e.type + (e.personal ? ' ★' : ''),
        y: (AREA[e.house] || '') + ' 쪽' + (e.personal ? ' — 내 행성 위에 떨어지는 날' : '') });
    });
    (meta.keyDays || []).forEach(function (k) {
      items.push({ ymd: k.ymd, c: k.tone === 'good' ? '#C9A24B' : (k.tone === 'hard' ? '#E8654F' : '#8cb4ff'), w: k.text.split(' — ')[0], y: k.text.split(' — ')[1] || '' });
    });
    (meta.retro || []).forEach(function (r) {
      items.push({ ymd: r.from, c: '#6b687a', w: kd(r.from) + ' ~ ' + kd(r.to) + ' · ' + r.P + ' 역행', y: (AREA[r.house] || '') + ' 쪽에서' });
    });
    if (!items.length) return '';
    items.sort(function (a, b) { return a.ymd < b.ymd ? -1 : 1; });
    return '<div class="nyr-tl">' + items.map(function (it) {
      return '<div class="it"><span class="dt" style="background:' + it.c + '"></span><div class="wh" style="color:' + it.c + '">' + h(it.w) + '</div><div class="wy">' + h(it.y) + '</div></div>';
    }).join('') + '</div>';
  }

  /* ══════════════ 렌더 ══════════════ */
  var rendered = false;
  /* 제목 안의 {Y} 는 렌더할 때 연도로 바뀐다 */
  var CH1 = [['01', 'ch1_overview', '한눈에 보는 {Y}년'], ['02', 'ch2_theme', '나의 {Y}년 메인테마'],
             ['03', 'ch3_jupiter', '{Y}년 나에게 오는 세 가지 행운'],
             ['04', 'ch4_saturn', '{Y}년 미리 알면 약이 되는 세 가지'], ['05', 'ch5_love', '애정운'], ['06', 'ch6_money', '금전운'],
             ['07', 'ch7_work', '일과 성취'], ['08', 'ch8_body', '컨디션과 마음']];
  var FOCUS_KEY = { '연애·결혼': 'ch5_love', '돈': 'ch6_money', '일·이직': 'ch7_work', '건강': 'ch8_body', '공부·시험': 'ch7_work' };

  function render(payload) {
    if (rendered) return true;
    if (!payload || payload.error || payload.status !== 'completed') return false;
    var rep = payload.report || {}, meta = payload.meta || {};
    if (!rep.headline || !rep.ch1_overview) return false;
    try {
      var root = $('nyr'); if (!root) return false;
      var name = meta.name || (DATA && DATA.me && DATA.me.name) || '';
      var Y = meta.year || '';
      var fk = FOCUS_KEY[meta.focus];
      var P = [];
      P.push('<div class="nyr-cover"><div class="yr">' + h(Y) + '</div><div class="lb">ASTRANOTE NEW YEAR REPORT</div>' +
        '<h1><em>' + h(name) + '</em>님의 ' + h(Y) + '년</h1><div class="who">태어난 순간의 하늘에 1년 365일을 하루씩 겹쳐 봤어요</div><div class="nyr-line"></div></div>');
      P.push('<div class="nyr-hero"><div class="t">' + h(Y) + '년을 한 문장으로</div><div class="h">' + safe(rep.headline) + '</div>' +
        '<div class="nyr-kw">' + [rep.keyword_1, rep.keyword_2, rep.keyword_3].filter(Boolean).map(function (k) { return '<span>' + h(k) + '</span>'; }).join('') + '</div></div>');
      P.push(scoreHTML(meta));
      P.push(flowHTML(meta));
      P.push(roomsHTML(meta));
      P.push(convHTML(meta));

      CH1.forEach(function (c) {
        var body = rep[c[1]]; if (!body) return;
        var isF = fk === c[1];
        P.push('<div class="nyr-card' + (isF ? ' focus' : '') + '"><div class="nyr-no">CHAPTER ' + c[0] + (isF ? '<em>가장 궁금한 것</em>' : '') + '</div>' +
          '<div class="nyr-tt">' + h(c[2].replace('{Y}', Y)) + '</div><div class="nyr-ct">' + safe(body) + '</div></div>');
      });

      var M = meta.months || [];
      var best = meta.bestMonths || [], care = meta.careMonths || [];
      var mh = '<div class="nyr-months"><div class="hd">MONTH BY MONTH</div><div class="hd2">열두 달, 한 장씩</div>';
      for (var m = 1; m <= 12; m++) {
        var t = rep['month_' + m]; if (!t) continue;
        var info = M[m - 1] || {};
        var isB = best.indexOf(m) !== -1, isC = care.indexOf(m) !== -1;
        var tag = info.passed ? '<span class="tg p">지난 달 · 맞았나요?</span>' : (isB ? '<span class="tg b">좋은 달</span>' : (isC ? '<span class="tg c">숨 고를 달</span>' : ''));
        mh += '<div class="nyr-m' + (isB ? ' best' : '') + (isC ? ' care' : '') + (info.passed ? ' past' : '') + '"><div class="mh"><span class="mn">' + m + '월</span>' + tag +
          '<span class="mb"><i style="width:' + (info.flow || 0) + '%"></i></span></div><div class="mt">' + safe(t) + '</div></div>';
      }
      P.push(mh + '</div>');

      if (rep.ch9_keydates) P.push('<div class="nyr-card"><div class="nyr-no">KEY DATES</div><div class="nyr-tt">' + h(Y) + '년 꼭 기억할 날</div>' +
        '<div class="nyr-ct">' + safe(rep.ch9_keydates) + '</div>' + datesHTML(meta) + '</div>');
      if (rep.ch10_action) P.push('<div class="nyr-card focus"><div class="nyr-no">THREE HINTS</div><div class="nyr-tt">' + h(Y) + '년의 세 가지 힌트</div>' +
        '<div class="nyr-ct">' + safe(rep.ch10_action) + '</div></div>');
      if (rep.closing) P.push('<div class="nyr-close"><div class="t">마지막으로</div><div class="c">' + safe(rep.closing) + '</div></div>');
      if (rep.teaser) P.push('<div class="nyr-teaser">' + safe(rep.teaser) + '<a href="/product/detail.html?product_no=11">내 차트 전체 보기 — VVIP 운명 리포트</a></div>');
      P.push('<div id="nyr-save-wrap"><button id="nyr-save-btn">📥 ' + h(Y) + ' 신년운세 이미지로 저장하기</button></div>');
      P.push('<div class="nyr-foot">ASTRANOTE · WESTERN ASTROLOGY</div>');

      root.innerHTML = P.join('');
      rendered = true;
      try { if (ORDER_ID) localStorage.setItem(REP_PREFIX + ORDER_ID, JSON.stringify(payload)); } catch (e) {}
      hideLoad();

      var cards = root.querySelectorAll('.nyr-card,.nyr-m');
      Array.prototype.forEach.call(cards, function (card, i) { setTimeout(function () { card.classList.add('show'); }, 100 + Math.min(i, 10) * 120); });
      if ('IntersectionObserver' in window) {
        var ob = new IntersectionObserver(function (es) { es.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('show'); }); }, { threshold: 0.06 });
        Array.prototype.forEach.call(cards, function (c) { ob.observe(c); });
      }
      setTimeout(function () {
        Array.prototype.forEach.call(root.querySelectorAll('.nyr-dm .fl'), function (b) { b.style.width = (b.getAttribute('data-w') || 0) + '%'; });
      }, 500);
      var sb = $('nyr-save-btn');
      if (sb) sb.onclick = function () {
        if (typeof window.__astroSaveOpen === 'function') { window.__astroSaveOpen(NO, sb); return; }
        basicSave();
      };
      return true;
    } catch (err) {
      console.error('[신년운세] 렌더 실패:', err);
      rendered = false; return false;
    }
  }

  function basicSave() {
    var el = $('nyr');
    if (!el || typeof html2canvas !== 'function') { alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.'); return; }
    html2canvas(el, { backgroundColor: '#0A0C16', scale: 2, useCORS: true }).then(function (cv) {
      var a = document.createElement('a'); a.download = '신년운세.png'; a.href = cv.toDataURL('image/png'); a.click();
    }).catch(function () { alert('이미지 저장에 실패했습니다. 화면을 직접 캡처해 주세요.'); });
  }

  /* ══════════════ 구동 ══════════════ */
  var polls = 0, MAX_POLL = 34;
  function poll() {
    if (rendered) return;
    if (!ORDER_ID || ++polls > MAX_POLL) { showRetry(null); return; }
    fetch(API + '?orderId=' + encodeURIComponent(ORDER_ID), { cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return null; }).then(function (d) { return { code: r.status, d: d }; }); })
      .then(function (x) {
        if (x.d && x.d.status === 'completed' && render(x.d)) return;
        if (x.code === 404 && x.d && x.d.state === 'failed') { showRetry(null); return; }
        setTimeout(poll, 8000);
      })
      .catch(function () { setTimeout(poll, 8000); });
  }
  function post(bodyObj) {
    return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(bodyObj) })
      .then(function (res) {
        if (res.status === 202) { setTimeout(poll, 6000); return null; }
        return res.json().catch(function () { return null; }).then(function (d) {
          if (!d) { if (ORDER_ID) setTimeout(poll, 8000); else showRetry(null); return; }
          if (d.status === 'pending') { setTimeout(poll, 6000); return; }
          if (d.status === 'completed' && render(d)) return;
          if (res.status === 400 && d.needInput) { needInput(); return; }
          if (res.status === 409) { showRetry(h(d.error)); return; }
          if (res.status === 429) { setTimeout(function () { post(bodyObj); }, 15000); return; }
          if (ORDER_ID) setTimeout(poll, 8000);
          else showRetry(h(d.error || '') + '<br><strong>결제는 정상 완료되었습니다.</strong>');
        });
      });
  }
  function start(isRetry) {
    rendered = false; polls = 0;
    startLoading();
    if (!isRetry && ORDER_ID) {
      try { var s = localStorage.getItem(REP_PREFIX + ORDER_ID); if (s && render(JSON.parse(s))) return; } catch (e) {}
    }
    var pre = ORDER_ID
      ? fetch(API + '?orderId=' + encodeURIComponent(ORDER_ID), { cache: 'no-store' })
          .then(function (r) { return r.json().catch(function () { return null; }); }).catch(function () { return null; })
      : Promise.resolve(null);
    pre.then(function (cached) {
      if (cached && cached.status === 'completed' && render(cached)) return;
      if (cached && cached.status === 'pending') { setTimeout(poll, 6000); return; }
      if (!(DATA && DATA.me)) {
        if (ORDER_ID && cached && cached.canRegenerate) return post({ orderId: ORDER_ID });
        needInput(); return;
      }
      var body = { me: DATA.me, status: DATA.status, focus: DATA.focus };
      if (ORDER_ID) body.orderId = ORDER_ID;
      return post(body);
    }).catch(function (e) {
      console.warn('[신년운세] 통신 실패:', e);
      if (ORDER_ID) setTimeout(poll, 8000); else showRetry(null);
    });
  }
  function ensureH2C() {
    if (typeof html2canvas === 'function') return;
    var sc = document.createElement('script'); sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(sc);
  }
  function boot() { inject(); ensureH2C(); start(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
