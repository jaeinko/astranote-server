// ============================================================================
//  api/diag2.js  —  진단 2차 (서양/트로피컬 엔드포인트 정확히 찾기)
// ----------------------------------------------------------------------------
//  1차 진단에서 알아낸 것:
//   - 400 에러가 파라미터를 profile[datetime] / profile[coordinates] 형식으로
//     달라고 알려줌 (경로는 존재한다는 뜻!)
//   - ayanamsa 허용값은 1,3,5,45 뿐 → planet-position은 베딕 전용 확정
//
//  이 스크립트는 올바른 파라미터 형식으로 서양 후보 엔드포인트를 다시 찔러본다.
//  목표: 트로피컬 좌표(+ASC)를 직접 주는 엔드포인트의 정확한 경로 확정.
//
//  사용법:
//   https://astranote-server.vercel.app/api/diag2
//   https://astranote-server.vercel.app/api/diag2?datetime=1990-05-15T14:30:00%2B09:00&lat=37.5665&lon=126.9780
// ============================================================================

const SIGNS = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
function signOf(lon) {
  if (typeof lon !== 'number' || isNaN(lon)) return null;
  const l = ((lon % 360) + 360) % 360;
  return `${SIGNS[Math.floor(l / 30)]} ${(l % 30).toFixed(2)}도`;
}
function findPlanetList(obj) {
  if (!obj || typeof obj !== 'object') return null;
  const keys = ['planet_position', 'planet_positions', 'planets', 'output'];
  for (const k of keys) {
    if (Array.isArray(obj[k]) && obj[k].length) return obj[k];
    if (obj.data && Array.isArray(obj.data[k]) && obj.data[k].length) return obj.data[k];
  }
  if (obj.data) return findPlanetList(obj.data);
  return null;
}
function extractPlanet(p) {
  const name = (p.name && (p.name.en || p.name)) || (p.planet && (p.planet.en || p.planet.name || p.planet)) || p.planet_name || null;
  let lon = null;
  if (typeof p.longitude === 'number') lon = p.longitude;
  else if (typeof p.fullDegree === 'number') lon = p.fullDegree;
  else if (typeof p.full_degree === 'number') lon = p.full_degree;
  else if (p.position && typeof p.position.longitude === 'number') lon = p.position.longitude;
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

async function probe(label, url, token) {
  const out = { label, url, ok: false, status: null, ascendant: null, planetCount: 0, sunSign: null, rawSample: null, error: null };
  try {
    const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
    out.status = r.status;
    const text = await r.text();
    out.ok = r.ok;
    if (!r.ok) { out.error = text.slice(0, 500); return out; }
    let json;
    try { json = JSON.parse(text); } catch { out.error = 'JSON 파싱불가: ' + text.slice(0, 300); return out; }
    out.rawSample = JSON.stringify(json).slice(0, 900);
    const list = findPlanetList(json);
    if (!list) { out.error = '행성목록 못찾음 (구조 다름) — rawSample 확인'; return out; }
    for (const p of list) {
      const { name, lon } = extractPlanet(p);
      if (!name) continue;
      out.planetCount++;
      const nm = String(name).toLowerCase();
      if (nm.includes('ascend')) out.ascendant = `${name}: ${signOf(lon)} (경도 ${lon})`;
      if (nm === 'sun') out.sunSign = `${signOf(lon)} (경도 ${lon})`;
    }
  } catch (e) { out.error = e.message; }
  return out;
}

module.exports = async (req, res) => {
  res.setHeader('Content-Type', 'application/json; charset=utf-8');
  const ID = process.env.PROKERALA_CLIENT_ID, SECRET = process.env.PROKERALA_CLIENT_SECRET;
  if (!ID || !SECRET) return res.status(500).end(JSON.stringify({ error: '환경변수 없음' }, null, 2));

  const q = req.query || {};
  const datetime = q.datetime || '1990-05-15T14:30:00+09:00';
  const lat = q.lat || '37.5665', lon = q.lon || '126.9780';
  const coords = `${lat},${lon}`;
  const dt = encodeURIComponent(datetime);
  const co = encodeURIComponent(coords);

  const report = { input: { datetime, coordinates: coords }, note: '', checks: [] };

  try {
    const token = await getToken(ID, SECRET);

    // profile[datetime] 형식으로 서양 후보들을 다시 시도.
    // house_system, orb 등은 서양 차트에 흔히 필요할 수 있어 함께 넣어본다.
    const base = `profile[datetime]=${dt}&profile[coordinates]=${co}`;
    const candidates = [
      ['natal-planet-position (profile형식)', `https://api.prokerala.com/v2/astrology/natal-planet-position?${base}&house_system=placidus&orb=default&birth_time_rectification=flat-chart&aspect_filter=all&la=en&ayanamsa=0`],
      ['natal-planet-position (최소파라미터)', `https://api.prokerala.com/v2/astrology/natal-planet-position?${base}&ayanamsa=0`],
      ['natal-chart (profile형식)', `https://api.prokerala.com/v2/astrology/natal-chart?${base}&house_system=placidus&chart_type=western&chart_style=western&format=json&la=en&ayanamsa=0`],
      ['natal-aspect-chart (profile형식)', `https://api.prokerala.com/v2/astrology/natal-aspect-chart?${base}&house_system=placidus&la=en&ayanamsa=0`],
      ['natal-planet-position (ayanamsa 없이)', `https://api.prokerala.com/v2/astrology/natal-planet-position?${base}`],
    ];

    for (const [label, url] of candidates) {
      report.checks.push(await probe(label, url, token));
    }

    const working = report.checks.filter(c => c.ok);
    report.summary = {
      '작동한 엔드포인트': working.length ? working.map(c => `${c.label} [status ${c.status}]`) : '없음 (아래 각 error 확인)',
      '트로피컬 태양 위치 (성공한 것)': working.map(c => c.sunSign).find(Boolean) || '없음',
      '상승점 (성공한 것)': working.map(c => c.ascendant).find(Boolean) || '없음',
      '해석 힌트': '트로피컬이면 태양이 황소 24도 근처여야 함(1990-05-15 기준). 사이더리얼이면 황소 0도 근처.',
    };

    return res.status(200).end(JSON.stringify(report, null, 2));
  } catch (e) {
    report.error = e.message;
    return res.status(500).end(JSON.stringify(report, null, 2));
  }
};
