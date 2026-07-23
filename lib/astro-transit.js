// ============================================================================
//  lib/astro-transit.js  —  아스트라노트 '오늘부터 30일' 운세 엔진
// ----------------------------------------------------------------------------
//  ★ 기존 파일을 전혀 수정하지 않습니다. lib/astro-synastry.js 를 재활용합니다.
//
//  왜 '이번 달'이 아니라 '오늘부터 30일'인가
//   · 트랜짓(행성의 실제 이동)은 날짜 단위로 흐릅니다. 8월 1일에 끊기지 않습니다.
//   · 월 단위로 자르면 8월 28일에 산 손님은 3일치만 받는 셈입니다.
//   · 오늘부터 30일이면 언제 사도 온전히 30일. 월말 매출 절벽도 사라집니다.
//
//  비용 구조 (1,900원 상품에서 가장 중요한 설계)
//   · '오늘 하늘'은 모든 손님이 공유 → 하루 1회 계산 후 캐싱
//   · 손님당 실제 Prokerala 호출 = 본인 네이탈 1회뿐 (시각 미상이면 2회)
//
//  달을 뼈대로 쓰지 않는 이유
//   · 달은 하루 13도, 30일이면 12사인을 다 돕니다. 월간 서사가 안 됩니다.
//   · 실제 '이번 달 사건'을 만드는 건 태양·수성·금성·화성입니다.
//     (30일에 15~42도 이동 = 각을 맺었다 풀었다 하는 구간이 생김)
// ============================================================================

'use strict';

var SYN = require('./astro-synastry.js');

var SIGNS_KR = SYN.SIGNS_KR;
var norm360 = SYN.norm360;
var angleDiff = SYN.angleDiff;
var signDeg = SYN.signDeg;
var josa = SYN.josa;

/* 3일 간격 × 11회 = 30일. 태양이 3도씩 움직이므로 오브 3도 안에서 각을 놓치지 않는다. */
var SAMPLE_STEP = 3;
var SPAN_DAYS = 30;

/* 트랜짓 쪽(움직이는 하늘). 달은 너무 빨라 월간 뼈대에서 제외한다. */
var TRANSIT_PLANETS = ['태양', '수성', '금성', '화성', '목성', '토성'];

/* 네이탈 쪽(내 차트의 고정점) */
var NATAL_POINTS = ['태양', '달', '수성', '금성', '화성', '목성', '토성', '상승점'];

/* 트랜짓은 '언제'가 핵심이라 오브를 좁게 잡는다. 넓으면 날짜가 뭉개진다. */
var ASPECTS = [
  { key: '합',   angle: 0,   orb: 3.5, tone: '강화' },
  { key: '대립', angle: 180, orb: 3.0, tone: '긴장' },
  { key: '삼각', angle: 120, orb: 3.0, tone: '순조' },
  { key: '각',   angle: 90,  orb: 3.0, tone: '마찰' },
  { key: '육각', angle: 60,  orb: 2.0, tone: '기회' }
];

/* 어떤 트랜짓이 실제로 체감되는가 (가중치) */
var T_WEIGHT = { '목성': 10, '토성': 10, '화성': 8, '태양': 7, '금성': 6, '수성': 4 };
var N_WEIGHT = { '태양': 10, '달': 10, '상승점': 9, '금성': 7, '화성': 7, '수성': 5, '목성': 4, '토성': 6 };

var HOUSE_AREA = {
  1:  '나 자신·건강·인상',
  2:  '수입·소유·자존감',
  3:  '연락·이동·계약',
  4:  '집·가족·정착',
  5:  '연애·즐거움·자기표현',
  6:  '일상 업무·건강관리',
  7:  '파트너·1:1 관계',
  8:  '큰돈·깊은 관계·정리',
  9:  '배움·먼 이동·가치관',
  10: '커리어·평판',
  11: '사람·네트워크·미래계획',
  12: '휴식·마무리·비밀'
};

/* --------------------------------------------------------------------------
   [1] 날짜 유틸
-------------------------------------------------------------------------- */
function addDays(base, n) {
  var d = new Date(base.getTime());
  d.setDate(d.getDate() + n);
  return d;
}

function ymd(d) {
  return d.getFullYear() + '-' +
         String(d.getMonth() + 1).padStart(2, '0') + '-' +
         String(d.getDate()).padStart(2, '0');
}

/** 손님에게 보여줄 자연스러운 날짜 표기 */
function krDate(d, today) {
  var sameYear = d.getFullYear() === today.getFullYear();
  var m = d.getMonth() + 1, day = d.getDate();
  return (sameYear ? '' : d.getFullYear() + '년 ') + m + '월 ' + day + '일';
}

/** 스캔할 날짜 목록 (오늘 0일차부터 30일차까지 3일 간격) */
function sampleDates(today) {
  var out = [];
  for (var i = 0; i <= SPAN_DAYS; i += SAMPLE_STEP) out.push({ offset: i, date: addDays(today, i) });
  return out;
}

/* --------------------------------------------------------------------------
   [2] 하늘 스냅샷 파싱
   Prokerala 응답(사이더리얼) → 트로피컬 황경
-------------------------------------------------------------------------- */
function parseSky(rawList, isoList) {
  var sky = [];
  for (var i = 0; i < rawList.length; i++) {
    var data = rawList[i];
    var list = data && (data.planet_position || data.planet_positions);
    if (!list || !list.length) continue;

    var ay = SYN.lahiriAyanamsa(isoList[i]);
    var planets = {};
    for (var j = 0; j < list.length; j++) {
      var p = list[j];
      var kr = SYN.PLANET_KR[p.name];
      if (!kr || typeof p.longitude !== 'number') continue;
      if (kr === '상승점') continue;              // 하늘 쪽 상승점은 의미 없음
      planets[kr] = norm360(p.longitude + ay);
    }
    if (Object.keys(planets).length) sky.push({ index: i, planets: planets });
  }
  return sky;
}

/* --------------------------------------------------------------------------
   [3] 트랜짓 히트 탐색 — 이 상품의 심장
   각 (트랜짓 행성 × 내 차트 지점 × 각도) 조합에 대해
   '가장 정확해지는 날짜'를 찾아낸다. 그게 손님이 알고 싶은 그 날이다.
-------------------------------------------------------------------------- */
function findHits(natal, sky, samples, today) {
  var hits = [];

  for (var ti = 0; ti < TRANSIT_PLANETS.length; ti++) {
    var T = TRANSIT_PLANETS[ti];

    for (var ni = 0; ni < NATAL_POINTS.length; ni++) {
      var N = NATAL_POINTS[ni];
      var natalPos = natal.planets[N];
      if (!natalPos) continue;                   // 시각 미상이면 상승점 등이 없다

      for (var ai = 0; ai < ASPECTS.length; ai++) {
        var asp = ASPECTS[ai];

        /* 표본별로 '정확한 각에서 얼마나 벗어났는가'를 구한다 */
        var best = null;
        for (var si = 0; si < sky.length; si++) {
          var tp = sky[si].planets[T];
          if (typeof tp !== 'number') continue;
          var off = Math.abs(angleDiff(tp, natalPos.abs) - asp.angle);
          if (best === null || off < best.off) {
            best = { off: off, si: si };
          }
        }
        if (!best || best.off > asp.orb) continue;

        /* 앞뒤 표본으로 선형 보간해 실제 최근접 날짜를 추정 (3일 간격 → ±1일 정확도) */
        var sIdx = sky[best.si].index;
        var peakOffset = samples[sIdx] ? samples[sIdx].offset : 0;

        var prev = sky[best.si - 1], next = sky[best.si + 1];
        function offAt(s) {
          if (!s) return null;
          var v = s.planets[T];
          if (typeof v !== 'number') return null;
          return Math.abs(angleDiff(v, natalPos.abs) - asp.angle);
        }
        var op = offAt(prev), on = offAt(next);
        if (op !== null && on !== null) {
          var denom = (op - 2 * best.off + on);
          if (Math.abs(denom) > 1e-6) {
            var shift = 0.5 * (op - on) / denom;      // 포물선 꼭짓점
            if (shift > -1 && shift < 1) peakOffset += Math.round(shift * SAMPLE_STEP);
          }
        }
        if (peakOffset < 0) peakOffset = 0;
        if (peakOffset > SPAN_DAYS) peakOffset = SPAN_DAYS;

        var tw = T_WEIGHT[T] || 3;
        var nw = N_WEIGHT[N] || 3;
        var tight = 1 - (best.off / asp.orb);
        var harmonious = (asp.key === '합' && T === '토성') ? false
                       : (asp.key === '합' || asp.key === '삼각' || asp.key === '육각');

        hits.push({
          transit: T,
          natal: N,
          aspect: asp.key,
          tone: asp.tone,
          orb: +best.off.toFixed(1),
          offset: peakOffset,
          date: addDays(today, peakOffset),
          harmonious: harmonious,
          weight: tw + nw,
          strength: +((tw + nw) * (0.55 + tight * 0.45)).toFixed(2),
          text: '트랜짓 ' + T + ' — 내 ' + N + ' ' + asp.key + '(' + asp.tone + ', 오차 ' + best.off.toFixed(1) + '도)'
        });
        break;   // 한 쌍당 하나의 각만
      }
    }
  }

  hits.sort(function (a, b) { return b.strength - a.strength; });
  return hits;
}

/* --------------------------------------------------------------------------
   [4] 하우스 통과 — "이번 달 어느 영역이 켜지는가"
   (출생시각을 아는 손님에게만 제공. 모르면 조용히 생략)
-------------------------------------------------------------------------- */
function houseTransits(natal, sky, samples, today) {
  if (natal.ascSignIndex === null || natal.ascSignIndex === undefined) return [];
  if (!sky.length) return [];

  var rows = [];
  var first = sky[0], last = sky[sky.length - 1];

  for (var i = 0; i < TRANSIT_PLANETS.length; i++) {
    var T = TRANSIT_PLANETS[i];
    var a = first.planets[T], b = last.planets[T];
    if (typeof a !== 'number' || typeof b !== 'number') continue;

    var hA = SYN.houseOf(natal, a), hB = SYN.houseOf(natal, b);
    if (!hA) continue;

    if (hA === hB) {
      rows.push({
        planet: T, house: hA, moved: false, weight: T_WEIGHT[T] || 3,
        text: josa(T, '이', '가') + ' 한 달 내내 ' + hA + '하우스(' + HOUSE_AREA[hA] + ')에 머문다'
      });
    } else {
      /* 영역이 바뀌는 시점을 찾는다 — 이게 손님이 체감하는 전환점 */
      var switchOffset = SPAN_DAYS;
      for (var s = 1; s < sky.length; s++) {
        var v = sky[s].planets[T];
        if (typeof v !== 'number') continue;
        if (SYN.houseOf(natal, v) !== hA) {
          switchOffset = samples[sky[s].index] ? samples[sky[s].index].offset : SPAN_DAYS;
          break;
        }
      }
      rows.push({
        planet: T, house: hB, from: hA, moved: true, offset: switchOffset,
        weight: (T_WEIGHT[T] || 3) + 4,
        text: josa(T, '이', '가') + ' ' + krDate(addDays(today, switchOffset), today) + '경 ' +
              hA + '하우스(' + HOUSE_AREA[hA] + ')에서 ' + hB + '하우스(' + HOUSE_AREA[hB] + ')로 넘어간다'
      });
    }
  }
  rows.sort(function (a, b) { return b.weight - a.weight; });
  return rows;
}

/* --------------------------------------------------------------------------
   [5] 점수 — 코드가 결정한다. AI는 손대지 못한다.
   같은 사람이 같은 날 다시 사면 같은 점수가 나와야 한다.
-------------------------------------------------------------------------- */
var AREA_RULES = {
  love:  { transit: ['금성', '화성', '목성'], natal: ['금성', '달', '화성', '상승점'], house: [5, 7, 8, 11] },
  money: { transit: ['목성', '토성', '금성'], natal: ['금성', '목성', '토성', '태양'], house: [2, 8, 6, 10] },
  work:  { transit: ['화성', '수성', '태양', '토성'], natal: ['태양', '수성', '화성', '토성'], house: [6, 10, 3, 1] },
  body:  { transit: ['화성', '토성', '태양'], natal: ['달', '상승점', '태양'], house: [1, 6, 12] }
};

function areaMass(rules, availNatal) {
  var m = 0;
  for (var i = 0; i < rules.transit.length; i++) {
    for (var j = 0; j < rules.natal.length; j++) {
      if (availNatal.indexOf(rules.natal[j]) === -1) continue;
      m += (T_WEIGHT[rules.transit[i]] || 3) + (N_WEIGHT[rules.natal[j]] || 3);
    }
  }
  return m;
}

function monthScore(hits, houses, natal) {
  var availNatal = NATAL_POINTS.filter(function (p) { return !!natal.planets[p]; });

  var raw = { total: 0, love: 0, money: 0, work: 0, body: 0 };

  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    var spicy = (h.transit === '화성' && h.natal === '금성') || (h.transit === '금성' && h.natal === '화성');
    var sign = h.harmonious ? 1 : (spicy ? 0.5 : -0.85);
    var v = h.strength * sign;
    raw.total += v;

    for (var key in AREA_RULES) {
      var r = AREA_RULES[key];
      var inT = r.transit.indexOf(h.transit) !== -1;
      var inN = r.natal.indexOf(h.natal) !== -1;
      if (inT || inN) raw[key] += v * (inT && inN ? 1 : 0.6);
    }
  }

  /* 하우스 통과는 '영역이 켜진다'는 뜻이라 소폭 가산 */
  for (var k = 0; k < houses.length; k++) {
    var hs = houses[k];
    for (var key2 in AREA_RULES) {
      if (AREA_RULES[key2].house.indexOf(hs.house) !== -1) raw[key2] += hs.moved ? 3 : 1.2;
    }
  }

  /* 정보 부족(시각 미상)으로 지점이 빠지면 점수가 부당하게 낮아진다 → 총량 비율로 보정 */
  var norm = {};
  for (var key3 in AREA_RULES) {
    var full = areaMass(AREA_RULES[key3], NATAL_POINTS);
    var have = areaMass(AREA_RULES[key3], availNatal);
    norm[key3] = have > 0 ? Math.min(2.0, full / have) : 1;
    raw[key3] *= norm[key3];
  }
  var fullAll = 0, haveAll = 0;
  for (var a = 0; a < NATAL_POINTS.length; a++) {
    var w = N_WEIGHT[NATAL_POINTS[a]] || 3;
    fullAll += w;
    if (availNatal.indexOf(NATAL_POINTS[a]) !== -1) haveAll += w;
  }
  var confidence = haveAll / fullAll;
  raw.total *= (haveAll > 0 ? Math.min(1.8, fullAll / haveAll) : 1);

  /* center·gain은 무작위 3,000회 시뮬레이션으로 실측한 값이다.
     목표 분포: 중앙값 72 / 하위5% 54 / 상위5% 90 (하한 42, 상한 97)
     ※ 임의로 바꾸면 모든 손님 점수가 한쪽으로 쏠린다. 반드시 재측정 후 수정할 것. */
  function scale(x, center, gain) {
    return Math.max(42, Math.min(97, Math.round(72 + (x - center) * gain)));
  }

  return {
    total: scale(raw.total,  99.7, 0.178),
    love:  scale(raw.love,   63.7, 0.295),
    money: scale(raw.money,  52.1, 0.331),
    work:  scale(raw.work,   66.3, 0.239),
    body:  scale(raw.body,   48.1, 0.266),
    confidence: +confidence.toFixed(2)
  };
}

/* --------------------------------------------------------------------------
   [6] 주목할 날짜 뽑기 — 손님이 가장 원하는 것
-------------------------------------------------------------------------- */
function keyDates(hits, today) {
  var good = hits.filter(function (h) { return h.harmonious; }).slice(0, 4);
  var care = hits.filter(function (h) { return !h.harmonious; }).slice(0, 3);

  function fmt(h) {
    var d = h.date;
    var from = addDays(d, -1), to = addDays(d, 1);
    return {
      label: krDate(from, today) + '~' + krDate(to, today).replace(/^\d+월\s/, function (m) {
        return from.getMonth() === to.getMonth() ? '' : m;
      }),
      peak: krDate(d, today),
      offset: h.offset,
      why: h.text
    };
  }
  return { good: good.map(fmt), care: care.map(fmt) };
}

/* --------------------------------------------------------------------------
   [7] AI에게 넘길 다이제스트
-------------------------------------------------------------------------- */
function buildMonthlyDigest(natal, sky, samples, today, name) {
  var hits = findHits(natal, sky, samples, today);
  var houses = houseTransits(natal, sky, samples, today);
  var score = monthScore(hits, houses, natal);
  var dates = keyDates(hits, today);

  var L = [];

  if (natal.notes && natal.notes.length) {
    L.push('[🚨 정보 한계 — 반드시 지켜라]');
    natal.notes.forEach(function (n) { L.push('- ' + n); });
    L.push('제외된 항목은 계산이 불가능한 것이다. 절대 추측해서 쓰지 마라.');
    L.push('제외 사실을 손님에게 변명하듯 늘어놓지 말고, 남은 배치만으로 확신 있게 단정하라.\n');
  }

  var parts = [];
  NATAL_POINTS.forEach(function (p) {
    if (natal.planets[p]) parts.push(p + ' ' + natal.planets[p].sign + ' ' + natal.planets[p].deg + '도');
  });
  L.push('[' + name + '님 출생 차트] ' + parts.join(' / '));

  L.push('\n[기간] 오늘부터 30일 (' + krDate(today, today) + ' ~ ' + krDate(addDays(today, SPAN_DAYS), today) + ')');

  L.push('\n[지금 하늘의 위치 — 오늘 기준]');
  if (sky.length) {
    var p0 = sky[0].planets;
    var line = [];
    TRANSIT_PLANETS.forEach(function (t) {
      if (typeof p0[t] === 'number') line.push(t + ' ' + signDeg(p0[t]).sign);
    });
    L.push(line.join(' / '));
  }

  L.push('\n[이번 30일에 실제로 맺어지는 각 — 이것만 근거로 써라. 지어내면 실패다]');
  var top = hits.slice(0, 10);
  if (top.length) {
    top.forEach(function (h, i) {
      L.push((i + 1) + '. ' + krDate(h.date, today) + '경 : ' + h.text);
    });
  } else {
    L.push('뚜렷한 각이 거의 없다. "사건이 밀려오기보다 내가 만든 만큼 흘러가는 30일"로 방향을 잡아라. 없는 각을 지어내지 마라.');
  }

  if (houses.length) {
    L.push('\n[영역 이동 — 이번 달 어디에 불이 켜지는가]');
    houses.slice(0, 5).forEach(function (h) { L.push('- ' + h.text); });
  }

  L.push('\n[좋은 날 — 이 날짜만 써라]');
  if (dates.good.length) dates.good.forEach(function (d) { L.push('- ' + d.peak + ' 전후 (' + d.why + ')'); });
  else L.push('- 특별히 도드라지는 날이 없다. 날짜를 지어내지 말고 "특정일보다 꾸준함이 통하는 달"로 안내하라.');

  L.push('\n[조심할 날 — 이 날짜만 써라]');
  if (dates.care.length) dates.care.forEach(function (d) { L.push('- ' + d.peak + ' 전후 (' + d.why + ')'); });
  else L.push('- 뚜렷한 마찰일이 없다. 억지로 위험을 만들지 마라.');

  L.push('\n[확정 점수 — 이 숫자를 그대로 써라. 다른 숫자를 지어내면 실패다]');
  L.push('종합 ' + score.total + '점 / 애정 ' + score.love + '점 / 금전 ' + score.money +
         '점 / 일·성취 ' + score.work + '점 / 컨디션 ' + score.body + '점');
  if (score.confidence < 0.95) {
    L.push('(참고: 정보 완전도 ' + Math.round(score.confidence * 100) + '%. 이 사실을 손님에게 설명하지 마라.)');
  }

  return { text: L.join('\n'), score: score, hits: hits, houses: houses, dates: dates };
}

/* 보정용 — 스케일 적용 전 원시값 (배포에는 영향 없음) */
function _rawScore(hits, houses, natal) {
  var availNatal = NATAL_POINTS.filter(function (p) { return !!natal.planets[p]; });
  var raw = { total: 0, love: 0, money: 0, work: 0, body: 0 };
  for (var i = 0; i < hits.length; i++) {
    var h = hits[i];
    var spicy = (h.transit === '화성' && h.natal === '금성') || (h.transit === '금성' && h.natal === '화성');
    var sign = h.harmonious ? 1 : (spicy ? 0.5 : -0.85);
    var v = h.strength * sign;
    raw.total += v;
    for (var key in AREA_RULES) {
      var r = AREA_RULES[key];
      var inT = r.transit.indexOf(h.transit) !== -1;
      var inN = r.natal.indexOf(h.natal) !== -1;
      if (inT || inN) raw[key] += v * (inT && inN ? 1 : 0.6);
    }
  }
  for (var k = 0; k < houses.length; k++) {
    var hs = houses[k];
    for (var key2 in AREA_RULES) {
      if (AREA_RULES[key2].house.indexOf(hs.house) !== -1) raw[key2] += hs.moved ? 3 : 1.2;
    }
  }
  for (var key3 in AREA_RULES) {
    var full = areaMass(AREA_RULES[key3], NATAL_POINTS);
    var have = areaMass(AREA_RULES[key3], availNatal);
    raw[key3] *= (have > 0 ? Math.min(2.0, full / have) : 1);
  }
  var fullAll = 0, haveAll = 0;
  for (var a = 0; a < NATAL_POINTS.length; a++) {
    var w = N_WEIGHT[NATAL_POINTS[a]] || 3;
    fullAll += w;
    if (availNatal.indexOf(NATAL_POINTS[a]) !== -1) haveAll += w;
  }
  raw.total *= (haveAll > 0 ? Math.min(1.8, fullAll / haveAll) : 1);
  return raw;
}

module.exports = {
  _rawScore: _rawScore,
  SAMPLE_STEP: SAMPLE_STEP,
  SPAN_DAYS: SPAN_DAYS,
  TRANSIT_PLANETS: TRANSIT_PLANETS,
  HOUSE_AREA: HOUSE_AREA,
  addDays: addDays,
  ymd: ymd,
  krDate: krDate,
  sampleDates: sampleDates,
  parseSky: parseSky,
  findHits: findHits,
  houseTransits: houseTransits,
  monthScore: monthScore,
  keyDates: keyDates,
  buildMonthlyDigest: buildMonthlyDigest
};
