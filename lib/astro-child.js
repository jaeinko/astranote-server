// ============================================================================
//  lib/astro-child.js — 우리 아이 양육설명서 계산 엔진 (24,900원)
// ----------------------------------------------------------------------------
//  ▣ 이 상품이 파는 것
//
//  "우리 아이가 어떤 아이인가"는 부모가 이미 압니다. 매일 보니까요.
//  부모가 모르는 건 <b>왜 그런가</b>와 <b>언제 무슨 일이 오는가</b>입니다.
//  그래서 이 리포트의 값어치는 두 곳에 몰려 있습니다.
//
//    · 부모와 아이가 부딪히는 자리를 시너스트리로 짚는다 (2·3장)
//    · 토성 하드각이 오는 시기를 실제로 계산해 예고한다 (7장) ★
//
//  ▣ 7장이 이 상품의 심장이다
//
//  브리프에는 "토성 스퀘어(만 7세, 만 14~15세)"라고 적혀 있었지만,
//  Swiss Ephemeris 로 실측해 보니 아이마다 이만큼 벌어집니다.
//
//      1차 스퀘어   7.4세 ~ 8.9세
//      대립(사춘기) 13.8세 ~ 16.2세
//      2차 스퀘어   20.9세 ~ 22.6세
//
//  토성 궤도가 타원이라 근일점 부근에서 빨라지기 때문입니다.
//  고정값 "7세"로 쓰면 2015년생 아이의 부모는 7세를 떠올렸다가
//  아무 일도 없었음을 확인하고, 그 자리에서 리포트를 닫습니다.
//  반드시 아이별로 계산합니다.
//
//  ▣ 역행 다중통과 — 그냥 넘기면 아까운 재료
//
//  토성은 역행하면서 같은 각을 최대 3번 지나갑니다.
//  "이 시기는 세 번에 걸쳐 옵니다. 한 번 지나갔다고 끝난 게 아닙니다"는
//  실제 계산에서 나온 사실이고, 부모가 겪은 일과 맞아떨어집니다.
//
//  ▣ 🚨 이 파일이 지켜야 하는 것 — 아이는 자기를 변호할 수 없다
//
//  부정적 낙인이 찍히면 부모가 그렇게 대하고, 그게 실제로 그 아이를 만듭니다.
//  그래서 이 엔진은 아이의 능력이나 성격을 <b>결함으로 규정하는 값을 애초에
//  만들지 않습니다.</b> 모든 축이 양극(兩極)이고, 양쪽 다 중립적으로 서술됩니다.
//
//      ❌ 산만함 점수 78          ← 이런 값을 만들지 않는다
//      ✅ 재촉 반응: 느린 쪽 (-42) ← 빠른 쪽도 느린 쪽도 우열이 없다
//
//  ▣ 기존 상품 영향
//
//  없습니다. astro-synastry.js 를 읽기만 하고 아무것도 고치지 않습니다.
// ============================================================================

'use strict';

const SYN = require('./astro-synastry.js');

const RAD = Math.PI / 180;
const norm360 = SYN.norm360;
const angleDiff = SYN.angleDiff;
const signDeg = SYN.signDeg;
const josa = SYN.josa;
const houseOf = SYN.houseOf;

/* ==========================================================================
   [1] 느린 행성 — 7장 전용
   --------------------------------------------------------------------------
   🚨 처음에는 JPL 근사 궤도요소로 토성을 직접 구현했다가 버렸다.
      lib/ephemeris.js 에 이미 토성이 있고, Schlyter 섭동항이 들어가 있어
      더 정확했기 때문이다. Swiss Ephemeris 대조 결과:

          lib/ephemeris.js   최대 2.85 arcmin
          직접 구현한 JPL     최대 8.51 arcmin   ← 3배 나쁨

      토성 마일스톤은 역행 고리가 목표각을 아슬아슬하게 넘는지로 통과 횟수가
      갈리기 때문에, 이 3배 차이가 실제 판정을 바꾼다.
      게다가 30일 운세가 쓰는 것과 같은 계산이 되어 상품 간 근거도 통일된다.
========================================================================== */
const EPH = require('./ephemeris.js');

function julianDayFromYMD(y, m, d) {
  if (m <= 2) { y -= 1; m += 12; }
  const A = Math.floor(y / 100);
  const B = 2 - A + Math.floor(A / 4);
  return Math.floor(365.25 * (y + 4716)) + Math.floor(30.6001 * (m + 1)) + d + B - 1524.5;
}

/* ephemeris.js 는 '2000-01-00 00:00 UT 기준 경과일'을 받는다 (Schlyter 의 d) */
const JD_TO_D = 2451543.5;
function saturnLongitudeJD(jd) { return EPH.fn['토성'](jd - JD_TO_D); }
function jupiterLongitudeJD(jd) { return EPH.fn['목성'](jd - JD_TO_D); }

/* ==========================================================================
   [2] 토성 마일스톤 — ★7장의 근거
   --------------------------------------------------------------------------
   출생 토성에서부터 토성이 실제로 몇 도를 진행했는지를 '언랩'해서 추적합니다.

   🚨 왜 언랩이 필요한가
   단순히 (현재토성 - 출생토성) % 360 으로 재면, 역행 때문에 값이 0 과 360 을
   넘나들며 오탐이 납니다(실제로 초기 구현에서 전 케이스가 "0.0세"로 나왔습니다).
   매 스텝의 증분을 -180~180 으로 정규화해 누적해야 정확합니다.

   역행 구간에서는 증분이 음수가 되고, 그래서 같은 목표각을 여러 번 통과합니다.
   그 통과를 전부 기록합니다. 3회 통과는 실제로 흔하며, 부모가 겪는
   "그때 한 번 크게 부딪히고, 잠잠하다가, 또 한 번 왔다"와 정확히 맞습니다.
========================================================================== */
const SAT_TARGETS = [
  { deg: 90,  key: 'sq1', label: '첫 번째 시험',
    meaning: '처음으로 "나"와 "규칙"이 부딪히는 때. 학교·규율·또래 서열이 한꺼번에 들어온다.' },
  { deg: 180, key: 'opp', label: '사춘기의 고비',
    meaning: '자기가 누구인지 정하려는 힘과 어른이 정해 준 틀이 정면으로 맞선다. 이 상품에서 가장 중요한 시기.' },
  { deg: 270, key: 'sq2', label: '홀로서기의 관문',
    meaning: '진로·독립·책임이 현실이 되는 때. 부모의 역할이 보호에서 조언으로 바뀌는 지점.' }
];

/**
 * @param natalSaturnAbs 출생 토성 황경(트로피컬)
 * @param birth {y,m,d}
 * @param maxAge 몇 살까지 볼 것인가
 */
function saturnMilestones(natalSaturnAbs, birth, maxAge) {
  const jd0 = julianDayFromYMD(birth.y, birth.m, birth.d);
  const limit = Math.round((maxAge || 24) * 365.25);
  const STEP = 2;   // 2일 간격. 토성은 하루 최대 0.13도라 통과를 놓치지 않는다.

  let prevLon = saturnLongitudeJD(jd0);
  let cum = 0, prevCum = 0;
  const hits = {};
  /* 스침 판정용 : 마지막 통과 이후 목표각에서 얼마나 멀어졌는지 */
  const dev = {};
  SAT_TARGETS.forEach(t => { hits[t.key] = []; dev[t.key] = 0; });

  /* 🚨 스침 필터
     역행 고리가 목표각을 아슬아슬하게 스치는 경우, 통과로 셀지 말지가
     계산 정밀도에 걸린다. Swiss Ephemeris 대조에서
     ephemeris.js 로 바꿔 오차가 0.047도까지 내려왔으므로, 그 3배인 0.15도를
     기준으로 잡는다. 이보다 얕게 스친 통과는 계산 오차와 구별되지 않는다.
     진짜 역행 고리는 목표각을 훌쩍 넘나들므로 영향을 받지 않는다. */
  const GRAZE = 0.15;

  for (let k = STEP; k <= limit; k += STEP) {
    const lon = saturnLongitudeJD(jd0 + k);
    /* 🚨 (lon - prevLon + 180) % 360 - 180 으로 쓰면 안 된다.
       자바스크립트의 % 는 모듈로가 아니라 나머지라서 피제수의 부호를 그대로 남긴다.
       토성이 359.9도 → 0.1도로 넘어가는 순간 lon-prevLon 이 -359.8 이 되는데,
       위 식은 +0.2 대신 -359.8 을 돌려준다. 그 한 번의 오차로 누적각에 -360 이
       통째로 꽂히고, 이미 한참 지나간 마일스톤이 다시 통과한 것처럼 잡힌다.
       (실제로 만 12.9세에 '첫 번째 토성 스퀘어'가 또 왔다고 나왔다)
       norm360 은 ((x%360)+360)%360 이라 진짜 모듈로다. */
    let d = norm360(lon - prevLon);
    if (d > 180) d -= 360;             // 역행이면 음수
    cum += d;
    prevLon = lon;

    for (const t of SAT_TARGETS) {
      const crossed = (prevCum < t.deg && t.deg <= cum) || (cum < t.deg && t.deg <= prevCum);
      if (crossed) {
        const arr = hits[t.key];
        /* 직전 통과 이후 목표각에서 충분히 멀어진 적이 없으면 = 스친 것이다.
           그 짝을 통째로 지운다 (들어갔다 나온 두 번이 모두 허위). */
        if (arr.length && dev[t.key] < GRAZE) arr.pop();
        else arr.push(k / 365.25);
        dev[t.key] = 0;
      } else {
        const away = Math.abs(cum - t.deg);
        if (away > dev[t.key]) dev[t.key] = away;
      }
    }
    prevCum = cum;
  }

  return SAT_TARGETS.map(t => {
    const ages = hits[t.key];
    if (!ages.length) return null;
    const first = ages[0], last = ages[ages.length - 1];
    const yFirst = birth.y + Math.floor(first + (birth.m - 1) / 12);
    const yLast = birth.y + Math.floor(last + (birth.m - 1) / 12);
    return {
      key: t.key,
      label: t.label,
      meaning: t.meaning,
      ageFrom: +first.toFixed(1),
      ageTo: +last.toFixed(1),
      passes: ages.length,
      yearFrom: yFirst,
      yearTo: yLast,
      // 부모에게 보여줄 문장
      text: ages.length === 1
        ? `만 ${first.toFixed(0)}세 무렵(${yFirst}년) — ${t.label}`
        : `만 ${first.toFixed(0)}~${last.toFixed(0)}세(${yFirst}~${yLast}년) — ${t.label} · 토성이 역행하며 ${ages.length}번에 걸쳐 지나간다`
    };
  }).filter(Boolean);
}

/* --------------------------------------------------------------------------
   목성 리턴 — 첫 개화. 약 11.9세.
   VVIP 예시 리포트에서 "12살, 첫 번째 개화"로 쓰인 그 계산입니다.
-------------------------------------------------------------------------- */
function jupiterReturn(natalJupiterAbs, birth, maxAge) {
  const jd0 = julianDayFromYMD(birth.y, birth.m, birth.d);
  const limit = Math.round((maxAge || 24) * 365.25);
  const out = [];
  let prev = null, prevD = null;
  for (let k = 0; k <= limit; k += 3) {
    const d = angleDiff(jupiterLongitudeJD(jd0 + k), natalJupiterAbs);
    if (prevD !== null && prev !== null && prevD < prev && prevD < d && prevD < 2) {
      const age = (k - 3) / 365.25;
      if (age > 1 && (!out.length || age - out[out.length - 1].age > 6)) {
        const yr = birth.y + Math.floor(age + (birth.m - 1) / 12);
        out.push({ age: +age.toFixed(1), year: yr });
      }
    }
    prev = prevD; prevD = d;
  }
  return out;
}

/* --------------------------------------------------------------------------
   토성이 아이의 태양·달·상승점에 거는 하드각
   7장에서 "왜 하필 그때인가"의 보조 근거로 씁니다.
-------------------------------------------------------------------------- */
function saturnHardHits(chart, birth, maxAge) {
  const jd0 = julianDayFromYMD(birth.y, birth.m, birth.d);
  const limit = Math.round((maxAge || 20) * 365.25);
  const bodies = ['태양', '달', '상승점'];
  const ASPECTS = [{ a: 0, n: '합' }, { a: 90, n: '각' }, { a: 180, n: '대립' }];
  const out = [];

  for (const p of bodies) {
    const n = chart.planets[p];
    if (!n) continue;
    for (const asp of ASPECTS) {
      let inWin = false, startAge = 0;
      for (let k = 0; k <= limit; k += 5) {
        const lon = saturnLongitudeJD(jd0 + k);
        const off = Math.abs(angleDiff(lon, n.abs) - asp.a);
        const within = off <= 2;
        if (within && !inWin) { inWin = true; startAge = k / 365.25; }
        if (!within && inWin) {
          inWin = false;
          const endAge = k / 365.25;
          if (endAge >= 1) {
            out.push({
              body: p, aspect: asp.n,
              ageFrom: +startAge.toFixed(1), ageTo: +endAge.toFixed(1),
              year: birth.y + Math.floor(startAge + (birth.m - 1) / 12)
            });
          }
        }
      }
    }
  }
  out.sort((a, b) => a.ageFrom - b.ageFrom);

  /* 🚨 역행 때문에 같은 각이 오브를 들락날락하며 여러 줄로 쪼개진다.
     (검증에서 "만 1~1.2세 토성 각 → 달"이 두 번 연속 나왔다)
     같은 행성·같은 각이고 1년 안에 붙어 있으면 한 구간으로 합친다.
     또 만 3세 미만은 부모에게 쓸모가 없다. 그때 일을 기억하지도 못하고,
     기억한들 지금 할 수 있는 일이 없다. */
  const merged = [];
  const idx = {};   // body|aspect → merged 안에서의 위치
  for (const h of out) {
    if (h.ageTo < 3) continue;
    const key = h.body + '|' + h.aspect;
    const at = idx[key];
    /* 🚨 바로 앞 항목만 보면 안 된다. 목록이 나이순이라 다른 행성이 사이에 끼면
       같은 각의 역행 통과가 따로 남는다(검증에서 "토성 합 → 달"이 세 줄로 나왔다).
       같은 행성·같은 각을 찾아서 합친다. */
    if (at !== undefined && h.ageFrom - merged[at].ageTo < 1.2) {
      merged[at].ageTo = h.ageTo;
      merged[at].passes = (merged[at].passes || 1) + 1;
      continue;
    }
    idx[key] = merged.length;
    merged.push(Object.assign({ passes: 1 }, h));
  }
  merged.sort((a, b) => a.ageFrom - b.ageFrom);
  return merged;
}

/* ==========================================================================
   [3] 기질 4축 — 부모가 내일 아침에 쓸 수 있는 형태로만 낸다
   --------------------------------------------------------------------------
   🚨 설계 원칙 : 모든 축은 양극이고, 양쪽 어디에도 우열이 없다.

   "산만함 78점" 같은 값은 만들지 않는다. 그런 숫자가 리포트에 실리면
   부모는 그걸 결함으로 읽고, 아이를 그렇게 대하기 시작한다.
   대신 "재촉하면 느려지는 쪽"처럼 <b>대응 방법이 따라 나오는 형태</b>로만 낸다.

   축과 근거
     속도   재촉했을 때 빨라지나 느려지나   흙/고정궁·토성 ↔ 불/활동궁·화성
     표현   감정을 밖에 내나 안에 삼키나    불/공기·1·5하우스 ↔ 물/흙·4·8·12하우스
     자극   새것이 반가운가 불안한가        변통궁·공기·목성·3·9하우스 ↔ 고정궁·4하우스·토성
     경계   규칙에 순응하나 부딪히나        토성 소프트·10하우스 ↔ 화성-토성 하드·1하우스 화성
========================================================================== */
const ELEM = { '양자리':'불','사자자리':'불','사수자리':'불',
               '황소자리':'흙','처녀자리':'흙','염소자리':'흙',
               '쌍둥이자리':'공기','천칭자리':'공기','물병자리':'공기',
               '게자리':'물','전갈자리':'물','물고기자리':'물' };
const MODE = { '양자리':'활동','게자리':'활동','천칭자리':'활동','염소자리':'활동',
               '황소자리':'고정','사자자리':'고정','전갈자리':'고정','물병자리':'고정',
               '쌍둥이자리':'변통','처녀자리':'변통','사수자리':'변통','물고기자리':'변통' };

function elemOf(pl) { return pl ? ELEM[pl.sign] : null; }
function modeOf(pl) { return pl ? MODE[pl.sign] : null; }

/* 축 정의 : [축이름, 음수쪽 라벨, 양수쪽 라벨] */
const AXES = {
  '속도': ['재촉하면 느려지는 쪽', '재촉하면 빨라지는 쪽'],
  '표현': ['안으로 삼키는 쪽', '밖으로 내는 쪽'],
  '자극': ['익숙한 것이 편한 쪽', '새로운 것이 반가운 쪽'],
  '경계': ['규칙에 부딪히는 쪽', '규칙에 순응하는 쪽']
};

function tempEngine(chart, selfAspects) {
  const P = chart.planets;
  const bag = { '속도': 0, '표현': 0, '자극': 0, '경계': 0 };
  const ev = { '속도': [], '표현': [], '자극': [], '경계': [] };

  function add(axis, v, why) { bag[axis] += v; ev[axis].push((v > 0 ? '+' : '') + v.toFixed(1) + ' ' + why); }

  const moon = P['달'], asc = P['상승점'], mer = P['수성'], mars = P['화성'],
        sat = P['토성'], ven = P['금성'], sun = P['태양'], jup = P['목성'];

  /* ── 속도 ── */
  for (const [pl, nm, w] of [[moon, '달', 3], [asc, '상승점', 2.5], [mer, '수성', 1.5]]) {
    if (!pl) continue;
    const e = elemOf(pl), m = modeOf(pl);
    if (e === '흙') add('속도', -w, `${nm}이 ${pl.sign}(흙)`);
    if (e === '불') add('속도', +w, `${nm}이 ${pl.sign}(불)`);
    if (m === '고정') add('속도', -w * 0.6, `${nm}이 고정궁`);
    if (m === '활동') add('속도', +w * 0.6, `${nm}이 활동궁`);
  }
  if (mars && asc && angleDiff(mars.abs, asc.abs) < 8) add('속도', +2.5, '화성이 상승점에 붙음');
  if (sat && moon && angleDiff(sat.abs, moon.abs) < 8) add('속도', -2.5, '토성이 달에 붙음');

  /* ── 표현 ── */
  for (const [pl, nm, w] of [[moon, '달', 3.5], [asc, '상승점', 2]]) {
    if (!pl) continue;
    const e = elemOf(pl);
    if (e === '불' || e === '공기') add('표현', +w, `${nm}이 ${pl.sign}(${e})`);
    if (e === '물' || e === '흙') add('표현', -w, `${nm}이 ${pl.sign}(${e})`);
  }
  if (chart.ascSignIndex !== null) {
    for (const [pl, nm] of [[moon, '달'], [sun, '태양'], [ven, '금성']]) {
      if (!pl) continue;
      const h = houseOf(chart, pl.abs);
      if (h === 1 || h === 5 || h === 10) add('표현', +1.9, `${nm}이 ${h}하우스`);
      if (h === 4 || h === 8 || h === 12) add('표현', -1.8, `${nm}이 ${h}하우스`);
    }
  }
  if (sat && moon && angleDiff(sat.abs, moon.abs) < 8) add('표현', -2, '토성-달 접촉');
  if (jup && moon && angleDiff(jup.abs, moon.abs) < 8) add('표현', +2, '목성-달 접촉');
  if (mars && moon && angleDiff(mars.abs, moon.abs) < 7) add('표현', +1.6, '화성-달 접촉');

  /* ── 자극 ── */
  for (const [pl, nm, w] of [[moon, '달', 2.5], [mer, '수성', 2.5], [asc, '상승점', 2]]) {
    if (!pl) continue;
    const m = modeOf(pl), e = elemOf(pl);
    if (m === '변통') add('자극', +w, `${nm}이 변통궁`);
    if (m === '고정') add('자극', -w, `${nm}이 고정궁`);
    if (e === '공기') add('자극', +w * 0.6, `${nm}이 ${e}`);
    if (e === '흙')   add('자극', -w * 0.6, `${nm}이 ${e}`);
  }
  if (chart.ascSignIndex !== null && jup) {
    const h = houseOf(chart, jup.abs);
    if (h === 3 || h === 9) add('자극', +2, `목성이 ${h}하우스`);
  }
  if (chart.ascSignIndex !== null && moon) {
    const h = houseOf(chart, moon.abs);
    if (h === 4) add('자극', -2.2, '달이 4하우스');
  }

  /* ── 경계 ── */
  if (sat) {
    if (chart.ascSignIndex !== null) {
      const h = houseOf(chart, sat.abs);
      if (h === 10 || h === 6) add('경계', +2, `토성이 ${h}하우스`);
      if (h === 1 || h === 4) add('경계', -1.6, `토성이 ${h}하우스`);
    }
  }
  for (const a of (selfAspects || [])) {
    const pair = [a.pA, a.pB].sort().join('-');
    if (pair === '토성-화성') add('경계', a.hard ? -3 : +1.5, `화성-토성 ${a.aspect}`);
    if (pair === '태양-토성') add('경계', a.hard ? -2 : +1.5, `태양-토성 ${a.aspect}`);
    if (pair === '달-화성' && a.hard) add('경계', -1.8, `달-화성 ${a.aspect}`);
  }
  if (mars && chart.ascSignIndex !== null) {
    const h = houseOf(chart, mars.abs);
    if (h === 1) add('경계', -2, '화성이 1하우스');
    if (h === 10 || h === 6) add('경계', +1.6, `화성이 ${h}하우스`);
  }
  /* 🚨 초기 버전은 경계축 규칙이 다섯 개뿐이라 평균강도가 21에 그쳤고
     56%가 "중간"으로 나와 판정 자체가 성립하지 않았다. 아래를 보강한다. */
  if (mars) {
    const e = elemOf(mars), m = modeOf(mars);
    if (e === '불') add('경계', -2.2, `화성이 ${mars.sign}(불)`);
    if (e === '흙') add('경계', +2.2, `화성이 ${mars.sign}(흙)`);
    if (m === '활동') add('경계', -1.4, '화성이 활동궁');
    if (m === '고정') add('경계', +1.4, '화성이 고정궁');
  }
  if (sat) {
    const e = elemOf(sat);
    if (e === '흙') add('경계', +1.8, `토성이 ${sat.sign}(흙)`);
    if (e === '불') add('경계', -1.8, `토성이 ${sat.sign}(불)`);
  }
  if (sun && sat && angleDiff(sun.abs, sat.abs) < 8) add('경계', +1.5, '태양-토성 접촉');

  /* ── -100~100 으로 환산 ──
     🚨 정규화 상수는 무작위 차트 600개에서 각 축 절대값의 90분위를 잡은 값이다.
        (tools 로 재산출 가능) 이 값으로 나누면 대부분이 -100~100 안에 들어오고,
        양극 어느 쪽으로도 치우치지 않는다. */
  const SCALE = { '속도': 8.4, '표현': 11.8, '자극': 8.5, '경계': 6.9 };
  const score = {}, side = {}, strength = {};
  for (const k of Object.keys(bag)) {
    const v = Math.max(-100, Math.min(100, Math.round((bag[k] / SCALE[k]) * 100)));
    score[k] = v;
    side[k] = v < 0 ? AXES[k][0] : AXES[k][1];
    const a = Math.abs(v);
    strength[k] = a >= 55 ? '뚜렷함' : (a >= 25 ? '어느 정도' : '중간 — 상황에 따라 달라짐');
  }
  return { score, side, strength, evidence: ev };
}

/* ==========================================================================
   [4] 칭찬이 닿는 방식 — 6장
   --------------------------------------------------------------------------
   같은 칭찬도 아이마다 닿는 통로가 다릅니다. 엉뚱한 통로로 주면
   부모는 "칭찬을 해도 반응이 없다"고 느끼고, 아이는 받은 적이 없다고 느낍니다.
========================================================================== */
const PRAISE_CH = {
  '말': '말로 정확히 짚어 주기 — "잘했어"가 아니라 "여기 이 부분을 이렇게 한 게 좋았어"',
  '몸': '몸으로 — 안아 주기, 옆에 앉기, 같이 먹기. 말보다 접촉이 먼저 닿는다',
  '무대': '보는 앞에서 — 가족이나 사람들 있는 자리에서 인정해 주기',
  '결과물': '만든 것을 남겨 주기 — 그림을 붙여 두거나 사진을 찍어 두는 방식',
  '시간': '방해 없는 단둘의 시간 — 칭찬의 말보다 온전히 함께 있는 시간이 크게 닿는다'
};

function praiseChannel(chart) {
  const P = chart.planets;
  const s = { '말': 0, '몸': 0, '무대': 0, '결과물': 0, '시간': 0 };
  const why = [];

  const ven = P['금성'], mer = P['수성'], moon = P['달'], sun = P['태양'];

  if (ven) {
    const e = elemOf(ven);
    if (e === '공기') { s['말'] += 3; why.push('금성이 ' + ven.sign + '(공기) — 말이 닿는다'); }
    if (e === '흙')   { s['몸'] += 4; s['결과물'] += 2; why.push('금성이 ' + ven.sign + '(흙) — 만질 수 있는 것이 닿는다'); }
    if (e === '불')   { s['무대'] += 3; why.push('금성이 ' + ven.sign + '(불) — 보는 앞에서 인정받는 것이 닿는다'); }
    if (e === '물')   { s['시간'] += 3; s['몸'] += 1.5; why.push('금성이 ' + ven.sign + '(물) — 함께 있는 시간이 닿는다'); }
  }
  if (mer && elemOf(mer) === '공기') { s['말'] += 1.5; why.push('수성이 ' + mer.sign + ' — 말을 정확히 알아듣는다'); }
  /* 🚨 '결과물' 통로가 3.6%밖에 안 나와 사실상 죽어 있었다.
     만든 것을 남겨 주는 방식이 닿는 아이는 실제로 흔하므로 근거를 넓힌다. */
  if (mer && elemOf(mer) === '흙') { s['결과물'] += 1.5; why.push('수성이 ' + mer.sign + ' — 눈에 보이는 결과로 확인받는다'); }
  if (P['토성'] && elemOf(P['토성']) === '흙') { s['결과물'] += 1.5; why.push('토성이 ' + P['토성'].sign + ' — 쌓인 것이 남을 때 안심한다'); }
  if (P['태양'] && elemOf(P['태양']) === '흙') { s['결과물'] += 0.8; why.push('태양이 ' + P['태양'].sign + ' — 해낸 것이 남아야 인정으로 느낀다'); }
  if (moon) {
    const e = elemOf(moon);
    if (e === '물') { s['시간'] += 2; why.push('달이 ' + moon.sign + ' — 곁에 있어 주는 것이 크게 닿는다'); }
    if (e === '흙') { s['몸'] += 3; why.push('달이 ' + moon.sign + ' — 반복되는 일상과 접촉이 닿는다'); }
  }
  if (chart.ascSignIndex !== null) {
    for (const [pl, nm] of [[ven, '금성'], [sun, '태양']]) {
      if (!pl) continue;
      const h = houseOf(chart, pl.abs);
      if (h === 5)  { s['무대'] += 2.5; why.push(`${nm}이 5하우스 — 드러내 놓고 칭찬받는 자리`); }
      if (h === 2)  { s['결과물'] += 3; why.push(`${nm}이 2하우스 — 남는 것이 닿는다`); }
      if (h === 6)  { s['결과물'] += 2; why.push(`${nm}이 6하우스 — 해낸 일이 쌓이는 것이 닿는다`); }
      if (h === 10) { s['무대'] += 2; why.push(`${nm}이 10하우스 — 밖에서 인정받는 것이 닿는다`); }
      if (h === 4)  { s['시간'] += 2; why.push(`${nm}이 4하우스 — 집 안에서의 시간이 닿는다`); }
      if (h === 3)  { s['말'] += 2; why.push(`${nm}이 3하우스 — 말로 오가는 것이 닿는다`); }
      if (h === 12) { s['시간'] += 1.5; why.push(`${nm}이 12하우스 — 조용한 둘만의 자리가 닿는다`); }
    }
  }

  const ranked = Object.keys(s).sort((a, b) => s[b] - s[a]);
  const top = ranked[0];
  const second = ranked[1];
  return {
    top, second,
    topText: PRAISE_CH[top],
    secondText: PRAISE_CH[second],
    decisive: s[top] - s[second] >= 2,
    why,
    raw: s
  };
}

/* ==========================================================================
   [5] 아이가 말 안 하고 삼키는 것 — 5장
========================================================================== */
function swallowed(chart, selfAspects) {
  const rows = [];
  const P = chart.planets;

  if (chart.ascSignIndex !== null) {
    for (const p of ['달', '태양', '수성', '금성', '화성', '토성']) {
      const pl = P[p];
      if (!pl) continue;
      const h = houseOf(chart, pl.abs);
      if (h === 12) {
        rows.push({
          key: p,
          text: `${josa(p, '이', '가')} 12하우스에 있다 — 이 영역은 아이가 밖으로 잘 안 꺼낸다`
        });
      }
    }
  }
  const moon = P['달'];
  if (moon) {
    const e = elemOf(moon);
    if (e === '물') rows.push({ key: '달', text: `달이 ${moon.sign}(물) — 감정을 느끼는 폭은 크지만 말로 옮기는 데 시간이 걸린다` });
    if (e === '흙') rows.push({ key: '달', text: `달이 ${moon.sign}(흙) — 힘들어도 "괜찮다"로 덮고 혼자 처리하려 한다` });
  }
  for (const a of (selfAspects || [])) {
    const pair = [a.pA, a.pB].sort().join('-');
    if (pair === '달-토성') rows.push({ key: '달-토성', text: `달과 토성이 ${a.aspect} — 응석을 부려도 되는 자리에서 먼저 참는다` });
    if (pair === '수성-토성' && a.hard) rows.push({ key: '수성-토성', text: `수성과 토성이 ${a.aspect} — 말이 늦게 나오지만, 나오면 정확하다` });
  }

  if (!rows.length) {
    rows.push({ key: null, text: '숨기는 자리가 뚜렷하지 않다. 느낀 것을 대체로 그대로 표현하는 편이다.' });
  }
  return rows;
}

/* ==========================================================================
   [6] 아이 차트 안의 각 (자기 차트 내부 어스펙트)
   --------------------------------------------------------------------------
   시너스트리(두 사람 사이)와 달리 한 차트 안의 각입니다.
   기질 판정과 5장에서 씁니다.
========================================================================== */
const SELF_ASPECTS = [
  { key: '합',   angle: 0,   orb: 7, hard: false },
  { key: '대립', angle: 180, orb: 6, hard: true },
  { key: '각',   angle: 90,  orb: 5, hard: true },
  { key: '삼각', angle: 120, orb: 5, hard: false },
  { key: '육각', angle: 60,  orb: 3, hard: false }
];

function selfAspects(chart) {
  const list = SYN.SYN_PLANETS.filter(p => chart.planets[p]);
  const out = [];
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const A = chart.planets[list[i]], B = chart.planets[list[j]];
      const d = angleDiff(A.abs, B.abs);
      for (const asp of SELF_ASPECTS) {
        let orb = asp.orb;
        if (list[i] === '상승점' || list[j] === '상승점') orb -= 1;
        if (chart.uncertain) {
          if (chart.uncertain[list[i]]) orb -= chart.uncertain[list[i]];
          if (chart.uncertain[list[j]]) orb -= chart.uncertain[list[j]];
        }
        orb = Math.max(1.5, orb);
        const off = Math.abs(d - asp.angle);
        if (off > orb) continue;
        out.push({
          pA: list[i], pB: list[j], aspect: asp.key, hard: asp.hard,
          orb: +off.toFixed(1),
          text: `${list[i]} — ${list[j]} : ${asp.key}(오차 ${off.toFixed(1)}도)`
        });
        break;
      }
    }
  }
  return out;
}

/* ==========================================================================
   [7] 원소·성질 밸런스 (VVIP 리포트와 같은 형식)
========================================================================== */
function balance(chart) {
  const el = { '불': 0, '흙': 0, '공기': 0, '물': 0 };
  const md = { '활동': 0, '고정': 0, '변통': 0 };
  const W = { '태양': 3, '달': 3, '상승점': 3, '수성': 2, '금성': 2, '화성': 2, '목성': 1, '토성': 1 };
  let total = 0;
  for (const p of SYN.SYN_PLANETS) {
    const pl = chart.planets[p];
    if (!pl) continue;
    const w = W[p] || 1;
    if (ELEM[pl.sign]) { el[ELEM[pl.sign]] += w; total += w; }
    if (MODE[pl.sign]) md[MODE[pl.sign]] += w;
  }
  const pct = o => {
    const s = Object.values(o).reduce((a, b) => a + b, 0) || 1;
    const r = {};
    for (const k of Object.keys(o)) r[k] = Math.round((o[k] / s) * 100);
    return r;
  };
  const elP = pct(el), mdP = pct(md);
  const topEl = Object.keys(elP).sort((a, b) => elP[b] - elP[a])[0];
  const lackEl = Object.keys(elP).sort((a, b) => elP[a] - elP[b])[0];
  return { element: elP, modality: mdP, topElement: topEl, lackElement: lackEl, weighted: total };
}

/* ==========================================================================
   [7-A] 겉과 속 — 2장 "괜찮아라고 할 때, 정말 괜찮은 걸까"
   --------------------------------------------------------------------------
   시드니 리포트에서 어머니가 운 지점이 정확히 여기였다.

     "안으로는 이토록 따뜻함을 바라면서도, 밖으로는 서늘한 얼굴을 내밉니다.
      그래서 힘들 때 '괜찮아'라고 말하는 아이가 됩니다."

   달(느끼는 것)과 상승점(보이는 것)이 어긋나면 이 현상이 생긴다.
   지어낸 문장이 아니라 두 점의 각도와 원소에서 나온 계산 결과다.

   🚨 그런데 이 어긋남은 500명 중 56%에서만 나온다.
      독립 판정으로 두면 44%의 아이는 이 장이 비어 버린다.
      그래서 '어긋남이 있다/없다'가 아니라 '감정이 밖으로 나오는 방식'으로 짠다.
      일치하는 아이에게는 "느끼는 대로 보입니다. 표정을 믿으셔도 됩니다"가 되는데,
      이것도 부모에게는 큰 안심이다. 어느 쪽이든 빈 장이 되지 않는다.
========================================================================== */
const ELEM_INNER = {
  '물': '마음이 젖어 있고, 분위기로 먼저 느낀다',
  '흙': '몸으로 느끼고, 안정된 반복에서 안심한다',
  '불': '느끼면 바로 타오르고, 식는 것도 빠르다',
  '공기': '느낌을 생각으로 바꿔 이해하려 한다'
};
const ELEM_OUTER = {
  '물': '조심스럽게 다가가고, 분위기를 먼저 살핀다',
  '흙': '차분하고 신중해 보인다',
  '불': '밝고 활기차 보인다',
  '공기': '가볍고 담담해 보인다'
};

function innerOuterGap(chart, selfAsp) {
  const moon = chart.planets['달'], asc = chart.planets['상승점'];
  const out = { has: false, lines: [], moonElem: null, ascElem: null, verdict: null };
  if (!moon) {
    out.verdict = '달을 계산할 수 없어 이 장은 다른 근거로 써야 한다.';
    return out;
  }
  out.moonElem = elemOf(moon);
  out.lines.push(`속(달) : ${moon.sign} — ${ELEM_INNER[out.moonElem] || ''}`);

  if (!asc) {
    out.verdict = '태어난 시간을 몰라 겉모습(상승점)을 계산할 수 없다. ' +
                  '속마음만 다루고, 겉과의 차이는 언급하지 마라.';
    return out;
  }
  out.ascElem = elemOf(asc);
  out.lines.push(`겉(상승점) : ${asc.sign} — ${ELEM_OUTER[out.ascElem] || ''}`);

  const d = angleDiff(moon.abs, asc.abs);
  const hardAsp = Math.abs(d - 90) < 8 ? '각' : (Math.abs(d - 180) < 8 ? '대립' : null);
  const inward = out.moonElem === '물' || out.moonElem === '흙';
  const outward = out.ascElem === '불' || out.ascElem === '공기';
  const elemGap = (inward && outward) || (!inward && !outward && out.moonElem !== out.ascElem &&
                  ((out.moonElem === '불' || out.moonElem === '공기') && (out.ascElem === '물' || out.ascElem === '흙')));

  if (hardAsp) {
    out.has = true;
    out.lines.push(`달과 상승점이 ${hardAsp}(오차 ${Math.abs(d - (hardAsp === '각' ? 90 : 180)).toFixed(1)}도)`);
  }
  if (elemGap) {
    out.has = true;
    out.lines.push(`속은 ${out.moonElem}, 겉은 ${out.ascElem} — 원소가 반대편이다`);
  }

  if (out.has) {
    out.verdict =
      `이 아이는 안에서 느끼는 것과 밖으로 보이는 것이 다르다. ` +
      `그래서 힘들 때 "괜찮아"라고 말하고, 서운해도 티를 내지 않는다. ` +
      `🚨 이것이 이 장의 핵심이며 이 리포트에서 가장 중요한 문장이 나올 자리다. ` +
      `부모가 "우리 애가 참고 있었구나"를 깨닫는 지점이므로, 반드시 ` +
      `"먼저 표현하지 않으니 먼저 다가가 주셔야 합니다" 같은 행동으로 닫아라. ` +
      `죄책감만 남기고 끝내면 부모는 리포트를 덮는다.`;
  } else {
    out.verdict =
      `이 아이는 안에서 느끼는 것과 밖으로 보이는 것이 대체로 일치한다. ` +
      `웃으면 진짜 웃는 것이고, 싫으면 싫은 티가 난다. ` +
      `🚨 이걸 "단순하다"로 쓰지 마라. 부모에게는 큰 안심거리다. ` +
      `"표정을 믿으셔도 됩니다. 다만 티가 나는 만큼 감정이 클 때는 크게 흔들립니다" 로 써라.`;
  }

  /* 12하우스 — 이 장에 합친 '삼키는 것' */
  if (chart.ascSignIndex !== null) {
    const h12 = [];
    for (const p of ['태양', '달', '수성', '금성', '화성', '토성']) {
      const pl = chart.planets[p];
      if (pl && houseOf(chart, pl.abs) === 12) h12.push(p);
    }
    if (h12.length) out.lines.push(`12하우스(혼자 삼키는 자리)에 ${h12.join('·')} 있음`);
  }
  for (const a of (selfAsp || [])) {
    const k = [a.pA, a.pB].sort().join('-');
    if (k === '달-토성') out.lines.push(`달-토성 ${a.aspect} — 응석 부려도 되는 자리에서 먼저 참는다`);
    if (k === '수성-토성' && a.hard) out.lines.push(`수성-토성 ${a.aspect} — 말이 늦게 나오지만 나오면 정확하다`);
  }
  return out;
}

/* ==========================================================================
   [7-B] 집 밖에서의 얼굴 — 3장
   --------------------------------------------------------------------------
   부모는 집에서의 아이만 본다. 학교와 또래 사이의 모습은 볼 수 없어서
   늘 불안해한다. 그런데 그 자리는 차트에 있다.
   3하우스(또래·일상 대화) · 7하우스(1:1 관계) · 11하우스(무리) · 상승점 · 수성.

   하우스 근거가 없는 아이가 19% 있으므로, 그때는 별자리로 읽는다.
   빈 장이 되지 않게 하는 것이 이 함수의 책임이다.
========================================================================== */
const OUT_HOUSE = {
  3:  '또래와 주고받는 자리 · 교실 안의 일상 대화',
  7:  '단짝·짝꿍 같은 1:1 관계의 자리',
  11: '무리·동아리·여럿이 어울리는 자리'
};

function outsideFace(chart) {
  const rows = [], P = chart.planets;
  const asc = P['상승점'], mer = P['수성'];

  if (asc) rows.push(`첫인상(상승점) : ${asc.sign} — 처음 보는 사람에게 이렇게 비친다`);
  if (mer) rows.push(`말하는 방식(수성) : ${mer.sign} — 생각을 이런 속도와 결로 꺼낸다`);

  let houseHits = 0;
  if (chart.ascSignIndex !== null) {
    for (const p of ['태양', '달', '수성', '금성', '화성', '목성', '토성']) {
      const pl = P[p];
      if (!pl) continue;
      const h = houseOf(chart, pl.abs);
      if (OUT_HOUSE[h]) {
        houseHits++;
        rows.push(`${josa(p, '이', '가')} ${h}하우스 — ${OUT_HOUSE[h]}`);
      }
    }
  }

  /* 하우스 근거가 없으면 별자리로 대체한다. 없는 걸 지어내지 않으면서도 빈 장을 막는다. */
  if (!houseHits) {
    rows.push('밖에서의 자리에 들어간 별이 없다 — 밖에서 유난히 튀거나 무리에 휩쓸리는 편이 아니다.');
    if (asc) rows.push(`대신 상승점 ${asc.sign} 하나로 첫인상을 읽어라. 억지로 사교성을 논하지 마라.`);
  }
  return { rows, houseHits, hasAsc: !!asc };
}

/* ==========================================================================
   [7-C] 타고난 것이 있는 자리 — 4장
   --------------------------------------------------------------------------
   "뭘 시켜야 할지 모르겠어요" 가 부모의 가장 큰 질문 중 하나다.
   2하우스(손에 쥐는 것) · 5하우스(표현·창작) · 6하우스(기술의 숙련)
   10하우스(사회적 성취) + 수성(배우는 방식) · 금성(좋아하는 것) · 화성(밀어붙이는 힘)

   🚨 여기서 절대 하면 안 되는 것 : 직업을 못 박는 것.
      "이 아이는 의사가 됩니다" 는 아이의 인생을 좁힌다.
      '자리'와 '방식'만 말하고 직업은 예시로만 든다.
========================================================================== */
const TALENT_HOUSE = {
  2:  '손으로 쥐고 만드는 자리 · 자기 것으로 만들어 쌓는 힘',
  5:  '표현하고 만들어 내보이는 자리 · 놀이가 곧 재능이 되는 곳',
  6:  '반복해서 숙련되는 자리 · 꾸준함이 실력이 되는 곳',
  10: '밖에서 인정받는 자리 · 남들 앞에 서는 힘'
};
const MERCURY_LEARN = {
  '불': '먼저 해보고 몸으로 익힌다. 설명이 길면 집중이 흩어진다.',
  '흙': '차근차근 순서대로 익힌다. 건너뛰면 불안해한다.',
  '공기': '설명을 듣고 이해한 다음에 움직인다. 왜인지를 알아야 한다.',
  '물': '분위기와 이미지로 통째로 흡수한다. 좋아하는 사람에게 더 잘 배운다.'
};

function talentPlaces(chart) {
  const rows = [], P = chart.planets;
  let hits = 0;

  if (chart.ascSignIndex !== null) {
    for (const p of ['태양', '달', '수성', '금성', '화성', '목성']) {
      const pl = P[p];
      if (!pl) continue;
      const h = houseOf(chart, pl.abs);
      if (TALENT_HOUSE[h]) {
        hits++;
        rows.push(`${josa(p, '이', '가')} ${h}하우스 — ${TALENT_HOUSE[h]}`);
      }
    }
  }

  const mer = P['수성'], ven = P['금성'], mars = P['화성'], jup = P['목성'];
  if (mer) rows.push(`배우는 방식(수성 ${mer.sign}) : ${MERCURY_LEARN[elemOf(mer)] || ''}`);
  if (ven) rows.push(`끌리는 것(금성 ${ven.sign}) : 이 아이가 예쁘다고 느끼고 오래 붙잡는 결`);
  if (mars) rows.push(`밀어붙이는 방식(화성 ${mars.sign}) : 하고 싶을 때 이렇게 달려든다`);
  if (jup && chart.ascSignIndex !== null) {
    const h = houseOf(chart, jup.abs);
    if (h) rows.push(`목성이 ${h}하우스 — 이 영역은 넓혀 주면 아이가 스스로 뻗어 나간다`);
  }

  if (!hits) {
    rows.push('재능의 방에 들어간 별이 없다 — 한 분야에 몰린 유형이 아니라 여러 곳에 고루 퍼진 아이다.');
    rows.push('이럴 때는 하나를 골라 주기보다 여러 개를 얕게 경험시키는 편이 맞다. 억지로 한 가지를 지목하지 마라.');
  }
  return { rows, hits };
}

/* ==========================================================================
   [7-D] 케미스트리 — 5장 "붙는 자리와 거리를 둘 자리"
   --------------------------------------------------------------------------
   🚨 초기 설계는 "왜 유독 나와 부딪힐까" 였고 마찰각만 뽑았다.
      그런데 실제로 세어 보면 소프트각이 훨씬 많다(어떤 가족은 17개 중 15개).
      잘 맞는 자리를 통째로 버리고 있었던 셈이고, 부모는 리포트를 읽는 내내
      자기가 잘못하고 있다는 느낌만 받는다.

      그래서 양쪽을 다 읽는다.
        붙는 자리     소프트각 — 서로 편해지는 지점, 여기를 늘리면 된다
        거리를 둘 자리 하드각  — 가까울수록 부딪히는 주제, 그 주제에서만 한 발 뒤로

      "거리를 둔다"는 멀어지라는 뜻이 아니라 그 주제에서만 물러서라는 뜻이다.
      그래서 실행 가능한 조언이 된다.
========================================================================== */
const SOFT = ['합', '삼각', '육각'];
const HARD = ['각', '대립'];

function chemistry(parentChart, childChart, parentName, childName) {
  const asp = SYN.synastryAspects(parentChart, childChart, parentName, childName);
  const soft = asp.filter(a => SOFT.includes(a.aspect));
  const hard = asp.filter(a => HARD.includes(a.aspect));

  const ov = []
    .concat(SYN.houseOverlay(parentChart, childChart, parentName, childName) || [])
    .concat(SYN.houseOverlay(childChart, parentChart, childName, parentName) || []);

  return {
    all: asp,
    soft: soft.slice(0, 8),
    hard: hard.slice(0, 5),
    overlay: ov.slice(0, 10),
    softCount: soft.length,
    hardCount: hard.length,
    /* 비율로 관계의 성격을 한 줄 판정 */
    tone: soft.length >= hard.length * 2
      ? '맞물리는 자리가 부딪히는 자리보다 훨씬 많다. 기본적으로 편한 조합이다.'
      : (hard.length > soft.length
        ? '부딪히는 자리가 많은 조합이다. 그만큼 서로에게 무심할 수 없는 사이이기도 하다.'
        : '맞물리는 자리와 부딪히는 자리가 비슷하다. 날에 따라 다르게 느껴지는 조합이다.')
  };
}

/* --------------------------------------------------------------------------
   물려받은 자리 — 5장 안의 조건부 삽입 (500가족 중 32%에서 발견)
   "어머니도 달이 게자리입니다. 두 분은 같은 방식으로 마음이 움직입니다."
   터질 때 위력이 크지만 흔하지 않으므로 장으로 만들지 않고 박스로 넣는다.
-------------------------------------------------------------------------- */
const INHERIT_MEAN = {
  '태양': '자기다움을 느끼는 지점이 같다',
  '달': '마음이 움직이는 방식이 같다',
  '수성': '생각하고 말하는 결이 같다',
  '금성': '예쁘다고 느끼는 것이 같다',
  '화성': '화가 나고 달려드는 방식이 같다'
};

function inherited(parentChart, childChart, parentName, childName) {
  const rows = [];
  for (const p of ['태양', '달', '수성', '금성', '화성']) {
    const a = parentChart.planets[p], b = childChart.planets[p];
    if (!a || !b) continue;
    if (a.sign === b.sign) {
      rows.push({ planet: p, kind: '같은 별자리',
        text: `${parentName}도 ${childName}도 ${p}이 ${a.sign} — ${INHERIT_MEAN[p]}` });
    } else if (angleDiff(a.abs, b.abs) < 6) {
      rows.push({ planet: p, kind: '합',
        text: `${parentName}의 ${p}과 ${childName}의 ${p}이 같은 자리에 겹침 — ${INHERIT_MEAN[p]}` });
    }
  }
  return rows;
}

/* ==========================================================================
   [7-E] 성장 곡선 — 8장 그래프
   --------------------------------------------------------------------------
   🚨 점수를 매기지 않는다. VVIP 는 10대~80대를 100점 만점으로 끊지만,
      아이에게 점수를 붙이는 순간 그것이 낙인이 된다.
      ("우리 애 열두 살은 62점" 이라는 문장이 부모 머리에 남으면 끝이다)

      그래서 숫자 없이 '모양'만 낸다. 어디가 열리고 어디가 다지는 때인지
      곡선으로만 보여주고, 축에는 나이만 적는다.

   목성이 아이의 태양·달·금성에 조화각 → 열리는 때
   토성이 하드각                      → 안으로 다지는 때
========================================================================== */
function growthCurve(chart, birth, fromAge, toAge) {
  const jd0 = julianDayFromYMD(birth.y, birth.m, birth.d);
  const pts = [];
  const bodies = ['태양', '달', '금성', '상승점'];

  for (let a = fromAge; a <= toAge; a += 0.25) {
    const jd = jd0 + a * 365.25;
    const jup = jupiterLongitudeJD(jd), sat = saturnLongitudeJD(jd);
    let v = 0;
    for (const p of bodies) {
      const n = chart.planets[p];
      if (!n) continue;
      const dj = angleDiff(jup, n.abs), ds = angleDiff(sat, n.abs);
      for (const [ang, w] of [[0, 1], [120, 0.8], [60, 0.5]]) {
        if (Math.abs(dj - ang) < 7) v += w * (1 - Math.abs(dj - ang) / 7);
      }
      for (const [ang, w] of [[90, 1], [180, 1], [0, 0.6]]) {
        if (Math.abs(ds - ang) < 6) v -= w * (1 - Math.abs(ds - ang) / 6);
      }
    }
    pts.push({ age: +a.toFixed(2), raw: v });
  }
  /* 0~100 으로 정규화 — 화면에 숫자를 쓰지 않고 곡선 모양에만 쓴다 */
  const vals = pts.map(p => p.raw);
  const mn = Math.min.apply(null, vals), mx = Math.max.apply(null, vals);
  const span = (mx - mn) || 1;
  pts.forEach(p => { p.y = Math.round(((p.raw - mn) / span) * 100); });
  return pts;
}

/* ==========================================================================
   [8] 다이제스트 조립
========================================================================== */
const AGE_GUIDE = {
  '미취학': '아직 학교에 들어가기 전이다. 이 시기의 부모가 가장 궁금한 건 "이게 정상인가"이다. 비교하지 말고, 이 아이의 속도가 원래 이렇다는 것을 알려 주는 데 집중하라.',
  '초등':   '학교에 다니고 있다. 규칙·또래·성적이 한꺼번에 들어오는 시기다. 첫 번째 토성 시험이 이 구간에 걸린다면 그 얘기를 반드시 하라.',
  '중고등': '사춘기 한복판이거나 그 문턱이다. 부모가 이미 부딪히고 있을 가능성이 높다. "왜 갑자기 변했나"에 답하는 것이 이 리포트의 몫이다.',
  '성인':   '이미 성인이다. 훈육이 아니라 관계의 문제다. 조언이 아니라 이해로 방향을 잡아라. 바꾸려는 조언은 쓰지 마라.'
};

function buildChildDigest(parentChart, childChart, parentName, childName, ageBand, childBirth) {
  const L = [];
  const hasParent = parentChart && Object.keys(parentChart.planets || {}).length > 0;

  /* ── 계산 ── */
  const selfA   = selfAspects(childChart);
  const temp    = tempEngine(childChart, selfA);
  const praise  = praiseChannel(childChart);
  const bal     = balance(childChart);
  const gap     = innerOuterGap(childChart, selfA);
  const outside = outsideFace(childChart);
  const talent  = talentPlaces(childChart);

  const parentTemp = hasParent ? tempEngine(parentChart, selfAspects(parentChart)) : null;
  const chem   = hasParent ? chemistry(parentChart, childChart, parentName, childName) : null;
  const inher  = hasParent ? inherited(parentChart, childChart, parentName, childName) : [];

  /* 오늘 기준 아이 나이 → 앞으로 10년 */
  const now = new Date();
  const ageNow = Math.max(0,
    (now - new Date(childBirth.y, childBirth.m - 1, childBirth.d)) / (365.25 * 86400000));
  const ageTo = Math.min(28, ageNow + 10);

  const natalSat = childChart.planets['토성'];
  const natalJup = childChart.planets['목성'];
  const sats  = natalSat ? saturnMilestones(natalSat.abs, childBirth, 24) : [];
  const jups  = natalJup ? jupiterReturn(natalJup.abs, childBirth, 24) : [];
  const hits  = saturnHardHits(childChart, childBirth, 22);
  const curve = growthCurve(childChart, childBirth, Math.floor(ageNow), Math.ceil(ageTo));

  /* ── 정보 한계 ── */
  const limits = [];
  for (const [c, n] of [[parentChart, parentName], [childChart, childName]]) {
    if (c) (c.notes || []).forEach(note => limits.push(`- ${n}: ${note}`));
  }
  if (!hasParent) limits.push(`- ${parentName}의 출생정보가 없다`);
  if (limits.length) {
    L.push('[🚨 정보 한계 — 반드시 지켜라]');
    limits.forEach(x => L.push(x));
    L.push('제외된 항목은 계산 자체가 불가능하다. 절대 추측해서 채우지 마라.');
    if (!hasParent) L.push('🚨 5장(케미스트리)을 통째로 빼라. 부모 차트 없이 관계를 쓰면 그건 지어내는 것이다.');
    L.push('');
  }

  const line = (c, n) => {
    const parts = [];
    for (const p of SYN.SYN_PLANETS) if (c.planets[p]) parts.push(`${p} ${c.planets[p].sign} ${c.planets[p].deg}도`);
    return `[${n} 차트] ${parts.join(' / ')}`;
  };
  L.push(line(childChart, childName + '(아이)'));
  if (hasParent) L.push(line(parentChart, parentName + '(부모)'));
  L.push(`\n오늘 기준 ${childName}의 나이 : 만 ${ageNow.toFixed(1)}세 · 이 리포트는 만 ${ageTo.toFixed(0)}세까지를 본다`);

  /* ── 1장 ── */
  L.push('\n════ 1장 · 우리 아이의 타고난 기질과 성향 ════');
  L.push(`원소  불 ${bal.element['불']}% / 흙 ${bal.element['흙']}% / 공기 ${bal.element['공기']}% / 물 ${bal.element['물']}%`);
  L.push(`성질  활동 ${bal.modality['활동']}% / 고정 ${bal.modality['고정']}% / 변통 ${bal.modality['변통']}%`);
  L.push(`가장 강한 원소 ${bal.topElement} · 가장 적은 원소 ${bal.lackElement}`);
  L.push('[★ 확정 판정 — 네 축. 어느 쪽도 우열이 없다. 한쪽을 문제로 규정하면 실패다]');
  for (const k of Object.keys(temp.score)) {
    L.push(`· ${k} : ${temp.side[k]} (${temp.strength[k]})`);
    temp.evidence[k].slice(0, 3).forEach(e => L.push(`   근거: ${e}`));
  }
  L.push('🚨 숫자와 축 이름(속도축 등)을 본문에 쓰지 마라. 부모에게 성적표로 보인다.');
  L.push('🚨 "중간 — 상황에 따라 달라짐" 인 축은 단정하지 말고 그대로 "상황에 따라 달라지는 편"으로 써라.');

  /* ── 2장 ── */
  L.push('\n════ 2장 · "괜찮아"라고 할 때, 정말 괜찮은 걸까 ★ ════');
  gap.lines.forEach(x => L.push(`- ${x}`));
  L.push(`판정: ${gap.verdict}`);

  /* ── 3장 ── */
  L.push('\n════ 3장 · 집 밖에서 이 아이는 어떤 얼굴일까 ════');
  outside.rows.forEach(x => L.push(`- ${x}`));
  L.push('🚨 부모는 집에서의 아이만 본다. 여기서는 밖에서의 모습만 다뤄라.');
  L.push('🚨 친구가 많다/적다를 단정하지 마라. 어떤 방식으로 관계를 맺는지만 써라.');

  /* ── 4장 ── */
  L.push('\n════ 4장 · 이 아이가 타고난 것은 어디에 있을까 ════');
  talent.rows.forEach(x => L.push(`- ${x}`));
  L.push('🚨 직업을 못 박지 마라. "이 아이는 의사가 됩니다" 는 아이의 인생을 좁힌다.');
  L.push('   자리와 방식만 말하고, 직업은 "예를 들면" 수준으로만 들어라.');
  L.push('🚨 성적·학업 능력을 평가하지 마라. 무엇을 잘한다가 아니라 어떻게 배우는 아이인가를 써라.');

  /* ── 5장 ── */
  if (hasParent) {
    L.push('\n════ 5장 · 나와 이 아이의 케미스트리 ════');
    L.push(`관계의 성격: ${chem.tone} (맞물림 ${chem.softCount}개 / 부딪힘 ${chem.hardCount}개)`);
    L.push(`[${parentName}의 기질 — 아이만 분석하면 실패다. 부모도 같이 읽어라]`);
    for (const k of Object.keys(parentTemp.score)) L.push(`· ${k} : ${parentTemp.side[k]} (${parentTemp.strength[k]})`);
    L.push('[붙는 자리 — 서로 편해지는 지점. 여기를 늘리면 된다]');
    if (chem.soft.length) chem.soft.forEach(a => L.push(`- ${a.text}`));
    else L.push('- 뚜렷한 맞물림이 없다. 억지로 만들지 말고 "서로 다른 세계를 가진 사이"로 써라.');
    L.push('[거리를 둘 자리 — 가까울수록 부딪히는 주제]');
    if (chem.hard.length) {
      chem.hard.forEach(a => L.push(`- ${a.text}`));
      L.push('🚨 "거리를 둔다"를 멀어지라는 뜻으로 쓰지 마라. 그 주제에서만 한 발 물러서라는 뜻이다.');
      L.push('🚨 아이의 문제로 쓰지 마라. 두 기질이 어긋날 뿐이고 둘 다 잘못이 없다.');
    } else {
      L.push('- 강한 마찰이 없다. 부딪힘보다 서로를 잘 모르는 것이 과제다.');
    }
    if (chem.overlay.length) {
      L.push('[상대가 내 인생의 어느 방에 들어와 있는가]');
      chem.overlay.forEach(r => L.push(`- ${r.text}`));
      L.push('같은 부모라도 아이마다 들어오는 방이 다르다. 그래서 형제 중 유독 다르게 느껴지는 아이가 생긴다.');
    }
    if (inher.length) {
      L.push('[★ 물려받은 자리 — 이 항목이 있으면 반드시 써라. 부모가 가장 뭉클해하는 대목이다]');
      inher.forEach(r => L.push(`- ${r.text}`));
    }
  }

  /* ── 6장 ── */
  L.push('\n════ 6장 · 기다려야 할 때와, 밀어줘야 할 때 ════');
  L.push(`· 속도 판정: ${temp.side['속도']} (${temp.strength['속도']})`);
  const mars = childChart.planets['화성'], sat2 = childChart.planets['토성'];
  if (mars) L.push(`· 화성 ${mars.sign} ${mars.deg}도 — 스스로 밀어붙일 때의 방식`);
  if (sat2) L.push(`· 토성 ${sat2.sign} ${sat2.deg}도 — 겁내고 미루는 자리`);
  if (childChart.ascSignIndex !== null && sat2) {
    const h = houseOf(childChart, sat2.abs);
    if (h) L.push(`· 토성이 ${h}하우스 — 이 영역에서 자신 없어 하고, 재촉하면 더 굳는다`);
  }
  L.push('🚨 두 소제목을 그대로 쓰고 순서도 바꾸지 마라 — "기다려야 할 것" 3가지 / "밀어줘도 되는 것" 3가지.');

  /* ── 7장 ── */
  L.push('\n════ 7장 · 이 아이에게 사랑이 도착하는 통로 ════');
  L.push(`가장 잘 닿는 통로: ${praise.top} — ${praise.topText}`);
  L.push(`두 번째: ${praise.second} — ${praise.secondText}`);
  if (!praise.decisive) L.push('(1·2위 차이가 크지 않다. 둘을 섞어 안내하라)');
  praise.why.slice(0, 4).forEach(w => L.push(`   근거: ${w}`));
  L.push('🚨 반응이 시원찮은 아이로 몰지 마라. 잘 반응하는 아이에게는 "지금 방식이 맞습니다"가 답이다.');
  L.push('🚨 같은 사랑도 문이 어긋나면 도착하지 않는다 — 부모가 사랑을 안 준 게 아니라 다른 문으로 넣었을 뿐이다.');

  /* ── 8장 ── */
  L.push('\n════ 8장 · 앞으로 열리는 시기와, 잠깐 단단해질 시기 ★★ ════');
  L.push('🚨 반드시 열리는 시기를 먼저 쓰고 단단해질 시기를 뒤에 써라. 고비로 열면 부모가 불안해진다.');
  if (jups.length) {
    L.push('[열리는 시기 — 목성]');
    jups.forEach(j => L.push(`▸ 만 ${j.age}세(${j.year}년) — 세계가 한 뼘 넓어진다. 이때 좋아하는 것을 만나게 해주면 오래 간다.`));
    L.push('🚨 이때를 "정점"으로 쓰지 마라. 첫 개화일 뿐이고 진짜 절정은 훨씬 뒤다.');
  }
  if (sats.length) {
    L.push('[단단해지는 시기 — 토성]');
    sats.forEach(s => {
      L.push(`▸ ${s.text}`);
      L.push(`   의미: ${s.meaning}`);
      if (s.passes > 1) L.push(`   🚨 ${s.passes}번에 걸쳐 온다. "한 번 지나갔다고 끝난 게 아니다"를 반드시 알려라.`);
    });
    L.push('🚨 이미 지나간 시기가 있으면 그것부터 짚어라. 부모가 "맞다"고 확인하는 순간 앞으로의 예고가 믿음이 된다.');
    L.push('🚨 불행 예고로 쓰지 마라. 성장통이고, 미리 알면 훨씬 수월하게 지나간다는 톤으로.');
    L.push('🚨 각 시기마다 그때 부모가 할 일을 반드시 붙여라.');
  }
  if (hits.length) {
    L.push('[보조 근거 — 토성이 아이의 태양·달·상승점에 거는 각]');
    hits.slice(0, 6).forEach(h => L.push(`   만 ${h.ageFrom}~${h.ageTo}세(${h.year}년) 토성 ${h.aspect} → ${h.body}`));
  }
  L.push(`[성장 곡선 데이터] 만 ${Math.floor(ageNow)}세~${Math.ceil(ageTo)}세, ${curve.length}점 계산됨 (화면 그래프용)`);
  L.push('🚨 곡선에 점수를 붙이지 마라. 아이에게 점수를 매기는 순간 그것이 낙인이 된다. 모양만 말하라.');

  /* ── 9장 ── */
  L.push('\n════ 9장 · 10년 뒤, 이 아이와 나 ════');
  L.push(`오늘 만 ${ageNow.toFixed(0)}세인 ${childName}는 10년 뒤 만 ${ageTo.toFixed(0)}세가 된다.`);
  L.push('지금의 기질이 그때 어떤 모습이 되는지를 쓴다. 관계를 "지키는 법"이 아니라 "그때의 두 사람"을 그려라.');
  L.push(`🚨 마지막 문장은 ${parentName}에 대한 것으로 끝내라. 아이가 아니라 부모가 주어여야 한다.`);

  L.push(`\n[아이 나이대: ${ageBand}]`);
  L.push(AGE_GUIDE[ageBand] || AGE_GUIDE['초등']);

  return {
    text: L.join('\n'),
    hasParent, ageNow: +ageNow.toFixed(1), ageTo: +ageTo.toFixed(1),
    temperament: temp, parentTemperament: parentTemp,
    praise, balance: bal, gap, outside, talent,
    chemistry: chem, inherited: inher,
    saturn: sats, jupiter: jups, saturnHits: hits, curve
  };
}

module.exports = {
  ELEM, MODE, AXES, PRAISE_CH, AGE_GUIDE,
  julianDayFromYMD, saturnLongitudeJD, jupiterLongitudeJD,
  saturnMilestones, jupiterReturn, saturnHardHits,
  selfAspects, tempEngine, praiseChannel, swallowed, balance,
  innerOuterGap, outsideFace, talentPlaces, chemistry, inherited, growthCurve,
  buildChildDigest
};
