const { GoogleGenerativeAI } = require('@google/generative-ai');

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return await fn(req, res);
};

// 위경도 매핑 (구글맵 유료 API 대체용 하드코딩)
const cityCoordinates = {
  "서울": { lat: 37.5665, lon: 126.9780 },
  "부산": { lat: 35.1796, lon: 129.0756 },
  "대구": { lat: 35.8714, lon: 128.6014 },
  "인천": { lat: 37.4563, lon: 126.7052 },
  "광주": { lat: 35.1595, lon: 126.8526 },
  "대전": { lat: 36.3504, lon: 127.3845 },
  "울산": { lat: 35.5384, lon: 129.3114 },
  "세종": { lat: 36.4800, lon: 127.2890 },
  "경기": { lat: 37.2752, lon: 127.0095 },
  "강원": { lat: 37.8854, lon: 127.7298 },
  "충북": { lat: 36.6356, lon: 127.4913 },
  "충남": { lat: 36.6588, lon: 126.6728 },
  "전북": { lat: 35.8202, lon: 127.1088 },
  "전남": { lat: 34.8161, lon: 126.4629 },
  "경북": { lat: 36.5760, lon: 128.5056 },
  "경남": { lat: 35.2383, lon: 128.6924 },
  "제주": { lat: 33.4890, lon: 126.4983 }
};

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능' });

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;
    
    // 1. 위경도 및 시간 세팅
    const cityKey = city ? city.substring(0, 2) : "서울";
    const location = cityCoordinates[cityKey] || cityCoordinates["서울"];
    const dateTimeIso = `${date}T${time}:00+09:00`;

    // 2. Prokerala API에서 진짜 천체 데이터 가져오기
    let astrologyDataText = "외부 API 연결 지연으로 인해 제미나이 자체 알고리즘으로 별자리를 추론합니다.";
    try {
      const tokenResponse = await fetch('https://api.prokerala.com/token', {
        method: 'POST',
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: new URLSearchParams({
          grant_type: 'client_credentials',
          client_id: process.env.PROKERALA_CLIENT_ID,
          client_secret: process.env.PROKERALA_CLIENT_SECRET
        })
      });
      
      if (tokenResponse.ok) {
        const tokenData = await tokenResponse.json();
        
        const astroResponse = await fetch(`https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`, {
          headers: { 'Authorization': `Bearer ${tokenData.access_token}` }
        });
        
        if (astroResponse.ok) {
          const astroJson = await astroResponse.json();
          astrologyDataText = JSON.stringify(astroJson.data);
        }
      }
    } catch (e) {
      console.log("Prokerala 연결 에러 (자체 추론으로 대체)", e);
    }

    // 3. 제미나이 AI 호출 및 프롬프트 주입
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    const prompt = `
    너는 40년 경력의 냉철하고 적중률 높은 서양 점성술(Western Astrology)의 대가야. 타겟 고객은 트렌디하고 감각적인 세대야. 
    Astro-seek 수준의 정밀한 트로피컬(Tropical) 황도대와 플라시두스(Placidus) 하우스 시스템 데이터를 기반으로 분석해.
    올드한 점쟁이 말투는 버리고, 세련되고 철학적이면서도 뼈를 때리는 날카로운 통찰력으로 사람의 마음을 울려.
    
    [핵심 명령: 정확한 천체 데이터 및 강조 효과 적용]
    1. 아래 제공된 실제 천체 계산 데이터(행성 위치, 도수, 하우스 등)에서 "전갈자리 26도", "8하우스에 위치한 명왕성" 같은 구체적인 숫자와 데이터를 텍스트에 적극적으로 노출시켜서 압도적인 전문성을 보여줘.
    2. 중요한 키워드나 소름 돋는 통찰 문장에는 반드시 HTML <b> 태그를 사용해서 굵게 강조해 (예: 당신의 차트는 <b>강렬한 물의 기운</b>이 지배하고 있습니다). 
    주의: 별표(*)나 해시태그(#) 같은 마크다운은 절대 쓰지 마. 오직 <b> 태그만 사용해.

    [실제 천체 계산 데이터 (JSON)]
    ${astrologyDataText}

    [고객 기본 정보]
    - 이름: ${name}
    - 성별: ${myGender}
    - 타겟 배우자 성별: ${targetGender}
    - 태어난 장소: ${city}

    [엄격한 주의사항] 
    1. 분량 폭발: card2부터 card7까지의 내용은 무조건 **최소 15문장 이상**으로 스크롤이 한참 내려가도록 아주 길고, 딥(Deep)하게 작성해.
    2. 결과는 반드시 아래 JSON 형식으로만 답변해.

    [출력 JSON 형식]
    {
      "card1_title": "당신의 운명의 상대를 한마디로 표현하면 '고요한 폭풍을 품은 지략가' 입니다. 처럼 전체적인 느낌을 한 문장으로 요약해 (Gemini said 금지)",
      "guardian_symbol_1": "배우자의 핵심 기운을 상징하는 가장 예쁘고 신비로운 이모지 1개",
      "guardian_name_1": "첫 번째 이모지의 세련된 키워드 (예: 심연의 지혜)",
      "guardian_symbol_2": "배우자의 기운을 상징하는 예쁜 이모지 1개",
      "guardian_name_2": "두 번째 이모지의 세련된 키워드",
      "guardian_symbol_3": "배우자의 기운을 상징하는 예쁜 이모지 1개",
      "guardian_name_3": "세 번째 이모지의 세련된 키워드",
      "card2_analysis": "(최소 15문장) 구체적인 도수와 하우스를 거론하며 성향과 과거 사건을 날카롭게 <b>강조 태그</b>를 섞어 아주 길게 분석해",
      "card3_appearance": "(최소 15문장) 배우자의 외모, 체형, 패션, 풍기는 향기까지 세련된 묘사로 <b>강조 태그</b>를 섞어 길게 서술해",
      "card4_career": "(최소 15문장) 배우자의 직업, 재력, 일하는 방식, 관심사를 <b>강조 태그</b>를 섞어 구체적이고 길게 서술해",
      "card5_personality": "(최소 15문장) 배우자의 성격과 고객과의 케미스트리를 <b>강조 태그</b>를 섞어 감동적이고 길게 서술해",
      "card6_scenario": "(최소 15문장) 고객과 배우자의 차트 기운(외향/내향, 원소 등)을 철저히 분석하여, 시끌벅적한 곳뿐만 아니라 고요한 자연, 인적이 드문 곳, 도서관, 높은 산 등 두 사람의 성향에 완벽하게 부합하는 구체적인 만남의 장소와 상황을 <b>강조 태그</b>를 섞어 한 편의 영화처럼 아주 길게 묘사해",
      "card7_advice": "(최소 15문장) 뼈때리는 현실 조언과 가슴을 울리는 응원을 <b>강조 태그</b>를 섞어 아주 길게 첨부해"
    }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    const cleanJson = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    res.status(200).json(parsedData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '우주 데이터 동기화 중 오류 발생' });
  }
};

module.exports = allowCors(handler);
