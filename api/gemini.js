const { GoogleGenerativeAI } = require('@google/generative-ai');

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return await fn(req, res);
};

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST만 가능' });

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;
    
    // Vercel 환경변수에서 API 키 호출
    const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY);
    const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

    // 🔥 정통 서양 점성술 기반의 7단계 정밀 타겟팅 프롬프트 🔥
    const prompt = `
    너는 40년 경력의 냉철하고 적중률 높은 서양 점성술(Western Astrology)의 대가이자 운명 분석가야. 
    Astro-seek 수준의 정밀한 트로피컬(Tropical) 황도대와 플라시두스(Placidus) 하우스 시스템을 기반으로 다음 고객의 탄생 데이터를 분석해.
    절대 사주명리나 동양 철학을 섞지 말고, 오직 서양 점성술의 행성(Planets), 하우스(Houses), 각도(Aspects) 이론에 입각해서 분석을 도출해.
    절대 가짜로 지어낸 티를 내지 말고, 매우 전문적이고 신비로운 어조로 작성해.
    
    [엄격한 주의사항] 
    답변 텍스트 안에 별표(*) 기호나 해시태그(#) 같은 마크다운 기호를 절대 쓰지 마. AI가 쓴 것 같은 기계적인 포맷이나 글머리 기호를 모두 버리고, 전문가가 직접 써 내려간 자연스러운 줄글로 사람의 마음을 깊게 울리도록 작성해.
    결과는 반드시 아래 JSON 형식으로만 답변해. 포맷 외의 다른 말은 절대 추가하지 마.

    [고객 데이터]
    - 이름: ${name}
    - 성별: ${myGender}
    - 생년월일: ${date}
    - 태어난 시간: ${time}
    - 태어난 도시: ${city}

    [출력 JSON 형식]
    {
      "card1_title": "당신의 운명의 상대를 한마디로 표현하면 '사슴의 눈망울을 가진 전략가' 입니다. Gemini said. (반드시 문장 끝에 'Gemini said.' 를 포함해서 전체적인 배우자의 느낌을 한 문장으로 요약해)",
      "sun_sign": "고객의 태양궁 (예: 전갈자리)",
      "moon_sign": "고객의 달자리 (예: 처녀자리)",
      "rising_sign": "고객의 상승궁 (예: 천칭자리)",
      "card2_analysis": "고객의 생년월일시와 출생지를 바탕으로 주요 행성의 기운을 3문장으로 요약해. 그리고 전체적인 성향이나 과거에 있었을 법한 중요한 사건(심리적, 환경적 변화)을 날카롭고 정확하게 분석해서 서술해",
      "card3_appearance": "배우자의 외모적 특징, 풍기는 분위기, 체형, 자주 입는 스타일을 아주 구체적으로 묘사해",
      "card4_career": "배우자의 직업군, 종사하는 직업 필드, 관심 있어 하는 것을 구체적으로 묘사해",
      "card5_personality": "배우자의 성격을 묘사해. 그리고 마지막 3줄은 고객과의 성격적 시너지에 대해 서술해",
      "card6_scenario": "두 사람이 처음 만나게 되는 구체적인 장소와 상황, 첫 대화의 느낌을 한 편의 영화처럼 묘사해",
      "card7_advice": "이 운명을 놓치지 않기 위해 고객이 지금부터 버려야 할 습관과 가져야 할 태도 1가지씩 조언하고, 가슴을 울릴 응원의 말 한마디를 첨부해"
    }
    `;

    const result = await model.generateContent(prompt);
    const responseText = result.response.text();
    
    // JSON 데이터 클렌징 및 파싱
    const cleanJson = responseText.replace(/\`\`\`json/g, '').replace(/\`\`\`/g, '').trim();
    const parsedData = JSON.parse(cleanJson);

    res.status(200).json(parsedData);
  } catch (error) {
    console.error(error);
    res.status(500).json({ error: '우주 데이터 동기화 중 오류 발생' });
  }
};

module.exports = allowCors(handler);
