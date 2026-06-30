const { GoogleGenerativeAI } = require('@google/generative-ai');

// 🚨 팩트: 에러를 유발할 수 있는 혼종 문법(export const) 완벽 제거 완료

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*'); 
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return await fn(req, res);
};

const cityCoordinates = {
  // 대한민국
  "Seoul": { lat: 37.5665, lon: 126.9780 }, "Busan": { lat: 35.1796, lon: 129.0756 },
  "Daegu": { lat: 35.8714, lon: 128.6014 }, "Incheon": { lat: 37.4563, lon: 126.7052 },
  "Gwangju": { lat: 35.1595, lon: 126.8526 }, "Daejeon": { lat: 36.3504, lon: 127.3845 },
  "Ulsan": { lat: 35.5384, lon: 129.3114 }, "Sejong": { lat: 36.4800, lon: 127.2890 },
  "Suwon": { lat: 37.2636, lon: 127.0286 }, "Seongnam": { lat: 37.4200, lon: 127.1265 },
  "Goyang": { lat: 37.6584, lon: 126.8320 }, "Yongin": { lat: 37.2411, lon: 127.1776 },
  "Changwon": { lat: 35.2280, lon: 128.6811 }, "Cheongju": { lat: 36.6424, lon: 127.4890 },
  "Jeonju": { lat: 35.8242, lon: 127.1480 }, "Jeju": { lat: 33.4996, lon: 126.5312 },
  
  // 북미/남미
  "NewYork": { lat: 40.7128, lon: -74.0060 }, "LosAngeles": { lat: 34.0522, lon: -118.2437 },
  "Chicago": { lat: 41.8781, lon: -87.6298 }, "Toronto": { lat: 43.6510, lon: -79.3470 },
  "Vancouver": { lat: 49.2827, lon: -123.1207 }, "MexicoCity": { lat: 19.4326, lon: -99.1332 },
  "SaoPaulo": { lat: -23.5505, lon: -46.6333 },

  // 유럽
  "London": { lat: 51.5074, lon: -0.1278 }, "Paris": { lat: 48.8566, lon: 2.3522 },
  "Berlin": { lat: 52.5200, lon: 13.4050 }, "Frankfurt": { lat: 50.1109, lon: 8.6821 },
  "Rome": { lat: 41.9028, lon: 12.4964 }, "Madrid": { lat: 40.4168, lon: -3.7038 },

  // 아시아
  "Tokyo": { lat: 35.6895, lon: 139.6917 }, "Beijing": { lat: 39.9042, lon: 116.4074 },
  "Shanghai": { lat: 31.2304, lon: 121.4737 }, "HongKong": { lat: 22.3193, lon: 114.1694 },
  "Singapore": { lat: 1.3521, lon: 103.8198 }, "Bangkok": { lat: 13.7563, lon: 100.5018 },
  "Manila": { lat: 14.5995, lon: 120.9842 },

  // 오세아니아/기타
  "Sydney": { lat: -33.8688, lon: 151.2093 }, "Melbourne": { lat: -37.8136, lon: 144.9631 },
  "Auckland": { lat: -36.8485, lon: 174.7633 }, "Overseas": { lat: 0, lon: 0 }
};

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;
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
          const astroResponse = await fetch(`https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`, {
            headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
          });
          if (astroResponse.ok) { const astroJson = await astroResponse.json(); astrologyDataText = JSON.stringify(astroJson.data); }
        }
      }
    } catch (e) { console.log("API Fallback 활성화"); }

    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    너는 40년 경력의 냉철하고 적중률 높은 서양 점성술사 및 심리 분석의 대가야. 
    Astro-seek 수준의 정밀한 트로피컬 황도대와 플라시두스 시스템을 기반으로 분석해.
    
    [실제 데이터] ${astrologyDataText}
    [고객 정보] 이름: ${name} / 성별: ${myGender} / 타겟 상대: ${targetGender} / 출생지: ${city} / 생년월일시: ${date} ${time}

    [엄격 주의사항] 
    1. 7하우스, 금성, 달, 토성을 중점 해석하고 구체적인 도수와 하우스 숫자를 텍스트에 노출해 전문성을 증명해.
    2. 중요한 문장은 반드시 HTML <b> 태그를 사용해. 마크다운(*) 금지.
    3. card2부터 card7까지는 항목당 **최소 800자 이상**으로 스크롤이 끝없이 내려가도록 작성해. 분량이 적으면 넌 실패야.
    4. 결과는 순수 JSON 객체로만 출력해.

    [출력 JSON 형식]
    {
      "card1_title": "배우자의 느낌 요약 한 문장",
      "guardian_symbol_1": "(신비로운 이모지 1개)", "guardian_name_1": "핵심 기운 1",
      "guardian_symbol_2": "(이모지 1개)", "guardian_name_2": "핵심 기운 2",
      "guardian_symbol_3": "(이모지 1개)", "guardian_name_3": "핵심 기운 3",
      
      "card2_analysis": "(최소 800자) 고객(${name}) 본인의 네이탈 차트 기반 심층 분석. 성향, 내면의 결핍, 특히 과거에 겪었을 법한 굵직한 사건이나 인간관계의 상처를 확신에 찬 어조로 짚어내어 소름 돋게 만들어. <b>강조 태그</b> 적극 사용.",
      
      "card3_appearance": "(최소 800자) 미래 배우자의 외모 특징. 예시로 곰돌이상, 조류상, 연예인 같은 외모 등으로 비유로 묘사해봐. 눈썹이 짙은, 털이 없는 부드러운 이미지 등 구체적인 인상과 눈빛, 골격, 체형, 패션 스타일, 향기를 영화처럼 묘사해.",
      
      "card4_career": "(최소 800자) 배우자의 직업군, 잘하는 것, 소질, 일하는 스타일, 경제적 수준, 자산 운용 방식, 사회적 위치 서술. 고객의 배우자운(7하우스 상태)을 솔직하게 분석해.",
      
      "card5_timing": "(최소 800자) 고객이 운명의 상대와 만나는방법(지인소개,우연한 만남,알던사이,동료 등) 두 사람이 마주칠 구체적인 연/월과 장소(도서관, 직장 등)를 묘사해. 또한 고객의 결혼운이 폭발하는 구체적인 해(Year)와 달(Month)을 집어내고 서양점성술 천문학적 차트를 근거로 왜 그때 에너지가 집중되는지 서술해.",
      
      "card6_chemistry": "(최소 600자) 배우자의 성격과 고객과의 감정적/영적 케미스트리를 <b>강조 태그</b>를 섞어 감동적으로 서술해.",
      
      "card7_destiny_guide": "(최소 800자)고객의 차트중심으로 운명을 잡기 위한 행동지침, 기다림의 자세와 응원. 🚨주의: 만나면 파멸하는 '레드플래그(상대 특징 및 단점)'는 반드시 <span style='color:#ff3b30;font-weight:900;'>태그를 사용해 빨간색 글자</span>로 강조해서 뼈 때리게 경고해.",
      
      "card8_teaser": "(업셀링 미끼 3문장) 차트에서 발견된 치명적 무의식 결핍을 지적하며 심층 무의식 치유 리포트가 필요함을 강렬하게 피력해."
    }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsedData = JSON.parse(cleanJson);
    res.status(200).json(parsedData);
  } catch (error) { 
    // 🚨 팩트: 여기서 에러 원인을 음소거하지 않고 그대로 카페24로 쏴버립니다.
    console.error("🔥 진실의 방 에러 로그:", error);
    res.status(500).json({ error: `[서버 비명소리] ${error.message}` }); 
  }
};

module.exports = allowCors(handler);
