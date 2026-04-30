const { GoogleGenerativeAI } = require('@google/generative-ai');

export const maxDuration = 60; // VVIP 대량 생성을 위한 타임아웃 60초 확보

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
  "Jeonju": { lat: 35.8242, lon: 127.1480 }, "Jeju": { lat: 33.4996, lon: 126.5312 }, "Overseas": { lat: 0, lon: 0 } 
};

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;
    const location = cityCoordinates[city] || cityCoordinates["Seoul"];
    const dateTimeIso = `${date.replace(/\./g, '-')}T${time}:00+09:00`;

    // 1. ProKerala API를 통한 정밀 천체 데이터 추출 (기존 로직 완벽 보존)
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
          const astroResponse = await fetch(`https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
          });
          if (astroResponse.ok) { const astroJson = await astroResponse.json(); astrologyDataText = JSON.stringify(astroJson.data); }
        }
      }
    } catch (e) { console.log("API Fallback 활성화 (VVIP)"); }

    // 2. VVIP 전용 AI 세팅 (더 똑똑하고 깊이 있는 pro 모델 사용)
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-pro" });

    // 3. 🔥 VVIP 전용 심층 분석 & 따뜻한 연금술 프롬프트 🔥
    const prompt = `
당신은 최고급 VVIP 고객의 영혼을 깊이 들여다보는 최고 권위의 운명 전략가이자, 융의 분석심리학(Analytical Psychology)과 점성술에 통달한 마스터다. 
고객의 서양 점성술 네이탈 차트(Natal Chart) 데이터를 기반으로 분석하되, 당신의 궁극적인 목적은 '고객이 그동안 겪은 고통에 대한 깊은 사랑과 수용, 그리고 진짜 부(富)와 행복으로의 압도적인 인도'다.

[실제 데이터] ${astrologyDataText}
[고객 정보] 이름: ${name} / 성별: ${myGender} / 타겟 상대: ${targetGender} / 출생지: ${city} / 생년월일시: ${date} ${time}

[분석 및 작문 지침 - 매우 엄격함]
1. 분량과 깊이: 각 항목(vip_card1, vip_card2, vip_card3)은 무조건 **최소 1000자 이상**으로, 스크롤이 끝없이 내려갈 만큼 압도적인 정보량과 깊이를 담아라. 분량이 적으면 실패다.
2. 따뜻한 위로와 수용: 고객(${name})이 그동안 삶에서 얼마나 치열하게 고군분투해 왔는지 온전히 알아주는 따뜻한 문장으로 시작하라. "당신이 얼마나 애써왔는지 차트에 다 나와 있습니다"라는 식의 깊은 공감과 눈물 나는 위로를 반드시 포함하라.
3. 부드러운 팩트 폭격: 충분히 안아준 뒤, 무의식의 그림자(Shadow)와 결핍(4하우스, 달, 토성 위주)을 정확하게 짚어주어 현실을 직시하게 만들라.
4. 부와 성장의 연금술: 고객의 상처와 예민함이 어떻게 '진짜 부(富)'를 끌어당기는 가장 강력한 비즈니스 무기가 되는지 논리적이고 희망차게 설명하라.
5. 시각적 강조: 핵심 깨달음이나 행동 지침은 반드시 HTML <b> 나 <strong> 태그를 사용하여 굵은 글씨로 강조하라. 마크다운(*)은 절대 금지한다.
6. 결과는 순수 JSON 객체로만 출력해라.

[출력 JSON 형식]
{
  "vip_card1": "(최소 1000자 이상) [CHAPTER 01: 무의식의 상처와 깊은 위로] 고객의 네이탈차트 분석을 줌심으로, 고객이 지금까지 삶에서 겪었을만한 고통이나 결핍을 일이주어라. 가족이든 대인관계이든, 원치않은 이별이 있었으면 있었다고 이야기해도 된다. 고객이 남몰래 겪어온 외로움과 투쟁을 깊이 공감하고 위로해라. 그 후 차트를 근거로 대인관계/연애에서 반복되었던 '진짜 결핍'의 원인을 부드럽지만 예리하게 분석하라. 마지막엔 <blockquote>태그를 사용해 가슴을 울리는 묵직한 명언을 넣어라.",
  
  "vip_card2": "(최소 1000자 이상) [CHAPTER 02: 상처를 부(富)로 바꾸는 연금술] 고객이 단점이라 여겼던 기질(예민함또는 무던함 또는 관찰력 등)이 실제로는 돈과 성공을 끌어당기는 위대한 재능임을 찬사하라. 고객의 정보의 네이탈차트에 맞는 구체적인 직업/비즈니스 방향성과 평생 가지거나 만들어 낼 부의 스케일을 <b>태그로 강조하며 상세히 제시하라. 고객의 장점과 직장이나 사업의 성격등을 자세히 말해주라. 부풀리지 않되, 솔직하면서 희망적이야 한다",
  
  "vip_card3": "(최소 1000자 이상) [CHAPTER 03: 성장을 위한 골든 타이밍과 행동 지침] 진짜 행복해지고 부자가 되기 위해 당장 끊어내야 할 습관이나 악연(레드플래그)을 <span style='color:#ff3b30;font-weight:900;'>빨간색 글씨</span>로 강하게 조언하라. 운이 폭발적으로 상승하는 연/월을 명시하고, 스스로를 굳게 믿으라는 열정적인 축복으로 마무리하라."
}
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // 마크다운 백틱 제거 및 JSON 파싱
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsedData = JSON.parse(cleanJson);
    
    res.status(200).json(parsedData);
  } catch (error) { 
    console.error("VVIP Server Error:", error);
    res.status(500).json({ error: '우주 데이터 심층 동기화 중 오류가 발생했습니다.' }); 
  }
};

module.exports = allowCors(handler);
