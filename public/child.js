/* ============================================================================
   ASTRANOTE — 우리 아이 양육설명서 결과화면 (product_no=16 · 29,900원)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/child.js  (GitHub 저장소)
   ▣ 카페24 order_result.html 에 한 줄:
        script src="https://astranote-server.vercel.app/child.js"  (태그로 감싸서)
     resolve.js 보다 뒤, save.js 보다 앞이면 됩니다.

   ⚠️⚠️ 이 자리에 원래 lib/astro-child.js(계산엔진)가 복사되어 올라가 있었습니다.
        결과화면이 아니라 서버 코드였습니다. 양육설명서 손님은 결제 후
        기본 주문완료 화면만 봤습니다. 이 파일이 그 구멍을 메웁니다.

   ▣ 상품 페이지(주문서)가 저장해야 하는 것 — 이 계약만 지키면 됩니다

        localStorage['astro_child_data'] = JSON.stringify({
          parent: { name, date:'YYYY-MM-DD', time:'HH:MM', timeUnknown:false,
                    city:'Seoul', gender:'여성' },
          child:  { name, date:'YYYY-MM-DD', time:'HH:MM', timeUnknown:false,
                    city:'Seoul', gender:'남성' },
          ageBand: '미취학' | '초등' | '중고등' | '성인자녀' 중 하나
        })

     부모 시각을 모르면 parent.timeUnknown:true (또는 time 비움).
     서버가 알아서 케미스트리 장을 빼고 나머지를 씁니다.

   ▣ 서버 응답 (api/gemini-child.js)
        { status:'completed', meta:{...}, report:{ headline,
          ch1_title..ch9_title, ch1_lead..ch9_lead, ch1_nature..ch9_tenyears,
          closing } }
     meta.saturn  : [{label, meaning, ageFrom, ageTo, yearFrom, yearTo, passes}]
     meta.jupiter : [{age, year}]
     meta.curve   : [{age, y(0~100)}]   ← 성장 곡선 그래프용
     meta.balance : { element:{불,흙,공기,물}, topElement, lackElement }
     meta.hasParent : false 면 5장이 없다 — 그 자리는 안내문으로 채운다
   ============================================================================ */
(function () {
  'use strict';

  var NO = '16';
  var API = 'https://astranote-server.vercel.app/api/gemini-child';
  var DATA_KEY = 'astro_child_data';
  var REP_KEY_PREFIX = 'astro_rep:16:';

  function qs(k) {
    try { return new URLSearchParams(location.search).get(k); } catch (e) { return null; }
  }

  /* ── 상품 판정: 16번이 아니면 즉시 퇴장 (다른 상품 영향 0) ── */
  var urlHint = qs('product_no') || qs('productNo');
  var stored = null;
  try { stored = JSON.parse(localStorage.getItem(DATA_KEY) || 'null'); } catch (e) {}
  var hinted = urlHint || (stored && stored.productNo) || null;
  if (String(hinted) !== NO) return;
  if (window.__astroReportInit) return;
  window.__astroChildV1 = true;
  window.__astroReportInit = true;

  var ORDER_ID = qs('order_id') || qs('orderId') || null;
  var DATA = stored;

  /* ══════════════════════════════════════════════════════════════
     CSS — 아스트라노트 디자인 시스템 (INK #0A0C16 · GOLD #C9A24B)
     ══════════════════════════════════════════════════════════════ */
  var CSS = [
'#astro-result-container,#data-loading,#retry-screen,#astro-vip-result-container,',
'#vip-data-loading,#vip-retry-screen,#cpr,#cpr-load,#cpr-retry,#mtg,#mtg-load,#mtr{display:none!important;}',
'#header,#footer,.titleArea,.ec-base-step1,#aside,.topLogo,.path,.order-complete-wrap,',
'.contentsBox,.snsIntroBox{display:none!important;}',
'html,body{max-width:100vw;overflow-x:hidden;margin:0;padding:0;background:#0A0C16!important;}',
'#chd,#chd *{box-sizing:border-box!important;}',
'#chd{width:100%;min-height:100vh;position:absolute;top:0;left:0;z-index:999999;color:#E8E6EF;',
'  background:radial-gradient(circle at 50% -6%,#1b2140 0%,#0A0C16 46%,#050308 100%);',
'  font-family:"Noto Serif KR",serif;letter-spacing:-.04em;',
'  padding:72px 16px 130px;display:flex;flex-direction:column;align-items:center;}',
'@media(max-width:480px){#chd{padding:64px 13px 122px;}}',
'#chd>*{width:100%;max-width:640px;margin-left:auto;margin-right:auto;}',

/* ── 로딩 ── */
'#chd-load{position:fixed;inset:0;z-index:1000000;background:#050308;display:flex;',
'  flex-direction:column;justify-content:center;align-items:center;text-align:center;',
'  padding:20px;transition:opacity .5s ease;font-family:"Noto Sans KR",sans-serif;}',
'.chd-orb{position:relative;width:124px;height:124px;margin-bottom:30px;display:flex;align-items:center;justify-content:center;}',
'.chd-orb .c{width:24px;height:24px;border-radius:50%;animation:chdP 1.8s ease-in-out infinite;',
'  background:radial-gradient(circle at 35% 35%,#fff,#E7CE8E 40%,#C9A24B 70%);',
'  box-shadow:0 0 30px rgba(201,162,75,.9),0 0 60px rgba(201,162,75,.45);}',
'@keyframes chdP{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
'.chd-orb .r{position:absolute;border-radius:50%;border:1px solid rgba(201,162,75,.28);}',
'.chd-orb .r1{width:58px;height:58px;border-top-color:rgba(231,206,142,.95);animation:chdS 1.6s linear infinite;}',
'.chd-orb .r2{width:92px;height:92px;border-top-color:rgba(140,180,255,.85);animation:chdS 2.6s linear infinite reverse;}',
'.chd-orb .r3{width:124px;height:124px;border-top-color:rgba(201,162,75,.55);animation:chdS 3.8s linear infinite;}',
'@keyframes chdS{to{transform:rotate(360deg)}}',
'#chd-load h3{color:#E7CE8E;font:900 20px "Noto Sans KR",sans-serif;margin:0 0 13px;letter-spacing:-.05em;}',
/* 🚨 2026-08-04 글자 흩어짐 수정 — display:flex 를 쓰면 안 되는 자리였다.
   ------------------------------------------------------------------
   flex 컨테이너 안에서는 자식이 전부 '플렉스 아이템'이 된다.
   "각이 <b>가장 정확해지는 날짜</b>를<br>하루 단위로 찾습니다." 는
   [각이] [가장 정확해지는 날짜] [를] [하루 단위로 찾습니다.] 네 덩어리로
   쪼개져 가로로 늘어서고, <br> 은 무시된다. 손님 화면에서 글자가
   제멋대로 흩어져 보인 이유가 이것이다.
   게다가 height:50px + overflow:hidden 이라 3줄짜리 문구는 마지막 줄이 잘렸다.

   → block 으로 되돌리고, 가장 긴 3줄 문구 기준으로 min-height 를 잡아
     문구가 바뀔 때 진행바가 위아래로 튀지 않게 한다. */
'#chd-step{color:#ddd;font:500 14.5px/1.7 "Noto Sans KR",sans-serif;max-width:330px;',
'  display:block;min-height:76px;text-align:center;margin-left:auto;margin-right:auto;',
'  word-break:keep-all;transition:opacity .4s ease;margin-bottom:24px;}',
'#chd-step b{color:#E7CE8E;}',
'#chd-load .hint{color:#6b687a;font:500 12px/1.7 "Noto Sans KR",sans-serif;max-width:300px;word-break:keep-all;}',

/* ── 재시도 ── */
'#chd-retry{position:fixed;inset:0;z-index:1000001;background:#050308;display:none;',
'  flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:26px;',
'  font-family:"Noto Sans KR",sans-serif;}',
'#chd-retry.on{display:flex;}',
'#chd-retry h3{color:#E7CE8E;font:900 19px "Noto Sans KR",sans-serif;margin:0 0 14px;letter-spacing:-.05em;}',
'#chd-retry p{color:#b9b5c8;font:500 14px/1.8 "Noto Sans KR",sans-serif;margin:0 0 24px;max-width:320px;word-break:keep-all;}',
'#chd-retry p strong{color:#7ee59b;}',
'#chd-retry .oid{margin-top:16px;font-size:12px;color:#8b829e;line-height:1.7;}',
'#chd-retry .oid b{color:#C9A24B;}',
'#chd-retry-btn{background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;border:none;',
'  border-radius:12px;padding:15px 34px;font:900 15px "Noto Sans KR",sans-serif;cursor:pointer;letter-spacing:-.04em;}',

/* ── 표지 ── */
'.chd-cover{text-align:center;padding:22px 0 6px;}',
'.chd-cover .lb{color:#C9A24B;font:700 11.5px "Noto Sans KR",sans-serif;letter-spacing:.34em;margin-bottom:16px;}',
'.chd-cover h1{color:#fff;font:900 27px/1.45 "Noto Serif KR",serif;margin:0 0 14px;letter-spacing:-.05em;word-break:keep-all;}',
'.chd-cover h1 em{font-style:normal;color:#E7CE8E;}',
'.chd-cover .who{color:#8b829e;font:500 13px "Noto Sans KR",sans-serif;letter-spacing:-.02em;}',
'.chd-cover .who b{color:#ded7cc;font-weight:700;}',
'.chd-line{width:56px;height:1px;margin:26px auto;',
'  background:linear-gradient(90deg,transparent,#C9A24B,transparent);}',

/* ── 헤드라인(핵심 한 문장) ── */
'.chd-hero{background:linear-gradient(160deg,#1c1730,#151827);border:1px solid rgba(201,162,75,.4);',
'  border-radius:18px;padding:30px 24px;text-align:center;margin-bottom:30px;}',
'.chd-hero .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:14px;}',
'.chd-hero .h{color:#fff;font:700 19.5px/1.85 "Noto Serif KR",serif;letter-spacing:-.045em;word-break:keep-all;}',
'.chd-hero .h b,.chd-hero .h strong{color:#E7CE8E;}',

/* ── 챕터 카드 ── */
'.chd-card{background:#151827;border:1px solid rgba(201,162,75,.22);border-radius:16px;',
'  padding:28px 22px 30px;margin-bottom:26px;opacity:0;transform:translateY(18px);',
'  transition:opacity .7s ease,transform .7s ease;}',
'.chd-card.show{opacity:1;transform:none;}',
'.chd-no{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:9px;}',
'.chd-tt{color:#fff;font:900 20px/1.5 "Noto Serif KR",serif;letter-spacing:-.05em;margin-bottom:6px;word-break:keep-all;}',
'.chd-lead{color:#9a93ad;font:500 13.5px/1.85 "Noto Sans KR",sans-serif;letter-spacing:-.03em;',
'  margin:10px 0 20px;padding-left:12px;border-left:2px solid rgba(201,162,75,.45);word-break:keep-all;}',
'.chd-ct{font-family:"Noto Serif KR",serif;font-weight:400;font-size:16.5px;line-height:2.06;',
'  color:#ded7cc;letter-spacing:-.03em;text-align:left;word-break:keep-all;}',
'.chd-ct b,.chd-ct strong{color:#E7CE8E;font-weight:700;',
'  background:linear-gradient(transparent 62%,rgba(201,162,75,.22) 62%);}',
'.chd-ct blockquote{margin:22px 0 6px;padding:16px 18px;border-left:3px solid #C9A24B;',
'  background:rgba(201,162,75,.07);border-radius:0 10px 10px 0;color:#f0e9d8;',
'  font-size:16px;line-height:1.95;}',
'.chd-ct br+br{display:block;content:"";margin-top:20px;}',

/* ── 원소 밸런스 바 (1장) ── */
'.chd-bal{margin:22px 0 2px;}',
'.chd-bal .row{display:flex;align-items:center;gap:10px;margin-bottom:10px;}',
'.chd-bal .nm{width:44px;flex:none;color:#9a93ad;font:700 12.5px "Noto Sans KR",sans-serif;}',
'.chd-bal .tr{flex:1;height:9px;background:rgba(255,255,255,.06);border-radius:5px;overflow:hidden;}',
'.chd-bal .fl{height:100%;border-radius:5px;width:0;transition:width 1.1s ease .25s;}',
'.chd-bal .pc{width:38px;flex:none;text-align:right;color:#ded7cc;font:700 12.5px "Noto Sans KR",sans-serif;}',
'.chd-bal-cap{color:#6b687a;font:500 11.5px/1.7 "Noto Sans KR",sans-serif;margin-top:8px;text-align:center;word-break:keep-all;}',
'.chd-bal-cap b{color:#E7CE8E;}',

/* ── 토성 타임라인 (8장) ── */
'.chd-tl{margin-top:24px;}',
'.chd-tl .it{position:relative;padding:0 0 26px 26px;}',
'.chd-tl .it:before{content:"";position:absolute;left:6px;top:6px;bottom:-4px;width:1px;',
'  background:linear-gradient(180deg,rgba(201,162,75,.6),rgba(201,162,75,.08));}',
'.chd-tl .it:last-child:before{display:none;}',
'.chd-tl .dot{position:absolute;left:0;top:3px;width:13px;height:13px;border-radius:50%;',
'  background:radial-gradient(circle at 35% 35%,#fff,#E7CE8E 45%,#C9A24B 80%);',
'  box-shadow:0 0 10px rgba(201,162,75,.7);}',
'.chd-tl .when{color:#E7CE8E;font:900 15px "Noto Sans KR",sans-serif;letter-spacing:-.03em;margin-bottom:3px;}',
'.chd-tl .lb2{color:#fff;font:700 14px "Noto Sans KR",sans-serif;margin-bottom:5px;}',
'.chd-tl .ms{color:#9a93ad;font:500 13px/1.8 "Noto Sans KR",sans-serif;word-break:keep-all;}',
'.chd-tl .ps{display:inline-block;margin-top:6px;padding:3px 10px;border-radius:20px;',
'  border:1px solid rgba(201,162,75,.4);color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;}',

/* ── 성장 곡선 (9장) ── */
'.chd-curve{margin-top:24px;}',
'.chd-curve svg{width:100%;height:auto;display:block;}',
'.chd-curve .cap{color:#6b687a;font:500 11.5px/1.7 "Noto Sans KR",sans-serif;margin-top:10px;',
'  text-align:center;word-break:keep-all;}',
'.chd-curve .cap b{color:#E7CE8E;}',

/* ── 맺음말 ── */
'.chd-close{background:linear-gradient(160deg,#1c1730,#0f1120);border:1px solid rgba(201,162,75,.5);',
'  border-radius:18px;padding:32px 24px;text-align:center;margin:34px 0 10px;}',
'.chd-close .t{color:#C9A24B;font:700 11px "Noto Sans KR",sans-serif;letter-spacing:.3em;margin-bottom:16px;}',
'.chd-close .ct2{color:#f0e9d8;font:500 16.5px/2.05 "Noto Serif KR",serif;letter-spacing:-.04em;word-break:keep-all;}',
'.chd-close .ct2 b{color:#E7CE8E;}',

/* ── 저장 버튼 ── */
'#chd-save-wrap{text-align:center;margin-top:26px;}',
'#chd-save-btn{background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;border:none;',
'  border-radius:12px;padding:16px 36px;font:900 15px "Noto Sans KR",sans-serif;cursor:pointer;letter-spacing:-.04em;}',
'.chd-foot{text-align:center;color:#565368;font:500 11px "Noto Sans KR",sans-serif;',
'  letter-spacing:.22em;margin-top:38px;}'
  ].join('');

  /* ══════════════════════════════════════════════════════════════
     유틸
     ══════════════════════════════════════════════════════════════ */
  function h(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;')
      .replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }
  /* 서버 원고는 <b>·<br>·<blockquote>·<p> 만 쓰기로 검증돼 있다.
     그래도 다른 태그가 섞여 오면 화면을 깨지 못하게 걸러낸다. */
  function safe(html) {
    return String(html == null ? '' : html)
      .replace(/<(?!\/?(b|strong|br|blockquote|p|em|i)\b)[^>]*>/gi, '');
  }
  function $(id) { return document.getElementById(id); }

  /* ══════════════════════════════════════════════════════════════
     골격 주입
     ══════════════════════════════════════════════════════════════ */
  function inject() {
    if ($('chd')) return;
    var st = document.createElement('style');
    st.id = 'chd-style';
    st.textContent = CSS;
    document.head.appendChild(st);

    var load = document.createElement('div');
    load.id = 'chd-load';
    load.innerHTML =
      '<div class="chd-orb"><div class="r r1"></div><div class="r r2"></div><div class="r r3"></div><div class="c"></div></div>' +
      '<h3>양육설명서를 만들고 있습니다</h3>' +
      '<div id="chd-step">아이의 출생 순간 하늘을<br>다시 그리고 있습니다.</div>' +
      '<div class="hint">약 2~3분 걸립니다. 완성되면 주문내역에서 언제든 다시 열 수 있습니다.</div>';

    var retry = document.createElement('div');
    retry.id = 'chd-retry';
    retry.innerHTML =
      '<h3>잠시 문제가 생겼습니다</h3>' +
      '<p id="chd-retry-msg"><strong>결제는 정상 완료되었습니다.</strong><br>아래 버튼을 눌러 다시 시도해 주세요.</p>' +
      '<button id="chd-retry-btn">다시 시도하기</button>' +
      '<div class="oid" id="chd-oid"></div>';

    var root = document.createElement('div');
    root.id = 'chd';

    function mount() {
      document.body.appendChild(load);
      document.body.appendChild(retry);
      document.body.appendChild(root);
      $('chd-retry-btn').onclick = function () {
        $('chd-retry').classList.remove('on');
        var l = $('chd-load'); l.style.display = 'flex'; l.style.opacity = '1';
        start(true);
      };
      if (ORDER_ID) {
        $('chd-oid').innerHTML = '계속 안 열리면 아래 주문번호로 문의해주세요.<br><b>' + h(ORDER_ID) + '</b>';
      }
    }
    if (document.body) mount();
    else document.addEventListener('DOMContentLoaded', mount);
  }

  /* ── 로딩 메시지 ── */
  var stepTimer = null;
  function startLoading() {
    var steps = [
      '아이의 출생 순간 하늘을<br>다시 그리고 있습니다.',
      '아이의 <b>달</b>이 어디서<br>쉬고 있는지 찾고 있습니다.',
      '부모님과 아이의 별이<br>만나는 자리를 보고 있습니다.',
      '<b>토성이 다가오는 해</b>를<br>날짜 단위로 계산하고 있습니다.',
      '열 살 뒤의 두 사람을<br>미리 그려보고 있습니다.',
      '한 문장 한 문장,<br>아이의 설명서를 쓰고 있습니다.'
    ];
    var i = 0, el = $('chd-step');
    if (!el) return;
    if (stepTimer) clearInterval(stepTimer);
    stepTimer = setInterval(function () {
      i = (i + 1) % steps.length;
      el.style.opacity = '0';
      setTimeout(function () { el.innerHTML = steps[i]; el.style.opacity = '1'; }, 400);
    }, 4200);
  }
  function hideLoad() {
    if (stepTimer) { clearInterval(stepTimer); stepTimer = null; }
    var l = $('chd-load');
    if (!l) return;
    l.style.opacity = '0';
    setTimeout(function () { l.style.display = 'none'; }, 500);
  }

  function showRetry(msg) {
    if (rendered) return;
    hideLoad();
    if (msg) $('chd-retry-msg').innerHTML = msg;
    $('chd-retry').classList.add('on');
  }

  /* ══════════════════════════════════════════════════════════════
     렌더링
     ══════════════════════════════════════════════════════════════ */
  var rendered = false;

  var CH_DEF = [
    { no: '01', body: 'ch1_nature' },
    { no: '02', body: 'ch2_inside' },
    { no: '03', body: 'ch3_outside' },
    { no: '04', body: 'ch4_talent' },
    { no: '05', body: 'ch5_chemistry' },
    { no: '06', body: 'ch6_pace' },
    { no: '07', body: 'ch7_love' },
    { no: '08', body: 'ch8_timeline' },
    { no: '09', body: 'ch9_tenyears' }
  ];
  var CH_FALLBACK_TITLE = {
    '01': '타고난 결', '02': '겉과 속', '03': '밖에서의 얼굴',
    '04': '재능이 사는 자리', '05': '부모와 아이의 케미스트리', '06': '이 아이의 속도',
    '07': '사랑이 닿는 길', '08': '다가올 시기들', '09': '10년 뒤의 두 사람'
  };

  var ELEM_COLOR = { '불': '#E8654F', '흙': '#C9A24B', '공기': '#8cb4ff', '물': '#6fd3c7' };

  function balanceHTML(bal) {
    if (!bal || !bal.element) return '';
    var order = ['불', '흙', '공기', '물'];
    var rows = order.map(function (k) {
      var v = Math.max(0, Math.min(100, bal.element[k] || 0));
      return '<div class="row"><div class="nm">' + k + '</div>' +
        '<div class="tr"><div class="fl" data-w="' + v + '" style="background:' + ELEM_COLOR[k] + '"></div></div>' +
        '<div class="pc">' + v + '%</div></div>';
    }).join('');
    return '<div class="chd-bal">' + rows +
      '<div class="chd-bal-cap">가장 강한 기운은 <b>' + h(bal.topElement || '') +
      '</b>, 가장 옅은 기운은 ' + h(bal.lackElement || '') + '입니다.</div></div>';
  }

  function timelineHTML(meta) {
    var items = [];
    (meta.saturn || []).forEach(function (s) {
      items.push({
        age: s.ageFrom,
        when: '만 ' + s.ageFrom + (s.ageTo && s.ageTo !== s.ageFrom ? '~' + s.ageTo : '') + '세 · ' +
              s.yearFrom + (s.yearTo && s.yearTo !== s.yearFrom ? '~' + s.yearTo : '') + '년',
        label: s.label || '',
        meaning: s.meaning || '',
        passes: s.passes
      });
    });
    (meta.jupiter || []).forEach(function (j) {
      items.push({
        age: j.age,
        when: '만 ' + j.age + '세 무렵 · ' + j.year + '년',
        label: '첫 개화 — 목성이 제자리로 돌아오는 해',
        meaning: '시야가 한 뼘 넓어지고, 아이가 스스로 원하는 것을 처음으로 또렷하게 말하기 시작하는 시기입니다.',
        passes: null
      });
    });
    if (!items.length) return '';
    items.sort(function (a, b) { return (a.age || 0) - (b.age || 0); });
    return '<div class="chd-tl">' + items.map(function (it) {
      return '<div class="it"><div class="dot"></div>' +
        '<div class="when">' + h(it.when) + '</div>' +
        '<div class="lb2">' + h(it.label) + '</div>' +
        '<div class="ms">' + h(it.meaning) + '</div>' +
        (it.passes > 1 ? '<span class="ps">토성 역행 — ' + it.passes + '번에 걸쳐 지나갑니다</span>' : '') +
        '</div>';
    }).join('') + '</div>';
  }

  function curveHTML(meta) {
    var pts = meta.curve || [];
    if (pts.length < 4) return '';
    var W = 600, H = 190, PADX = 34, PADY = 18;
    var a0 = pts[0].age, a1 = pts[pts.length - 1].age, span = (a1 - a0) || 1;
    function X(a) { return PADX + ((a - a0) / span) * (W - PADX * 2); }
    function Y(v) { return H - PADY - (Math.max(0, Math.min(100, v)) / 100) * (H - PADY * 2); }
    var d = pts.map(function (p, i) {
      return (i ? 'L' : 'M') + X(p.age).toFixed(1) + ',' + Y(p.y || 0).toFixed(1);
    }).join(' ');
    var area = d + ' L' + X(a1).toFixed(1) + ',' + (H - PADY) + ' L' + X(a0).toFixed(1) + ',' + (H - PADY) + ' Z';
    var ticks = '';
    for (var a = Math.ceil(a0); a <= Math.floor(a1); a++) {
      if ((a - Math.ceil(a0)) % 2 !== 0) continue;
      ticks += '<text x="' + X(a).toFixed(1) + '" y="' + (H - 3) +
        '" fill="#6b687a" font-size="10" text-anchor="middle" font-family="sans-serif">' + a + '세</text>';
    }
    return '<div class="chd-curve"><svg viewBox="0 0 ' + W + ' ' + H + '" xmlns="http://www.w3.org/2000/svg">' +
      '<defs><linearGradient id="chdG" x1="0" y1="0" x2="0" y2="1">' +
      '<stop offset="0" stop-color="rgba(201,162,75,.34)"/><stop offset="1" stop-color="rgba(201,162,75,0)"/>' +
      '</linearGradient></defs>' +
      '<line x1="' + PADX + '" y1="' + (H - PADY) + '" x2="' + (W - PADX) + '" y2="' + (H - PADY) +
      '" stroke="rgba(255,255,255,.14)" stroke-width="1"/>' +
      '<path d="' + area + '" fill="url(#chdG)"/>' +
      '<path d="' + d + '" fill="none" stroke="#E7CE8E" stroke-width="2.4" stroke-linecap="round"/>' +
      ticks + '</svg>' +
      '<div class="cap">순풍(목성)과 시험(토성)이 겹쳐 만드는 흐름입니다. 낮은 구간은 나쁜 때가 아니라 <b>단단해지는 때</b>입니다.</div></div>';
  }

  function render(payload) {
    if (rendered) return true;
    if (!payload || payload.error) return false;
    var rep = payload.report || payload;      // report 껍데기 없이 와도 산다
    var meta = payload.meta || {};
    if (!rep.headline && !rep.ch1_nature) return false;

    try {
      var root = $('chd');
      if (!root) return false;
      var parts = [];

      var childName = meta.childName || (DATA && DATA.child && DATA.child.name) || '아이';
      var parentName = meta.parentName || (DATA && DATA.parent && DATA.parent.name) || '부모님';

      /* 표지 */
      parts.push(
        '<div class="chd-cover">' +
        '<div class="lb">ASTRANOTE PARENTING MANUAL</div>' +
        '<h1><em>' + h(childName) + '</em> 양육설명서</h1>' +
        '<div class="who"><b>' + h(parentName) + '</b>님께 드리는, 세상에 한 부뿐인 기록</div>' +
        '<div class="chd-line"></div></div>');

      /* 핵심 한 문장 */
      if (rep.headline) {
        parts.push('<div class="chd-hero"><div class="t">이 아이를 한 문장으로</div>' +
          '<div class="h">' + safe(rep.headline) + '</div></div>');
      }

      /* 9개 챕터 */
      CH_DEF.forEach(function (c, idx) {
        var n = idx + 1;
        var body = rep[c.body];
        var title = rep['ch' + n + '_title'] || CH_FALLBACK_TITLE[c.no];
        var lead = rep['ch' + n + '_lead'] || '';

        /* 5장: 부모 차트가 없으면 원고가 없다 — 빈 카드 대신 정직한 안내 */
        if (c.body === 'ch5_chemistry' && !body) {
          if (meta.hasParent === false) {
            parts.push('<div class="chd-card"><div class="chd-no">CHAPTER 05</div>' +
              '<div class="chd-tt">부모와 아이의 케미스트리</div>' +
              '<div class="chd-ct">이 장은 부모님의 출생 정보(생년월일·태어난 시각)가 함께 있어야 쓸 수 있는 장입니다.<br><br>' +
              '이번 리포트에는 부모님의 정보가 없어 비워두었습니다. 지어내서 채우는 것보다 비워두는 쪽이 옳다고 판단했습니다.</div></div>');
          }
          return;
        }
        if (!body) return;

        var extra = '';
        if (c.body === 'ch1_nature') extra = balanceHTML(meta.balance);
        if (c.body === 'ch8_timeline') extra = timelineHTML(meta);
        if (c.body === 'ch9_tenyears') extra = curveHTML(meta);

        parts.push('<div class="chd-card"><div class="chd-no">CHAPTER ' + c.no + '</div>' +
          '<div class="chd-tt">' + h(title) + '</div>' +
          (lead ? '<div class="chd-lead">' + safe(lead) + '</div>' : '') +
          '<div class="chd-ct">' + safe(body) + '</div>' +
          extra + '</div>');
      });

      /* 맺음말 */
      if (rep.closing) {
        parts.push('<div class="chd-close"><div class="t">마지막으로</div>' +
          '<div class="ct2">' + safe(rep.closing) + '</div></div>');
      }

      parts.push('<div id="chd-save-wrap"><button id="chd-save-btn">📥 설명서 이미지로 저장하기</button></div>');
      parts.push('<div class="chd-foot">ASTRANOTE · WESTERN ASTROLOGY</div>');

      root.innerHTML = parts.join('');
      rendered = true;

      /* 로컬 저장 — 재방문 즉시 표시 (주문번호별 칸) */
      try {
        if (ORDER_ID) localStorage.setItem(REP_KEY_PREFIX + ORDER_ID, JSON.stringify(payload));
      } catch (e) {}

      hideLoad();

      /* 카드 등장 + 밸런스 바 채우기 */
      var cards = root.querySelectorAll('.chd-card');
      Array.prototype.forEach.call(cards, function (card, i) {
        setTimeout(function () { card.classList.add('show'); }, 120 + i * 160);
      });
      if ('IntersectionObserver' in window) {
        var ob = new IntersectionObserver(function (es) {
          es.forEach(function (e) { if (e.isIntersecting) e.target.classList.add('show'); });
        }, { threshold: 0.08 });
        Array.prototype.forEach.call(cards, function (c) { ob.observe(c); });
      } else {
        Array.prototype.forEach.call(cards, function (c) { c.classList.add('show'); });
      }
      setTimeout(function () {
        Array.prototype.forEach.call(root.querySelectorAll('.chd-bal .fl'), function (f) {
          f.style.width = (f.getAttribute('data-w') || 0) + '%';
        });
      }, 600);

      /* 저장 버튼 — save.js 갤러리가 있으면 그쪽, 없으면 기본 캡처 */
      var sb = $('chd-save-btn');
      if (sb) sb.onclick = function () {
        if (typeof window.__astroSaveOpen === 'function') { window.__astroSaveOpen('16'); return; }
        basicSave();
      };

      return true;
    } catch (err) {
      console.error('[양육설명서] 렌더 실패:', err);
      rendered = false;
      return false;
    }
  }

  /* save.js 가 없을 때의 최소 저장 경로 */
  function basicSave() {
    var el = $('chd');
    if (!el || typeof html2canvas !== 'function') {
      alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.');
      return;
    }
    html2canvas(el, { backgroundColor: '#0A0C16', scale: 2, useCORS: true }).then(function (cv) {
      var img = cv.toDataURL('image/png');
      var a = document.createElement('a');
      a.download = '양육설명서.png'; a.href = img; a.click();
    }).catch(function () { alert('이미지 저장에 실패했습니다. 화면을 직접 캡처해 주세요.'); });
  }

  /* ══════════════════════════════════════════════════════════════
     구동 — 로컬 저장본 → 서버 저장본 → 신규 생성(+폴링)

     🚨 서버는 Gemini 과부하 때 20초+45초를 기다린 뒤 3차 시도를 한다.
        최악의 경우 4분 가까이 걸린다. 그래서 POST 하나에 목숨 걸지 않고
        8초 간격 폴링을 함께 돌려, POST 연결이 끊겨도 완성본을 잡는다.
        (배우자 리포트 8/2 문의의 교훈을 처음부터 반영)
     ══════════════════════════════════════════════════════════════ */
  var polls = 0, MAX_POLL = 34;   // 8초 × 34 ≈ 4.5분

  function poll() {
    if (rendered) return;
    if (!ORDER_ID || ++polls > MAX_POLL) { showRetry(null); return; }
    fetch(API + '?orderId=' + encodeURIComponent(ORDER_ID), { cache: 'no-store' })
      .then(function (r) { return r.status === 200 ? r.json().catch(function () { return null; }) : null; })
      .then(function (d) {
        if (d && !d.error && d.status === 'completed' && render(d)) return;
        setTimeout(poll, 8000);
      })
      .catch(function () { setTimeout(poll, 8000); });
  }

  function start(isRetry) {
    rendered = false; polls = 0;
    startLoading();

    /* 0순위: 이 기기 저장본 */
    if (!isRetry && ORDER_ID) {
      try {
        var s = localStorage.getItem(REP_KEY_PREFIX + ORDER_ID);
        if (s && render(JSON.parse(s))) return;
      } catch (e) {}
    }

    /* 1순위: 서버 저장본 */
    var pre = ORDER_ID
      ? fetch(API + '?orderId=' + encodeURIComponent(ORDER_ID), { cache: 'no-store' })
          .then(function (r) { return r.json().catch(function () { return null; }); })
          .catch(function () { return null; })
      : Promise.resolve(null);

    pre.then(function (cached) {
      if (cached && !cached.error && cached.status === 'completed' && render(cached)) return;

      /* 2순위: 신규 생성 — 출생정보가 필요하다 */
      if (!DATA || !DATA.child) {
        showRetry('입력하신 정보를 불러오지 못했습니다.<br><strong>결제는 정상 완료되었습니다.</strong><br>' +
                  '아래 버튼을 눌러 정보를 다시 입력해 주세요.');
        var b = $('chd-retry-btn');
        if (b) {
          b.textContent = '정보 다시 입력하기';
          b.onclick = function () { location.href = '/product/detail.html?product_no=' + NO; };
        }
        return;
      }

      var body = {
        parent: DATA.parent || null,
        child: DATA.child,
        ageBand: DATA.ageBand || '초등'
      };
      if (ORDER_ID) body.orderId = ORDER_ID;

      return fetch(API, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      })
        .then(function (res) {
          if (res.status === 202) { setTimeout(poll, 6000); return null; }
          return res.json().catch(function () { return null; });
        })
        .then(function (d) {
          if (!d) return;
          if (d.status === 'pending') { setTimeout(poll, 6000); return; }
          if (!d.error && render(d)) return;
          /* POST 가 에러라도 서버는 만들고 있을 수 있다 — 폴링이 잡는다 */
          if (ORDER_ID) setTimeout(poll, 8000);
          else showRetry(d && d.error ? h(d.error) + '<br><strong>결제는 정상 완료되었습니다.</strong>' : null);
        });
    }).catch(function (e) {
      console.warn('[양육설명서] 통신 실패:', e);
      if (ORDER_ID) setTimeout(poll, 8000); else showRetry(null);
    });
  }

  function ensureH2C() {
    if (typeof html2canvas === 'function') return;
    var sc = document.createElement('script');
    sc.src = 'https://cdnjs.cloudflare.com/ajax/libs/html2canvas/1.4.1/html2canvas.min.js';
    document.head.appendChild(sc);
  }

  function boot() { inject(); ensureH2C(); startLoading(); start(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
