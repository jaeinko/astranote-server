/* ============================================================================
   ASTRANOTE — 30일 운세 결과화면 (product_no=14)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/monthly.js  (GitHub 저장소)
   ▣ 카페24 주문완료 페이지에는 아래 한 줄만 넣습니다.
        script src="https://astranote-server.vercel.app/monthly.js"  (태그로 감싸서 사용)
      → 도메인 가드 바로 아래, 궁합 블록보다 위

   ▣ 왜 외부 파일인가
      카페24 편집기에 5만 자를 직접 붙이면 잘리거나 &&·< 가 변환되어
      닫는 태그가 사라집니다. 그러면 그 뒤 페이지 HTML 전체가 자바스크립트로
      삼켜져 콘텐츠가 통째로 안 보이게 됩니다. 외부 파일은 그 위험이 없고,
      수정할 때 카페24를 안 건드려도 됩니다.
   ============================================================================ */
(function () {
  'use strict';

  var NO = '14';
  var API = 'https://astranote-server.vercel.app/api/gemini-monthly';
  var DATA_KEY = 'astro_user_data';

  /* ── 중복 실행 방지 (이게 없어서 로딩 화면이 두 벌 떴습니다) ── */
  if (window.__astroMonthlyV2) return;

  function qs(k) {
    try { return new URLSearchParams(window.location.search).get(k); } catch (e) { return null; }
  }
  function loadUser() {
    try {
      var s = localStorage.getItem(DATA_KEY);
      if (s) { var d = JSON.parse(s); if (d && d.name && d.date) return d; }
    } catch (e) {}
    try {
      var m = document.cookie.match(new RegExp('(^| )' + DATA_KEY + '=([^;]+)'));
      if (m) { var c = JSON.parse(decodeURIComponent(m[2])); if (c && c.name && c.date) return c; }
    } catch (e) {}
    return null;
  }

  var DATA = loadUser();
  var urlHint = qs('product_no') || qs('productNo');
  var hinted = urlHint || (DATA && DATA.productNo) || null;

  /* 14번이 아니면 즉시 퇴장 — 다른 상품에 영향 0 */
  if (String(hinted) !== NO) return;
  if (window.__astroReportInit) return;

  window.__astroMonthlyV2 = true;
  window.__astroReportInit = true;      // 아래 옛 블록·기존 스크립트를 재운다

  var ORDER_ID = qs('order_id') || qs('orderId') || null;

  /* ══════════════════════════════════════════════════════════════
     CSS
     ══════════════════════════════════════════════════════════════ */
  var CSS = [
'#astro-result-container,#data-loading,#retry-screen,#astro-vip-result-container,',
'#vip-data-loading,#vip-retry-screen,#cpr,#cpr-load,#cpr-retry,#mtr,#mtr-load,#mtr-retry{display:none!important;}',
'#header,#footer,.titleArea,.ec-base-step1,#aside,.topLogo,.path,.order-complete-wrap,',
'.contentsBox,.snsIntroBox{display:none!important;}',
'html,body{max-width:100vw;overflow-x:hidden;margin:0;padding:0;background:#050505!important;}',
'#mtg,#mtg *{box-sizing:border-box!important;}',
'#mtg{width:100%;min-height:100vh;position:absolute;top:0;left:0;z-index:999999;color:#fff;',
'  background:radial-gradient(circle at 50% -6%,#141d38 0%,#0a0c18 48%,#050308 100%);',
'  font-family:"Noto Serif KR",serif;letter-spacing:-.04em;',
'  padding:74px 16px 130px;display:flex;flex-direction:column;align-items:center;}',
'@media(max-width:480px){#mtg{padding:66px 13px 122px;}}',
'#mtg>*{width:100%;max-width:620px;margin-left:auto;margin-right:auto;}',

/* ── 로딩 ── */
'#mtg-load{position:fixed;inset:0;z-index:1000000;background:#050308;display:flex;',
'  flex-direction:column;justify-content:center;align-items:center;text-align:center;',
'  padding:20px;transition:opacity .5s ease;font-family:"Noto Sans KR",sans-serif;}',
'.mtg-orb{position:relative;width:124px;height:124px;margin-bottom:30px;display:flex;align-items:center;justify-content:center;}',
'.mtg-orb .c{width:24px;height:24px;border-radius:50%;animation:mtgP 1.8s ease-in-out infinite;',
'  background:radial-gradient(circle at 35% 35%,#fff,#f0d77b 40%,#d4af37 70%);',
'  box-shadow:0 0 30px rgba(212,175,55,.9),0 0 60px rgba(212,175,55,.45);}',
'@keyframes mtgP{0%,100%{transform:scale(1)}50%{transform:scale(1.18)}}',
'.mtg-orb .r{position:absolute;border-radius:50%;border:1px solid rgba(212,175,55,.28);}',
'.mtg-orb .r1{width:58px;height:58px;border-top-color:rgba(240,215,123,.95);animation:mtgS 1.6s linear infinite;}',
'.mtg-orb .r2{width:92px;height:92px;border-top-color:rgba(120,170,255,.9);animation:mtgS 2.6s linear infinite reverse;}',
'.mtg-orb .r3{width:124px;height:124px;border-top-color:rgba(212,175,55,.55);animation:mtgS 3.8s linear infinite;}',
'@keyframes mtgS{to{transform:rotate(360deg)}}',
'#mtg-load h3{color:#f0d77b;font:900 20px "Noto Sans KR",sans-serif;margin:0 0 13px;letter-spacing:-.05em;}',
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
'#mtg-step{color:#ddd;font:500 14.5px/1.7 "Noto Sans KR",sans-serif;max-width:320px;',
'  display:block;min-height:76px;text-align:center;margin-left:auto;margin-right:auto;',
'  word-break:keep-all;transition:opacity .4s ease;margin-bottom:24px;}',
'#mtg-step b{color:#f0d77b;}',
'.mtg-pw{width:270px;max-width:80vw;margin-bottom:22px;}',
'.mtg-pt{width:100%;height:7px;border-radius:5px;background:rgba(255,255,255,.07);',
'  border:1px solid rgba(212,175,55,.12);overflow:hidden;}',
'.mtg-pf{height:100%;width:0;border-radius:5px;transition:width .7s cubic-bezier(.22,1,.36,1);',
'  background:linear-gradient(90deg,#4a7dff,#d4af37 62%,#f7e7a8);box-shadow:0 0 14px rgba(212,175,55,.6);}',
'.mtg-pp{text-align:right;margin-top:6px;font:700 12.5px "Cinzel",serif;color:#f0d77b;letter-spacing:1px;}',
'.mtg-warn{color:#ff8a80;font:600 12px/1.65 "Noto Sans KR",sans-serif;padding:11px 15px;max-width:315px;',
'  background:rgba(255,59,48,.07);border:1px solid rgba(255,59,48,.26);border-radius:11px;word-break:keep-all;}',
'.mtg-warn b{color:#ffb3ad;}',

/* ── 재시도 ── */
'#mtg-retry{position:fixed;inset:0;z-index:1000001;background:#050308;display:none;',
'  flex-direction:column;justify-content:center;align-items:center;text-align:center;padding:30px;',
'  font-family:"Noto Sans KR",sans-serif;}',
'#mtg-retry .ic{font-size:54px;margin-bottom:20px;animation:mtgM 3s ease-in-out infinite;}',
'@keyframes mtgM{0%,100%{transform:translateY(0) rotate(-6deg)}50%{transform:translateY(-10px) rotate(6deg)}}',
'#mtg-retry h3{color:#d4af37;font:900 21px "Noto Sans KR",sans-serif;margin:0 0 16px;word-break:keep-all;}',
'#mtg-retry p{color:#ccc;font:400 14.5px/1.7 "Noto Sans KR",sans-serif;max-width:335px;margin:0 0 26px;word-break:keep-all;}',
'#mtg-retry p strong{color:#fff;}',
'#mtg-retry button{border:none;cursor:pointer;padding:17px 38px;border-radius:13px;',
'  background:linear-gradient(135deg,#d4af37,#4a7dff);color:#fff;font:900 16px "Noto Sans KR",sans-serif;}',
'#mtg-retry small{color:#666;font:400 11.5px/1.6 "Noto Sans KR",sans-serif;margin-top:18px;max-width:325px;word-break:keep-all;}',

/* ── 히어로 ── */
'#mtg-hero{text-align:center;padding:30px 20px 32px;margin-bottom:24px;border-radius:20px;',
'  background:radial-gradient(circle at 50% 0%,rgba(212,175,55,.13) 0%,transparent 56%),',
'    linear-gradient(180deg,rgba(20,29,56,.66),rgba(8,10,20,.94));',
'  border:1px solid rgba(212,175,55,.32);opacity:0;transform:translateY(22px);',
'  transition:all .9s cubic-bezier(.22,1,.36,1);position:relative;overflow:hidden;}',
'#mtg-hero.on{opacity:1;transform:none;}',
'#mtg-hero::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;',
'  background:linear-gradient(90deg,transparent,rgba(247,231,168,.85),transparent);}',
'.mtg-brand{font:700 10.5px "Cinzel",serif;letter-spacing:5px;color:rgba(212,175,55,.75);margin-bottom:13px;}',
'.mtg-period{display:inline-block;font:800 13px "Noto Sans KR",sans-serif;color:#9fb4e8;',
'  padding:6px 15px;border-radius:14px;background:rgba(74,125,255,.12);',
'  border:1px solid rgba(120,160,255,.3);margin-bottom:20px;letter-spacing:-.04em;}',

/* ── 원그래프 : 중심 정렬 ──
   🚨 숫자와 라벨을 한 덩어리로 묶어 가운데 두면, 라벨 높이의 절반만큼
      숫자가 위로 뜹니다. 원 정중앙에 와야 하는 건 라벨이 아니라 숫자입니다.
      그래서 라벨을 흐름에서 빼내고(absolute) 숫자만 정중앙에 놓습니다. */
'.mtg-gauge{position:relative;width:188px;height:188px;margin:0 auto 4px;}',
/* 🚨 모바일에서 컨테이너는 164px 로 줄어드는데 SVG 는 188px 고정이었다.
   원의 중심(94px)과 숫자 박스의 중심(82px)이 12px 어긋나 보였다.
   viewBox 가 있으므로 width/height 를 100%로 두면 어떤 크기에도 정확히 맞는다. */
'.mtg-gauge svg{transform:rotate(-90deg);display:block;width:100%;height:100%;}',
'.mtg-gauge .val{position:absolute;inset:0;display:flex;align-items:center;justify-content:center;}',
'.mtg-gauge .num{font:900 54px/1 "Noto Sans KR",sans-serif;color:#f7e7a8;',
'  text-shadow:0 0 28px rgba(212,175,55,.5);letter-spacing:-.02em;}',
'.mtg-gauge .unit{position:absolute;left:0;right:0;bottom:34px;text-align:center;',
'  font:700 11.5px "Cinzel",serif;color:#8fa4d6;letter-spacing:3px;}',
'@media(max-width:480px){.mtg-gauge{width:164px;height:164px;}.mtg-gauge .num{font-size:46px;}',
'  .mtg-gauge .unit{bottom:28px;font-size:10.5px;letter-spacing:2px;}}',

'#mtg-headline{font:900 21px/1.45 "Noto Serif KR",serif;color:#fff;margin:16px auto 15px;',
'  max-width:430px;word-break:keep-all;letter-spacing:-.055em;}',
'@media(max-width:480px){#mtg-headline{font-size:18.5px;}}',
'#mtg-keys{display:flex;justify-content:center;flex-wrap:wrap;gap:7px;margin-bottom:24px;}',
'#mtg-keys span{font:800 12px "Noto Sans KR",sans-serif;color:#e8c766;padding:7px 14px;',
'  border-radius:16px;background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.36);letter-spacing:-.03em;}',

/* ── 점수바 ── */
'.mtg-bar{display:flex;align-items:center;gap:11px;max-width:400px;margin:0 auto 11px;}',
'.mtg-bar em{flex-shrink:0;width:56px;text-align:left;font-style:normal;',
'  font:600 12.5px "Noto Sans KR",sans-serif;color:#a8b0c4;letter-spacing:-.04em;}',
'.mtg-bt{flex:1;height:8px;border-radius:5px;background:rgba(255,255,255,.07);overflow:hidden;}',
'.mtg-bf{height:100%;width:0;border-radius:5px;transition:width 1.3s cubic-bezier(.22,1,.36,1);',
'  background:linear-gradient(90deg,#4a7dff,#d4af37 78%,#f7e7a8);}',
'.mtg-bar i{flex-shrink:0;width:26px;text-align:right;font-style:normal;',
'  font:800 12.5px "Noto Sans KR",sans-serif;color:#f0d77b;}',
'.mtg-lb{margin-top:16px;display:grid;grid-template-columns:1fr 1fr;gap:8px;max-width:400px;',
'  margin-left:auto;margin-right:auto;}',
'.mtg-lb div{background:rgba(255,255,255,.035);border:1px solid rgba(255,255,255,.08);',
'  border-radius:12px;padding:12px 11px;text-align:left;}',
'.mtg-lb em{display:block;font-style:normal;font:700 10.5px "Noto Sans KR",sans-serif;',
'  color:#7d95c9;letter-spacing:1px;margin-bottom:5px;}',
'.mtg-lb b{display:block;font:800 13px/1.4 "Noto Sans KR",sans-serif;color:#f0d77b;',
'  letter-spacing:-.05em;word-break:keep-all;}',
'@media(max-width:480px){.mtg-lb{grid-template-columns:1fr;}}',

/* ── 곡선 ── */
'#mtg-flow{padding:24px 18px 18px;margin-bottom:24px;border-radius:18px;',
'  background:linear-gradient(180deg,rgba(18,24,44,.8),rgba(8,10,20,.92));',
'  border:1px solid rgba(212,175,55,.2);opacity:0;transform:translateY(22px);',
'  transition:all .9s cubic-bezier(.22,1,.36,1);}',
'#mtg-flow.on{opacity:1;transform:none;}',
'#mtg-flow .ti{font:700 11px "Cinzel",serif;letter-spacing:3.5px;color:#7d95c9;',
'  text-align:center;margin-bottom:16px;}',
'#mtg-flow svg{width:100%;height:auto;display:block;overflow:visible;}',
'.mtg-cap{display:flex;justify-content:space-between;margin-top:7px;padding:0 2px;',
'  font:600 11.5px "Noto Sans KR",sans-serif;color:#7d95c9;}',
'.mtg-leg{display:flex;justify-content:center;gap:16px;margin-top:13px;',
'  font:600 11.5px "Noto Sans KR",sans-serif;color:#9a9a9a;}',
'.mtg-leg i{font-style:normal;display:inline-block;width:8px;height:8px;border-radius:50%;',
'  margin-right:5px;vertical-align:middle;}',
'.mtg-leg .g{background:#f0d77b;box-shadow:0 0 8px rgba(240,215,123,.8);}',
'.mtg-leg .c{background:#ff6b60;box-shadow:0 0 8px rgba(255,107,96,.8);}',
'#mtg-flow .nt{margin-top:12px;text-align:center;font:500 11px/1.6 "Noto Sans KR",sans-serif;',
'  color:#6d6478;word-break:keep-all;}',

/* ── 날짜 카드 ── */
'#mtg-days{display:grid;grid-template-columns:1fr 1fr;gap:11px;margin-bottom:24px;',
'  opacity:0;transform:translateY(22px);transition:all .9s cubic-bezier(.22,1,.36,1);}',
'#mtg-days.on{opacity:1;transform:none;}',
'@media(max-width:480px){#mtg-days{grid-template-columns:1fr;}}',
'.mtg-d{border-radius:16px;padding:19px 15px;text-align:center;font-family:"Noto Sans KR",sans-serif;}',
'.mtg-d.good{background:linear-gradient(180deg,rgba(28,58,38,.5),rgba(8,12,10,.9));',
'  border:1px solid rgba(110,220,140,.34);}',
'.mtg-d.care{background:linear-gradient(180deg,rgba(58,24,24,.5),rgba(14,8,8,.9));',
'  border:1px solid rgba(255,110,100,.3);}',
'.mtg-d .h{font:800 12px "Noto Sans KR",sans-serif;margin-bottom:12px;letter-spacing:-.03em;}',
'.mtg-d.good .h{color:#7ee59b;} .mtg-d.care .h{color:#ff8a80;}',
'.mtg-d .list{display:flex;flex-direction:column;gap:7px;}',
'.mtg-d .list span{font:900 15px "Noto Sans KR",sans-serif;color:#fff;letter-spacing:-.04em;}',
'.mtg-d .none{font:500 12px/1.65 "Noto Sans KR",sans-serif;color:#8b8b8b;word-break:keep-all;}',

/* ── 본문 카드 ── */
'.mtg-card{padding:34px 22px;margin-bottom:22px;border-radius:18px;position:relative;overflow:hidden;',
'  background:linear-gradient(180deg,rgba(18,24,44,.86),rgba(9,11,20,.93));',
'  border:1px solid rgba(212,175,55,.18);opacity:0;transform:translateY(30px);',
'  transition:all .9s cubic-bezier(.22,1,.36,1);}',
'.mtg-card.on{opacity:1;transform:none;border-color:rgba(212,175,55,.42);',
'  box-shadow:0 18px 50px rgba(0,0,0,.5);}',
'.mtg-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;',
'  background:linear-gradient(90deg,transparent,rgba(212,175,55,.7),transparent);}',
'.mtg-card .lb{display:block;font:400 11px "Cinzel",serif;letter-spacing:3.5px;color:#7d95c9;margin-bottom:12px;}',
'.mtg-card .tt{font:900 19.5px/1.42 "Noto Serif KR",serif;color:#f0d77b;margin-bottom:22px;',
'  word-break:keep-all;letter-spacing:-.05em;position:relative;padding-bottom:14px;}',
'.mtg-card .tt::after{content:"";position:absolute;bottom:0;left:0;width:38px;height:2px;',
'  background:linear-gradient(90deg,#f7e7a8,#d4af37 50%,transparent);}',
'.mtg-card .ct{font:300 16px/2.0 "Noto Serif KR",serif;color:#ded7cc;text-align:left;',
'  word-break:keep-all;overflow-wrap:anywhere;letter-spacing:-.03em;}',
'.mtg-card .ct b,.mtg-card .ct strong{color:#f7e7a8;font-weight:700;padding:0 3px;border-radius:2px;',
'  background:linear-gradient(180deg,rgba(255,255,255,0) 60%,rgba(212,175,55,.24) 40%);}',
'.mtg-card .ct span[style*="ff3b30"]{background:rgba(255,59,48,.11);padding:2px 5px;border-radius:4px;}',
'@media(max-width:480px){.mtg-card{padding:27px 16px;border-radius:15px;}',
'  .mtg-card .tt{font-size:17.5px;} .mtg-card .ct{font-size:15px;line-height:1.95;}}',

/* ── 업셀 ── */
'#mtg-up{text-align:center;padding:42px 20px 36px;margin-bottom:18px;border-radius:22px;',
'  background:radial-gradient(circle at 50% 0%,rgba(212,175,55,.14) 0%,transparent 52%),',
'    linear-gradient(180deg,rgba(32,22,56,.62),rgba(5,3,8,.95));',
'  border:2px solid rgba(212,175,55,.85);position:relative;overflow:hidden;',
'  opacity:0;transform:scale(.96);transition:all .9s ease;font-family:"Noto Sans KR",sans-serif;}',
'#mtg-up.on{opacity:1;transform:none;}',
'#mtg-up h3{font:900 21px/1.45 "Noto Serif KR",serif;color:#fff;margin:0 0 10px;',
'  word-break:keep-all;letter-spacing:-.055em;}',
'#mtg-up h3 .g{color:#f7e7a8;}',
'#mtg-teaser{font:400 14.5px/1.85 "Noto Serif KR",serif;color:#ccc;margin-bottom:22px;',
'  word-break:keep-all;letter-spacing:-.04em;}',
'#mtg-teaser b{color:#f0d77b;}',
'#mtg-up .q{font:600 13.5px "Noto Sans KR",sans-serif;color:#9fb4e8;margin-bottom:20px;word-break:keep-all;}',
'.mtg-opt{display:block;text-decoration:none!important;border-radius:16px;padding:19px 17px;',
'  text-align:left;margin-bottom:11px;position:relative;z-index:2;transition:transform .14s;}',
'.mtg-opt:active{transform:scale(.98);}',
'.mtg-opt.a{background:linear-gradient(135deg,rgba(212,175,55,.17),rgba(142,36,170,.16));',
'  border:1px solid rgba(212,175,55,.55);}',
'.mtg-opt.b{background:rgba(255,255,255,.04);border:1px solid rgba(150,170,220,.34);}',
'.mtg-opt .t{display:block;font:900 16px "Noto Sans KR",sans-serif;color:#fff;',
'  margin-bottom:6px;letter-spacing:-.05em;word-break:keep-all;}',
'.mtg-opt .d{display:block;font:400 12.5px/1.6 "Noto Sans KR",sans-serif;color:#bbb;',
'  margin-bottom:9px;word-break:keep-all;letter-spacing:-.04em;}',
'.mtg-opt .p{font:900 16.5px "Noto Sans KR",sans-serif;color:#f0d77b;letter-spacing:-.04em;}',
'.mtg-opt .p small{font-weight:400;font-size:12px;color:#888;text-decoration:line-through;margin-right:7px;}',
'#mtg-up .un{color:#777;font:400 11px/1.6 "Noto Sans KR",sans-serif;margin-top:14px;word-break:keep-all;}',

/* ── 저장바 ── */
'#mtg-save{position:fixed;left:0;right:0;bottom:0;z-index:1000050;display:flex;',
'  flex-direction:column;align-items:center;gap:7px;',
'  padding:13px 16px calc(13px + env(safe-area-inset-bottom));',
'  background:linear-gradient(to top,rgba(5,3,8,.985) 55%,rgba(5,3,8,.7) 82%,rgba(5,3,8,0));',
'  transform:translateY(140%);transition:transform .55s cubic-bezier(.22,1,.36,1);}',
'#mtg-save.on{transform:none;}',
'#mtg-save button{width:100%;max-width:620px;border:none;cursor:pointer;border-radius:14px;',
'  padding:17px 14px;font:900 15.5px "Noto Sans KR",sans-serif;letter-spacing:-.045em;color:#1a1206;',
'  background:linear-gradient(135deg,#f7e7a8,#e8c766 38%,#d4af37 72%,#b8912e);',
'  box-shadow:0 10px 28px rgba(212,175,55,.3);transition:transform .14s;}',
'#mtg-save button:active{transform:scale(.97);}',
'#mtg-save button:disabled{opacity:.5;cursor:not-allowed;}',
'#mtg-save .hint{font:500 10.5px "Noto Sans KR",sans-serif;color:#7a7186;text-align:center;}',
'#mtg-gal{position:fixed;inset:0;z-index:10000050;display:none;flex-direction:column;',
'  background:rgba(4,3,7,.985);overflow-y:auto;padding:22px 16px 40px;font-family:"Noto Sans KR",sans-serif;}',
'#mtg-gal.on{display:flex;}',
'#mtg-gal h4{font:900 17px "Noto Sans KR",sans-serif;color:#f0d77b;text-align:center;margin:6px 0 8px;}',
'#mtg-gal .gd{font:500 12.5px/1.7 "Noto Sans KR",sans-serif;color:#9a9a9a;text-align:center;',
'  margin-bottom:20px;word-break:keep-all;}',
'#mtg-gal img{width:100%;max-width:520px;display:block;margin:0 auto 18px;',
'  border:1px solid rgba(212,175,55,.45);border-radius:10px;}',
'#mtg-gal .cl{display:block;margin:8px auto 0;max-width:520px;width:100%;padding:16px;border:none;',
'  border-radius:13px;cursor:pointer;font:900 15px "Noto Sans KR",sans-serif;color:#1a1206;',
'  background:linear-gradient(135deg,#f0d77b,#d4af37);}'
].join('\n');

  /* ══════════════════════════════════════════════════════════════
     HTML
     ══════════════════════════════════════════════════════════════ */
  var CARDS = [
    ['card1_overview', 'PART 01 · THE FLOW',   '앞으로 30일, 전체 흐름'],
    ['card2_love',     'PART 02 · LOVE',       '애정운'],
    ['card3_money',    'PART 03 · MONEY',      '금전운'],
    ['card4_work',     'PART 04 · WORK',       '일과 성취'],
    ['card5_body',     'PART 05 · CONDITION',  '컨디션과 마음'],
    ['card6_gooddays', 'PART 06 · GOOD DAYS',  '움직여야 할 날'],
    ['card7_caredays', 'PART 07 · CAUTION',    '조심해야 할 날'],
    ['card8_action',   'PART 08 · THE ACTION', '이 30일의 행동 지침']
  ];
  var BARS = [['애정', 'love'], ['금전', 'money'], ['일·성취', 'work'], ['컨디션', 'body']];
  var LABS = [['LOVE', '애정', 'label_love'], ['MONEY', '금전', 'label_money'],
              ['WORK', '일·성취', 'label_work'], ['BODY', '컨디션', 'label_body']];

  var STEPS = [
    '지금 이 순간의<br>행성 위치를 확인하고 있습니다.',
    '앞으로 <b>31일간</b> 하늘이<br>어떻게 움직이는지 계산합니다.',
    '그 움직임이 <b>내 출생 차트</b>의<br>어디를 건드리는지 대조합니다.',
    '각이 <b>가장 정확해지는 날짜</b>를<br>하루 단위로 찾습니다.',
    '어느 영역에 불이 켜지는지<br>확인하고 있습니다.',
    '움직여야 할 날과<br>조심할 날을 가려냅니다.',
    '30일치 흐름을<br>한 줄씩 쓰고 있습니다.',
    '마지막 문장을 다듬고 있습니다.<br><b>거의 다 됐어요.</b>'
  ];

  function el(t, c, h) { var e = document.createElement(t); if (c) e.className = c; if (h != null) e.innerHTML = h; return e; }
  function $(id) { return document.getElementById(id); }
  function setH(id, v) { var e = $(id); if (e) e.innerHTML = v; }
  function setT(id, v) { var e = $(id); if (e) e.textContent = v; }
  function esc(s) { return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;'); }

  function buildHTML() {
    var cards = CARDS.map(function (c, i) {
      return '<div class="mtg-card" id="mtg-c' + i + '"><span class="lb">' + c[1] + '</span>' +
             '<div class="tt">' + c[2] + '</div><div class="ct" id="mtg-o' + i + '"></div></div>';
    }).join('');
    var bars = BARS.map(function (b, i) {
      return '<div class="mtg-bar"><em>' + b[0] + '</em><div class="mtg-bt">' +
             '<div class="mtg-bf" id="mtg-bf' + i + '"></div></div><i id="mtg-bn' + i + '">0</i></div>';
    }).join('');
    var labs = LABS.map(function (b, i) {
      return '<div><em>' + b[1] + '</em><b id="mtg-lb' + i + '">—</b></div>';
    }).join('');

    return '' +
'<div id="mtg-load">' +
  '<div class="mtg-orb"><div class="c"></div><div class="r r1"></div><div class="r r2"></div><div class="r r3"></div></div>' +
  '<h3 id="mtg-title">앞으로 30일의 하늘을 계산하는 중</h3>' +
  '<div id="mtg-step">' + STEPS[0] + '</div>' +
  '<div class="mtg-pw"><div class="mtg-pt"><div class="mtg-pf" id="mtg-pf"></div></div>' +
  '<div class="mtg-pp" id="mtg-pp">0%</div></div>' +
  '<div class="mtg-warn">⚠️ 지금 <b>오늘부터 30일</b>을 하루 단위로 계산하고 있습니다.<br>' +
  '보통 40초~1분 걸립니다. 화면을 끄지 마세요.</div>' +
'</div>' +
'<div id="mtg-retry">' +
  '<div class="ic">🌙</div><h3>지금 별들이 너무 붐비고 있어요</h3>' +
  '<p>분석 요청이 한꺼번에 몰려서<br>리포트 집필이 잠시 지연되고 있습니다.<br>' +
  '<strong>결제는 정상 완료되었으니 걱정 마세요.</strong></p>' +
  '<button type="button" id="mtg-retry-btn">다시 분석하기</button>' +
  '<small>여러 번 시도해도 안 되면 1~2분 뒤 다시 접속해 주세요.<br>입력하신 정보는 안전하게 보관되어 있습니다.</small>' +
'</div>' +
'<div id="mtg">' +
  '<div id="mtg-hero">' +
    '<div class="mtg-brand">3 0 &nbsp; D A Y S &nbsp; T R A N S I T</div>' +
    '<div class="mtg-period" id="mtg-period">기간 계산 중</div>' +
    '<div class="mtg-gauge">' +
      '<svg width="188" height="188" viewBox="0 0 188 188">' +
        '<circle cx="94" cy="94" r="81" fill="none" stroke="rgba(255,255,255,.07)" stroke-width="11"/>' +
        '<circle id="mtg-arc" cx="94" cy="94" r="81" fill="none" stroke="url(#mtgG)" stroke-width="11" ' +
          'stroke-linecap="round" stroke-dasharray="509" stroke-dashoffset="509" ' +
          'style="transition:stroke-dashoffset 1.7s cubic-bezier(.22,1,.36,1)"/>' +
        '<defs><linearGradient id="mtgG" gradientUnits="userSpaceOnUse" x1="94" y1="13" x2="94" y2="175">' +
        '<stop offset="0%" stop-color="#f7e7a8"/><stop offset="100%" stop-color="#4a7dff"/></linearGradient></defs>' +
        '<circle id="mtg-dot" cx="0" cy="0" r="6.5" fill="#fff" opacity="0" ' +
          'style="transition:opacity .5s ease 1.3s;filter:drop-shadow(0 0 8px rgba(255,255,255,.9))"/>' +
      '</svg>' +
      /* 🚨 숫자만 정중앙. 라벨은 흐름에서 빼낸다 */
      '<div class="val"><div class="num" id="mtg-total">0</div></div>' +
      '<div class="unit">3 0 D A Y S</div>' +
    '</div>' +
    '<div id="mtg-headline"></div>' +
    '<div id="mtg-keys"></div>' +
    bars +
    '<div class="mtg-lb">' + labs + '</div>' +
  '</div>' +
  '<div id="mtg-flow">' +
    '<div class="ti">3 0 &nbsp; D A Y &nbsp; F L O W</div>' +
    '<svg viewBox="0 0 420 156" preserveAspectRatio="none">' +
      '<defs>' +
        '<linearGradient id="mtgFL" x1="0%" y1="0%" x2="100%" y2="0%">' +
          '<stop offset="0%" stop-color="#4a7dff"/><stop offset="55%" stop-color="#d4af37"/>' +
          '<stop offset="100%" stop-color="#f7e7a8"/></linearGradient>' +
        '<linearGradient id="mtgFF" x1="0%" y1="0%" x2="0%" y2="100%">' +
          '<stop offset="0%" stop-color="rgba(212,175,55,.28)"/>' +
          '<stop offset="100%" stop-color="rgba(212,175,55,0)"/></linearGradient>' +
      '</defs>' +
      '<path id="mtg-ff" d="" fill="url(#mtgFF)"/>' +
      '<path id="mtg-fl" d="" fill="none" stroke="url(#mtgFL)" stroke-width="2.5" ' +
        'stroke-linecap="round" stroke-linejoin="round"/>' +
      '<g id="mtg-fd"></g>' +
    '</svg>' +
    '<div class="mtg-cap"><span id="mtg-fs">오늘</span><span id="mtg-fe">30일 뒤</span></div>' +
    '<div class="mtg-leg"><span><i class="g"></i>움직일 날</span><span><i class="c"></i>조심할 날</span></div>' +
    '<div class="nt">곡선은 30일 안에서의 상대적인 흐름입니다. 높을수록 하늘이 등을 밀어주는 시기입니다.</div>' +
  '</div>' +
  '<div id="mtg-days">' +
    '<div class="mtg-d good"><div class="h">✦ 움직여야 할 날</div><div class="list" id="mtg-good"></div></div>' +
    '<div class="mtg-d care"><div class="h">⚠ 조심할 날</div><div class="list" id="mtg-care"></div></div>' +
  '</div>' +
  cards +
  '<div id="mtg-up">' +
    '<h3>이 흐름이 유독 <span class="g">당신에게</span><br>이렇게 오는 이유</h3>' +
    '<div id="mtg-teaser"></div>' +
    '<div class="q">지금, 마음에 걸리는 사람이 있으신가요?</div>' +
    '<a class="mtg-opt a" href="/product/detail.html?product_no=15">' +
      '<span class="t">네, 그 사람이 있어요</span>' +
      '<span class="d">두 사람의 차트를 겹쳐 64개 각도를 계산합니다. 어디서 맞물리고 어디서 부딪히는지 숫자로 나옵니다.</span>' +
      '<span class="p"><small>19,900원</small>14,900원</span></a>' +
    '<a class="mtg-opt b" href="/product/detail.html?product_no=9">' +
      '<span class="t">아니요, 아직이요</span>' +
      '<span class="d">7하우스(결혼의 방)를 열어 앞으로 만날 사람의 성격·직업, 그리고 만나는 시기를 읽습니다.</span>' +
      '<span class="p">9,900원</span></a>' +
    '<div class="un">결제 즉시 나만의 1:1 리포트가 생성됩니다</div>' +
  '</div>' +
'</div>' +
'<div id="mtg-save"><button type="button" id="mtg-save-btn">📸 내 30일 운세 저장</button>' +
'<div class="hint">저장한 이미지는 언제든 다시 볼 수 있습니다 · 무료</div></div>';
  }

  /* ══════════════════════════════════════════════════════════════
     주입 / 로딩
     ══════════════════════════════════════════════════════════════ */
  function inject() {
    if ($('mtg-root')) return;                 // 두 번 주입 방지
    var st = el('style'); st.id = 'mtg-style'; st.textContent = CSS;
    document.head.appendChild(st);
    var w = el('div'); w.id = 'mtg-root'; w.innerHTML = buildHTML();
    document.body.appendChild(w);
    var rb = $('mtg-retry-btn'); if (rb) rb.onclick = function () { hideRetry(); start(true); };
    var sb = $('mtg-save-btn');  if (sb) sb.onclick = save;
  }

  var stepT = null, progT = null, t0 = 0;

  function startLoading() {
    if (stepT) return;                          // 타이머 중복 방지
    t0 = Date.now();
    var i = 0, e = $('mtg-step');
    stepT = setInterval(function () {
      i = Math.min(i + 1, STEPS.length - 1);
      if (!e) return;
      e.style.opacity = '0';
      setTimeout(function () { e.innerHTML = STEPS[i]; e.style.opacity = '1'; }, 400);
    }, 3200);
    progT = setInterval(function () {
      var s = (Date.now() - t0) / 1000;
      var p = Math.min(95, Math.round(95 * (1 - Math.exp(-s / 22))));
      var f = $('mtg-pf'), t = $('mtg-pp');
      if (f) f.style.width = p + '%';
      if (t) t.textContent = p + '%';
    }, 400);
  }
  function stopLoading() {
    if (stepT) { clearInterval(stepT); stepT = null; }
    if (progT) { clearInterval(progT); progT = null; }
    var f = $('mtg-pf'), t = $('mtg-pp');
    if (f) f.style.width = '100%';
    if (t) t.textContent = '100%';
    setT('mtg-title', '✨ 30일 운세가 완성되었습니다');
    setH('mtg-step', '앞으로의 30일이<br><b>지금 열립니다.</b>');
  }
  function showRetry(msg) {
    if (stepT) { clearInterval(stepT); stepT = null; }
    if (progT) { clearInterval(progT); progT = null; }
    var l = $('mtg-load'); if (l) l.style.setProperty('display', 'none', 'important');
    var r = $('mtg-retry');
    if (r) {
      if (msg) { var p = r.querySelector('p'); if (p) p.innerHTML = msg; }
      r.style.setProperty('display', 'flex', 'important');
    }
  }
  function hideRetry() {
    var r = $('mtg-retry'); if (r) r.style.setProperty('display', 'none', 'important');
    var l = $('mtg-load'); if (l) { l.style.setProperty('display', 'flex', 'important'); l.style.opacity = '1'; }
  }

  /* ══════════════════════════════════════════════════════════════
     응답 읽기 — 서버 두 모양 모두 대응
     ══════════════════════════════════════════════════════════════ */
  function pick(payload) {
    var r = (payload && payload.report && typeof payload.report === 'object') ? payload.report : payload;
    var m = (payload && payload.meta && typeof payload.meta === 'object') ? payload.meta : payload;
    var g = function (o, k) { return (o && o[k] !== undefined && o[k] !== null) ? o[k] : undefined; };
    var val = function (k) { var v = g(r, k); return v !== undefined ? v : g(payload, k); };
    var mval = function (k) { var v = g(m, k); return v !== undefined ? v : g(payload, k); };
    return { r: r, m: m, val: val, mval: mval };
  }

  var rendered = false;
  var FLOW = null, GOOD = [], CARE = [];

  function render(payload) {
    if (rendered) return true;
    if (!payload || typeof payload !== 'object' || payload.error) return false;
    var P = pick(payload);
    /* 본문이 하나도 없으면 렌더 실패로 본다 */
    if (!P.val('card1_overview') && !P.val('headline')) return false;

    try {
      var ps = P.mval('periodStart'), pe = P.mval('periodEnd');
      setT('mtg-period', (ps && pe) ? (ps + ' ~ ' + pe) : '앞으로 30일');
      if (ps) setT('mtg-fs', ps);
      if (pe) setT('mtg-fe', pe);

      setH('mtg-headline', P.val('headline') || '앞으로 30일');
      var keys = [P.val('keyword_1'), P.val('keyword_2'), P.val('keyword_3')].filter(Boolean);
      setH('mtg-keys', keys.map(function (k) { return '<span>' + esc(k) + '</span>'; }).join(''));

      LABS.forEach(function (b, i) {
        var v = P.val(b[2]);
        setT('mtg-lb' + i, (v && String(v).trim()) ? v : '—');
      });

      var good = (P.mval('goodDays') || []).slice(0, 4);
      var care = (P.mval('careDays') || []).slice(0, 3);
      setH('mtg-good', good.length
        ? good.map(function (d) { return '<span>' + esc(d) + '</span>'; }).join('')
        : '<div class="none">이번 30일은 특정일보다<br><b style="color:#7ee59b">꾸준함이 통하는</b> 흐름입니다.</div>');
      setH('mtg-care', care.length
        ? care.map(function (d) { return '<span>' + esc(d) + '</span>'; }).join('')
        : '<div class="none">뚜렷하게 조심할 날이<br>계산되지 않았습니다.</div>');

      var flow = P.mval('flow');
      FLOW = (Array.isArray(flow) && flow.length > 2) ? flow : null;
      GOOD = good.map(function (d) { return toOffset(d, P.mval('baseDate') || payload.baseDate); })
                 .filter(function (v) { return v >= 0; });
      CARE = care.map(function (d) { return toOffset(d, P.mval('baseDate') || payload.baseDate); })
                 .filter(function (v) { return v >= 0; });
      if (!FLOW) { var fw = $('mtg-flow'); if (fw) fw.style.display = 'none'; }

      CARDS.forEach(function (c, i) {
        setH('mtg-o' + i, P.val(c[0]) || '내용을 불러오지 못했습니다.');
      });
      setH('mtg-teaser', P.val('card9_teaser') || P.val('teaser') ||
        '이 흐름은 타고난 차트 위에서 벌어지는 일입니다.');

      window.__mtgScores = {
        total: Number(P.val('score_total')) || 0,
        love: Number(P.val('score_love')) || 0,
        money: Number(P.val('score_money')) || 0,
        work: Number(P.val('score_work')) || 0,
        body: Number(P.val('score_body')) || 0
      };

      rendered = true;
      stopLoading();
      setTimeout(function () {
        var l = $('mtg-load');
        if (l) { l.style.opacity = '0'; setTimeout(function () { l.style.setProperty('display', 'none', 'important'); animate(); }, 520); }
        else animate();
      }, 820);
      return true;
    } catch (e) {
      console.error('[30일 렌더 실패]', e);
      rendered = false;
      return false;
    }
  }

  /* "8월 2일" → 시작일로부터 며칠째 */
  function toOffset(label, base) {
    try {
      var m = String(label).match(/(\d+)월\s*(\d+)일/);
      if (!m || !base) return -1;
      var st = new Date(base); st.setHours(0, 0, 0, 0);
      var y = st.getFullYear();
      var t = new Date(y, Number(m[1]) - 1, Number(m[2]));
      if (t < st) t = new Date(y + 1, Number(m[1]) - 1, Number(m[2]));
      return Math.round((t - st) / 86400000);
    } catch (e) { return -1; }
  }

  /* ══════════════════════════════════════════════════════════════
     애니메이션
     ══════════════════════════════════════════════════════════════ */
  function animate() {
    var h = $('mtg-hero'); if (h) h.classList.add('on');
    var S = window.__mtgScores || { total: 0 };

    setTimeout(function () {
      var pct = Math.max(0, Math.min(100, S.total));
      var arc = $('mtg-arc');
      if (arc) arc.style.strokeDashoffset = String(509 - 509 * pct / 100);
      var dot = $('mtg-dot');
      if (dot && pct > 0) {
        /* SVG 전체가 -90도 회전돼 있어 3시 방향이 12시가 된다 */
        var rad = (pct / 100) * 2 * Math.PI;
        dot.setAttribute('cx', (94 + 81 * Math.cos(rad)).toFixed(1));
        dot.setAttribute('cy', (94 + 81 * Math.sin(rad)).toFixed(1));
        dot.style.opacity = '1';
      }
      var n = $('mtg-total'), cur = 0;
      var tk = setInterval(function () {
        cur += Math.max(1, Math.round(S.total / 26));
        if (cur >= S.total) { cur = S.total; clearInterval(tk); }
        if (n) n.textContent = cur;
      }, 52);
    }, 300);

    BARS.forEach(function (b, i) {
      var v = Number(S[b[1]]) || 0;
      setTimeout(function () {
        var f = $('mtg-bf' + i); if (f) f.style.width = v + '%';
        var nn = $('mtg-bn' + i), c = 0;
        var tk = setInterval(function () {
          c += Math.max(1, Math.round(v / 18));
          if (c >= v) { c = v; clearInterval(tk); }
          if (nn) nn.textContent = c;
        }, 52);
      }, 680 + i * 200);
    });

    setTimeout(drawFlow, 500);
    setTimeout(function () {
      var f = $('mtg-flow'); if (f && FLOW) f.classList.add('on');
      var d = $('mtg-days'); if (d) d.classList.add('on');
    }, 900);

    var cards = document.querySelectorAll('.mtg-card');
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) { if (e.isIntersecting) { e.target.classList.add('on'); io.unobserve(e.target); } });
      }, { threshold: 0.1 });
      Array.prototype.forEach.call(cards, function (c) { io.observe(c); });
      var up = $('mtg-up');
      if (up) {
        var io2 = new IntersectionObserver(function (es) { if (es[0].isIntersecting) up.classList.add('on'); }, { threshold: 0.2 });
        io2.observe(up);
      }
    } else {
      Array.prototype.forEach.call(cards, function (c) { c.classList.add('on'); });
      var u = $('mtg-up'); if (u) u.classList.add('on');
    }
    setTimeout(function () { var s = $('mtg-save'); if (s) s.classList.add('on'); }, 1100);
  }

  function drawFlow() {
    var line = $('mtg-fl'), fill = $('mtg-ff'), dots = $('mtg-fd');
    if (!line || !FLOW || !FLOW.length) return;
    var W = 420, H = 156, PX = 14, PT = 16, PB = 16;
    var n = FLOW.length;
    var xs = function (i) { return PX + (i / (n - 1)) * (W - PX * 2); };
    var ys = function (v) { return H - PB - (Math.max(0, Math.min(100, v)) / 100) * (H - PT - PB); };

    var d = 'M ' + xs(0).toFixed(1) + ' ' + ys(FLOW[0]).toFixed(1);
    for (var i = 0; i < n - 1; i++) {
      var x0 = xs(i), y0 = ys(FLOW[i]), x1 = xs(i + 1), y1 = ys(FLOW[i + 1]);
      var cx = (x0 + x1) / 2;
      d += ' C ' + cx.toFixed(1) + ' ' + y0.toFixed(1) + ', ' + cx.toFixed(1) + ' ' + y1.toFixed(1) +
           ', ' + x1.toFixed(1) + ' ' + y1.toFixed(1);
    }
    line.setAttribute('d', d);
    if (fill) fill.setAttribute('d', d + ' L ' + xs(n - 1).toFixed(1) + ' ' + (H - PB) +
                                   ' L ' + xs(0).toFixed(1) + ' ' + (H - PB) + ' Z');
    try {
      var len = line.getTotalLength();
      line.style.strokeDasharray = len;
      line.style.strokeDashoffset = len;
      line.style.transition = 'stroke-dashoffset 1.8s cubic-bezier(.22,1,.36,1)';
      requestAnimationFrame(function () { line.style.strokeDashoffset = '0'; });
    } catch (e) {}
    if (fill) {
      fill.style.opacity = '0';
      fill.style.transition = 'opacity 1.2s ease .8s';
      requestAnimationFrame(function () { fill.style.opacity = '1'; });
    }
    if (!dots) return;
    var html = '';
    function dot(idx, good) {
      if (idx < 0 || idx >= n) return;
      var cx = xs(idx).toFixed(1), cy = ys(FLOW[idx]).toFixed(1);
      var col = good ? '#f0d77b' : '#ff6b60';
      html += '<circle cx="' + cx + '" cy="' + cy + '" r="7" fill="' + col + '" opacity="0.18"/>' +
              '<circle cx="' + cx + '" cy="' + cy + '" r="3.6" fill="' + col + '"/>';
    }
    GOOD.forEach(function (i) { dot(i, true); });
    CARE.forEach(function (i) { dot(i, false); });
    dots.innerHTML = html;
    dots.style.opacity = '0';
    dots.style.transition = 'opacity .8s ease 1.5s';
    requestAnimationFrame(function () { dots.style.opacity = '1'; });
  }

  /* ══════════════════════════════════════════════════════════════
     통신
     ══════════════════════════════════════════════════════════════ */
  var polls = 0, MAX_POLL = 20;

  function poll() {
    if (rendered) return;
    if (!ORDER_ID || ++polls > MAX_POLL) { showRetry(null); return; }
    fetch(API + '?orderId=' + encodeURIComponent(ORDER_ID), { cache: 'no-store' })
      .then(function (r) { return r.json().catch(function () { return null; }); })
      .then(function (d) {
        if (d && !d.error && render(d)) return;
        setTimeout(poll, 8000);
      })
      .catch(function () { setTimeout(poll, 8000); });
  }

  function start(isRetry) {
    rendered = false; polls = 0;
    startLoading();

    if (!DATA) {
      showRetry('입력하신 정보를 불러오지 못했습니다.<br><strong>결제는 정상 완료되었습니다.</strong><br>' +
                '아래 버튼을 눌러 정보를 다시 입력해 주세요.');
      var b = $('mtg-retry-btn');
      if (b) { b.textContent = '정보 다시 입력하기';
        b.onclick = function () { location.href = '/product/detail.html?product_no=' + NO; }; }
      return;
    }

    /* 저장본 먼저 확인. 기간이 지났으면 서버가 stale 로 알려주고 다시 만듭니다. */
    var pre = (!isRetry && ORDER_ID)
      ? fetch(API + '?orderId=' + encodeURIComponent(ORDER_ID), { cache: 'no-store' })
          .then(function (r) { return r.json().catch(function () { return null; }); })
          .catch(function () { return null; })
      : Promise.resolve(null);

    pre.then(function (cached) {
      if (cached && !cached.error && render(cached)) return;

      var body = {
        name: DATA.name, date: DATA.date,
        time: DATA.timeUnknown ? '' : (DATA.time || ''),
        timeUnknown: !!DATA.timeUnknown,
        city: DATA.city || 'Seoul',
        myGender: DATA.myGender || '미상',
        productNo: NO
      };
      if (ORDER_ID) body.orderId = ORDER_ID;

      return fetch(API, { method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body) })
        .then(function (res) {
          if (res.status === 202) { setTimeout(poll, 6000); return null; }
          return res.json().catch(function () { return null; });
        })
        .then(function (d) {
          if (!d) return;
          if (d.status === 'pending') { setTimeout(poll, 6000); return; }
          if (!d.error && render(d)) return;
          if (ORDER_ID) setTimeout(poll, 8000); else showRetry(null);
        });
    }).catch(function (e) {
      console.warn('[30일] 통신 실패:', e);
      if (ORDER_ID) setTimeout(poll, 8000); else showRetry(null);
    });
  }

  /* ══════════════════════════════════════════════════════════════
     이미지 저장 — 세로가 길면 분할 (iOS 캔버스 면적 한계 대응)
     ══════════════════════════════════════════════════════════════ */
  var SAFE_AREA = 13000000;

  function sections() {
    var out = [], ids = ['mtg-hero', 'mtg-flow', 'mtg-days'];
    ids.forEach(function (id) { var e = $(id); if (e && e.offsetHeight > 12 && e.style.display !== 'none') out.push(e); });
    document.querySelectorAll('.mtg-card').forEach(function (c) { if (c.offsetHeight > 12) out.push(c); });
    return out;
  }
  function labelOf(e) {
    if (e.id === 'mtg-hero') return '요약';
    if (e.id === 'mtg-flow') return '30일 흐름';
    if (e.id === 'mtg-days') return '움직일 날·조심할 날';
    var t = e.querySelector('.tt');
    return t ? t.textContent.trim().slice(0, 20) : '본문';
  }
  function unhide(doc) {
    doc.querySelectorAll('.mtg-card,#mtg-hero,#mtg-flow,#mtg-days,#mtg-up').forEach(function (x) {
      x.style.opacity = '1'; x.style.transform = 'none';
    });
    var s = doc.getElementById('mtg-save'); if (s) s.style.display = 'none';
    var hb = doc.getElementById('astro-headbar'); if (hb) hb.style.display = 'none';
  }
  function shoot(node) {
    var w = node.offsetWidth || 360, h = node.offsetHeight || 100;
    var scale = Math.min(3, Math.max(1.5, 1080 / w));
    if (w * h * scale * scale > SAFE_AREA) scale = Math.sqrt(SAFE_AREA / (w * h));
    return html2canvas(node, { backgroundColor: null, scale: scale, useCORS: true,
      allowTaint: true, logging: false, onclone: unhide });
  }
  function stitch(list) {
    var GAP = 24, PAD = 24, FOOT = 70, w = 0, h = 0;
    list.forEach(function (c) { w = Math.max(w, c.width); });
    list.forEach(function (c) { h += Math.round(c.height * (w / c.width)); });
    h += GAP * Math.max(0, list.length - 1) + PAD * 2 + FOOT;
    var cv = document.createElement('canvas');
    cv.width = w + PAD * 2; cv.height = h;
    var g = cv.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, cv.height);
    grd.addColorStop(0, '#141d38'); grd.addColorStop(.5, '#0a0c18'); grd.addColorStop(1, '#050308');
    g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);
    var y = PAD;
    list.forEach(function (c, i) {
      var dh = Math.round(c.height * (w / c.width));
      g.drawImage(c, PAD, y, w, dh);
      y += dh + (i < list.length - 1 ? GAP : 0);
    });
    var fy = cv.height - FOOT + 16;
    var lg = g.createLinearGradient(PAD, 0, cv.width - PAD, 0);
    lg.addColorStop(0, 'rgba(212,175,55,0)'); lg.addColorStop(.5, 'rgba(212,175,55,.6)');
    lg.addColorStop(1, 'rgba(212,175,55,0)');
    g.fillStyle = lg; g.fillRect(PAD, fy, cv.width - PAD * 2, 1);
    var fs = Math.max(13, Math.round(cv.width / 48));
    g.textAlign = 'center';
    g.fillStyle = '#d4af37'; g.font = '700 ' + fs + 'px "Noto Sans KR", sans-serif';
    g.fillText('ASTRANOTE', cv.width / 2, fy + fs + 11);
    g.fillStyle = '#6d6478'; g.font = '400 ' + Math.round(fs * .78) + 'px "Noto Sans KR", sans-serif';
    g.fillText('astra-note.com · 오늘부터 30일, 하루 단위 실제 계산', cv.width / 2, fy + fs * 2 + 14);
    return cv;
  }
  function plan(shots) {
    var groups = [], cur = [], curH = 0, w = 0;
    shots.forEach(function (s) { w = Math.max(w, s.canvas.width); });
    shots.forEach(function (s) {
      var h = Math.round(s.canvas.height * (w / s.canvas.width));
      if (cur.length && w * (curH + h) > SAFE_AREA) { groups.push(cur); cur = []; curH = 0; }
      cur.push(s); curH += h + 24;
    });
    if (cur.length) groups.push(cur);
    return groups;
  }
  function gallery(items) {
    var g = $('mtg-gal');
    if (!g) { g = el('div'); g.id = 'mtg-gal'; document.body.appendChild(g); }
    var mob = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
    g.innerHTML = '<h4>' + (items.length > 1 ? items.length + '장으로 저장했습니다' : '저장 준비 완료') + '</h4>' +
      '<div class="gd">' + (mob ? '각 이미지를 <b style="color:#f0d77b">길게 꾹 눌러</b> 사진 앱에 저장해 주세요.'
        : '이미지가 순서대로 다운로드됩니다.') + '</div>' +
      items.map(function (it) { return '<img src="' + it.url + '" alt="">'; }).join('') +
      '<button type="button" class="cl">닫기</button>';
    g.querySelector('.cl').onclick = function () { g.classList.remove('on'); };
    g.classList.add('on'); g.scrollTop = 0;
    if (!mob) items.forEach(function (it, i) {
      setTimeout(function () {
        var a = document.createElement('a');
        a.download = '아스트라노트_30일운세_' + (i + 1) + '.png'; a.href = it.url; a.click();
      }, i * 400);
    });
  }
  function save() {
    var btn = $('mtg-save-btn');
    if (typeof html2canvas !== 'function') { alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.'); return; }
    var orig = btn.textContent;
    btn.textContent = '⏳ 만드는 중…'; btn.disabled = true;
    var nodes = sections(), shots = [], chain = Promise.resolve();
    nodes.forEach(function (n) {
      chain = chain.then(function () { return shoot(n).then(function (cv) { shots.push({ canvas: cv, label: labelOf(n) }); }); });
    });
    chain.then(function () {
      var items = plan(shots).map(function (grp) {
        return { url: stitch(grp.map(function (s) { return s.canvas; })).toDataURL('image/png') };
      });
      gallery(items);
    }).catch(function (e) {
      console.error('[30일] 저장 실패', e);
      alert('이미지 생성 중 문제가 생겼습니다. 화면을 직접 캡처해 주세요.');
    }).then(function () { btn.textContent = orig; btn.disabled = false; });
  }

  /* html2canvas 가 없으면 붙여준다 (기존 페이지에 이미 있으면 건너뜀) */
  function ensureH2C() {
    if (typeof html2canvas === 'function') return;
    if (document.querySelector('script[src*="html2canvas"]')) return;
    var s = document.createElement('script');
    s.src = 'https://html2canvas.hertzen.com/dist/html2canvas.min.js';
    document.head.appendChild(s);
  }

  function boot() { inject(); ensureH2C(); start(false); }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();
