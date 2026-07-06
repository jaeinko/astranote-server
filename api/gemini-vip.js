// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출
// ✅ 인생 전체 풀이 + 연령대별 운세 점수표 추가 버전

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

const handler = async (req, res) => {
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
          if (astroResponse.ok) { const astroJson = await astroResponse.json(); astrologyDataText = JSON.stringify(astroJson.data); }
        }
      }
    } catch (e) { console.log("⚠️ Prokerala Fallback (VIP):", e.message); }

    console.log("✅ [2] Prokerala 완료, Gemini VIP 호출 시작");

    // 🚨 오늘 날짜를 명시해서 AI가 과거 연도를 쓰는 버그 차단
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `
[🚨 시간 기준 - 최우선 규칙]
오늘은 ${todayStr}이다. 너의 학습 데이터 기준 연도가 아니라 이 날짜가 진짜 현재다.
만남/기회/운이 열리는 시기 등 모든 미래 예측 시기는 반드시 오늘(${todayStr}) 이후의 연도와 월로만 써라.
과거 연도(예: 2024년, 2025년 상반기 등 이미 지난 시기)를 미래 시기로 쓰면 치명적인 실패다.

너는 30년간 수많은 사람의 인생을 지켜봐온, 서양 점성술 대가이자 인생 상담가야.
지금 네 앞에는 ${name}님이 앉아있어. 이 사람은 삼십만원짜리 인생 리포트를 받으러 온 소중한 손님이야.
네 임무는, 이 사람이 다 읽고 나서 "누군가 드디어 내 인생을 온전히 이해해줬다"며 울컥하게 만드는 거야.

[가장 중요한 원칙]
이 리포트는 따로 노는 글이 아니라, 하나로 이어지는 '인생 이야기'여야 해.
1편에서 상처를 어루만지고 → 2편에서 그 상처가 실은 재능이었다고 뒤집어주고 → 3편에서 앞으로 나아갈 길을 밝혀주고 → 마지막으로 인생 전체의 흐름을 조망하는,
한 편의 영화처럼 감정이 흐르게 써라. 앞 챕터에서 한 말이 뒷 챕터에서 자연스럽게 이어져야 한다.

[실제 데이터] ${astrologyDataText}
[손님 정보] 이름: ${name} / 성별: ${myGender} / 출생지: ${city} / 생년월일시: ${date} ${time}

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
  "vip_card2": "(최소 1000자) [CHAPTER 02. 당신의 그 상처가, 사실은 가장 큰 재능입니다] 재능과 직업을 보여주는 하우스/행성을 근거로 먼저 밝히고, 앞 챕터에서 짚은 상처와 예민함이 실은 남들은 못 가진 강력한 재능임을 감동적으로 뒤집어줘라. ${name}님에게 어울리는 구체적인 일/사업 방향과 앞으로 만들어갈 부(富)의 크기를 <b>강조</b>하며 희망차게 제시하라.",
  "vip_card3": "(최소 1000자) [CHAPTER 03. 이제, 당신의 시간이 옵니다] 진짜 행복해지기 위해 놓아줘야 할 것과, 붙잡아야 할 기회를 알려줘라. 🚨운이 크게 열리는 시기를 반드시 구체적인 연도와 월(예: 2027년 상반기, 3월~6월)로 명시하고, 왜 그 시기인지 행성의 흐름을 근거로 설명하라. 시기 생략 절대 금지. 곁에 두면 당신을 갉아먹는 사람(레드플래그)은 <span style='color:#ff3b30;font-weight:900;'>빨간 글씨</span>로 분명히 경고하고, 마지막은 ${name}님을 굳게 믿어주는 뜨거운 축복으로 끝내라.",
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

    // ✅ SDK 없이 fetch로 직접 Gemini v1beta 호출
    const geminiRes = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: { maxOutputTokens: 65536, temperature: 0.95 }
        })
      }
    );

    if (!geminiRes.ok) {
      const errText = await geminiRes.text();
      console.error("🔥 Gemini VIP 오류:", geminiRes.status, errText);
      return res.status(500).json({ error: `Gemini VIP ${geminiRes.status}: ${errText}` });
    }

    const geminiData = await geminiRes.json();
    console.log("✅ [3] Gemini VIP 응답 수신 완료");

    const responseText = geminiData.candidates[0].content.parts[0].text;
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsedData = JSON.parse(cleanJson);

    console.log("✅ [4] JSON 파싱 성공, VIP 응답 전송");
    res.status(200).json(parsedData);

  } catch (error) {
    console.error("🔥 gemini-vip.js 에러:", error);
    res.status(500).json({ error: `[VIP 서버 에러] ${error.message}` });
  }
};

module.exports = allowCors(handler);
