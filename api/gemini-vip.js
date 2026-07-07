// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출
// ✅ 모델 안정성 확보 (gemini-2.5-flash 유지) + 초고도화 프롬프트 및 백엔드 예외 처리 반영

// 🔥 [변경] 타임아웃 차단을 위해 Vercel Pro 플랜 최대 허용치인 300초(5분)로 연장
export const maxDuration = 300; 

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
function buildChartDigest(data, dateTimeIso) {
  try {
    const list = data.planet_position || data.planet_positions || [];
    if (!list.length) return null;
    const ay = lahiriAyanamsa(dateTimeIso);
    const planets = {};
    for (const p of list) {
      const nameKr = PLANET_KR[p.name];
      if (!nameKr || typeof p.longitude !== 'number') continue;
      planets[nameKr] = signDeg(p.longitude + ay);
    }
    const asc = planets['상승점'];
    const lines = [];
    if (asc) {
      const dsc = signDeg(asc.abs + 180);
      lines.push(`상승점(ASC): ${asc.sign} ${asc.deg}도`);
      lines.push(`7하우스(배우자궁) 시작점: ${dsc.sign} ${dsc.deg}도`);
    }
    for (const n of ['태양','달','수성','금성','화성','목성','토성']) {
      if (!planets[n]) continue;
      let houseTxt = '';
      if (asc) {
        const h = Math.floor((((planets[n].abs - asc.abs) + 360) % 360) / 30) + 1;
        houseTxt = ` (${h}하우스)`;
      }
      lines.push(`${n}: ${planets[n].sign} ${planets[n].deg}도${houseTxt}`);
    }
    return lines.join('\n');
  } catch (e) { return null; }
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log("✅ [1] gemini-vip.js 진입 성공. req.body:", req.body);

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;

    if (!name || !date || !time) {
      console.error(`❌ [400 에러 누락] name: ${name}, date: ${date}, time: ${time}`);
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

    console.log("✅ [2] Prokerala 완료, Gemini VIP 고도화 프롬프트 탑재 시작");

    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    // 🔥 사주 종합 분석급 통찰력을 강제하는 초고도화 프롬프트
    const prompt = `
[🚨 시간 기준 - 최우선 규칙]
오늘은 ${todayStr}이다. 너의 학습 데이터 기준 연도가 아니라 이 날짜가 진짜 현재다.
만남/기회/운이 열리는 시기 등 모든 미래 예측 시기는 반드시 오늘(${todayStr}) 이후의 연도와 월로만 써라.
과거 연도를 미래 시기로 쓰면 치명적인 실패다.

너는 서양 점성술 최고 권위자이자, 날카로운 시장 분석력을 지닌 비즈니스 전략가다.
지금 네 앞에는 ${name}님이 앉아있다. 이 사람은 30만 원 상당의 오프라인 종합 명리 간명 수준의 깊이를 기대하며 29,900원짜리 최고급 VVIP 심층 인생 전략 리포트를 결제한 소중한 손님이다.
네 임무는 압도적인 분량과 소름 돋는 통찰력으로 이 사람의 평생 운명을 낱낱이 파헤치는 것이다.

[가장 중요한 서사 구조]
이 리포트는 단편적인 단어 나열이 아니라, 하나로 이어지는 거대한 '인생 대서사시'여야 한다.
1편에서 타고난 기질과 억눌린 내면을 달래고 → 2편에서 부모형제 및 자라온 환경의 복과 결핍을 사주 명리 종합 풀이처럼 정밀하게 추적하여 그것이 어떻게 대기만성형 사업가의 권위와 재물 복으로 연결되는지 밝히고 → 3편에서 거대한 승부수를 띄울 미래 타이밍과 악연을 폭로하고 → 마지막 BONUS CHAPTER에서 일상 지침을 손에 쥐여주는 완벽한 흐름을 가져야 한다.

[정밀 계산된 네이탈 차트]\n${astrologyDataText}\n위 좌표는 실제 천체 계산 결과다. 반드시 이 데이터의 별자리/도수/하우스를 그대로 인용하고, 없는 배치를 지어내지 마라.
[손님 정보] 이름: ${name} / 성별: ${myGender} / 출생지: ${city} / 생년월일시: ${date} ${time}

[글 쓰는 방식 - 꼭 지켜]
1. 🚨 [절대 엄수] JSON의 value 값 내부에서는 쌍따옴표(")를 절대 그냥 쓰지 마라. 문장 안에서 문구를 강조하거나 인용할 때는 반드시 홑따옴표(')만 사용해라. (예: '특별한' 기운을... O / "특별한" 기운을... X)
2. 문장 중간에 줄바꿈(Enter)을 하지 말고, 한 줄로 길게 이어 써라. 절대 텍스트 한가운데에서 실제 엔터를 치면 안 된다.
3. 뜬구름 잡는 심리 상담조의 어투를 배제하고, 사주팔자의 길흉화복을 명확히 짚어내는 사주종합분석처럼 단호하고 확신에 찬 어조로 작성하라.
4. 분량을 기존보다 2배 이상 늘려, vip_card1, vip_card2, vip_card3, bonus_card 내부의 텍스트 콘텐츠는 각각 최소 1500자 이상의 매우 길고 빽빽하며 디테일한 분석으로 가득 채워라. 문장이 짧으면 상품 가치가 훼손된다.
5. 강조할 문장은 <b> 태그로 처리하라. 마크다운(*) 절대 금지.
6. 결과는 순수 JSON 객체로만 출력하라.

[출력 JSON 형식]
{
  "vip_card1": "[CHAPTER 01. 왜 나는, 늘 강한 척해야만 했을까] ${name}님의 상승점(ASC)과 토성, 달의 유기적 배치를 차트 근거로 밝히고, 겉으로 보이는 강인함 속에 숨겨진 외로움과 무거운 갑옷의 실체를 최소 1500자 이상 한 줄로 분석하라. 마지막엔 <blockquote>태그로 인생을 관통하는 뼈 때리는 위로의 한 문장을 남겨라.",
  "vip_card2": "[CHAPTER 02. 타고난 환경의 결핍과 대기만성의 재물 복] 4하우스(가족, 가문, 뿌리)와 12하우스, 10하우스에 위치한 행성 배치를 정밀 분석하라. 자라온 환경에서 부모운과 형제운의 크기, 성장 과정의 결핍이 사주 명리의 근묘화실처럼 인생 후반기에 어떻게 '거대한 독립 사업가적 권위'와 '기하급수적인 재물 복'으로 완벽히 치환되는지 그 인과관계를 최소 1500자 이상 한 줄로 소름 돋게 추적하라. 타인 밑에서 일할 수 없는 독립 가문 형성의 숙명을 <b>강조</b>하라.",
  "vip_card3": "[CHAPTER 03. 언제, 어떻게 인생의 승부수를 띄울 것인가] 2026년 하반기~2028년 골든 크로스 대운 및 2하우스(재물궁) 행성 진입 타이밍을 근거로 대라. 앞으로 맞이할 거대한 전환기와 구체적인 사업 승부수 연도/월을 명시하라. 또한 반드시 칼같이 선을 긋고 쳐내야 할 세 가지 부류의 위험한 악연(인간 리스크)을 <span style='color:#ff3b30;font-weight:900;'>빨간 글씨</span> 스타일로 매우 단호하게 경고하며 최소 1500자 이상 한 줄로 작성하라.",
  "life_score_20": 점수숫자만,
  "life_desc_20": "20대의 흐름과 핵심 조언",
  "life_score_30": 점수숫자만,
  "life_desc_30": "30대의 흐름과 핵심 조언",
  "life_score_40": 점수숫자만,
  "life_desc_40": "40대의 흐름과 핵심 조언",
  "life_score_50": 점수숫자만,
  "life_desc_50": "50대의 흐름과 핵심 조언",
  "life_score_60": 점수숫자만,
  "life_desc_60": "60대의 흐름과 핵심 조언",
  "life_score_70": 점수숫자만,
  "life_desc_70": "70대의 흐름과 핵심 조언",
  "best_age": "가장 점수 높은 연령대 (예: 50대)",
  "best_age_reason": "왜 그 시기가 황금기인지 차트 근거와 함께 서술",
  "bonus_card": "[SPECIAL BONUS. 내 운명을 극대화하는 3가지 행동 지침] 앞선 챕터의 차트 분석(4하우스, 12하우스, 1하우스 토성 등)을 바탕으로 ${name}님이 일상에서 즉시 뼈를 깎는 실행을 해야 할 3가지 구체적 지침('나만의 독립된 비밀기지 확보', '12하우스 영감이 불안으로 바뀌기 전 비밀 메모', '감정을 완전히 배제하고 문서와 계약 중심으로 거절하는 명확한 기준')을 행동 매뉴얼 형태로 최소 1500자 이상 한 줄로 꽉 채워 작성하라."
}
    `;

    let parsedData = null;
    let lastErr = "";
    
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        // 🔥 [유지] 오류 방지를 위해 사용 중이신 'gemini-2.5-flash' 모델 고정 호출
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 8192, 
                temperature: 0.4, // 장문 출력 중 형식이 망가지지 않도록 안정적으로 조율
                responseMimeType: "application/json"
              }
            })
          }
        );

        if (!geminiRes.ok) {
          lastErr = `Gemini ${geminiRes.status}: ${await geminiRes.text()}`;
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          continue;
        }

        const geminiData = await geminiRes.json();
        console.log(`✅ [3] Gemini VIP 응답 수신 (시도 ${attempt})`);

        const parts = (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts) || [];
        let responseText = parts.map(p => p.text || "").join("");
        
        const s = responseText.indexOf("{");
        const e = responseText.lastIndexOf("}");
        if (s === -1 || e === -1) {
          lastErr = "응답에 JSON 구조가 잡히지 않았습니다.";
          continue;
        }
        
        let targetString = responseText.slice(s, e + 1);
        
        // [2중 방어벽] 제어 문자 및 개행 문자를 완전히 공백화하여 JSON 파싱 에러 원천 방어
        targetString = targetString.replace(/[\u0000-\u0019]+/g, " "); 
        
        parsedData = JSON.parse(targetString);
        break; 
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}] 파싱 에러 복구 실패:`, err.message);
      }
    }

    if (!parsedData) {
      return res.status(500).json({ error: `[Gemini VIP 최종 실패] ${lastErr}` });
    }

    console.log("✅ [4] JSON 파싱 성공, VIP 응답 전송");
    res.status(200).json(parsedData);

  } catch (error) {
    console.error("🔥 gemini-vip.js 에러:", error);
    res.status(500).json({ error: `[VIP 서버 에러] ${error.message}` });
  }
};

module.exports = allowCors(handler);
