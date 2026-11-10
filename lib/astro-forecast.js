// ============================================================================
//  lib/astro-forecast.js — 연간 예측 기법 두 가지 (신년운세 18 · 2026-11-10)
// ----------------------------------------------------------------------------
//  ▣ 솔라 리턴 (Solar Return) — "올해 생일 차트"
//     태양이 태어난 자리로 정확히 돌아오는 순간의 하늘. 그 해 1년의 차트.
//     🚨 정밀도가 생명이다. 태양 위치가 1분(1/60도) 틀리면 그 순간이 24분 밀리고,
//        상승점은 4분에 1도씩 움직이므로 생일 차트의 상승 별자리가 바뀔 수 있다.
//        그래서 자체 계산으로 먼저 찾고 → Prokerala 실측 태양으로 한 번 더 보정한다.
//        (Prokerala 는 내부적으로 Swiss Ephemeris 를 쓴다)
//        보정 후 오차: 수 초 이내. Prokerala 가 죽으면 자체 계산만 쓰고 precise=false.
//
//  ▣ 진행 달 (Secondary Progressed Moon) — "마음의 시계"
//     태어난 뒤 하루 = 인생의 1년. 태어나고 34일째 하늘의 달 = 만 34세의 마음.
//     약 2년 반마다 별자리를 옮기고, 한 달에 약 1도씩 움직인다.
//     자체 계산의 계통 오차를 없애려고 '출생 달 위치(Prokerala)'를 기준점으로 삼고
//     자체 계산은 '얼마나 움직였나'에만 쓴다. (1935~2015 대조: 달 오차 5.3분 이내)
//
//  ▣ 태어난 시간을 모르면 두 기법 모두 쓰지 않는다.
//     출생 시각 ±12시간이면 출생 태양이 ±0.5도 → 생일 차트 시각이 ±12시간 흔들리고,
//     출생 달이 ±6도 → 진행 달 시점이 ±6개월 흔들린다. 지어내느니 빼는 게 맞다.
// ============================================================================

'use strict';

const EPH = require('./ephemeris.js');
const CH = require('./chart.js');
const SYN = require('./astro-synastry.js');
const NA = require('./natal.js');

const norm360 = x => ((x % 360) + 360) % 360;
const sdiff = (a, b) => { const d = norm360(a - b); return d > 180 ? d - 360 : d; };   // a-b, -180~180
const sep = (a, b) => Math.abs(sdiff(a, b));
const SIGNS = CH.SIGNS_KR;
const signOf = lon => SIGNS[Math.floor(norm360(lon) / 30)];
const DAY = 86400000;
const YEAR_DAYS = 365.242199;

const kstYmd = ms => new Date(ms + 9 * 3600000).toISOString().slice(0, 10);
const kstHm = ms => new Date(ms + 9 * 3600000).toISOString().slice(11, 16);

/* ── 솔라 리턴 ─────────────────────────────────────────────── */
const SR_PLANETS = ['태양', '달', '수성', '금성', '화성', '목성', '토성'];

/* 자체 계산으로 '태양 = 출생 태양' 인 순간 찾기 (뉴턴법) */
function srLocal(natalSun, y, bm, bd) {
  let t = Date.UTC(y, bm - 1, bd, 3);                          // 생일 정오(KST) 근처에서 출발
  for (let i = 0; i < 8; i++) {
    const sun = EPH.positions(new Date(t).toISOString(), ['태양'])['태양'];
    const d = sdiff(natalSun, sun);
    t += (d / 0.98565) * DAY;
    if (Math.abs(d) < 1e-6) break;
  }
  return t;
}

/* Prokerala 한 번 호출로 보정: 그 순간 실측 태양 오차만큼 시각을 민다.
   행성은 실측값 + 속도×이동시간, 상승점·천정은 보정된 시각으로 정확히 다시 계산 */
async function solarReturn(N, y, token) {
  const [, bm, bd] = N.birthYmd.split('-').map(Number);
  const natalSun = N.lon['태양'];
  let t = srLocal(natalSun, y, bm, bd);
  let planets = null, precise = false;

  if (token) {
    try {
      const iso0 = new Date(t).toISOString();
      const data = await NA.rawChart(iso0, N.loc, await token);
      const syn = SYN.parseChart(data, iso0);
      if (syn && syn.planets['태양']) {
        const dt = sdiff(natalSun, syn.planets['태양'].abs) / 0.98565 * DAY;   // 보통 수 분
        const spd = {};                                                    // 행성 속도(도/일) — 자체 계산
        const a = EPH.positions(new Date(t - DAY / 2).toISOString(), SR_PLANETS);
        const b = EPH.positions(new Date(t + DAY / 2).toISOString(), SR_PLANETS);
        SR_PLANETS.forEach(k => { spd[k] = sdiff(b[k], a[k]); });
        planets = {};
        SR_PLANETS.forEach(k => { if (syn.planets[k]) planets[k] = norm360(syn.planets[k].abs + spd[k] * dt / DAY); });
        t += dt;
        precise = Math.abs(dt) < 2 * 3600000;   // 2시간 넘게 어긋났으면 뭔가 잘못된 것 — 정밀 표시하지 않는다
      }
    } catch (e) { console.warn('⚠️ 솔라 리턴 Prokerala 보정 실패 → 자체 계산:', e.message); }
  }
  if (!planets) planets = EPH.positions(new Date(t).toISOString(), SR_PLANETS);

  const jd = t / DAY + 2440587.5;
  const asc = CH.calcASC(jd, N.loc.lon, N.loc.lat);
  const mc = CH.calcMC(jd, N.loc.lon);
  const srHouse = lon => CH.wholeSignHouse(lon, asc);
  const natalAsc = N.lon['상승점'];

  const inSR = {};
  SR_PLANETS.forEach(k => { inSR[k] = { sign: signOf(planets[k]), house: srHouse(planets[k]) }; });
  const angular = SR_PLANETS.filter(k => [1, 4, 7, 10].includes(inSR[k].house));

  return {
    ms: t, ymd: kstYmd(t), hm: kstHm(t), precise,
    ascSign: signOf(asc), ascNatalHouse: CH.wholeSignHouse(asc, natalAsc),
    mcSign: signOf(mc), mcNatalHouse: CH.wholeSignHouse(mc, natalAsc),
    planets: inSR, angular
  };
}

/* ── 진행 달 ───────────────────────────────────────────────── */
const PM_TARGETS = ['태양', '달', '수성', '금성', '화성', '목성', '토성', '상승점', '천정'];
const PM_ASPECTS = [[0, '합', 'strong'], [60, '육각', 'good'], [90, '각', 'hard'], [120, '삼각', 'good'], [180, '대립', 'hard']];

function progressedMoon(N, Y) {
  const birthMs = new Date(N.iso).getTime();
  const moon0Eph = EPH.positions(N.iso, ['달'])['달'];
  const moon0 = N.lon['달'];                     // Prokerala 기준점
  const natalAsc = N.lon['상승점'];
  /* 진행 달은 출생 뒤 수십 일 동안 수백 도를 돈다 — 누적 이동량으로 계산해야 정확하다 */
  const travelled = ms => {
    const progMs = birthMs + (ms - birthMs) / YEAR_DAYS;
    let tot = 0, prev = moon0Eph;
    for (let t = birthMs + DAY / 4; t <= progMs; t += DAY / 4) {
      const m = EPH.positions(new Date(t).toISOString(), ['달'])['달'];
      tot += norm360(m - prev); prev = m;
    }
    const last = EPH.positions(new Date(progMs).toISOString(), ['달'])['달'];
    tot += norm360(last - prev);
    return tot;
  };
  const start = Date.UTC(Y, 0, 1, 3), end = Date.UTC(Y, 11, 31, 3);
  const base = travelled(start);                                  // 1월 1일까지 움직인 총량
  const lonAt = ms => {
    const progMs = birthMs + (ms - birthMs) / YEAR_DAYS;
    const progStart = birthMs + (start - birthMs) / YEAR_DAYS;
    const a = EPH.positions(new Date(progStart).toISOString(), ['달'])['달'];
    const b = EPH.positions(new Date(progMs).toISOString(), ['달'])['달'];
    return norm360(moon0 + base + norm360(b - a));                 // 1년에 13도 안팎이라 norm360 한 번이면 충분
  };

  const days = [];
  for (let t = start; t <= end; t += DAY) days.push({ ms: t, lon: lonAt(t) });

  /* 별자리(=홀사인 하우스) 이동 */
  const segs = [];
  days.forEach(d => {
    const sg = signOf(d.lon);
    if (!segs.length || segs[segs.length - 1].sign !== sg) {
      segs.push({ sign: sg, house: CH.wholeSignHouse(d.lon, natalAsc), from: kstYmd(d.ms), to: kstYmd(d.ms) });
    } else segs[segs.length - 1].to = kstYmd(d.ms);
  });

  /* 출생 행성에 정확히 닿는 날 (오차 0.15도 이내 최소점) */
  const events = [];
  for (const k of PM_TARGETS) {
    if (N.lon[k] === undefined) continue;
    for (const [ang, nm, tone] of PM_ASPECTS) {
      let best = null;
      days.forEach(d => {
        const err = Math.abs(sep(d.lon, N.lon[k]) - ang);
        if (err <= 0.6 && (!best || err < best.err)) best = { err, ms: d.ms };
      });
      if (best && best.err <= 0.15) {
        events.push({ ymd: kstYmd(best.ms), m: +kstYmd(best.ms).slice(5, 7), target: k, asp: nm,
          tone: tone === 'strong' ? (['토성', '화성'].includes(k) ? 'hard' : 'good') : tone });
      }
    }
  }
  events.sort((a, b) => a.ymd < b.ymd ? -1 : 1);
  return { start: { sign: signOf(days[0].lon), deg: +(norm360(days[0].lon) % 30).toFixed(1) }, segs, events };
}

/* ── 기법 겹침 (수렴) ──────────────────────────────────────── */
const AREA = { 1: '나 자신·새 출발', 2: '돈·수입', 3: '공부·계약·이동', 4: '집·가족', 5: '연애·취미',
  6: '일·몸 관리', 7: '결혼·파트너', 8: '큰돈·정리', 9: '여행·유학·자격증', 10: '커리어·평판',
  11: '인맥·오래 품은 꿈', 12: '휴식·마무리' };
const DOMAIN = { 1: '나', 2: '돈', 8: '돈', 3: '배움', 9: '배움', 4: '집', 5: '사랑', 7: '사랑',
  6: '일', 10: '일', 11: '사람', 12: '쉼' };

function converge(prof, sr, pm, jupSegs, MS, exactEv) {
  const votes = {};   // 하우스 → [{tech, w}]
  const vote = (h, tech, w) => { if (!h) return; (votes[h] = votes[h] || []).push({ tech, w }); };
  vote(prof.house, '메인테마', 3);
  if (sr) {
    vote(sr.ascNatalHouse, '생일 차트의 상승점', 2);
    vote(sr.planets['태양'].house, '생일 차트의 태양', 2);
    vote(sr.planets['달'].house, '생일 차트의 달', 1);
  }
  const longest = arr => arr.slice().sort((a, b) => (new Date(b.to) - new Date(b.from)) - (new Date(a.to) - new Date(a.from)))[0];
  if (jupSegs && jupSegs.length) vote(longest(jupSegs).house, '목성의 이동', 2);
  if (pm && pm.segs.length) vote(longest(pm.segs).house, '마음의 시계', 2);

  /* 영역(사랑·돈·일…) 단위로 묶어서 서로 다른 기법이 둘 이상이면 '겹침' */
  const dom = {};
  Object.keys(votes).forEach(h => {
    const d = DOMAIN[h];
    (dom[d] = dom[d] || { domain: d, houses: [], techs: [], w: 0 });
    dom[d].houses.push(+h);
    votes[h].forEach(v => { if (!dom[d].techs.includes(v.tech)) dom[d].techs.push(v.tech); dom[d].w += v.w; });
  });
  const themes = Object.values(dom).filter(x => x.techs.length >= 2).sort((a, b) => b.w - a.w)
    .map(x => ({ domain: x.domain, areas: [...new Set(x.houses)].map(h => AREA[h]), techs: x.techs, w: x.w }));

  /* 달 단위: 트랜짓 흐름 상위/하위 + 진행 달 정확일 + 큰 행성 정확일이 같은 달에 겹치면 */
  const months = [];
  const sorted = MS.months.slice().sort((a, b) => b.mean.total - a.mean.total);
  const top = sorted.slice(0, 4).map(x => x.m), low = sorted.slice(-3).map(x => x.m);
  for (let m = 1; m <= 12; m++) {
    const why = [];
    let good = 0, hard = 0;
    if (top.includes(m)) { why.push('1년 흐름 상위'); good++; }
    if (low.includes(m)) { why.push('1년 흐름 하위'); hard++; }
    (pm ? pm.events : []).filter(e => e.m === m).forEach(e => {
      why.push(`마음의 시계가 내 ${e.target}에 ${e.asp}`); if (e.tone === 'good') good++; else hard++;
    });
    exactEv.filter(e => +e.ymd.slice(5, 7) === m && (e.T === '목성' || e.T === '토성')).forEach(e => {
      why.push(`${e.T}이 내 ${e.N}에 ${e.asp}`);
      if (e.tone === 'good') good++; else if (e.tone === 'hard') hard++;
    });
    if (good >= 2 && hard === 0) months.push({ m, tone: 'good', why });
    else if (hard >= 2 && good === 0) months.push({ m, tone: 'hard', why });
    else if (good + hard >= 3) months.push({ m, tone: 'mixed', why });
  }
  return { themes, months };
}

/**
 * 신년운세용 추가 계산. 시각 미상이면 null.
 * @returns { sr, srPrev, srPrimary, pm } | null
 */
async function computeForecast(N, Y, opts) {
  if (N.timeUnknown || N.lon['상승점'] === undefined) return null;
  const token = opts && opts.token;
  const [, bm] = N.birthYmd.split('-').map(Number);
  const [srPrev, sr] = await Promise.all([solarReturn(N, Y - 1, token), solarReturn(N, Y, token)]);
  /* 1월~생일 전은 작년 생일 차트, 생일부터는 올해 생일 차트. 더 오래 덮는 쪽이 주인 */
  const srPrimary = bm >= 7 ? srPrev : sr;
  const pm = progressedMoon(N, Y);
  return { sr, srPrev, srPrimary, pm };
}

module.exports = { computeForecast, solarReturn, progressedMoon, converge, srLocal, AREA, DOMAIN };
