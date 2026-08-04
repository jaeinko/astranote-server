// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출로 패키지 버전 문제 원천 차단

const { kv } = require('@vercel/kv');

/* 🚨 Gemini 과부하(503·429) 대기 — 2026-08-02 상향
   ----------------------------------------------------------------------------
   [무슨 일이 있었나]
   실제 손님 요청에서 Gemini 가 3번 연속 503 을 뱉었다.

       1차 503 (1.44초) → 1.5초 대기
       2차 503 (0.30초) → 3초 대기
       3차 503 (0.37초) → 포기

   11초 만에 손을 들고 손님에게 500 을 던졌다.

   [왜 짧으면 안 되나]
   503 은 구글 쪽 일시 과부하다. 보통 수십 초 지속된다.
   몇 초 만에 다시 두드리면 같은 거절만 받는다.
   게다가 503 은 즉시 거절이라 호출 자체가 1초도 안 걸린다.
   즉 대기 시간이 곧 회복 기회의 전부다.

   [조치] 20초 → 45초 (총 65초 확보)
   최악의 경우(503 두 번 + 3차 정상 생성)에도 약 185초로
   함수 제한 300초 안에 들어온다. */
const RETRY_WAIT_MS = [20000, 45000, 0];   // 1·2차 실패 후 대기. 3차는 마지막이라 0.


/* 🚨 CORS 는 lib/cors.js 화이트리스트 정본 하나만 씁니다.
   예전의 '*' 는 아무 사이트나 우리 Gemini 크레딧을 태울 수 있게 했습니다. */
const { allowCors } = require('../lib/cors.js');

// ── 공용 모듈 ──────────────────────────────────────────────────────────
//  도시 좌표와 시간대 변환은 lib/ 아래 정본 하나만 씁니다.
//  예전에는 이 로직이 API 4개에 복사돼 있어서, 한 곳만 고치면 나머지 세 곳에
//  버그가 남았습니다(한국 1954~61 UTC+8:30 · 1987~88 서머타임 미반영).
const cityCoordinates = require('../lib/cities.js');
const { cityTimezones, getUtcOffsetMinutes, buildBirthIso, dayRangeIso, tzLabel } = require('../lib/time.js');
// 🚨 상승점·천정은 Prokerala 응답에 의존하지 않고 좌표와 시각으로 직접 계산합니다.
//    예전에는 Prokerala 가 내려주는 Ascendant 항목을 그대로 썼는데,
//    그 항목이 없거나 이름이 다르면 asc 가 undefined 가 되고,
//    하우스 배정이 통째로 건너뛰어진 채 "7하우스를 근거로 삼아라"는 지시만 남았습니다.
//    그러면 AI 가 하우스를 지어냅니다. 실패하지 않고 조용히 지어냅니다.
const CH = require('../lib/chart.js');
//    Prokerala 가 죽거나 응답이 비어도 리포트가 그냥 나가던 문제도 함께 막습니다.
//    자체 계산(Swiss Ephemeris 대비 오차 1.7분 검증)을 대체 경로로 둡니다.
const EPH = require('../lib/ephemeris.js');






// ===== 🔬 차트 정밀 다이제스트 =====
// Prokerala의 베딕(사이더리얼) 좌표를 서양 점성술(트로피컬)로 보정하고,
// AI가 바로 이해할 수 있는 한국어 요약으로 변환합니다. 이게 리포트 품질의 핵심입니다.
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점' };

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000); // 라히리 아야남샤 근사치
}
function signDeg(lon) {
  const l = ((lon % 360) + 360) % 360;
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}
/* 🚨 v2.1 (2026-08-04) — 전역변수 → 요청별 컨텍스트
   ------------------------------------------------------------------
   원래 CHART_SNAPSHOT · STRONGEST_MARRIAGE_YEAR 가 모듈 전역이었다.
   Vercel Fluid compute 는 한 프로세스가 여러 요청을 '동시에' 처리한다.
   (8/2 손님 로그의 "Fluid" 표기가 그 증거다)

   Gemini 생성은 60~150초 걸린다. 그 사이 다른 손님 주문이 들어오면 —
     · 손님 A 의 리포트에 손님 B 의 행성 명세표가 붙고 (개인정보 사고)
     · A 의 gateCheck 가 B 의 결혼 적기 연도를 요구해 멀쩡한 원고를 반려한다
   지금은 주문이 겹칠 확률이 낮지만, 쓰레드 글 하나 터지는 순간
   주문이 몰리면서 정확히 이 사고가 난다. 그래서 요청마다 자기만의
   컨텍스트 객체(chartCtx)를 만들어 들고 다니게 바꿨다. */

/* ── 각도(어스펙트) 계산 ────────────────────────────────────────
   "오차 0.3도로 맺혀 있습니다" 같은 근거를 쓰려면 이게 있어야 한다.
   이게 없으면 AI 는 별자리 일반론밖에 못 쓴다. */
const ASPECTS = [
  { ang: 0,   name: '합',   orb: 7 },
  { ang: 60,  name: '육각', orb: 4 },
  { ang: 90,  name: '사각', orb: 6 },
  { ang: 120, name: '삼각', orb: 6 },
  { ang: 180, name: '대립', orb: 7 }
];
const ASPECT_TONE = { '합': '겹침', '육각': '순풍', '삼각': '순풍', '사각': '마찰', '대립': '팽팽함' };

function sep360(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function buildAspects(planets) {
  const keys = ['태양','달','수성','금성','화성','목성','토성','상승점','천정'];
  const out = [];
  for (let i = 0; i < keys.length; i++) {
    for (let j = i + 1; j < keys.length; j++) {
      const a = keys[i], b = keys[j];
      if (!planets[a] || !planets[b]) continue;
      const d = sep360(planets[a].abs, planets[b].abs);
      for (const A of ASPECTS) {
        const err = Math.abs(d - A.ang);
        if (err > A.orb) continue;
        out.push({ a: a, b: b, name: A.name, err: err, tone: ASPECT_TONE[A.name] });
        break;
      }
    }
  }
  out.sort(function (x, y) { return x.err - y.err; });
  return out;
}

/* 7하우스 지배성이 어디 있는가 — 배우자를 어디서 만나는지의 핵심 단서 */
const SIGN_RULER = {
  '양자리':'화성','황소자리':'금성','쌍둥이자리':'수성','게자리':'달','사자자리':'태양','처녀자리':'수성',
  '천칭자리':'금성','전갈자리':'화성','사수자리':'목성','염소자리':'토성','물병자리':'토성','물고기자리':'목성'
};

/* 품위 — 그 별이 제 힘을 쓰는지 */
const DIGNITY = {
  rul: { '태양':'사자자리','달':'게자리','수성':['쌍둥이자리','처녀자리'],'금성':['황소자리','천칭자리'],
         '화성':['양자리','전갈자리'],'목성':['사수자리','물고기자리'],'토성':['염소자리','물병자리'] },
  exa: { '태양':'양자리','달':'황소자리','수성':'처녀자리','금성':'물고기자리','화성':'염소자리','목성':'게자리','토성':'천칭자리' },
  det: { '태양':'물병자리','달':'염소자리','수성':['사수자리','물고기자리'],'금성':['양자리','전갈자리'],
         '화성':['황소자리','천칭자리'],'목성':['쌍둥이자리','처녀자리'],'토성':['게자리','사자자리'] },
  fal: { '태양':'천칭자리','달':'전갈자리','수성':'물고기자리','금성':'처녀자리','화성':'게자리','목성':'염소자리','토성':'양자리' }
};
function dignityOf(planet, sign) {
  const hit = function (t) {
    const v = DIGNITY[t][planet];
    if (!v) return false;
    return Array.isArray(v) ? v.indexOf(sign) >= 0 : v === sign;
  };
  if (hit('rul')) return '지배(제 집)';
  if (hit('exa')) return '고양';
  if (hit('det')) return '함몰';
  if (hit('fal')) return '추락';
  return '';
}

/* 화면에 그대로 뿌릴 명세표. AI 가 손대지 않으므로 지어낼 수 없다. */
const GLYPH = { '상승점':'AC','태양':'☉','달':'☽','수성':'☿','금성':'♀','화성':'♂',
                '목성':'♃','토성':'♄','천정':'MC' };
const ROLE = { '상승점':'첫인상·타고난 기질','태양':'나의 중심','달':'감정과 안식',
               '수성':'생각과 말','금성':'사랑하는 방식','화성':'끌리는 방식·추진력',
               '목성':'확장과 기회','토성':'책임과 두려움','천정':'사회적 얼굴' };

function buildChartTable(planets, ascAbs) {
  const order = ['상승점','태양','달','수성','금성','화성','목성','토성','천정'];
  const rows = [];
  for (const n of order) {
    if (!planets[n]) continue;
    const abs = planets[n].abs;
    let house = null;
    if (typeof ascAbs === 'number') {
      const as = Math.floor(((ascAbs % 360) + 360) % 360 / 30);
      const ps = Math.floor(((abs % 360) + 360) % 360 / 30);
      house = (((ps - as) % 12) + 12) % 12 + 1;
    }
    const inSign = ((abs % 360) + 360) % 360 % 30;
    let d = Math.floor(inSign), m = Math.round((inSign - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    rows.push({
      glyph: GLYPH[n] || '✦', name: n, role: ROLE[n] || '',
      sign: planets[n].sign, deg: d + '\u00B0' + String(m).padStart(2, '0') + '\u2032',
      house: house, dignity: (n === '상승점' || n === '천정') ? '' : dignityOf(n, planets[n].sign)
    });
  }
  return rows;
}

function buildMethodNote(iso, cityResolved, timeUnknown) {
  const off = String(iso).slice(-6);
  const L = [];
  L.push('출생 시각을 <b>' + String(iso).slice(0, 16).replace('T', ' ') +
         '</b> (UTC' + off + ') 로 놓고 계산했습니다.');
  L.push('좌표계는 <b>트로피컬</b>, 하우스는 <b>홀사인</b> 방식입니다. 상승점이 속한 별자리 전체가 1하우스가 됩니다.');
  L.push('상승점과 천정은 그 시각의 항성시로 직접 계산했습니다. Swiss Ephemeris 대비 <b>오차 1분(arcmin) 이내</b>입니다.');
  if (timeUnknown) {
    L.push('다만 태어난 시각을 모른다고 하셔서 <b>정오 기준</b>으로 잡았습니다. 별자리는 그대로 유효하지만 <b>상승점과 하우스는 근사치</b>입니다.');
  } else {
    L.push('태어난 시각이 4분만 달라져도 상승점이 1도 움직입니다. 알려주신 시각이 정확하다는 전제에서 이 정밀도가 의미를 갖습니다.');
  }
  if (!cityResolved) {
    L.push('출생지가 목록에 없어 서울 좌표로 계산했습니다. 실제 출생지와 경도 차이가 크면 상승점이 달라질 수 있습니다.');
  }
  return L.join('<br><br>');
}

/* Prokerala 없이 자체 계산으로 planet_position 과 같은 모양을 만든다.
   외부 API 가 죽어도 손님에게 지어낸 리포트가 나가지 않게 하기 위한 대체 경로다. */
function localPlanetList(dateTimeIso) {
  const map = { '태양':'Sun', '달':'Moon', '수성':'Mercury', '금성':'Venus',
                '화성':'Mars', '목성':'Jupiter', '토성':'Saturn' };
  const pos = EPH.positions(dateTimeIso, Object.keys(map));
  const ay = lahiriAyanamsa(dateTimeIso);
  const out = [];
  for (const kr in map) {
    if (pos[kr] === undefined) continue;
    /* buildChartDigest 가 ayanamsa 를 더해 트로피컬로 되돌리므로 여기서는 빼서 넘긴다 */
    out.push({ name: map[kr], longitude: ((pos[kr] - ay) % 360 + 360) % 360 });
  }
  return out;
}

function buildChartDigest(data, dateTimeIso, location, ctx) {
  try {
    const list = data.planet_position || data.planet_positions || [];
    if (!list.length) return null;
    const ay = lahiriAyanamsa(dateTimeIso);
    const planets = {};
    for (const p of list) {
      const nameKr = PLANET_KR[p.name];
      if (!nameKr || typeof p.longitude !== 'number') continue;
      planets[nameKr] = signDeg(p.longitude + ay); // 사이더리얼 → 트로피컬 보정
    }
    /* 🚨 상승점·천정을 직접 계산한다 (Swiss Ephemeris 대비 오차 1분 이내 검증) */
    let asc = null;
    if (location && typeof location.lat === 'number' && typeof location.lon === 'number') {
      const jdv = CH.toJD(dateTimeIso);
      asc = signDeg(CH.calcASC(jdv, location.lon, location.lat));
      planets['상승점'] = asc;
      planets['천정'] = signDeg(CH.calcMC(jdv, location.lon));
    } else if (planets['상승점']) {
      asc = planets['상승점'];   // 좌표가 없을 때만 응답값으로 대체
    }
    if (!asc) {
      console.error('🔥 상승점을 계산하지 못했습니다 → 하우스 없는 리포트를 내보내지 않습니다');
      return null;   // 지어내느니 실패시킨다
    }
    if (ctx) ctx.snapshot = { planets: planets, ascAbs: asc.abs };
    const lines = [];
    if (asc) {
      const dsc = signDeg(asc.abs + 180);
      lines.push(`상승점(ASC): ${asc.sign} ${asc.deg}도`);
      lines.push(`7하우스(배우자궁) 시작점: ${dsc.sign} ${dsc.deg}도 ← 배우자 해석의 최우선 근거`);
      if (planets['천정']) lines.push(`천정(MC): ${planets['천정'].sign} ${planets['천정'].deg}도`);

      // 🪐 실제 계산된 목성 트랜짓 (사람마다 달라야 하는 만남 시기의 유일한 근거)
      const jupiterWindows = findJupiterTransitWindows(dsc.abs, ctx);
      // 🚨 안전장치: 결과가 비었거나 undefined가 섞이면 '없음'으로 처리 (리포트에 undefined 노출 방지)
      const validWindows = (jupiterWindows || []).filter(function(w) {
        return typeof w === 'string' && w.length > 0 && w.indexOf('undefined') === -1;
      });
      if (validWindows.length > 0) {
        lines.push(`\n[실제 계산된 목성 트랜짓 - 이 시기만 만남 시기로 사용하라]`);
        validWindows.forEach((w, i) => lines.push((i+1) + '순위 시기: ' + w));
        const strongest = validWindows.find(function(w){ return w.indexOf('★★') >= 0; });
        if (strongest) lines.push('→ 위 목록에서 ★★ 표시된 구간이 각도상 가장 강력한 결혼·만남의 창이다. card5에서 이 구간만 빨간 강조로 못 박아라. 다른 시기를 최강으로 바꿔치기하면 치명적 실패다.');
      } else {
        lines.push(`\n[실제 계산 결과] 향후 8년간(~2034년) 목성이 배우자궁과 뚜렷한 각을 맺는 시기가 없다. 이 경우 만남 시기를 단정하지 말고, "현재는 특별히 두드러진 트랜짓이 없어 시기보다 태도와 만남의 자리를 넓히는 데 집중할 시점"이라고 정직하게 안내하라. 없는 시기를 지어내지 마라.`);
      }
    }
    // 하우스별 인생 영역 의미 (리포트 깊이의 핵심 재료)
    const HOUSE_MEANING = {
      1: '자아·타고난 기질·첫인상',
      2: '돈·자존감·타고난 재능',
      3: '소통·형제자매·초년 학습환경',
      4: '부모·가정·뿌리·마음의 안식처',
      5: '연애·자녀·창조성·즐거움',
      6: '일상·건강·직장생활·성실함',
      7: '배우자·결혼·1:1 관계 ★핵심',
      8: '깊은 결속·상처·타인의 자원·변형',
      9: '배움·여행·먼 곳·신념',
      10: '커리어·사회적 지위·명예',
      11: '인간관계·인맥·꿈과 소망',
      12: '무의식·숨겨진 상처·혼자만의 세계'
    };

    const houseMap = {};  // 하우스별 행성 모음 (스텔리움 탐지용)
    for (const n of ['태양','달','수성','금성','화성','목성','토성']) {
      if (!planets[n]) continue;
      let houseTxt = '';
      if (asc) {
        // 🔧 홀사인(Whole Sign) 방식: 상승점이 '속한 별자리' 기준으로 하우스 배정.
        // (상승점의 도수가 아니라 별자리로 나눠야 astro-seek/mizar 등 표준 사이트와 일치함)
        const ascSign = Math.floor((((asc.abs % 360) + 360) % 360) / 30);
        const planetSign = Math.floor((((planets[n].abs % 360) + 360) % 360) / 30);
        const h = (((planetSign - ascSign) % 12) + 12) % 12 + 1;
        houseMap[h] = houseMap[h] || [];
        houseMap[h].push(n);
        houseTxt = ` (${h}하우스 = ${HOUSE_MEANING[h]}${h === 7 ? ' ★배우자궁 안! 최우선 근거' : ''})`;
      }
      lines.push(`${n}: ${planets[n].sign} ${planets[n].deg}도${houseTxt}`);
    }

    /* ── 7하우스 지배성 : 배우자를 어디서 만나는지의 핵심 단서 ── */
    if (asc) {
      const dscSign = SIGNS_KR[Math.floor(((((asc.abs + 180) % 360) + 360) % 360) / 30)];
      const ruler = SIGN_RULER[dscSign];
      if (ruler && planets[ruler]) {
        const as2 = Math.floor((((asc.abs % 360) + 360) % 360) / 30);
        const rs = Math.floor((((planets[ruler].abs % 360) + 360) % 360) / 30);
        const rh = (((rs - as2) % 12) + 12) % 12 + 1;
        lines.push('\n[7하우스 지배성 — 배우자를 만나는 자리]');
        lines.push('7하우스가 ' + dscSign + '이므로 지배성은 ' + ruler + '이다.');
        lines.push('그 ' + ruler + '이 ' + planets[ruler].sign + ' ' + planets[ruler].deg +
                   '도, ' + rh + '하우스(' + HOUSE_MEANING[rh] + ')에 있다.');
        lines.push('→ 배우자는 이 영역과 얽힌 자리에서 나타난다. 만남의 장소·경로를 여기서 끌어내라.');
      }
    }

    /* ── 지난 연애 패턴의 근거 : 금성과 화성 ── */
    if (planets['금성'] || planets['화성']) {
      lines.push('\n[지금까지의 연애 패턴 — 과거 검증용 재료]');
      if (planets['금성']) {
        const dg = dignityOf('금성', planets['금성'].sign);
        lines.push('금성(사랑하는 방식): ' + planets['금성'].sign + ' ' + planets['금성'].deg + '도' +
                   (dg ? ' / ' + dg : '') + ' → 애정을 주는 방식, 끌리는 대상의 결.');
      }
      if (planets['화성']) {
        const dg2 = dignityOf('화성', planets['화성'].sign);
        lines.push('화성(끌리는 방식·추진력): ' + planets['화성'].sign + ' ' + planets['화성'].deg + '도' +
                   (dg2 ? ' / ' + dg2 : '') + ' → 먼저 다가가는 방식, 부딪히는 방식.');
      }
      lines.push('→ 이 둘로 "지금까지 어떤 사람에게 끌렸고 왜 반복해서 어긋났는지"를 먼저 짚어라.');
      lines.push('  손님이 과거를 보고 "맞다"고 해야 뒤의 미래 이야기를 믿는다.');
    }

    /* ── 실제 각도 : 근거로 인용할 유일한 재료 ── */
    const asps = buildAspects(planets);
    if (asps.length) {
      lines.push('\n[실제 계산된 각도 — 오차까지 그대로 인용하라]');
      asps.slice(0, 10).forEach(function (x) {
        lines.push('· ' + x.a + ' ' + x.name + ' ' + x.b +
                   ' (오차 ' + x.err.toFixed(1) + '도, ' + x.tone + ')');
      });
      const tight = asps.filter(function (x) { return x.err <= 1.5; });
      if (tight.length) {
        lines.push('→ 오차 1.5도 이내가 ' + tight.length + '개다. 이 사람 인생에서 가장 강하게 작동하는 힘이다.');
        lines.push('  본문에 최소 2개는 오차까지 밝혀서 인용하라.');
      }
    }

    /* ── 원소·성질 : 결핍이 곧 조언거리 ── */
    (function () {
      const EL = ['불','흙','공기','물'], MO = ['활동','고정','변통'];
      const ec = {}, mc = {};
      ['태양','달','수성','금성','화성','목성','토성','상승점'].forEach(function (k) {
        if (!planets[k]) return;
        const si = Math.floor((((planets[k].abs % 360) + 360) % 360) / 30);
        ec[EL[si % 4]] = (ec[EL[si % 4]] || 0) + 1;
        mc[MO[si % 3]] = (mc[MO[si % 3]] || 0) + 1;
      });
      const lack = EL.filter(function (e) { return !ec[e]; });
      const lack2 = MO.filter(function (m) { return !mc[m]; });
      lines.push('\n[원소·성질]');
      lines.push('원소: ' + EL.map(function (e) { return e + ' ' + (ec[e] || 0); }).join(' / '));
      lines.push('성질: ' + MO.map(function (m) { return m + ' ' + (mc[m] || 0); }).join(' / '));
      if (lack.length || lack2.length) {
        lines.push('결핍: ' + lack.concat(lack2).join('·') +
                   ' → 타고나지 않아 의식적으로 채워야 하는 영역. 조언에 반드시 반영하라.');
      }
    })();

    // 🔬 이 사람만의 '특이 배치' 자동 탐지 → AI가 중심 스토리로 삼을 재료
    const highlights = [];
    for (const [h, ps] of Object.entries(houseMap)) {
      if (ps.length >= 2) {
        highlights.push(`【스텔리움】 ${h}하우스(${HOUSE_MEANING[h]})에 ${ps.join('·')} ${ps.length}개가 몰려 있다 → 이 사람 인생의 최대 화두. 반드시 깊게 다뤄라.`);
      }
    }
    if (houseMap[7]) highlights.push(`【배우자궁의 행성】 7하우스 안에 ${houseMap[7].join('·')}이 있다 → 배우자 해석의 결정적 단서.`);
    if (houseMap[12]) highlights.push(`【숨겨진 상처】 12하우스에 ${houseMap[12].join('·')}이 있다 → 남에게 말 못 한 감정·억눌린 패턴이 있다. 이걸 짚으면 소름 돋는다.`);
    if (houseMap[4]) highlights.push(`【부모·뿌리】 4하우스에 ${houseMap[4].join('·')}이 있다 → 가정환경과 부모와의 관계가 이 사람 성격 형성에 결정적이었다.`);
    if (houseMap[11]) highlights.push(`【인간관계】 11하우스에 ${houseMap[11].join('·')}이 있다 → 인맥·모임·친구 관계가 인생에서 큰 비중을 차지한다.`);
    if (houseMap[8]) highlights.push(`【깊은 상처와 변형】 8하우스에 ${houseMap[8].join('·')}이 있다 → 얕은 관계로는 만족 못 하는 사람. 깊은 결속을 갈망한다.`);

    // 🔭 행성 간 각도(애스펙트) 자동 탐지 → 해석 깊이의 핵심
    const ASPECTS = [
      { ang: 0,   name: '합',    orb: 7, tone: '융합' },
      { ang: 180, name: '대립',  orb: 6, tone: '긴장' },
      { ang: 120, name: '삼각',  orb: 6, tone: '조화' },
      { ang: 90,  name: '사각',  orb: 6, tone: '긴장' },
      { ang: 60,  name: '육각',  orb: 4, tone: '조화' }
    ];
    const PAIR_MEANING = {
      '태양-달': { 조화: '겉과 속이 일치해 자기 자신과 사이가 좋다', 긴장: '하고 싶은 것과 마음이 원하는 것이 자주 어긋나 스스로 갈등한다', 융합: '자기 감정과 의지가 한 덩어리라 몰입이 강하다' },
      '태양-토성': { 조화: '어릴 때부터 책임감이 몸에 배어 신뢰를 얻는다', 긴장: '늘 부족하다고 느끼며 스스로를 몰아붙인다. 인정받는 데 목마르다', 융합: '일찍 어른이 된 사람. 무겁지만 단단하다' },
      '달-토성': { 조화: '감정을 절제할 줄 아는 어른스러움', 긴장: '감정을 드러내면 안 된다고 배워 혼자 삼킨다. 외로움의 뿌리', 융합: '정서적으로 일찍 독립했지만 그만큼 결핍이 있다' },
      '달-명왕성': { 조화: '사람 속을 꿰뚫는 깊은 감정 통찰', 긴장: '애착이 강해 집착·통제를 사랑으로 착각하기 쉽다', 융합: '감정의 밀도가 극단적으로 깊다' },
      '금성-토성': { 조화: '오래가는 진중한 사랑을 만든다', 긴장: '사랑에 조건을 붙이거나 마음을 늦게 연다. 애정 결핍의 흔적', 융합: '가볍게 사랑하지 못하는 사람. 늦지만 깊다' },
      '금성-천왕성': { 조화: '연애에서 자유롭고 독특한 매력', 긴장: '설렘에 훅 빠졌다 훅 식는다. 구속을 못 견딘다', 융합: '평범한 관계로는 만족 못 한다' },
      '금성-해왕성': { 조화: '낭만적이고 예술적인 사랑의 감각', 긴장: '콩깍지가 두꺼워 상대를 이상화하다 상처받는다', 융합: '사랑을 환상으로 그리는 사람' },
      '화성-토성': { 조화: '끈질기게 밀어붙여 결과를 낸다', 긴장: '하고 싶은데 브레이크가 걸린다. 참다가 한 번에 터진다', 융합: '욕망을 억누르며 사는 사람' },
      '화성-명왕성': { 조화: '한번 정하면 끝을 보는 폭발적 추진력', 긴장: '관계의 온도가 극단적이다. 격렬하게 타오르다 파괴적으로 끝난다', 융합: '집념이 무섭게 강하다' },
      '수성-토성': { 조화: '깊이 있게 사고하고 신중하게 말한다', 긴장: '말하기 전에 재고 또 재느라 표현이 늦다', 융합: '생각이 무겁고 진지하다' },
      '태양-목성': { 조화: '운이 따르고 사람이 모인다', 긴장: '자신감이 과해 일을 크게 벌인다', 융합: '스케일이 큰 사람' },
      '달-금성': { 조화: '정서적으로 따뜻하고 사랑스러운 기질', 긴장: '애정 욕구와 감정 사이에서 흔들린다', 융합: '사랑받고 싶은 마음이 크다' }
    };
    const aspectLines = [];
    const pnames = Object.keys(planets).filter(n => planets[n]);
    for (let i = 0; i < pnames.length; i++) {
      for (let j = i + 1; j < pnames.length; j++) {
        const a = pnames[i], b = pnames[j];
        let diff = Math.abs(planets[a].abs - planets[b].abs) % 360;
        if (diff > 180) diff = 360 - diff;
        for (const asp of ASPECTS) {
          if (Math.abs(diff - asp.ang) <= asp.orb) {
            const key = PAIR_MEANING[`${a}-${b}`] ? `${a}-${b}` : (PAIR_MEANING[`${b}-${a}`] ? `${b}-${a}` : null);
            if (key) {
              const meaning = PAIR_MEANING[key][asp.tone];
              if (meaning) aspectLines.push(`【각도】 ${a}-${b} ${asp.name}(${asp.tone}, 오차 ${Math.abs(diff - asp.ang).toFixed(1)}도) → ${meaning}`);
            }
            break;
          }
        }
      }
    }
    if (aspectLines.length) {
      highlights.push('--- 아래는 행성 간 각도다. 이 사람 성격·연애 패턴의 가장 정밀한 근거이니 반드시 최소 2개는 해석에 녹여라 ---');
      aspectLines.slice(0, 8).forEach(l => highlights.push(l));
    }

    if (highlights.length) {
      lines.push('\n[🔬 이 사람만의 특이 배치 - 중심 스토리로 반드시 활용하라]');
      highlights.forEach(h => lines.push(h));
    }
    return lines.join('\n');
  } catch (e) { return null; }
}


// ===== 🪐 실제 목성 트랜짓 계산 (2026.08 ~ 2034.12, 매달) =====
// 사람마다 배우자궁을 지나는 진짜 시기가 다르도록, 실제 천문 계산값을 표로 저장해두고 조회한다.
// 이렇게 해야 모든 손님의 만남 시기가 2026~2028로 획일화되는 문제가 사라진다.
const JUPITER_TABLE_START = { year: 2026, month: 8 };
const JUPITER_LON_TABLE = [126.96,133.7,139.59,144.32,146.79,146.44,143.35,139.75,137.23,137.49,140.41,145.13,151.2,157.84,164.27,170.28,174.81,177.31,176.9,174.08,170.18,167.79,168.03,170.79,175.57,181.59,187.99,194.6,200.38,204.96,207.28,206.89,203.95,200.22,197.76,197.94,200.73,205.53,211.39,218.07,224.54,230.57,235.17,237.39,237.11,234.33,230.5,228.06,228.19,231.01,235.72,241.9,248.52,255.37,261.56,265.92,268.66,268.61,265.9,262.17,259.5,259.53,262.23,267.17,273.31,280.36,287.44,293.49,298.64,301.6,301.9,299.51,295.63,292.76,292.59,295.31,300.16,306.66,313.91,320.52,327.3,332.71,336.34,337.28,335.32,331.47,328.28,327.59,329.89,334.74,341.23,347.82,355.28,2.1,8.1,12.22,13.94,12.61,9.06,5.35,4.03];

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function findJupiterTransitWindows(targetDeg, ctx) {
  // 여러 각도를 모두 수집한 뒤 시간순 정렬 → 가까운 미래부터 제시
  const aspects = [
    { name: '합 · 강력', angle: 0, orb: 6, weight: 3 },
    { name: '삼각 · 우호적', angle: 120, orb: 5, weight: 2 },
    { name: '삼각 · 우호적', angle: 240, orb: 5, weight: 2 },
    { name: '육각 · 기회', angle: 60, orb: 4, weight: 1 },
    { name: '육각 · 기회', angle: 300, orb: 4, weight: 1 }
  ];

  const all = [];
  for (const asp of aspects) {
    let inWindow = false;
    let windowStart = null;
    for (let i = 0; i < JUPITER_LON_TABLE.length; i++) {
      const diff = angleDiff(JUPITER_LON_TABLE[i], (targetDeg + asp.angle) % 360);
      const within = diff <= asp.orb;
      if (within && !inWindow) { inWindow = true; windowStart = i; }
      if (!within && inWindow) {
        inWindow = false;
        all.push({ start: windowStart, end: i - 1, name: asp.name, weight: asp.weight });
      }
    }
    if (inWindow) {
      all.push({ start: windowStart, end: JUPITER_LON_TABLE.length - 1, name: asp.name, weight: asp.weight });
    }
  }

  if (all.length === 0) return null;

  // 시간순 정렬 (가까운 미래부터)
  all.sort(function(a, b) { return a.start - b.start; });

  /* 🚨 v2 (2026-08-04) — '가장 강력한 결혼 적기' 산출
     기존에는 weight(합3·삼각2·육각1)를 계산해놓고 버렸다.
     상위 3개 중 weight 최고(동률이면 더 가까운 미래)를 ★로 표시해
     card5가 '가장 강력한 시기'를 빨간 강조로 못 박을 수 있게 한다.
     연도는 ctx.strongestYear 에 저장해 gateCheck 가 인용 여부를 검사한다. */
  /* 전체 창 중 최강(합>삼각>육각, 동률이면 더 가까운 미래)을 먼저 확정하고,
     시간순 상위 3개에 없으면 마지막 자리를 밀어내고 강제 포함한다.
     (예: 삼각 2028·2028, 육각 2030, 합 2032 → 합이 잘려나가 차상위에 ★가 붙던 결함 수정) */
  let strongest = all[0];
  for (let i = 1; i < all.length; i++) {
    if (all[i].weight > strongest.weight) strongest = all[i];
  }
  let top = all.slice(0, 3);
  if (top.indexOf(strongest) === -1) {
    top[top.length - 1] = strongest;
    top.sort(function(a, b) { return a.start - b.start; });
  }
  const strongestIdx = top.indexOf(strongest);

  return top.map(function(w, idx) {
    const sy = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + w.start) / 12);
    const sm = ((JUPITER_TABLE_START.month - 1 + w.start) % 12) + 1;
    const ey = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + w.end) / 12);
    const em = ((JUPITER_TABLE_START.month - 1 + w.end) % 12) + 1;
    const period = (sy === ey)
      ? sy + '년 ' + sm + '월~' + em + '월'
      : sy + '년 ' + sm + '월 ~ ' + ey + '년 ' + em + '월';
    let out = period + ' (목성 ' + w.name + ')';
    if (idx === strongestIdx) {
      out += ' ★★각도상 가장 강력한 결혼·만남의 창★★';
      if (ctx) ctx.strongestYear = String(sy);
    }
    return out;
  });
}

const handler = async (req, res) => {
  // 🚨 [다시보기 기능] GET + orderId → 이미 저장된 리포트를 KV에서 즉시 조회
  // 회원/비회원, 어느 기기로 접속하든 주문번호만 있으면 리포트를 다시 볼 수 있다.
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(`report:${orderId}`);
      res.setHeader('Cache-Control', 'no-store');
      if (saved) return res.status(200).json(saved);
      /* 프론트가 폴링할 때 "아직 만드는 중"과 "정말 없음"을 구분해야
         손님에게 실패 화면을 성급하게 띄우지 않는다. */
      const st = await kv.get(`status:${orderId}`);
      if (st && st.state === 'pending') {
        return res.status(202).json({ status: 'pending' });
      }
      return res.status(404).json({ error: '저장된 리포트 없음', state: st ? st.state : 'none' });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log("✅ [1] gemini.js 진입 성공");

  /* 🚨 catch 블록에서도 써야 하므로 try 밖에서 잡는다 */
  const body0   = req.body || {};
  const orderId = body0.orderId ? String(body0.orderId).slice(0, 60) : null;
  let lockKey   = null;

  /* 실패로 끝날 때 반드시 거쳐가는 문. 락을 풀고 실패 사유를 남긴다.
     ── 이게 없으면 손님 문의가 들어와도 "무엇이 왜 실패했는지"를 알 길이 없다. */
  async function finishFail(status, message, detail) {
    if (orderId) {
      try {
        await kv.set(`status:${orderId}`,
          { state: 'failed', error: String(detail || message).slice(0, 400), at: Date.now() },
          { ex: 60 * 60 * 24 * 30 });
      } catch (e) {}
      if (lockKey) { try { await kv.del(lockKey); } catch (e) {} }
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(status).json({ error: message, detail: detail || undefined });
  }

  try {
    const { name, date, time, city, myGender, targetGender } = body0;

    if (!name || !date || !time) {
      return res.status(400).json({ error: '필수 입력값 누락' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return await finishFail(500, '서버 설정 오류(GEMINI)', 'GEMINI_API_KEY 없음');
    }

    /* ────────────────────────────────────────────────────────────────
       ★ 손님 출생정보를 "리포트를 만들기 전에" 서버에 먼저 박아둔다.

       예전에는 출생정보가 손님 브라우저 localStorage 에만 있었다.
       그래서 생성이 한 번 실패하면 —
         · 손님이 다른 기기로 들어오면 아무것도 복구할 수 없고
         · 우리도 그 손님이 누구인지, 무엇을 넣었는지 알 수 없었다.
       "결제했는데 리포트가 안 열려요" 문의에 손도 못 대던 이유가 이것이다.

       이제 주문번호만 있으면 언제든 다시 만들 수 있다. (90일 보관)
       ──────────────────────────────────────────────────────────────── */
    if (orderId) {
      try {
        await kv.set(`intake:${orderId}`, {
          product: '9', name, date, time,
          city: city || 'Seoul', myGender, targetGender,
          timeUnknown: !!body0.timeUnknown,
          at: Date.now()
        }, { ex: 60 * 60 * 24 * 90 });
      } catch (e) { console.log('⚠️ intake 저장 실패(생성은 계속):', e.message); }

      /* 이미 완성된 리포트가 있으면 다시 만들지 않는다.
         새로고침·중복 클릭마다 새로 만들면 내용이 매번 달라지고 비용도 배로 나간다. */
      try {
        const done = await kv.get(`report:${orderId}`);
        if (done && !done.error) {
          console.log('♻️ 완성본 재사용:', orderId);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(200).json(done);
        }
      } catch (e) {}

      /* 생성 락 — 같은 주문이 동시에 두 번 Gemini 를 때리는 것을 막는다.
         (손님이 새 창을 열거나 재시도 버튼을 연타할 때 실제로 일어난다) */
      lockKey = `lock:${orderId}`;
      try {
        const got = await kv.set(lockKey, '1', { nx: true, ex: 280 });
        if (!got) {
          console.log('⏳ 이미 생성 중:', orderId);
          res.setHeader('Cache-Control', 'no-store');
          return res.status(202).json({ status: 'pending', message: '리포트를 만들고 있습니다.' });
        }
        await kv.set(`status:${orderId}`, { state: 'pending', at: Date.now() }, { ex: 60 * 60 });
      } catch (e) { lockKey = null; }
    }

    let location = cityCoordinates[city];
    if (!location) {
        console.error(`⚠️ 출생지 좌표 없음: "${city}" → 서울로 임시 처리됨. 도시 목록 확인 필요!`);
        location = cityCoordinates["Seoul"];
    }
    const dateTimeIso = buildBirthIso(date, time, city);

    let astrologyDataText = null;   // 🚨 기본값을 문장으로 두면 데이터 없이도 리포트가 나간다
    /* 이 요청 전용 차트 컨텍스트 — 동시 주문끼리 절대 섞이지 않는다 */
    const chartCtx = { snapshot: null, strongestYear: null };
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
        const tokenResponse = await fetch('https://api.prokerala.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.PROKERALA_CLIENT_ID, client_secret: process.env.PROKERALA_CLIENT_SECRET })
        });
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const astroResponse = await fetch(
            `https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`,
            { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
          );
          if (astroResponse.ok) {
            const astroJson = await astroResponse.json();
            /* 🚨 예전에는 digest 가 null 이면 원본 JSON 을 그대로 프롬프트에 부었다.
                  사이더리얼 좌표에 하우스도 없는 덩어리라 AI 가 지어낼 수밖에 없었다. */
            const digest = buildChartDigest(astroJson.data, dateTimeIso, location, chartCtx);
            if (digest) {
              astrologyDataText = digest;
              console.log("📊 차트 다이제스트(Prokerala):\n" + digest);
            } else {
              console.warn("⚠️ Prokerala 응답으로 차트를 못 만듦 → 자체 계산으로 전환");
            }
          }
        }
      }
    } catch (e) { console.log("⚠️ Prokerala 실패:", e.message); }

    /* Prokerala 가 죽었거나 비었으면 자체 계산으로 만든다.
       오차 1.7분이라 트로피컬 해석에는 아무 지장이 없다. */
    if (!astrologyDataText) {
      try {
        const localDigest = buildChartDigest(
          { planet_position: localPlanetList(dateTimeIso) }, dateTimeIso, location, chartCtx);
        if (localDigest) {
          astrologyDataText = localDigest;
          console.log("📊 차트 다이제스트(자체 계산):\n" + localDigest);
        }
      } catch (e) { console.error("🔥 자체 계산도 실패:", e.message); }
    }

    /* 🚨 최종 가드 — 차트가 없으면 리포트를 만들지 않는다.
       예전에는 여기서 '정밀 천체 궤도 역산 데이터 기반.' 한 문장만 들고
       리포트를 썼다. 손님은 돈을 내고 통째로 지어낸 글을 받았다. */
    if (!astrologyDataText) {
      console.error('🔥 차트를 만들지 못했습니다 — 리포트 생성을 중단합니다');
      return await finishFail(500, '출생 차트를 계산하지 못했습니다. 잠시 후 다시 시도해주세요.', '차트 생성 실패');
    }

    console.log("✅ [2] 차트 확보 완료, Gemini 호출 시작");

    // 🚨 오늘 날짜를 명시해서 AI가 과거 연도를 쓰는 버그 차단
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    /* 프롬프트에서 쓸 손님 정보 */
    const customerName = String(name || '고객').trim();
    const cityResolved = !!(cityCoordinates && cityCoordinates[city]);
    const isTimeUnknown = !!(req.body && (req.body.timeUnknown || !time || String(time).trim() === ''));
    const genderLine = (myGender && targetGender)
      ? `손님은 ${myGender}이고, 찾는 상대는 ${targetGender}이다. 배우자 묘사는 ${targetGender} 기준으로 써라.`
      : '손님의 성별 정보가 없으니 배우자 묘사에서 성별을 단정하지 말고 중립적으로 써라.';


/* ── 강조 남용 검사 ──────────────────────────────────────────
   "강조하지 마라"는 지시만으로는 안 지킨다. 실제로 세어봐야 한다.
   행성·별자리 이름에 <b>를 씌우면 정작 중요한 문장이 묻힌다. */
const NOUN_ONLY = ['태양','달','수성','금성','화성','목성','토성','천왕성','해왕성','명왕성',
  '상승점','천정','노스노드','사우스노드',
  '양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
  '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

function emphasisIssue(text) {
  const t = String(text || '');
  const bolds = (t.match(/<b>([\s\S]*?)<\/b>/g) || [])
    .map(function (x) { return x.replace(/<\/?b>/g, '').trim(); });
  if (bolds.length > 6) return '한 카드에 금색 강조가 ' + bolds.length + '개 (3개 이하로)';
  /* 명사 하나만 통째로 감싼 경우 */
  for (const b of bolds) {
    if (b.length <= 6 && NOUN_ONLY.indexOf(b.replace(/[·\s]/g, '')) >= 0) {
      return '행성·별자리 이름에 강조: "' + b + '" (판정 문장에만 쳐라)';
    }
  }
  const reds = (t.match(/color:\s*#ff3b30/g) || []).length;
  if (reds > 2) return '빨간 경고가 ' + reds + '개 (1개만)';
  return null;
}

    /* ── 품질 게이트 ─────────────────────────────────────────────
       VVIP 에는 있는데 배우자에는 없었다. 그래서 발뺌 화법과 별자리 일반론이
       그대로 나갔다. 걸리면 다시 쓰게 한다. */
    const BANNED = ['undefined', 'null', 'NaN', '트랜짓 항목', '데이터에 없음',
      '우주가 당신', '에너지가', '파동', '기운이 흐르', '다시 말해', '살펴보겠습니다',
      '일 수 있습니다', '느낌도 있습니다', '경우에 따라', '아마도',
      '긍정적으로 생각', '시간이 해결'];
    const NEED_LEN = {
      card2_analysis: 550, card3_appearance: 380, card4_career: 580,
      card5_timing: 660, card6_chemistry: 380, card7_destiny_guide: 450
    };   // v2: card4(돈 스타일 추가)·card5(최강 시기 추가) 목표 상향에 맞춰 게이트도 상향
    const strip = function (v) { return String(v || '').replace(/<[^>]+>/g, ''); };

    function gateCheck(d) {
      if (!d || typeof d !== 'object') return '파싱 결과 없음';
      const all = Object.keys(d).map(function (k) { return strip(d[k]); }).join(' ');
      for (const w of BANNED) if (all.indexOf(w) >= 0) return '금지 표현: ' + w;
      for (const k in NEED_LEN) {
        const n = strip(d[k]).length;
        if (n < NEED_LEN[k]) return k + ' 분량 부족 (' + n + '/' + NEED_LEN[k] + ')';
      }
      /* 오차까지 인용했는지 — 계산했다는 유일한 증거다 */
      if (!/오차\s*[\d.]+\s*도/.test(all)) return '각도 오차 인용 없음';
      /* v2: 가장 강력한 결혼 적기가 계산됐는데 card5가 그 연도를 인용하지 않으면 실패.
         모델이 ★★ 구간을 무시하고 딴 연도를 최강으로 쓰는 사고를 서버가 막는다. */
      if (chartCtx.strongestYear && strip(d.card5_timing).indexOf(chartCtx.strongestYear) === -1)
        return 'card5 가장 강력한 시기(' + chartCtx.strongestYear + '년) 미인용';
      /* 강조 남용 */
      for (const k in NEED_LEN) {
        const em = emphasisIssue(d[k]);
        if (em) return k + ' — ' + em;
      }
      return null;
    }

    const prompt = `
[🚨 절대 금지]
'undefined', 'null', 'NaN', '트랜짓 항목', '데이터에 없음' 같은 시스템 용어를 본문에 쓰지 마라. 손님은 일반인이다.
아래 [실제 계산] 항목에 없는 각도·날짜·배치를 지어내면 치명적 실패다.

[🚨 시간 기준]
오늘은 ${todayStr}이다. 모든 미래 시기는 오늘 이후의 연·월로만 써라. 지난 연도를 미래로 쓰면 실패다.

너는 명리학을 십 년 넘게 공부한 뒤 서양 점성술로 옮겨온 상담가다.
이과 출신이라 근거 없는 말을 싫어하고, 손님이 확인할 수 없는 이야기를 파는 걸 부끄러워한다.
${customerName}님이 9,900원을 내고 "내 배우자는 어떤 사람인가"를 물으러 왔다.

${genderLine}

────────────────────────────────────────
${astrologyDataText}
────────────────────────────────────────

[이 리포트가 반드시 지켜야 할 것 — 여기서 승부가 난다]

■ 1. 과거를 먼저 맞혀라
   미래 이야기만 하면 손님은 확인할 방법이 없다. 읽는 순간엔 재밌지만 남는 게 없고,
   "이거 맞는 말인지 내가 어떻게 아나" 하고 덮는다.
   그래서 card2에서 <b>지금까지의 연애 패턴</b>을 먼저 짚는다.
   금성과 화성 배치를 근거로, 이 사람이 어떤 상대에게 반복해서 끌렸고
   왜 같은 지점에서 어긋났는지를 장면으로 그려라.
   여기서 "어떻게 알았지" 소리가 나와야 뒤의 미래 이야기가 전부 믿음이 된다.

■ 2. 각도를 오차까지 인용하라
   위 [실제 계산된 각도]에서 최소 2개를 골라, 본문에 오차까지 밝혀 써라.
   예: "당신의 금성과 토성이 <b>오차 0.8도</b>로 맞물려 있습니다."
   이 한 줄이 "계산했다"는 유일한 증거다. 없으면 별자리 운세와 구분이 안 된다.

■ 3. 외모를 지어내지 마라
   차트로 키·이목구비를 특정할 근거는 약하다. 그런 문장은 뻔한 별자리 일반론으로 읽힌다.
   card3은 <b>인상과 태도</b>로 써라.
   "처음엔 차갑다고 느끼실 겁니다. 세 번째 만남쯤 그게 신중함이었다는 걸 아시게 됩니다."
   이런 문장이 근거도 있고 나중에 검증도 된다.

■ 4. 시기는 준 것만 써라
   [실제 계산된 목성 트랜짓]에 있는 시기만 인용하라.
   "없다"고 나왔으면 정직하게 그렇게 말하고, 시기 대신 태도와 자리를 넓히는 쪽으로 안내하라.
   지어낸 연월은 손님이 몇 달 뒤에 알아차린다.

■ 5. 틀릴 수 있는 조건을 밝혀라
   card7 끝에 한 문단을 넣어라.
   "이 해석이 어긋난다면 그건 ○○ 때문입니다" 형태로, 어떤 조건에서 다르게 흐르는지를 써라.
   전부 맞다고 하는 글보다 이게 훨씬 믿음직하다.

[문장 규칙]
· 발뺌 금지: '~일 수 있습니다', '~한 느낌도 있습니다', '아마', '경우에 따라' 금지.
  '~한 편입니다', '~합니다'로 부드럽게 단정하라.
· 유사영성 금지: 우주가 당신에게, 에너지, 파동, 기운이 흐르다.
· 덕담 금지: 긍정적으로 생각하세요, 시간이 해결해줍니다.
· 각 단락에 15자 이내의 짧은 단정문을 하나씩 넣어라. 문장 길이가 균일하면 기계가 쓴 것처럼 읽힌다.
· 별자리 일반론 금지. "사자자리는 열정적" 같은 문장은 한 줄도 쓰지 마라.
  이 사람의 이 배치에만 해당하는 이야기를 써라.
· 마크다운(*) 금지. 단락 구분은 <br><br>.
[강조 표시 — 여기가 리포트의 인상을 결정한다]
강조는 두 가지만 쓴다.
  금색 형광펜 : <b>...</b>
  빨간 경고   : <span style="color:#ff3b30;font-weight:900;">...</span>

■ 금색은 <b>손님에 대한 판정</b>에만 친다. 한 카드에 2~3개.
   손님이 캡처해서 친구에게 보낼 만한 문장, 다시 읽고 싶은 문장에만 친다.
   예) 금성이 전갈자리에 있습니다. <b>좋아하면 다 주는 사람입니다.</b>

■ 빨강은 <b>경고</b>에만 친다. 한 카드에 최대 1개.
   하면 안 되는 것, 피해야 할 사람, 놓치면 되돌리기 어려운 것.
   단 하나의 예외: card5의 '가장 강력한 결혼의 창' 시기 문장은 경고가 아니라도 빨간 강조로 못 박는다.

■ 절대 강조하지 않는 것 : 행성 이름, 별자리 이름, 하우스 번호, 각도 수치, 날짜.
   그건 정보지 판정이 아니다. 명사에 색을 칠하면 정작 중요한 문장이 묻힌다.
   ❌ <b>금성</b>이 <b>전갈자리</b>에 있어서
   ✅ 금성이 전갈자리에 있습니다. <b>좋아하면 다 주는 사람입니다.</b>

■ 개수를 넘기지 마라. 많이 칠수록 아무것도 안 보인다.
   한 문단에 두 개 이상 치지 마라.

[💥 팩트폭력 규격 — 이 리포트가 캡처되어 퍼지게 만드는 장치]
카드마다 최소 하나(card1·티저 제외), 읽는 순간 "어떻게 알았지" 소리가 나오는 뼈 때리는 단정을 넣어라. 단:
① 반드시 위 차트에 실제로 있는 배치에서만 도출하라. 근거 없는 팩폭은 치명적 실패다. 예시 매핑 —
   · 금성-토성 긴장 → "사랑에 조건을 붙여왔습니다. 이 사람이면 안전한가부터 계산하죠. 그래서 마음이 늦게 열립니다."
   · 금성-명왕성 긴장 → "사랑과 소유를 구분 못 해서 관계를 통째로 태워먹은 적이 있으실 겁니다."
   · 달-천왕성 긴장 → "안정을 원한다고 말하면서, 막상 편안한 사람이 오면 제일 먼저 지루해하는 건 본인입니다."
   · 달-토성 긴장 / 토성 4하우스 → "집에 사랑이 없던 게 아닙니다. 사랑에 조건이 붙어 있었죠. 그래서 받는 게 어색한 겁니다."
   · 달·금성이 목성과 조화인데 명왕성·천왕성 긴장 동반 → "부족한 것 없이 사랑받았는데도 늘 허기가 졌을 겁니다. 자극 없이는 못 견디는 배치라 그렇습니다."
   · 8하우스 토성 → "배우자 돈으로 편하게 살 팔자는 아닙니다. 같이 벌어야 합니다."
② 팩폭과 근거(도·분 또는 각도)는 반드시 같은 단락 안에 붙여 써라. 근거 없이 던지는 순간 점쟁이 사기가 된다.
③ 팩폭으로 끝내지 마라. 반드시 '그래서 그 기질을 어떻게 쓰면 무기가 되는지'로 닫아라.
④ '~하면 안 됩니다' 류 금지 팩폭은 리포트 전체에서 최대 두 개. 해당 배치가 없으면 아예 쓰지 마라.
⑤ 팩폭 문장이야말로 금색 <b> 1순위 후보다. 명사가 아니라 판정 문장에 쳐라.

· 순수 JSON 객체만 출력. 앞뒤에 아무것도 붙이지 마라.

[출력 JSON]
{
  "core_sentence": "(45자 이내) 이 사람의 인연을 관통하는 한 문장. 차트 근거에서 나온 것이어야 한다. 예: '먼저 다가가지 않아서 놓친 사람이 많았습니다'",
  "card1_title": "(20자 이내) 배우자를 한 마디로. 예: '말수 적고 뒤가 단단한 사람'",
  "guardian_symbol_1": "(이모지 1개)",
  "guardian_name_1": "(2~4자 키워드)",
  "guardian_symbol_2": "(이모지 1개)",
  "guardian_name_2": "(2~4자)",
  "guardian_symbol_3": "(이모지 1개)",
  "guardian_name_3": "(2~4자)",

  "card2_analysis": "(700자 이상) ★가장 중요한 카드★ 지금까지의 연애 패턴을 먼저 맞힌다. 금성·화성 배치와 각도를 근거로, 어떤 사람에게 반복해서 끌렸는지, 관계가 어느 지점에서 늘 같은 방식으로 어긋났는지를 장면으로 써라. 대사가 들릴 만큼 구체적으로. 그다음 그 패턴이 어디서 왔는지(달·토성·12하우스 등)를 짚어라. 마지막에 '이걸 알고 나면 다음 사람은 달라집니다' 방향으로 닫아라.",

  "card3_appearance": "(500자 이상) 배우자의 인상과 태도. 키·이목구비 같은 외모 특정은 금지. 처음 만났을 때의 느낌, 말투, 사람을 대하는 방식, 몇 번 만나야 진짜 모습이 보이는지를 써라. 7하우스 별자리와 그 안의 행성이 근거다.",

  "card4_career": "(750자 이상) 그 사람의 사회적 위치와 돈. 두 부분으로 써라.\\n\\n① 직업의 결: 7하우스 지배성이 있는 하우스를 근거로. 두루뭉술한 '전문직' 금지, 어떤 방식으로 일하는 사람인지.\\n\\n② 돈 버는 스타일 — 이 카드의 승부처다. 사주 용어와 대비해 단정하라: 다달이 꼬박꼬박 쌓는 사람(사주로 치면 정관·정재 스타일)인가, 한 번에 크게 당기는 사람(편재 스타일)인가. 근거는 8하우스다 — 8하우스는 7하우스에서 두 번째 방, 즉 <b>배우자의 지갑</b>이다. 8하우스의 별자리·행성과 7하우스 지배성의 품위를 근거로 반드시 다음 중 하나로 단정하라. 부자 배치면 부자라고 그대로 말하라. 8하우스에 목성·금성이 있거나 지배성 품위가 좋으면 → <b>결혼이 곧 재테크가 되는 배치입니다</b> 수준으로 화끈하게. 8하우스에 토성이 있거나 비어 있고 지배성이 약하면 → '배우자 돈으로 편하게 살 팔자는 아닙니다. 같이 벌어야 합니다'라고 정직하게 팩폭하라. 애매하게 '둘 다 가능' 금지. 위 하우스 배치에 실제로 있는 것만 근거로 쓰고, 8하우스가 비었으면 8하우스 별자리의 지배성이 어느 방에 있는지로 판단하라.",

  "card5_timing": "(850자 이상) ★두 번째로 중요★ 만남의 시기와 자리. [실제 계산된 목성 트랜짓]의 연·월을 그대로 인용하고, 왜 그 시기인지 근거를 밝혀라. 그리고 🚨핵심: 목록에서 ★★ 표시된 구간을 <span style='color:#ff3b30;font-weight:900;'>가장 강력한 결혼의 창</span>으로 빨간 강조 한 곳에 못 박아라 — 시기 문장 통째로. 왜 그 구간이 최강인지(합은 목성이 배우자궁 문 앞에 정확히 서는 각이라 가장 세다는 식으로, 쉬운 말로) 근거를 붙여라. 다른 구간을 최강으로 바꾸거나 임의 연도를 만들면 치명적 실패다. 그다음 7하우스 지배성이 있는 하우스를 근거로 '어디서 만나는지'를 구체적으로 짚어라. ★★ 구간이 없거나 시기가 계산되지 않았으면 정직하게 말하고 자리 쪽에 집중하라.",

  "card6_chemistry": "(500자 이상) 두 사람이 만나면 생기는 일. 잘 맞는 지점과 <span style='color:#ff3b30;font-weight:900;'>반드시 부딪히는 지점</span>을 함께 써라. 좋은 말만 있으면 안 믿는다. 각도를 최소 1개 인용하라.",

  "card7_destiny_guide": "(600자 이상) 이 인연을 잡기 위해 오늘부터 할 일 3가지. 다짐이 아니라 행동으로. 그리고 <span style='color:#ff3b30;font-weight:900;'>피해야 할 상대의 특징</span>을 빨간 글씨로 경고하라. 마지막 문단은 반증 조건 — '이 해석이 어긋난다면 그건 ○○ 때문입니다'.",

  "card8_teaser": "(150자 내외) 배우자 이야기는 여기까지. 그런데 왜 이 패턴이 반복됐는지, 그 뿌리는 본인 차트에 있다는 방향으로 자연스럽게 이어라. 강매하지 마라."
}
`;

    // ✅ Gemini v1beta 직접 호출
    // - thinkingBudget 4096: '생각' 기능 ON → 차트를 깊이 분석해 리포트 품질 대폭 상승
    //   (vercel.json에서 실행시간 300초 확보했으므로 타임아웃 걱정 없음)
    // - responseMimeType JSON: 순수 JSON만 답하도록 강제 (500 파싱에러 해결)
    // - 실패 시 자동 1회 재시도 + 깨진 JSON 복구 파싱
    let parsedData = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 32768,
                temperature: 0.9,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 4096 }
              }
            })
          }
        );

        if (!geminiRes.ok) {
          lastErr = `Gemini ${geminiRes.status}: ${await geminiRes.text()}`;
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          /* 503(과부하)·429(한도)는 구글 쪽 일시 문제다. 수십 초 지속되므로
             짧게 두드리면 같은 거절만 받는다. 위 RETRY_WAIT_MS 주석 참고. */
          if (geminiRes.status === 503 || geminiRes.status === 429) {
            const w = RETRY_WAIT_MS[attempt - 1] || 0;
            if (w) {
              console.warn(`⏳ Gemini ${geminiRes.status} — ${w / 1000}초 대기 후 재시도`);
              await new Promise(r => setTimeout(r, w));
            }
          }
          continue;
        }

        const geminiData = await geminiRes.json();
        console.log(`✅ [3] Gemini 응답 수신 (시도 ${attempt})`);

        const parts = (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts) || [];
        const responseText = parts.map(p => p.text || "").join("");
        const s = responseText.indexOf("{");
        const e = responseText.lastIndexOf("}");
        if (s === -1 || e === -1) {
          lastErr = "응답에 JSON 없음: " + responseText.slice(0, 200);
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          continue;
        }
        const cand = JSON.parse(responseText.slice(s, e + 1));
        const bad = gateCheck(cand);
        if (bad && attempt < 3) {
          lastErr = bad;
          console.warn(`⚠️ [시도 ${attempt}] 재생성 — ${bad}`);
          continue;
        }
        if (bad) console.warn(`⚠️ 마지막 시도라 그대로 채택 — ${bad}`);
        parsedData = cand;
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}] 실패:`, err.message);
      }
    }

    if (!parsedData) {
      return await finishFail(500, '리포트 생성이 지연되고 있습니다. 잠시 후 다시 열어주세요.', lastErr);
    }

    /* ── 서버가 만든 사실 자료를 응답에 붙인다 ──
       AI 가 손대지 않으므로 지어낼 수 없다. VVIP 와 같은 장치다. */
    try {
      if (chartCtx.snapshot && chartCtx.snapshot.planets) {
        parsedData.chart_table = buildChartTable(chartCtx.snapshot.planets, chartCtx.snapshot.ascAbs);
        parsedData.method_note = buildMethodNote(dateTimeIso, cityResolved, !!isTimeUnknown);
        parsedData.time_unknown = !!isTimeUnknown;
      }
    } catch (e) { console.warn('⚠️ 명세표 생성 실패:', e.message); }

    console.log("✅ [4] JSON 파싱 성공, 응답 전송");

    // 🚨 [다시보기 기능] 주문번호가 함께 왔으면 KV에 30일간 저장
    // → 이후 GET ?orderId=... 로 언제 어디서든 재조회 가능
    if (orderId) {
      try {
        /* 30일 → 180일. 카페24 주문내역은 훨씬 오래 남는데 리포트만 30일 뒤
           사라지면, 그때부터 "다시보기가 안 돼요" 문의가 시작된다. */
        await kv.set(`report:${orderId}`, parsedData, { ex: 60 * 60 * 24 * 180 });
        await kv.set(`status:${orderId}`, { state: 'completed', at: Date.now() }, { ex: 60 * 60 * 24 * 180 });
        console.log("💾 KV 저장 완료: report:" + orderId);
      } catch (e) {
        console.log("⚠️ KV 저장 실패(리포트 전송은 정상 진행):", e.message);
      }
      if (lockKey) { try { await kv.del(lockKey); } catch (e) {} }
    }

    res.setHeader('Cache-Control', 'no-store');
    res.status(200).json(parsedData);

  } catch (error) {
    console.error("🔥 gemini.js 에러:", error);
    return await finishFail(500, '잠시 문제가 있었습니다. 다시 열어주세요.', error.message);
  }
};

module.exports = allowCors(handler);
