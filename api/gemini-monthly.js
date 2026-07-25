// ═══════════════════════════════════════════════════════════
//  🌙 아스트라노트 — 월간 운세 리포트 (2,900원)
//  · 트랜짓 테이블 내장 → Prokerala 추가 호출 없음(비용 증가 0)
//  · 하우스 계산: 홀사인(Whole Sign) — gemini.js와 동일 기준
// ═══════════════════════════════════════════════════════════
const { kv } = require('@vercel/kv');

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,POST');
  res.setHeader('Access-Control-Allow-Headers', 'X-Requested-With,Content-Type,Accept');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return await fn(req, res);
};

// ── 공용 모듈 ──────────────────────────────────────────────────────────
//  도시 좌표와 시간대 변환은 lib/ 아래 정본 하나만 씁니다.
//  예전에는 이 로직이 API 4개에 복사돼 있어서, 한 곳만 고치면 나머지 세 곳에
//  버그가 남았습니다(한국 1954~61 UTC+8:30 · 1987~88 서머타임 미반영).
const cityCoordinates = require('../lib/cities.js');
const { cityTimezones, getUtcOffsetMinutes, buildBirthIso, dayRangeIso, tzLabel } = require('../lib/time.js');





const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점' };

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000);
}
function signDeg(lon) {
  const l = ((lon % 360) + 360) % 360;
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}
function signIndex(lon){ return Math.floor((((lon % 360) + 360) % 360) / 30); }
function wholeSignHouse(planetLon, ascLon){
  return ((signIndex(planetLon) - signIndex(ascLon)) % 12 + 12) % 12 + 1;
}

// ── 월별 트랜짓 테이블 (2026-01 ~ 2031-12, 매월 15일 기준) ──
const TRANSIT_START={year:2026,month:1};
const T_SUN=[294.96, 326.43, 354.53, 25.16, 54.31, 84.05, 112.67, 142.33, 172.31, 201.78, 232.76, 263.14, 294.72, 326.19, 354.3, 24.94, 54.09, 83.83, 112.44, 142.1, 172.07, 201.54, 232.51, 262.89, 294.47, 325.94, 355.05, 25.67, 54.82, 84.55, 113.16, 142.82, 172.81, 202.29, 233.28, 263.66, 295.25, 326.71, 354.81, 25.44, 54.58, 84.32, 112.93, 142.59, 172.57, 202.05, 233.03, 263.42, 295.0, 326.47, 354.58, 25.2, 54.35, 84.09, 112.71, 142.36, 172.33, 201.81, 232.78, 263.16, 294.75, 326.22, 354.33, 24.96, 54.12, 83.86, 112.48, 142.13, 172.1, 201.56, 232.54, 262.92];
const T_MER=[290.83, 343.45, 340.16, 359.98, 54.95, 108.53, 109.41, 129.49, 187.33, 226.58, 215.23, 253.42, 303.14, 333.48, 326.79, 10.8, 71.46, 95.67, 91.95, 145.95, 196.56, 211.24, 217.52, 264.67, 312.95, 304.01, 332.68, 29.23, 74.74, 67.79, 101.26, 161.8, 197.56, 184.67, 230.38, 277.33, 298.07, 301.66, 344.29, 43.61, 51.23, 61.82, 119.09, 169.5, 174.1, 190.96, 241.86, 283.91, 272.43, 309.84, 359.53, 37.59, 30.04, 73.15, 133.51, 164.46, 154.44, 204.04, 251.63, 264.79, 273.87, 321.98, 12.11, 8.33, 30.8, 91.58, 139.04, 137.04, 164.15, 215.85, 254.51, 242.01];
const T_VEN=[296.98, 335.88, 10.78, 48.97, 85.31, 121.95, 155.98, 188.21, 212.92, 215.76, 202.89, 217.95, 248.24, 283.34, 316.52, 353.9, 30.3, 68.05, 104.76, 142.95, 181.38, 218.65, 257.14, 294.27, 332.2, 8.96, 40.95, 69.05, 79.34, 64.38, 71.08, 97.18, 130.15, 165.01, 202.69, 239.97, 278.79, 317.64, 352.63, 31.13, 68.1, 106.0, 142.32, 179.31, 215.35, 248.52, 278.41, 293.96, 281.46, 285.04, 308.05, 340.66, 14.8, 51.21, 87.1, 124.77, 163.02, 200.42, 239.27, 276.91, 315.72, 354.23, 28.41, 65.07, 98.48, 128.51, 145.85, 135.84, 133.21, 155.34, 187.78, 222.78];
const T_MAR=[293.58, 317.82, 339.87, 4.13, 27.13, 50.14, 71.5, 92.49, 112.2, 129.71, 145.38, 156.52, 160.29, 152.56, 142.87, 141.99, 150.19, 163.85, 179.94, 198.52, 218.65, 239.4, 262.0, 284.79, 309.0, 333.51, 356.34, 20.3, 42.81, 65.25, 86.12, 106.81, 126.61, 144.81, 162.29, 177.25, 189.08, 193.92, 188.74, 177.69, 175.46, 183.39, 196.93, 214.47, 234.4, 255.38, 278.36, 301.48, 325.82, 350.15, 11.79, 35.13, 56.96, 78.72, 99.06, 119.44, 139.22, 157.82, 176.38, 193.46, 209.6, 222.97, 230.52, 229.8, 220.0, 214.46, 220.36, 234.3, 252.77, 273.22, 295.98, 318.83];
const T_JUP=[109.47, 106.02, 105.11, 106.98, 111.07, 116.84, 123.23, 130.07, 136.59, 141.97, 145.79, 147.02, 145.3, 141.5, 138.29, 137.0, 138.53, 142.45, 147.78, 154.19, 160.9, 167.13, 172.62, 176.27, 177.5, 175.76, 172.27, 168.77, 167.54, 169.06, 172.77, 178.2, 184.57, 191.04, 197.44, 202.69, 206.35, 207.39, 205.81, 202.16, 198.81, 197.51, 198.92, 202.71, 208.18, 214.39, 221.15, 227.42, 232.9, 236.56, 237.63, 236.05, 232.56, 229.08, 227.76, 229.18, 233.03, 238.41, 244.98, 251.68, 258.32, 263.94, 267.49, 268.99, 267.66, 264.15, 260.68, 259.15, 260.5, 264.25, 269.94, 276.47];
const T_SAT=[357.14, 0.12, 3.44, 7.29, 10.67, 13.31, 14.63, 14.44, 12.78, 10.48, 8.52, 7.95, 9.03, 11.59, 14.73, 18.6, 22.23, 25.36, 27.32, 27.86, 26.78, 24.64, 22.33, 21.1, 21.47, 23.48, 26.45, 30.25, 34.03, 37.52, 40.03, 41.26, 40.85, 39.06, 36.61, 34.84, 34.5, 35.91, 38.4, 42.01, 45.84, 49.63, 52.63, 54.58, 54.95, 53.74, 51.4, 49.19, 48.11, 48.77, 50.75, 54.04, 57.81, 61.76, 65.17, 67.76, 68.92, 68.42, 66.46, 64.05, 62.3, 62.15, 63.52, 66.36, 69.93, 73.94, 77.63, 80.75, 82.65, 82.94, 81.58, 79.25];
const R_SUN=[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
const R_MER=[0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 1, 0, 0, 0, 0];
const R_VEN=[0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 0, 0, 0, 0];
const R_MAR=[0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 0, 0, 0, 0, 0, 0, 0];
const R_JUP=[1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0];
const R_SAT=[0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0, 1, 1, 1];

const HOUSE_MEANING = {
  1:'나 자신·컨디션·인상', 2:'수입·소유·자기가치', 3:'소통·이동·학습',
  4:'집·가족·정서적 뿌리', 5:'연애·즐거움·자기표현', 6:'일상·업무·건강',
  7:'관계·파트너·계약', 8:'깊은 결속·타인의 돈·변화', 9:'배움·먼 곳·확장',
  10:'커리어·평판·성취', 11:'인맥·모임·소망', 12:'휴식·정리·무의식'
};

function transitIndex(year, month){
  return (year - TRANSIT_START.year) * 12 + (month - TRANSIT_START.month);
}

// ── 트랜짓 vs 출생차트 다이제스트 ──
function buildMonthlyDigest(natalData, dateTimeIso, year, month){
  const list = natalData.planet_position || natalData.planet_positions || [];
  if (!list.length) return null;
  const ay = lahiriAyanamsa(dateTimeIso);
  const natal = {};
  for (const p of list){
    const kr = PLANET_KR[p.name];
    if (!kr || typeof p.longitude !== 'number') continue;
    natal[kr] = signDeg(p.longitude + ay);
  }
  const asc = natal['상승점'];
  if (!asc) return null;

  const idx = transitIndex(year, month);
  if (idx < 0 || idx >= T_SUN.length) return null;

  const T = {
    '태양': { lon: T_SUN[idx], r: R_SUN[idx] },
    '수성': { lon: T_MER[idx], r: R_MER[idx] },
    '금성': { lon: T_VEN[idx], r: R_VEN[idx] },
    '화성': { lon: T_MAR[idx], r: R_MAR[idx] },
    '목성': { lon: T_JUP[idx], r: R_JUP[idx] },
    '토성': { lon: T_SAT[idx], r: R_SAT[idx] }
  };

  const lines = [];
  lines.push(`[출생차트 기준]`);
  lines.push(`상승점(ASC): ${asc.sign} ${asc.deg}도  ← 하우스 배정 기준(홀사인)`);
  ['태양','달','수성','금성','화성','목성','토성'].forEach(function(n){
    if (natal[n]) lines.push(`출생 ${n}: ${natal[n].sign} ${natal[n].deg}도 / ${wholeSignHouse(natal[n].abs, asc.abs)}하우스`);
  });

  lines.push(`\n[${year}년 ${month}월 트랜짓 — 이 달 해석의 유일한 근거]`);
  Object.keys(T).forEach(function(n){
    const sd = signDeg(T[n].lon);
    const h = wholeSignHouse(T[n].lon, asc.abs);
    lines.push(`${n} → ${sd.sign} ${sd.deg}도 · 당신의 ${h}하우스(${HOUSE_MEANING[h]}) 통과${T[n].r ? ' ⚠️역행 중' : ''}`);
  });

  // 트랜짓 → 출생 행성 각도
  const ASPECTS = [
    { ang:0, name:'합', orb:5, tone:'강한 자극' },
    { ang:180, name:'대립', orb:5, tone:'긴장·부딪힘' },
    { ang:120, name:'삼각', orb:5, tone:'순조로움' },
    { ang:90, name:'사각', orb:5, tone:'마찰·과부하' },
    { ang:60, name:'육각', orb:4, tone:'기회' }
  ];
  const targets = ['태양','달','금성','화성','상승점'];
  const hits = [];
  Object.keys(T).forEach(function(tn){
    targets.forEach(function(nn){
      if (!natal[nn]) return;
      let d = Math.abs(T[tn].lon - natal[nn].abs) % 360;
      if (d > 180) d = 360 - d;
      for (const a of ASPECTS){
        if (Math.abs(d - a.ang) <= a.orb){
          hits.push(`트랜짓 ${tn} × 출생 ${nn} ${a.name} (${a.tone})`);
          break;
        }
      }
    });
  });
  if (hits.length){
    lines.push(`\n[이 달의 핵심 각도 — 최소 2개는 반드시 해석에 인용하라]`);
    hits.slice(0, 8).forEach(function(h){ lines.push('• ' + h); });
  }

  const retro = Object.keys(T).filter(function(n){ return T[n].r; });
  if (retro.length) lines.push(`\n[역행 중인 행성] ${retro.join(', ')} → 되돌아보기·재정비·재연락에 유리, 새 계약/새 시작은 신중`);

  return lines.join('\n');
}

const handler = async (req, res) => {
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(`monthly:${orderId}`);
      if (saved) return res.status(200).json(saved);
      return res.status(404).json({ error: '저장된 리포트 없음' });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log('✅ [1] monthly.js 진입');

  try {
    const { name, date, time, city } = req.body;
    if (!name || !date || !time) return res.status(400).json({ error: '필수 입력값 누락' });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수 없음' });

    let location = cityCoordinates[city];
    if (!location) {
      console.error(`⚠️ 출생지 좌표 없음: "${city}" → 서울로 임시 처리`);
      location = cityCoordinates['Seoul'];
    }
    const dateTimeIso = buildBirthIso(date, time, city);

    // 대상 월 = 서버 기준 '지금'(KST). 매달 자동 갱신됨.
    const nowKst = new Date(Date.now() + 9 * 3600 * 1000);
    const year = nowKst.getUTCFullYear();
    const month = nowKst.getUTCMonth() + 1;

    let digest = null;
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
        const tokenRes = await fetch('https://api.prokerala.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.PROKERALA_CLIENT_ID,
            client_secret: process.env.PROKERALA_CLIENT_SECRET
          })
        });
        if (tokenRes.ok) {
          const tk = await tokenRes.json();
          const astroRes = await fetch(
            `https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`,
            { headers: { 'Authorization': `Bearer ${tk.access_token}` } }
          );
          if (astroRes.ok) {
            const aj = await astroRes.json();
            digest = buildMonthlyDigest(aj.data, dateTimeIso, year, month);
            console.log('📊 월간 다이제스트:\n' + digest);
          }
        }
      }
    } catch (e) { console.log('⚠️ Prokerala Fallback:', e.message); }

    if (!digest) digest = '정밀 천체 역산 데이터 기반.';

    const prompt = `
[🚨 절대 금지]
'undefined','null','NaN','트랜짓 항목','데이터에 없음' 같은 시스템 용어를 본문에 쓰지 마라. 손님은 일반인이다.

너는 명리학을 오래 공부하다 서양 점성술로 전향한 20년 경력의 전문가다.
아래는 ${name}님의 출생차트와 ${year}년 ${month}월 실제 행성 위치다.

${digest}

[작성 규칙]
1. 반드시 위 트랜짓과 각도를 근거로 써라. 별자리 일반론('사자자리는 열정적') 절대 금지.
2. 최소 2개의 구체적 근거를 본문에 자연스럽게 녹여라. 예: "이번 달 화성이 당신의 6하우스를 지나며"
3. 발뺌 화법 금지: '~일 수 있습니다', '~한 느낌도 있습니다' 금지. '~편입니다', '~합니다'로 부드럽게 단정하라.
4. 날짜는 반드시 ${year}년 ${month}월 안의 구체적 시기(초순/중순/하순 또는 날짜 범위)로 써라.
5. 뻔한 덕담 금지. 이 사람의 이번 달에만 해당하는 구체적 장면으로 써라.
6. 어조는 따뜻하되 단정적으로. 겁주지 마라.

아래 JSON 형식으로만 답하라. 다른 말 붙이지 마라.
{
  "month_title": "${year}년 ${month}월",
  "headline": "(45자 이내) 이번 달을 관통하는 핵심 한 줄. 강렬하고 구체적으로.",
  "money": "(최소 300자) 💰 재물운. 트랜짓 근거 포함. 수입·지출·기회의 구체적 시기와 장면.",
  "love": "(최소 300자) 💗 연애운. 솔로/커플 모두에게 해당하도록. 만남이나 관계 변화의 시기를 짚어라.",
  "work": "(최소 300자) 🔥 일·성취운. 성과가 나는 시점과 주의할 시점을 나눠서.",
  "exam": "(최소 200자) 📚 시험·학업운. 집중이 잘 되는 시기, 실수하기 쉬운 시기.",
  "social": "(최소 200자) 🤝 대인관계운. 도움이 되는 사람, 거리를 둘 관계.",
  "caution": "(최소 200자) ⚠️ 이 달 반드시 조심할 것. 역행이나 긴장 각도를 근거로 구체적으로 1~2가지.",
  "luck": "(최소 150자) 🍀 개운 포인트. 행운의 색·방향·행동 각각 하나씩. 트랜짓 별자리와 연결해 근거를 대라.",
  "teaser": "(120자 내외) 이번 달 흐름은 여기까지. 평생 단 하나뿐인 배우자·인생 전체 흐름이 궁금하다면 배우자 리포트로 자연스럽게 이어지는 문장."
}
`;

    let parsed = null, lastErr = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const gRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 32768,
                temperature: 0.9,
                responseMimeType: 'application/json',
                thinkingConfig: { thinkingBudget: 4096 }
              }
            })
          }
        );
        if (!gRes.ok) {
          lastErr = `Gemini ${gRes.status}: ${await gRes.text()}`;
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          if (gRes.status === 503) await new Promise(r => setTimeout(r, 1500 * attempt));
          continue;
        }
        const gd = await gRes.json();
        const parts = (gd.candidates && gd.candidates[0] && gd.candidates[0].content && gd.candidates[0].content.parts) || [];
        const txt = parts.map(p => p.text || '').join('');
        const s = txt.indexOf('{'), e = txt.lastIndexOf('}');
        if (s === -1 || e === -1) { lastErr = '응답에 JSON 없음'; continue; }
        parsed = JSON.parse(txt.slice(s, e + 1));
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}] 실패:`, err.message);
      }
    }

    if (!parsed) return res.status(500).json({ error: `[Gemini 실패] ${lastErr}` });

    parsed.generated_month = `${year}-${String(month).padStart(2, '0')}`;
    parsed.customer_name = name;

    if (req.body.orderId) {
      try {
        await kv.set(`monthly:${req.body.orderId}`, parsed, { ex: 60 * 60 * 24 * 45 });
        console.log('💾 KV 저장: monthly:' + req.body.orderId);
      } catch (e) { console.log('⚠️ KV 저장 실패:', e.message); }
    }

    res.status(200).json(parsed);
  } catch (error) {
    console.error('🔥 monthly.js 에러:', error);
    res.status(500).json({ error: `[서버 에러] ${error.message}` });
  }
};

module.exports = allowCors(handler);
