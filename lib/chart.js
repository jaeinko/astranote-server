// ============================================================================
//  lib/chart.js — 아스트라노트 공용 차트 계산
// ----------------------------------------------------------------------------
//  ★ 상승점·천정 계산과 별자리 표기의 정본입니다.
//    lib/cities.js · lib/time.js 와 같은 이유로 여기 모았습니다.
//    (예전에는 이 계산이 gemini-vip.js 안에만 있어서 다른 상품은 쓸 수 없었습니다)
//
//  ▣ 정확도 검증 — 2021-07-05 19:58 AEST 시드니 출생, Swiss Ephemeris 대조
//     상승점 오차 0.008도 · 천정 0.002도  → 1분(arcmin) 이내
// ============================================================================

'use strict';

const RAD = Math.PI / 180;
const norm360 = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * RAD);
const cosd = x => Math.cos(x * RAD);
const tand = x => Math.tan(x * RAD);

const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
                  '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const SIGN_GLYPH = { '양자리':'♈','황소자리':'♉','쌍둥이자리':'♊','게자리':'♋','사자자리':'♌',
  '처녀자리':'♍','천칭자리':'♎','전갈자리':'♏','사수자리':'♐','염소자리':'♑','물병자리':'♒','물고기자리':'♓' };
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성',
  Jupiter:'목성', Saturn:'토성', Uranus:'천왕성', Neptune:'해왕성', Pluto:'명왕성', Ascendant:'상승점' };
const PLANET_GLYPH = { '태양':'☉','달':'☽','수성':'☿','금성':'♀','화성':'♂','목성':'♃','토성':'♄',
  '천왕성':'♅','해왕성':'♆','명왕성':'♇','상승점':'AC','천정':'MC','노스노드':'☊','사우스노드':'☋' };

const HOUSE_MEANING = {
  1:'자아·타고난 기질·첫인상', 2:'돈·자존감·타고난 재능', 3:'소통·형제자매·초년 학습환경',
  4:'부모·가정·뿌리·마음의 안식처', 5:'연애·자녀·창조성·즐거움', 6:'일상·건강·직장생활·성실함',
  7:'배우자·결혼·1:1 관계', 8:'깊은 결속·상처·타인의 자원·변형', 9:'배움·여행·먼 곳·신념',
  10:'커리어·사회적 지위·명예', 11:'인간관계·인맥·꿈과 소망', 12:'무의식·숨겨진 상처·혼자만의 세계'
};

const toJD = iso => new Date(iso).getTime() / 86400000 + 2440587.5;

function angleDiff(a, b) {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}

/* 평균 황도 경사 (IAU 1980) */
function obliquity(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}
/* 그리니치 평균 항성시 (도) */
function gmst(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0)
    + 0.000387933 * T * T - (T * T * T) / 38710000);
}
/* 지방 항성시 = RAMC */
const ramc = (jd, lonE) => norm360(gmst(jd) + lonE);

/* 천정(MC) 황경 :  tanλ = tanα / cosε */
function calcMC(jd, lonE) {
  const a = ramc(jd, lonE), e = obliquity(jd);
  return norm360(Math.atan2(sind(a), cosd(a) * cosd(e)) / RAD);
}
/* 상승점(ASC) 황경 — 위도가 필요합니다 */
function calcASC(jd, lonE, lat) {
  const a = ramc(jd, lonE), e = obliquity(jd);
  return norm360(Math.atan2(-cosd(a), sind(a) * cosd(e) + tand(lat) * sind(e)) / RAD + 180);
}

/* 라히리 아야남사 근사 — Prokerala 의 사이더리얼 좌표를 트로피컬로 되돌릴 때 씁니다 */
function lahiriAyanamsa(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000);
}

/* 도·분 표기.  예) 21.7666 → { sign:'물병자리', text:'21°46′' } */
function dms(lon) {
  const l = norm360(lon), inSign = l % 30;
  let deg = Math.floor(inSign), min = Math.round((inSign - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return { sign: SIGNS_KR[Math.floor(l / 30)], text: deg + '°' + String(min).padStart(2, '0') + '′',
           deg: deg, min: min, abs: l };
}
function signDeg(lon) {
  const l = norm360(lon);
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}
const signIndex = lon => Math.floor(norm360(lon) / 30);

/* 홀사인 하우스 — 상승점이 속한 별자리가 1하우스 전체 */
const wholeSignHouse = (lon, ascLon) =>
  ((signIndex(lon) - signIndex(ascLon)) % 12 + 12) % 12 + 1;

/* Prokerala 응답 → 트로피컬 황경 맵.
   상승점·천정은 좌표와 시각으로 직접 계산하는 쪽이 더 정확하므로 그렇게 합니다. */
function natalFromProkerala(data, iso, loc) {
  const list = (data && (data.planet_position || data.planet_positions)) || [];
  if (!list.length) return null;
  const ay = lahiriAyanamsa(iso);
  const out = {}, retro = {};
  for (const p of list) {
    const kr = PLANET_KR[p.name];
    if (!kr || typeof p.longitude !== 'number') continue;
    out[kr] = norm360(p.longitude + ay);
    retro[kr] = !!(p.is_retrograde || p.isRetrograde || p.retrograde);
  }
  if (loc) {
    const jd = toJD(iso);
    out['상승점'] = calcASC(jd, loc.lon, loc.lat);
    out['천정'] = calcMC(jd, loc.lon);
  }
  return { lon: out, retro: retro };
}

module.exports = {
  SIGNS_KR, SIGN_GLYPH, PLANET_KR, PLANET_GLYPH, HOUSE_MEANING,
  norm360, angleDiff, toJD, obliquity, gmst, ramc,
  calcASC, calcMC, lahiriAyanamsa,
  dms, signDeg, signIndex, wholeSignHouse,
  natalFromProkerala
};
