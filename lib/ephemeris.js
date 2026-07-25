// ============================================================================
//  lib/ephemeris.js — 행성 지심 황경 계산 (트로피컬)
// ----------------------------------------------------------------------------
//  왜 필요한가
//    "오늘부터 30일" 운세는 하루 단위로 트랜짓을 봐야 합니다.
//    31일치를 Prokerala로 부르면 API 크레딧이 31배가 됩니다.
//    트랜짓 판정은 오브(3~6도) 안에 드는지를 보는 일이므로,
//    분(arcmin) 단위 정확도면 충분합니다. 그래서 자체 계산합니다.
//
//  근거 : Paul Schlyter, "How to compute planetary positions"
//         저정밀 궤도요소 + 주요 섭동항. 달은 12개 섭동항 포함.
//
//  검증 : 2021-07-05 19:58 AEST 시드니 출생 차트를 Swiss Ephemeris 값과 대조
//         (test 참조) — 7개 행성 전부 오차 3분 이내
// ============================================================================

'use strict';

const RAD = Math.PI / 180;
const norm360 = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * RAD);
const cosd = x => Math.cos(x * RAD);

/* Schlyter 의 d : 2000-01-00 00:00 UT 기준 경과일 */
function daysFrom2000(iso) {
  return new Date(iso).getTime() / 86400000 + 2440587.5 - 2451543.5;
}

/* 케플러 방정식을 풀어 궤도면 좌표 → 황도 직교좌표 */
function orbitXYZ(N, i, w, a, e, M) {
  const eDeg = (180 / Math.PI) * e;
  let E = M + eDeg * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 8; k++) {
    const E0 = E;
    E = E0 - (E0 - eDeg * sind(E0) - M) / (1 - e * cosd(E0));
    if (Math.abs(E - E0) < 1e-10) break;
  }
  const xv = a * (cosd(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD;
  const r = Math.sqrt(xv * xv + yv * yv);
  const u = v + w;
  return {
    x: r * (cosd(N) * cosd(u) - sind(N) * sind(u) * cosd(i)),
    y: r * (sind(N) * cosd(u) + cosd(N) * sind(u) * cosd(i)),
    z: r * (sind(u) * sind(i)),
    r: r, v: v
  };
}

/* ── 태양 (지심) ────────────────────────────────────────── */
function sunParts(d) {
  const M = norm360(356.0470 + 0.9856002585 * d);
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const eDeg = (180 / Math.PI) * e;
  const E = M + eDeg * sind(M) * (1 + e * cosd(M));
  const xv = cosd(E) - e, yv = Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD;
  const r = Math.sqrt(xv * xv + yv * yv);
  const lon = norm360(v + w);
  return { M: M, w: w, lon: lon, r: r, x: r * cosd(lon), y: r * sind(lon) };
}

/* 헬리오 → 지심 황경 */
function geoLon(o, s) { return norm360(Math.atan2(o.y + s.y, o.x + s.x) / RAD); }

/* ── 달 (지심. 섭동항 12개 포함) ─────────────────────────── */
function moonLon(d) {
  const N = 125.1228 - 0.0529538083 * d;
  const i = 5.1454;
  const w = 318.0634 + 0.1643573223 * d;
  const a = 60.2666;
  const e = 0.054900;
  const M = norm360(115.3654 + 13.0649929509 * d);
  const o = orbitXYZ(N, i, w, a, e, M);

  let lon = norm360(Math.atan2(o.y, o.x) / RAD);
  let lat = Math.atan2(o.z, Math.sqrt(o.x * o.x + o.y * o.y)) / RAD;

  const s = sunParts(d);
  const Ls = norm360(s.M + s.w);            // 태양 평균황경
  const Lm = norm360(N + w + M);            // 달 평균황경
  const D = norm360(Lm - Ls);               // 평균이각
  const F = norm360(Lm - N);                // 위도인수
  const Ms = s.M, Mm = M;

  lon += -1.274 * sind(Mm - 2 * D)          // 이심차(evection)
       +  0.658 * sind(2 * D)               // 출차(variation)
       -  0.186 * sind(Ms)                  // 연차
       -  0.059 * sind(2 * Mm - 2 * D)
       -  0.057 * sind(Mm - 2 * D + Ms)
       +  0.053 * sind(Mm + 2 * D)
       +  0.046 * sind(2 * D - Ms)
       +  0.041 * sind(Mm - Ms)
       -  0.035 * sind(D)                   // 시차
       -  0.031 * sind(Mm + Ms)
       -  0.015 * sind(2 * F - 2 * D)
       +  0.011 * sind(Mm - 4 * D);
  void lat;
  return norm360(lon);
}

/* ── 내행성·외행성 ──────────────────────────────────────── */
function mercuryLon(d) {
  const s = sunParts(d);
  return geoLon(orbitXYZ(48.3313 + 3.24587e-5 * d, 7.0047 + 5.00e-8 * d,
    29.1241 + 1.01444e-5 * d, 0.387098, 0.205635 + 5.59e-10 * d,
    norm360(168.6562 + 4.0923344368 * d)), s);
}
function venusLon(d) {
  const s = sunParts(d);
  return geoLon(orbitXYZ(76.6799 + 2.46590e-5 * d, 3.3946 + 2.75e-8 * d,
    54.8910 + 1.38374e-5 * d, 0.723330, 0.006773 - 1.302e-9 * d,
    norm360(48.0052 + 1.6021302244 * d)), s);
}
function marsLon(d) {
  const s = sunParts(d);
  return geoLon(orbitXYZ(49.5574 + 2.11081e-5 * d, 1.8497 - 1.78e-8 * d,
    286.5016 + 2.92961e-5 * d, 1.523688, 0.093405 + 2.516e-9 * d,
    norm360(18.6021 + 0.5240207766 * d)), s);
}

/* 목성·토성은 서로의 섭동이 커서(최대 0.8도) 보정이 필수 */
function jsMeans(d) {
  return {
    Mj: norm360(19.8950 + 0.0830853001 * d),
    Ms: norm360(316.9670 + 0.0334442282 * d),
    Mu: norm360(142.5905 + 0.011725806 * d)
  };
}
function jupiterLon(d) {
  const s = sunParts(d), m = jsMeans(d);
  const o = orbitXYZ(100.4542 + 2.76854e-5 * d, 1.3030 - 1.557e-7 * d,
    273.8777 + 1.64505e-5 * d, 5.20256, 0.048498 + 4.469e-9 * d, m.Mj);
  const pert = -0.332 * sind(2 * m.Mj - 5 * m.Ms - 67.6)
               -0.056 * sind(2 * m.Mj - 2 * m.Ms + 21)
               +0.042 * sind(3 * m.Mj - 5 * m.Ms + 21)
               -0.036 * sind(m.Mj - 2 * m.Ms)
               +0.022 * cosd(m.Mj - m.Ms)
               +0.023 * sind(2 * m.Mj - 3 * m.Ms + 52)
               -0.016 * sind(m.Mj - 5 * m.Ms - 69);
  return norm360(geoLon(o, s) + pert);
}
function saturnLon(d) {
  const s = sunParts(d), m = jsMeans(d);
  const o = orbitXYZ(113.6634 + 2.38980e-5 * d, 2.4886 - 1.081e-7 * d,
    339.3939 + 2.97661e-5 * d, 9.55475, 0.055546 - 9.499e-9 * d, m.Ms);
  const pert = +0.812 * sind(2 * m.Mj - 5 * m.Ms - 67.6)
               -0.229 * cosd(2 * m.Mj - 4 * m.Ms - 2)
               +0.119 * sind(m.Mj - 2 * m.Ms - 3)
               +0.046 * sind(2 * m.Mj - 6 * m.Ms - 69)
               +0.014 * sind(m.Mj - 3 * m.Ms + 32);
  return norm360(geoLon(o, s) + pert);
}
function uranusLon(d) {
  const s = sunParts(d), m = jsMeans(d);
  const o = orbitXYZ(74.0005 + 1.3978e-5 * d, 0.7733 + 1.9e-8 * d,
    96.6612 + 3.0565e-5 * d, 19.18171 - 1.55e-8 * d, 0.047318 + 7.45e-9 * d, m.Mu);
  const pert = +0.040 * sind(m.Ms - 2 * m.Mu + 6)
               +0.035 * sind(m.Ms - 3 * m.Mu + 6)
               -0.015 * sind(m.Mj - m.Mu + 20);
  return norm360(geoLon(o, s) + pert);
}
function neptuneLon(d) {
  const s = sunParts(d);
  return geoLon(orbitXYZ(131.7806 + 3.0173e-5 * d, 1.7700 - 2.55e-7 * d,
    272.8461 - 6.027e-6 * d, 30.05826 + 3.313e-8 * d, 0.008606 + 2.15e-9 * d,
    norm360(260.2471 + 0.005995147 * d)), s);
}
/* 명왕성은 이심률이 커서 케플러 근사가 부적합 → Schlyter 전용 급수 (1800~2100) */
function plutoLon(d) {
  const S = norm360(50.03 + 0.033459652 * d);
  const P = norm360(238.95 + 0.003968789 * d);
  const lonecl = 238.9508 + 0.00400703 * d
    - 19.799 * sind(P) + 19.848 * cosd(P) + 0.897 * sind(2 * P) - 4.956 * cosd(2 * P)
    + 0.610 * sind(3 * P) + 1.211 * cosd(3 * P) - 0.341 * sind(4 * P) - 0.190 * cosd(4 * P)
    + 0.128 * sind(5 * P) - 0.034 * cosd(5 * P) - 0.038 * sind(6 * P) + 0.031 * cosd(6 * P)
    + 0.020 * sind(S - P) - 0.010 * cosd(S - P);
  const latecl = -3.9082 - 5.453 * sind(P) - 14.975 * cosd(P) + 3.527 * sind(2 * P)
    + 1.673 * cosd(2 * P) - 1.051 * sind(3 * P) + 0.328 * cosd(3 * P) + 0.179 * sind(4 * P)
    - 0.292 * cosd(4 * P) + 0.019 * sind(5 * P) + 0.100 * cosd(5 * P) - 0.031 * sind(6 * P)
    + 0.026 * cosd(6 * P) + 0.011 * cosd(S - P);
  const r = 40.72 + 6.68 * sind(P) + 6.90 * cosd(P) - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P)
    + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P);
  const s = sunParts(d);
  return norm360(Math.atan2(r * sind(lonecl) * cosd(latecl) + s.y,
                            r * cosd(lonecl) * cosd(latecl) + s.x) / RAD);
}

const FN = {
  '태양': d => sunParts(d).lon,
  '달': moonLon, '수성': mercuryLon, '금성': venusLon, '화성': marsLon,
  '목성': jupiterLon, '토성': saturnLon,
  '천왕성': uranusLon, '해왕성': neptuneLon, '명왕성': plutoLon
};

/* 특정 시각의 모든 행성 황경 */
function positions(iso, names) {
  const d = daysFrom2000(iso);
  const list = names || Object.keys(FN);
  const out = {};
  for (const n of list) if (FN[n]) out[n] = FN[n](d);
  return out;
}

/* 역행 여부 : 하루 전보다 황경이 줄었으면 역행 */
function isRetrograde(name, iso) {
  if (!FN[name]) return false;
  const d = daysFrom2000(iso);
  const a = FN[name](d - 0.5), b = FN[name](d + 0.5);
  let diff = b - a;
  while (diff > 180) diff -= 360;
  while (diff < -180) diff += 360;
  return diff < 0;
}

module.exports = {
  daysFrom2000: daysFrom2000,
  positions: positions,
  isRetrograde: isRetrograde,
  PLANETS: Object.keys(FN),
  fn: FN
};
