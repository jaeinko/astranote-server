// 🚨 OpenAI로 교체: 별도 npm 패키지 설치 없이 fetch로 직접 호출합니다.
// (package.json에 openai 라이브러리 안 깔려있어도 동작합니다)

// 🚨 핵심 수정 1: maxDuration을 코드에서 export.
// CJS(module.exports) 방식이라 Next.js의 `export const config`가 아니라
// vercel.json 쪽에서 함수별로 maxDuration을 지정해야 합니다.
// (이 파일 하단 + 프로젝트 루트 vercel.json 둘 다 확인하세요)

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

  // 🚨 핵심 수정 2: 함수 진입 즉시 로그 → "어디까지 살아있었는지" 추적 가능
  console.log("✅ [1] 함수 진입 성공");

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;

    if (!name || !date || !time) {
      return res.status(400).json({ error: '필수 입력값(name/date/time)이 누락되었습니다.' });
    }
    if (!process.env.OPENAI_API_KEY) {
      console.error("🔥 OPENAI_API_KEY 환경변수가 비어있음");
      return res.status(500).json({ error: '[서버 설정 오류] OPENAI_API_KEY 환경변수가 설정되지 않았습니다.' });
    }

    const location = cityCoordinates[city] || cityCoordinates["Seoul"];
    const dateTimeIso = `${date.replace(/\./g, '-')}T${time}:00+09:00`;

    let astrologyDataText = "정밀 천체 궤도 역산 데이터 기반.";
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
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
          const astroResponse = await fetch(
            `https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`,
            { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
          );
          if (astroResponse.ok) {
            const astroJson = await astroResponse.json();
            astrologyDataText = JSON.stringify(astroJson.data);
          }
        }
      }
    } catch (e) {
      console.log("⚠️ Prokerala Fallback 활성화:", e.message);
    }

    console.log("✅ [2] Prokerala 단계 완료, OpenAI 호출 시작");

    const prompt = `
    너는 40년 경력의 냉철하고 적중률 높은 서양 점성술사 및 심리 분석의 대가야.
    Astro-seek 수준의 정밀한 트로피컬 황도대와 플라시두스 시스템을 기반으로 분석해.

    [실제 데이터] ${astrologyDataText}
    [고객 정보] 이름: ${name} / 성별: ${myGender} / 타겟 상대: ${targetGender} / 출생지: ${city} / 생년월일시: ${date} ${time}

    [엄격 주의사항]
    1. 7하우스, 금성, 달, 토성을 중점 해석하고 구체적인 도수와 하우스 숫자를 텍스트에 노출해 전문성을 증명해.
    2. 중요한 문장은 반드시 HTML <b> 태그를 사용해. 마크다운(*) 금지.
    3. card2부터 card7까지는 항목당 최소 500자 이상으로 작성해.
    4. 결과는 순수 JSON 객체로만 출력해.

    [출력 JSON 형식]
    {
      "card1_title": "배우자의 느낌 요약 한 문장",
      "guardian_symbol_1": "(신비로운 이모지 1개)", "guardian_name_1": "핵심 기운 1",
      "guardian_symbol_2": "(이모지 1개)", "guardian_name_2": "핵심 기운 2",
      "guardian_symbol_3": "(이모지 1개)", "guardian_name_3": "핵심 기운 3",
      "card2_analysis": "(최소 500자) 고객(${name}) 본인의 네이탈 차트 기반 심층 분석.",
      "card3_appearance": "(최소 500자) 미래 배우자의 외모 특징.",
      "card4_career": "(최소 500자) 배우자의 직업군, 경제적 수준, 사회적 위치.",
      "card5_timing": "(최소 500자) 만남의 방식, 시기, 장소와 그 근거.",
      "card6_chemistry": "(최소 400자) 감정적/영적 케미스트리.",
      "card7_destiny_guide": "(최소 500자) 행동지침과 레드플래그. 레드플래그는 <span style='color:#ff3b30;font-weight:900;'>태그로 강조.",
      "card8_teaser": "(업셀링 미끼 3문장)"
    }
    `;

    // 🚨 핵심: OpenAI Chat Completions API를 fetch로 직접 호출
    // response_format: json_object → JSON 강제, 코드펜스(```json) 문제 자체가 사라짐
    const openaiResponse = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${process.env.OPENAI_API_KEY}`
      },
      body: JSON.stringify({
        model: 'gpt-4o-mini', // 비용 저렴 + 충분히 빠름. 품질 더 원하면 'gpt-4o'로 교체
        messages: [
          { role: 'user', content: prompt }
        ],
        response_format: { type: 'json_object' },
        temperature: 0.9,
        max_tokens: 8192
      })
    });

    if (!openaiResponse.ok) {
      const errBody = await openaiResponse.text();
      console.error("🔥 OpenAI 응답 실패:", openaiResponse.status, errBody);
      return res.status(500).json({ error: `[OpenAI 오류 ${openaiResponse.status}] ${errBody}` });
    }

    const openaiData = await openaiResponse.json();

    console.log("✅ [3] OpenAI 응답 수신 완료");

    const responseText = openaiData.choices[0].message.content;
    const cleanJson = responseText.replace(/```json/gi, '').replace(/```/gi, '').trim();
    const parsedData = JSON.parse(cleanJson);

    console.log("✅ [4] JSON 파싱 성공, 응답 전송");
    res.status(200).json(parsedData);

  } catch (error) {
    // 이제 SIGKILL이 아닌 진짜 JS 예외만 여기 도달함 (timeout 문제 해결 후 기준)
    console.error("🔥 진실의 방 에러 로그:", error);
    res.status(500).json({ error: `[서버 비명소리] ${error.message}` });
  }
};

module.exports = allowCors(handler);
