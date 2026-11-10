// ============================================================================
//  lib/astro-newyear.js — 신년운세 계산 엔진 (product_no=18 · 14,900원)
// ----------------------------------------------------------------------------
//  ▣ 무엇이 '미리 찍어둔 띠별 운세'와 다른가
//
//  1월 1일부터 12월 31일까지 365일을 하루 단위로 실제 계산합니다.
//  같은 날 태어난 사람도 태어난 시각·장소가 다르면 하우스가 달라져 다른 해가 나옵니다.
//
//      · 연간 프로펙션      올해 내 인생의 '무대'가 몇 번째 방인가, 올해의 주인 행성
//      · 목성·토성의 방     복이 들어오는 자리, 시험받는 자리 (들어가고 나오는 날짜까지)
//      · 월별 곡선 12개     총운 + 애정·금전·일·컨디션  (lib/transit.js 의 하루 점수를 그대로 씀)
//      · 일식·월식          내 차트의 행성 위에 떨어지면 '판이 바뀌는 날'
//      · 역행 구간          수성·금성·화성 — 내 차트 몇 번째 방에서 일어나는가
//
//  ▣ 태어난 시간을 모를 때
//  상승점이 없으면 하우스를 못 나눕니다. 그래서 태양 별자리를 1하우스로 두는
//  '솔라 차트'로 대신합니다. 시각 미상 차트에 쓰는 표준 방식입니다.
//  이 사실은 리포트 끝에 한 번만 담백하게 안내합니다.
// ============================================================================

'use strict';

const EPH = require('./ephemeris.js');
const CH = require('./chart.js');
const TR = require('./transit.js');
const { meanNode } = require('./natal.js');
const FC = require('./astro-forecast.js');

const norm360 = x => ((x % 360) + 360) % 360;
const sep = (a, b) => { const d = Math.abs(norm360(a) - norm360(b)) % 360; return d > 180 ? 360 - d : d; };
const SIGNS = CH.SIGNS_KR;
const signOf = lon => SIGNS[Math.floor(norm360(lon) / 30)];

/* 전통 지배성 — 프로펙션은 고전 기법이라 현대 지배성(명왕성·천왕성·해왕성)을 쓰지 않는다 */
const RULER = { '양자리': '화성', '황소자리': '금성', '쌍둥이자리': '수성', '게자리': '달', '사자자리': '태양',
  '처녀자리': '수성', '천칭자리': '금성', '전갈자리': '화성', '사수자리': '목성', '염소자리': '토성',
  '물병자리': '토성', '물고기자리': '목성' };

const HOUSE_THEME = {
  1: '나를 새로 세우는 해 — 외모·몸·새 방향',
  2: '내 몸값을 올리는 해 — 수입·통장·자존감',
  3: '배우고 부지런히 오가는 해 — 공부·계약·이동·형제',
  4: '집과 가족을 챙기는 해 — 이사·가족·마음 둘 곳',
  5: '설레고 즐기는 해 — 연애·취미·자녀',
  6: '일상을 다잡는 해 — 일하는 방식·몸 관리',
  7: '짝이 중심이 되는 해 — 결혼·동업·둘만의 약속',
  8: '판이 크게 바뀌는 해 — 큰돈·대출·정리와 새 출발',
  9: '멀리 보는 해 — 유학·여행·공부·자격증',
  10: '이름이 알려지는 해 — 승진·평가·커리어',
  11: '사람이 복이 되는 해 — 인맥·모임·오래 품은 꿈',
  12: '쉬어 가며 매듭짓는 해 — 마무리·회복·혼자만의 준비'
};

const pad = n => String(n).padStart(2, '0');
const ymdOf = (y, m, d) => y + '-' + pad(m) + '-' + pad(d);
const noonIso = ymd => ymd + 'T12:00:00+09:00';
function addDays(ymd, n) {
  const t = new Date(ymd + 'T12:00:00+09:00').getTime() + n * 86400000;
  return new Date(t + 9 * 3600000).toISOString().slice(0, 10);
}
function krDateFull(ymd) { const [y, m, d] = ymd.split('-').map(Number); return y + '년 ' + m + '월 ' + d + '일'; }
function kd(ymd) { const [, m, d] = ymd.split('-').map(Number); return m + '월 ' + d + '일'; }

/* 서울 날짜 → 그 해를 볼지 다음 해를 볼지. 11월부터는 다음 해 신년운세. */
function targetYear(todayYmd) {
  const [y, m] = todayYmd.split('-').map(Number);
  return m >= 11 ? y + 1 : y;
}

/* ── 1. 연간 프로펙션 ─────────────────────────────────────── */
function profection(natal, ascLon, birthYmd, Y) {
  const [by, bm, bd] = birthYmd.split('-').map(Number);
  const ascIdx = Math.floor(norm360(ascLon) / 30);
  const mk = age => {
    const house = (age % 12) + 1;
    const sign = SIGNS[(ascIdx + age) % 12];
    const lord = RULER[sign];
    const lordLon = natal[lord];
    return {
      age, house, sign, lord, theme: HOUSE_THEME[house],
      lordNatal: lordLon === undefined ? null : {
        sign: signOf(lordLon), house: CH.wholeSignHouse(lordLon, ascLon)
      }
    };
  };
  /* 달력상 Y년 = (생일 전) age-1 의 해 + (생일부터) age 의 해 */
  const bday = ymdOf(Y, bm, Math.min(bd, bm === 2 && bd === 29 ? 28 : bd));
  const before = mk(Math.max(0, Y - by - 1)), after = mk(Y - by);
  const doyBday = Math.round((new Date(bday + 'T00:00:00Z') - new Date(Y + '-01-01T00:00:00Z')) / 86400000);
  const primary = doyBday < 182 ? after : before;
  return { birthday: bday, before, after, primary };
}

/* ── 2. 행성이 어느 방을 지나는가 (들고 나는 날짜) ─────────── */
function ingressSegments(planet, ascLon, Y) {
  const segs = [];
  let cur = null;
  for (let d = ymdOf(Y, 1, 1); d <= ymdOf(Y, 12, 31); d = addDays(d, 1)) {
    const lon = EPH.positions(noonIso(d), [planet])[planet];
    const sg = signOf(lon);
    if (!cur || cur.sign !== sg) {
      if (cur) segs.push(cur);
      cur = { sign: sg, house: CH.wholeSignHouse(lon, ascLon), from: d, to: d, rx: false };
    }
    cur.to = d;
    if (EPH.isRetrograde(planet, noonIso(d))) cur.rx = true;
  }
  if (cur) segs.push(cur);
  return segs;
}

/* ── 3. 월별 점수 (lib/transit.js 의 scoreDay 를 365일) ───── */
const to100 = (raw, k) => Math.round(Math.max(22, Math.min(96, 62 + 32 * Math.tanh(raw / (k || 4)))));

function monthlyScores(natal, ascLon, Y) {
  const months = [];
  const daily = [];
  for (let m = 1; m <= 12; m++) {
    const acc = { total: 0, love: 0, money: 0, work: 0, body: 0, n: 0 };
    const last = new Date(Date.UTC(Y, m, 0)).getUTCDate();
    for (let d = 1; d <= last; d++) {
      const ymd = ymdOf(Y, m, d);
      const s = TR.scoreDay(noonIso(ymd), natal, ascLon);
      ['total', 'love', 'money', 'work', 'body'].forEach(k => { acc[k] += s[k]; });
      acc.n++;
      daily.push({ ymd, total: s.total, hits: s.hits.filter(h => h.t !== '달').slice(0, 3) });
    }
    const mean = {};
    ['total', 'love', 'money', 'work', 'body'].forEach(k => { mean[k] = acc[k] / acc.n; });
    months.push({ m, mean });
  }
  /* 월별 곡선: 그 해 안에서의 상대적 높낮이 (30일 운세와 같은 방식) */
  const tot = months.map(x => x.mean.total);
  const mu = tot.reduce((a, b) => a + b, 0) / 12;
  const sd = Math.sqrt(tot.reduce((a, b) => a + (b - mu) * (b - mu), 0) / 12) || 1;
  months.forEach(x => {
    x.flow = Math.round(Math.max(24, Math.min(94, 60 + 20 * ((x.mean.total - mu) / sd))));
    x.score = {
      total: to100(x.mean.total, 3.2), love: to100(x.mean.love, 1.8), money: to100(x.mean.money, 1.8),
      work: to100(x.mean.work, 2.0), body: to100(x.mean.body, 1.8)
    };
  });
  const yearMean = k => months.reduce((a, x) => a + x.mean[k], 0) / 12;
  const year = {
    total: to100(yearMean('total'), 3.2), love: to100(yearMean('love'), 1.8),
    money: to100(yearMean('money'), 1.8), work: to100(yearMean('work'), 2.0), body: to100(yearMean('body'), 1.8)
  };
  return { months, year, daily };
}

/* ── 4. 그 달의 굵직한 접촉 (정확해지는 날) ─────────────── */
const BIG_T = ['목성', '토성', '화성', '금성', '태양'];
const BIG_N = ['태양', '달', '상승점', '천정', '금성', '화성', '수성'];
const ASPS = [[0, '합'], [60, '육각'], [90, '각'], [120, '삼각'], [180, '대립']];
function exactEvents(natal, ascLon, Y) {
  const ev = [];
  for (const T of BIG_T) {
    const orb = (T === '목성' || T === '토성') ? 1.2 : 1.0;
    for (const N of BIG_N) {
      if (natal[N] === undefined) continue;
      for (const [ang, nm] of ASPS) {
        if ((T === '금성' || T === '태양') && !['태양', '달', '상승점', '천정', '금성'].includes(N)) continue;
        if ((T === '금성' || T === '태양') && (nm === '육각')) continue;
        let prevErr = null, prev2 = null, prevYmd = null;
        for (let d = ymdOf(Y, 1, 1); d <= ymdOf(Y, 12, 31); d = addDays(d, 1)) {
          const tl = EPH.positions(noonIso(d), [T])[T];
          const err = Math.abs(sep(tl, natal[N]) - ang);
          /* 지역 최소 + 오브 안 = 그 각이 가장 정확해진 날 */
          if (prevErr !== null && prev2 !== null && prevErr <= err && prevErr < prev2 && prevErr <= orb) {
            /* 목성의 하드각은 '불운'이 아니라 '과욕·과속' 이다. 역풍으로 몰면 1년치 겁을 준다. */
            const tone = nm === '삼각' || nm === '육각' ? 'good'
              : nm === '합' ? ((T === '목성' || T === '금성') ? 'good' : (T === '태양' ? 'neutral' : 'hard'))
              : (T === '목성' ? 'stretch' : 'hard');
            const w = { 목성: 10, 토성: 10, 화성: 6, 금성: 5, 태양: 4 }[T] * ({ 태양: 1.2, 달: 1.1, 상승점: 1.1, 천정: 1.0 }[N] || 0.9);
            ev.push({ ymd: prevYmd, T, N, asp: nm, tone, w, house: CH.wholeSignHouse(tl, ascLon),
              text: `${kd(prevYmd)} — ${T}이 내 ${N}에 ${nm}` });
          }
          prev2 = prevErr; prevErr = err; prevYmd = d;
        }
      }
    }
  }
  ev.sort((a, b) => a.ymd < b.ymd ? -1 : 1);
  return ev;
}

/* ── 5. 일식·월식 ─────────────────────────────────────────
   삭(新月)·망(滿月)을 찾고, 그때 태양이 노드에서 얼마나 떨어졌는지로 판정.
   일식 17도 · 월식 11.5도 이내 (부분식·반영식 포함하는 실용 한계)
   검증: 2027-02-06 금환일식, 2027-08-02 개기일식 등 NASA 목록과 날짜 일치 (test 참조) */
function lunations(Y) {
  const out = [];
  const elong = iso => { const p = EPH.positions(iso, ['태양', '달']); return norm360(p['달'] - p['태양']); };
  let t = Date.UTC(Y - 1, 11, 28);
  const end = Date.UTC(Y + 1, 0, 3);
  let prev = elong(new Date(t).toISOString());
  for (t += 6 * 3600000; t <= end; t += 6 * 3600000) {
    const e = elong(new Date(t).toISOString());
    for (const [target, kind] of [[0, '삭'], [180, '망']]) {
      const a = norm360(prev - target), b = norm360(e - target);
      if (a > 300 && b < 60) {
        /* 이분법으로 1분 단위까지 */
        let lo = t - 6 * 3600000, hi = t;
        for (let i = 0; i < 20; i++) {
          const mid = (lo + hi) / 2;
          if (norm360(elong(new Date(mid).toISOString()) - target) > 180) lo = mid; else hi = mid;
        }
        const iso = new Date(hi).toISOString();
        const p = EPH.positions(iso, ['태양', '달']);
        out.push({ kind, iso, sun: p['태양'], moon: p['달'], node: meanNode(iso) });
      }
    }
    prev = e;
  }
  return out;
}
function eclipses(Y, natal, ascLon) {
  const res = [];
  for (const L of lunations(Y)) {
    const nodeDist = Math.min(sep(L.sun, L.node), sep(L.sun, L.node + 180));
    const isSolar = L.kind === '삭' && nodeDist <= 17;
    const isLunar = L.kind === '망' && nodeDist <= 11.5;
    if (!isSolar && !isLunar) continue;
    const at = isSolar ? L.sun : L.moon;
    const ymdSeoul = new Date(new Date(L.iso).getTime() + 9 * 3600000).toISOString().slice(0, 10);
    if (+ymdSeoul.slice(0, 4) !== Y) continue;
    const hits = [];
    for (const N of ['태양', '달', '상승점', '천정', '금성', '화성', '수성', '목성', '토성']) {
      if (natal[N] === undefined) continue;
      const d = sep(at, natal[N]);
      if (d <= 3.5) hits.push({ N, asp: '합', off: +d.toFixed(1) });
      else if (['태양', '달', '상승점', '천정'].includes(N) && Math.abs(d - 180) <= 3) hits.push({ N, asp: '대립', off: +Math.abs(d - 180).toFixed(1) });
    }
    const pos = CH.dms(at);
    res.push({
      ymd: ymdSeoul, type: isSolar ? '일식' : '월식', sign: pos.sign, deg: pos.deg,
      house: CH.wholeSignHouse(at, ascLon), strong: nodeDist <= (isSolar ? 11 : 6),
      hits
    });
  }
  return res;
}

/* ── 6. 역행 구간 ─────────────────────────────────────────── */
function retrogrades(Y, ascLon) {
  const res = [];
  for (const P of ['수성', '금성', '화성']) {
    let cur = null;
    for (let d = ymdOf(Y, 1, 1); d <= ymdOf(Y, 12, 31); d = addDays(d, 1)) {
      const rx = EPH.isRetrograde(P, noonIso(d));
      if (rx && !cur) {
        const lon = EPH.positions(noonIso(d), [P])[P];
        cur = { P, from: d, to: d, sign: signOf(lon), house: CH.wholeSignHouse(lon, ascLon) };
      }
      if (rx && cur) cur.to = d;
      if (!rx && cur) { res.push(cur); cur = null; }
    }
    if (cur) res.push(cur);
  }
  res.sort((a, b) => a.from < b.from ? -1 : 1);
  return res;
}

/* ============================================================================
   AI 에게 넘길 다이제스트 + 화면용 메타
   ============================================================================ */
const MEANING_R = {
  수성: '연락·계약·전자기기가 꼬이기 쉽다. 새로 시작하기보다 다시 보고 고치기 좋은 구간',
  금성: '돈과 사랑의 기준을 다시 따져보게 되는 구간. 옛 인연이 돌아오기도 한다',
  화성: '밀어붙이면 되돌아오는 구간. 묵은 갈등이 다시 올라온다'
};
const TONE_KR = { good: '순풍', hard: '시험', neutral: '강조', stretch: '과욕 주의' };
const DOMAIN_KR = { love: '애정', money: '금전', work: '일·성취', body: '컨디션' };

function buildNewYearDigest(N, name, opt) {
  const todayYmd = opt.todayYmd;
  const Y = opt.year || targetYear(todayYmd);
  const natal = Object.assign({}, N.lon);
  const hasAsc = natal['상승점'] !== undefined;
  /* 솔라 차트: 상승점 대신 태양 별자리를 1하우스로 */
  const ascLon = hasAsc ? natal['상승점'] : Math.floor(natal['태양'] / 30) * 30;

  const prof = profection(natal, ascLon, N.birthYmd, Y);
  const jup = ingressSegments('목성', ascLon, Y);
  const sat = ingressSegments('토성', ascLon, Y);
  const outer = ['천왕성', '해왕성', '명왕성'].map(P => {
    const s = ingressSegments(P, ascLon, Y);
    return { P, segs: s };
  });
  const MS = monthlyScores(natal, ascLon, Y);
  const ev = exactEvents(natal, ascLon, Y);
  const ecl = eclipses(Y, natal, ascLon);
  const rx = retrogrades(Y, ascLon);

  const order = MS.months.slice().sort((a, b) => b.mean.total - a.mean.total);
  const bestMonths = order.slice(0, 3).map(x => x.m).sort((a, b) => a - b);
  const careMonths = order.slice(-2).map(x => x.m).sort((a, b) => a - b);
  const bestBy = {};
  for (const k of Object.keys(DOMAIN_KR)) {
    bestBy[k] = MS.months.slice().sort((a, b) => b.mean[k] - a.mean[k])[0].m;
  }

  /* 이미 지난 달 — 올해 운세를 연중에 산 손님에게 '검증 장치'가 된다 */
  const [ty, tm] = todayYmd.split('-').map(Number);
  const passedUntil = (ty === Y) ? tm - 1 : (ty > Y ? 12 : 0);

  const L = [];
  L.push(`[${name}님 출생차트 — 트로피컬 · ${hasAsc ? '홀사인 하우스' : '솔라 차트(태양 별자리를 1하우스로)'}]`);
  for (const k of ['상승점', '태양', '달', '수성', '금성', '화성', '목성', '토성', '천정']) {
    if (natal[k] === undefined) continue;
    const d = CH.dms(natal[k]);
    L.push(`· ${k}: ${d.sign} ${d.text} / ${CH.wholeSignHouse(natal[k], ascLon)}하우스(${CH.HOUSE_MEANING[CH.wholeSignHouse(natal[k], ascLon)]})`);
  }
  if (N.syn && N.syn.notes && N.syn.notes.length) {
    L.push('[정보 한계] ' + N.syn.notes.join(' / ') + ' — 제외된 항목은 추측하지 마라.');
  }

  L.push(`\n[★ ${Y} 메인테마 — 연간 프로펙션. 확정값. 바꾸지 마라]`);
  const P = prof.primary;
  L.push(`${Y}년의 중심: 만 ${P.age}세의 해 → ${P.house}하우스(${P.sign})의 해 — ${P.theme}`);
  L.push(`올해의 주인 행성: ${P.lord}` + (P.lordNatal ? ` (출생차트에서 ${P.lordNatal.sign}, ${P.lordNatal.house}하우스에 있음 → 올해는 이 행성과 이 방의 일이 한 해 전체를 끌고 간다)` : ''));
  if (prof.before.house !== prof.after.house) {
    L.push(`생일(${kd(prof.birthday)}) 전까지는 ${prof.before.house}하우스의 해(${prof.before.theme.split(' — ')[0]}), 생일부터 ${prof.after.house}하우스의 해(${prof.after.theme.split(' — ')[0]}). 바뀌는 시점을 짚어줘라.`);
  }

  L.push(`\n[★ 복이 들어오는 방 — 목성]`);
  jup.forEach(s => L.push(`· ${kd(s.from)} ~ ${kd(s.to)}: 목성 ${s.sign} → 내 ${s.house}하우스(${CH.HOUSE_MEANING[s.house]})${s.rx ? ' (중간에 역행 구간 포함)' : ''}`));
  L.push(`\n[★ 시험받는 방 — 토성]`);
  sat.forEach(s => L.push(`· ${kd(s.from)} ~ ${kd(s.to)}: 토성 ${s.sign} → 내 ${s.house}하우스(${CH.HOUSE_MEANING[s.house]})${s.rx ? ' (중간에 역행 구간 포함)' : ''}`));
  L.push(`[배경 — 느리게 움직이는 행성들]`);
  outer.forEach(o => L.push(`· ${o.P}: ` + o.segs.map(s => `${s.sign}(내 ${s.house}하우스) ${kd(s.from)}~${kd(s.to)}`).join(' → ')));

  L.push(`\n[★ 확정 점수 — 숫자를 바꾸지 마라]`);
  L.push(`${Y}년 총운 ${MS.year.total} / 애정 ${MS.year.love} / 금전 ${MS.year.money} / 일·성취 ${MS.year.work} / 컨디션 ${MS.year.body}`);
  L.push(`가장 좋은 달: ${bestMonths.map(m => m + '월').join(', ')} / 숨 고를 달: ${careMonths.map(m => m + '월').join(', ')}`);
  L.push(`영역별 가장 좋은 달: ` + Object.keys(DOMAIN_KR).map(k => `${DOMAIN_KR[k]} ${bestBy[k]}월`).join(' / '));

  L.push(`\n[★ 월별 흐름 — 각 달의 상대 점수(그 해 안에서의 높낮이)와 그 달의 굵직한 접촉]`);
  MS.months.forEach(x => {
    const evs = ev.filter(e => +e.ymd.slice(5, 7) === x.m).sort((a, b) => b.w - a.w).slice(0, 3);
    const doms = Object.keys(DOMAIN_KR).sort((a, b) => x.mean[b] - x.mean[a]);
    L.push(`${x.m}월 (흐름 ${x.flow}${x.m <= passedUntil ? ', 이미 지난 달' : ''}) 강한 영역 ${DOMAIN_KR[doms[0]]} · 약한 영역 ${DOMAIN_KR[doms[3]]}` +
      (evs.length ? ' — ' + evs.map(e => `${e.text}(${TONE_KR[e.tone]}, 내 ${e.house}하우스)`).join(' / ') : ' — 굵직한 접촉 없음, 잔잔한 달'));
  });

  L.push(`\n[★ 판이 바뀌는 날 — 일식·월식]`);
  if (ecl.length) ecl.forEach(e => L.push(`· ${kd(e.ymd)} ${e.type} — ${e.sign} ${e.deg}도, 내 ${e.house}하우스(${CH.HOUSE_MEANING[e.house]})` +
    (e.hits.length ? ` ★ 내 ${e.hits.map(h => h.N + (h.asp === '대립' ? '의 정반대' : '') + '(오차 ' + h.off + '도)').join(', ')} 위에 떨어짐 — 이 사람에게 특히 큰 날` : '')));
  else L.push('· 올해는 일식·월식이 이 사람의 주요 행성에 직접 닿지 않는다.');

  L.push(`\n[역행 구간 — 이 기간만 인용]`);
  rx.forEach(r => L.push(`· ${r.P} 역행 ${kd(r.from)} ~ ${kd(r.to)} — ${r.sign}, 내 ${r.house}하우스(${CH.HOUSE_MEANING[r.house]}). ${MEANING_R[r.P]}`));

  const bigDays = ev.filter(e => e.T === '목성' || e.T === '토성').concat(
    ev.filter(e => e.T === '화성' && ['태양', '달', '상승점'].includes(e.N) && (e.asp === '합' || e.asp === '대립'))
  ).sort((a, b) => b.w - a.w).slice(0, 8).sort((a, b) => a.ymd < b.ymd ? -1 : 1);
  L.push(`\n[★ 올해 꼭 기억할 날 — 큰 행성이 정확히 닿는 날]`);
  if (bigDays.length) bigDays.forEach(e => L.push(`· ${e.text} (${TONE_KR[e.tone]}, 내 ${e.house}하우스)`));
  else L.push('· 목성·토성이 주요 행성에 정확히 닿는 날이 없다. 큰 사건보다 꾸준함이 통하는 해로 써라.');

  /* ── 솔라 리턴 · 진행 달 · 기법 겹침 (2026-11-10) ── */
  const X = opt.fc || null;
  let conv = null;
  const area = h => FC.AREA[h] || '';
  if (X) {
    const srLine = (sr, label) => {
      const p = sr.planets;
      return `${label}: ${krDateFull(sr.ymd)} ${sr.hm} (한국시간)${sr.precise ? '' : ' — 시각 오차 수 분 가능'}\n` +
        `  · 생일 차트의 상승 별자리 ${sr.ascSign} → 내 출생차트의 '${area(sr.ascNatalHouse)}' 자리(${sr.ascNatalHouse}하우스)에 떨어짐 = 그 1년의 얼굴\n` +
        `  · 생일 차트의 태양 ${sr.planets['태양'].house}하우스('${area(p['태양'].house)}') = 그 1년 힘을 쏟는 곳\n` +
        `  · 생일 차트의 달 ${p['달'].sign}, ${p['달'].house}하우스('${area(p['달'].house)}') = 그 1년 마음이 머무는 곳\n` +
        `  · 생일 차트의 목성 ${p['목성'].house}하우스('${area(p['목성'].house)}') / 토성 ${p['토성'].house}하우스('${area(p['토성'].house)}')\n` +
        `  · 기둥(1·4·7·10하우스)에 선 행성: ${sr.angular.length ? sr.angular.join(', ') + ' — 그 1년 크게 드러나는 힘' : '없음'}`;
    };
    const [, bm] = N.birthYmd.split('-').map(Number);
    L.push(`\n[★ 올해 생일 차트 — 솔라 리턴. 태양이 태어난 자리로 돌아오는 순간의 차트. Prokerala 실측으로 보정한 값]`);
    L.push(srLine(X.srPrev, `${Y - 1}년 생일 차트 (${Y}년 1월 ~ ${bm}월 생일 전까지 적용)`));
    L.push(srLine(X.sr, `${Y}년 생일 차트 (${Y}년 생일부터 적용)`));
    L.push(`→ ${Y}년 대부분을 덮는 쪽: ${X.srPrimary === X.sr ? Y : Y - 1}년 생일 차트`);

    L.push(`\n[★ 마음의 시계 — 진행 달. 태어난 뒤 하루 = 인생 1년]`);
    L.push(`${Y}년 1월 1일 진행 달: ${X.pm.start.sign} ${X.pm.start.deg}도`);
    X.pm.segs.forEach(sg => L.push(`· ${kd(sg.from)} ~ ${kd(sg.to)}: ${sg.sign} → 마음이 '${area(sg.house)}' 쪽(${sg.house}하우스)에 머묾`));
    if (X.pm.events.length) X.pm.events.forEach(e => L.push(`· ${kd(e.ymd)} 전후 한 달: 진행 달이 내 ${e.target}에 ${e.asp} (${e.tone === 'good' ? '순풍' : '시험'})`));
    else L.push('· 올해 진행 달이 출생 행성에 정확히 닿는 날은 없다.');

    conv = FC.converge(prof.primary, X.srPrimary, X.pm, jup, MS, ev);
    L.push(`\n[★★ 여러 기법이 겹치는 곳 — 이 리포트에서 가장 강하게 말해도 되는 곳]`);
    if (conv.themes.length) conv.themes.forEach(t => L.push(`· 영역 '${t.domain}'(${t.areas.join(', ')}) ← ${t.techs.join(' + ')} (${t.techs.length}개 기법)`));
    else L.push('· 영역이 크게 겹치는 곳 없음 — 한 가지에 몰리지 않고 고르게 흘러가는 해');
    if (conv.months.length) conv.months.forEach(c => L.push(`· ${c.m}월 (${c.tone === 'good' ? '여러 기법이 순풍' : c.tone === 'hard' ? '여러 기법이 시험' : '순풍과 시험이 함께'}) ← ${c.why.join(' / ')}`));
    L.push('→ 겹치는 곳은 확신 있게 단정하라. 한 기법만 가리키는 것은 "흐름이 있다" 정도로 가볍게. 겹치지 않는 곳을 세게 말하지 마라.');
  } else {
    L.push(`\n[생일 차트·진행 달 — 태어난 시간을 몰라 계산하지 않음. 언급하지 마라]`);
  }

  return {
    text: L.join('\n'), year: Y, hasAsc, passedUntil,
    meta: {
      year: Y, hasAsc,
      profection: { age: P.age, house: P.house, sign: P.sign, lord: P.lord, theme: P.theme,
                    birthday: prof.birthday, before: prof.before.house, after: prof.after.house },
      scores: MS.year,
      months: MS.months.map(x => ({ m: x.m, flow: x.flow, score: x.score, passed: x.m <= passedUntil })),
      bestMonths, careMonths, bestBy,
      jupiter: jup.map(s => ({ from: s.from, to: s.to, sign: s.sign, house: s.house })),
      saturn: sat.map(s => ({ from: s.from, to: s.to, sign: s.sign, house: s.house })),
      eclipses: ecl.map(e => ({ ymd: e.ymd, type: e.type, sign: e.sign, house: e.house, personal: e.hits.length > 0 })),
      retro: rx.map(r => ({ P: r.P, from: r.from, to: r.to, house: r.house })),
      keyDays: bigDays.map(e => ({ ymd: e.ymd, text: e.text, tone: e.tone })),
      solarReturn: X ? { ymd: X.srPrimary.ymd, hm: X.srPrimary.hm, precise: X.srPrimary.precise,
                         ascSign: X.srPrimary.ascSign, ascHouse: X.srPrimary.ascNatalHouse,
                         sunHouse: X.srPrimary.planets['태양'].house, moonHouse: X.srPrimary.planets['달'].house } : null,
      progMoon: X ? X.pm.segs.map(sg => ({ from: sg.from, to: sg.to, sign: sg.sign, house: sg.house })) : null,
      converge: conv
    }
  };
}

module.exports = { buildNewYearDigest, targetYear, profection, ingressSegments, monthlyScores,
                   exactEvents, eclipses, lunations, retrogrades, HOUSE_THEME, RULER };
