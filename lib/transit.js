// ============================================================================
//  lib/transit.js — 오늘부터 30일, 일별 트랜짓 계산
// ----------------------------------------------------------------------------
//  왜 만들었나
//    상세페이지에 "8월치·9월치를 미리 찍어둔 운세가 아닙니다. 오늘 하늘의
//    실제 위치를 당신의 차트에 겹쳐 계산합니다"라고 약속해 두었는데,
//    기존 서버는 월별 표(매월 15일 기준)를 쓰고 있어 약속과 달랐습니다.
//
//  기존 버그가 구조적으로 사라지는 이유
//    · 움직일 날에 같은 날짜가 두 번 나오던 것 → Set 으로 중복 불가
//    · 한 날짜가 움직일 날·조심할 날 양쪽에 있던 것 → 극대점/극소점은
//      정의상 겹칠 수 없고, 추가로 배타 검사까지 함
//    · 날짜가 뒤죽박죽이던 것 → 날짜순 정렬
// ============================================================================

'use strict';

const EPH = require('./ephemeris.js');

const norm360 = x => ((x % 360) + 360) % 360;
function sep(a, b) {                    // 두 황경의 최소 이각
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/* ── 각도 정의 ────────────────────────────────────────────
   달은 하루 13도를 움직이므로 오브를 좁게 잡아야
   "그날만의 색"이 생깁니다. 넓게 잡으면 30일이 전부 비슷해집니다. */
const ASPECTS = [
  { ang: 0,   name: '합',   orb: 6, moonOrb: 4, tone: 'conj' },
  { ang: 60,  name: '육각', orb: 3, moonOrb: 2.5, tone: 'good' },
  { ang: 90,  name: '사각', orb: 5, moonOrb: 3.5, tone: 'hard' },
  { ang: 120, name: '삼각', orb: 5, moonOrb: 3.5, tone: 'good' },
  { ang: 180, name: '대립', orb: 6, moonOrb: 4, tone: 'hard' }
];

/* 트랜짓하는 쪽의 무게. 목성·토성이 지나가는 건 큰 사건이고
   달이 스치는 건 하루짜리 기분입니다. */
const T_WEIGHT = { '달': 0.55, '수성': 0.7, '태양': 1.0, '금성': 0.95, '화성': 1.05, '목성': 1.35, '토성': 1.3 };
/* 합(conjunction)의 성격 — 금성·목성은 좋고, 화성·토성은 부담입니다. */
const T_CONJ = { '금성': 1.0, '목성': 1.0, '태양': 0.45, '수성': 0.3, '달': 0.3, '화성': -0.75, '토성': -0.9 };
/* 내 차트에서 건드려지는 지점의 무게 */
const N_WEIGHT = { '태양': 1.2, '달': 1.2, '상승점': 1.2, '천정': 1.0, '금성': 1.0, '화성': 0.9, '수성': 0.8, '목성': 0.85, '토성': 0.85 };

const TRANSITERS = ['달', '수성', '금성', '태양', '화성', '목성', '토성'];

/* 영역별로 어떤 지점이 관여하는가 */
const DOMAIN = {
  love:  { natal: ['금성', '달'], houses: [5, 7] },
  money: { natal: ['금성', '목성'], houses: [2, 8] },
  work:  { natal: ['태양', '화성', '천정', '토성'], houses: [6, 10] },
  body:  { natal: ['상승점', '달', '화성'], houses: [1, 6] }
};

/* 홀사인 하우스 */
const houseOf = (lon, asc) =>
  ((Math.floor(norm360(lon) / 30) - Math.floor(norm360(asc) / 30)) % 12 + 12) % 12 + 1;

const MD = ['해석', '자아', '재물', '소통', '가정', '연애', '일상', '관계', '결속', '배움', '커리어', '인맥', '내면'];
const HOUSE_KR = {
  1: '나 자신·컨디션', 2: '돈·수입', 3: '소통·이동', 4: '집·가족', 5: '연애·즐거움',
  6: '일상·건강', 7: '관계·상대', 8: '깊은 결속·목돈', 9: '배움·먼 곳',
  10: '커리어·평가', 11: '인맥·모임', 12: '휴식·정리'
};

/* ── 하루치 점수 ──────────────────────────────────────────
   반환: { total, love, money, work, body, hits[] } */
function scoreDay(iso, natal, ascLon) {
  const tp = EPH.positions(iso, TRANSITERS);
  const acc = { total: 0, love: 0, money: 0, work: 0, body: 0 };
  const hits = [];

  for (const T of TRANSITERS) {
    const tl = tp[T];
    if (tl === undefined) continue;
    for (const N in natal) {
      if (natal[N] === undefined || N_WEIGHT[N] === undefined) continue;
      const d = sep(tl, natal[N]);
      for (const A of ASPECTS) {
        const orb = (T === '달') ? A.moonOrb : A.orb;
        const err = Math.abs(d - A.ang);
        if (err > orb) continue;

        const falloff = 1 - err / orb;                 // 정확할수록 강하게
        const base = T_WEIGHT[T] * N_WEIGHT[N] * falloff;
        let sign;
        if (A.tone === 'good') sign = 1;
        else if (A.tone === 'hard') sign = -1;
        else sign = T_CONJ[T] !== undefined ? T_CONJ[T] : 0.3;   // 합
        const v = base * sign;

        acc.total += v;
        for (const k in DOMAIN) {
          const nh = houseOf(natal[N], ascLon);
          if (DOMAIN[k].natal.indexOf(N) >= 0 || DOMAIN[k].houses.indexOf(nh) >= 0) acc[k] += v;
        }
        hits.push({
          t: T, n: N, asp: A.name, tone: A.tone, err: err, w: Math.abs(v), v: v,
          house: houseOf(tl, ascLon)
        });
        break;   // 한 쌍에 한 각만
      }
    }
  }
  hits.sort((a, b) => b.w - a.w);
  return Object.assign(acc, { hits: hits });
}

/* 원점수 → 0~100.
   ⚠️ 중심을 50 이 아니라 62 로 둡니다. 임의로 후하게 주는 게 아니라,
      트랜짓 합계에는 "이 값이 인생의 평균"이라 할 자연스러운 0점이 없습니다.
      어디를 50으로 부를지는 어차피 임의 선택이고, 정보는 '영역 간 상대 차이'에
      담깁니다. 중심을 50에 두면 손님 절반이 30~40점대를 보는데, 그건 계산의
      정직함이 아니라 눈금의 선택 문제입니다. 대신 진폭은 그대로 둬서
      영역별 차이와 좋은 달·힘든 달의 구분은 뚜렷하게 남깁니다. */
const to100 = (raw, k) => Math.round(Math.max(22, Math.min(96, 62 + 32 * Math.tanh(raw / (k || 4)))));

const fmt = dt => (dt.getMonth() + 1) + '월 ' + dt.getDate() + '일';

/* ── 30일 전체 계산 ─────────────────────────────────────── */
function analyze(opts) {
  const natal = opts.natal;              // { 태양: lon, 달: lon, ... 상승점, 천정 }
  const ascLon = opts.ascLon;
  const days = opts.days || 31;
  const tzOffset = opts.tzOffset || '+09:00';
  const start = opts.startDate ? new Date(opts.startDate) : new Date();
  start.setHours(0, 0, 0, 0);

  const rows = [];
  for (let i = 0; i < days; i++) {
    const dt = new Date(start.getTime() + i * 86400000);
    const ymd = dt.getFullYear() + '-' + String(dt.getMonth() + 1).padStart(2, '0') + '-' + String(dt.getDate()).padStart(2, '0');
    /* 그 날 정오 기준. 하루 중 어느 시점을 잡아도 달 외에는 거의 같습니다. */
    const s = scoreDay(ymd + 'T12:00:00' + tzOffset, natal, ascLon);
    rows.push({ i: i, dt: dt, label: fmt(dt), ymd: ymd, s: s });
  }

  const totals = rows.map(r => r.s.total);
  const mean = totals.reduce((a, b) => a + b, 0) / totals.length;
  const sd = Math.sqrt(totals.reduce((a, b) => a + (b - mean) * (b - mean), 0) / totals.length) || 1;

  /* 곡선 : 30일 안에서의 상대적 모양 */
  const flow = totals.map(t => Math.round(Math.max(20, Math.min(92, 58 + 22 * ((t - mean) / sd)))));

  /* ── 움직일 날 / 조심할 날 ──────────────────────────────
     극대점·극소점만 뽑습니다. 정의상 한 날짜가 둘 다일 수 없고,
     Set 으로 중복도 불가능합니다. 마지막에 배타 검사를 한 번 더 합니다. */
  const isPeak = i => (i === 0 || totals[i] >= totals[i - 1]) && (i === totals.length - 1 || totals[i] >= totals[i + 1]);
  const isDip  = i => (i === 0 || totals[i] <= totals[i - 1]) && (i === totals.length - 1 || totals[i] <= totals[i + 1]);

  const peaks = rows.filter(r => isPeak(r.i) && r.s.total > mean + 0.35 * sd)
                    .sort((a, b) => b.s.total - a.s.total).slice(0, 4);
  const dips  = rows.filter(r => isDip(r.i)  && r.s.total < mean - 0.35 * sd)
                    .sort((a, b) => a.s.total - b.s.total).slice(0, 3);

  const usedGood = new Set(), usedCare = new Set();
  const goodDays = [], careDays = [];
  peaks.sort((a, b) => a.i - b.i).forEach(r => {
    if (usedGood.has(r.label)) return;         // 중복 차단
    usedGood.add(r.label); goodDays.push(r.label);
  });
  dips.sort((a, b) => a.i - b.i).forEach(r => {
    if (usedCare.has(r.label)) return;
    if (usedGood.has(r.label)) return;          // 양쪽 동시 등장 차단
    usedCare.add(r.label); careDays.push(r.label);
  });

  /* ── 영역 점수 ───────────────────────────────────────── */
  const sum = k => rows.reduce((a, r) => a + r.s[k], 0) / rows.length;
  const scores = {
    total: to100(sum('total'), 3.2),
    love:  to100(sum('love'),  1.8),
    money: to100(sum('money'), 1.8),
    work:  to100(sum('work'),  2.0),
    body:  to100(sum('body'),  1.8)
  };

  /* ── AI 에게 줄 근거 ─────────────────────────────────── */
  const top = [];
  rows.forEach(r => r.s.hits.slice(0, 2).forEach(h => top.push({ label: r.label, i: r.i, h: h })));
  top.sort((a, b) => b.h.w - a.h.w);
  const seenPair = new Set(), lines = [];
  for (const x of top) {
    const key = x.h.t + '-' + x.h.n + '-' + x.h.asp;
    if (seenPair.has(key)) continue;            // 같은 조합 반복 금지
    seenPair.add(key);
    const toneKR = x.h.tone === 'good' ? '순풍' : (x.h.tone === 'hard' ? '역풍' : '겹침');
    lines.push('· ' + x.label + ' — 하늘의 ' + x.h.t + '이 내 ' + x.h.n + '과 ' +
      x.h.asp + '(오차 ' + x.h.err.toFixed(1) + '도, ' + toneKR + '). ' +
      '지금 ' + x.h.t + '은 내 ' + x.h.house + '하우스(' + HOUSE_KR[x.h.house] + ')를 지나는 중.');
    if (lines.length >= 12) break;
  }

  return {
    baseDate: rows[0].ymd,
    periodStart: rows[0].label,
    periodEnd: rows[rows.length - 1].label,
    flow: flow,
    goodDays: goodDays,
    careDays: careDays,
    scores: scores,
    digest: lines.join('\n'),
    daily: rows.map(r => ({ label: r.label, score: flow[r.i] }))
  };
}

module.exports = { analyze: analyze, scoreDay: scoreDay, HOUSE_KR: HOUSE_KR };
