// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출
// ✅ 인생 전체 풀이 + 연령대별 운세 점수표 추가 버전

const { kv } = require('@vercel/kv');

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return await fn(req, res);
};

const cityCoordinates = {
  "Seoul": { lat: 37.5665, lon: 126.9780 }, "Busan": { lat: 35.1796, lon: 129.0756 },
  "Daegu": { lat: 35.8714, lon: 128.6014 }, "Incheon": { lat: 37.4563, lon: 126.7052 },
  "Gwangju": { lat: 35.1595, lon: 126.8526 }, "Daejeon": { lat: 36.3504, lon: 127.3845 },
  "Ulsan": { lat: 35.5384, lon: 129.3114 }, "Sejong": { lat: 36.4800, lon: 127.2890 },
  "Suwon": { lat: 37.2636, lon: 127.0286 }, "Seongnam": { lat: 37.4200, lon: 127.1265 },
  "Goyang": { lat: 37.6584, lon: 126.8320 }, "Yongin": { lat: 37.2411, lon: 127.1776 },
  "Bucheon": { lat: 37.5034, lon: 126.7660 }, "Ansan": { lat: 37.3219, lon: 126.8309 },
  "Anyang": { lat: 37.3943, lon: 126.9568 }, "Namyangju": { lat: 37.6360, lon: 127.2165 },
  "Hwaseong": { lat: 37.1995, lon: 126.8310 }, "Pyeongtaek": { lat: 36.9921, lon: 127.1129 },
  "Paju": { lat: 37.7599, lon: 126.7802 }, "Gimpo": { lat: 37.6152, lon: 126.7156 },
  "Uijeongbu": { lat: 37.7381, lon: 127.0338 }, "GyeonggiEtc": { lat: 37.4138, lon: 127.5183 },
  "Chuncheon": { lat: 37.8813, lon: 127.7298 }, "Wonju": { lat: 37.3422, lon: 127.9202 },
  "Gangneung": { lat: 37.7519, lon: 128.8761 }, "Sokcho": { lat: 38.2070, lon: 128.5918 },
  "GangwonEtc": { lat: 37.8228, lon: 128.1555 },
  "Cheongju": { lat: 36.6424, lon: 127.4890 }, "Cheonan": { lat: 36.8151, lon: 127.1139 },
  "Chungju": { lat: 36.9910, lon: 127.9259 }, "ChungcheongEtc": { lat: 36.6357, lon: 127.4914 },
  "Jeonju": { lat: 35.8242, lon: 127.1480 }, "Iksan": { lat: 35.9483, lon: 126.9577 },
  "Gunsan": { lat: 35.9676, lon: 126.7369 }, "Yeosu": { lat: 34.7604, lon: 127.6622 },
  "Suncheon": { lat: 34.9506, lon: 127.4872 }, "Mokpo": { lat: 34.8118, lon: 126.3922 },
  "JeollaEtc": { lat: 35.3160, lon: 126.9880 },
  "Changwon": { lat: 35.2280, lon: 128.6811 }, "Pohang": { lat: 36.0190, lon: 129.3435 },
  "Gimhae": { lat: 35.2285, lon: 128.8894 }, "Gumi": { lat: 36.1195, lon: 128.3446 },
  "Gyeongju": { lat: 35.8562, lon: 129.2247 }, "Jinju": { lat: 35.1800, lon: 128.1076 },
  "Andong": { lat: 36.5684, lon: 128.7294 }, "Yangsan": { lat: 35.3350, lon: 129.0378 },
  "GyeongsangEtc": { lat: 35.8714, lon: 128.6014 },
  "Jeju": { lat: 33.4996, lon: 126.5312 }, "Seogwipo": { lat: 33.2541, lon: 126.5601 },
  "NewYork": { lat: 40.7128, lon: -74.0060 }, "LosAngeles": { lat: 34.0522, lon: -118.2437 },
  "Chicago": { lat: 41.8781, lon: -87.6298 }, "Toronto": { lat: 43.6510, lon: -79.3470 },
  "Vancouver": { lat: 49.2827, lon: -123.1207 }, "MexicoCity": { lat: 19.4326, lon: -99.1332 },
  "SaoPaulo": { lat: -23.5505, lon: -46.6333 },
  "London": { lat: 51.5074, lon: -0.1278 }, "Paris": { lat: 48.8566, lon: 2.3522 },
  "Berlin": { lat: 52.5200, lon: 13.4050 }, "Frankfurt": { lat: 50.1109, lon: 8.6821 },
  "Rome": { lat: 41.9028, lon: 12.4964 }, "Madrid": { lat: 40.4168, lon: -3.7038 },
  "Tokyo": { lat: 35.6895, lon: 139.6917 }, "Beijing": { lat: 39.9042, lon: 116.4074 },
  "Shanghai": { lat: 31.2304, lon: 121.4737 }, "HongKong": { lat: 22.3193, lon: 114.1694 },
  "Singapore": { lat: 1.3521, lon: 103.8198 }, "Bangkok": { lat: 13.7563, lon: 100.5018 },
  "Manila": { lat: 14.5995, lon: 120.9842 },
  "Sydney": { lat: -33.8688, lon: 151.2093 }, "Melbourne": { lat: -37.8136, lon: 144.9631 },
  "Auckland": { lat: -36.8485, lon: 174.7633 }, "Overseas": { lat: 0, lon: 0 }
};


// ===== 🔬 차트 정밀 다이제스트 =====
// Prokerala의 베딕(사이더리얼) 좌표를 서양 점성술(트로피컬)로 보정하고,
// AI가 바로 이해할 수 있는 한국어 요약으로 변환합니다. 이게 리포트 품질의 핵심입니다.
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점' };

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000); // 라히리 아야남샤 근사치
}
function signDeg(lon) {
  const l = ((lon % 360) + 360) % 360;
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}
function buildChartDigest(data, dateTimeIso) {
  try {
    const list = data.planet_position || data.planet_positions || [];
    if (!list.length) return null;
    const ay = lahiriAyanamsa(dateTimeIso);
    const planets = {};
    for (const p of list) {
      const nameKr = PLANET_KR[p.name];
      if (!nameKr || typeof p.longitude !== 'number') continue;
      planets[nameKr] = signDeg(p.longitude + ay); // 사이더리얼 → 트로피컬 보정
    }
    const asc = planets['상승점'];
    const lines = [];
    if (asc) {
      const dsc = signDeg(asc.abs + 180);
      lines.push(`상승점(ASC): ${asc.sign} ${asc.deg}도`);
      lines.push(`7하우스(배우자궁) 시작점: ${dsc.sign} ${dsc.deg}도 ← 배우자 해석의 최우선 근거`);

      // 🪐 실제 계산된 목성 트랜짓 (사람마다 달라야 하는 만남 시기의 유일한 근거)
      const jupiterWindows = findJupiterTransitWindows(dsc.abs);
      // 🚨 안전장치: 결과가 비었거나 undefined가 섞이면 '없음'으로 처리 (리포트에 undefined 노출 방지)
      const validWindows = (jupiterWindows || []).filter(function(w) {
        return typeof w === 'string' && w.length > 0 && w.indexOf('undefined') === -1;
      });
      if (validWindows.length > 0) {
        lines.push(`\n[실제 계산된 목성 트랜짓 - 이 시기만 만남 시기로 사용하라]`);
        validWindows.forEach((w, i) => lines.push((i+1) + '순위 시기: ' + w));
      } else {
        lines.push(`\n[실제 계산 결과] 향후 8년간(~2034년) 목성이 배우자궁과 뚜렷한 각을 맺는 시기가 없다. 이 경우 만남 시기를 단정하지 말고, "현재는 특별히 두드러진 트랜짓이 없어 시기보다 태도와 만남의 자리를 넓히는 데 집중할 시점"이라고 정직하게 안내하라. 없는 시기를 지어내지 마라.`);
      }
    }
    // 하우스별 인생 영역 의미 (리포트 깊이의 핵심 재료)
    const HOUSE_MEANING = {
      1: '자아·타고난 기질·첫인상',
      2: '돈·자존감·타고난 재능',
      3: '소통·형제자매·초년 학습환경',
      4: '부모·가정·뿌리·마음의 안식처',
      5: '연애·자녀·창조성·즐거움',
      6: '일상·건강·직장생활·성실함',
      7: '배우자·결혼·1:1 관계 ★핵심',
      8: '깊은 결속·상처·타인의 자원·변형',
      9: '배움·여행·먼 곳·신념',
      10: '커리어·사회적 지위·명예',
      11: '인간관계·인맥·꿈과 소망',
      12: '무의식·숨겨진 상처·혼자만의 세계'
    };

    const houseMap = {};  // 하우스별 행성 모음 (스텔리움 탐지용)
    for (const n of ['태양','달','수성','금성','화성','목성','토성']) {
      if (!planets[n]) continue;
      let houseTxt = '';
      if (asc) {
        const h = Math.floor((((planets[n].abs - asc.abs) + 360) % 360) / 30) + 1;
        houseMap[h] = houseMap[h] || [];
        houseMap[h].push(n);
        houseTxt = ` (${h}하우스 = ${HOUSE_MEANING[h]}${h === 7 ? ' ★배우자궁 안! 최우선 근거' : ''})`;
      }
      lines.push(`${n}: ${planets[n].sign} ${planets[n].deg}도${houseTxt}`);
    }

    // 🔬 이 사람만의 '특이 배치' 자동 탐지 → AI가 중심 스토리로 삼을 재료
    const highlights = [];
    for (const [h, ps] of Object.entries(houseMap)) {
      if (ps.length >= 2) {
        highlights.push(`【스텔리움】 ${h}하우스(${HOUSE_MEANING[h]})에 ${ps.join('·')} ${ps.length}개가 몰려 있다 → 이 사람 인생의 최대 화두. 반드시 깊게 다뤄라.`);
      }
    }
    if (houseMap[7]) highlights.push(`【배우자궁의 행성】 7하우스 안에 ${houseMap[7].join('·')}이 있다 → 배우자 해석의 결정적 단서.`);
    if (houseMap[12]) highlights.push(`【숨겨진 상처】 12하우스에 ${houseMap[12].join('·')}이 있다 → 남에게 말 못 한 감정·억눌린 패턴이 있다. 이걸 짚으면 소름 돋는다.`);
    if (houseMap[4]) highlights.push(`【부모·뿌리】 4하우스에 ${houseMap[4].join('·')}이 있다 → 가정환경과 부모와의 관계가 이 사람 성격 형성에 결정적이었다.`);
    if (houseMap[11]) highlights.push(`【인간관계】 11하우스에 ${houseMap[11].join('·')}이 있다 → 인맥·모임·친구 관계가 인생에서 큰 비중을 차지한다.`);
    if (houseMap[8]) highlights.push(`【깊은 상처와 변형】 8하우스에 ${houseMap[8].join('·')}이 있다 → 얕은 관계로는 만족 못 하는 사람. 깊은 결속을 갈망한다.`);

    if (highlights.length) {
      lines.push('\n[🔬 이 사람만의 특이 배치 - 중심 스토리로 반드시 활용하라]');
      highlights.forEach(h => lines.push(h));
    }
    // 🔮 전생/영혼의 과제 (달의 교점)
    try {
      const nnLon = calcNorthNode(dateTimeIso);
      const nn = signDeg(nnLon);
      const sn = signDeg(nnLon + 180);
      const meaning = NODE_MEANING[nn.sign];
      lines.push('\n[🔮 전생과 영혼의 과제 - 달의 교점]');
      lines.push(`사우스노드(전생에 통달한 것): ${sn.sign} ${sn.deg}도`);
      lines.push(`노스노드(이번 생의 과제): ${nn.sign} ${nn.deg}도`);
      if (meaning) {
        lines.push(`→ 전생의 익숙한 패턴: ${meaning.south}`);
        lines.push(`→ 이번 생에 반드시 배워야 할 것: ${meaning.north}`);
      }
      if (asc) {
        const nh = Math.floor((((nnLon - asc.abs) + 360) % 360) / 30) + 1;
        const sh = ((nh + 5) % 12) + 1;
        lines.push(`노스노드가 ${nh}하우스, 사우스노드가 ${sh}하우스에 있다 → 이번 생의 성장은 ${nh}하우스 영역에서 일어난다.`);
      }
    } catch (e) {}

    return lines.join('\n');
  } catch (e) { return null; }
}


// ===== 🪐 실제 목성 트랜짓 계산 (2026.08 ~ 2034.12, 매달) =====
// 사람마다 배우자궁을 지나는 진짜 시기가 다르도록, 실제 천문 계산값을 표로 저장해두고 조회한다.
// 이렇게 해야 모든 손님의 만남 시기가 2026~2028로 획일화되는 문제가 사라진다.
const JUPITER_TABLE_START = { year: 2026, month: 8 };
const JUPITER_LON_TABLE = [126.96,133.7,139.59,144.32,146.79,146.44,143.35,139.75,137.23,137.49,140.41,145.13,151.2,157.84,164.27,170.28,174.81,177.31,176.9,174.08,170.18,167.79,168.03,170.79,175.57,181.59,187.99,194.6,200.38,204.96,207.28,206.89,203.95,200.22,197.76,197.94,200.73,205.53,211.39,218.07,224.54,230.57,235.17,237.39,237.11,234.33,230.5,228.06,228.19,231.01,235.72,241.9,248.52,255.37,261.56,265.92,268.66,268.61,265.9,262.17,259.5,259.53,262.23,267.17,273.31,280.36,287.44,293.49,298.64,301.6,301.9,299.51,295.63,292.76,292.59,295.31,300.16,306.66,313.91,320.52,327.3,332.71,336.34,337.28,335.32,331.47,328.28,327.59,329.89,334.74,341.23,347.82,355.28,2.1,8.1,12.22,13.94,12.61,9.06,5.35,4.03];

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function findJupiterTransitWindows(targetDeg) {
  // 여러 각도를 모두 수집한 뒤 시간순 정렬 → 가까운 미래부터 제시
  const aspects = [
    { name: '합 · 강력', angle: 0, orb: 6, weight: 3 },
    { name: '삼각 · 우호적', angle: 120, orb: 5, weight: 2 },
    { name: '삼각 · 우호적', angle: 240, orb: 5, weight: 2 },
    { name: '육각 · 기회', angle: 60, orb: 4, weight: 1 },
    { name: '육각 · 기회', angle: 300, orb: 4, weight: 1 }
  ];

  const all = [];
  for (const asp of aspects) {
    let inWindow = false;
    let windowStart = null;
    for (let i = 0; i < JUPITER_LON_TABLE.length; i++) {
      const diff = angleDiff(JUPITER_LON_TABLE[i], (targetDeg + asp.angle) % 360);
      const within = diff <= asp.orb;
      if (within && !inWindow) { inWindow = true; windowStart = i; }
      if (!within && inWindow) {
        inWindow = false;
        all.push({ start: windowStart, end: i - 1, name: asp.name, weight: asp.weight });
      }
    }
    if (inWindow) {
      all.push({ start: windowStart, end: JUPITER_LON_TABLE.length - 1, name: asp.name, weight: asp.weight });
    }
  }

  if (all.length === 0) return null;

  // 시간순 정렬 (가까운 미래부터)
  all.sort(function(a, b) { return a.start - b.start; });

  return all.slice(0, 3).map(function(w) {
    const sy = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + w.start) / 12);
    const sm = ((JUPITER_TABLE_START.month - 1 + w.start) % 12) + 1;
    const ey = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + w.end) / 12);
    const em = ((JUPITER_TABLE_START.month - 1 + w.end) % 12) + 1;
    const period = (sy === ey)
      ? sy + '년 ' + sm + '월~' + em + '월'
      : sy + '년 ' + sm + '월 ~ ' + ey + '년 ' + em + '월';
    return period + ' (목성 ' + w.name + ')';
  });
}


// ===== 🔮 전생/영혼의 과제: 달의 교점(Lunar Nodes) 계산 =====
// 사우스노드 = 전생에 통달한 것(자꾸 도망치는 익숙한 습관)
// 노스노드 = 이번 생에 배워야 할 것(불편하지만 성장이 있는 방향)
function calcNorthNode(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const jd = (d.getTime() / 86400000) + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  let omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000;
  return ((omega % 360) + 360) % 360;
}

const NODE_MEANING = {
  '양자리': { south: '남을 위해 자신을 지우고 맞춰주는 삶', north: '내 뜻대로 결단하고 앞장서는 용기' },
  '황소자리': { south: '남의 자원과 감정에 얽혀 소모되는 삶', north: '내 힘으로 안정과 가치를 쌓는 뚝심' },
  '쌍둥이자리': { south: '큰 신념에만 기대어 세부를 놓치는 삶', north: '눈앞의 사람과 소통하고 배우는 유연함' },
  '게자리': { south: '성취와 지위에만 매달려 자신을 몰아붙인 삶', north: '감정을 돌보고 진짜 내 편을 만드는 것' },
  '사자자리': { south: '집단과 이상 뒤에 숨어 나를 드러내지 않은 삶', north: '나 자신으로 당당히 빛나고 사랑받는 것' },
  '처녀자리': { south: '희생과 환상에 빠져 현실을 놓친 삶', north: '성실한 실천과 구체적 쓸모로 세상에 기여' },
  '천칭자리': { south: '혼자 다 짊어지고 독립만 고집한 삶', north: '기대고 협력하며 진짜 관계를 맺는 것' },
  '전갈자리': { south: '안전한 것만 붙잡고 변화를 피한 삶', north: '깊이 파고들고 함께 변화를 감당하는 용기' },
  '사수자리': { south: '눈앞의 정보와 잡담에 흩어진 삶', north: '더 큰 의미와 진리를 향해 나아가는 것' },
  '염소자리': { south: '가족과 안전지대에 머물러 안주한 삶', north: '세상에 나가 내 이름으로 성취하는 것' },
  '물병자리': { south: '주목받고 인정받는 데 집착한 삶', north: '나를 넘어 더 큰 공동체에 기여하는 것' },
  '물고기자리': { south: '통제와 완벽주의로 자신을 옥죈 삶', north: '내려놓고 흐름을 믿으며 연민을 배우는 것' }
};

const handler = async (req, res) => {
  // 🚨 [다시보기 기능] GET + orderId → 저장된 VIP 리포트 즉시 조회
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(`vip-report:${orderId}`);
      if (saved) return res.status(200).json(saved);
      return res.status(404).json({ error: '저장된 리포트 없음' });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log("✅ [1] gemini-vip.js 진입 성공");

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;

    if (!name || !date || !time) {
      return res.status(400).json({ error: '필수 입력값 누락' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수 없음' });
    }

    const location = cityCoordinates[city] || cityCoordinates["Seoul"];
    const dateTimeIso = `${date.replace(/\./g, '-')}T${time}:00+09:00`;

    let astrologyDataText = "정밀 천체 궤도 역산 데이터 기반.";
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
        const tokenResponse = await fetch('https://api.prokerala.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.PROKERALA_CLIENT_ID, client_secret: process.env.PROKERALA_CLIENT_SECRET })
        });
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const astroResponse = await fetch(
            `https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`,
            { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
          );
          if (astroResponse.ok) {
            const astroJson = await astroResponse.json();
            const digest = buildChartDigest(astroJson.data, dateTimeIso);
            astrologyDataText = digest || JSON.stringify(astroJson.data);
            console.log("📊 차트 다이제스트:\n" + astrologyDataText);
          }
        }
      }
    } catch (e) { console.log("⚠️ Prokerala Fallback (VIP):", e.message); }

    console.log("✅ [2] Prokerala 완료, Gemini VIP 호출 시작");

    // 🚨 오늘 날짜를 명시해서 AI가 과거 연도를 쓰는 버그 차단
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `
[🚨🚨 절대 금지 - 최우선]
'undefined', 'null', 'NaN', '트랜짓 항목', '데이터에 없음' 같은 개발자/시스템 용어를 리포트 본문에 절대 쓰지 마라.
손님은 일반인이다. 시스템 내부 사정을 손님에게 설명하지 마라. 만약 어떤 정보가 계산되지 않았다면, 그 사실을 언급하지 말고 자연스럽게 다른 근거로 서술하라.

[🚨 시간 기준 - 최우선 규칙]
오늘은 ${todayStr}이다. 너의 학습 데이터 기준 연도가 아니라 이 날짜가 진짜 현재다.
만남/기회/운이 열리는 시기 등 모든 미래 예측 시기는 반드시 오늘(${todayStr}) 이후의 연도와 월로만 써라.
과거 연도(예: 2024년, 2025년 상반기 등 이미 지난 시기)를 미래 시기로 쓰면 치명적인 실패다.

너는 30년간 수많은 사람의 인생을 지켜봐온, 서양 점성술 대가이자 인생 상담가야.
지금 네 앞에는 ${name}님이 앉아있어. 이 사람은 삼십만원짜리 인생 리포트를 받으러 온 소중한 손님이야.
네 임무는, 이 사람이 다 읽고 나서 "누군가 드디어 내 인생을 온전히 이해해줬다"며 울컥하게 만드는 거야.

[가장 중요한 원칙]
이 리포트는 따로 노는 글이 아니라, 하나로 이어지는 '인생 이야기'여야 해.
1편에서 상처를 어루만지고 → 2편에서 그 상처가 실은 재능이었다고 뒤집어주고 → 3편에서 앞으로 나아갈 길과 타이밍을 밝혀주고 → 4편에서 전생부터 이어진 영혼의 과제로 모든 것을 꿰뚫어 납득시키고 → 마지막으로 인생 전체의 흐름을 조망하는,
한 편의 영화처럼 감정이 흐르게 써라. 앞 챕터에서 한 말이 뒷 챕터에서 자연스럽게 이어져야 한다.

[정밀 계산된 네이탈 차트 - 트로피컬(서양식) 기준]\n${astrologyDataText}\n위 좌표는 실제 천체 계산 결과다. 반드시 이 데이터의 별자리/도수/하우스를 그대로 인용하고, 없는 배치를 지어내지 마라.
[손님 정보] 이름: ${name} / 성별: ${myGender} / 출생지: ${city} / 생년월일시: ${date} ${time}


[중심 서사 규칙 - 리포트 품질의 생명]
위 차트에서 이 사람의 인생·상처·재능과 가장 관련 깊은 강력한 배치 1~2개를 골라라 (우선순위: ① 달/토성의 위치 → ② 12하우스나 8하우스의 행성 → ③ 태양의 위치).
그 배치 하나를 리포트 전체를 관통하는 '중심 스토리'로 삼아, 세 챕터가 하나의 인생 이야기로 이어지게 하라.

[문체 기준 - 반드시 이 수준으로]
좋은 예: "<b>${name}님의 차트에는 금성·화성·토성 세 별이 전부 12하우스, 숨겨진 방에 몰려 있습니다.</b> 좋아하는 사람이 생겨도 티를 내지 못하고, 힘들어도 괜찮다는 말로 덮어온 것은 성격이 아니라 이 배치가 만든 오래된 습관입니다."
나쁜 예(절대 금지): "힘드셨을 겁니다", "긍정적으로 생각하세요", "좋은 일이 있을 겁니다" 같은 하나마나한 덕담 / "~일 수 있습니다" 발뺌 화법 / 근거 없는 위로.

[글 쓰는 방식 - 꼭 지켜]
1. 🚨 [차트 근거 필수] 각 챕터마다 최소 1번, 해석을 말하기 전에 반드시 차트상의 근거를 먼저 밝혀라.
   형식: "<b>${name}님의 차트를 보면, 달이 OO자리 OO도에 자리하고 있습니다.</b> 이것이 말해주는 것은..." 처럼
   [차트 근거] → [해석] 순서로 써라. 위의 [실제 데이터]에 담긴 실제 행성 위치를 읽고 인용해라. 지어내지 마라.
   단, 근거는 챕터당 1~2개만 굵고 명확하게. 용어를 줄줄이 나열하며 어렵게 만들지 마라.
2. 근거를 댄 후의 설명은 사람 마음에 닿는 쉬운 말로 풀어라. "${name}님은~" 하고 이름을 직접 부르며, 눈을 마주보고 이야기하듯 따뜻하게.
3. 뭉뚱그리지 마라. "힘드셨을 거예요"(X) → "당신은 정작 당신이 힘들 때 아무에게도 기대지 못하고 혼자 삼켜왔습니다"(O)처럼 콕 집어서 마음을 읽어줘라.
4. 위로만 하고 끝내지 마라. 반드시 희망과 구체적인 방향을 함께 줘라.
5. 강조할 문장은 <b> 태그로. 마크다운(*) 절대 금지.
6. vip_card1~3은 각 최소 1000자 이상, 깊이 있고 풍성하게.
7. 결과는 순수 JSON 객체로만 출력. 앞뒤에 아무것도 붙이지 마.

[🚨 연령대별 운세 점수 - 매우 중요]
${name}님의 차트를 근거로 20대/30대/40대/50대/60대/70대 각 시기의 운세를 100점 만점으로 평가하라.
- 점수는 시기마다 뚜렷하게 차이 나게 매겨라 (전부 비슷한 점수 금지. 최저와 최고가 20점 이상 차이 나야 함).
- 각 시기마다 그 점수의 이유를 한두 문장으로: 무엇이 열리고 무엇을 조심해야 하는지.
- 가장 점수 높은 시기가 '인생의 황금기'다. best_age에 그 시기를 적어라.
- 손님의 생년월일(${date})을 보고 이미 지난 시기는 "그 시절 어떤 씨앗이 뿌려졌는지" 관점으로, 앞으로 올 시기는 "무엇이 기다리는지" 관점으로 써라.

[출력 JSON 형식]
{
  "vip_card1": "(최소 1000자) [CHAPTER 01. 그동안, 얼마나 외로우셨어요] 먼저 ${name}님의 달/토성 위치를 차트 근거로 밝히고, 그로부터 지금까지 삶에서 남몰래 견뎌온 외로움과 상처를 깊이 알아주고 위로하라. 가족이든 사랑이든 반복돼온 아픔의 진짜 뿌리를 부드럽지만 정확하게 짚어줘라. 마지막엔 <blockquote>태그로 가슴을 울리는 한 문장을 남겨라.",
  "vip_card2": "(최소 1200자) [CHAPTER 02. 당신의 그 상처가, 사실은 가장 큰 재능입니다] 재능·직업을 보여주는 하우스(2·6·10하우스)와 행성을 근거로 먼저 밝히고, 앞 챕터에서 짚은 상처와 예민함이 실은 남들은 못 가진 강력한 재능임을 감동적으로 뒤집어줘라. 🚨[필수] 두루뭉술하게 \'창의적인 일이 맞습니다\' 같은 말 금지. 반드시 ${name}님에게 맞는 <b>구체적인 업종·직업 3가지를 콕 집어 제시</b>하라 (예: 부동산 경매 / 심리상담 / 온라인 교육 콘텐츠 처럼 실제로 검색해서 시작할 수 있는 수준으로). 각 업종마다 \'왜 이 차트에 맞는지\' 근거를 한 줄씩 붙여라. 그리고 조직에 속할 사람인지 독립할 사람인지, 앞으로 만들어갈 부(富)의 크기와 그 시점을 <b>강조</b>하며 희망차게 제시하라.",
  "vip_card3": "(최소 1000자) [CHAPTER 03. 이제, 당신의 시간이 옵니다] 진짜 행복해지기 위해 놓아줘야 할 것과, 붙잡아야 할 기회를 알려줘라. 🚨🚨 [연도는 반드시 계산된 값 그대로] 위 [정밀 계산된 네이탈 차트]에 있는 \'실제 계산된 목성 트랜짓\' 항목을 그대로 인용하라. 절대로 임의의 연도(2026~2028 등)로 바꾸지 마라. 트랜짓이 여러 개면 순서대로 언급하고, \'뚜렷한 트랜짓이 없다\'는 결과라면 그 사실을 정직하게 인정하며 시기보다 태도·행동에 집중하라는 방향으로 안내하라. 왜 그 시기인지(목성이 배우자궁과 이루는 각도)를 짧게 설명하라. 시기 생략이나 임의 변경 절대 금지. 곁에 두면 당신을 갉아먹는 사람(레드플래그)은 <span style=\'color:#ff3b30;font-weight:900;\'>빨간 글씨</span>로 분명히 경고하고, 마지막은 ${name}님을 굳게 믿어주는 뜨거운 축복으로 끝내라.",
  "vip_card4": "(최소 1000자) [CHAPTER 04. 전생의 당신, 이번 생의 과제] 🔮 위 [전생과 영혼의 과제 - 달의 교점] 항목을 반드시 근거로 삼아라. 다음 흐름으로 써라. ① 사우스노드를 근거로, ${name}님이 전생에서 이미 통달했기에 이번 생에도 너무 익숙하고 편안한 패턴을 짚어라 — 그래서 힘들 때마다 자꾸 그 자리로 도망쳐 왔다는 것을. (예: \'당신은 늘 혼자 다 짊어지는 쪽을 택했습니다. 그게 편하니까요. 하지만 그건 이미 다 배운 길입니다.\') ② 왜 그 익숙한 길로 가면 갈수록 공허해지는지 설명하라. ③ 노스노드를 근거로, 이번 생에 반드시 배워야 할 것이 무엇인지 밝혀라 — 불편하고 어색하지만 바로 거기에 성장과 진짜 행복이 있음을. ④ 12하우스 배치가 있다면 영혼에 남은 오래된 상처와 연결하라. ⑤ 마지막은 <blockquote> 태그로 \'${name}님이 이번 생에 풀어야 할 단 하나의 숙제\'를 한 문장으로 못 박아라. 앞 챕터들(상처·재능·타이밍)이 왜 그렇게 흘러왔는지가 이 챕터에서 비로소 납득되게 써라.",
  "life_score_20": 점수숫자만,
  "life_desc_20": "(1~2문장) 20대의 흐름과 핵심 조언",
  "life_score_30": 점수숫자만,
  "life_desc_30": "(1~2문장) 30대의 흐름과 핵심 조언",
  "life_score_40": 점수숫자만,
  "life_desc_40": "(1~2문장) 40대의 흐름과 핵심 조언",
  "life_score_50": 점수숫자만,
  "life_desc_50": "(1~2문장) 50대의 흐름과 핵심 조언",
  "life_score_60": 점수숫자만,
  "life_desc_60": "(1~2문장) 60대의 흐름과 핵심 조언",
  "life_score_70": 점수숫자만,
  "life_desc_70": "(1~2문장) 70대의 흐름과 핵심 조언",
  "best_age": "가장 점수 높은 연령대 (예: 40대)",
  "best_age_reason": "(2~3문장) 왜 그 시기가 인생의 황금기인지, 차트 근거와 함께"
}
    `;

    // ✅ Gemini v1beta 직접 호출
    // - thinkingBudget 0: '생각' 기능 OFF → 응답속도 10~25초로 단축 (504 타임아웃 해결)
    // - responseMimeType JSON: 순수 JSON만 답하도록 강제 (500 파싱에러 해결)
    // - 실패 시 자동 1회 재시도 + 깨진 JSON 복구 파싱
    let parsedData = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 24576,
                temperature: 0.95,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 0 }
              }
            })
          }
        );

        if (!geminiRes.ok) {
          lastErr = `Gemini ${geminiRes.status}: ${await geminiRes.text()}`;
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          // 🚨 503(일시적 과부하)이면 살짝 기다렸다가 재시도 → 구글 서버 회복 시간 확보
          if (geminiRes.status === 503) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
          }
          continue;
        }

        const geminiData = await geminiRes.json();
        console.log(`✅ [3] Gemini 응답 수신 (시도 ${attempt})`);

        const parts = (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts) || [];
        const responseText = parts.map(p => p.text || "").join("");
        const s = responseText.indexOf("{");
        const e = responseText.lastIndexOf("}");
        if (s === -1 || e === -1) {
          lastErr = "응답에 JSON 없음: " + responseText.slice(0, 200);
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          continue;
        }
        parsedData = JSON.parse(responseText.slice(s, e + 1));
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}] 실패:`, err.message);
      }
    }

    if (!parsedData) {
      return res.status(500).json({ error: `[Gemini VIP 실패] ${lastErr}` });
    }

    console.log("✅ [4] JSON 파싱 성공, VIP 응답 전송");

    if (req.body.orderId) {
      try {
        await kv.set(`vip-report:${req.body.orderId}`, parsedData, { ex: 60 * 60 * 24 * 30 });
        console.log("💾 KV 저장 완료: vip-report:" + req.body.orderId);
      } catch (e) {
        console.log("⚠️ KV 저장 실패(리포트 전송은 정상 진행):", e.message);
      }
    }

    res.status(200).json(parsedData);

  } catch (error) {
    console.error("🔥 gemini-vip.js 에러:", error);
    res.status(500).json({ error: `[VIP 서버 에러] ${error.message}` });
  }
};

module.exports = allowCors(handler);
