/* ============================================================================
   ASTRANOTE report.js  —  v2.0 (FIX #1: 재방문 무한로딩 차단)
   ----------------------------------------------------------------------------
   [이번에 고친 것]
   1) ASTRO_USER_DATA를 DOMContentLoaded 최상단에서 먼저 확보
      → bindDataToUI 안의 ASTRO_USER_DATA.name TypeError 원천 제거
   2) isRendered = true 를 "렌더 성공 후"로 이동 + 실패 시 false 롤백
      → 한 번 실패해도 KV조회 / 재생성 / 재시도화면 경로가 전부 살아있음
   3) 저장본에 _meta.name 동봉
      → 재방문해도 "ANALYSIS FOR 고객"이 아니라 실제 이름이 나옴
   4) DOM 주입을 setText/setHTML 안전 헬퍼로 교체
      → 요소 하나가 없어도 리포트 전체가 죽지 않음
   5) 어떤 경로로 실패하든 스피너는 반드시 내려감 (영구 로딩 불가능)

   ⚠️ 다음 작업(FIX #2)에서 저장 키를 상품별/주문별로 쪼갭니다.
      지금은 기존 키(astro_report_saved)를 그대로 유지 — 호환성 우선.
   ========================================================================== */

const REPORT_KEY = 'astro_report_saved';
const USER_KEY   = 'astro_user_data';
const API_BASE   = 'https://astranote-server.vercel.app';

let ASTRO_USER_DATA = null;
let isRendered = false;
let safetyTimer = null;
let loadingMsgTimer = null;

/* ---------------------------------------------------------------------------
   유틸: 안전 DOM 주입 (요소가 없어도 예외를 던지지 않음)
--------------------------------------------------------------------------- */
function setText(id, txt) {
    const el = document.getElementById(id);
    if (el) { el.innerText = txt; return true; }
    console.warn('[DOM] 요소 없음:', id);
    return false;
}
function setHTML(id, html) {
    const el = document.getElementById(id);
    if (el) { el.innerHTML = html; return true; }
    console.warn('[DOM] 요소 없음:', id);
    return false;
}
function hideLoader() {
    const loader = document.getElementById('data-loading');
    if (!loader) return;
    loader.style.opacity = '0';
    setTimeout(function () { loader.style.display = 'none'; }, 500);
}
function stopTimers() {
    if (loadingMsgTimer) { clearInterval(loadingMsgTimer); loadingMsgTimer = null; }
    if (safetyTimer)     { clearTimeout(safetyTimer);      safetyTimer = null; }
}

/* ---------------------------------------------------------------------------
   출생정보 로드 (localStorage → 쿠키 → URL 파라미터)
--------------------------------------------------------------------------- */
function loadUserData() {
    try {
        const s = localStorage.getItem(USER_KEY);
        if (s) { const d = JSON.parse(s); if (d && d.name && d.date && d.time) return d; }
    } catch (e) {}
    try {
        const m = document.cookie.match(new RegExp('(^| )astro_user_data=([^;]+)'));
        if (m) {
            const d = JSON.parse(decodeURIComponent(m[2]));
            if (d && d.name && d.date && d.time) return d;
        }
    } catch (e) {}
    try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('name') && p.get('date') && p.get('time')) {
            return {
                name: p.get('name'),
                date: p.get('date'),
                time: p.get('time'),
                city: p.get('city') || 'Seoul',
                myGender: p.get('myGender') || '여성',
                targetGender: p.get('targetGender') || '남성',
                productNo: p.get('productNo') || '9'
            };
        }
    } catch (e) {}
    return null;
}

/* 카페24가 URL에 심어주는 주문번호 */
function getOrderId() {
    try {
        const p = new URLSearchParams(window.location.search);
        return p.get('order_id') || null;
    } catch (e) { return null; }
}

/* ---------------------------------------------------------------------------
   ★ FIX #1 핵심: 이름을 어떤 경로로든 안전하게 확보
   우선순위 → 현재 세션 → 저장본에 동봉된 이름 → localStorage → URL → '고객'
--------------------------------------------------------------------------- */
function resolveUserName(data) {
    try { if (ASTRO_USER_DATA && ASTRO_USER_DATA.name) return ASTRO_USER_DATA.name; } catch (e) {}
    try { if (data && data._meta && data._meta.name) return data._meta.name; } catch (e) {}
    try {
        const s = localStorage.getItem(USER_KEY);
        if (s) { const d = JSON.parse(s); if (d && d.name) return d.name; }
    } catch (e) {}
    try {
        const p = new URLSearchParams(window.location.search);
        if (p.get('name')) return p.get('name');
    } catch (e) {}
    return '고객';
}

/* ---------------------------------------------------------------------------
   진입점
--------------------------------------------------------------------------- */
document.addEventListener('DOMContentLoaded', async function () {

    // ★ 무조건 가장 먼저 확보한다. 이 한 줄이 무한로딩의 근본 원인이었다.
    ASTRO_USER_DATA = loadUserData();

    const orderId = getOrderId();
    if (orderId && ASTRO_USER_DATA) ASTRO_USER_DATA.orderId = orderId;

    /* 1순위: 이 기기에 이미 저장된 리포트 (가장 빠름, API 비용 0) */
    try {
        const savedReport = localStorage.getItem(REPORT_KEY);
        if (savedReport) {
            const parsed = JSON.parse(savedReport);
            if (bindDataToUI(parsed)) return;          // 성공했을 때만 종료
            // 렌더 실패한 저장본만 폐기하고 아래 경로로 계속 진행
            localStorage.removeItem(REPORT_KEY);
            isRendered = false;
        }
    } catch (e) {
        console.warn('저장본 손상 → 폐기:', e);
        try { localStorage.removeItem(REPORT_KEY); } catch (e2) {}
        isRendered = false;
    }

    /* 2순위: 주문번호로 서버(KV)에 저장된 리포트 조회
       → 다른 기기/재접속이어도 카페24 주문내역에서 들어오면 다시 보인다 */
    if (orderId) {
        try {
            const res = await fetch(API_BASE + '/api/gemini?orderId=' + encodeURIComponent(orderId));
            if (res.ok) {
                const data = await res.json();
                if (data && !data.error && bindDataToUI(data)) return;
            }
        } catch (e) {
            console.warn('KV 조회 실패 → 신규 생성으로 진행:', e);
        }
        isRendered = false;
    }

    /* 3순위: 저장된 게 전혀 없으면 새로 생성 (최초 결제 직후) */
    if (!ASTRO_USER_DATA) {
        showNoDataScreen();
        return;
    }

    startLoadingMessages();
    runAnalysis();
});

/* 출생정보 자체가 없을 때 안내 화면 */
function showNoDataScreen() {
    stopTimers();
    hideLoader();
    const rs = document.getElementById('retry-screen');
    if (!rs) return;
    rs.style.display = 'flex';
    const t = rs.querySelector('.retry-title');
    const d = rs.querySelector('.retry-desc');
    const b = rs.querySelector('.btn-retry');
    if (t) t.innerText = '리포트 정보를 불러오지 못했어요';
    if (d) d.innerHTML = '결제는 정상 완료되었으니 안심하세요.<br>보안을 위해 정보가 저장되지 않은 경우가 있어,<br>아래 버튼을 눌러 <strong>정보를 다시 입력</strong>하시면<br>리포트를 바로 받아보실 수 있습니다.';
    if (b) {
        b.innerText = '정보 다시 입력하기';
        b.onclick = function () { location.href = '/product/detail.html?product_no=9'; };
    }
}

/* ---------------------------------------------------------------------------
   로딩 메시지 로테이션
--------------------------------------------------------------------------- */
function startLoadingMessages() {
    const steps = [
        "천체 궤도 데이터를<br>정밀하게 정렬하고 있습니다.",
        "당신의 <b style='color:#d4af37;'>7하우스(결혼의 방)</b>를<br>깊이 해독하고 있습니다.",
        "운명의 상대의 얼굴과<br>분위기를 그려내고 있습니다.",
        "두 사람이 만날 시기를<br>계산하고 있습니다.",
        "당신만의 1:1 리포트를<br>한 땀 한 땀 집필하고 있습니다."
    ];
    let i = 0;
    const el = document.getElementById('loading-step-text');
    if (!el) return;
    if (loadingMsgTimer) clearInterval(loadingMsgTimer);
    loadingMsgTimer = setInterval(function () {
        i = (i + 1) % steps.length;
        el.style.opacity = '0';
        setTimeout(function () { el.innerHTML = steps[i]; el.style.opacity = '1'; }, 400);
    }, 4000);
}

/* ---------------------------------------------------------------------------
   리포트 생성 요청
--------------------------------------------------------------------------- */
function runAnalysis() {
    isRendered = false;

    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(function () {
        if (!isRendered) {
            console.warn('서버 타임아웃 → 재시도 안내 표시');
            showRetryScreen();
        }
    }, 90000);   // 리포트 생성은 1~2분 걸릴 수 있어 90초로 여유를 둠

    fetch(API_BASE + '/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ASTRO_USER_DATA)
    })
    .then(function (res) {
        if (!res.ok) throw new Error('서버 통신 지연 (' + res.status + ')');
        return res.json();
    })
    .then(function (data) {
        if (!data || data.error) throw new Error(data && data.error ? data.error : '빈 응답');
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        if (!bindDataToUI(data)) showRetryScreen();
    })
    .catch(function (err) {
        console.warn('API 실패:', err);
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        showRetryScreen();
    });
}

function showRetryScreen() {
    if (isRendered) return;
    stopTimers();
    hideLoader();
    const rs = document.getElementById('retry-screen');
    if (rs) rs.style.display = 'flex';
}

function retryAnalysis() {
    const rs = document.getElementById('retry-screen');
    if (rs) rs.style.display = 'none';

    const loader = document.getElementById('data-loading');
    if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }

    // 정보 자체가 없어서 실패했던 경우 한 번 더 복구 시도
    if (!ASTRO_USER_DATA) ASTRO_USER_DATA = loadUserData();
    if (!ASTRO_USER_DATA) { showNoDataScreen(); return; }

    startLoadingMessages();
    runAnalysis();
}

/* ---------------------------------------------------------------------------
   ★ 렌더링 — 성공하면 true, 실패하면 false 를 돌려준다
--------------------------------------------------------------------------- */
function bindDataToUI(data) {
    if (isRendered) return true;
    if (!data || typeof data !== 'object' || data.error) return false;

    stopTimers();

    try {
        const userName = resolveUserName(data);

        /* 저장본에 이름을 함께 남긴다 → 재방문 시 이름 복원 가능 */
        try {
            const toSave = Object.assign({}, data, {
                _meta: { name: userName, savedAt: Date.now(), v: 2 }
            });
            localStorage.setItem(REPORT_KEY, JSON.stringify(toSave));
        } catch (e) {
            console.warn('저장 실패(용량 초과 가능) — 렌더는 계속:', e);
        }

        setText('user-name-tag', 'ANALYSIS FOR ' + String(userName).toUpperCase());

        setHTML('out-card1-summary',
            '당신의 운명의 반려자를 한 마디로 표현한다면<br>' +
            '<span class="highlight">" ' + (data.card1_title || '아직 밝혀지지 않은 인연') + ' "</span><br>' +
            '입니다.');

        setText('out-sym1-icon', data.guardian_symbol_1 || '✨');
        setText('out-sym1-name', data.guardian_name_1 || '빛');
        setText('out-sym2-icon', data.guardian_symbol_2 || '✨');
        setText('out-sym2-name', data.guardian_name_2 || '별');
        setText('out-sym3-icon', data.guardian_symbol_3 || '✨');
        setText('out-sym3-name', data.guardian_name_3 || '달');

        setHTML('out-card2-analysis',  data.card2_analysis      || '데이터가 부족합니다.');
        setHTML('out-card3-appearance', data.card3_appearance   || '데이터가 부족합니다.');
        setHTML('out-card4-career',    data.card4_career        || '데이터가 부족합니다.');
        setHTML('out-card5-timing',    data.card5_timing        || '데이터가 부족합니다.');
        setHTML('out-card6-chemistry', data.card6_chemistry     || '데이터가 부족합니다.');
        setHTML('out-card7-guide',     data.card7_destiny_guide || '데이터가 부족합니다.');
        setHTML('out-card8-teaser',    data.card8_teaser        || '당신의 차트에는 아직 풀리지 않은 깊은 이야기가 남아 있습니다.');

        // ★ 여기까지 무사히 왔을 때만 렌더 완료로 확정
        isRendered = true;

        hideLoader();
        setTimeout(startScrollAnimation, 500);
        return true;

    } catch (err) {
        console.error('[bindDataToUI] 렌더 실패:', err);
        isRendered = false;   // ★ 롤백 — 다른 복구 경로를 살려둔다
        return false;
    }
}

/* ---------------------------------------------------------------------------
   스크롤 애니메이션
--------------------------------------------------------------------------- */
function startScrollAnimation() {
    try {
        const cards = document.querySelectorAll('.report-card');
        cards.forEach(function (card, idx) {
            setTimeout(function () { card.classList.add('show'); }, idx * 250);
        });

        if ('IntersectionObserver' in window) {
            const observer = new IntersectionObserver(function (entries) {
                entries.forEach(function (entry) {
                    if (entry.isIntersecting) entry.target.classList.add('show');
                });
            }, { threshold: 0.1 });
            cards.forEach(function (card) { observer.observe(card); });

            const upsell = document.getElementById('upsell-gate');
            if (upsell) {
                const upsellObserver = new IntersectionObserver(function (entries) {
                    if (entries[0].isIntersecting) upsell.classList.add('reveal');
                }, { threshold: 0.2 });
                upsellObserver.observe(upsell);
            }
        } else {
            cards.forEach(function (c) { c.classList.add('show'); });
            const upsell = document.getElementById('upsell-gate');
            if (upsell) upsell.classList.add('reveal');
        }
    } catch (e) {
        console.warn('애니메이션 스킵:', e);
        document.querySelectorAll('.report-card').forEach(function (c) { c.classList.add('show'); });
    }
}

/* ---------------------------------------------------------------------------
   이미지 저장
--------------------------------------------------------------------------- */
function saveAstroReport() {
    const btn = document.getElementById('btn-save-report');
    const target = document.getElementById('astro-result-container');
    if (!target) return;
    if (typeof html2canvas !== 'function') {
        alert('저장 기능을 불러오는 중입니다. 잠시 후 다시 눌러주세요.');
        return;
    }

    const originalText = btn ? btn.innerText : '';
    if (btn) { btn.innerText = '⏳ 운명의 기록 추출 중...'; btn.disabled = true; }

    function restore() {
        if (btn) { btn.innerText = originalText; btn.disabled = false; }
    }

    html2canvas(target, {
        backgroundColor: '#050505', scale: 2, useCORS: true, allowTaint: true, letterRendering: true,
        onclone: function (clonedDoc) {
            const c = clonedDoc.getElementById('astro-result-container');
            if (c) c.style.fontFamily = "'Noto Serif KR', serif";
            clonedDoc.querySelectorAll('.report-card').forEach(function (el) {
                el.style.opacity = '1'; el.style.transform = 'none';
            });
            const up = clonedDoc.getElementById('upsell-gate');
            if (up) { up.style.opacity = '1'; up.style.transform = 'none'; }
            const captureSec = clonedDoc.querySelector('.capture-section');
            if (captureSec) captureSec.style.display = 'none';
        }
    }).then(function (canvas) {
        const imgData = canvas.toDataURL('image/png');
        if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
            const newTab = window.open();
            if (newTab) {
                const wrapStyle = 'background:#050505; color:#d4af37; text-align:center; padding:20px; font-family:sans-serif;';
                newTab.document.write(
                    '<div style="' + wrapStyle + '">' +
                    '<p>이미지를 꾹 눌러서 저장하세요!</p>' +
                    '<img src="' + imgData + '" style="width:100%; border-radius:10px;" />' +
                    '</' + 'div>'
                );
            } else {
                alert('팝업이 차단되었습니다. 화면을 직접 캡처해 주세요.');
            }
        } else {
            const link = document.createElement('a');
            link.download = '운명리포트.png';
            link.href = imgData;
            link.click();
        }
        restore();
    }).catch(function (err) {
        console.error('이미지 저장 실패:', err);
        alert('이미지 저장 중 오류가 발생했습니다. 직접 캡처해 주세요.');
        restore();
    });
}
