// ============================================================================
//  lib/astro-reunion.js — 재회운 리포트 계산 엔진 (product_no=16 · 12,900원)
// ----------------------------------------------------------------------------
//  ▣ 이 상품이 답하는 질문
//
//  "다시 만날 수 있나요?" 가 아닙니다. 그건 아무도 모릅니다.
//  이 리포트는 "내가 이 사람을 못 놓는 이유가 무엇인가"에 답합니다.
//  그리고 그 답은 AI 가 아니라 이 파일이 숫자로 정합니다.
//
//      3장  사랑인가 관성인가    정·성장  /  익숙함·책임감·집착   5요인 비율
//      7장  연락한다면 언제      오늘부터 18개월, 하루 단위 실계산
//      8장  놓아야 한다면 근거   근거가 없으면 '판단 기준'으로 반드시 채운다
//      9장  결론 방향            다시 두드려 볼 / 조건부 / 놓는 쪽
//
//  ▣ 재회 '확률'은 계산하지 않습니다. 의도적입니다.
//     두 사람의 선택을 숫자로 대신할 수 없고, 그런 숫자는 손님을 붙잡아 두는 미끼가 됩니다.
//     5요인 비율은 확률이 아니라 "이 관계가 사람을 붙잡는 힘의 성분"입니다.
//
//  ▣ 계산 재료 (Prokerala 추가 호출 0)
//     · 두 사람 출생차트           lib/natal.js
//     · 노드(평균)·명왕성         lib/natal.js 자체 계산
//     · 앞으로 18개월 하늘         lib/ephemeris.js (Swiss Ephemeris 대비 3분 이내)
// ============================================================================

'use strict';

const SYN = require('./astro-synastry.js');
const EPH = require('./ephemeris.js');

const norm360 = x => ((x % 360) + 360) % 360;
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; };
const josa = SYN.josa;

const PERSONAL = ['태양', '달', '금성', '화성', '상승점'];
const HARMONIOUS = ['합', '삼각', '육각'];
const HARD = ['각', '대립'];

/* 헤어진 시기 선택지 → 대략 며칠 전인가 (5장 '그때와 지금 하늘 비교'에 쓴다) */
const STAGE_DAYS = { '1개월 이내': 20, '3개월': 90, '6개월': 180, '1년 이상': 420, '몇 년': 1100 };
const STAGES = Object.keys(STAGE_DAYS);
const INITIATORS = ['내가', '상대가', '서로', '애매함'];
const CONTACTS = ['완전히 끊김', '가끔 연락', '차단된 상태', '친구처럼 지냄'];

/* ── 날짜 유틸 (서울 날짜 문자열 기준) ─────────────────────── */
function addDays(ymd, n) {
  const t = new Date(ymd + 'T12:00:00+09:00').getTime() + n * 86400000;
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10);
}
const noonIso = ymd => ymd + 'T12:00:00+09:00';
function krDate(ymd, refYear) {
  const [y, m, d] = ymd.split('-').map(Number);
  return (refYear && y === refYear ? '' : y + '년 ') + m + '월 ' + d + '일';
}
function krMonth(ymd, refYear) {
  const [y, m] = ymd.split('-').map(Number);
  return (refYear && y === refYear ? '' : y + '년 ') + m + '월';
}

/* ── 한 사람의 '점' 모음 ─────────────────────────────────── */
function pointsOf(N) {
  const p = {};
  for (const k of Object.keys(N.syn.planets)) p[k] = N.syn.planets[k].abs;
  p['노스노드'] = N.nodeN; p['사우스노드'] = N.nodeS; p['명왕성'] = N.pluto;
  return p;
}
const houseOf = (N, lon) => N.syn.ascSignIndex === null || N.syn.ascSignIndex === undefined
  ? null : SYN.houseOf(N.syn, lon);

/* ============================================================================
   [1] 3장의 재료 — 5요인
   ============================================================================ */
function fiveFactors(A, B, nameA, nameB, aspects) {
  const pa = pointsOf(A), pb = pointsOf(B);
  const ev = { 정: [], 성장: [], 익숙함: [], 책임감: [], 집착: [] };
  const raw = { 정: 1.0, 성장: 1.0, 익숙함: 1.0, 책임감: 1.0, 집착: 1.0 };   // 0 나눗셈·극단값 방지 바닥

  const add = (k, v, text) => { raw[k] += v; ev[k].push({ v: +v.toFixed(2), text }); };

  /* 정 — 태양·달·금성·상승점끼리의 조화각, 금성-화성 조화각 */
  const WARM = ['태양', '달', '금성', '상승점'];
  for (const a of aspects) {
    if (!HARMONIOUS.includes(a.aspect)) continue;
    if (a.pA === '토성' || a.pB === '토성') continue;
    const warm = WARM.includes(a.pA) && WARM.includes(a.pB);
    const vm = (a.pA === '금성' && a.pB === '화성') || (a.pA === '화성' && a.pB === '금성');
    if (warm || vm) add('정', a.strength * (a.aspect === '합' ? 1.1 : 1), a.text);
  }

  /* 성장 — 노스노드 합(앞으로 가게 하는 인연) + 목성 조화각 */
  /* 익숙함 — 사우스노드 합(이미 아는 것 같은 인연) + 달이 상대의 4하우스 */
  const nodeHits = (P, Q, nameP, nameQ) => {
    for (const k of PERSONAL) {
      if (P[k] === undefined) continue;
      const orb = k === '상승점' ? 3 : 4;
      const dn = sep(P[k], Q['노스노드']), ds = sep(P[k], Q['사우스노드']);
      if (dn <= orb) add('성장', 6 * (0.5 + 0.5 * (1 - dn / orb)),
        `${nameP}님의 ${k} — ${nameQ}님의 노스노드 : 합(오차 ${dn.toFixed(1)}도)`);
      if (ds <= orb) add('익숙함', 6 * (0.5 + 0.5 * (1 - ds / orb)),
        `${nameP}님의 ${k} — ${nameQ}님의 사우스노드 : 합(오차 ${ds.toFixed(1)}도)`);
    }
  };
  nodeHits(pa, pb, nameA, nameB);
  nodeHits(pb, pa, nameB, nameA);
  for (const a of aspects) {
    if ((a.pA === '목성' || a.pB === '목성') && HARMONIOUS.includes(a.aspect)) {
      const other = a.pA === '목성' ? a.pB : a.pA;
      if (PERSONAL.includes(other)) add('성장', a.strength * 0.8, a.text);
    }
  }
  [[A, B, nameA, nameB], [B, A, nameB, nameA]].forEach(([own, gst, no, ng]) => {
    const m = gst.syn.planets['달'];
    if (!m) return;
    if (houseOf(own, m.abs) === 4) add('익숙함', 4, `${ng}님의 달이 ${no}님의 4하우스(집·가족의 자리)에 들어감`);
  });
  for (const a of aspects) {
    if (a.pA === '달' && a.pB === '달' && a.aspect === '합') add('익숙함', a.strength * 0.8, a.text);
  }

  /* 책임감 — 토성이 상대의 개인 행성에 닿는 모든 각 */
  for (const a of aspects) {
    const satA = a.pA === '토성', satB = a.pB === '토성';
    if (satA === satB) continue;                           // 토성-토성은 세대 공통이라 제외
    const other = satA ? a.pB : a.pA;
    if (!PERSONAL.includes(other) && other !== '수성') continue;
    add('책임감', a.strength * (HARD.includes(a.aspect) || a.aspect === '합' ? 1.0 : 0.65), a.text);
  }

  /* 집착 — 명왕성이 상대의 태양·달·금성·화성에 닿는 각 + 8하우스 오버레이 */
  const plutoHits = (P, Q, nameP, nameQ) => {
    for (const k of ['태양', '달', '금성', '화성']) {
      if (Q[k] === undefined) continue;
      const d = sep(P['명왕성'], Q[k]);
      for (const [ang, nm, orb, w] of [[0, '합', 3.5, 7], [90, '각', 3, 6], [180, '대립', 3, 6], [120, '삼각', 2, 3], [60, '육각', 1.5, 2]]) {
        const off = Math.abs(d - ang);
        if (off > orb) continue;
        add('집착', w * (0.5 + 0.5 * (1 - off / orb)), `${nameP}님의 명왕성 — ${nameQ}님의 ${k} : ${nm}(오차 ${off.toFixed(1)}도)`);
        break;
      }
    }
  };
  plutoHits(pa, pb, nameA, nameB);
  plutoHits(pb, pa, nameB, nameA);
  [[A, B, nameA, nameB], [B, A, nameB, nameA]].forEach(([own, gst, no, ng]) => {
    for (const k of ['태양', '달', '금성', '화성']) {
      const g = gst.syn.planets[k];
      if (!g) continue;
      if (houseOf(own, g.abs) === 8) {
        add('집착', (k === '금성' || k === '달' || k === '화성') ? 5 : 4,
          `${ng}님의 ${josa(k, '이', '가')} ${no}님의 8하우스(깊은 결속·놓기 어려움의 자리)에 들어감`);
      }
    }
  });

  const total = Object.values(raw).reduce((a, b) => a + b, 0);
  /* 반올림 합이 100이 되도록 최대잔여법 */
  const keys = Object.keys(raw);
  const exact = keys.map(k => raw[k] / total * 100);
  const pct = exact.map(Math.floor);
  let rest = 100 - pct.reduce((a, b) => a + b, 0);
  exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0])
       .forEach(([, i]) => { if (rest > 0) { pct[i]++; rest--; } });
  const share = {}; keys.forEach((k, i) => { share[k] = pct[i]; });

  const love = share['정'] + share['성장'];
  const inertia = 100 - love;
  for (const k of keys) ev[k].sort((a, b) => b.v - a.v);

  return { raw, share, love, inertia, evidence: ev };
}

/* ============================================================================
   [2] 트랜짓 스캐너
   ============================================================================ */
const T_ASPECTS = [[0, '합'], [60, '육각'], [90, '각'], [120, '삼각'], [180, '대립']];

function aspectOf(t, n, orb, allowed) {
  const d = sep(t, n);
  for (const [ang, nm] of T_ASPECTS) {
    if (allowed && !allowed.includes(nm)) continue;
    const off = Math.abs(d - ang);
    if (off <= orb) return { name: nm, off };
  }
  return null;
}

/* 하루치 하늘을 캐시 (18개월 × 여러 조건을 반복 계산하지 않도록) */
function skySeries(startYmd, days) {
  const out = [];
  for (let i = 0; i < days; i++) {
    const ymd = addDays(startYmd, i);
    const iso = noonIso(ymd);
    out.push({
      ymd,
      pos: EPH.positions(iso, ['태양', '수성', '금성', '화성', '목성', '토성', '천왕성', '해왕성', '명왕성']),
      rx: {
        수성: EPH.isRetrograde('수성', iso), 금성: EPH.isRetrograde('금성', iso),
        화성: EPH.isRetrograde('화성', iso)
      }
    });
  }
  return out;
}

/* 매일 true/false 로 판정한 것을 연속 구간으로 묶는다. peak = 오차가 가장 작은 날 */
function toPeriods(series, test, minLen) {
  const res = [];
  let cur = null;
  series.forEach((day, i) => {
    const r = test(day);
    if (r) {
      if (!cur) cur = { start: day.ymd, end: day.ymd, peak: day.ymd, best: r.off == null ? 0 : r.off, info: r };
      cur.end = day.ymd;
      if (r.off != null && r.off < cur.best) { cur.best = r.off; cur.peak = day.ymd; cur.info = r; }
    } else if (cur) { res.push(cur); cur = null; }
    if (i === series.length - 1 && cur) res.push(cur);
  });
  return res.filter(p => !minLen || (daysBetween(p.start, p.end) + 1) >= minLen);
}
function daysBetween(a, b) {
  return Math.round((new Date(b + 'T00:00:00Z') - new Date(a + 'T00:00:00Z')) / 86400000);
}

/* ============================================================================
   [3] 7장 — 연락 시기 (18개월)
   ============================================================================ */
function contactWindows(A, B, nameA, nameB, comp, todayYmd, sky) {
  const refYear = +todayYmd.slice(0, 4);
  const targets = [];
  if (A.syn.planets['금성']) targets.push({ who: nameA, key: '금성', lon: A.syn.planets['금성'].abs, w: 1.0 });
  if (A.syn.planets['달'])   targets.push({ who: nameA, key: '달',   lon: A.syn.planets['달'].abs,   w: 0.8 });
  if (B.syn.planets['금성']) targets.push({ who: nameB, key: '금성', lon: B.syn.planets['금성'].abs, w: 0.9 });
  if (comp && comp['금성'])  targets.push({ who: '두 사람 관계', key: '관계의 금성', lon: comp['금성'].abs, w: 1.2 });

  /* 문이 열림 — 목성이 조화각(합·삼각·육각)으로 닿는 구간 */
  const open = [];
  for (const tg of targets) {
    const ps = toPeriods(sky, d => aspectOf(d.pos['목성'], tg.lon, 2.0, ['합', '삼각', '육각']), 3);
    ps.forEach(p => open.push({
      kind: 'open', start: p.start, end: p.end, peak: p.peak,
      label: '문이 열리는 때',
      why: `목성이 ${tg.who === '두 사람 관계' ? '두 사람 관계의 금성' : tg.who + '님의 ' + tg.key}에 ${p.info.name}`,
      weight: tg.w, target: tg.who + '·' + tg.key
    }));
  }
  /* 목성 창이 18개월 안에 하나도 없으면, 금성의 짧은 창을 보조로 쓴다 (없는 문을 지어내지 않기 위해 라벨을 분명히 다르게) */
  let minor = [];
  if (!open.length) {
    for (const tg of targets.filter(t => t.key === '금성' || t.key === '관계의 금성')) {
      const ps = toPeriods(sky, d => aspectOf(d.pos['금성'], tg.lon, 1.5, ['합', '삼각']), 2);
      ps.forEach(p => minor.push({
        kind: 'minor', start: p.start, end: p.end, peak: p.peak,
        label: '짧게 열리는 틈',
        why: `금성이 ${tg.who === '두 사람 관계' ? '두 사람 관계의 금성' : tg.who + '님의 ' + tg.key}에 ${p.info.name}`,
        weight: 0.5, target: tg.who + '·' + tg.key
      }));
    }
    minor.sort((a, b) => a.start < b.start ? -1 : 1);
    minor = minor.slice(0, 4);
  }

  /* 옛 인연이 다시 떠오르는 구간 — 금성·수성 역행 */
  const retro = [];
  for (const [p, label, why] of [
    ['금성', '옛 감정이 되살아나는 때', '금성 역행 — 지나간 관계를 다시 꺼내 보게 되는 구간'],
    ['수성', '연락이 다시 오가기 쉬운 때', '수성 역행 — 옛 연락처·옛 대화가 다시 떠오르는 구간. 대신 말이 꼬이기 쉽다']
  ]) {
    toPeriods(sky, d => d.rx[p] ? { off: null } : null, 3).forEach(r => retro.push({
      kind: 'retro', planet: p, start: r.start, end: r.end, peak: null, label, why
    }));
  }

  /* 조심할 때 — 토성이 내 금성·달을 누르는 구간 + 화성 역행 */
  const caution = [];
  for (const k of ['금성', '달']) {
    const pl = A.syn.planets[k];
    if (!pl) continue;
    toPeriods(sky, d => aspectOf(d.pos['토성'], pl.abs, 2.0, ['합', '각', '대립']), 3).forEach(p => caution.push({
      kind: 'caution', start: p.start, end: p.end, peak: p.peak, label: '먼저 움직이면 손해 보는 때',
      why: `토성이 ${nameA}님의 ${k}에 ${p.info.name} — 마음이 무거워지고 거절에 크게 다치는 구간`
    }));
  }
  toPeriods(sky, d => d.rx['화성'] ? { off: null } : null, 5).forEach(r => caution.push({
    kind: 'caution', start: r.start, end: r.end, peak: null, label: '다투기 쉬운 때',
    why: '화성 역행 — 묵은 분노가 다시 올라오는 구간. 이때 만나면 옛 싸움이 그대로 재생된다'
  }));

  const all = open.concat(minor, retro, caution).sort((a, b) => a.start < b.start ? -1 : (a.start > b.start ? 1 : 0));

  /* 가장 좋은 '문' 하나 — 가까우면서 무게가 큰 것. 조심 구간과 겹치면 감점 */
  const overlapsCaution = w => caution.some(c => !(c.end < w.start || c.start > w.end));
  const scored = open.concat(minor).map(w => {
    const dist = daysBetween(todayYmd, w.peak || w.start);
    return Object.assign({}, w, { dist, score: w.weight * 100 - dist * 0.12 - (overlapsCaution(w) ? 25 : 0) });
  }).sort((a, b) => b.score - a.score);
  const best = scored[0] || null;

  /* 연도는 처음 바뀔 때 한 번만: '2027년 10월 8일 ~ 10월 28일 (가장 강한 날 10월 18일)' */
  const fmt = w => {
    const sy = +w.start.slice(0, 4), ey = +w.end.slice(0, 4);
    const s = krDate(w.start, refYear);
    const e = krDate(w.end, sy === ey ? sy : refYear);
    const pk = w.peak && w.peak !== w.start && w.peak !== w.end ? ` (가장 강한 날 ${krDate(w.peak, sy)})` : '';
    return (w.start === w.end ? s : s + ' ~ ' + e) + pk;
  };
  all.forEach(w => { w.when = fmt(w); });
  if (best) best.when = fmt(best);

  return { all, open, minor, retro, caution, best, openWithin6: open.some(w => daysBetween(todayYmd, w.start) <= 183),
           openWithin12: open.some(w => daysBetween(todayYmd, w.start) <= 366) };
}

/* ============================================================================
   [4] 5장·6장 — '헤어질 무렵 하늘' vs '지금 하늘'
   ============================================================================ */
const SLOW = [['목성', 2.5], ['토성', 2.5], ['천왕성', 2], ['해왕성', 2], ['명왕성', 2]];
function slowTransitsAt(N, ymd) {
  const pos = EPH.positions(noonIso(ymd), SLOW.map(s => s[0]));
  const out = [];
  for (const [tp, orb] of SLOW) {
    for (const k of ['태양', '달', '금성', '화성', '상승점']) {
      const pl = N.syn.planets[k];
      if (!pl) continue;
      const a = aspectOf(pos[tp], pl.abs, orb);
      if (a) out.push({ key: tp + '-' + k + '-' + a.name, t: tp, n: k, asp: a.name, off: +a.off.toFixed(1),
                        tone: HARMONIOUS.includes(a.name) && !(tp === '토성' && a.name === '합') && !(tp === '명왕성' && a.name === '합') ? '순풍' : '압박' });
    }
  }
  return out;
}

function thenVsNow(A, B, nameA, nameB, stage, todayYmd, thenOverride) {
  const thenYmd = thenOverride || addDays(todayYmd, -(STAGE_DAYS[stage] || 180));
  const aThen = slowTransitsAt(A, thenYmd), aNow = slowTransitsAt(A, todayYmd);
  const bNow = slowTransitsAt(B, todayYmd);
  const keysNow = new Set(aNow.map(x => x.key)), keysThen = new Set(aThen.map(x => x.key));
  const lifted = aThen.filter(x => !keysNow.has(x.key));       // 그때 있었고 지금 풀린 것
  const arrived = aNow.filter(x => !keysThen.has(x.key));      // 지금 새로 걸린 것
  const stayed = aNow.filter(x => keysThen.has(x.key));

  /* 상대가 앞으로 6개월 안에 맞을 큰 트랜짓 (오늘 이후 처음 걸리는 날) */
  const bNext = [];
  const seen = new Set(bNow.map(x => x.key));
  for (let i = 15; i <= 180; i += 15) {
    const ymd = addDays(todayYmd, i);
    slowTransitsAt(B, ymd).forEach(x => {
      if (seen.has(x.key)) return;
      seen.add(x.key);
      bNext.push(Object.assign({ from: ymd }, x));
    });
  }
  const line = (who, x) => `${x.t}이 ${who}님의 ${x.n}에 ${x.asp}(${x.tone}, 오차 ${x.off}도)`;
  return {
    thenYmd,
    lifted: lifted.map(x => line(nameA, x)),
    arrived: arrived.map(x => line(nameA, x)),
    stayed: stayed.map(x => line(nameA, x)),
    bNow: bNow.map(x => line(nameB, x)),
    bNext: bNext.slice(0, 4).map(x => krMonth(x.from, +todayYmd.slice(0, 4)) + '부터 ' + line(nameB, x)),
    bPressure: bNow.filter(x => x.tone === '압박').length
  };
}

/* ============================================================================
   [5] 8장 — 놓아야 할 근거
   ============================================================================ */
function letGoEvidence(aspects, ff, win) {
  const L = [];
  const find = (p1, p2s, asps, maxOrb) => aspects.filter(a =>
    ((a.pA === p1 && p2s.includes(a.pB)) || (a.pB === p1 && p2s.includes(a.pA))) &&
    asps.includes(a.aspect) && a.orb <= maxOrb);
  find('토성', ['금성', '달'], ['각', '대립', '합'], 3).forEach(a => L.push({ w: 3, kind: '평가·통제', text: a.text,
    meaning: '한 사람이 다른 사람을 계속 평가하고, 평가받는 쪽은 사랑받는 대신 시험받는다고 느끼는 구조' }));
  const pl = (ff.evidence['집착'] || []).filter(e => /명왕성/.test(e.text) && /(합|각|대립)\(/.test(e.text) && /(금성|달)/.test(e.text));
  pl.slice(0, 2).forEach(e => L.push({ w: 3, kind: '주도권·집착', text: e.text,
    meaning: '사랑과 주도권 싸움이 한 덩어리로 엉켜 있는 구조. 떨어져 있을 때 더 강하게 당긴다' }));
  aspects.filter(a => HARD.includes(a.aspect) && a.orb <= 4 &&
    ((a.pA === '화성' && ['화성', '달'].includes(a.pB)) || (a.pB === '화성' && ['화성', '달'].includes(a.pA))))
    .slice(0, 2).forEach(a => L.push({ w: 2, kind: '싸움이 상처로', text: a.text,
      meaning: '싸움이 문제 해결로 끝나지 않고 감정의 상처로 남는 구조' }));
  find('달', ['달'], ['각', '대립'], 5).forEach(a => L.push({ w: 2, kind: '위로 방식 정반대', text: a.text,
    meaning: '힘들 때 원하는 위로가 정반대라, 위로하려는 행동이 상처가 되는 구조' }));
  if (ff.inertia >= 62) L.push({ w: 2, kind: '관성 우세', text: `붙잡는 힘 중 관성(익숙함·책임감·집착)이 ${ff.inertia}%`,
    meaning: '그리운 것이 이 사람인지, 이 사람과 있던 내 모습과 습관인지 구분해야 하는 비율' });
  if (!win.openWithin12) L.push({ w: 1, kind: '열리는 문 없음', text: '앞으로 12개월 안에 목성이 관계의 자리를 여는 구간이 없음',
    meaning: '시기가 도와주지 않는다. 다시 시작한다면 순전히 두 사람의 의지로 버텨야 한다' });
  L.sort((a, b) => b.w - a.w);
  return L;
}

/* ============================================================================
   [6] 9장 — 결론 방향
   ⚠️ 경계값은 무작위 1,500쌍 시뮬레이션으로 정했다 (test/reunion-sim.js).
      목표 분포: 다시 두드려 볼 ≈ 30% / 조건부 ≈ 44% / 놓는 쪽 ≈ 26%
      "다들 재회 가능" 이 나오는 상품은 아무도 믿지 않는다.
   ============================================================================ */
const DIR_HI = 11.5, DIR_LO = -9.5;   /* 2026-11-09 실측: s 의 70%·26% 분위 */
function directionOf(ff, win, letgo, score) {
  let s = (ff.love - 50) * 0.55;                         // 사랑 비율 (±27)
  s += win.openWithin6 ? 8 : (win.openWithin12 ? 4 : -4); // 시기
  s -= letgo.reduce((a, x) => a + x.w, 0) * 1.6;         // 놓아야 할 근거
  s += ((score && score.total) || 76) - 76;              // 기본 궁합(중앙값 76) 편차
  s = Math.round(s * 10) / 10;
  const dir = s >= DIR_HI ? '다시 두드려 볼 만한 쪽' : (s <= DIR_LO ? '놓는 쪽이 맞는 쪽' : '조건이 맞을 때만');
  return { dir, s };
}

/* ============================================================================
   [5-2] 7장(새) — 그 사람이 나를 떠올리기 쉬운 때  (2026-11-11)
   ----------------------------------------------------------------------------
   "그 사람이 연락할까요?"는 마음과 선택의 문제라 차트로 단정할 수 없다.
   대신 그 사람의 차트 기준으로 '연락하기 쉬운 쪽으로 하늘이 열리는 때'는 계산할 수 있다.
     · 목성이 그 사람의 금성·달을 순하게 비춤        → 마음이 누그러지는 때
     · 금성 역행이 그 사람의 금성·달을 지나감         → 옛사람이 유난히 떠오르는 때
     · 수성 역행이 그 사람의 수성·금성·달을 지나감    → 옛 연락처를 다시 열어 보기 쉬운 때
     · 금성이 그 사람의 금성 위를 지나감 (1년에 한 번) → 애정이 그리워지는 며칠
   그리고 내 쪽 '문이 열리는 때'와 겹치면 → 두 사람의 하늘이 같이 열리는 날
   ============================================================================ */
function fmtRange(w, refYear) {
  const sy = +w.start.slice(0, 4), ey = +w.end.slice(0, 4);
  const s = krDate(w.start, refYear);
  const e = krDate(w.end, sy === ey ? sy : refYear);
  const pk = w.peak && w.peak !== w.start && w.peak !== w.end ? ` (가장 강한 날 ${krDate(w.peak, sy)})` : '';
  return (w.start === w.end ? s : s + ' ~ ' + e) + pk;
}

function exWindows(B, nameB, sky, todayYmd, myWin) {
  const refYear = +todayYmd.slice(0, 4);
  const P = B.syn.planets;
  const T = [];
  if (P['금성']) T.push({ key: '금성', lon: P['금성'].abs });
  if (P['달'])   T.push({ key: '달',   lon: P['달'].abs });
  const out = [];

  /* 목성 — 마음이 누그러지는 때 */
  for (const t of T) {
    toPeriods(sky, d => aspectOf(d.pos['목성'], t.lon, 2.0, ['합', '삼각', '육각']), 3).forEach(p => out.push({
      kind: 'soften', start: p.start, end: p.end, peak: p.peak, weight: 1.0,
      label: '마음이 누그러지는 때', why: `목성이 ${nameB}님의 ${t.key}을 순하게 비추는 구간 (${p.info.name})`
    }));
  }
  /* 금성·수성 역행 — 그 사람 행성을 지나가면 강하게, 아니면 일반 */
  const retroHits = (planet, targets, orb) => toPeriods(sky, d => d.rx[planet] ? { off: null } : null, 3).map(r => {
    let hit = null;
    sky.forEach(d => {
      if (d.ymd < r.start || d.ymd > r.end) return;
      for (const t of targets) {
        const off = sep(d.pos[planet], t.lon);
        if (off <= orb && (!hit || off < hit.off)) hit = { off, key: t.key, ymd: d.ymd };
      }
    });
    return Object.assign({}, r, { hit });
  });
  retroHits('금성', T, 6).forEach(r => out.push(r.hit ? {
    kind: 'retro', start: r.start, end: r.end, peak: r.hit.ymd, weight: 0.9,
    label: '옛사람이 유난히 떠오르는 때', why: `거꾸로 가는 금성이 ${nameB}님의 ${r.hit.key} 위를 지나가는 구간`
  } : {
    kind: 'retro', start: r.start, end: r.end, peak: null, weight: 0.5,
    label: '지난 관계를 돌아보게 되는 때', why: '금성 역행 — 누구나 지난 관계를 다시 꺼내 보게 되는 구간'
  }));
  const mT = T.slice(); if (P['수성']) mT.push({ key: '수성', lon: P['수성'].abs });
  retroHits('수성', mT, 4).forEach(r => out.push(r.hit ? {
    kind: 'retro', start: r.start, end: r.end, peak: r.hit.ymd, weight: 0.8,
    label: '옛 연락처를 다시 열어 보기 쉬운 때', why: `거꾸로 가는 수성이 ${nameB}님의 ${r.hit.key} 위를 지나가는 구간`
  } : {
    kind: 'retro', start: r.start, end: r.end, peak: null, weight: 0.4,
    label: '옛 대화가 떠오르기 쉬운 때', why: '수성 역행 — 옛 연락처·옛 대화가 다시 떠오르는 구간'
  }));
  /* 금성 귀환 — 1년에 한 번, 며칠 */
  if (P['금성']) {
    toPeriods(sky, d => aspectOf(d.pos['금성'], P['금성'].abs, 1.5, ['합']), 2).forEach(p => out.push({
      kind: 'venus', start: p.start, end: p.end, peak: p.peak, weight: 0.5,
      label: '애정이 그리워지는 며칠', why: `금성이 ${nameB}님의 금성 위로 돌아오는 며칠 (1년에 한 번)`
    }));
  }
  out.sort((a, b) => a.start < b.start ? -1 : 1);
  out.forEach(w => { w.when = fmtRange(w, refYear); });

  /* 두 사람의 하늘이 같이 열리는 날 — 그 사람 쪽(무게 0.8 이상) ∩ 내 쪽 문 */
  const mine = (myWin.open || []).concat(myWin.minor || []);
  const together = [];
  out.filter(w => w.weight >= 0.8).forEach(x => mine.forEach(m => {
    const s = x.start > m.start ? x.start : m.start, e = x.end < m.end ? x.end : m.end;
    if (s <= e) together.push({ start: s, end: e, peak: null, why: `${x.label} × 내 쪽 '${m.label}'` });
  }));
  together.sort((a, b) => a.start < b.start ? -1 : 1);
  const merged = [];
  together.forEach(w => {
    const last = merged[merged.length - 1];
    if (last && w.start <= addDays(last.end, 1)) {
      if (w.end > last.end) last.end = w.end;
      if (last.why.indexOf(w.why) < 0) last.why += ' · ' + w.why.split(' × ')[1];
    } else merged.push(Object.assign({}, w));
  });
  together.length = 0; merged.forEach(w => together.push(w));
  together.forEach(w => { w.when = fmtRange(w, refYear); });
  return { list: out, together };
}

/* 결론 — 판정 방향을 마지막 큰 카드 문구로 (재인님 문구 · 2026-11-11) */
const VERDICT = {
  '다시 두드려 볼 만한 쪽': { key: 'go',   lead: '참 소중한 그 사람에게,', line: '우리의 문제를 정확히 알고, 고칠 점을 들고 다가가야 할 때' },
  '조건이 맞을 때만':       { key: 'wait', lead: '참 사랑했던 그 사람을,', line: '사랑의 시절을 음미하며, 조금은 기다려야 할 때' },
  '놓는 쪽이 맞는 쪽':     { key: 'let',  lead: '참 고마웠던 그 사람을,', line: '이제는… 놓아줘야 할 때' }
};

/* 헤어진 년·월 → 기준일 · 개월 수 · 기존 단계 이름 */
function breakupInfo(breakup, todayYmd) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(String(breakup || ''))) return null;
  const [y, m] = breakup.split('-').map(Number);
  const [ty, tm] = todayYmd.split('-').map(Number);
  if (y < 1950) return null;
  const months = (ty - y) * 12 + (tm - m);
  if (months < 0) return null;
  const thenYmd = breakup + '-15' < todayYmd ? breakup + '-15' : addDays(todayYmd, -7);
  const stage = months <= 1 ? '1개월 이내' : months <= 4 ? '3개월' : months <= 9 ? '6개월' : months <= 24 ? '1년 이상' : '몇 년';
  const label = months <= 0 ? '이번 달' : months < 12 ? `약 ${months}개월` : (months % 12 ? `약 ${Math.floor(months / 12)}년 ${months % 12}개월` : `약 ${months / 12}년`);
  return { thenYmd, months, stage, label, ym: `${y}년 ${m}월` };
}

/* ============================================================================
   [7] AI 에게 넘길 다이제스트
   ============================================================================ */
function buildReunionDigest(A, B, nameA, nameB, opt) {
  const todayYmd = opt.todayYmd;
  const refYear = +todayYmd.slice(0, 4);
  const bk = breakupInfo(opt.breakup, todayYmd);
  const stage = bk ? bk.stage : (STAGE_DAYS[opt.stage] ? opt.stage : '3개월');

  const base = SYN.buildCoupleDigest(A.syn, B.syn, nameA, nameB);   // 차트·각도·오버레이·점수
  const aspects = base.aspects;
  const comp = base.composite;
  const ff = fiveFactors(A, B, nameA, nameB, aspects);
  const sky = opt.sky || skySeries(todayYmd, 548);
  const win = contactWindows(A, B, nameA, nameB, comp, todayYmd, sky);
  const tvn = thenVsNow(A, B, nameA, nameB, stage, todayYmd, bk ? bk.thenYmd : null);
  const exw = exWindows(B, nameB, sky, todayYmd, win);
  const letgo = letGoEvidence(aspects, ff, win);
  const direction = directionOf(ff, win, letgo, base.score);

  const hard = aspects.filter(a => HARD.includes(a.aspect) && a.weight >= 6).slice(0, 4);
  const soft = aspects.filter(a => HARMONIOUS.includes(a.aspect) && a.weight >= 6 && a.pA !== '토성' && a.pB !== '토성').slice(0, 4);

  const L = [];
  /* 궁합 다이제스트에서 '결혼·동거 지표'와 '분기점'은 재회운과 결이 달라 뺀다 */
  const baseText = base.text.split('\n[실제 계산된 관계 분기점')[0];
  L.push(baseText);

  L.push('\n[노드·명왕성 위치 — 재회운 전용 추가 계산]');
  L.push(`${nameA}님: 노스노드 ${SYN.signDeg(A.nodeN).sign} ${SYN.signDeg(A.nodeN).deg}도 / 사우스노드 ${SYN.signDeg(A.nodeS).sign} ${SYN.signDeg(A.nodeS).deg}도 / 명왕성 ${SYN.signDeg(A.pluto).sign} ${SYN.signDeg(A.pluto).deg}도`);
  L.push(`${nameB}님: 노스노드 ${SYN.signDeg(B.nodeN).sign} ${SYN.signDeg(B.nodeN).deg}도 / 사우스노드 ${SYN.signDeg(B.nodeS).sign} ${SYN.signDeg(B.nodeS).deg}도 / 명왕성 ${SYN.signDeg(B.pluto).sign} ${SYN.signDeg(B.pluto).deg}도`);

  L.push('\n[1장·4장 재료 — 이 관계를 끝나게 만든 갈등 축. 다시 만나면 같은 자리에서 또 작동한다]');
  if (hard.length) hard.forEach(a => L.push('- ' + a.text)); else L.push('- 강한 마찰각이 없다. 싸워서 끝난 관계가 아니라 서로에게 무심해져서 멀어진 관계로 봐라. 갈등을 지어내지 마라.');
  L.push('[2장 재료 — 지금도 남아 있는 끌림]');
  if (soft.length) soft.forEach(a => L.push('- ' + a.text)); else L.push('- 따뜻한 조화각이 적다. 남아 있는 것은 애정보다 익숙함·결속이다.');
  (ff.evidence['집착'] || []).slice(0, 3).forEach(e => L.push('- (깊은 결속) ' + e.text));

  L.push('\n[★ 3장 확정 판정 — 이 관계가 사람을 붙잡는 힘의 성분. 숫자를 바꾸지 마라]');
  L.push(`정 ${ff.share['정']}% / 성장 ${ff.share['성장']}%  →  사랑 쪽 합계 ${ff.love}%`);
  L.push(`익숙함 ${ff.share['익숙함']}% / 책임감 ${ff.share['책임감']}% / 집착 ${ff.share['집착']}%  →  관성 쪽 합계 ${ff.inertia}%`);
  L.push(ff.love >= 56 ? '판정: 못 놓는 이유는 사랑 쪽이 더 크다.' :
         ff.love <= 44 ? '판정: 못 놓는 이유는 관성 쪽이 더 크다.' :
         '판정: 사랑과 관성이 거의 반반으로 섞여 있다.');
  for (const k of ['정', '성장', '익숙함', '책임감', '집착']) {
    const top = (ff.evidence[k] || []).slice(0, 2);
    if (top.length) L.push(`  ${k}의 근거: ` + top.map(e => e.text).join(' / '));
  }

  L.push(`\n[5장 재료 — 헤어질 무렵(${bk ? bk.ym + ', 손님이 직접 입력' : '약 ' + krMonth(tvn.thenYmd, refYear)}) 하늘과 지금 하늘의 차이. ${nameA}님 기준]`);
  L.push('그때 있었고 지금은 풀린 것: ' + (tvn.lifted.length ? tvn.lifted.join(' / ') : '없음'));
  L.push('지금 새로 걸려 있는 것: ' + (tvn.arrived.length ? tvn.arrived.join(' / ') : '없음'));
  L.push('그때부터 지금까지 계속 걸려 있는 것: ' + (tvn.stayed.length ? tvn.stayed.join(' / ') : '없음'));
  L.push('→ 풀린 것이 있으면 "그때는 시기가 무거웠다"를, 새로 걸린 순풍이 있으면 "지금의 당신은 그때와 다르다"를 근거로 써라. 셋 다 없으면 "하늘이 바뀐 게 아니라 사람이 바뀌어야 하는 관계"로 정직하게 써라.');

  L.push(`\n[6장 재료 — ${nameB}님이 지금 통과하고 있는 시기. 속마음이 아니라 '시기의 성격'만 말할 수 있다]`);
  L.push('지금: ' + (tvn.bNow.length ? tvn.bNow.join(' / ') : '큰 행성의 뚜렷한 접촉 없음 — 비교적 평온한 구간'));
  if (tvn.bNext.length) L.push('앞으로 6개월: ' + tvn.bNext.join(' / '));

  L.push(`\n[★ 7장 확정 — ${nameB}님 쪽 하늘이 열리는 날. 오늘부터 18개월. 그 사람의 차트 기준 계산]`);
  L.push('🚨 "연락이 옵니다"가 아니라 "그 사람 쪽 하늘이 연락하기 쉬운 쪽으로 열리는 때"다. 이 차이를 지켜라.');
  const exStrong = exw.list.filter(w => w.weight >= 0.8), exWeak = exw.list.filter(w => w.weight < 0.8);
  if (exStrong.length) exStrong.forEach(w => L.push(`- [${w.label}] ${w.when} — ${w.why}`));
  else L.push('- 18개월 안에 그 사람의 금성·달을 직접 건드리는 강한 시기가 없다. 그대로 말하라. 지어내지 마라.');
  exWeak.slice(0, 6).forEach(w => L.push(`- (약하게) [${w.label}] ${w.when} — ${w.why}`));
  L.push(`[★★ 두 사람의 하늘이 같이 열리는 날 — 7장·8장에서 가장 강하게 말해도 되는 날]`);
  if (exw.together.length) exw.together.slice(0, 4).forEach(w => L.push(`- ${w.when} — ${w.why}`));
  else L.push('- 겹치는 날이 없다. "서로의 문이 다른 때 열린다"고 정직하게 말하라.');

  L.push('\n[★ 8장 확정 시기 — 내가 움직인다면. 오늘부터 18개월. 이 날짜만 쓴다. 지어내면 실패다]');
  if (win.best) {
    L.push(`가장 좋은 문: ${win.best.when} — ${win.best.why} (${win.best.label})`);
    const mr = win.retro.find(r => r.planet === '수성' && !(r.end < win.best.start || r.start > win.best.end));
    if (mr) L.push(`  ↳ 이 문은 수성 역행(${krDate(mr.start, refYear)} ~ ${krDate(mr.end, refYear)})과 겹친다. 옛 연락이 닿기 쉬운 대신 말이 꼬이기 쉽다 — 메시지는 짧고 분명하게, 긴 해명은 문이 닫힌 뒤가 아니라 만난 자리에서.`);
  }
  else L.push('가장 좋은 문: 18개월 안에 목성·금성이 관계의 자리를 여는 구간이 없다. 시기를 지어내지 말고 그대로 말하라.');
  const listed = win.all.filter(w => w !== win.best).slice(0, 10);
  listed.forEach(w => L.push(`- [${w.label}] ${w.when} — ${w.why}`));

  L.push('\n[★ 9장 확정 — 놓아야 할 근거]');
  if (letgo.length) letgo.slice(0, 5).forEach(x => L.push(`- (${x.kind}) ${x.text} → ${x.meaning}`));
  else L.push('- 차트에 놓아야 할 뚜렷한 근거가 없다. 대신 "이런 일이 다시 생기면 그때는 놓아라"라는 판단 기준을 구체적으로 줘라.');

  const vd = VERDICT[direction.dir];
  L.push(`\n[★ 10장 확정 결론 방향 — 뒤집지 마라] ${direction.dir}`);
  L.push(`리포트 맨 끝에 큰 글씨로 나갈 결론 문구: "${vd.lead} ${vd.line}" — 10장은 이 문장으로 수렴하게 써라.`);

  return {
    text: L.join('\n'),
    score: base.score, ff, win, tvn, letgo, direction, comp,
    stage, exw, verdict: vd, breakup: bk
  };
}

module.exports = {
  STAGES, INITIATORS, CONTACTS, STAGE_DAYS,
  buildReunionDigest, fiveFactors, contactWindows, thenVsNow, letGoEvidence, directionOf,
  exWindows, breakupInfo, VERDICT,
  skySeries, addDays, krDate, DIR_HI, DIR_LO
};
