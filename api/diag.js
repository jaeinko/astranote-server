// ============================================================================
//  api/diag.js  —  임시 진단용 엔드포인트 (확인 끝나면 지우세요)
// ----------------------------------------------------------------------------
//  목적:
//   1) 지금 쓰는 planet-position(베딕/사이더리얼)이 상승점(Ascendant)을 주는가?
//   2) Prokerala에 서양(트로피컬) 전용 엔드포인트가 있는가? 있다면 정확한 경로는?
//   3) 두 방식의 좌표가 얼마나 다른가? (아야남샤 왕복이 정확한지 검증)
//
//  사용법 (브라우저 주소창에 그대로):
//   https://astranote-server.vercel.app/api/diag
//     → 기본 테스트값(1990-05-15 14:30, 서울)으로 실행
//   https://astranote-server.vercel.app/api/diag?datetime=1990-05-15T14:30:00%2B09:00&lat=37.5665&lon=126.9780
//     → 원하는 생년월일시/좌표로 실행 (재인님 본인 차트로 넣어보면 제일 확실)
//
//  ⚠️ Prokerala 크레딧이 몇 개 소모됩니다(진단이라 소량). 확인 후 파일 삭제 권장.
//  ⚠️ 인증정보는 코드에 안 넣습니다 — Vercel 환경변수(PROKERALA_CLIENT_ID/SECRET)를 그대로 씁니다.
// ============================================================================

const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

function signOf(lon) {
  if (typeof lon !== 'number' || isNaN(lon)) return null;
  const l = ((lon % 360) + 360) % 360;
  return { sign: SIGNS[Math.floor(l / 30)], deg: +(l % 30).toFixed(2), abs: +l.toFixed(2) };
}

// 응답 어디에 박혀 있든 Ascendant/행성 목록을 최대한 찾아내는 유연 파서
function findPlanetList(obj) {
  if (!obj || typeof obj !== 'object') return null;
  // 흔한 키 이름들을 순서대로 탐색
  const keys = ['planet_position', 'planet_positions', 'planets', 'output'];
  for (const k of keys) {
    if (Array.isArray(obj[k]) && obj[k].length) return obj[k];
    if (obj.data && Array.isArray(obj.data[k]) && obj.data[k].length) return obj.data[k];
  }
  // data 안에 한 겹 더 있을 수 있음
  if (obj.data) {
    const inner = findPlanetList(obj.data);
    if (inner) return inner;
  }
  return null;
}

// 행성 하나에서 이름과 경도(longitude)를 최대한 뽑아냄 (API마다 필드명이 다름)
function extractPlanet(p) {
  const name =
    (p.name && (p.name.en || p.name)) ||
    (p.planet && (p.planet.en || p.planet.name || p.planet)) ||
    p.planet_name || null;
  const lon =
    (typeof p.longitude === 'number' ? p.longitude : null) ??
    (typeof p.fullDegree === 'number' ? p.fullDegree : null) ??
    (typeof p.full_degree === 'number' ? p.full_degree : null) ??
    (p.position && typeof p.position.longitude === 'number' ? p.position.longitude : null);
  return { name, lon };
}

async function getToken(id, secret) {
  const r = await fetch('https://api.prokerala.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({ grant_type: 'client_credentials', client_id: id, client_secret: secret })
  });
  const text = await r.text();
  if (!r.ok) throw new Error(`토큰 실패 ${r.status}: ${text.slice(0, 300)}`);
  return JSON.parse(text).access_token;
}

// 한 엔드포인트를 호출해서 상태/원본/파싱결과를 요약
async function probe(label, url, token) {
  const out = { label, url, ok: false, status: null, ascendant: null, planets: [], rawSample: null, error: null };
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    out.status = r.status;
    const text = await r.text();
    out.ok = r.ok;
    if (!r.ok) { out.error = text.slice(0, 400); return out; }

    let json;
    try { json = JSON.parse(text); } catch { out.error = 'JSON 파싱 불가: ' + text.slice(0, 300); return out; }

    out.rawSample = JSON.stringify(json).slice(0, 700); // 원본 앞부분만 (구조 확인용)

    const list = findPlanetList(json);
    if (!list) { out.error = '행성 목록을 못 찾음 (구조가 예상과 다름)'; return out; }

    for (const p of list) {
      const { name, lon } = extractPlanet(p);
      if (!name) continue;
      const s = signOf(lon);
      const row = { name, lon, sign: s ? `${s.sign} ${s.deg}도` : '(경도없음)' };
      if (String(name).toLowerCase().includes('ascend') || name === 'Ascendant' || name === '상승점') {
        out.ascendant = row;
      }
      out.planets.push(row);
    }
  } catch (e) {
    out.error = e.message;
  }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');

  const ID = process.env.PROKERALA_CLIENT_ID;
  const SECRET = process.env.PROKERALA_CLIENT_SECRET;
  if (!ID || !SECRET) {
    return res.status(500).end(JSON.stringify({ error: 'PROKERALA_CLIENT_ID / SECRET 환경변수가 없습니다.' }, null, 2));
  }

  // 입력값 (없으면 기본 테스트 케이스: 1990-05-15 14:30 서울)
  const q = req.query || {};
  const datetime = q.datetime || '1990-05-15T14:30:00+09:00';
  const lat = q.lat || '37.5665';
  const lon = q.lon || '126.9780';
  const coords = `${lat},${lon}`;
  const dt = encodeURIComponent(datetime);

  const report = { input: { datetime, coordinates: coords }, checks: {} };

  try {
    const token = await getToken(ID, SECRET);
    report.tokenOk = true;

    // ---- (A) 지금 쓰는 방식: planet-position, ayanamsa=1 (라히리/사이더리얼) ----
    const currentUrl = `https://api.prokerala.com/v2/astrology/planet-position?datetime=${dt}&coordinates=${coords}&ayanamsa=1`;
    report.checks.current_sidereal = await probe('현재방식: planet-position (ayanamsa=1, 사이더리얼)', currentUrl, token);

    // ---- (B) 서양/트로피컬 후보 엔드포인트들을 순서대로 찔러본다 ----
    //   어느 게 되는지 status로 확인 → 되는 경로가 우리가 써야 할 정답 경로.
    const westernCandidates = [
      // ayanamsa=0 은 종종 트로피컬(춘분점 기준)을 의미
      ['planet-position ayanamsa=0(트로피컬?)', `https://api.prokerala.com/v2/astrology/planet-position?datetime=${dt}&coordinates=${coords}&ayanamsa=0`],
      ['natal-planet-position', `https://api.prokerala.com/v2/astrology/natal-planet-position?datetime=${dt}&coordinates=${coords}`],
      ['western/natal-chart', `https://api.prokerala.com/v2/astrology/natal-chart?datetime=${dt}&coordinates=${coords}`],
      ['western-chart', `https://api.prokerala.com/v2/astrology/western-chart?datetime=${dt}&coordinates=${coords}`],
      ['natal-aspect-chart', `https://api.prokerala.com/v2/astrology/natal-aspect-chart?datetime=${dt}&coordinates=${coords}`],
    ];

    report.checks.western_probes = [];
    for (const [label, url] of westernCandidates) {
      report.checks.western_probes.push(await probe(label, url, token));
    }

    // ---- (C) 요약: 사람이 바로 읽을 결론 ----
    const cur = report.checks.current_sidereal;
    const working = report.checks.western_probes.filter(p => p.ok);
    report.summary = {
      '① 현재 planet-position이 상승점(ASC)을 주는가': cur.ascendant ? `예 → ${cur.ascendant.sign}` : '아니오 (ASC 없음! 7하우스 해석이 스킵되고 있을 수 있음)',
      '② 현재 방식이 반환한 행성 수': cur.planets.length,
      '③ 작동하는 서양/트로피컬 엔드포인트': working.length ? working.map(p => `${p.label} (${p.status})`) : '없음 — 모두 실패 (아래 western_probes의 error 참고)',
      '④ 서양 엔드포인트 중 ASC 제공': (working.find(p => p.ascendant)?.label) || '없음',
    };

    return res.status(200).end(JSON.stringify(report, null, 2));
  } catch (e) {
    report.error = e.message;
    return res.status(500).end(JSON.stringify(report, null, 2));
  }
};
