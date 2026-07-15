let ASTRO_USER_DATA = null;
    let isRendered = false;
    let safetyTimer = null;

    function loadUserData() {
        // 1순위: localStorage
        try {
            const s = localStorage.getItem('astro_user_data');
            if (s) { const d = JSON.parse(s); if (d && d.name && d.date && d.time) return d; }
        } catch(e) {}
        // 2순위: 쿠키
        try {
            const m = document.cookie.match(new RegExp('(^| )astro_user_data=([^;]+)'));
            if (m) { const d = JSON.parse(decodeURIComponent(m[2])); if (d && d.name && d.date && d.time) return d; }
        } catch(e) {}
        // 3순위: URL 파라미터 (?name=..&date=..&time=..&city=..)
        try {
            const p = new URLSearchParams(window.location.search);
            if (p.get('name') && p.get('date') && p.get('time')) {
                return {
                    name: p.get('name'), date: p.get('date'), time: p.get('time'),
                    city: p.get('city') || 'Seoul',
                    myGender: p.get('myGender') || '여성',
                    targetGender: p.get('targetGender') || '남성',
                    productNo: p.get('productNo') || '9'
                };
            }
        } catch(e) {}
        return null;
    }

    // 🚨 [다시보기 핵심] 카페24가 URL에 심어주는 주문번호를 추출
    function getOrderId() {
        try {
            const p = new URLSearchParams(window.location.search);
            return p.get('order_id') || null;
        } catch(e) { return null; }
    }

    document.addEventListener('DOMContentLoaded', async function() {
        // 1순위: 이 기기에 이미 생성된 리포트가 저장돼 있으면 즉시 표시 (가장 빠름)
        const savedReport = localStorage.getItem('astro_report_saved');
        if (savedReport) {
            try { bindDataToUI(JSON.parse(savedReport)); return; }
            catch(e) { localStorage.removeItem('astro_report_saved'); }
        }

        const orderId = getOrderId();

        // 2순위: 다른 기기/재접속이어도, 주문번호로 서버(KV)에 저장된 리포트 조회
        // → 회원/비회원 상관없이, 카페24 주문내역에서 이 페이지로 돌아오기만 하면 다시 보인다
        if (orderId) {
            try {
                const res = await fetch(`https://astranote-server.vercel.app/api/gemini?orderId=${encodeURIComponent(orderId)}`);
                if (res.ok) {
                    const data = await res.json();
                    if (data && !data.error) {
                        ASTRO_USER_DATA = ASTRO_USER_DATA || { name: (data.card1_title ? '고객' : '고객') };
                        bindDataToUI(data);
                        return;
                    }
                }
            } catch(e) { console.warn('KV 조회 실패, 신규 생성으로 진행:', e); }
        }

        // 3순위: 저장된 리포트가 전혀 없으면 새로 생성 (최초 결제 직후 상황)
        ASTRO_USER_DATA = loadUserData();

        // 🚨 정보가 정말 없으면 흰 화면 대신 안내 화면 표시 (400 방지)
        if (!ASTRO_USER_DATA) {
            document.getElementById('data-loading').style.display = 'none';
            const rs = document.getElementById('retry-screen');
            rs.style.display = 'flex';
            rs.querySelector('.retry-title').innerText = '리포트 정보를 불러오지 못했어요';
            rs.querySelector('.retry-desc').innerHTML = '결제는 정상 완료되었으니 안심하세요.<br>보안을 위해 정보가 저장되지 않은 경우가 있어,<br>아래 버튼을 눌러 <strong>정보를 다시 입력</strong>하시면<br>리포트를 바로 받아보실 수 있습니다.';
            const btn = rs.querySelector('.btn-retry');
            btn.innerText = '정보 다시 입력하기';
            btn.onclick = function(){ location.href = '/product/detail.html?product_no=9'; };
            return;
        }

        // 서버에 보낼 때 주문번호도 함께 실어서, 생성 후 KV에 저장되게 한다
        if (orderId) ASTRO_USER_DATA.orderId = orderId;

        startLoadingMessages();
        runAnalysis();
    });

    let loadingMsgTimer = null;
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
        loadingMsgTimer = setInterval(() => {
            i = (i + 1) % steps.length;
            if (el) {
                el.style.opacity = '0';
                setTimeout(() => { el.innerHTML = steps[i]; el.style.opacity = '1'; }, 400);
            }
        }, 4000);
    }

    function runAnalysis() {
        isRendered = false;

        // 280초 내 응답 없으면 재시도 화면 표시 (긴 리포트 생성 대비)
        safetyTimer = setTimeout(() => {
            if (!isRendered) {
                console.warn("서버 타임아웃 → 재시도 안내 표시");
                showRetryScreen();
            }
        }, 290000);

        fetch('https://astranote-server.vercel.app/api/gemini', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(ASTRO_USER_DATA)
        })
        .then(res => {
            if (!res.ok) throw new Error("서버 통신 지연");
            return res.json();
        })
        .then(data => {
            if (data.error) throw new Error(data.error);
            clearTimeout(safetyTimer);
            bindDataToUI(data);
        })
        .catch(err => {
            console.warn("API 실패:", err);
            clearTimeout(safetyTimer);
            showRetryScreen();
        });
    }

    function showRetryScreen() {
        if (isRendered) return;
        if (loadingMsgTimer) clearInterval(loadingMsgTimer);
        document.getElementById('data-loading').style.display = 'none';
        document.getElementById('retry-screen').style.display = 'flex';
    }

    function retryAnalysis() {
        document.getElementById('retry-screen').style.display = 'none';
        const loader = document.getElementById('data-loading');
        loader.style.display = 'flex';
        loader.style.opacity = '1';
        startLoadingMessages();
        runAnalysis();
    }

    function bindDataToUI(data) {
        if (isRendered) return;
        isRendered = true;
        if (loadingMsgTimer) clearInterval(loadingMsgTimer);

        // 🚨 리포트를 손님 기기에 영구 저장 (튕겨도 재접속하면 다시 보임)
        try { localStorage.setItem('astro_report_saved', JSON.stringify(data)); } catch(e) {}

        document.getElementById('user-name-tag').innerText = `ANALYSIS FOR ${ASTRO_USER_DATA.name.toUpperCase()}`;
        document.getElementById('out-card1-summary').innerHTML = `당신의 운명의 반려자를 한 마디로 표현한다면<br><span class="highlight">" ${data.card1_title} "</span><br>입니다.`;
        document.getElementById('out-sym1-icon').innerText = data.guardian_symbol_1 || "✨";
        document.getElementById('out-sym1-name').innerText = data.guardian_name_1 || "빛";
        document.getElementById('out-sym2-icon').innerText = data.guardian_symbol_2 || "✨";
        document.getElementById('out-sym2-name').innerText = data.guardian_name_2 || "별";
        document.getElementById('out-sym3-icon').innerText = data.guardian_symbol_3 || "✨";
        document.getElementById('out-sym3-name').innerText = data.guardian_name_3 || "달";

        document.getElementById('out-card2-analysis').innerHTML = data.card2_analysis || "데이터가 부족합니다.";
        document.getElementById('out-card3-appearance').innerHTML = data.card3_appearance || "데이터가 부족합니다.";
        document.getElementById('out-card4-career').innerHTML = data.card4_career || "데이터가 부족합니다.";
        document.getElementById('out-card5-timing').innerHTML = data.card5_timing || "데이터가 부족합니다.";
        document.getElementById('out-card6-chemistry').innerHTML = data.card6_chemistry || "데이터가 부족합니다.";
        document.getElementById('out-card7-guide').innerHTML = data.card7_destiny_guide || "데이터가 부족합니다.";
        document.getElementById('out-card8-teaser').innerHTML = data.card8_teaser || "당신의 차트에는 아직 풀리지 않은 깊은 이야기가 남아 있습니다.";

        const loader = document.getElementById('data-loading');
        loader.style.opacity = '0';
        setTimeout(() => {
            loader.style.display = 'none';
            startScrollAnimation();
        }, 500);
    }

    function startScrollAnimation() {
        const cards = document.querySelectorAll('.report-card');
        cards.forEach((card, idx) => {
            setTimeout(() => card.classList.add('show'), idx * 250);
        });

        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting) entry.target.classList.add('show');
            });
        }, { threshold: 0.1 });
        cards.forEach(card => observer.observe(card));

        const upsell = document.getElementById('upsell-gate');
        const upsellObserver = new IntersectionObserver((entries) => {
            if (entries[0].isIntersecting) upsell.classList.add('reveal');
        }, { threshold: 0.2 });
        upsellObserver.observe(upsell);
    }

    function saveAstroReport() {
        const btn = document.getElementById('btn-save-report');
        const target = document.getElementById('astro-result-container');
        const originalText = btn.innerText;
        btn.innerText = "⏳ 운명의 기록 추출 중...";
        btn.disabled = true;

        html2canvas(target, {
            backgroundColor: "#050505", scale: 2, useCORS: true, allowTaint: true, letterRendering: true,
            onclone: (clonedDoc) => {
                clonedDoc.getElementById('astro-result-container').style.fontFamily = "'Noto Serif KR', serif";
                clonedDoc.querySelectorAll('.report-card').forEach(c => { c.style.opacity = '1'; c.style.transform = 'none'; });
                clonedDoc.getElementById('upsell-gate').style.opacity = '1';
                clonedDoc.getElementById('upsell-gate').style.transform = 'none';
                const captureSec = clonedDoc.querySelector('.capture-section');
                if(captureSec) captureSec.style.display = 'none';
            }
        }).then(canvas => {
            const imgData = canvas.toDataURL("image/png");
            if (/iPhone|iPad|iPod|Android/i.test(navigator.userAgent)) {
                const newTab = window.open();
                var wrapStyle = "background:#050505; color:#d4af37; text-align:center; padding:20px; font-family:sans-serif;";
                var html = '<div style="' + wrapStyle + '">'
                    + '<p>이미지를 꾹 눌러서 저장하세요!</p>'
                    + '<img src="' + imgData + '" style="width:100%; border-radius:10px;" />'
                    + '</' + 'div>';
                newTab.document.write(html);
            } else {
                const link = document.createElement('a');
                link.download = `운명리포트.png`;
                link.href = imgData;
                link.click();
            }
            btn.innerText = originalText;
            btn.disabled = false;
        }).catch(err => {
            alert("이미지 저장 중 오류가 발생했습니다. 직접 캡처해 주세요.");
            btn.innerText = originalText;
            btn.disabled = false;
        });
    }
