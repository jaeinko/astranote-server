/* ============================================================================
   ASTRANOTE — 재회운 리포트 결과화면 (product_no=16 · 12,900원)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/reunion.js
   ▣ 카페24 order_result.html 에 한 줄 (child.js 바로 아래):
        script src="https://astranote-server.vercel.app/reunion.js"  (태그로 감싸서)

   ▣ 순서: 이 기기 저장본 → 서버 저장본 → 새로 만들기(+8초 폴링)
     입력값이 이 기기에 없으면 → 서버 보관 입력값으로 재생성 시도
     그것도 없으면 → 결과화면 안에서 입력폼을 띄운다 (상세페이지=결제페이지로 보내지 않는다)
   ============================================================================ */
(function () {
  'use strict';

  var NO = '16';
  var BASE = 'https://astranote-server.vercel.app';
  var API = BASE + '/api/gemini-reunion';
  var DATA_KEY = 'astro_reunion_data';
  var REP_PREFIX = 'astro_rep:16:';

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
  window.__astroReunionV1 = true;

  var ORDER_ID = qs('order_id') || qs('orderId') || null;

  /* ══════════════ CSS ══════════════ */
  var CSS = [
'#astro-result-container,#data-loading,#retry-screen,#astro-vip-result-container,#vip-data-loading,#vip-retry-screen,',
'#cpr,#cpr-load,#cpr-retry,#mtg,#mtg-load,#mtr,#chd,#chd-load,#chd-retry,#nyr,#nyr-load,#nyr-retry{display:none!important;}',
'#header,#footer,.titleArea,.ec-base-step1,#aside,.topLogo,.path,.order-complete-wrap,.contentsBox,.snsIntroBox{display:none!important;}',
'html,body{max-width:100vw;overflow-x:hidden;margin:0;padding:0;background:#0A0C16!important;}',
'#rnn,#rnn *{box-sizing:border-box!important;}',
'#rnn{width:100%;min-height:100vh;position:absolute;top:0;left:0;z-index:999999;color:#E8E6EF;',
'  background:radial-gradient(circle at 50% -6%,#2a1a33 0%,#0A0C16 46%,#050308 100%);',
'  font-family:"Noto Serif KR",serif;letter-spacing:-.04em;padding:72px 16px 130px;display:flex;flex-direction:column;align-items:center;}',
'@media(max-width:480px){#rnn{padding:60px 13px 120px;}}',
'#rnn>*{width:100%;max-width:640px;margin-left:auto;margin-right:auto;}',
/* 로딩·재시도·재입력 */
'#rnn-load,#rnn-retry,#rnn-form{position:fixed;inset:0;z-index:1000000;background:#050308;display:flex;flex-direction:column;',
'  justify-content:center;align-items:center;text-align:center;padding:22px;font-family:"Noto Sans KR",sans-serif;transition:opacity .5s ease;}',
'#rnn-retry,#rnn-form{display:none;z-index:1000001;}',
'#rnn-retry.on{display:flex;}',
'#rnn-form.on{display:block;overflow-y:auto;padding:30px 14px 60px;}',
'.rnn-orb{position:relative;width:124px;height:124px;margin-bottom:30px;display:flex;align-items:center;justify-content:center;}',
'.rnn-orb .c{width:24px;height:24px;border-radius:50%;animation:rnnP 1.8s ease-in-out infinite;',
'  background:radial-gradient(circle at 35% 35%,#fff,#E7CE8E 40%,#C9A24B 70%);box-shadow:0 0 30px rgba(201,162,75,.9);}',
'@keyframes rnnP{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
'.rnn-orb .r{position:absolute;border-radius:50%;border:1px solid rgba(201,162,75,.28);}',
'.rnn-orb .r1{width:58px;height:58px;border-top-color:rgba(231,206,142,.95);animation:rnnS 1.6s linear infinite;}',
'.rnn-orb .r2{width:92px;height:92px;border-top-color:rgba(232,101,79,.8);animation:rnnS 2.6s linear infinite reverse;}',
'.rnn-orb .r3{width:124px;height:124px;border-top-color:rgba(201,162,75,.55);animation:rnnS 3.8s linear infinite;}',
'@keyframes rnnS{to{transform:rotate(360deg)}}',
'#rnn-load h3,#rnn-retry h3{color:#E7CE8E;font:900 19.5px "Noto Sans KR",sans-serif;margin:0 0 13px;letter-spacing:-.05em;}',
'#rnn-step{color:#ddd;font:500 14.5px/1.7 "Noto Sans KR",sans-serif;max-width:330px;display:block;min-height:76px;margin:0 auto 24px;word-break:keep-all;transition:opacity .4s ease;}',
'#rnn-step b{color:#E7CE8E;}',
'#rnn-load .hint{color:#6b687a;font:500 12px/1.7 "Noto Sans KR",sans-serif;max-width:300px;word-break:keep-all;}',
'#rnn-retry p{color:#b9b5c8;font:500 14px/1.8 "Noto Sans KR",sans-serif;margin:0 0 24px;max-width:320px;word-break:keep-all;}',
'#rnn-retry p strong{color:#7ee59b;}',
'#rnn-retry .oid{margin-top:16px;font-size:12px;color:#8b829e;line-height:1.7;}',
'#rnn-retry .oid b{color:#C9A24B;}',
'#rnn-retry button{background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;border:none;border-radius:12px;padding:15px 34px;',
'  font:900 15px "Noto Sans KR",sans-serif;cursor:pointer;}',
/* 표지 */
'.rnn-cover{text-align:center;padding:22px 0 6px;}',
'.rnn-cover .lb{color:#C9A24B;font:700 11.5px "Noto Sans KR",sans-serif;letter-spacing:.34em;margin-bottom:16px;}',
'.rnn-cover h1{color:#fff;font:900 26px/1.45 "Noto Serif KR",serif;margin:0 0 14px;letter-spacing:-.05em;word-break:keep-all;}',
'.rnn-cover h1 em{font-style:normal;color:#E7CE8E;}',
'.rnn-cover .who{color:#8b829e;font:500 13px/1.7 "Noto Sans KR",sans-serif;}',
'.rnn-cover .who b{color:#ded7cc;}',
'.rnn-line{width:56px;height:1px;margin:24px auto;background:linear-gradient(90deg,transparent,#C9A24B,transparent);}',
'.rnn-hero{background:linear-gradient(160deg,#2a1a33,#151827);border:1px solid rgba(201,162,75,.4);border-radius:18px;',
'  padding:28px 22px;text-align:center;margin-bottom:22px;}',
'.rnn-hero .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:12px;}',
'.rnn-hero .h{color:#fff;font:700 20px/1.75 "Noto Serif KR",serif;letter-spacing:-.045em;word-break:keep-all;}',
'.rnn-hero .h b,.rnn-hero .h strong{color:#E7CE8E;}',
'.rnn-kw{display:flex;justify-content:center;gap:7px;flex-wrap:wrap;margin-top:16px;}',
'.rnn-kw span{padding:5px 12px;border-radius:16px;border:1px solid rgba(201,162,75,.45);color:#E7CE8E;font:700 12px "Noto Sans KR",sans-serif;}',
/* 사랑 vs 관성 */
'.rnn-mix{background:#151827;border:1px solid rgba(201,162,75,.3);border-radius:18px;padding:24px 20px;margin-bottom:26px;font-family:"Noto Sans KR",sans-serif;}',
'.rnn-mix .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;text-align:center;margin-bottom:6px;}',
'.rnn-mix .q{color:#fff;font:800 16px/1.5 "Noto Sans KR",sans-serif;text-align:center;margin-bottom:16px;word-break:keep-all;}',
'.rnn-vs{display:flex;justify-content:space-between;align-items:flex-end;margin-bottom:8px;}',
'.rnn-vs .l,.rnn-vs .r{font:900 26px "Noto Sans KR",sans-serif;letter-spacing:-.04em;}',
'.rnn-vs .l{color:#E7CE8E;} .rnn-vs .r{color:#c78ba8;}',
'.rnn-vs small{display:block;font:700 11.5px "Noto Sans KR",sans-serif;color:#9a93ad;letter-spacing:0;}',
'.rnn-vs .r small{text-align:right;}',
'.rnn-bar{display:flex;height:16px;border-radius:8px;overflow:hidden;background:rgba(255,255,255,.06);}',
'.rnn-bar i{display:block;height:100%;width:0;transition:width 1.1s ease .2s;}',
'.rnn-rows{margin-top:16px;}',
'.rnn-rows .row{display:flex;align-items:center;gap:10px;margin-bottom:8px;}',
'.rnn-rows .nm{width:52px;flex:none;font:700 12.5px "Noto Sans KR",sans-serif;color:#b9b5c8;}',
'.rnn-rows .dot{width:9px;height:9px;border-radius:50%;flex:none;}',
'.rnn-rows .ds{flex:1;font:500 11.5px/1.5 "Noto Sans KR",sans-serif;color:#7d7590;word-break:keep-all;}',
'.rnn-rows .pc{width:40px;flex:none;text-align:right;font:800 13px "Noto Sans KR",sans-serif;color:#ded7cc;}',
'.rnn-mix .cap{margin-top:12px;color:#6b687a;font:500 11px/1.7 "Noto Sans KR",sans-serif;text-align:center;word-break:keep-all;}',
/* 챕터 */
'.rnn-card{background:#151827;border:1px solid rgba(201,162,75,.22);border-radius:16px;padding:28px 22px 30px;margin-bottom:24px;',
'  opacity:0;transform:translateY(18px);transition:opacity .7s ease,transform .7s ease;}',
'.rnn-card.show{opacity:1;transform:none;}',
'.rnn-card.key{border-color:rgba(201,162,75,.55);background:linear-gradient(180deg,#1d1730,#151827);}',
'.rnn-no{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:9px;}',
'.rnn-tt{color:#fff;font:900 20px/1.5 "Noto Serif KR",serif;letter-spacing:-.05em;margin-bottom:18px;word-break:keep-all;}',
'.rnn-ct{font-family:"Noto Serif KR",serif;font-weight:400;font-size:16.5px;line-height:2.06;color:#ded7cc;letter-spacing:-.03em;word-break:keep-all;}',
'.rnn-ct b,.rnn-ct strong{color:#E7CE8E;font-weight:700;background:linear-gradient(transparent 62%,rgba(201,162,75,.22) 62%);}',
'.rnn-ct span[style*="ff3b30"]{background:rgba(255,59,48,.12);padding:2px 5px;border-radius:4px;}',
'.rnn-ct blockquote{margin:22px 0 6px;padding:16px 18px;border-left:3px solid #C9A24B;background:rgba(201,162,75,.07);',
'  border-radius:0 10px 10px 0;color:#f0e9d8;font-size:16px;line-height:1.95;}',
'.rnn-ct br+br{display:block;content:"";margin-top:18px;}',
'@media(max-width:480px){.rnn-card{padding:24px 16px 26px;}.rnn-ct{font-size:15.5px;line-height:1.98;}.rnn-tt{font-size:18.5px;}}',
/* 시기 타임라인 */
'.rnn-tl{margin-top:22px;font-family:"Noto Sans KR",sans-serif;}',
'.rnn-tl .best{border:1px solid #C9A24B;background:rgba(201,162,75,.1);border-radius:14px;padding:15px 16px;margin-bottom:16px;}',
'.rnn-tl .best .k{color:#C9A24B;font:800 11px "Noto Sans KR",sans-serif;letter-spacing:.2em;margin-bottom:6px;}',
'.rnn-tl .best .w{color:#fff;font:900 16px/1.5 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.rnn-tl .best .y{color:#b9b5c8;font:500 12.5px/1.6 "Noto Sans KR",sans-serif;margin-top:4px;word-break:keep-all;}',
'.rnn-tl .it{position:relative;padding:0 0 18px 24px;}',
'.rnn-tl .it:before{content:"";position:absolute;left:5px;top:6px;bottom:-2px;width:1px;background:rgba(201,162,75,.25);}',
'.rnn-tl .it:last-child:before{display:none;}',
'.rnn-tl .dt{position:absolute;left:0;top:4px;width:11px;height:11px;border-radius:50%;}',
'.rnn-tl .lb{font:800 13px "Noto Sans KR",sans-serif;margin-bottom:2px;}',
'.rnn-tl .wh{color:#ded7cc;font:600 12.5px/1.5 "Noto Sans KR",sans-serif;}',
'.rnn-tl .wy{color:#7d7590;font:500 11.5px/1.55 "Noto Sans KR",sans-serif;word-break:keep-all;}',
/* 놓아야 할 근거 */
'.rnn-lg{margin-top:20px;font-family:"Noto Sans KR",sans-serif;}',
'.rnn-lg .it{padding:12px 14px;border-radius:12px;background:rgba(232,101,79,.07);border:1px solid rgba(232,101,79,.25);margin-bottom:8px;}',
'.rnn-lg .k{color:#E8654F;font:800 12.5px "Noto Sans KR",sans-serif;margin-bottom:3px;}',
'.rnn-lg .m{color:#c9c3d6;font:500 12.5px/1.65 "Noto Sans KR",sans-serif;word-break:keep-all;}',
/* 결론 배지 */
'.rnn-dir{text-align:center;margin:4px 0 20px;}',
'.rnn-dir span{display:inline-block;padding:10px 20px;border-radius:24px;font:900 15px "Noto Sans KR",sans-serif;letter-spacing:-.03em;}',
'.rnn-dir .go{background:rgba(201,162,75,.16);border:1px solid #C9A24B;color:#E7CE8E;}',
'.rnn-dir .if{background:rgba(140,180,255,.1);border:1px solid rgba(140,180,255,.55);color:#bcd2ff;}',
'.rnn-dir .stop{background:rgba(199,139,168,.12);border:1px solid rgba(199,139,168,.6);color:#e3b6cb;}',
/* 맺음·티저·저장 */
'.rnn-close{background:linear-gradient(160deg,#2a1a33,#0f1120);border:1px solid rgba(201,162,75,.5);border-radius:18px;padding:30px 22px;margin:30px 0 10px;text-align:center;}',
'.rnn-close .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:14px;}',
'.rnn-close .c{color:#f0e9d8;font:500 16.5px/2.05 "Noto Serif KR",serif;word-break:keep-all;text-align:left;}',
'.rnn-close .c b{color:#E7CE8E;}',
'.rnn-close blockquote{margin:18px 0 0;padding:14px 16px;border-left:3px solid #C9A24B;background:rgba(201,162,75,.08);border-radius:0 10px 10px 0;}',
'.rnn-teaser{margin:20px 0 0;padding:20px 18px;border-radius:14px;border:1px dashed rgba(201,162,75,.45);color:#b9b5c8;',
'  font:500 14px/1.9 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.rnn-teaser a{display:block;margin-top:14px;text-align:center;padding:13px;border-radius:11px;background:rgba(201,162,75,.14);',
'  color:#E7CE8E;font:800 14px "Noto Sans KR",sans-serif;text-decoration:none;}',
'#rnn-save-wrap{text-align:center;margin-top:26px;}',
'#rnn-save-btn{background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;border:none;border-radius:12px;padding:16px 36px;',
'  font:900 15px "Noto Sans KR",sans-serif;cursor:pointer;}',
/* 그 사람 쪽 하늘 */
'.rnn-ex{margin-top:22px;font-family:"Noto Sans KR",sans-serif;}',
'.rnn-ex .note{color:#8b829e;font:500 11.5px/1.65 "Noto Sans KR",sans-serif;margin:0 0 14px;word-break:keep-all;}',
'.rnn-ex .tg{border:1px solid #C9A24B;background:linear-gradient(135deg,rgba(201,162,75,.16),rgba(160,127,176,.12));border-radius:14px;padding:15px 16px;margin-top:6px;}',
'.rnn-ex .tg .k{color:#E7CE8E;font:800 11px "Noto Sans KR",sans-serif;letter-spacing:.18em;margin-bottom:8px;}',
'.rnn-ex .tg .w{color:#fff;font:900 15px/1.55 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.rnn-ex .tg .y{color:#b9b5c8;font:500 12px/1.55 "Noto Sans KR",sans-serif;margin:2px 0 8px;word-break:keep-all;}',
'.rnn-ex .tg .y:last-child{margin-bottom:0;}',
/* 맨 끝 큰 결론 */
'.rnn-vd{margin:34px 0 6px;padding:44px 22px 46px;border-radius:22px;text-align:center;position:relative;overflow:hidden;',
'  background:radial-gradient(120% 90% at 50% 0%,rgba(201,162,75,.22),rgba(15,17,32,0) 62%),linear-gradient(170deg,#1d1530,#0b0d18);border:1px solid rgba(201,162,75,.55);}',
'.rnn-vd .t{color:#C9A24B;font:800 11px "Noto Sans KR",sans-serif;letter-spacing:.34em;margin-bottom:22px;}',
'.rnn-vd .ld{color:#d9cfe6;font:500 19px/1.6 "Noto Serif KR",serif;word-break:keep-all;margin-bottom:12px;}',
'.rnn-vd .ln{font:900 29px/1.5 "Noto Serif KR",serif;letter-spacing:-.03em;word-break:keep-all;color:#F3DFA6;}',
'.rnn-vd.wait .ln{color:#cfdcff;}.rnn-vd.let .ln{color:#f0c8da;}',
'.rnn-vd .ln em{font-style:normal;display:block;}',
'.rnn-vd .nm{color:#8b829e;font:500 12px "Noto Sans KR",sans-serif;margin-top:24px;letter-spacing:.06em;}',
'@media(max-width:480px){.rnn-vd .ln{font-size:25px;}.rnn-vd .ld{font-size:17px;}}',
'.rnn-foot{text-align:center;color:#565368;font:500 11px "Noto Sans KR",sans-serif;letter-spacing:.22em;margin-top:36px;}'
  ].join('');

  function h(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;'); }
  /* 원고 HTML 정화 — 허용 태그는 속성을 전부 떼고 정규 형태로 다시 쓴다.
     (onclick 같은 속성이 허용 태그에 붙어 들어와도 살아남지 못한다)
     빨간 경고 span 만 정확히 그 스타일로 재생성. */
  function safe(html) {
    return String(html == null ? '' : html).replace(/<\s*(\/?)\s*([a-z]+)([^>]*)>/gi, function (m, close, tag, attrs) {
      tag = tag.toLowerCase();
      if (tag === 'span') {
        if (close) return '</span>';
        return /#ff3b30/i.test(attrs) ? '<span style="color:#ff3b30;font-weight:900;">' : '<span>';
      }
      if (/^(b|strong|br|blockquote|p|em|i)$/.test(tag)) return '<' + close + tag + '>';
      return '';
    });
  }
  function $(id) { return document.getElementById(id); }

  /* ══════════════ 골격 ══════════════ */
  function inject() {
    if ($('rnn')) return;
    var st = document.createElement('style'); st.id = 'rnn-style'; st.textContent = CSS;
    document.head.appendChild(st);
    var load = document.createElement('div'); load.id = 'rnn-load';
    load.innerHTML = '<div class="rnn-orb"><div class="r r1"></div><div class="r r2"></div><div class="r r3"></div><div class="c"></div></div>' +
      '<h3>재회운 리포트를 만들고 있습니다</h3><div id="rnn-step">두 사람이 태어난 순간의 하늘을<br>다시 그리고 있습니다.</div>' +
      '<div class="hint">약 1~3분 걸립니다. 완성되면 주문내역에서 언제든 다시 열 수 있습니다.</div>';
    var retry = document.createElement('div'); retry.id = 'rnn-retry';
    retry.innerHTML = '<h3>잠시 문제가 생겼습니다</h3><p id="rnn-retry-msg"><strong>결제는 정상 완료되었습니다.</strong><br>아래 버튼을 눌러 다시 시도해 주세요.</p>' +
      '<button id="rnn-retry-btn">다시 시도하기</button><div class="oid" id="rnn-oid"></div>';
    var form = document.createElement('div'); form.id = 'rnn-form';
    var root = document.createElement('div'); root.id = 'rnn';
    function mount() {
      document.body.appendChild(load); document.body.appendChild(retry); document.body.appendChild(form); document.body.appendChild(root);
      $('rnn-retry-btn').onclick = function () {
        $('rnn-retry').classList.remove('on');
        var l = $('rnn-load'); l.style.display = 'flex'; l.style.opacity = '1';
        start(true);
      };
      if (ORDER_ID) $('rnn-oid').innerHTML = '계속 안 열리면 아래 주문번호로 문의해주세요.<br><b>' + h(ORDER_ID) + '</b>';
    }
    if (document.body) mount(); else document.addEventListener('DOMContentLoaded', mount);
  }

  var stepTimer = null;
  function startLoading() {
    var steps = ['두 사람이 태어난 순간의 하늘을<br>다시 그리고 있습니다.',
      '이 관계가 <b>어디서 어긋났는지</b><br>각도를 재고 있습니다.',
      '못 놓는 이유가 <b>사랑인지 관성인지</b><br>다섯 가지로 나눠 보고 있습니다.',
      '앞으로 18개월의 하늘을<br><b>하루 단위로</b> 넘겨보고 있습니다.',
      '놓아야 한다면 그 근거까지<br>빠짐없이 찾고 있습니다.',
      '한 문장 한 문장,<br>두 사람의 이야기를 쓰고 있습니다.'];
    var i = 0, el = $('rnn-step'); if (!el) return;
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = setInterval(function () {
      i = (i + 1) % steps.length; el.style.opacity = '0';
      setTimeout(function () { el.innerHTML = steps[i]; el.style.opacity = '1'; }, 400);
    }, 4200);
  }
  function hideLoad() {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    var l = $('rnn-load'); if (!l) return;
    l.style.opacity = '0'; setTimeout(function () { l.style.display = 'none'; }, 500);
  }
  function showRetry(msg) {
    if (rendered) return;
    hideLoad();
    if (msg) $('rnn-retry-msg').innerHTML = msg;
    $('rnn-retry').classList.add('on');
  }

  /* ══════════════ 재입력 폼 (intake.js 를 불러 화면 안에) ══════════════ */
  function needInput() {
    hideLoad();
    var box = $('rnn-form'); box.classList.add('on');
    box.innerHTML = '<div style="color:#8b829e;font:500 13px Noto Sans KR,sans-serif;text-align:center;padding:40px 0">입력폼을 불러오는 중…</div>';
    function go() {
      window.AstroIntake.mountInto(box, NO, function (data) {
        DATA = data;
        box.classList.remove('on'); box.innerHTML = '';
        var l = $('rnn-load'); l.style.display = 'flex'; l.style.opacity = '1';
        start(true);
      });
    }
    if (window.AstroIntake) return go();
    var sc = document.createElement('script');
    sc.src = BASE + '/intake.js';
    sc.onload = go;
    sc.onerror = function () { box.classList.remove('on'); showRetry('입력폼을 불러오지 못했습니다. 새로고침해 주세요.<br><strong>결제는 정상 완료되었습니다.</strong>'); };
    document.head.appendChild(sc);
  }

  /* ══════════════ 렌더 ══════════════ */
  var rendered = false;
  var CH = [
    /* 상세페이지 목차와 같은 제목 — 서버(api/gemini-reunion.js) 프롬프트의 [n장 · 제목]과도 같다 */
    ['01', 'ch1_ended', '우리가 끝난 진짜 이유'], ['02', 'ch2_remains', '그런데 왜, 아직도 생각날까'],
    ['03', 'ch3_love_or_inertia', '못 놓는 이유, 사랑일까 관성일까', 1], ['04', 'ch4_repeat', '다시 만나면 또 부딪힐 그 자리'],
    ['05', 'ch5_changed', '그때와 지금, 달라진 흐름'], ['06', 'ch6_their_now', '그 사람은 지금 어떤 계절을 지나고 있을까'],
    ['07', 'ch7_their_sky', '그 사람 쪽 하늘이 열리는 날', 1], ['08', 'ch8_timing', '내가 연락한다면, 그날', 1],
    ['09', 'ch9_letgo', '놓아야 한다면, 그 이유', 1], ['10', 'ch10_verdict', '그래서, 우리는']
  ];
  var FACT = [
    ['정', '#E7CE8E', '함께 있으면 편하고 따뜻했던 힘'],
    ['성장', '#C9A24B', '서로를 앞으로 가게 했던 힘'],
    ['익숙함', '#a07fb0', '이미 아는 사람이라 돌아가고 싶은 힘'],
    ['책임감', '#8c6a9e', '의무와 미안함으로 붙잡는 힘'],
    ['집착', '#c78ba8', '떨어져 있을수록 더 당기는 힘']
  ];

  function mixHTML(meta) {
    var sh = meta.share; if (!sh) return '';
    var bar = FACT.map(function (f) { return '<i data-w="' + (sh[f[0]] || 0) + '" style="background:' + f[1] + '"></i>'; }).join('');
    var rows = FACT.map(function (f) {
      return '<div class="row"><span class="dot" style="background:' + f[1] + '"></span><span class="nm">' + f[0] + '</span>' +
        '<span class="ds">' + f[2] + '</span><span class="pc">' + (sh[f[0]] || 0) + '%</span></div>';
    }).join('');
    return '<div class="rnn-mix"><div class="t">WHY YOU CAN\'T LET GO</div>' +
      '<div class="q">이 관계가 나를 붙잡는 힘</div>' +
      '<div class="rnn-vs"><div class="l"><small>사랑 쪽</small>' + (meta.love || 0) + '%</div>' +
      '<div class="r"><small>관성 쪽</small>' + (meta.inertia || 0) + '%</div></div>' +
      '<div class="rnn-bar">' + bar + '</div><div class="rnn-rows">' + rows + '</div>' +
      '<div class="cap">재회 확률이 아니에요. 두 사람 차트 사이의 각도로, 이 관계가 나를 붙잡는 힘이 무엇으로 이뤄져 있는지 나눠 본 거예요. 자세한 풀이는 3장에 있어요.</div></div>';
  }

  var KIND = {
    open: ['#E7CE8E', '문이 열리는 때'], minor: ['#E7CE8E', '짧게 열리는 틈'],
    retro: ['#a07fb0', ''], caution: ['#E8654F', '']
  };
  function timelineHTML(meta) {
    var ws = (meta.windows || []);
    if (!ws.length && !meta.best) return '';
    var best = meta.best;
    var html = '<div class="rnn-tl">';
    if (best) {
      html += '<div class="best"><div class="k">★ ' + (meta.contact === '차단된 상태' ? '다시 손을 잡아도 되는 때' : '가장 좋은 문') + '</div>' +
        '<div class="w">' + h(best.when) + '</div><div class="y">' + h(best.why) + '</div></div>';
    }
    ws.filter(function (w) { return !(best && w.start === best.start && w.why === best.why); }).slice(0, 12).forEach(function (w) {
      var k = KIND[w.kind] || KIND.retro;
      html += '<div class="it"><span class="dt" style="background:' + k[0] + '"></span>' +
        '<div class="lb" style="color:' + k[0] + '">' + h(w.label || k[1]) + '</div>' +
        '<div class="wh">' + h(w.when) + '</div><div class="wy">' + h(w.why) + '</div></div>';
    });
    return html + '</div>';
  }
  var EXC = { soften: '#E7CE8E', retro: '#a07fb0', venus: '#c78ba8' };
  function exHTML(meta, B) {
    var ws = meta.exWindows || [], tg = meta.together || [];
    if (!ws.length && !tg.length) return '';
    var html = '<div class="rnn-ex"><div class="note">' + h(B) + '님이 연락할지는 ' + h(B) + '님의 마음이 정해요. 아래는 ' + h(B) +
      '님의 차트로 계산한, 하늘이 연락하기 쉬운 쪽으로 열리는 때예요.</div><div class="rnn-tl">';
    ws.forEach(function (w) {
      var c = EXC[w.kind] || '#a07fb0';
      html += '<div class="it"><span class="dt" style="background:' + c + '"></span><div class="lb" style="color:' + c + '">' + h(w.label) + '</div>' +
        '<div class="wh">' + h(w.when) + '</div><div class="wy">' + h(w.why) + '</div></div>';
    });
    html += '</div>';
    if (tg.length) {
      html += '<div class="tg"><div class="k">★ 두 사람의 하늘이 같이 열리는 날</div>' + tg.map(function (w) {
        return '<div class="w">' + h(w.when) + '</div><div class="y">' + h(w.why) + '</div>';
      }).join('') + '</div>';
    }
    return html + '</div>';
  }
  function verdictHTML(meta, A, B) {
    var v = meta.verdict; if (!v || !v.line) return '';
    /* "이제는… 놓아줘야 할 때" — 말줄임표 뒤에서 한 번 쉬게 줄을 나눈다 */
    var line = h(v.line).replace(/…\s*/, '…</em><em>').replace(/,\s*/, ',</em><em>');
    return '<div class="rnn-vd ' + h(v.key || '') + '"><div class="t">' + h(A) + '님의 결론</div>' +
      '<div class="ld">' + h(v.lead) + '</div><div class="ln"><em>' + line + '</em></div>' +
      '<div class="nm">' + h(A) + ' · ' + h(B) + '</div></div>';
  }
  function letgoHTML(meta) {
    var L = meta.letgo || [];
    if (!L.length) return '';
    return '<div class="rnn-lg">' + L.map(function (x) {
      return '<div class="it"><div class="k">' + h(x.kind) + '</div><div class="m">' + h(x.meaning) + '</div></div>';
    }).join('') + '</div>';
  }
  function dirHTML(meta) {
    if (!meta.direction) return '';
    var c = /두드려/.test(meta.direction) ? 'go' : (/놓는/.test(meta.direction) ? 'stop' : 'if');
    return '<div class="rnn-dir"><span class="' + c + '">' + h(meta.direction) + '</span></div>';
  }

  function render(payload) {
    if (rendered) return true;
    if (!payload || payload.error || payload.status !== 'completed') return false;
    var rep = payload.report || {}, meta = payload.meta || {};
    if (!rep.headline || !rep.ch1_ended) return false;
    try {
      var root = $('rnn'); if (!root) return false;
      var A = meta.nameA || (DATA && DATA.me && DATA.me.name) || '나';
      var B = meta.nameB || (DATA && DATA.ex && DATA.ex.name) || '그 사람';
      var P = [];
      P.push('<div class="rnn-cover"><div class="lb">ASTRANOTE REUNION REPORT</div>' +
        '<h1><em>' + h(A) + '</em>님과 <em>' + h(B) + '</em>님,<br>다시 만나도 될까</h1>' +
        '<div class="who">헤어진 지 <b>' + h(meta.breakup ? meta.breakup.label : (meta.stage || '')) + '</b> · ' + h(meta.contact || '') + '</div><div class="rnn-line"></div></div>');
      P.push('<div class="rnn-hero"><div class="t">이 관계를 한 문장으로</div><div class="h">' + safe(rep.headline) + '</div>' +
        '<div class="rnn-kw">' + [rep.keyword_1, rep.keyword_2, rep.keyword_3].filter(Boolean).map(function (k) { return '<span>' + h(k) + '</span>'; }).join('') + '</div></div>');
      P.push(mixHTML(meta));

      CH.forEach(function (c, i) {
        var body = rep[c[1]]; if (!body) return;
        var title = c[2];
        if (c[1] === 'ch8_timing' && meta.contact === '차단된 상태') title = '마음을 정리할 때, 다시 손잡아도 될 때';
        var extra = '', pre = '';
        if (c[1] === 'ch7_their_sky') extra = exHTML(meta, B);
        if (c[1] === 'ch8_timing') extra = timelineHTML(meta);
        if (c[1] === 'ch9_letgo') extra = letgoHTML(meta);
        if (c[1] === 'ch10_verdict') pre = dirHTML(meta);
        var key = c[3] ? ' key' : '';
        P.push('<div class="rnn-card' + key + '"><div class="rnn-no">CHAPTER ' + c[0] + '</div><div class="rnn-tt">' + h(title) + '</div>' +
          pre + '<div class="rnn-ct">' + safe(body) + '</div>' + extra + '</div>');
      });

      if (rep.teaser) P.push('<div class="rnn-teaser">' + safe(rep.teaser) +
        '<a href="/product/detail.html?product_no=11">내 차트 전체 보기 — VVIP 운명 리포트</a></div>');
      if (rep.closing) P.push('<div class="rnn-close"><div class="t">마지막으로</div><div class="c">' + safe(rep.closing) + '</div></div>');
      P.push(verdictHTML(meta, A, B));
      P.push('<div id="rnn-save-wrap"><button id="rnn-save-btn">📥 리포트 이미지로 저장하기</button></div>');
      P.push('<div class="rnn-foot">ASTRANOTE · WESTERN ASTROLOGY</div>');

      root.innerHTML = P.join('');
      rendered = true;
      try { if (ORDER_ID) localStorage.setItem(REP_PREFIX + ORDER_ID, JSON.stringify(payload)); } catch (e) {}
      hideLoad();

      var cards = root.querySelectorAll('.rnn-card');
      Array.prototype.forEach.call(cards, function (card, i) { setTimeout(function () { card.classList.add('show'); }, 120 + i * 140); });
      setTimeout(function () {
        Array.prototype.forEach.call(root.querySelectorAll('.rnn-bar i'), function (b) { b.style.width = (b.getAttribute('data-w') || 0) + '%'; });
      }, 500);

      var sb = $('rnn-save-btn');
      if (sb) sb.onclick = function () {
        if (typeof window.__astroSaveOpen === 'function') { window.__astroSaveOpen(NO, sb); return; }
        basicSave();
      };
      return true;
    } catch (err) {
      console.error('[재회운] 렌더 실패:', err);
      rendered = false; return false;
    }
  }

  function basicSave() {
    var el = $('rnn');
    if (!el || typeof html2canvas !== 'function') { alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.'); return; }
    html2canvas(el, { backgroundColor: '#0A0C16', scale: 2, useCORS: true }).then(function (cv) {
      var a = document.createElement('a'); a.download = '재회운리포트.png'; a.href = cv.toDataURL('image/png'); a.click();
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
        /* 생성이 실패로 끝났으면 폴링을 멈추고 다시 시도 버튼 */
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

      var hasLocal = DATA && DATA.me && DATA.ex;
      if (!hasLocal) {
        /* 서버에 입력값이 있으면 주문번호만으로 만든다 (다른 기기로 열린 경우) */
        if (ORDER_ID && cached && cached.canRegenerate) return post({ orderId: ORDER_ID });
        needInput();
        return;
      }
      var body = { me: DATA.me, ex: DATA.ex, breakup: DATA.breakup, stage: DATA.stage, initiator: DATA.initiator, contact: DATA.contact };
      if (ORDER_ID) body.orderId = ORDER_ID;
      return post(body);
    }).catch(function (e) {
      console.warn('[재회운] 통신 실패:', e);
      if (ORDER_ID) setTimeout(poll, 8000); else showRetry(null);
    });
  }

  function ensureH2C() {
    if (typeof html2canvas === 'function') return;
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(sc);
  }
  function boot() { inject(); ensureH2C(); start(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
