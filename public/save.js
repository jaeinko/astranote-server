/* ============================================================================
   ASTRANOTE — 리포트 이미지 저장 오버라이드 (배우자 9번 · 궁합 15번)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/save.js  (GitHub 저장소)
   ▣ 카페24 order_result.html 맨 아래에 아래 한 줄만 넣습니다.
        script src="https://astranote-server.vercel.app/save.js"   (태그로 감싸서)

   ▣ 무엇을 고치나

   1) 쓰레드·인스타 인앱 브라우저에서 저장이 아예 안 되던 문제
      기존 배우자 저장 경로가 이랬습니다.

          captureTo('astro-result-container', ..., false)
                                                   ^^^^^ mobileGuide = false
          → 모바일이면 window.open() 으로 새 창을 연다
          → 인앱 브라우저는 새 창을 막는다
          → tab 이 null → 저장 화면이 아예 안 뜬다

      VVIP 는 이 인자가 true 라서 페이지 안에 이미지를 띄웠습니다.
      그래서 VVIP 만 저장이 됐던 겁니다.

   2) 길게 눌러도 저장 메뉴가 안 뜨던 문제
      data: URI 이미지는 인앱 브라우저에서 길게 눌러도 메뉴가 안 나올 때가 있습니다.
      그래서 iOS 기본 공유 시트(navigator.share)를 1순위로 씁니다.
      버튼을 누르는 순간 "이미지 저장"이 있는 시트가 그대로 열립니다.

   3) 리포트가 길면 캔버스가 비어버리던 문제
      전체를 한 장으로 뜨지 않고 섹션별로 떠서 면적 예산에 맞춰 자동 분할합니다.
      VVIP·30일에 이미 적용한 방식과 같습니다.

   ▣ 9·15번 화면이 실제로 떠 있을 때만 동작합니다. 11·14번에는 영향이 없습니다.
   ============================================================================ */
(function () {
  'use strict';
  if (window.__astroSaveV2) return;
  window.__astroSaveV2 = true;

  var SAFE_AREA = 13000000;   // iOS 캔버스 한계(약 16.7M px²)에 마진을 둔 값

  /* 상품별 캡처 대상 */
  var SPECS = {
    '9': {
      root: '#astro-result-container',
      order: ['.report-header', '#card1', '#card2', '#card3', '#card4', '#card5', '#card6', '#card7', '#upsell-gate'],
      hideInClone: ['.capture-section', '.btn-save-floating'],
      unhide: '.report-card,#upsell-gate',
      grad: ['#231a33', '#120d1c', '#050505'],
      name: '배우자리포트'
    },
    '15': {
      root: '#cpr',
      order: ['#cpr-hero', '.cpr-card', '#cpr-upsell'],
      hideInClone: ['#cpr-save-wrap'],
      unhide: '.cpr-card,#cpr-hero,#cpr-upsell',
      grad: ['#241732', '#100b18', '#050505'],
      name: '궁합리포트'
    },
    /* 🚨 VVIP 는 강화 블록이 원래 저장 버튼을 숨기고(vip-capture-section:none)
          자기 버튼(#apx-savebar)으로 갈아끼웁니다. 그 갈아끼우기가 실패하면
          원래 버튼은 숨겨진 채 새 버튼도 안 생겨서 저장 버튼이 아예 사라집니다.
          여기서 버튼 존재를 보장하고, 저장 방식도 공유 시트로 바꿉니다. */
    '11': {
      root: '#astro-vip-result-container',
      order: ['.vip-report-header', '.apx-hero', '#apx-chart', '#apx-method',
              '#vip-card1', '#vip-card2', '#vip-card3', '#vip-card4',
              '#life-chart', '#apx-closing'],
      hideInClone: ['.vip-capture-section', '#apx-savebar', '#apx-prog'],
      unhide: '.vip-report-card,.life-chart-card,.apx-card,.apx-hero,.apx-closing',
      grad: ['#1e1733', '#0b0812', '#050308'],
      name: 'VVIP리포트',
      bars: true   /* life-bar-fill 너비 복원 필요 */
    }
  };

  function $(s, r) { return (r || document).querySelector(s); }
  function esc(s) {
    return String(s == null ? '' : s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  }
  function isMobile() { return /iPhone|iPad|iPod|Android/i.test(navigator.userAgent); }

  /* ── 스타일 ──────────────────────────────────────────────── */
  var CSS = [
'#asv-gal{position:fixed;inset:0;z-index:10000060;display:none;flex-direction:column;',
'  background:rgba(4,3,7,.985);overflow-y:auto;padding:20px 15px 40px;',
'  font-family:"Noto Sans KR",sans-serif;letter-spacing:-.04em;}',
'#asv-gal.on{display:flex;}',
'#asv-gal h4{font:900 18px "Noto Sans KR",sans-serif;color:#f0d77b;text-align:center;margin:6px 0 8px;}',
'#asv-gal .gd{font:500 12.5px/1.7 "Noto Sans KR",sans-serif;color:#9a9a9a;text-align:center;',
'  margin-bottom:20px;word-break:keep-all;}',
'#asv-gal .gd b{color:#f0d77b;}',
'#asv-gal .gi{width:100%;max-width:520px;margin:0 auto 22px;}',
'#asv-gal .gi em{display:block;font:700 11.5px "Noto Sans KR",sans-serif;color:#d4af37;',
'  font-style:normal;margin-bottom:7px;}',
'#asv-gal img{width:100%;display:block;border:1px solid rgba(212,175,55,.45);border-radius:10px;}',
'#asv-gal .sv{width:100%;margin-top:9px;padding:14px;border:none;border-radius:12px;cursor:pointer;',
'  font:900 14.5px "Noto Sans KR",sans-serif;color:#1a1206;letter-spacing:-.04em;',
'  background:linear-gradient(135deg,#f7e7a8,#d4af37);}',
'#asv-gal .sv:active{transform:scale(.98);}',
'#asv-gal .sv.done{background:rgba(110,220,140,.18);color:#7ee59b;',
'  border:1px solid rgba(110,220,140,.45)!important;}',
'#asv-gal .cl{display:block;margin:6px auto 0;max-width:520px;width:100%;padding:15px;',
'  border:1px solid rgba(255,255,255,.16);border-radius:12px;cursor:pointer;background:transparent;',
'  color:#9a9a9a;font:700 14px "Noto Sans KR",sans-serif;}'
].join('');

  function injectCSS() {
    if ($('#asv-style')) return;
    var st = document.createElement('style');
    st.id = 'asv-style';
    st.textContent = CSS;
    document.head.appendChild(st);
  }

  /* ── 캡처 ────────────────────────────────────────────────── */
  function nodesOf(spec) {
    var root = $(spec.root);
    if (!root) return [];
    var out = [];
    spec.order.forEach(function (sel) {
      var list = root.querySelectorAll(sel);
      Array.prototype.forEach.call(list, function (e) {
        if (e && e.offsetHeight > 12) out.push(e);
      });
    });
    return out;
  }

  function labelOf(e, spec) {
    if (e.classList.contains('report-header')) return '표지';
    if (e.classList.contains('vip-report-header')) return '표지';
    if (e.classList.contains('apx-hero')) return '핵심 한 문장';
    if (e.id === 'apx-chart') return '출생 천체 명세표';
    if (e.id === 'apx-method') return '계산 방법론';
    if (e.id === 'life-chart') return '인생 운세 점수표';
    if (e.id === 'apx-closing') return '맺음말';
    if (e.id === 'cpr-hero') return '궁합 점수';
    if (e.id === 'upsell-gate' || e.id === 'cpr-upsell') return '안내';
    var t = $('.card-title', e) || $('.cpr-tt', e) || $('.vip-card-title', e);
    return t ? t.textContent.trim().slice(0, 22) : '본문';
  }

  /* 애니메이션으로 opacity:0 인 요소를 그대로 뜨면 빈 칸이 나온다 */
  function makeClone(spec) {
    return function (doc) {
      doc.querySelectorAll(spec.unhide).forEach(function (x) {
        x.style.opacity = '1'; x.style.transform = 'none';
      });
      if (spec.bars) {
        doc.querySelectorAll('.life-bar-fill').forEach(function (b) {
          if (b.dataset && b.dataset.score) b.style.width = b.dataset.score + '%';
        });
      }
      spec.hideInClone.forEach(function (sel) {
        var e = doc.querySelector(sel); if (e) e.style.display = 'none';
      });
      var hb = doc.getElementById('astro-headbar'); if (hb) hb.style.display = 'none';
      var sv = doc.getElementById('asv-gal'); if (sv) sv.style.display = 'none';
    };
  }

  function shoot(node, spec) {
    var w = node.offsetWidth || 360, h = node.offsetHeight || 100;
    var scale = Math.min(3, Math.max(1.5, 1080 / w));
    if (w * h * scale * scale > SAFE_AREA) scale = Math.sqrt(SAFE_AREA / (w * h));
    return html2canvas(node, {
      backgroundColor: null, scale: scale, useCORS: true, allowTaint: true,
      logging: false, onclone: makeClone(spec)
    });
  }

  function stitch(list, spec) {
    var GAP = 24, PAD = 24, FOOT = 72, w = 0, h = 0;
    list.forEach(function (c) { w = Math.max(w, c.width); });
    list.forEach(function (c) { h += Math.round(c.height * (w / c.width)); });
    h += GAP * Math.max(0, list.length - 1) + PAD * 2 + FOOT;

    var cv = document.createElement('canvas');
    cv.width = w + PAD * 2; cv.height = h;
    var g = cv.getContext('2d');
    var grd = g.createLinearGradient(0, 0, 0, cv.height);
    grd.addColorStop(0, spec.grad[0]); grd.addColorStop(.5, spec.grad[1]); grd.addColorStop(1, spec.grad[2]);
    g.fillStyle = grd; g.fillRect(0, 0, cv.width, cv.height);

    var y = PAD;
    list.forEach(function (c, i) {
      var dh = Math.round(c.height * (w / c.width));
      g.drawImage(c, PAD, y, w, dh);
      y += dh + (i < list.length - 1 ? GAP : 0);
    });

    var fy = cv.height - FOOT + 16;
    var lg = g.createLinearGradient(PAD, 0, cv.width - PAD, 0);
    lg.addColorStop(0, 'rgba(212,175,55,0)');
    lg.addColorStop(.5, 'rgba(212,175,55,.6)');
    lg.addColorStop(1, 'rgba(212,175,55,0)');
    g.fillStyle = lg; g.fillRect(PAD, fy, cv.width - PAD * 2, 1);

    var fs = Math.max(13, Math.round(cv.width / 48));
    g.textAlign = 'center';
    g.fillStyle = '#d4af37';
    g.font = '700 ' + fs + 'px "Noto Sans KR", sans-serif';
    g.fillText('ASTRANOTE', cv.width / 2, fy + fs + 11);
    g.fillStyle = '#6d6478';
    g.font = '400 ' + Math.round(fs * .78) + 'px "Noto Sans KR", sans-serif';
    g.fillText('astra-note.com · 실제 천체 궤도 기반 1:1 리포트', cv.width / 2, fy + fs * 2 + 14);
    return cv;
  }

  function plan(shots) {
    var groups = [], cur = [], curH = 0, w = 0;
    shots.forEach(function (s) { w = Math.max(w, s.width); });
    shots.forEach(function (s) {
      var h = Math.round(s.height * (w / s.width));
      if (cur.length && w * (curH + h) > SAFE_AREA) { groups.push(cur); cur = []; curH = 0; }
      cur.push(s); curH += h + 24;
    });
    if (cur.length) groups.push(cur);
    return groups;
  }

  function toBlob(cv) {
    return new Promise(function (ok) {
      if (cv.toBlob) cv.toBlob(function (b) { ok(b); }, 'image/png');
      else ok(null);
    });
  }

  /* ── 갤러리 + 저장 ───────────────────────────────────────── */
  /* 🚨 navigator.share 는 "버튼을 누른 그 순간" 안에서 불러야 iOS 가 허용합니다.
        캡처가 끝난 뒤에 부르면 제스처가 끊겨 거부됩니다.
        그래서 이미지를 먼저 보여주고, 저장 버튼을 새로 누르게 합니다. */
  function gallery(items, spec) {
    injectCSS();
    var g = $('#asv-gal');
    if (!g) { g = document.createElement('div'); g.id = 'asv-gal'; document.body.appendChild(g); }

    var canShare = !!(navigator.canShare && navigator.share);
    var mob = isMobile();

    g.innerHTML =
      '<h4>' + (items.length > 1 ? items.length + '장으로 만들었습니다' : '저장 준비 완료') + '</h4>' +
      '<div class="gd">' +
        (canShare ? '아래 <b>이미지 저장</b> 버튼을 누르면 사진 앱에 바로 저장됩니다.'
         : mob ? '이미지를 <b>길게 꾹 눌러</b> 사진 앱에 저장해 주세요.'
               : '아래 버튼으로 내려받으세요.') +
        (items.length > 1 ? '<br>세로가 너무 길면 저장이 실패해서 나눴습니다.' : '') +
      '</div>' +
      items.map(function (it, i) {
        return '<div class="gi"><em>' + (i + 1) + '. ' + esc(it.label) + '</em>' +
          '<img src="' + it.url + '" alt="">' +
          '<button type="button" class="sv" data-i="' + i + '">' +
          (canShare ? '📥 이미지 저장' : mob ? '🔗 새 창에서 열기' : '⬇ 내려받기') +
          '</button></div>';
      }).join('') +
      '<button type="button" class="cl">닫기</button>';

    g.querySelector('.cl').onclick = function () { g.classList.remove('on'); };

    Array.prototype.forEach.call(g.querySelectorAll('.sv'), function (btn) {
      btn.onclick = function () {
        var it = items[Number(btn.dataset.i)];
        var fname = spec.name + '_' + (Number(btn.dataset.i) + 1) + '.png';

        /* 1순위 : iOS·안드로이드 기본 공유 시트 */
        if (canShare && it.blob) {
          var file = new File([it.blob], fname, { type: 'image/png' });
          if (navigator.canShare({ files: [file] })) {
            navigator.share({ files: [file] }).then(function () {
              btn.textContent = '✓ 저장했습니다';
              btn.classList.add('done');
            }).catch(function (e) {
              if (e && e.name === 'AbortError') return;   // 사용자가 취소한 경우
              fallback(it, fname, btn);
            });
            return;
          }
        }
        fallback(it, fname, btn);
      };
    });

    g.classList.add('on');
    g.scrollTop = 0;
  }

  function fallback(it, fname, btn) {
    if (!isMobile()) {
      var a = document.createElement('a');
      a.download = fname; a.href = it.url; a.click();
      btn.textContent = '✓ 내려받았습니다';
      btn.classList.add('done');
      return;
    }
    /* 모바일인데 공유가 안 되면 이미지만 있는 창을 띄운다.
       그것도 막히면 길게 누르라고 안내한다. */
    if (it.blob && window.URL && URL.createObjectURL) {
      var u = URL.createObjectURL(it.blob);
      var w = window.open(u, '_blank');
      if (w) { btn.textContent = '새 창에서 길게 눌러 저장'; return; }
    }
    btn.textContent = '위 이미지를 길게 눌러주세요';
  }

  /* ── 실행 ────────────────────────────────────────────────── */
  var busy = false;

  function run(pn, btn) {
    var spec = SPECS[pn];
    if (!spec) return;
    if (busy) return;
    if (typeof html2canvas !== 'function') {
      alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.');
      return;
    }
    var nodes = nodesOf(spec);
    if (!nodes.length) { alert('저장할 내용을 찾지 못했습니다. 화면을 새로고침해 주세요.'); return; }

    busy = true;
    var orig = btn ? btn.textContent : '';
    if (btn) { btn.textContent = '⏳ 만드는 중…'; btn.disabled = true; }

    var shots = [], labels = [], chain = Promise.resolve();
    nodes.forEach(function (n) {
      chain = chain.then(function () {
        return shoot(n, spec).then(function (cv) { shots.push(cv); labels.push(labelOf(n, spec)); });
      });
    });

    chain.then(function () {
      var groups = plan(shots);
      var idx = 0, items = [], q = Promise.resolve();
      groups.forEach(function (grp) {
        q = q.then(function () {
          var cv = stitch(grp, spec);
          var lb = labels[idx] + (grp.length > 1 ? ' 외 ' + (grp.length - 1) + '개' : '');
          idx += grp.length;
          return toBlob(cv).then(function (b) {
            items.push({ url: cv.toDataURL('image/png'), blob: b, label: lb });
          });
        });
      });
      return q.then(function () { gallery(items, spec); });
    }).catch(function (e) {
      console.error('[저장 실패]', e);
      alert('이미지 생성 중 문제가 생겼습니다. 화면을 직접 캡처해 주세요.');
    }).then(function () {
      busy = false;
      if (btn) { btn.textContent = orig; btn.disabled = false; }
    });
  }

  /* ── VVIP 전용 : 저장 버튼 보장 + 로딩 문구 교정 ──────────── */

  /* 로딩 안내가 '1분 내외'로 되어 있는데, 문장이 기준에 못 미치면
     서버가 최대 3회까지 다시 씁니다. 실제로는 3분 넘게도 걸립니다.
     3만원짜리라 오래 걸리는 게 흠이 아니라 근거가 되도록 문구를 바꿉니다. */
  function fixVipLoading() {
    var host = $('#vip-data-loading');
    if (!host || host.dataset.asvTxt) return;
    var d = $('.vip-loading-desc', host);
    if (!d) return;
    host.dataset.asvTxt = '1';
    d.innerHTML = '실제 천체 궤도를 역산해 당신만의 리포트를 쓰고 있습니다.<br>' +
      '보통 <b style="color:#f0d77b">1~3분</b> 걸립니다. 화면을 끄지 마세요.<br>' +
      '<span style="color:#8e83a8;font-size:12px">문장이 기준에 못 미치면 다시 씁니다. ' +
      '그래서 시간이 걸립니다.</span>';
    d.style.lineHeight = '1.75';
    d.style.wordBreak = 'keep-all';
    d.style.maxWidth = '340px';
  }

  /* VVIP 강화 블록이 원래 버튼을 숨겼는데 자기 버튼을 못 만든 경우를 메꾼다 */
  function ensureVipBar() {
    var host = $('#astro-vip-result-container');
    if (!host) return null;
    var c1 = $('#out-vip-card1');
    if (!c1 || (c1.textContent || '').length < 50) return null;   // 아직 렌더 전

    var existing = $('#apx-main');
    if (existing) return existing;          // 강화 블록이 잘 만들었으면 그걸 쓴다
    if ($('#asv-bar')) return $('#asv-vipbtn');

    injectCSS();
    var bar = document.createElement('div');
    bar.id = 'asv-bar';
    bar.style.cssText = 'position:fixed;left:0;right:0;bottom:0;z-index:2147482500;' +
      'display:flex;flex-direction:column;align-items:center;gap:7px;' +
      'padding:13px 16px calc(13px + env(safe-area-inset-bottom));' +
      'background:linear-gradient(to top,rgba(5,3,8,.985) 55%,rgba(5,3,8,.7) 82%,rgba(5,3,8,0));';
    bar.innerHTML =
      '<button type="button" id="asv-vipbtn" style="width:100%;max-width:680px;border:none;' +
      'cursor:pointer;border-radius:14px;padding:17px 14px;color:#1a1206;' +
      'font:900 15.5px \'Noto Sans KR\',sans-serif;letter-spacing:-.045em;' +
      'background:linear-gradient(135deg,#f7e7a8,#e8c766 38%,#d4af37 72%,#b8912e);' +
      'box-shadow:0 10px 28px rgba(212,175,55,.3)">📸 리포트 이미지로 저장</button>' +
      '<div style="font:500 10.5px \'Noto Sans KR\',sans-serif;color:#7a7186">' +
      '저장한 이미지는 언제든 다시 볼 수 있습니다 · 무료</div>';
    document.body.appendChild(bar);
    console.log('[저장v2] VVIP 저장 버튼을 새로 만들었습니다');
    return $('#asv-vipbtn');
  }

  /* ── 기존 저장 버튼 가로채기 ─────────────────────────────── */
  function hook() {
    /* VVIP (11번) */
    if (document.body.classList.contains('is-vip')) {
      fixVipLoading();
      var b11 = ensureVipBar();
      if (b11 && !b11.dataset.asv) {
        b11.dataset.asv = '1';
        b11.onclick = function (e) { if (e) e.preventDefault(); run('11', b11); };
        window.saveVipReport = function () { run('11', b11); };
        console.log('[저장v2] VVIP 저장 버튼 교체 완료');
      }
    }
    /* 배우자 (9번) */
    var b9 = document.getElementById('btn-save-report');
    if (b9 && !b9.dataset.asv && $(SPECS['9'].root)) {
      b9.dataset.asv = '1';
      b9.removeAttribute('onclick');
      b9.onclick = function (e) { if (e) e.preventDefault(); run('9', b9); };
      window.saveAstroReport = function () { run('9', b9); };
      console.log('[저장v2] 배우자 저장 버튼 교체 완료');
    }
    /* 궁합 (15번) */
    var b15 = document.getElementById('cpr-save');
    if (b15 && !b15.dataset.asv && $(SPECS['15'].root)) {
      b15.dataset.asv = '1';
      b15.onclick = function (e) { if (e) e.preventDefault(); run('15', b15); };
      console.log('[저장v2] 궁합 저장 버튼 교체 완료');
    }
  }

  function boot() {
    hook();
    var n = 0;
    var iv = setInterval(function () {
      n++; hook();
      if (n > 120) clearInterval(iv);   // 2분이면 그만 본다
    }, 1000);
    if ('MutationObserver' in window) {
      new MutationObserver(hook).observe(document.body, { childList: true, subtree: true });
    }
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else setTimeout(boot, 500);
})();
