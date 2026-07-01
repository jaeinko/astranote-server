const { GoogleGenerativeAI } = require('@google/generative-ai');

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
  "Changwon": { lat: 35.2280, lon: 128.6811 }, "Cheongju": { lat: 36.6424, lon: 127.4890 },
  "Jeonju": { lat: 35.8242, lon: 127.1480 }, "Jeju": { lat: 33.4996, lon: 126.5312 },
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

  console.log("✅ [1] gemini-vip.js 함수 진입 성공");

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;

    if (!name || !date || !time) {
      return res.status(400).json({ error: '필수 입력값(name/date/time)이 누락되었습니다.' });
    }
    if (!process.env.GEMINI_API_KEY) {
      console.error("🔥 GEMINI_API_KEY 환경변수가 비어있음");
      return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수가 설정되지 않았습니다.' });
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
    } catch (e) { console.log("⚠️ Prokerala Fallback 활성화 (VIP):", e.message); }

    console.log("✅ [2] Prokerala 완료, Gemini VIP 호출 시작");

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY, { apiVersion: "v1beta" });
    const model = genAI.getGenerativeModel({
      model: "gemini-1.5-pro-latest",
      generationConfig: {
        maxOutputTokens: 8192,
        temperature: 0.9
      }
    });

    const prompt = `
당신은 최고급 VVIP 고객의 영혼을 깊이 들여다보는 최고 권위의 운명 전략가이자, 융의 분석심리학(Analytical Psychology)과 점성술에 통달한 마스터다. 
고객의 서양 점성술 네이탈 차트(Natal Chart) 데이터를 기반으로 분석하되, 당신의 궁극적인 목적은 '고객이 그동안 겪은 고통에 대한 깊은 사랑과 수용, 그리고 진짜 부(富)와 행복으로의 압도적인 인도'다.

[실제 데이터] ${astrologyDataText}
[고객 정보] 이름: ${name} / 성별: ${myGender} / 타겟 상대: ${targetGender} / 출생지: ${city} / 생년월일시: ${date} ${time}

[분석 및 작문 지침 - 매우 엄격함]
1. 각 항목(vip_card1, vip_card2, vip_card3)은 최소 1000자 이상으로 작성해.
2. 고객이 그동안 삶에서 얼마나 치열하게 고군분투해 왔는지 온전히 알아주는 따뜻한 문장으로 시작하라.
3. 충분히 안아준 뒤, 무의식의 그림자(Shadow)와 결핍(4하우스, 달, 토성 위주)을 정확하게 짚어주어라.
4. 고객의 상처와 예민함이 어떻게 진짜 부(富)를 끌어당기는 비즈니스 무기가 되는지 논리적이고 희망차게 설명하라.
5. 핵심 깨달음은 반드시 HTML <b> 태그로 강조. 마크다운(*) 절대 금지.
6. 결과는 반드시 순수 JSON 객체로만 출력해. 앞뒤에 아무것도 붙이지 마.

[출력 JSON 형식]
{
  "vip_card1": "(최소 1000자) [CHAPTER 01: 무의식의 상처와 깊은 위로] 고객의 네이탈차트 분석을 중심으로, 고객이 지금까지 삶에서 겪었을 고통이나 결핍을 짚어주어라. 고객이 남몰래 겪어온 외로움과 투쟁을 깊이 공감하고 위로해라. 그 후 차트를 근거로 대인관계/연애에서 반복되었던 진짜 결핍의 원인을 부드럽지만 예리하게 분석하라. 마지막엔 <blockquote>태그를 사용해 가슴을 울리는 묵직한 명언을 넣어라.",
  "vip_card2": "(최소 1000자) [CHAPTER 02: 상처를 부(富)로 바꾸는 연금술] 고객이 단점이라 여겼던 기질이 실제로는 돈과 성공을 끌어당기는 위대한 재능임을 찬사하라. 고객의 네이탈차트에 맞는 구체적인 직업/비즈니스 방향성과 부의 스케일을 <b>태그로 강조하며 상세히 제시하라.",
  "vip_card3": "(최소 1000자) [CHAPTER 03: 성장을 위한 골든 타이밍과 행동 지침] 진짜 행복해지고 부자가 되기 위해 당장 끊어내야 할 습관이나 악연(레드플래그)을 <span style='color:#ff3b30;font-weight:900;'>빨간색 글씨</span>로 강하게 조언하라. 운이 폭발적으로 상승하는 연/월을 명시하고, 스스로를 굳게 믿으라는 열정적인 축복으로 마무리하라."
}
    `;

    const result = await model.generateContent(prompt);
    console.log("✅ [3] Gemini VIP 응답 수신 완료");

    const responseText = result.response.text();
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
