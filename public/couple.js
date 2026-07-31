/* ============================================================================
   ASTRANOTE — 궁합 결과화면 가독성 개선 + '우리가 결혼한다면' 장 렌더
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/couple.js
   ▣ 카페24 order_result.html 맨 아래에 한 줄만 넣습니다.
        script src="https://astranote-server.vercel.app/couple.js"   (태그로 감싸서)

   ▣ 고치는 것

   1) 본문이 눈에 안 들어오던 문제
      .cpr-ct 가 font-weight:300 이었습니다. 300은 흰 배경용입니다.
      검은 배경에서는 얇은 획이 뭉개져서 읽는 사람 눈이 금방 피로해집니다.
      VVIP 본문은 이미 웜그레이(#ded7cc)로 바꿔놨는데 궁합만 회색(#dcdcdc)이었습니다.
        굵기 300 → 400 / 줄간격 1.95 → 2.05 / 문단 간격 13px → 20px

   2) 카드 경계가 흐릿하던 문제
      카드 사이 여백 30px 인데 카드 안쪽 패딩이 40px 였습니다.
      안이 더 넓으니 카드가 어디서 끊기는지 눈이 못 잡습니다.

   3) '우리가 결혼한다면' 장이 화면에 안 나오던 문제
      서버가 card_future 를 주기 시작했는데 기존 화면은 그 필드를 모릅니다.
      08장과 09장 사이에 끼워 넣습니다.

   ▣ 15번 상품 화면이 실제로 떠 있을 때만 동작합니다. 9·11·14번 영향 0.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__astroCoupleV2) return;
  window.__astroCoupleV2 = true;

  var CSS = [
/* ── 본문 가독성 ─────────────────────────────────────────── */
'#cpr .cpr-ct{font-weight:400!important;font-size:16.5px!important;line-height:2.05!important;',
'  color:#ded7cc!important;letter-spacing:-.03em!important;text-align:left!important;',
'  word-break:keep-all!important;overflow-wrap:anywhere!important;}',
'#cpr .cpr-ct br+br{display:block;content:"";margin-top:20px!important;}',
/* 강조 : 밑줄 대신 금색 형광펜 */
'#cpr .cpr-ct b,#cpr .cpr-ct strong{color:#f7e7a8!important;font-weight:700!important;',
'  border-bottom:0!important;padding:0 3px!important;border-radius:2px!important;',
'  background:linear-gradient(180deg,rgba(255,255,255,0) 60%,rgba(212,175,55,.26) 40%)!important;}',
'#cpr .cpr-ct span[style*="ff3b30"]{background:rgba(255,59,48,.12)!important;',
'  padding:2px 6px!important;border-radius:4px!important;}',

/* ── 카드 경계 ───────────────────────────────────────────── */
'#cpr .cpr-card{padding:34px 22px!important;margin-bottom:22px!important;',
'  border-radius:18px!important;',
'  background:linear-gradient(180deg,rgba(28,20,42,.9),rgba(12,9,18,.94))!important;}',
'#cpr .cpr-card.show{box-shadow:0 18px 50px rgba(0,0,0,.5)!important;}',
'#cpr .cpr-tt{font-size:20px!important;line-height:1.4!important;margin-bottom:22px!important;',
'  padding-bottom:14px!important;}',
'#cpr .cpr-lb{font-size:10.5px!important;letter-spacing:3.5px!important;margin-bottom:12px!important;}',

/* ── 점수 원그래프 정렬 ──────────────────────────────────────
   🚨 모바일에서 .cpr-gauge 는 190px → 164px 로 줄어드는데
      안에 든 <svg> 는 190px 고정이었다.
      원의 중심(95px)과 숫자 박스의 중심(82px)이 13px 어긋나
      숫자가 원 왼쪽으로 밀려 보였다.
      viewBox 가 있으므로 100%로 두면 어떤 크기에도 정확히 맞는다. */
'#cpr .cpr-gauge svg{width:100%!important;height:100%!important;display:block!important;}',
'#cpr .cpr-gauge{display:block!important;}',
'#cpr .cpr-gauge .val{position:absolute!important;inset:0!important;',
'  display:flex!important;align-items:center!important;justify-content:center!important;}',
'#cpr .cpr-gauge .num{line-height:1!important;}',

/* ── 히어로 ──────────────────────────────────────────────── */
'#cpr #cpr-conf{font-size:11.5px!important;line-height:1.7!important;color:#7d7490!important;}',
'#cpr .cpr-bar em{color:#a8a0b8!important;}',

/* ── 새 장 ───────────────────────────────────────────────── */
'#cpr .cfx{position:relative;overflow:hidden;',
'  background:linear-gradient(180deg,rgba(40,26,58,.92),rgba(14,10,20,.95))!important;',
'  border:1px solid rgba(212,175,55,.42)!important;}',
'#cpr .cfx::before{content:"";position:absolute;top:0;left:0;right:0;height:3px;',
'  background:linear-gradient(90deg,transparent,rgba(247,231,168,.9),transparent);}',
'#cpr .cfx .cpr-lb{color:#f0d77b!important;}',

'@media screen and (max-width:480px){',
'  #cpr .cpr-card{padding:27px 16px!important;border-radius:15px!important;}',
'  #cpr .cpr-ct{font-size:15.5px!important;line-height:1.98!important;}',
'  #cpr .cpr-tt{font-size:18px!important;}',
'}'
].join('\n');

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }

  function injectCSS() {
    if ($('#cfx-style')) return;
    var st = document.createElement('style');
    st.id = 'cfx-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* 기존 스크립트가 localStorage 에 저장해 둔 궁합 응답을 읽는다 */
  function loadData() {
    var best = null, at = -1;
    try {
      for (var i = 0; i < localStorage.length; i++) {
        var k = localStorage.key(i);
        if (!k || k.indexOf('astro_rep:15:') !== 0) continue;
        var d = JSON.parse(localStorage.getItem(k));
        if (!d) continue;
        var t = (d._meta && d._meta.savedAt) || 0;
        if (t >= at) { at = t; best = d; }
      }
    } catch (e) {}
    return best;
  }

  var done = false;

  function insertChapter() {
    if (done) return;
    var host = $('#cpr');
    if (!host) return;
    var c8 = $('#cpr-c7');            // CHAPTER 08 (0부터 세므로 index 7)
    var c9 = $('#cpr-c8');            // CHAPTER 09
    if (!c8 || !c9) return;
    if ($('#cpr-future')) { done = true; return; }

    var data = loadData();
    var body = data && (data.report ? data.report.card_future : data.card_future);
    if (!body) return;               // 아직 서버가 안 줬거나 옛 리포트
    var title = (data.report ? data.report.card_future_title : data.card_future_title)
                || '우리가 결혼한다면';

    var box = document.createElement('div');
    box.className = 'cpr-card cfx';
    box.id = 'cpr-future';
    box.innerHTML =
      '<span class="cpr-lb">T H E &nbsp; L I F E &nbsp; A H E A D</span>' +
      '<div class="cpr-tt">' + esc(title) + '</div>' +
      '<div class="cpr-ct">' + body + '</div>';

    c9.parentNode.insertBefore(box, c9);

    /* 기존 카드와 같은 방식으로 서서히 나타나게 */
    box.style.opacity = '0';
    box.style.transform = 'translateY(30px)';
    box.style.transition = 'all 1s cubic-bezier(.22,1,.36,1)';
    if ('IntersectionObserver' in window) {
      var io = new IntersectionObserver(function (es) {
        es.forEach(function (e) {
          if (!e.isIntersecting) return;
          e.target.style.opacity = '1';
          e.target.style.transform = 'none';
          io.unobserve(e.target);
        });
      }, { threshold: 0.1 });
      io.observe(box);
    } else {
      box.style.opacity = '1'; box.style.transform = 'none';
    }

    done = true;
    console.log('[궁합v2] "' + title + '" 장 추가 완료');
  }

  function tick() {
    var host = $('#cpr');
    if (!host) return false;
    var s = window.getComputedStyle(host);
    if (s.display === 'none') return false;
    injectCSS();
    insertChapter();
    return done;
  }

  function boot() {
    if (tick()) return;
    var n = 0;
    var iv = setInterval(function () {
      n++;
      if (tick() || n > 150) clearInterval(iv);   // 최대 2분 30초
    }, 1000);
    if ('MutationObserver' in window) {
      new MutationObserver(tick).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 300);
})();
