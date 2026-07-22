// ============================================================================
//  lib/astro-synastry.js  —  아스트라노트 궁합(시너스트리) 엔진
// ----------------------------------------------------------------------------
//  ★ 이 파일은 gemini.js / gemini-vip.js 를 전혀 건드리지 않습니다.
//     완전 독립 모듈이므로, 배포해도 기존 9,900 / 29,900 상품에 영향 0.
//
//  하는 일:
//   1) 두 사람의 네이탈 차트를 트로피컬(서양식)로 확보
//   2) 두 차트 사이의 실제 각도(시너스트리 어스펙트) 전수 계산
//   3) 하우스 오버레이 (상대 행성이 내 몇 번째 방에 떨어지는가)
//   4) 합성차트(컴포짓) 중점 계산 → '관계 그 자체'의 성격
//   5) 목성 트랜짓 → 관계 분기점 시기 (테이블 없이 실시간 궤도 계산)
//   6) 궁합 점수를 코드에서 결정론적으로 산출 (AI가 지어내지 못하게)
//
//  ⚠️ 점수는 절대 AI에게 맡기지 않습니다. 같은 커플이 다시 사면 같은 점수가
//     나와야 하고, 후기/캡처 확산 시 신뢰가 깨지면 안 되기 때문입니다.
// ============================================================================

'use strict';

const RAD = Math.PI / 180;

const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                  '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

const PLANET_KR = {
  Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성',
  Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점'
};

// 시너스트리에서 실제로 의미 있는 것만 (해왕성·명왕성은 세대 행성이라 궁합 해석에 노이즈)
const SYN_PLANETS = ['태양','달','수성','금성','화성','목성','토성','상승점'];

const HOUSE_MEANING = {
  1: '자아·첫인상·존재감',
  2: '돈·소유·안정감',
  3: '대화·일상 연락·정보 교환',
  4: '가정·정착·마음의 안식처',
  5: '연애·설렘·즐거움·자녀',
  6: '일상 루틴·돌봄·현실 생활',
  7: '결혼·1:1 파트너십 ★핵심',
  8: '깊은 결속·성적 끌림·돈의 결합·집착',
  9: '가치관·배움·먼 여행',
  10: '사회적 관계·공개된 사이·커리어',
  11: '친구·동료·미래의 약속',
  12: '무의식·비밀·희생·놓지 못하는 마음'
};

/* --------------------------------------------------------------------------
   [1] 기본 수학
-------------------------------------------------------------------------- */
function norm360(x) { return ((x % 360) + 360) % 360; }

/** 받침 유무에 따라 조사를 고른다 ("화성가" 같은 오류 방지) */
function josa(word, withBatchim, withoutBatchim) {
  const code = String(word).charCodeAt(String(word).length - 1) - 0xAC00;
  const has = code >= 0 && code <= 11171 && (code % 28) !== 0;
  return word + (has ? withBatchim : withoutBatchim);
}

function angleDiff(a, b) {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}

function signDeg(lon) {
  const l = norm360(lon);
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: +(l % 30).toFixed(1), abs: l };
}

// 라히리 아야남샤 근사치 (Prokerala 사이더리얼 → 서양 트로피컬 보정)
// ※ 기존 gemini.js와 동일한 공식을 씁니다. 두 상품의 차트가 달라지면 안 되므로 절대 바꾸지 마세요.
function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000);
}

/* --------------------------------------------------------------------------
   [2] 목성 실시간 궤도 계산 (하드코딩 테이블 제거)
   ----------------------------------------------------------------------------
   JPL 근사 궤도요소(1800~2050) 기반 케플러 해법.
   검증: 2020-12-21 물병 0.32도(목성-토성 대합 실제값과 일치),
        2023-05-16 양자리 29.79도(황소 입궁일), 2026-06-30 게자리 29.96도(사자 입궁일).
   오차 0.3도 이내 → 어스펙트 오브(4~6도) 대비 충분히 정밀합니다.
-------------------------------------------------------------------------- */
const ORBIT = {
  earth:   { a:1.00000261, da:0.00000562, e:0.01671123, de:-0.00004392, I:-0.00001531, dI:-0.01294668,
             L:100.46457166, dL:35999.37244981, w:102.93768193, dw:0.32327364, O:0.0,          dO:0.0 },
  jupiter: { a:5.20288700, da:-0.00011607, e:0.04838624, de:-0.00013253, I:1.30439695, dI:-0.00183714,
             L:34.39644051,  dL:3034.74612775,  w:14.72847983,  dw:0.21252668, O:100.47390909, dO:0.20469106 }
};

function julianDay(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

function helioXYZ(el, T) {
  const a  = el.a + el.da * T;
  const e  = el.e + el.de * T;
  const I  = (el.I + el.dI * T) * RAD;
  const L  = el.L + el.dL * T;
  const w  = el.w + el.dw * T;
  const Od = el.O + el.dO * T;
  const O  = Od * RAD;
  const wp = (w - Od) * RAD;

  let M = (L - w) % 360;
  if (M > 180) M -= 360;
  if (M < -180) M += 360;
  M *= RAD;

  let E = M + e * Math.sin(M);
  for (let i = 0; i < 12; i++) E = E - (E - e * Math.sin(E) - M) / (1 - e * Math.cos(E));

  const xp = a * (Math.cos(E) - e);
  const yp = a * Math.sqrt(1 - e * e) * Math.sin(E);
  const cw = Math.cos(wp), sw = Math.sin(wp);
  const cO = Math.cos(O),  sO = Math.sin(O);
  const cI = Math.cos(I),  sI = Math.sin(I);

  return {
    x: (cw * cO - sw * sO * cI) * xp + (-sw * cO - cw * sO * cI) * yp,
    y: (cw * sO + sw * cO * cI) * xp + (-sw * sO + cw * cO * cI) * yp,
    z: (sw * sI) * xp + (cw * sI) * yp
  };
}

/** 특정 연/월의 목성 지구중심 황경(트로피컬, 도) */
function jupiterLongitude(year, month) {
  const T = (julianDay(year, month, 15) - 2451545.0) / 36525.0;
  const e = helioXYZ(ORBIT.earth, T);
  const j = helioXYZ(ORBIT.jupiter, T);
  let lon = Math.atan2(j.y - e.y, j.x - e.x) / RAD;
  lon += 1.396971 * T + 0.0003086 * T * T;   // J2000 황도 → 당대 황도(세차 보정)
  return norm360(lon);
}

/**
 * 목성이 targetDeg(합성차트 금성/태양 등)와 각을 맺는 시기를 찾는다.
 * 오늘부터 monthsAhead개월까지 월 단위 스캔.
 */
function findJupiterWindows(targetDeg, monthsAhead) {
  if (typeof targetDeg !== 'number' || isNaN(targetDeg)) return [];
  const months = monthsAhead || 96;   // 기본 8년

  const ASPECTS = [
    { name: '합 — 관계가 한 단계 도약',   angle: 0,   orb: 6, w: 3 },
    { name: '삼각 — 흐름이 부드러워짐',   angle: 120, orb: 5, w: 2 },
    { name: '삼각 — 흐름이 부드러워짐',   angle: 240, orb: 5, w: 2 },
    { name: '육각 — 기회가 열림',         angle: 60,  orb: 4, w: 1 },
    { name: '육각 — 기회가 열림',         angle: 300, orb: 4, w: 1 }
  ];

  const now = new Date();
  const baseY = now.getFullYear();
  const baseM = now.getMonth() + 1;

  // 미리 월별 목성 황경 테이블 생성 (계산 1회로 재사용)
  const table = [];
  for (let i = 0; i < months; i++) {
    const y = baseY + Math.floor((baseM - 1 + i) / 12);
    const m = ((baseM - 1 + i) % 12) + 1;
    table.push({ y, m, lon: jupiterLongitude(y, m) });
  }

  const found = [];
  for (const asp of ASPECTS) {
    const targetLon = norm360(targetDeg + asp.angle);
    let inWindow = false, start = null;
    for (let i = 0; i < table.length; i++) {
      const within = angleDiff(table[i].lon, targetLon) <= asp.orb;
      if (within && !inWindow) { inWindow = true; start = i; }
      if (!within && inWindow) {
        inWindow = false;
        found.push({ start, end: i - 1, name: asp.name, w: asp.w });
      }
    }
    if (inWindow) found.push({ start, end: table.length - 1, name: asp.name, w: asp.w });
  }

  if (!found.length) return [];
  found.sort((a, b) => a.start - b.start);

  return found.slice(0, 3).map(f => {
    const s = table[f.start], e = table[f.end];
    const period = (s.y === e.y && s.m === e.m)
      ? `${s.y}년 ${s.m}월`
      : (s.y === e.y)
        ? `${s.y}년 ${s.m}월~${e.m}월`
        : `${s.y}년 ${s.m}월 ~ ${e.y}년 ${e.m}월`;
    return `${period} (목성 ${f.name})`;
  });
}

/* --------------------------------------------------------------------------
   [3] Prokerala → 트로피컬 차트 객체
-------------------------------------------------------------------------- */
/**
 * @param opts.timeUnknown  출생시각 미상이면 true → 상승점을 통째로 버린다
 */
function parseChart(prokeralaData, dateTimeIso, opts) {
  const timeUnknown = !!(opts && opts.timeUnknown);
  const list = prokeralaData && (prokeralaData.planet_position || prokeralaData.planet_positions);
  if (!list || !list.length) return null;

  const ay = lahiriAyanamsa(dateTimeIso);
  const planets = {};
  for (const p of list) {
    const kr = PLANET_KR[p.name];
    if (!kr || typeof p.longitude !== 'number') continue;
    planets[kr] = signDeg(p.longitude + ay);   // 사이더리얼 → 트로피컬
  }
  if (!Object.keys(planets).length) return null;

  // 🚨 시각 미상: 상승점은 4분에 1도씩 움직인다. 추측이 불가능하므로 아예 버린다.
  //    (하우스 오버레이·7하우스 해석도 자동으로 빠진다)
  if (timeUnknown) delete planets['상승점'];

  const asc = planets['상승점'] || null;
  // 홀사인(Whole Sign): 상승점이 '속한 별자리'가 1하우스. 기존 리포트와 동일 방식.
  const ascSignIndex = asc ? Math.floor(asc.abs / 30) : null;

  return {
    planets,
    asc,
    ascSignIndex,
    timeUnknown,
    excluded: timeUnknown ? ['상승점'] : [],
    notes: timeUnknown ? ['출생시각 미상 → 상승점·하우스 해석 제외'] : []
  };
}

/**
 * 시각 미상인 사람의 달 처리.
 * 달은 하루에 최대 15.4도(별자리의 절반 이상) 움직인다. 정오값 하나로 쓰면 오답이 나온다.
 * 그래서 그날 00:00과 23:59의 실제 달 위치를 받아, 판단이 가능한 경우에만 쓴다.
 *
 * @param chart          parseChart 결과
 * @param moonStartSid   그날 00:00 달 황경 — Prokerala 원본값(사이더리얼) 그대로 넣으세요
 * @param moonEndSid     그날 23:59 달 황경 — Prokerala 원본값(사이더리얼) 그대로 넣으세요
 * @param dateTimeIso    아야남샤 계산용 날짜 (parseChart에 넣은 것과 동일하게)
 *
 * ⚠️ 좌표계를 섞으면 24도가 통째로 밀려 엉뚱한 별자리가 나옵니다.
 *    변환은 이 함수가 알아서 하니, 호출부에서 미리 보정하지 마세요.
 */
function applyMoonRange(chart, moonStartSid, moonEndSid, dateTimeIso) {
  if (!chart || !chart.timeUnknown) return chart;
  if (typeof moonStartSid !== 'number' || typeof moonEndSid !== 'number' || !dateTimeIso) {
    delete chart.planets['달'];
    chart.excluded.push('달');
    chart.notes.push('출생시각 미상 + 달 범위 확인 불가 → 달 해석 제외');
    return chart;
  }

  const ay = lahiriAyanamsa(dateTimeIso);
  const moonStart = moonStartSid + ay;   // 사이더리얼 → 트로피컬
  const moonEnd   = moonEndSid   + ay;

  let span = norm360(moonEnd - moonStart);
  if (span > 180) span = 360 - span;             // 방어적 처리
  const sameSign = Math.floor(norm360(moonStart) / 30) === Math.floor(norm360(moonEnd) / 30);

  if (!sameSign) {
    // 하루 중에 달이 별자리를 넘어간다 → 무엇을 골라도 절반은 틀린다. 버린다.
    delete chart.planets['달'];
    chart.excluded.push('달');
    chart.notes.push(
      `출생시각 미상이고, 그날 달이 ${SIGNS_KR[Math.floor(norm360(moonStart)/30)]}에서 ` +
      `${SIGNS_KR[Math.floor(norm360(moonEnd)/30)]}로 넘어간다 → 달 해석 제외(추측 금지)`
    );
    return chart;
  }

  // 하루 종일 같은 별자리 안에 있다 → 별자리는 확정. 도수만 범위로 표시하고 오브를 좁힌다.
  const mid = signDeg(midpoint(moonStart, moonEnd));
  chart.planets['달'] = mid;
  chart.moonUncertainDeg = +(span / 2).toFixed(1);
  chart.notes.push(
    `출생시각 미상이나 그날 달은 하루 종일 ${mid.sign} 안에 머문다 → 별자리는 확정, 도수는 ±${chart.moonUncertainDeg}도`
  );
  return chart;
}

/** 특정 황경이 이 차트의 몇 번 하우스인가 (홀사인) */
function houseOf(chart, lon) {
  if (chart.ascSignIndex === null) return null;
  const signIdx = Math.floor(norm360(lon) / 30);
  return ((signIdx - chart.ascSignIndex + 12) % 12) + 1;
}


/**
 * 🚨 출생시각 미상 전용 차트 빌더 (권장 방식)
 * ----------------------------------------------------------------------------
 * 그날 00:01과 23:59 두 시점의 Prokerala 응답을 받아, 행성별로 판정한다.
 *   · 하루 종일 같은 별자리 → 채택 (도수는 중점, 불확실폭 기록)
 *   · 하루 중 별자리를 넘어감 → 제외 (무엇을 골라도 절반은 틀리므로 추측 금지)
 * 상승점은 무조건 제외한다.
 *
 * 정오 단일 호출 대비 장점:
 *   · Prokerala 호출 3회 → 2회로 감소
 *   · 달뿐 아니라 태양·수성·금성이 경계에 걸린 경우도 자동 검출
 *     (태양이 별자리를 넘어가는 생일은 약 3%로 드물지 않다)
 */
function buildUnknownTimeChart(dataStart, dataEnd, dateTimeIso) {
  const cs = parseChart(dataStart, dateTimeIso, { timeUnknown: true });
  const ce = parseChart(dataEnd,   dateTimeIso, { timeUnknown: true });
  if (!cs || !ce) return null;

  const planets = {};
  const excluded = ['상승점'];
  const notes = ['출생시각 미상 → 상승점·하우스 해석 제외'];
  const uncertain = {};

  for (const p of SYN_PLANETS) {
    if (p === '상승점') continue;
    const a = cs.planets[p], b = ce.planets[p];
    if (!a || !b) continue;

    const sameSign = Math.floor(a.abs / 30) === Math.floor(b.abs / 30);
    if (!sameSign) {
      excluded.push(p);
      notes.push(`출생시각 미상이고 그날 ${josa(p, '이', '가')} ${a.sign}에서 ${b.sign}로 넘어간다 → ${p} 해석 제외(추측 금지)`);
      continue;
    }

    let span = norm360(b.abs - a.abs);
    if (span > 180) span = 360 - span;
    planets[p] = signDeg(midpoint(a.abs, b.abs));
    if (span > 1) {
      uncertain[p] = +(span / 2).toFixed(1);
      if (p === '달') {
        notes.push(`출생시각 미상이나 그날 달은 하루 종일 ${planets[p].sign} 안에 머문다 → 별자리 확정, 도수 ±${uncertain[p]}도`);
      }
    }
  }

  if (!Object.keys(planets).length) return null;

  return {
    planets,
    asc: null,
    ascSignIndex: null,
    timeUnknown: true,
    excluded,
    notes,
    uncertain,
    moonUncertainDeg: uncertain['달'] || 0
  };
}

/* --------------------------------------------------------------------------
   [4] 시너스트리 어스펙트 — 궁합 해석의 심장
-------------------------------------------------------------------------- */
const ASPECT_TYPES = [
  { key:'합',   angle:0,   base:8, tone:'강렬' },
  { key:'대립', angle:180, base:7, tone:'긴장' },
  { key:'삼각', angle:120, base:6, tone:'조화' },
  { key:'각',   angle:90,  base:6, tone:'마찰' },
  { key:'육각', angle:60,  base:4, tone:'우호' }
];

// 어떤 조합이 관계에서 얼마나 중요한가 (가중치). 값이 클수록 리포트 상단에 배치.
const PAIR_WEIGHT = {
  '태양-달': 10, '달-태양': 10,
  '금성-화성': 10, '화성-금성': 10,
  '달-달': 9,
  '달-금성': 8, '금성-달': 8,
  '태양-상승점': 8, '상승점-태양': 8,
  '달-상승점': 8, '상승점-달': 8,
  '금성-상승점': 7, '상승점-금성': 7,
  '태양-태양': 7,
  '금성-금성': 7,
  '달-화성': 7, '화성-달': 7,
  '토성-달': 7, '달-토성': 7,
  '토성-금성': 7, '금성-토성': 7,
  '태양-금성': 6, '금성-태양': 6,
  '태양-화성': 6, '화성-태양': 6,
  '토성-태양': 6, '태양-토성': 6,
  '수성-수성': 6,
  '화성-화성': 6,
  '목성-달': 5, '달-목성': 5,
  '목성-금성': 5, '금성-목성': 5,
  '수성-달': 5, '달-수성': 5,
  '수성-금성': 4, '금성-수성': 4
};

function orbFor(pA, pB, aspect, uncA, uncB) {
  let orb = aspect.base;
  const lum = (n) => (n === '태양' || n === '달');
  if (lum(pA) && lum(pB)) orb += 2;             // 태양·달끼리는 오브를 넓게
  if (pA === '상승점' || pB === '상승점') orb -= 2;  // 출생시각 오차 민감 → 좁게

  // 🚨 위치가 불확실한 행성(시각 미상)은 오브를 그 불확실폭만큼 깎는다.
  //    넓은 오브 + 불확실한 위치 = 있지도 않은 각을 만들어내는 지름길이다.
  if (uncA && uncA[pA]) orb -= uncA[pA];
  if (uncB && uncB[pB]) orb -= uncB[pB];

  return Math.max(1.5, orb);
}

/**
 * A차트 행성 × B차트 행성 전수 비교
 * @returns {Array} 강한 순으로 정렬된 어스펙트 목록
 */
function synastryAspects(chartA, chartB, nameA, nameB) {
  const out = [];
  for (const pA of SYN_PLANETS) {
    const a = chartA.planets[pA];
    if (!a) continue;
    for (const pB of SYN_PLANETS) {
      const b = chartB.planets[pB];
      if (!b) continue;

      const d = angleDiff(a.abs, b.abs);
      for (const asp of ASPECT_TYPES) {
        const orb = orbFor(pA, pB, asp, chartA.uncertain, chartB.uncertain);
        const off = Math.abs(d - asp.angle);
        if (off > orb) continue;

        const weight = PAIR_WEIGHT[`${pA}-${pB}`] || 2;
        const tight = 1 - (off / orb);            // 각이 정확할수록 1에 가까움
        out.push({
          pA, pB,
          aspect: asp.key,
          tone: asp.tone,
          orb: +off.toFixed(1),
          weight,
          strength: +(weight * (0.5 + tight * 0.5)).toFixed(2),
          text: `${nameA}님의 ${pA} — ${nameB}님의 ${pB} : ${asp.key}(${asp.tone}, 오차 ${off.toFixed(1)}도)`
        });
        break;   // 한 쌍은 하나의 각만
      }
    }
  }
  out.sort((x, y) => y.strength - x.strength);
  return out;
}

/* --------------------------------------------------------------------------
   [5] 하우스 오버레이 — "상대가 내 인생의 어느 방에 들어왔는가"
   (일반인이 가장 소름 돋아하는 파트. 7하우스/8하우스/12하우스가 핵심)
-------------------------------------------------------------------------- */
function houseOverlay(ownerChart, guestChart, ownerName, guestName) {
  if (ownerChart.ascSignIndex === null) return [];
  const KEY_HOUSES = [1, 4, 5, 7, 8, 10, 11, 12];
  const rows = [];
  for (const p of ['태양','달','금성','화성','토성','목성']) {
    const g = guestChart.planets[p];
    if (!g) continue;
    const h = houseOf(ownerChart, g.abs);
    if (!h) continue;
    rows.push({
      house: h,
      star: KEY_HOUSES.includes(h),
      text: `${guestName}님의 ${josa(p, '이', '가')} ${ownerName}님의 ${h}하우스(${HOUSE_MEANING[h]})에 들어감`
    });
  }
  rows.sort((a, b) => (b.star ? 1 : 0) - (a.star ? 1 : 0));
  return rows;
}

/* --------------------------------------------------------------------------
   [6] 합성차트(컴포짓) — '관계 그 자체'의 성격
   두 사람의 같은 행성 중점(짧은 호 기준)
-------------------------------------------------------------------------- */
function midpoint(l1, l2) {
  const a = norm360(l1), b = norm360(l2);
  let m = (a + b) / 2;
  if (Math.abs(a - b) > 180) m = norm360(m + 180);
  return norm360(m);
}

function compositeChart(chartA, chartB) {
  const comp = {};
  for (const p of ['태양','달','금성','화성','상승점']) {
    const a = chartA.planets[p], b = chartB.planets[p];
    if (!a || !b) continue;
    comp[p] = signDeg(midpoint(a.abs, b.abs));
  }
  return comp;
}

/* --------------------------------------------------------------------------
   [7] 궁합 점수 — 코드가 결정. AI는 손대지 못함.
   총점 + 4개 세부 점수. 같은 커플 = 항상 같은 점수 (재현성 보장)
-------------------------------------------------------------------------- */
const HARMONIOUS = ['합','삼각','육각'];
const HARD = ['각','대립'];

/** 사용 가능한 행성 조합의 '가중치 총량'. 정규화 계수 계산용. */
function weightMass(availA, availB, filterList) {
  let m = 0;
  for (const a of availA) {
    for (const b of availB) {
      if (filterList && !filterList.includes(a) && !filterList.includes(b)) continue;
      m += PAIR_WEIGHT[`${a}-${b}`] || 2;
    }
  }
  return m;
}

/**
 * @param availA/availB  실제로 쓸 수 있는 행성 목록. 생략하면 전체.
 *   시각 미상으로 상승점·달이 빠진 경우, 각의 개수가 줄어 점수가 부당하게 낮아진다.
 *   그래서 '가능했던 총량 대비 실제 총량' 비율로 되돌려 놓는다.
 */
function compatibilityScore(aspects, availA, availB) {
  // 영역별 관여 행성
  const AREA = {
    emotion:   ['달','태양'],                  // 감정 교류
    attraction:['금성','화성'],                // 끌림·설렘
    talk:      ['수성','태양','상승점'],        // 대화·이해
    lasting:   ['토성','목성','태양','달']      // 지속력·현실성
  };

  const A_ = availA && availA.length ? availA : SYN_PLANETS;
  const B_ = availB && availB.length ? availB : SYN_PLANETS;

  // 영역별 정규화 계수 (1.0 = 정보 완전, 1.0 초과 = 빠진 정보 보정)
  const norm = { total: 1, emotion: 1, attraction: 1, talk: 1, lasting: 1 };
  const fullMassAll = weightMass(SYN_PLANETS, SYN_PLANETS, null);
  const availMassAll = weightMass(A_, B_, null);
  norm.total = availMassAll > 0 ? Math.min(2.0, fullMassAll / availMassAll) : 1;

  const raw = { emotion:0, attraction:0, talk:0, lasting:0 };
  let total = 0;

  for (const a of aspects) {
    let sign;
    if (HARMONIOUS.includes(a.aspect)) {
      // 토성이 낀 '합'은 무거움 → 결속이지 즐거움이 아님
      sign = (a.aspect === '합' && (a.pA === '토성' || a.pB === '토성')) ? -0.3 : 1;
    } else {
      // 금성-화성 스퀘어는 오히려 끌림을 키움 (긴장된 매력)
      const spicy = (a.pA === '금성' && a.pB === '화성') || (a.pA === '화성' && a.pB === '금성');
      sign = spicy ? 0.6 : -0.8;
    }
    const v = a.strength * sign;
    total += v;

    for (const key of Object.keys(AREA)) {
      if (AREA[key].includes(a.pA) || AREA[key].includes(a.pB)) raw[key] += v;
    }
  }

  // 중심값(center)과 기울기(gain)는 무작위 4,000쌍 시뮬레이션으로 보정한 값입니다.
  // 목표 분포: 중앙값 76점 / 하위 5% 62점 / 상위 5% 91점 (하한 45, 상한 98)
  const scale = (x, center, gain) =>
    Math.max(45, Math.min(98, Math.round(76 + (x - center) * gain)));

  for (const key of Object.keys(AREA)) {
    const fm = weightMass(SYN_PLANETS, SYN_PLANETS, AREA[key]);
    const am = weightMass(A_, B_, AREA[key]);
    norm[key] = am > 0 ? Math.min(2.0, fm / am) : 1;
    raw[key] *= norm[key];
  }
  total *= norm.total;

  return {
    total:      scale(total,          16.0, 0.57),
    emotion:    scale(raw.emotion,     8.8, 0.66),
    attraction: scale(raw.attraction,  9.0, 0.80),
    talk:       scale(raw.talk,        6.6, 0.78),
    lasting:    scale(raw.lasting,     9.6, 0.64),
    confidence: +(1 / norm.total).toFixed(2)   // 1.0 = 정보 완전, 낮을수록 정보 부족
  };
}

/* --------------------------------------------------------------------------
   [8] AI에게 넘길 최종 다이제스트 (한국어 요약문)
-------------------------------------------------------------------------- */
function buildCoupleDigest(chartA, chartB, nameA, nameB) {
  const availA = SYN_PLANETS.filter(p => chartA.planets[p]);
  const availB = SYN_PLANETS.filter(p => chartB.planets[p]);

  const aspects = synastryAspects(chartA, chartB, nameA, nameB);
  const score   = compatibilityScore(aspects, availA, availB);
  const comp    = compositeChart(chartA, chartB);

  const L = [];

  // 🚨 정보 한계를 맨 위에 명시 — 추측을 원천 차단한다
  const limits = [];
  for (const [c, n] of [[chartA, nameA], [chartB, nameB]]) {
    (c.notes || []).forEach(note => limits.push(`- ${n}님: ${note}`));
  }
  if (limits.length) {
    L.push('[🚨 정보 한계 — 반드시 지켜라]');
    limits.forEach(x => L.push(x));
    L.push('위에서 제외된 항목은 계산 자체가 불가능한 것이다. 절대 추측해서 쓰지 마라.');
    L.push('제외된 항목을 언급해야 할 때는 시스템 용어를 쓰지 말고, "태어난 시간을 알면 여기까지 더 볼 수 있습니다" 정도로 한 번만 담백하게 안내하라. 사과하거나 변명하지 마라.');
    L.push('제외된 행성이 있어도, 남은 배치만으로 확신 있게 단정하라. 정보가 적다고 리포트 전체를 흐리멍덩하게 쓰면 실패다.\n');
  }

  const chartLine = (c, n) => {
    const parts = [];
    for (const p of SYN_PLANETS) {
      if (c.planets[p]) parts.push(`${p} ${c.planets[p].sign} ${c.planets[p].deg}도`);
    }
    return `[${n}님 차트] ${parts.join(' / ')}`;
  };
  L.push(chartLine(chartA, nameA));
  L.push(chartLine(chartB, nameB));

  // 서로의 7하우스(결혼의 방)에 뭐가 들어있는지 = 배우자 상품과의 연결고리
  for (const [c, n] of [[chartA, nameA], [chartB, nameB]]) {
    if (c.asc) {
      const dsc = signDeg(c.asc.abs + 180);
      L.push(`${n}님의 7하우스(결혼의 방) 시작점: ${dsc.sign} ${dsc.deg}도`);
    }
  }

  L.push('\n[두 차트 사이 실제 각도 — 이 관계의 핵심 근거. 반드시 인용하라]');
  const top = aspects.slice(0, 12);
  if (top.length) top.forEach((a, i) => L.push(`${i + 1}. ${a.text}`));
  else L.push('뚜렷한 각이 거의 없다. 이 경우 "강하게 얽히기보다 각자의 영역이 뚜렷한 관계"로 서술하라. 없는 각을 지어내지 마라.');

  const hard = aspects.filter(a => HARD.includes(a.aspect) && a.weight >= 6).slice(0, 4);
  L.push('\n[갈등 축 — 이 부분을 근거로 부딪히는 장면을 구체적으로 그려라]');
  if (hard.length) hard.forEach(a => L.push(`- ${a.text}`));
  else L.push('- 강한 마찰각이 없다. 갈등을 억지로 만들지 말고 "충돌보다 무관심이 위험한 관계"로 방향을 잡아라.');

  const overlay = []
    .concat(houseOverlay(chartA, chartB, nameA, nameB).slice(0, 5))
    .concat(houseOverlay(chartB, chartA, nameB, nameA).slice(0, 5));
  if (overlay.length) {
    L.push('\n[하우스 오버레이 — 상대가 내 인생의 어느 방에 들어왔는가]');
    overlay.forEach(r => L.push(`- ${r.text}`));
  }

  if (Object.keys(comp).length) {
    L.push('\n[합성차트 — 관계 그 자체의 성격]');
    for (const p of Object.keys(comp)) L.push(`- 합성 ${p}: ${comp[p].sign} ${comp[p].deg}도`);
  }

  // 관계의 분기점 시기: 합성 금성(없으면 합성 태양)에 대한 목성 트랜짓
  const anchor = comp['금성'] || comp['태양'] || null;
  L.push('\n[실제 계산된 관계 분기점 시기 — 이 시기만 사용하라. 지어내면 실패다]');
  if (anchor) {
    const w = findJupiterWindows(anchor.abs, 96).filter(s => typeof s === 'string' && s.indexOf('undefined') === -1);
    if (w.length) w.forEach((s, i) => L.push(`${i + 1}순위: ${s}`));
    else L.push('향후 8년간 목성이 이 관계의 중심점과 뚜렷한 각을 맺지 않는다. 시기를 지어내지 말고, "시기가 관계를 바꿔주지 않는 대신 두 사람의 선택이 그대로 결과가 되는 관계"라고 정직하게 안내하라.');
  } else {
    L.push('계산 불가. 이 항목은 언급하지 말고 다른 근거로 서술하라.');
  }

  L.push(`\n[확정 점수 — 이 숫자를 그대로 써라. 절대 다른 숫자를 지어내지 마라]`);
  if (score.confidence < 0.95) {
    L.push(`(참고: 정보 완전도 ${Math.round(score.confidence * 100)}%. 남은 정보만으로 산출된 값이며, 이 사실을 손님에게 굳이 설명하지 마라.)`);
  }
  L.push(`종합 ${score.total}점 / 감정교류 ${score.emotion}점 / 끌림 ${score.attraction}점 / 대화 ${score.talk}점 / 지속력 ${score.lasting}점`);

  return { text: L.join('\n'), score, aspects, composite: comp };
}

module.exports = {
  SIGNS_KR, PLANET_KR, SYN_PLANETS, HOUSE_MEANING,
  norm360, angleDiff, signDeg, lahiriAyanamsa, josa,
  jupiterLongitude, findJupiterWindows,
  parseChart, applyMoonRange, buildUnknownTimeChart, houseOf, midpoint, weightMass,
  synastryAspects, houseOverlay, compositeChart,
  compatibilityScore, buildCoupleDigest
};
