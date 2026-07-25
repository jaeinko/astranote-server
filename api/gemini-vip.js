<!-- ═══════════════════════════════════════════════════════════════════════
     ASTRANOTE — VVIP 결과화면 강화 블록
     ▣ 붙이는 곳 : order_result.html 맨 아래 (헤더바 스크립트 뒤 아무 곳)
     ▣ 기존 코드는 한 글자도 수정하지 않습니다. 9·14·15번 상품 영향 0
     ▣ VIP 화면이 실제로 뜰 때만(body.is-vip) 동작합니다
     ═══════════════════════════════════════════════════════════════════════ -->
<script>
/* ============================================================================
   👑 ASTRANOTE — VVIP 결과화면 강화 오버라이드 (product_no=11 전용)
   ----------------------------------------------------------------------------
   ▣ 붙이는 곳 : order_result.html 맨 아래 (헤더바 스크립트 뒤 아무 곳)
   ▣ 기존 코드는 한 글자도 수정하지 않습니다. 상품 분기 로직도 건드리지 않습니다.
       · VIP 화면이 실제로 뜰 때만 동작 (body.is-vip 감시)
       · 9·14·15번 상품에는 아무 영향 없음
   ----------------------------------------------------------------------------
   ▣ 해결하는 것
   1. 좌우 정렬 — box-sizing이 #astro-vip-result-container에 빠져 있어
      .vip-report-card가 width:100% + padding:30px 으로 60px 삐져나가던 문제
   2. width:100vw → 스크롤바 폭만큼 생기던 가로 스크롤
   3. text-align:justify + word-break:keep-all 이 만들던 단어 사이 벌어짐
   4. 헤더바(48/54px)가 VVIP 배지를 덮던 문제
   5. 저장 버튼이 문서 맨 끝에 박혀 1만 자를 스크롤해야 보이던 문제 → 플로팅
   6. scale:2 전체 캡처가 iOS 캔버스 면적 한계(약 16.7M px²)를 넘겨 실패하던 문제
      → 섹션 단위로 캡처해 면적 예산에 맞춰 자동 분할. 문장이 잘리지 않는다.
   7. 새 서버 필드 렌더 : core_sentence · chart_table · method_note · closing · time_unknown
   8. 골드 톤 전면 강화 (남색 → 자금색, 밑줄 강조 → 형광펜, 카드 골드 라인)
   ========================================================================== */
(function () {
  'use strict';
  if (window.__astroVipPlus) return;
  window.__astroVipPlus = true;

  var BAR_PC = 54, BAR_M = 48;          // 헤더바 높이
  var SAFE_AREA = 13000000;             // 캔버스 안전 면적 (iOS 한계 16.7M에 마진)
  var MIN_SCALE = 1.5;                  // 이 밑으로 화질이 떨어지면 분할한다

  /* ══════════════════════════════════════════════════════════════════
     1. CSS — 골드 강화 + 정렬 교정
     ══════════════════════════════════════════════════════════════════ */
  var CSS = [
/* ── 좌우 정렬 교정 (가장 중요) ─────────────────────────────── */
'html body #astro-vip-result-container,',
'html body #astro-vip-result-container *{box-sizing:border-box!important;}',
'html,body{overflow-x:hidden!important;}',
'html body #astro-vip-result-container{',
'  width:100%!important;max-width:100%!important;left:0!important;right:0!important;',
'  overflow-x:hidden!important;',
'  background:radial-gradient(circle at 50% -8%,#1e1733 0%,#0b0812 46%,#050308 100%)!important;',
'  padding:' + (BAR_PC + 26) + 'px 20px 150px!important;}',
/* VIP 컨테이너가 #contents 직계여도 확실히 보이게 (기존 :not() 규칙 방어) */
'html body.is-vip #contents #astro-vip-result-container,',
'html body.is-vip #astro-vip-result-container{display:flex!important;}',

/* ── 공통 래퍼 폭 통일 ─────────────────────────────────────── */
'#astro-vip-result-container>*,.apx-block{width:100%!important;max-width:680px!important;',
'  margin-left:auto!important;margin-right:auto!important;}',

/* ── 상단 스크롤 진행 골드 라인 ────────────────────────────── */
'#apx-prog{position:fixed;top:' + BAR_PC + 'px;left:0;height:2px;width:0;z-index:2147482000;',
'  background:linear-gradient(90deg,#8a6d1f,#d4af37 40%,#f7e7a8);box-shadow:0 0 10px rgba(212,175,55,.8);',
'  transition:width .12s linear;pointer-events:none;}',

/* ── 헤더 ───────────────────────────────────────────────────── */
'#astro-vip-result-container .vip-report-header{margin-bottom:34px!important;}',
'#astro-vip-result-container .vvip-badge{',
'  background:linear-gradient(135deg,rgba(212,175,55,.18),rgba(142,36,170,.12))!important;',
'  border:1px solid rgba(212,175,55,.6)!important;color:#f0d77b!important;',
'  border-radius:20px!important;letter-spacing:3px!important;',
'  box-shadow:0 0 24px rgba(212,175,55,.18)!important;}',
'#astro-vip-result-container .vip-report-header h1{',
'  background:linear-gradient(180deg,#f7e7a8,#d4af37 55%,#a8842a)!important;',
'  -webkit-background-clip:text!important;background-clip:text!important;',
'  -webkit-text-fill-color:transparent!important;color:#d4af37;',
'  letter-spacing:2px!important;font-size:30px!important;}',
'#astro-vip-result-container .vip-report-header p{color:#b9a7d8!important;}',

/* ── 히어로 : 핵심 한 문장 ─────────────────────────────────── */
'.apx-hero{position:relative;text-align:center;padding:40px 24px 36px;margin-bottom:26px;',
'  background:radial-gradient(circle at 50% 0%,rgba(212,175,55,.16) 0%,transparent 58%),',
'    linear-gradient(180deg,rgba(40,28,58,.62),rgba(10,8,15,.94));',
'  border:1px solid rgba(212,175,55,.42);border-radius:20px;overflow:hidden;',
'  box-shadow:0 0 60px rgba(212,175,55,.1),inset 0 1px 0 rgba(247,231,168,.12);}',
'.apx-hero::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;',
'  background:linear-gradient(90deg,transparent,rgba(247,231,168,.9),transparent);}',
'.apx-hero .cap{font:700 10.5px "Cinzel",serif;letter-spacing:5px;color:rgba(212,175,55,.8);margin-bottom:18px;}',
'.apx-hero .q{font:900 23px/1.62 "Noto Serif KR",serif;color:#fff;word-break:keep-all;',
'  letter-spacing:-.05em;margin:0 auto;max-width:520px;}',
'.apx-hero .q .g{background:linear-gradient(180deg,#f7e7a8,#e8c766);',
'  -webkit-background-clip:text;background-clip:text;-webkit-text-fill-color:transparent;}',
'.apx-hero .who{margin-top:20px;font:600 12.5px "Noto Sans KR",sans-serif;color:#9a8cba;letter-spacing:-.03em;}',

/* ── 출생 천체 명세표 ──────────────────────────────────────── */
'.apx-card{position:relative;background:linear-gradient(180deg,rgba(28,22,40,.92),rgba(13,10,19,.95));',
'  border:1px solid rgba(212,175,55,.24);border-radius:18px;padding:34px 24px;margin-bottom:26px;overflow:hidden;}',
'.apx-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;',
'  background:linear-gradient(90deg,transparent,rgba(212,175,55,.75),transparent);}',
'.apx-lb{display:block;font:400 11px "Cinzel",serif;letter-spacing:3.5px;color:#a18cd1;margin-bottom:12px;}',
'.apx-tt{font:900 20px/1.4 "Noto Serif KR",serif;color:#f0d77b;word-break:keep-all;',
'  letter-spacing:-.05em;margin-bottom:8px;}',
'.apx-sub{font:400 13px/1.75 "Noto Sans KR",sans-serif;color:#9a9a9a;word-break:keep-all;',
'  letter-spacing:-.04em;margin-bottom:24px;}',
'.apx-sub b{color:#e8c766;font-weight:700;}',

'.apx-tbl{border-top:1px solid rgba(212,175,55,.22);}',
'.apx-row{display:grid;grid-template-columns:26px 1fr auto;gap:4px 10px;align-items:center;',
'  padding:11px 2px;border-bottom:1px solid rgba(255,255,255,.055);}',
'.apx-row.key{background:linear-gradient(90deg,rgba(212,175,55,.09),transparent 70%);}',
'.apx-g{font:700 15px "Cinzel",serif;color:#d4af37;text-align:center;}',
'.apx-row.key .apx-g{color:#f7e7a8;text-shadow:0 0 12px rgba(247,231,168,.6);}',
'.apx-n{font:800 13.5px "Noto Sans KR",sans-serif;color:#efe8dc;letter-spacing:-.04em;}',
'.apx-n i{display:block;font-style:normal;font-weight:500;font-size:11px;color:#8e83a8;margin-top:2px;letter-spacing:-.03em;}',
'.apx-v{text-align:right;font:700 13.5px "Noto Sans KR",sans-serif;color:#f0d77b;',
'  letter-spacing:-.02em;white-space:nowrap;}',
'.apx-v em{font-style:normal;color:#9a9a9a;font-weight:500;font-size:11.5px;margin-left:6px;}',
'.apx-v .rx{color:#ff8a80;font-size:11.5px;margin-left:5px;font-weight:700;}',
'.apx-dig{grid-column:2/4;justify-self:start;margin-top:3px;',
'  font:700 10.5px "Noto Sans KR",sans-serif;letter-spacing:-.02em;',
'  padding:3px 9px;border-radius:11px;white-space:nowrap;}',
'.apx-dig.good{color:#1d1608;background:linear-gradient(135deg,#f7e7a8,#d4af37);}',
'.apx-dig.hard{color:#f0b8b2;background:rgba(255,107,96,.13);border:1px solid rgba(255,107,96,.34);}',

'.apx-stats{display:grid;grid-template-columns:1fr 1fr;gap:9px;margin-top:22px;}',
'.apx-sbox{background:rgba(212,175,55,.055);border:1px solid rgba(212,175,55,.18);',
'  border-radius:13px;padding:14px 13px;}',
'.apx-sbox em{display:block;font:700 10.5px "Cinzel",serif;letter-spacing:2.5px;',
'  color:#a18cd1;font-style:normal;margin-bottom:9px;}',
'.apx-sbox .r{display:flex;justify-content:space-between;align-items:baseline;',
'  font:600 12.5px "Noto Sans KR",sans-serif;color:#b8b0a4;letter-spacing:-.04em;margin-bottom:5px;}',
'.apx-sbox .r:last-child{margin-bottom:0;}',
'.apx-sbox .r.top{color:#f0d77b;font-weight:900;}',
'.apx-sbox .r b{font-weight:900;color:inherit;}',

/* ── 계산 방법론 ───────────────────────────────────────────── */
'.apx-method{font:400 14px/1.95 "Noto Serif KR",serif;color:#c9c2b6;',
'  letter-spacing:-.03em;word-break:keep-all;text-align:left;}',
'.apx-method b{color:#f0d77b;font-weight:700;',
'  background:linear-gradient(180deg,rgba(255,255,255,0) 62%,rgba(212,175,55,.24) 38%);',
'  padding:0 2px;border-radius:2px;}',
'.apx-warn{margin-top:18px;padding:13px 15px;border-radius:12px;',
'  background:rgba(255,159,64,.08);border:1px solid rgba(255,180,80,.32);',
'  font:600 12.5px/1.7 "Noto Sans KR",sans-serif;color:#ffc27a;',
'  letter-spacing:-.04em;word-break:keep-all;}',

/* ── 본문 카드 골드 강화 ───────────────────────────────────── */
'#astro-vip-result-container .vip-report-card{',
'  background:linear-gradient(180deg,rgba(28,22,40,.9),rgba(13,10,19,.94))!important;',
'  border:1px solid rgba(212,175,55,.24)!important;border-radius:18px!important;',
'  padding:40px 26px!important;margin-bottom:26px!important;position:relative!important;overflow:hidden!important;}',
'#astro-vip-result-container .vip-report-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;',
'  background:linear-gradient(90deg,transparent,rgba(212,175,55,.75),transparent);}',
'#astro-vip-result-container .vip-report-card.show{',
'  border-color:rgba(212,175,55,.5)!important;box-shadow:0 20px 60px rgba(0,0,0,.55),0 0 40px rgba(212,175,55,.06)!important;}',
'#astro-vip-result-container .vip-card-label{font-family:"Cinzel",serif!important;',
'  color:#a18cd1!important;font-size:11px!important;letter-spacing:3.5px!important;',
'  font-weight:400!important;margin-bottom:14px!important;}',
'#astro-vip-result-container .vip-card-title{font-family:"Noto Serif KR",serif!important;',
'  font-size:23px!important;line-height:1.42!important;letter-spacing:-.05em!important;',
'  background:linear-gradient(180deg,#fff,#e8dcc4)!important;-webkit-background-clip:text!important;',
'  background-clip:text!important;-webkit-text-fill-color:transparent!important;color:#fff;',
'  padding-bottom:18px!important;margin-bottom:26px!important;}',
'#astro-vip-result-container .vip-card-title::after{width:46px!important;height:2px!important;',
'  background:linear-gradient(90deg,#f7e7a8,#d4af37 50%,transparent)!important;}',
/* 🚨 justify + keep-all 조합이 단어 사이를 벌린다 → left 로 */
'#astro-vip-result-container .vip-card-content{text-align:left!important;',
'  font-family:"Noto Serif KR",serif!important;font-size:16.5px!important;line-height:2.05!important;',
'  color:#ded7cc!important;font-weight:300!important;letter-spacing:-.03em!important;',
'  word-break:keep-all!important;overflow-wrap:anywhere!important;}',
/* 밑줄 강조 → 골드 형광펜 */
'#astro-vip-result-container .vip-card-content b,',
'#astro-vip-result-container .vip-card-content strong{',
'  color:#f7e7a8!important;font-weight:700!important;border-bottom:0!important;',
'  background:linear-gradient(180deg,rgba(255,255,255,0) 60%,rgba(212,175,55,.26) 40%)!important;',
'  padding:0 3px!important;border-radius:2px!important;}',
/* 챕터 리드문 */
'#astro-vip-result-container .vip-card-content p.lead{',
'  font-size:15px!important;line-height:1.9!important;color:#b3a9c9!important;',
'  padding:16px 18px!important;margin:0 0 26px!important;border-radius:0 12px 12px 0!important;',
'  background:rgba(161,140,209,.07)!important;border-left:2px solid rgba(161,140,209,.5)!important;}',
'#astro-vip-result-container .vip-card-content blockquote{',
'  background:linear-gradient(135deg,rgba(212,175,55,.1),rgba(142,36,170,.05))!important;',
'  border:0!important;border-left:3px solid #d4af37!important;border-radius:0 14px 14px 0!important;',
'  margin:30px 0 6px!important;padding:24px 22px!important;color:#f0d77b!important;',
'  font-size:16px!important;line-height:1.9!important;font-weight:600!important;',
'  box-shadow:inset 0 0 30px rgba(212,175,55,.05)!important;}',
'#astro-vip-result-container .vip-card-content span[style*="ff3b30"]{',
'  background:rgba(255,59,48,.12)!important;padding:2px 6px!important;border-radius:4px!important;}',

/* ── 점수표 골드 강화 ──────────────────────────────────────── */
'#astro-vip-result-container .life-chart-card{',
'  background:linear-gradient(180deg,rgba(28,22,40,.94),rgba(13,10,19,.96))!important;',
'  border:1px solid rgba(212,175,55,.34)!important;border-radius:18px!important;',
'  padding:40px 24px!important;margin-bottom:26px!important;position:relative!important;overflow:hidden!important;}',
'#astro-vip-result-container .life-chart-card::before{content:"";position:absolute;top:0;left:0;right:0;height:2px;',
'  background:linear-gradient(90deg,transparent,rgba(247,231,168,.85),transparent);}',
'#astro-vip-result-container .life-best-banner{border-radius:16px!important;',
'  border:1px solid rgba(212,175,55,.42)!important;',
'  background:radial-gradient(circle at 50% 0%,rgba(212,175,55,.16),transparent 72%)!important;}',
'#astro-vip-result-container .life-best-age{',
'  background:linear-gradient(180deg,#f7e7a8,#d4af37)!important;-webkit-background-clip:text!important;',
'  background-clip:text!important;-webkit-text-fill-color:transparent!important;}',
'#astro-vip-result-container .life-bar-track{height:12px!important;border-radius:6px!important;',
'  background:rgba(255,255,255,.045)!important;border:1px solid rgba(212,175,55,.12)!important;}',
'#astro-vip-result-container .life-bar-fill{border-radius:6px!important;',
'  background:linear-gradient(90deg,#6b4a8f,#d4af37 78%,#f0d77b)!important;',
'  box-shadow:0 0 14px rgba(212,175,55,.45)!important;}',
'#astro-vip-result-container .life-bar-fill.is-best{',
'  background:linear-gradient(90deg,#d4af37,#f7e7a8)!important;',
'  box-shadow:0 0 22px rgba(247,231,168,.7)!important;}',
'#astro-vip-result-container .life-score-num{color:#f0d77b!important;}',
'#astro-vip-result-container .life-desc{color:#a8a09a!important;font-size:13.5px!important;line-height:1.8!important;}',
'#astro-vip-result-container .life-desc.is-best{color:#e8d9a0!important;}',

/* ── 봉합 문단 ─────────────────────────────────────────────── */
'.apx-closing{text-align:center;padding:44px 26px;margin-bottom:26px;',
'  background:radial-gradient(circle at 50% 100%,rgba(212,175,55,.1),transparent 65%),',
'    linear-gradient(180deg,rgba(16,12,24,.9),rgba(6,5,10,.95));',
'  border:1px solid rgba(212,175,55,.26);border-radius:18px;position:relative;overflow:hidden;}',
'.apx-closing::before{content:"✦";position:absolute;top:16px;left:50%;transform:translateX(-50%);',
'  font-size:15px;color:rgba(212,175,55,.65);}',
'.apx-closing .tx{font:400 16px/2.1 "Noto Serif KR",serif;color:#d8d0c4;',
'  letter-spacing:-.035em;word-break:keep-all;margin-top:18px;}',
'.apx-closing .tx b{color:#f7e7a8;font-weight:700;}',
'.apx-sign{margin-top:30px;padding-top:22px;border-top:1px solid rgba(212,175,55,.16);}',
'.apx-sign .bd{font:700 13px "Cinzel",serif;letter-spacing:5px;color:#d4af37;}',
'.apx-sign .nt{margin-top:9px;font:400 11.5px/1.7 "Noto Sans KR",sans-serif;color:#6d6478;letter-spacing:-.03em;}',

/* ── 플로팅 저장바 ─────────────────────────────────────────── */
'#astro-vip-result-container .vip-capture-section{display:none!important;}',
'#apx-savebar{position:fixed;left:0;right:0;bottom:0;z-index:1000050;',
'  display:flex;flex-direction:column;align-items:center;gap:8px;',
'  padding:13px 16px calc(13px + env(safe-area-inset-bottom));',
'  background:linear-gradient(to top,rgba(5,3,8,.985) 55%,rgba(5,3,8,.75) 82%,rgba(5,3,8,0));',
'  transform:translateY(140%);transition:transform .55s cubic-bezier(.22,1,.36,1);}',
'#apx-savebar.on{transform:none;}',
'#apx-savebar .row{display:flex;gap:9px;width:100%;max-width:680px;}',
'#apx-savebar button{border:none;cursor:pointer;border-radius:14px;',
'  font-family:"Noto Sans KR",sans-serif;letter-spacing:-.045em;transition:transform .14s;}',
'#apx-savebar button:active{transform:scale(.97);}',
'#apx-savebar button:disabled{opacity:.5;cursor:not-allowed;}',
'#apx-main{flex:1.6;padding:17px 14px;font-weight:900;font-size:15.5px;color:#1a1206;',
'  background:linear-gradient(135deg,#f7e7a8,#e8c766 38%,#d4af37 72%,#b8912e);',
'  box-shadow:0 10px 30px rgba(212,175,55,.34),inset 0 1px 0 rgba(255,255,255,.45);}',
'#apx-share{flex:1;padding:17px 10px;font-weight:800;font-size:14px;color:#f0d77b;',
'  background:rgba(212,175,55,.1);border:1px solid rgba(212,175,55,.5)!important;}',
'#apx-savebar .hint{font:500 11px "Noto Sans KR",sans-serif;color:#7a7186;letter-spacing:-.03em;text-align:center;}',

/* ── 저장 결과 갤러리 ──────────────────────────────────────── */
'#apx-gal{position:fixed;inset:0;z-index:10000050;display:none;flex-direction:column;',
'  background:rgba(4,3,7,.985);overflow-y:auto;padding:22px 16px 40px;}',
'#apx-gal.on{display:flex;}',
'#apx-gal h4{font:900 18px "Noto Sans KR",sans-serif;color:#f0d77b;text-align:center;',
'  margin:6px 0 6px;letter-spacing:-.05em;}',
'#apx-gal .gd{font:500 13px/1.7 "Noto Sans KR",sans-serif;color:#9a9a9a;text-align:center;',
'  margin-bottom:22px;word-break:keep-all;letter-spacing:-.04em;}',
'#apx-gal .gi{width:100%;max-width:520px;margin:0 auto 20px;}',
'#apx-gal .gi em{display:block;font:700 11.5px "Noto Sans KR",sans-serif;color:#d4af37;',
'  font-style:normal;margin-bottom:7px;letter-spacing:-.03em;}',
'#apx-gal img{width:100%;display:block;border:1px solid rgba(212,175,55,.45);border-radius:10px;}',
'#apx-gal .cl{display:block;margin:10px auto 0;max-width:520px;width:100%;padding:16px;',
'  border:none;border-radius:13px;cursor:pointer;font:900 15px "Noto Sans KR",sans-serif;',
'  color:#1a1206;background:linear-gradient(135deg,#f0d77b,#d4af37);letter-spacing:-.04em;}',

/* ── 모바일 ────────────────────────────────────────────────── */
'@media screen and (max-width:480px){',
'  html body #astro-vip-result-container{padding:' + (BAR_M + 20) + 'px 14px 132px!important;}',
'  #apx-prog{top:' + BAR_M + 'px;}',
'  #astro-vip-result-container .vip-report-header h1{font-size:25px!important;}',
'  .apx-hero{padding:32px 18px 30px;border-radius:16px;}',
'  .apx-hero .q{font-size:20px;line-height:1.6;}',
'  .apx-card{padding:28px 17px;border-radius:16px;}',
'  .apx-tt{font-size:18px;}',
'  .apx-row{grid-template-columns:24px 1fr auto;padding:10px 1px;}',
'  .apx-n{font-size:13px;} .apx-v{font-size:12.5px;}',
'  .apx-stats{grid-template-columns:1fr;}',
'  #astro-vip-result-container .vip-report-card{padding:30px 17px!important;border-radius:16px!important;}',
'  #astro-vip-result-container .vip-card-title{font-size:20px!important;}',
'  #astro-vip-result-container .vip-card-content{font-size:15.5px!important;line-height:1.98!important;}',
'  #astro-vip-result-container .life-chart-card{padding:30px 16px!important;}',
'  .apx-closing{padding:34px 18px;border-radius:16px;}',
'  .apx-closing .tx{font-size:15px;line-height:2.0;}',
'  #apx-main{font-size:14.5px;padding:16px 10px;} #apx-share{font-size:13px;}',
'}'
].join('\n');

  /* ══════════════════════════════════════════════════════════════════
     2. 유틸
     ══════════════════════════════════════════════════════════════════ */
  function $(id) { return document.getElementById(id); }
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function injectCSS() {
    if ($('apx-style')) return;
    var st = el('style');
    st.id = 'apx-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* 서버 응답을 가져온다. 기존 스크립트가 localStorage에 저장해 둔 것을 읽는다.
     (renderVip 안에서 saveReport('11', ORDER_ID, data) 가 호출된다) */
  function loadVipData() {
    var best = null, bestAt = -1;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('astro_rep:11:') !== 0) continue;
        var d = JSON.parse(localStorage.getItem(k));
        if (!d || typeof d !== 'object') continue;
        var at = (d._meta && d._meta.savedAt) || 0;
        if (at >= bestAt) { bestAt = at; best = d; }
      }
    } catch (e) { console.warn('[VIP+] 저장본 읽기 실패:', e); }
    return best;
  }

  function userName() {
    try {
      var t = $('vip-user-name-tag');
      if (t && t.innerText) {
        var m = t.innerText.match(/^(.+?)님/);
        if (m) return m[1];
      }
      var u = JSON.parse(localStorage.getItem('astro_user_data') || '{}');
      if (u && u.name) return u.name;
    } catch (e) {}
    return '';
  }

  /* ══════════════════════════════════════════════════════════════════
     3. 새 필드 렌더 : 히어로 · 명세표 · 방법론 · 봉합
     ══════════════════════════════════════════════════════════════════ */
  var KEY_BODIES = { '상승점': 1, '태양': 1, '달': 1, '천정': 1 };

  function buildHero(data) {
    var s = data.core_sentence;
    if (!s) return null;
    var nm = userName();
    var box = el('div', 'apx-hero apx-block');
    box.innerHTML =
      '<div class="cap">T H E &nbsp; O N E &nbsp; L I N E</div>' +
      '<div class="q">&ldquo; <span class="g">' + esc(s) + '</span> &rdquo;</div>' +
      (nm ? '<div class="who">' + esc(nm) + '님의 출생 차트에서</div>' : '');
    return box;
  }

  function buildChartTable(data) {
    var t = data.chart_table;
    if (!Array.isArray(t) || !t.length) return null;

    var rows = t.map(function (r) {
      var key = KEY_BODIES[r.name] ? ' key' : '';
      var dig = '';
      if (r.dignity) {
        var hard = r.dignity.indexOf('함몰') === 0 || r.dignity.indexOf('추락') === 0;
        dig = '<span class="apx-dig ' + (hard ? 'hard' : 'good') + '">' + esc(r.dignity) + '</span>';
      }
      return '<div class="apx-row' + key + '">' +
        '<span class="apx-g">' + esc(r.glyph || '✦') + '</span>' +
        '<span class="apx-n">' + esc(r.name) +
          (r.role ? '<i>' + esc(r.role) + '</i>' : '') + '</span>' +
        '<span class="apx-v">' + esc(r.sign) + ' ' + esc(r.deg) +
          '<em>' + esc(r.house) + '하우스</em>' +
          (r.retro ? '<span class="rx">℞ 역행</span>' : '') + '</span>' +
        dig +
      '</div>';
    }).join('');

    var stats = '';
    if (data.chart_stats) stats = buildStats(data.chart_stats);

    var box = el('div', 'apx-card apx-block');
    box.id = 'apx-chart';
    box.innerHTML =
      '<span class="apx-lb">N A T A L &nbsp; C H A R T</span>' +
      '<div class="apx-tt">출생 천체 명세표</div>' +
      '<div class="apx-sub">태어난 순간 하늘에 새겨진 <b>' + t.length + '개의 좌표</b>입니다. ' +
      '금빛으로 표시된 <b>상승점</b>이 모든 해석의 첫 단추입니다.</div>' +
      '<div class="apx-tbl">' + rows + '</div>' + stats;
    return box;
  }

  /* 서버가 준 통계 문장을 두 개의 박스로 시각화 */
  function buildStats(raw) {
    try {
      var lines = String(raw).split('\n');
      function parse(line) {
        var items = [];
        var body = line.split('—')[1] || '';
        body.split('▸')[0].split('/').forEach(function (p) {
          var m = p.trim().match(/^(\S+)\s+(\d+)개$/);
          if (m) items.push({ k: m[1], v: Number(m[2]) });
        });
        // 🚨 '활동(cardinal)(5개, ...)' 처럼 괄호가 겹치므로 lazy 매칭이 필요하다
        var topM = line.match(/가장 강한[^:]*:\s*(.+?)\((\d+)개,\s*([^)]+)\)/);
        var lackM = line.match(/결핍:\s*([^→]+)→/);
        return {
          items: items,
          top: topM ? { k: topM[1].trim(), n: topM[2], why: topM[3].trim() } : null,
          lack: lackM ? lackM[1].trim() : null
        };
      }
      var e = parse(lines[0] || ''), m = parse(lines[1] || '');
      function box(label, p) {
        if (!p.items.length) return '';
        var max = Math.max.apply(null, p.items.map(function (x) { return x.v; }));
        return '<div class="apx-sbox"><em>' + label + '</em>' +
          p.items.map(function (x) {
            return '<div class="r' + (x.v === max ? ' top' : '') + '"><span>' +
              esc(x.k.replace(/\(.*\)/, '')) + '</span><b>' + x.v + '</b></div>';
          }).join('') +
          (p.top ? '<div class="r" style="margin-top:9px;padding-top:8px;border-top:1px solid rgba(212,175,55,.16);color:#8e83a8;font-size:11px;line-height:1.6;display:block">' +
            esc(p.top.why) + '</div>' : '') +
          (p.lack ? '<div class="r" style="margin-top:6px;color:#ff9d95;font-size:11px;line-height:1.6;display:block">' +
            esc(p.lack) + ' 부족 — 의식적으로 채워야 하는 영역</div>' : '') +
          '</div>';
      }
      var out = box('ELEMENT · 원소', e) + box('MODALITY · 성질', m);
      return out ? '<div class="apx-stats">' + out + '</div>' : '';
    } catch (err) { return ''; }
  }

  function buildMethod(data) {
    if (!data.method_note) return null;
    var box = el('div', 'apx-card apx-block');
    box.id = 'apx-method';
    box.innerHTML =
      '<span class="apx-lb">M E T H O D O L O G Y</span>' +
      '<div class="apx-tt">이 차트를 어떻게 계산했는가</div>' +
      '<div class="apx-method">' + data.method_note + '</div>' +
      (data.time_unknown
        ? '<div class="apx-warn">⚠️ 출생 시각을 모른다고 알려주셔서 <b>정오(12:00) 기준</b>으로 계산했습니다. ' +
          '태양·달·행성의 별자리는 그대로 유효하지만, <b>상승점과 하우스는 근사치</b>입니다. ' +
          '정확한 시각을 아시게 되면 알려주세요. 다시 계산해 드립니다.</div>'
        : '');
    return box;
  }

  function buildClosing(data) {
    if (!data.closing) return null;
    var nm = userName();
    var box = el('div', 'apx-closing apx-block');
    box.id = 'apx-closing';
    box.innerHTML =
      '<div class="tx">' + data.closing + '</div>' +
      '<div class="apx-sign"><div class="bd">A S T R A N O T E</div>' +
      '<div class="nt">이 리포트는 실제 천체 궤도를 근거로<br>' +
      (nm ? esc(nm) + ' 한 분만을 위해' : '오직 한 분만을 위해') + ' 작성되었습니다.</div></div>';
    return box;
  }

  /* ══════════════════════════════════════════════════════════════════
     4. 주입
     ══════════════════════════════════════════════════════════════════ */
  var injected = false;

  function enhance() {
    if (injected) return;
    var host = $('astro-vip-result-container');
    if (!host) return;
    var c1 = $('out-vip-card1');
    if (!c1 || !c1.innerHTML || c1.innerHTML.length < 50) return;   // 아직 렌더 전

    var data = loadVipData();
    if (!data) { console.warn('[VIP+] 저장본을 못 찾아 신규 필드는 건너뜁니다'); data = {}; }
    injected = true;

    var header = host.querySelector('.vip-report-header');
    var card1 = $('vip-card1');
    var anchor = card1 || null;

    // 헤더 다음, 첫 챕터 앞에 : 히어로 → 명세표 → 방법론
    [buildHero(data), buildChartTable(data), buildMethod(data)].forEach(function (node) {
      if (!node) return;
      if (anchor && anchor.parentNode) anchor.parentNode.insertBefore(node, anchor);
      else if (header && header.parentNode) header.parentNode.appendChild(node);
    });

    // 점수표 뒤에 봉합 문단
    var closing = buildClosing(data);
    if (closing) {
      var lc = $('life-chart');
      if (lc && lc.parentNode) lc.parentNode.insertBefore(closing, lc.nextSibling);
      else host.appendChild(closing);
    }

    // best_age_reason 이 innerText 로 들어가 태그가 문자로 보이던 문제 보정
    try {
      var br = $('out-best-reason');
      if (br && data.best_age_reason && /<[a-z]/i.test(data.best_age_reason)) br.innerHTML = data.best_age_reason;
    } catch (e) {}

    // 점수표 제목을 실제 렌더 범위와 맞춘다
    try {
      var lct = $('life-chart') && $('life-chart').querySelector('.vip-card-title');
      if (lct) lct.textContent = '당신의 인생 흐름 : 10대부터 80대까지';
    } catch (e) {}

    fadeIn([$('apx-chart'), $('apx-method'), $('apx-closing')]);
    setupSaveBar();
    setupProgress();
    console.log('[VIP+] 강화 렌더 완료');
  }

  function fadeIn(nodes) {
    nodes.filter(Boolean).forEach(function (n) {
      n.style.opacity = '0';
      n.style.transform = 'translateY(26px)';
      n.style.transition = 'all .9s cubic-bezier(.22,1,.36,1)';
    });
    if (!('IntersectionObserver' in window)) {
      nodes.filter(Boolean).forEach(function (n) { n.style.opacity = '1'; n.style.transform = 'none'; });
      return;
    }
    var io = new IntersectionObserver(function (es) {
      es.forEach(function (e) {
        if (!e.isIntersecting) return;
        e.target.style.opacity = '1';
        e.target.style.transform = 'none';
        io.unobserve(e.target);
      });
    }, { threshold: 0.08 });
    nodes.filter(Boolean).forEach(function (n) { io.observe(n); });
    var hero = document.querySelector('.apx-hero');
    if (hero) { hero.style.opacity = '1'; }
  }

  /* ══════════════════════════════════════════════════════════════════
     5. 이미지 저장 — 섹션 단위 캡처 후 면적 예산에 맞춰 자동 분할
     ------------------------------------------------------------------
     기존 방식은 컨테이너 전체를 scale:2로 한 번에 캡처했다.
     리포트가 1만 자를 넘으면 세로 9,000px, 면적 21M px² 가 되어
     iOS Safari 캔버스 한계(약 16.7M px²)를 넘겨 빈 이미지가 나왔다.
     섹션별로 잘라 담으면 문장이 잘리지 않고, 각 장이 그대로 공유 가능하다.
     ══════════════════════════════════════════════════════════════════ */
  var BG = '#08060d';

  function sections() {
    var host = $('astro-vip-result-container');
    if (!host) return [];
    var order = ['.vip-report-header', '.apx-hero', '#apx-chart', '#apx-method',
                 '#vip-card1', '#vip-card2', '#vip-card3', '#vip-card4', '#life-chart', '#apx-closing'];
    var out = [];
    order.forEach(function (s) {
      var e = host.querySelector(s);
      if (e && e.offsetHeight > 12) out.push(e);
    });
    return out;
  }

  function labelOf(e) {
    if (!e) return '';
    if (e.classList.contains('vip-report-header')) return '표지';
    if (e.classList.contains('apx-hero')) return '핵심 한 문장';
    if (e.id === 'apx-chart') return '출생 천체 명세표';
    if (e.id === 'apx-method') return '계산 방법론';
    if (e.id === 'life-chart') return '인생 운세 점수표';
    if (e.id === 'apx-closing') return '맺음말';
    var t = e.querySelector('.vip-card-title');
    return t ? t.innerText.trim().slice(0, 22) : '본문';
  }

  /* 애니메이션 때문에 opacity:0 / translateY 상태인 요소를 캡처하면 빈 칸이 나온다 */
  function unhide(doc) {
    doc.querySelectorAll('.vip-report-card,.life-chart-card,.apx-card,.apx-hero,.apx-closing')
      .forEach(function (x) { x.style.opacity = '1'; x.style.transform = 'none'; });
    doc.querySelectorAll('.life-bar-fill').forEach(function (b) {
      if (b.dataset && b.dataset.score) b.style.width = b.dataset.score + '%';
    });
    var sb = doc.getElementById('apx-savebar'); if (sb) sb.style.display = 'none';
    var hb = doc.getElementById('astro-headbar'); if (hb) hb.style.display = 'none';
  }

  function shoot(node) {
    var w = node.offsetWidth || 360;
    var h = node.offsetHeight || 100;
    var scale = Math.min(3, Math.max(1.5, 1080 / w));
    if (w * h * scale * scale > SAFE_AREA) scale = Math.sqrt(SAFE_AREA / (w * h));
    return html2canvas(node, {
      backgroundColor: null, scale: scale, useCORS: true, allowTaint: true, logging: false,
      onclone: unhide
    });
  }

  /* 여러 캔버스를 한 장으로 이어붙이고 하단에 브랜드 서명을 넣는다 */
  function stitch(list) {
    var GAP = 26, PAD = 26, FOOT = 74;
    var w = 0, h = 0;
    list.forEach(function (c) { w = Math.max(w, c.width); });
    list.forEach(function (c) { h += Math.round(c.height * (w / c.width)); });
    h += GAP * Math.max(0, list.length - 1) + PAD * 2 + FOOT;

    var cv = document.createElement('canvas');
    cv.width = w + PAD * 2;
    cv.height = h;
    var g = cv.getContext('2d');

    var grd = g.createLinearGradient(0, 0, 0, cv.height);
    grd.addColorStop(0, '#170f28');
    grd.addColorStop(0.45, '#0b0812');
    grd.addColorStop(1, BG);
    g.fillStyle = grd;
    g.fillRect(0, 0, cv.width, cv.height);

    var y = PAD;
    list.forEach(function (c, i) {
      var dh = Math.round(c.height * (w / c.width));
      g.drawImage(c, PAD, y, w, dh);
      y += dh + (i < list.length - 1 ? GAP : 0);
    });

    // 골드 구분선 + 서명
    var fy = cv.height - FOOT + 18;
    var lg = g.createLinearGradient(PAD, 0, cv.width - PAD, 0);
    lg.addColorStop(0, 'rgba(212,175,55,0)');
    lg.addColorStop(0.5, 'rgba(212,175,55,0.6)');
    lg.addColorStop(1, 'rgba(212,175,55,0)');
    g.fillStyle = lg;
    g.fillRect(PAD, fy, cv.width - PAD * 2, 1);

    var fs = Math.max(14, Math.round(cv.width / 46));
    g.textAlign = 'center';
    g.fillStyle = '#d4af37';
    g.font = '700 ' + fs + 'px "Noto Sans KR", sans-serif';
    g.fillText('ASTRANOTE', cv.width / 2, fy + fs + 12);
    g.fillStyle = '#6d6478';
    g.font = '400 ' + Math.round(fs * 0.78) + 'px "Noto Sans KR", sans-serif';
    g.fillText('astra-note.com · 실제 천체 궤도 기반 1:1 리포트', cv.width / 2, fy + fs * 2 + 16);

    return cv;
  }

  /* 면적 예산 안에서 최대한 묶는다 */
  function plan(shots) {
    var groups = [], cur = [], curH = 0;
    var w = 0;
    shots.forEach(function (s) { w = Math.max(w, s.canvas.width); });
    shots.forEach(function (s) {
      var h = Math.round(s.canvas.height * (w / s.canvas.width));
      if (cur.length && w * (curH + h) > SAFE_AREA) { groups.push(cur); cur = []; curH = 0; }
      cur.push(s); curH += h + 26;
    });
    if (cur.length) groups.push(cur);
    return groups;
  }

  function isMobile() { return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); }

  function gallery(items) {
    var g = $('apx-gal');
    if (!g) { g = el('div'); g.id = 'apx-gal'; document.body.appendChild(g); }
    var mob = isMobile();
    g.innerHTML =
      '<h4>' + (items.length > 1 ? items.length + '장으로 저장했습니다' : '저장 준비 완료') + '</h4>' +
      '<div class="gd">' + (mob
        ? '각 이미지를 <b style="color:#f0d77b">길게 꾹 눌러</b> 사진 앱에 저장해 주세요.'
        : '이미지가 순서대로 다운로드됩니다.') +
        (items.length > 1 ? '<br>세로가 너무 긴 한 장은 휴대폰에서 저장이 실패하므로 나눴습니다.' : '') +
      '</div>' +
      items.map(function (it, i) {
        return '<div class="gi"><em>' + (i + 1) + '. ' + esc(it.label) + '</em>' +
          '<img src="' + it.url + '" alt=""></div>';
      }).join('') +
      '<button type="button" class="cl">닫기</button>';
    g.querySelector('.cl').onclick = function () { g.classList.remove('on'); };
    g.classList.add('on');
    g.scrollTop = 0;

    if (!mob) {
      items.forEach(function (it, i) {
        setTimeout(function () {
          var a = document.createElement('a');
          a.download = '아스트라노트_VVIP_' + (i + 1) + '_' + it.label.replace(/[^가-힣a-zA-Z0-9]/g, '') + '.png';
          a.href = it.url;
          a.click();
        }, i * 400);
      });
    }
  }

  function run(nodes, mode) {
    if (typeof html2canvas !== 'function') {
      alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.');
      return Promise.resolve();
    }
    if (!nodes.length) { alert('저장할 내용을 찾지 못했습니다. 화면을 새로고침해 주세요.'); return Promise.resolve(); }

    var shots = [];
    var chain = Promise.resolve();
    nodes.forEach(function (n) {
      chain = chain.then(function () {
        return shoot(n).then(function (cv) { shots.push({ canvas: cv, label: labelOf(n) }); });
      });
    });

    return chain.then(function () {
      var groups = mode === 'share' ? [shots] : plan(shots);
      var items = groups.map(function (grp) {
        var cv = stitch(grp.map(function (s) { return s.canvas; }));
        return {
          url: cv.toDataURL('image/png'),
          label: grp.length === 1 ? grp[0].label : grp[0].label + ' ~ ' + grp[grp.length - 1].label
        };
      });
      gallery(items);
    });
  }

  function busy(btn, on, txt) {
    if (!btn) return;
    if (on) { btn.dataset.o = btn.innerText; btn.innerText = txt; btn.disabled = true; }
    else { btn.innerText = btn.dataset.o || txt; btn.disabled = false; }
  }

  function setupSaveBar() {
    if ($('apx-savebar')) return;
    var bar = el('div');
    bar.id = 'apx-savebar';
    bar.innerHTML =
      '<div class="row">' +
        '<button type="button" id="apx-main">📸 리포트 전체 저장</button>' +
        '<button type="button" id="apx-share">✦ 명세표만</button>' +
      '</div>' +
      '<div class="hint">저장한 이미지는 언제든 다시 볼 수 있습니다 · 무료</div>';
    document.body.appendChild(bar);
    setTimeout(function () { bar.classList.add('on'); }, 700);

    var main = $('apx-main'), share = $('apx-share');
    var both = [main, share];

    main.onclick = function () {
      both.forEach(function (b) { b.disabled = true; });
      busy(main, true, '⏳ 만드는 중…');
      run(sections(), 'full').catch(function (e) {
        console.error('[VIP+] 저장 실패', e);
        alert('이미지 생성 중 문제가 생겼습니다. 화면을 직접 캡처해 주세요.');
      }).then(function () {
        busy(main, false, '📸 리포트 전체 저장');
        both.forEach(function (b) { b.disabled = false; });
      });
    };

    /* 공유용 : 히어로 + 명세표만. 쓰레드에 올리기 좋은 크기로 나온다 */
    share.onclick = function () {
      var host = $('astro-vip-result-container');
      var pick = ['.apx-hero', '#apx-chart'].map(function (s) { return host && host.querySelector(s); }).filter(Boolean);
      if (!pick.length) pick = sections().slice(0, 2);
      both.forEach(function (b) { b.disabled = true; });
      busy(share, true, '⏳');
      run(pick, 'share').catch(function (e) {
        console.error('[VIP+] 공유 저장 실패', e);
        alert('이미지 생성 중 문제가 생겼습니다.');
      }).then(function () {
        busy(share, false, '✦ 명세표만');
        both.forEach(function (b) { b.disabled = false; });
      });
    };

    // 기존 전역 함수도 새 로직으로 교체 (숨겨진 옛 버튼이나 다른 호출 대비)
    window.saveVipReport = function () { main.click(); };
  }

  /* ══════════════════════════════════════════════════════════════════
     6. 상단 스크롤 진행 골드 라인
     ══════════════════════════════════════════════════════════════════ */
  function setupProgress() {
    if ($('apx-prog')) return;
    var p = el('div'); p.id = 'apx-prog';
    document.body.appendChild(p);
    var tick = function () {
      var h = document.documentElement.scrollHeight - window.innerHeight;
      var r = h > 0 ? Math.min(1, Math.max(0, window.pageYOffset / h)) : 0;
      p.style.width = (r * 100).toFixed(1) + '%';
    };
    window.addEventListener('scroll', tick, { passive: true });
    window.addEventListener('resize', tick);
    tick();
  }

  /* ══════════════════════════════════════════════════════════════════
     7. VIP 로딩 화면 강화
     ------------------------------------------------------------------
     일반 리포트(9,900원)는 진행률 바 + 5단계 체크리스트가 있는데
     VVIP(29,900원)는 스피너 하나뿐이었다. 안내 문구도 '2~3분'으로
     남아 있어 실제(병렬 호출 후 약 1분)와 어긋난다.
     ══════════════════════════════════════════════════════════════════ */
  var LOAD_STEPS = ['출생 순간의 천체 좌표 계산', '상승점·천정 정밀 산출',
                    '품위와 각도 대조', '재능과 직업 자리 판독', '리포트 집필'];

  function setupLoading() {
    var host = $('vip-data-loading');
    if (!host || $('apx-lwrap')) return;

    var desc = host.querySelector('.vip-loading-desc');
    if (desc) {
      desc.innerHTML = '실제 천체 궤도를 역산해 ' +
        (userName() ? esc(userName()) + '님' : '당신') +
        '만의 리포트를 쓰고 있습니다.<br>보통 <b style="color:#f0d77b">1분 내외</b> 걸립니다. 화면을 끄지 마세요.';
      desc.style.lineHeight = '1.75';
      desc.style.wordBreak = 'keep-all';
      desc.style.maxWidth = '330px';
    }

    var wrap = el('div');
    wrap.id = 'apx-lwrap';
    wrap.style.cssText = 'width:280px;max-width:82vw;margin-top:26px;';
    wrap.innerHTML =
      '<div style="width:100%;height:8px;border-radius:5px;background:rgba(255,255,255,.07);' +
      'overflow:hidden;border:1px solid rgba(212,175,55,.14)">' +
      '<div id="apx-lfill" style="height:100%;width:0;border-radius:5px;' +
      'background:linear-gradient(90deg,#6b4a8f,#d4af37 62%,#f7e7a8);' +
      'box-shadow:0 0 14px rgba(212,175,55,.7);transition:width .7s cubic-bezier(.22,1,.36,1)"></div></div>' +
      '<div id="apx-lpct" style="text-align:right;margin-top:7px;font:700 13px \'Cinzel\',serif;' +
      'color:#f0d77b;letter-spacing:1px">0%</div>' +
      '<div id="apx-lchk" style="margin-top:20px;text-align:left">' +
      LOAD_STEPS.map(function (s, i) {
        return '<div class="apx-li" data-i="' + i + '" style="display:flex;align-items:center;gap:9px;' +
          'font:400 13px \'Noto Sans KR\',sans-serif;color:#5b5468;margin-bottom:9px;transition:color .5s">' +
          '<span class="mk" style="width:15px;flex-shrink:0;transition:color .4s">○</span><span>' + s + '</span></div>';
      }).join('') + '</div>';
    host.appendChild(wrap);

    var t0 = Date.now();
    var timer = setInterval(function () {
      if (!document.body.contains(wrap) || host.style.display === 'none') { clearInterval(timer); return; }
      var sec = (Date.now() - t0) / 1000;
      var p = Math.min(96, Math.round(96 * (1 - Math.exp(-sec / 20))));
      var f = $('apx-lfill'), t = $('apx-lpct');
      if (f) f.style.width = p + '%';
      if (t) t.innerText = p + '%';
      var cur = Math.min(LOAD_STEPS.length - 1, Math.floor(p / 20));
      wrap.querySelectorAll('.apx-li').forEach(function (it) {
        var i = Number(it.dataset.i), mk = it.querySelector('.mk');
        if (i < cur) { it.style.color = '#8fd8a0'; mk.style.color = '#6dd47e'; mk.innerText = '✓'; }
        else if (i === cur) { it.style.color = '#f0d77b'; it.style.fontWeight = '700'; mk.style.color = '#f0d77b'; mk.innerText = '◉'; }
        else { mk.innerText = '○'; }
      });
    }, 400);
  }

  /* ══════════════════════════════════════════════════════════════════
     8. 시작 — VIP 화면이 뜰 때만 동작
     ══════════════════════════════════════════════════════════════════ */
  function tick() {
    if (!document.body.classList.contains('is-vip')) return false;
    injectCSS();
    setupLoading();
    enhance();
    return injected;
  }

  function boot() {
    injectCSS();
    if (tick()) return;
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (tick() || n > 400) clearInterval(iv);   // 최대 200초 감시
    }, 500);
    if ('MutationObserver' in window) {
      new MutationObserver(function () { tick(); })
        .observe(document.body, { childList: true, subtree: true, attributes: true, attributeFilter: ['class'] });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 0);
})();

</script>
