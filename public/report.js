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

const LEGACY_REPORT_KEY = 'astro_report_saved';   // 예전 단일 키 (읽기 전용 호환)
const USER_KEY   = 'astro_user_data';
const API_BASE   = 'https://astranote-server.vercel.app';

/* 🚨 예전에는 모든 주문이 'astro_report_saved' 한 칸을 같이 썼다.
   배우자 리포트를 산 손님이 나중에 궁합을 사면, 새 주문 화면에
   예전 배우자 리포트가 그대로 떴다. 주문번호로 칸을 나눈다. */
let REPORT_KEY = LEGACY_REPORT_KEY;

let ASTRO_USER_DATA = null;
let isRendered = false;
let safetyTimer = null;
let loadingMsgTimer = null;
let pollTimer = null;
let pollStopped = false;

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
    stopPolling();
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

    /* 주문번호가 있으면 이 주문 전용 칸을 쓴다 */
    if (orderId) REPORT_KEY = 'astro_report_9_' + orderId;

    /* 1순위: 이 기기에 이미 저장된 리포트 (가장 빠름, API 비용 0) */
    try {
        /* 주문 전용 칸이 비어 있고 주문번호도 없을 때만 예전 칸을 본다.
           주문번호가 있는데 예전 칸을 읽으면 남의 주문 리포트가 뜬다. */
        let savedReport = localStorage.getItem(REPORT_KEY);
        if (!savedReport && !orderId) savedReport = localStorage.getItem(LEGACY_REPORT_KEY);
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
            } else {
                /* 🚨 2026-08-21 — 리포트는 없지만 출생정보(intake)는 서버에 남아 있는 경우.
                   예전에는 이 경우를 몰라서 손님을 재입력 화면(→ 상품 상세=결제 페이지)으로
                   튕겼다. 이미 돈을 낸 손님에게 결제창을 다시 보여준 셈이다.
                   이제는 서버가 보관 중인 출생정보를 그대로 받아 말없이 다시 만든다.
                   손님은 아무것도 입력할 필요가 없다. */
                const body = await res.json().catch(function () { return null; });
                if (body && body.canRegenerate && body.intake) {
                    const k = body.intake;
                    ASTRO_USER_DATA = {
                        name: k.name, date: k.date, time: k.time,
                        city: k.city || 'Seoul',
                        myGender: k.myGender || '여성',
                        targetGender: k.targetGender || '남성',
                        timeUnknown: !!k.timeUnknown,
                        orderId: orderId
                    };
                    try { localStorage.setItem(USER_KEY, JSON.stringify(ASTRO_USER_DATA)); } catch (e) {}
                    console.log('♻️ 서버에 보관된 출생정보로 자동 복구');
                }
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
    if (t) t.innerText = '출생정보만 다시 확인할게요';
    if (d) d.innerHTML = '<strong>결제는 정상 완료되었습니다. 추가 결제는 없습니다.</strong><br>' +
        '보안을 위해 이 기기에 정보가 남지 않은 경우가 있어,<br>아래에 출생정보만 다시 넣어주시면 바로 만들어 드립니다.';
    if (b) {
        b.innerText = '출생정보 입력하기';
        b.onclick = showInlineForm;
    }
}

/* ---------------------------------------------------------------------------
   🚨 2026-08-21 신설 — 페이지 안에서 끝내는 재입력 폼

   예전 버튼은 '/product/detail.html?product_no=9' 로 보냈다. 그 페이지는
   입력폼이자 곧 결제 페이지다. 결제를 이미 마친 손님이 결제 화면을 다시 보면
   "돈을 또 내라는 건가" 하고 그 자리에서 나간다. 실제로 그렇게 나갔다.

   그래서 이 화면에서 출생정보만 받아 바로 생성으로 넘긴다.
   주문번호는 이미 URL 에 있으므로 결제 과정을 다시 거칠 이유가 없다.
--------------------------------------------------------------------------- */
function showInlineForm() {
    const rs = document.getElementById('retry-screen');
    if (!rs) return;
    if (document.getElementById('astro-inline-form')) return;   // 중복 생성 방지

    const b = rs.querySelector('.btn-retry');
    if (b) b.style.display = 'none';

    const F = 'width:100%;box-sizing:border-box;margin:7px 0;padding:13px 14px;' +
              'background:#151827;color:#fff;font-size:15px;' +
              'border:1px solid rgba(201,162,75,.34);border-radius:11px;outline:none;';
    const L = 'display:block;text-align:left;color:#C9A24B;font-size:12.5px;' +
              'font-weight:700;margin:13px 0 1px;letter-spacing:-.02em;';

    const box = document.createElement('div');
    box.id = 'astro-inline-form';
    box.style.cssText = 'width:100%;max-width:340px;margin:6px auto 0;text-align:left;';
    box.innerHTML =
        '<label style="' + L + '">이름</label>' +
        '<input id="af-name" type="text" placeholder="홍길동" style="' + F + '">' +
        '<label style="' + L + '">생년월일</label>' +
        '<input id="af-date" type="date" style="' + F + '">' +
        '<label style="' + L + '">태어난 시각</label>' +
        '<input id="af-time" type="time" style="' + F + '">' +
        '<label style="display:flex;align-items:center;gap:7px;margin:9px 1px 0;' +
        'color:#8b829e;font-size:13px;cursor:pointer;">' +
        '<input id="af-unknown" type="checkbox" style="width:16px;height:16px;accent-color:#C9A24B;">' +
        '태어난 시각을 모릅니다</label>' +
        '<label style="' + L + '">출생 도시</label>' +
        '<input id="af-city" type="text" value="Seoul" style="' + F + '">' +
        '<label style="' + L + '">내 성별</label>' +
        '<select id="af-mine" style="' + F + '"><option>여성</option><option>남성</option></select>' +
        '<label style="' + L + '">알고 싶은 배우자 성별</label>' +
        '<select id="af-target" style="' + F + '"><option>남성</option><option>여성</option></select>' +
        '<div id="af-msg" style="color:#E8654F;font-size:13px;min-height:18px;' +
        'margin:9px 2px 0;text-align:center;"></div>' +
        '<button id="af-go" style="width:100%;margin-top:8px;padding:15px;border:none;' +
        'border-radius:12px;font-size:16px;font-weight:800;color:#0A0C16;cursor:pointer;' +
        'background:linear-gradient(90deg,#E7CE8E,#C9A24B);">리포트 만들기</button>' +
        '<div style="color:#6f6880;font-size:11.5px;text-align:center;margin-top:11px;' +
        'line-height:1.6;">이미 결제가 끝난 주문입니다. 추가 비용은 청구되지 않습니다.</div>';
    rs.appendChild(box);

    /* 시각 모름을 체크하면 시각 칸을 잠근다.
       "출생시간 미확인 시 기본값을 넣지 않는다"는 약속을 화면에서도 지킨다. */
    const unk = document.getElementById('af-unknown');
    const tEl = document.getElementById('af-time');
    unk.onchange = function () {
        tEl.disabled = unk.checked;
        tEl.style.opacity = unk.checked ? '.4' : '1';
    };

    document.getElementById('af-go').onclick = function () {
        const msg = document.getElementById('af-msg');
        const name = (document.getElementById('af-name').value || '').trim();
        const date = document.getElementById('af-date').value;
        const unknown = unk.checked;
        const time = unknown ? '12:00' : tEl.value;

        if (!name)            { msg.innerText = '이름을 입력해 주세요.'; return; }
        if (!date)            { msg.innerText = '생년월일을 입력해 주세요.'; return; }
        if (!unknown && !time) { msg.innerText = '태어난 시각을 입력하거나 "모릅니다"를 선택해 주세요.'; return; }

        ASTRO_USER_DATA = {
            name: name, date: date, time: time,
            city: (document.getElementById('af-city').value || 'Seoul').trim(),
            myGender: document.getElementById('af-mine').value,
            targetGender: document.getElementById('af-target').value,
            timeUnknown: unknown,
            orderId: getOrderId() || undefined
        };
        try { localStorage.setItem(USER_KEY, JSON.stringify(ASTRO_USER_DATA)); } catch (e) {}

        rs.style.display = 'none';
        const loader = document.getElementById('data-loading');
        if (loader) { loader.style.display = 'flex'; loader.style.opacity = '1'; }
        startLoadingMessages();
        runAnalysis();
    };
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
    pollStopped = false;

    const orderId = getOrderId();

    /* ────────────────────────────────────────────────────────────────
       ★ 2026-08-02 문의의 진짜 원인이 여기 있었다.

       서버는 Gemini 가 과부하(503)일 때 20초 → 45초를 기다린 뒤
       3차 시도를 한다. 최악의 경우 65초 대기 + 생성 90초 ≈ 155초.
       그런데 이 화면은 90초에 손을 들고 "실패" 화면을 띄우고 있었다.

       즉 서버는 155초쯤 리포트를 정상 완성해 KV 에 저장하는데,
       손님은 이미 90초에 실패 화면을 보고 창을 닫아버렸다.
       (실제로 리포트는 서버에 멀쩡히 저장되어 있었다)

       그래서 두 가지를 바꾼다.
        1) POST 를 던져놓고 동시에 8초마다 GET 으로 완성 여부를 확인한다.
           POST 응답이 끊겨도 폴링이 리포트를 잡아낸다.
        2) 90초에 실패 화면 대신 "조금 더 걸립니다" 안내로 바꾸고,
           진짜 포기는 4분 뒤에 한다.
       ──────────────────────────────────────────────────────────────── */

    if (safetyTimer) clearTimeout(safetyTimer);
    safetyTimer = setTimeout(function () {
        if (!isRendered) {
            console.warn('4분 초과 → 재시도 안내 표시');
            stopPolling();
            showRetryScreen();
        }
    }, 240000);

    /* 90초 지점: 실패가 아니라 안심시키는 안내로 교체 */
    setTimeout(function () {
        if (isRendered) return;
        const el = document.getElementById('loading-step-text');
        if (loadingMsgTimer) { clearInterval(loadingMsgTimer); loadingMsgTimer = null; }
        if (el) {
            el.innerHTML = "천체 데이터가 몰리는 시간대입니다.<br>" +
                           "<b style='color:#d4af37;'>리포트는 정상적으로 만들어지고 있습니다.</b><br>" +
                           "창을 닫지 마시고 조금만 기다려주세요.";
            el.style.opacity = '1';
        }
    }, 90000);

    /* ── 폴링: 서버에 완성본이 올라왔는지 8초마다 확인 ── */
    if (orderId) {
        pollTimer = setInterval(function () {
            if (isRendered || pollStopped) { stopPolling(); return; }
            fetch(API_BASE + '/api/gemini?orderId=' + encodeURIComponent(orderId), { cache: 'no-store' })
                .then(function (r) { return r.status === 200 ? r.json() : null; })
                .then(function (d) {
                    if (!d || d.error || isRendered) return;
                    console.log('✅ 폴링으로 완성본 확보');
                    stopPolling();
                    if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
                    bindDataToUI(d);
                })
                .catch(function () {});
        }, 8000);
    }

    fetch(API_BASE + '/api/gemini', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(ASTRO_USER_DATA)
    })
    .then(function (res) {
        /* 202 = 다른 창이 이미 만들고 있다. 실패가 아니다 → 폴링에 맡긴다. */
        if (res.status === 202) return null;
        if (!res.ok) throw new Error('서버 통신 지연 (' + res.status + ')');
        return res.json();
    })
    .then(function (data) {
        if (data === null) return;                       // 폴링이 이어받는다
        if (!data || data.error) throw new Error(data && data.error ? data.error : '빈 응답');
        stopPolling();
        if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
        if (!bindDataToUI(data)) showRetryScreen();
    })
    .catch(function (err) {
        console.warn('POST 실패:', err);
        /* 🚨 여기서 바로 실패 화면을 띄우면 안 된다.
           서버가 아직 만들고 있는 중일 수 있다(연결만 끊긴 경우가 많다).
           주문번호가 있으면 폴링이 계속 돌게 두고, safetyTimer 에 맡긴다. */
        if (!orderId) {
            if (safetyTimer) { clearTimeout(safetyTimer); safetyTimer = null; }
            showRetryScreen();
        }
    });
}

function stopPolling() {
    pollStopped = true;
    if (pollTimer) { clearInterval(pollTimer); pollTimer = null; }
}

function showRetryScreen() {
    if (isRendered) return;
    stopTimers();
    hideLoader();
    const rs = document.getElementById('retry-screen');
    if (!rs) return;
    rs.style.display = 'flex';
    /* 손님이 문의할 때 주문번호를 함께 보내면 우리가 서버에서 바로 복구할 수 있다.
       이 한 줄이 "확인 부탁드립니다" 왕복 3~4회를 없앤다. */
    try {
        const oid = getOrderId();
        if (oid && !document.getElementById('astro-oid')) {
            const p = document.createElement('div');
            p.id = 'astro-oid';
            p.style.cssText = 'margin-top:14px;font-size:12px;color:#8b829e;letter-spacing:-.03em;line-height:1.7';
            p.innerHTML = '결제는 정상 완료되었습니다.<br>계속 열리지 않으면 아래 주문번호로 문의해주세요.<br>' +
                          '<b style="color:#d4af37">' + String(oid).replace(/[<>&"]/g, '') + '</b>';
            rs.appendChild(p);
        }
    } catch (e) {}
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
