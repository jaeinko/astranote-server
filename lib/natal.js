// ============================================================================
//  lib/natal.js — 출생차트 한 번에 받기 (재회운 16 · 신년운세 18 공용)
// ----------------------------------------------------------------------------
//  ▣ 왜 따로 만들었나
//
//  궁합·양육 API 는 각자 getToken/rawChart/fetchChart 를 복사해 들고 있습니다.
//  새 상품 두 개가 또 복사하면 같은 코드가 네 벌이 됩니다.
//  그리고 두 상품은 기존 상품이 안 쓰던 것이 더 필요합니다.
//
//      · 상승점·천정을 좌표로 직접 계산한 정밀값  (lib/chart.js — 1분 이내)
//      · 노스노드·사우스노드 (평균 노드)           재회운 3장의 핵심
//      · 명왕성                                    재회운 2장 '집착'
//
//  ▣ 두 가지 모양을 동시에 돌려줍니다
//
//      syn : lib/astro-synastry.js 형식  { planets:{태양:{sign,deg,abs}}, asc, ascSignIndex, ... }
//      lon : lib/transit.js 형식        { 태양: 황경, ..., 상승점?, 천정? }
//
//  ▣ Prokerala 가 죽어도 리포트는 나갑니다
//
//  예전에는 Prokerala 토큰 한 번만 실패해도 손님이 결제하고 에러 화면을 봤습니다.
//  lib/ephemeris.js 는 2026~2028 구간에서 Swiss Ephemeris 대비
//  달 5.5분, 나머지 3분 이내로 검증됐습니다(2026-11-09 대조).
//  그래서 Prokerala 실패 시 자체 계산으로 이어갑니다. 손님은 차이를 모릅니다.
// ============================================================================

'use strict';

const SYN = require('./astro-synastry.js');
const CH = require('./chart.js');
const EPH = require('./ephemeris.js');
const cityCoordinates = require('./cities.js');
const { buildBirthIso, dayRangeIso } = require('./time.js');

const norm360 = x => ((x % 360) + 360) % 360;

/* 평균 노드 (Meeus, Astronomical Algorithms 47.7) — 트로피컬
   Swiss Ephemeris MEAN_NODE 와 1분 이내로 일치 (test 참조) */
function meanNode(iso) {
  const jd = new Date(iso).getTime() / 86400000 + 2440587.5;
  const T = (jd - 2451545.0) / 36525;
  return norm360(125.0445479 - 1934.1362891 * T + 0.0020754 * T * T
                 + T * T * T / 467441 - T * T * T * T / 60616000);
}

/* ── Prokerala ───────────────────────────────────────────── */
let _tok = null, _tokAt = 0;
async function getToken() {
  /* 같은 함수 인스턴스 안에서는 50분간 재사용 (토큰 유효시간 1시간) */
  if (_tok && Date.now() - _tokAt < 50 * 60 * 1000) return _tok;
  const r = await fetch('https://api.prokerala.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.PROKERALA_CLIENT_ID,
      client_secret: process.env.PROKERALA_CLIENT_SECRET
    })
  });
  if (!r.ok) throw new Error('Prokerala 토큰 실패 ' + r.status);
  _tok = (await r.json()).access_token;
  _tokAt = Date.now();
  return _tok;
}

async function rawChart(iso, loc, token) {
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), 15000);
  try {
    const url = 'https://api.prokerala.com/v2/astrology/planet-position'
      + '?datetime=' + encodeURIComponent(iso)
      + '&coordinates=' + loc.lat + ',' + loc.lon + '&ayanamsa=1';
    const r = await fetch(url, { headers: { Authorization: 'Bearer ' + token }, signal: ac.signal });
    if (!r.ok) throw new Error('Prokerala 차트 실패 ' + r.status);
    return (await r.json()).data;
  } finally { clearTimeout(timer); }
}

/* ── 자체 계산으로 Prokerala 응답 모양을 흉내낸다 (사이더리얼로 되돌려서) ──
   이렇게 하면 SYN.parseChart / buildUnknownTimeChart 를 그대로 재사용할 수 있다.
   아야남사는 같은 근사식으로 빼고 더하므로 왕복 오차가 0 이다. */
const EN = { '태양': 'Sun', '달': 'Moon', '수성': 'Mercury', '금성': 'Venus', '화성': 'Mars',
             '목성': 'Jupiter', '토성': 'Saturn' };
function localChart(iso, loc) {
  const ay = SYN.lahiriAyanamsa(iso);
  const pos = EPH.positions(iso, Object.keys(EN));
  const list = Object.keys(EN).map(k => ({
    name: EN[k], longitude: norm360(pos[k] - ay), is_retrograde: EPH.isRetrograde(k, iso)
  }));
  const jd = new Date(iso).getTime() / 86400000 + 2440587.5;
  list.push({ name: 'Ascendant', longitude: norm360(CH.calcASC(jd, loc.lon, loc.lat) - ay) });
  return { planet_position: list };
}

/**
 * @param person { name, date:'YYYY-MM-DD', time:'HH:MM'|null, timeUnknown, city }
 * @param opts   { token?: Promise<string>|null }  — 두 사람을 볼 때 토큰을 한 번만 받으려고
 * @returns { syn, lon, iso, timeUnknown, source:'prokerala'|'local', nodeN, nodeS, pluto }
 */
async function fetchNatal(person, opts) {
  const loc = cityCoordinates[person.city] || cityCoordinates['Seoul'];
  const useApi = !!(process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET);
  let source = 'local';
  let syn = null;

  const isoMain = buildBirthIso(person.date, person.timeUnknown ? '12:00' : person.time, person.city);

  if (!person.timeUnknown) {
    let data = null;
    if (useApi) {
      try {
        const token = await ((opts && opts.token) || getToken());
        data = await rawChart(isoMain, loc, token);
        source = 'prokerala';
      } catch (e) { console.warn('⚠️ Prokerala 실패 → 자체 계산으로 계속:', e.message); }
    }
    if (!data) data = localChart(isoMain, loc);
    syn = SYN.parseChart(data, isoMain);
    if (!syn) { syn = SYN.parseChart(localChart(isoMain, loc), isoMain); source = 'local'; }
    if (!syn) throw new Error('차트 계산 실패 (' + person.name + ')');

    /* 상승점은 Prokerala 값 대신 좌표로 직접 계산한 정밀값으로 덮는다.
       (홀사인이라 별자리만 맞으면 되지만, 경계 근처 출생자는 이 차이로 하우스가 통째로 바뀐다) */
    const jd = new Date(isoMain).getTime() / 86400000 + 2440587.5;
    const asc = CH.calcASC(jd, loc.lon, loc.lat);
    syn.planets['상승점'] = SYN.signDeg(asc);
    syn.asc = syn.planets['상승점'];
    syn.ascSignIndex = Math.floor(asc / 30);
    syn.mc = CH.calcMC(jd, loc.lon);
  } else {
    const [isoStart, isoEnd] = dayRangeIso(person.date, person.city);
    let ds = null, de = null;
    if (useApi) {
      try {
        const token = await ((opts && opts.token) || getToken());
        [ds, de] = await Promise.all([rawChart(isoStart, loc, token), rawChart(isoEnd, loc, token)]);
        source = 'prokerala';
      } catch (e) { console.warn('⚠️ Prokerala 실패(시각 미상) → 자체 계산:', e.message); ds = de = null; }
    }
    if (!ds || !de) { ds = localChart(isoStart, loc); de = localChart(isoEnd, loc); source = 'local'; }
    syn = SYN.buildUnknownTimeChart(ds, de, isoStart);
    if (!syn) throw new Error('차트 계산 실패 (' + person.name + ', 시각 미상)');
  }

  /* lon 맵 — transit.js 가 먹는 모양 */
  const lon = {};
  for (const k of Object.keys(syn.planets)) lon[k] = syn.planets[k].abs;
  if (syn.mc !== undefined) lon['천정'] = syn.mc;

  /* 느린 점들은 자체 계산. 하루에 노드 0.05도·명왕성 0.01도라 시각 미상이어도 정오값으로 충분 */
  const nodeN = meanNode(isoMain);
  const pluto = EPH.positions(isoMain, ['명왕성'])['명왕성'];

  return {
    syn, lon, iso: isoMain, birthYmd: person.date, timeUnknown: !!person.timeUnknown, source,
    nodeN, nodeS: norm360(nodeN + 180), pluto
  };
}

module.exports = { fetchNatal, getToken, meanNode, localChart };
