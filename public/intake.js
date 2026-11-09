/* ============================================================================
   ASTRANOTE — 상품 상세페이지 출생정보 입력폼 + 구매 게이트
               (재회운 16 · 신년운세 18)
   ----------------------------------------------------------------------------
   ▣ 배포 위치 : public/intake.js
   ▣ 카페24 상품 상세 스킨(product/detail.html) 맨 아래 한 줄:
        script src="https://astranote-server.vercel.app/intake.js"  (태그로 감싸서)
     16·18번 상품 페이지에서만 폼이 뜹니다. 다른 상품 영향 0.

   ▣ 하는 일
     1) 구매 버튼 바로 위에 입력폼을 띄운다
        (상세설명 안에 <div id="astro-intake"></div> 가 있으면 그 자리에 띄운다)
     2) 입력이 끝나기 전에는 구매하기·장바구니·네이버페이 버튼을 막는다
        → "결제했는데 정보를 안 넣어서 리포트가 안 나와요" 문의를 원천 차단
     3) localStorage 에 저장 → 결제 후 결과화면(reunion.js / newyear.js)이 읽는다

   ▣ 결과화면에서도 씁니다
     다른 기기·인앱 브라우저로 결과화면이 열려 입력값이 없을 때,
     결과화면이 이 파일을 불러와 같은 폼을 화면 안에 띄웁니다. (재결제 오해 방지)
        window.AstroIntake.mountInto(element, '16', function (data) { ... })

   ▣ 저장 계약 (결과화면·서버가 기대하는 모양)
     astro_reunion_data = { productNo:'16', me:{...}, ex:{...}, stage, initiator, contact, savedAt }
     astro_newyear_data = { productNo:'18', me:{...}, status, focus, savedAt }
     사람 = { name, date:'YYYY-MM-DD', time:'HH:MM'|'', timeUnknown, city:'Seoul', gender:'여성'|'남성' }
   ============================================================================ */
(function () {
  'use strict';
  if (window.AstroIntake) return;

  var REUNION_NO = '16';
  var NEWYEAR_NO = '18';   /* 카페24에서 신년운세 번호가 다르게 나오면 여기 한 줄 */
  var KEYS = { '16': 'astro_reunion_data', '18': 'astro_newyear_data' };

  /* ── 출생지 (lib/cities.js 의 키와 1:1) ─────────────────── */
  var REGIONS = [
    ['서울', 'Seoul:서울'], ['인천', 'Incheon:인천'],
    ['경기', 'Suwon:수원,Seongnam:성남,Goyang:고양,Yongin:용인,Bucheon:부천,Ansan:안산,Anyang:안양,Namyangju:남양주,Hwaseong:화성,Pyeongtaek:평택,Uijeongbu:의정부,Siheung:시흥,Paju:파주,Gwangmyeong:광명,Gimpo:김포,Gunpo:군포,Osan:오산,Icheon:이천,Yangju:양주,Guri:구리,Anseong:안성,Pocheon:포천,Uiwang:의왕,Hanam:하남,Yeoju:여주,Dongducheon:동두천,Gwacheon:과천,Gapyeong:가평,Yangpyeong:양평,Yeoncheon:연천,GyeonggiEtc:그 외 경기'],
    ['강원', 'Chuncheon:춘천,Wonju:원주,Gangneung:강릉,Sokcho:속초,Donghae:동해,Taebaek:태백,Samcheok:삼척,Hongcheon:홍천,Cheorwon:철원,Jeongseon:정선,Yeongwol:영월,Pyeongchang:평창,GangwonEtc:그 외 강원'],
    ['충북', 'Cheongju:청주,Chungju:충주,Jecheon:제천,Eumseong:음성,Jincheon:진천,Okcheon:옥천,Yeongdong:영동,ChungbukEtc:그 외 충북'],
    ['대전', 'Daejeon:대전'], ['세종', 'Sejong:세종'],
    ['충남', 'Cheonan:천안,Asan:아산,Seosan:서산,Dangjin:당진,Nonsan:논산,Gongju:공주,Boryeong:보령,Buyeo:부여,Hongseong:홍성,Taean:태안,Geumsan:금산,ChungnamEtc:그 외 충남'],
    ['전북', 'Jeonju:전주,Iksan:익산,Gunsan:군산,Jeongeup:정읍,Namwon:남원,Gimje:김제,Wanju:완주,Gochang:고창,Buan:부안,Imsil:임실,Sunchang:순창,Jinan:진안,Muju:무주,Jangsu:장수,JeonbukEtc:그 외 전북'],
    ['광주', 'Gwangju:광주'],
    ['전남', 'Yeosu:여수,Suncheon:순천,Mokpo:목포,Naju:나주,Gwangyang:광양,Damyang:담양,Goheung:고흥,Boseong:보성,Hwasun:화순,Jangheung:장흥,Gangjin:강진,Haenam:해남,Yeongam:영암,Muan:무안,Hampyeong:함평,Yeonggwang:영광,Jangseong:장성,Wando:완도,Jindo:진도,Sinan:신안,Gokseong:곡성,Gurye:구례,JeonnamEtc:그 외 전남'],
    ['대구', 'Daegu:대구'],
    ['경북', 'Pohang:포항,Gumi:구미,Gyeongju:경주,Andong:안동,Gimcheon:김천,Yeongju:영주,Yeongcheon:영천,Sangju:상주,Mungyeong:문경,Gyeongsan:경산,Chilgok:칠곡,Uiseong:의성,Cheongdo:청도,Goryeong:고령,Seongju:성주,Yecheon:예천,Bonghwa:봉화,Uljin:울진,Ulleung:울릉,Yeongdeok:영덕,Cheongsong:청송,Yeongyang:영양,Gunwi:군위,GyeongbukEtc:그 외 경북'],
    ['부산', 'Busan:부산'], ['울산', 'Ulsan:울산'],
    ['경남', 'Changwon:창원,Gimhae:김해,Jinju:진주,Yangsan:양산,Geoje:거제,Tongyeong:통영,Sacheon:사천,Miryang:밀양,Haman:함안,Geochang:거창,Changnyeong:창녕,Goseong:고성,Namhae:남해,Hadong:하동,Sancheong:산청,Hamyang:함양,Hapcheon:합천,Uiryeong:의령,GyeongnamEtc:그 외 경남'],
    ['제주', 'Jeju:제주시,Seogwipo:서귀포'],
    ['해외', 'Tokyo:도쿄,Beijing:베이징,Shanghai:상하이,HongKong:홍콩,Singapore:싱가포르,Bangkok:방콕,Manila:마닐라,Sydney:시드니,Melbourne:멜버른,Auckland:오클랜드,NewYork:뉴욕,LosAngeles:LA,Chicago:시카고,Toronto:토론토,Vancouver:밴쿠버,MexicoCity:멕시코시티,SaoPaulo:상파울루,London:런던,Paris:파리,Berlin:베를린,Frankfurt:프랑크푸르트,Rome:로마,Madrid:마드리드,Overseas:그 외 해외']
  ];
  var CITY_REGION = {};
  REGIONS.forEach(function (r) {
    r[1].split(',').forEach(function (kv) { CITY_REGION[kv.split(':')[0]] = r[0]; });
  });

  /* ── 상품별 질문 ─────────────────────────────────────────── */
  var SPEC = {
    '16': {
      title: '두 사람의 출생 정보',
      sub: '입력하신 정보로 두 사람의 차트를 실제로 계산합니다',
      people: [
        { key: 'me', label: '나', namePh: '내 이름 (닉네임 가능)' },
        { key: 'ex', label: '그 사람', namePh: '그 사람 이름 (닉네임 가능)' }
      ],
      chips: [
        { key: 'stage', label: '헤어진 지 얼마나 됐나요?', opts: ['1개월 이내', '3개월', '6개월', '1년 이상', '몇 년'] },
        { key: 'initiator', label: '누가 먼저 끝냈나요?', opts: ['내가', '상대가', '서로', '애매함'] },
        { key: 'contact', label: '지금 연락은 어떤가요?', opts: ['완전히 끊김', '가끔 연락', '차단된 상태', '친구처럼 지냄'] }
      ]
    },
    '18': {
      title: '나의 출생 정보',
      sub: '태어난 순간의 하늘에 올해 1년을 하루 단위로 겹쳐 계산합니다',
      people: [{ key: 'me', label: '나', namePh: '이름 (닉네임 가능)' }],
      chips: [
        { key: 'status', label: '지금 연애 상태는?', opts: ['솔로', '연애 중', '기혼', '복잡한 관계'] },
        { key: 'focus', label: '올해 가장 궁금한 것은?', opts: ['전체', '연애·결혼', '돈', '일·이직', '건강', '공부·시험'] }
      ]
    }
  };

  /* ── CSS ─────────────────────────────────────────────────── */
  var CSS = [
'.axf,.axf *{box-sizing:border-box;}',
'.axf{max-width:560px;margin:18px auto 20px;padding:22px 18px 20px;border-radius:18px;text-align:left;',
'  background:linear-gradient(170deg,#171b30,#0d0f1d);border:1px solid rgba(201,162,75,.45);',
'  font-family:"Noto Sans KR","Apple SD Gothic Neo",sans-serif;color:#E8E6EF;letter-spacing:-.03em;',
'  box-shadow:0 14px 40px rgba(0,0,0,.35);}',
'.axf-h{font:900 18px/1.4 "Noto Sans KR",sans-serif;color:#E7CE8E;margin:0 0 4px;}',
'.axf-s{font:500 12.5px/1.6 "Noto Sans KR",sans-serif;color:#9a93ad;margin:0 0 16px;word-break:keep-all;}',
'.axf-p{border-top:1px solid rgba(201,162,75,.18);padding-top:14px;margin-top:14px;}',
'.axf-p:first-of-type{border-top:0;margin-top:0;padding-top:0;}',
'.axf-pl{font:800 13px "Noto Sans KR",sans-serif;color:#C9A24B;letter-spacing:.08em;margin-bottom:10px;}',
'.axf-row{display:flex;gap:7px;margin-bottom:9px;flex-wrap:nowrap;}',
'.axf-row>*{flex:1;min-width:0;}',
'.axf-lb{font:600 11.5px "Noto Sans KR",sans-serif;color:#8b829e;margin:2px 0 5px;}',
'.axf input[type=text],.axf select{width:100%!important;height:44px!important;padding:0 10px!important;margin:0!important;',
'  border-radius:10px!important;border:1px solid rgba(255,255,255,.14)!important;background:#0A0C16!important;',
'  color:#f2efe8!important;font:500 14.5px "Noto Sans KR",sans-serif!important;outline:none!important;',
'  -webkit-appearance:none;appearance:none;box-shadow:none!important;}',
'.axf select{background-image:linear-gradient(45deg,transparent 50%,#C9A24B 50%),linear-gradient(135deg,#C9A24B 50%,transparent 50%)!important;',
'  background-position:calc(100% - 15px) 19px,calc(100% - 10px) 19px!important;background-size:5px 5px,5px 5px!important;',
'  background-repeat:no-repeat!important;padding-right:24px!important;}',
'.axf input[type=text]:focus,.axf select:focus{border-color:#C9A24B!important;}',
'.axf .bad{border-color:#E8654F!important;}',
'.axf select:disabled{opacity:.35;}',
'.axf-seg{display:flex;gap:6px;}',
'.axf-seg button,.axf-chips button{flex:1;height:40px;border-radius:10px;cursor:pointer;margin:0;',
'  border:1px solid rgba(255,255,255,.14);background:#0A0C16;color:#b9b5c8;',
'  font:700 13.5px "Noto Sans KR",sans-serif;letter-spacing:-.03em;padding:0 8px;}',
'.axf-seg button.on,.axf-chips button.on{border-color:#C9A24B;background:rgba(201,162,75,.16);color:#E7CE8E;}',
'.axf-chips{display:flex;flex-wrap:wrap;gap:6px;}',
'.axf-chips button{flex:0 0 auto;height:36px;padding:0 13px;font-size:13px;border-radius:18px;}',
'.axf-chips.bad button{border-color:rgba(232,101,79,.6);}',
'.axf-q{margin-top:14px;}',
'.axf-unk{display:flex;align-items:center;gap:7px;margin:2px 0 9px;font:600 12.5px "Noto Sans KR",sans-serif;color:#9a93ad;cursor:pointer;}',
'.axf-unk input{width:17px;height:17px;accent-color:#C9A24B;margin:0;}',
'.axf-msg{min-height:18px;margin-top:12px;font:700 12.5px/1.6 "Noto Sans KR",sans-serif;color:#E8654F;word-break:keep-all;}',
'.axf-ok{display:none;margin-top:12px;padding:12px 14px;border-radius:12px;background:rgba(110,220,140,.1);',
'  border:1px solid rgba(110,220,140,.35);color:#9fe8b4;font:700 13px/1.6 "Noto Sans KR",sans-serif;}',
'.axf-ok.on{display:block;}',
'.axf-go{width:100%;height:52px;margin-top:14px;border:none;border-radius:13px;cursor:pointer;',
'  background:linear-gradient(135deg,#E7CE8E,#C9A24B);color:#1a1206;font:900 15.5px "Noto Sans KR",sans-serif;letter-spacing:-.04em;}',
'.axf-note{margin-top:10px;font:500 11px/1.65 "Noto Sans KR",sans-serif;color:#6b687a;word-break:keep-all;}',
'.axf-pulse{animation:axfP 1.2s ease 2;}',
'@keyframes axfP{0%,100%{box-shadow:0 14px 40px rgba(0,0,0,.35)}50%{box-shadow:0 0 0 4px rgba(232,101,79,.55)}}',
'#axf-toast{position:fixed;left:50%;bottom:90px;transform:translateX(-50%);z-index:2147483000;',
'  background:#1a1206;color:#E7CE8E;border:1px solid #C9A24B;border-radius:12px;padding:12px 18px;',
'  font:800 13.5px "Noto Sans KR",sans-serif;box-shadow:0 10px 30px rgba(0,0,0,.5);max-width:86vw;text-align:center;}'
  ].join('');

  function injectCSS() {
    if (document.getElementById('axf-style')) return;
    var st = document.createElement('style');
    st.id = 'axf-style';
    st.textContent = CSS;
    (document.head || document.documentElement).appendChild(st);
  }

  /* ── 유틸 ───────────────────────────────────────────────── */
  function el(tag, cls, html) {
    var e = document.createElement(tag);
    if (cls) e.className = cls;
    if (html != null) e.innerHTML = html;
    return e;
  }
  function pad(n) { return (n < 10 ? '0' : '') + n; }
  function opt(v, t, sel) { return '<option value="' + v + '"' + (sel ? ' selected' : '') + '>' + t + '</option>'; }
  function load(no) {
    try { return JSON.parse(localStorage.getItem(KEYS[no]) || 'null'); } catch (e) { return null; }
  }
  function save(no, data) {
    try { localStorage.setItem(KEYS[no], JSON.stringify(data)); return true; } catch (e) { return false; }
  }
  function toast(msg) {
    var t = document.getElementById('axf-toast');
    if (!t) { t = el('div'); t.id = 'axf-toast'; document.body.appendChild(t); }
    t.textContent = msg; t.style.display = 'block';
    clearTimeout(toast._t);
    toast._t = setTimeout(function () { t.style.display = 'none'; }, 2800);
  }
  function realDate(y, m, d) {
    var dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  /* ── 한 사람 블록 ───────────────────────────────────────── */
  function personBlock(p, prev) {
    prev = prev || {};
    var nowY = new Date().getFullYear();
    var py = prev.date ? +prev.date.slice(0, 4) : 0, pm = prev.date ? +prev.date.slice(5, 7) : 0, pd = prev.date ? +prev.date.slice(8, 10) : 0;
    var ph = (prev.time && !prev.timeUnknown) ? +prev.time.slice(0, 2) : -1, pmi = (prev.time && !prev.timeUnknown) ? +prev.time.slice(3, 5) : -1;

    var ys = opt('', '년도'), ms = opt('', '월'), ds = opt('', '일'), hs = opt('', '시'), mis = opt('', '분');
    for (var y = nowY; y >= 1930; y--) ys += opt(y, y + '년', y === py);
    for (var m = 1; m <= 12; m++) ms += opt(m, m + '월', m === pm);
    for (var d = 1; d <= 31; d++) ds += opt(d, d + '일', d === pd);
    for (var h = 0; h < 24; h++) hs += opt(h, (h < 12 ? '오전 ' : '오후 ') + (h % 12 === 0 ? 12 : h % 12) + '시', h === ph);
    for (var mi = 0; mi < 60; mi++) mis += opt(mi, mi + '분', mi === pmi);

    var region = prev.city ? (CITY_REGION[prev.city] || '서울') : '';
    var rs = opt('', '시·도');
    REGIONS.forEach(function (r) { rs += opt(r[0], r[0], r[0] === region); });

    var g = prev.gender || '';
    var box = el('div', 'axf-p');
    box.setAttribute('data-who', p.key);
    box.innerHTML =
      '<div class="axf-pl">' + p.label.toUpperCase() + '</div>' +
      '<div class="axf-row"><input type="text" maxlength="20" data-f="name" placeholder="' + p.namePh + '" autocomplete="off"></div>' +
      '<div class="axf-seg" style="margin-bottom:9px" data-f="gender">' +
        '<button type="button" data-v="여성"' + (g === '여성' ? ' class="on"' : '') + '>여성</button>' +
        '<button type="button" data-v="남성"' + (g === '남성' ? ' class="on"' : '') + '>남성</button></div>' +
      '<div class="axf-lb">생년월일 (양력)</div>' +
      '<div class="axf-row"><select data-f="y">' + ys + '</select><select data-f="m">' + ms + '</select><select data-f="d">' + ds + '</select></div>' +
      '<div class="axf-lb">태어난 시간</div>' +
      '<div class="axf-row"><select data-f="h">' + hs + '</select><select data-f="mi">' + mis + '</select></div>' +
      '<label class="axf-unk"><input type="checkbox" data-f="unk"' + (prev.timeUnknown ? ' checked' : '') + '> 태어난 시간을 몰라요</label>' +
      '<div class="axf-lb">태어난 곳</div>' +
      '<div class="axf-row"><select data-f="region">' + rs + '</select><select data-f="city"><option value="">도시</option></select></div>';

    box.querySelector('[data-f=name]').value = prev.name || '';

    var regionSel = box.querySelector('[data-f=region]'), citySel = box.querySelector('[data-f=city]');
    function fillCity(selected) {
      var r = REGIONS.filter(function (x) { return x[0] === regionSel.value; })[0];
      if (!r) { citySel.innerHTML = opt('', '도시'); return; }
      var list = r[1].split(',');
      var html = list.length > 1 ? opt('', '도시 선택') : '';
      list.forEach(function (kv) { var k = kv.split(':'); html += opt(k[0], k[1], k[0] === selected); });
      citySel.innerHTML = html;
    }
    regionSel.addEventListener('change', function () { fillCity(''); });
    fillCity(prev.city || '');

    var unk = box.querySelector('[data-f=unk]');
    function syncUnk() {
      box.querySelector('[data-f=h]').disabled = unk.checked;
      box.querySelector('[data-f=mi]').disabled = unk.checked;
    }
    unk.addEventListener('change', syncUnk); syncUnk();

    Array.prototype.forEach.call(box.querySelectorAll('.axf-seg button'), function (b) {
      b.addEventListener('click', function () {
        Array.prototype.forEach.call(b.parentNode.children, function (x) { x.classList.remove('on'); });
        b.classList.add('on');
      });
    });
    return box;
  }

  function readPerson(box) {
    var q = function (f) { return box.querySelector('[data-f=' + f + ']'); };
    var errs = [];
    Array.prototype.forEach.call(box.querySelectorAll('.bad'), function (x) { x.classList.remove('bad'); });
    var name = (q('name').value || '').trim().replace(/[<>{}\\"']/g, '').slice(0, 20);
    if (!name) { errs.push('이름'); q('name').classList.add('bad'); }
    var gb = box.querySelector('[data-f=gender] .on');
    if (!gb) { errs.push('성별'); }
    var y = +q('y').value, m = +q('m').value, d = +q('d').value;
    if (!y || !m || !d || !realDate(y, m, d)) { errs.push('생년월일'); ['y', 'm', 'd'].forEach(function (f) { q(f).classList.add('bad'); }); }
    var unk = q('unk').checked;
    var h = q('h').value, mi = q('mi').value;
    if (!unk && (h === '' || mi === '')) { errs.push('태어난 시간 (모르면 "몰라요" 체크)'); q('h').classList.add('bad'); q('mi').classList.add('bad'); }
    var city = q('city').value;
    if (!city) { errs.push('태어난 곳'); q('region').classList.add('bad'); q('city').classList.add('bad'); }
    return {
      errs: errs,
      v: {
        name: name, gender: gb ? gb.getAttribute('data-v') : '',
        date: y && m && d ? y + '-' + pad(m) + '-' + pad(d) : '',
        time: unk || h === '' ? '' : pad(+h) + ':' + pad(+mi),
        timeUnknown: unk, city: city
      }
    };
  }

  /* ── 폼 전체 ─────────────────────────────────────────────── */
  function buildForm(no, opts) {
    opts = opts || {};
    var sp = SPEC[no];
    var prev = load(no) || {};
    var f = el('div', 'axf');
    f.id = 'axf-' + no;
    f.appendChild(el('div', 'axf-h', opts.title || sp.title));
    f.appendChild(el('div', 'axf-s', opts.sub || sp.sub));
    sp.people.forEach(function (p) { f.appendChild(personBlock(p, prev[p.key])); });
    sp.chips.forEach(function (c) {
      var q = el('div', 'axf-q');
      q.appendChild(el('div', 'axf-lb', c.label));
      var row = el('div', 'axf-chips');
      row.setAttribute('data-chip', c.key);
      c.opts.forEach(function (o) {
        var b = el('button', o === prev[c.key] ? 'on' : '', o);
        b.type = 'button';
        b.addEventListener('click', function () {
          Array.prototype.forEach.call(row.children, function (x) { x.classList.remove('on'); });
          b.classList.add('on'); row.classList.remove('bad');
        });
        row.appendChild(b);
      });
      q.appendChild(row);
      f.appendChild(q);
    });
    var msg = el('div', 'axf-msg');
    var ok = el('div', 'axf-ok', '✓ 입력 완료 — 이제 구매하시면 결제 직후 리포트가 만들어집니다.');
    var go = el('button', 'axf-go', opts.button || '입력 완료');
    go.type = 'button';
    f.appendChild(msg); f.appendChild(ok); f.appendChild(go);
    f.appendChild(el('div', 'axf-note', no === REUNION_NO
      ? '상대의 태어난 시간을 몰라도 괜찮습니다. 시간에 따라 달라지는 항목은 추측하지 않고 빼고 계산합니다. 입력하신 정보는 리포트 계산에만 씁니다.'
      : '태어난 시간을 몰라도 괜찮습니다. 태양 별자리를 기준으로 하우스를 나눠 계산합니다. 입력하신 정보는 리포트 계산에만 씁니다.'));

    function collect() {
      var data = { productNo: no, savedAt: Date.now() };
      var errs = [];
      sp.people.forEach(function (p) {
        var r = readPerson(f.querySelector('[data-who=' + p.key + ']'));
        data[p.key] = r.v;
        r.errs.forEach(function (e) { errs.push(p.label + ' ' + e); });
      });
      if (no === REUNION_NO && data.me.name && data.me.name === data.ex.name) errs.push('두 사람 이름이 같습니다 (닉네임을 구분해 주세요)');
      sp.chips.forEach(function (c) {
        var on = f.querySelector('[data-chip=' + c.key + '] .on');
        if (!on) { errs.push(c.label.replace(/\?$/, '')); f.querySelector('[data-chip=' + c.key + ']').classList.add('bad'); }
        data[c.key] = on ? on.textContent : '';
      });
      return { data: data, errs: errs };
    }

    f._submit = function () {
      var r = collect();
      if (r.errs.length) {
        msg.textContent = '아직 비어 있어요: ' + r.errs.slice(0, 3).join(', ') + (r.errs.length > 3 ? ' 외 ' + (r.errs.length - 3) + '개' : '');
        ok.classList.remove('on');
        return null;
      }
      msg.textContent = '';
      save(no, r.data);
      ok.classList.add('on');
      return r.data;
    };
    go.addEventListener('click', function () {
      var d = f._submit();
      if (d && typeof opts.onSubmit === 'function') opts.onSubmit(d);
      else if (d && !opts.onSubmit) toast('입력 완료! 이제 구매하기를 눌러주세요');
    });
    /* 이미 저장된 값이 완전하면 완료 표시 */
    if (prev && prev.productNo === no) { if (collect().errs.length === 0) ok.classList.add('on'); else msg.textContent = ''; }
    return f;
  }

  function isComplete(no) {
    var d = load(no);
    if (!d || d.productNo !== no) return false;
    var okP = function (p) { return p && p.name && /^\d{4}-\d{2}-\d{2}$/.test(p.date) && (p.timeUnknown || /^\d{2}:\d{2}$/.test(p.time)) && p.city; };
    if (!okP(d.me)) return false;
    if (no === REUNION_NO) return okP(d.ex) && d.stage && d.initiator && d.contact;
    return !!(d.status && d.focus);
  }

  /* ════════════════════════════════════════════════════════════
     상세페이지 자동 장착
     ════════════════════════════════════════════════════════════ */
  function productNoOfPage() {
    try {
      var q = new URLSearchParams(location.search).get('product_no');
      if (q) return String(q);
    } catch (e) {}
    var m = location.pathname.match(/\/product\/[^/]+\/(\d+)(\/|$)/) || location.pathname.match(/\/product\/(\d+)(\/|$)/);
    if (m) return m[1];
    if (typeof window.iProductNo !== 'undefined') return String(window.iProductNo);
    return null;
  }
  var BUY_SEL = '#actionBuy,#actionBuyClone,#actionCart,#actionCartClone,#btnBuy,.btnBuy,.btn_buy,' +
                '.actionBuy,[onclick*="product_submit"],#NaverChk_Button,.npay_btn_link,[class*="npay"],.ec-product-buy';

  function findAnchor() {
    var spot = document.getElementById('astro-intake');
    if (spot) return { node: spot, mode: 'inside' };
    var buy = document.querySelector('#actionBuy,[onclick*="product_submit(1"],#btnBuy,.btnBuy,.btnSubmit');
    if (buy) {
      var box = buy.closest('.xans-product-action,.ec-base-button,.action,.btnArea,.buyBtn') || buy.parentNode;
      return { node: box, mode: 'before' };
    }
    var info = document.querySelector('.infoArea,.xans-product-detail,#contents');
    return info ? { node: info, mode: 'inside-top' } : null;
  }

  function mountOnDetail(no) {
    injectCSS();
    if (document.getElementById('axf-' + no)) return;
    var a = findAnchor();
    if (!a) return;
    var form = buildForm(no);
    if (a.mode === 'inside') a.node.appendChild(form);
    else if (a.mode === 'before') a.node.parentNode.insertBefore(form, a.node);
    else a.node.insertBefore(form, a.node.firstChild);

    /* 구매 게이트 — 캡처 단계에서 먼저 잡아야 카페24 onclick 보다 앞선다 */
    document.addEventListener('click', function (e) {
      var t = e.target && e.target.closest ? e.target.closest(BUY_SEL) : null;
      if (!t || form.contains(t)) return;
      if (isComplete(no)) return;
      var d = form._submit();             /* 칸은 다 채웠는데 '입력 완료'만 안 누른 경우 → 바로 저장하고 통과 */
      if (d) return;
      e.preventDefault(); e.stopPropagation(); e.stopImmediatePropagation();
      form.scrollIntoView({ behavior: 'smooth', block: 'center' });
      form.classList.remove('axf-pulse'); void form.offsetWidth; form.classList.add('axf-pulse');
      toast('출생 정보를 먼저 입력해 주세요 — 결제 후 바로 리포트가 만들어집니다');
    }, true);
  }

  window.AstroIntake = {
    version: 1,
    REUNION_NO: REUNION_NO, NEWYEAR_NO: NEWYEAR_NO, KEYS: KEYS,
    load: load, isComplete: isComplete,
    /* 결과화면용: 컨테이너 안에 폼을 그리고, 제출되면 cb(data) */
    mountInto: function (container, no, cb, o) {
      injectCSS();
      var form = buildForm(String(no), Object.assign({ onSubmit: cb, button: '이 정보로 리포트 만들기',
        title: '출생 정보를 한 번만 다시 입력해 주세요',
        sub: '결제는 정상 완료되었습니다. 추가 결제는 없습니다. 다른 기기나 앱에서 열려 입력값을 찾지 못했어요.' }, o || {}));
      container.innerHTML = '';
      container.appendChild(form);
      return form;
    }
  };

  /* 상세페이지라면 자동 장착 */
  function boot() {
    var no = productNoOfPage();
    if (no !== REUNION_NO && no !== NEWYEAR_NO) return;
    if (/order_result|orderresult|myshop/.test(location.pathname)) return;   /* 결과·주문내역 페이지는 각 결과 스크립트가 직접 씀 */
    mountOnDetail(no);
    /* 카페24 스킨이 버튼을 늦게 그리는 경우 대비 */
    var n = 0, iv = setInterval(function () {
      n++;
      if (document.getElementById('axf-' + no) || n > 20) { clearInterval(iv); return; }
      mountOnDetail(no);
    }, 500);
  }
  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', boot);
  else boot();
})();
