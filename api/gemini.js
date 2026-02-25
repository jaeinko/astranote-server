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
    너는 40년 경력의 냉철하고 적중률 높은 서양 점성술(Western Astrology)의 대가이자 운명 분석가야. 
    Astro-seek 수준의 정밀한 트로피컬(Tropical) 황도대와 플라시두스(Placidus) 하우스 시스템을 기반으로 다음 데이터를 분석해.
    
    [핵심 명령: 정확한 천체 데이터 적용]
    아래는 전문 점성술 API에서 천체력을 바탕으로 정확하게 계산해 낸 고객의 실제 행성 위치 및 도수 데이터야. 
    (주의: 제공된 데이터가 사이디리얼 기준일 수 있으니, 네가 스스로 약 24도를 더해 트로피컬 기준으로 보정해서 서양 점성술의 행성, 하우스, 각도로 완벽하게 변환하여 해석해)

    [실제 천체 계산 데이터 (JSON)]
    ${astrologyDataText}

    [고객 기본 정보]
    - 이름: ${name}
    - 성별: ${myGender}
    - 타겟 배우자 성별: ${targetGender}
    - 태어난 장소: ${city}

    [엄격한 주의사항] 
    1. 분량 강제: card2부터 card7까지의 내용은 무조건 **최소 10문장 이상, 500자 이상**으로 아주 길고 상세하게 소설처럼 묘사해.
    2. 형식 강제: 텍스트 안에 별표(*)나 해시태그(#) 같은 마크다운 기호를 절대 쓰지 마. AI 포맷을 버리고 사람의 마음을 깊게 울리도록 줄글로 작성해.
    3. 결과는 반드시 아래 JSON 형식으로만 답변해. 다른 말은 절대 추가하지 마.

    [출력 JSON 형식]
    {
      "card1_title": "당신의 운명의 상대를 한마디로 표현하면 '고요한 폭풍을 품은 지략가' 입니다. 와 같이 전체적인 느낌을 한 문장으로 요약해 (Gemini said 금지)",
      "guardian_symbol_1": "고객의 기운을 상징하는 가장 예쁘고 신비로운 이모지 1개",
      "guardian_name_1": "첫 번째 이모지의 신비로운 이름 (예: 심연의 은하수)",
      "guardian_symbol_2": "고객의 기운을 상징하는 예쁜 이모지 1개",
      "guardian_name_2": "두 번째 이모지의 신비로운 이름",
      "guardian_symbol_3": "고객의 기운을 상징하는 예쁜 이모지 1개",
      "guardian_name_3": "세 번째 이모지의 신비로운 이름",
      "card2_analysis": "(최소 10문장 이상) 제공된 천체 계산 데이터(태양, 달, 상승궁, 하우스 위치, 각도 등)를 직접적으로 거론하며, 이를 바탕으로 전체적인 성향이나 과거 사건을 날카롭고 정확하게 서술해",
      "card3_appearance": "(최소 10문장 이상) 배우자의 외모적 특징, 분위기, 체형, 자주 입는 스타일을 구체적으로 길게 묘사해",
      "card4_career": "(최소 10문장 이상) 배우자의 직업군, 종사하는 필드, 관심사를 구체적으로 길게 묘사해",
      "card5_personality": "(최소 10문장 이상) 배우자의 성격을 길게 묘사하고, 고객과의 성격적 시너지도 끝에 길게 서술해",
      "card6_scenario": "(최소 10문장 이상) 처음 만나게 되는 구체적인 장소와 상황, 첫 대화 느낌을 한 편의 영화처럼 아주 길게 묘사해",
      "card7_advice": "(최소 10문장 이상) 운명을 놓치지 않기 위해 버려야 할 습관과 가져야 할 태도, 그리고 가슴을 울릴 응원의 말을 길게 첨부해"
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
