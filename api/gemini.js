// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출로 패키지 버전 문제 원천 차단

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


// ===== 🔬 차트 정밀 다이제스트 =====
// Prokerala의 베딕(사이더리얼) 좌표를 서양 점성술(트로피컬)로 보정하고,
// AI가 바로 이해할 수 있는 한국어 요약으로 변환합니다. 이게 리포트 품질의 핵심입니다.
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점' };

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000); // 라히리 아야남샤 근사치
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
      planets[nameKr] = signDeg(p.longitude + ay); // 사이더리얼 → 트로피컬 보정
    }
    const asc = planets['상승점'];
    const lines = [];
    if (asc) {
      const dsc = signDeg(asc.abs + 180);
      lines.push(`상승점(ASC): ${asc.sign} ${asc.deg}도`);
      lines.push(`7하우스(배우자궁) 시작점: ${dsc.sign} ${dsc.deg}도 ← 배우자 해석의 최우선 근거`);
    }
    for (const n of ['태양','달','수성','금성','화성','목성','토성']) {
      if (!planets[n]) continue;
      let houseTxt = '';
      if (asc) {
        const h = Math.floor((((planets[n].abs - asc.abs) + 360) % 360) / 30) + 1;
        houseTxt = ` (${h}하우스${h === 7 ? ' ← 배우자궁 안에 있음! 매우 중요' : ''})`;
      }
      lines.push(`${n}: ${planets[n].sign} ${planets[n].deg}도${houseTxt}`);
    }
    return lines.join('\n');
  } catch (e) { return null; }
}

const handler = async (req, res) => {
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log("✅ [1] gemini.js 진입 성공");

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
          if (astroResponse.ok) {
            const astroJson = await astroResponse.json();
            const digest = buildChartDigest(astroJson.data, dateTimeIso);
            astrologyDataText = digest || JSON.stringify(astroJson.data);
            console.log("📊 차트 다이제스트:\n" + astrologyDataText);
          }
        }
      }
    } catch (e) { console.log("⚠️ Prokerala Fallback:", e.message); }

    console.log("✅ [2] Prokerala 완료, Gemini 호출 시작");

    // 🚨 오늘 날짜를 명시해서 AI가 과거 연도를 쓰는 버그 차단
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `
[🚨 시간 기준 - 최우선 규칙]
오늘은 ${todayStr}이다. 너의 학습 데이터 기준 연도가 아니라 이 날짜가 진짜 현재다.
만남/기회/운이 열리는 시기 등 모든 미래 예측 시기는 반드시 오늘(${todayStr}) 이후의 연도와 월로만 써라.
과거 연도(예: 2024년, 2025년 상반기 등 이미 지난 시기)를 미래 시기로 쓰면 치명적인 실패다.

    너는 40년 경력의 서양 점성술 대가이자, 사람의 인연을 소름 돋게 맞히기로 소문난 상담사야.
    이 사람의 서양 점성술 차트를 보고, 앞으로 만날 배우자가 '어떤 사람인지'를 눈앞에 그려지듯 정확하게 집어내는 게 네 임무야.
    이 리포트는 100만원짜리 1:1 상담처럼 느껴져야 해. 절대 가볍거나 뻔하면 안 돼.

    [가장 중요한 무기: 7하우스]
    서양 점성술에서 7하우스는 '배우자와 결혼'을 관장하는 자리야.
    이 사람의 7하우스에 어떤 별자리와 행성이 들어있는지를 핵심 근거로 삼아서, 배우자의 성격/외모/직업을 확신 있게 짚어라.
    (예: 7하우스에 어떤 기운이 있으니 → 당신의 배우자는 이런 사람이다, 라는 흐름)

    [정밀 계산된 네이탈 차트 - 트로피컬(서양식) 기준]\n${astrologyDataText}\n위 좌표는 실제 천체 계산 결과다. 반드시 이 데이터의 별자리/도수/하우스를 그대로 인용하고, 없는 배치를 지어내지 마라.
    [고객 정보] 이름: ${name} / 성별: ${myGender} / 찾는 상대: ${targetGender} / 출생지: ${city} / 생년월일시: ${date} ${time}


    [중심 서사 규칙 - 리포트 품질의 생명]
    위 차트에서 배우자·사랑과 가장 관련 깊은 강력한 배치 1~2개를 골라라 (우선순위: ① 7하우스 안의 행성 → ② 7하우스 별자리 → ③ 금성/달의 위치).
    그 배치 하나를 리포트 전체를 관통하는 '중심 스토리'로 삼아, 모든 카드가 하나의 이야기로 이어지게 하라. 카드마다 따로 노는 리포트는 실패작이다.

    [문체 기준 - 반드시 이 수준으로]
    좋은 예: "<b>당신의 7하우스는 게자리 7.7도에서 시작하고, 그 방 안에 토성이 앉아 있습니다.</b> 인연이 늦었던 것은 인연이 없어서가 아니라, 가장 단단한 인연이 오도록 설계되어 있었기 때문입니다."
    나쁜 예(절대 금지): "좋은 인연을 만날 수 있습니다", "긍정적인 마음이 중요합니다", "행복한 미래가 기대됩니다" 같은 하나마나한 덕담 / "~일 수 있습니다", "~로 보입니다" 같은 발뺌 화법 / 근거 없는 형용사 나열.
    첫 만남 장면은 영화의 한 장면처럼: 장소의 공기, 상대의 첫 행동, 그 순간 느끼는 감각까지 구체적으로 그려라.
\n    [글 쓰는 방식 - 꼭 지켜]
    1. 🚨 [근거 제시 필수] 모든 카드에서, 해석을 말하기 전에 반드시 차트상의 근거를 먼저 밝혀라.
       형식: "<b>당신의 7하우스에는 OO자리가 자리하고 있고, 그 안에 OO(행성)이 OO도에 위치합니다.</b> 이것이 의미하는 바는..." 처럼
       [차트 근거] → [해석] 순서로 써라. 근거 없이 해석만 나열하면 실패다.
       위의 [실제 데이터]에 담긴 행성 위치 정보를 실제로 읽고 인용해라. 지어내지 마라.
    2. 단, 근거는 카드당 1~2개만 굵고 명확하게. 용어를 줄줄이 나열하며 어렵게 쓰지 마라. 근거를 댄 후의 해석은 쉽고 따뜻한 일상 언어로 풀어라. "당신은~", "당신의 배우자는~" 처럼 눈앞에서 말을 거는 어조로.
    3. 뭉뚱그리지 마. "좋은 사람일 수 있어요" (X) → "당신의 배우자는 말수가 적지만 한번 뱉은 약속은 반드시 지키는 사람입니다" (O) 처럼 딱 집어서 단정해라.
    4. 배우자의 특성은 최대한 구체적으로: 성격, 말투, 분위기, 외모 인상, 직업 느낌, 돈 씀씀이, 만났을 때의 첫 느낌까지.
    5. 만나는 시기는 반드시 구체적인 "연도와 월(예: 2027년 봄, 3월~5월)"로 못 박고, 왜 그 시기인지도 차트 근거(행성의 이동)로 설명하라. 절대 생략 금지.
    6. 강조할 문장은 <b> 태그로. 마크다운(*) 금지.
    7. card2부터 card7까지 항목당 최소 500자 이상.
    8. 결과는 순수 JSON 객체로만 출력. 앞뒤에 아무것도 붙이지 마.

    [출력 JSON 형식]
    {
      "card1_title": "배우자가 어떤 사람인지 한 문장으로 요약",
      "guardian_symbol_1": "(신비로운 이모지 1개)", "guardian_name_1": "핵심 기운 1",
      "guardian_symbol_2": "(이모지 1개)", "guardian_name_2": "핵심 기운 2",
      "guardian_symbol_3": "(이모지 1개)", "guardian_name_3": "핵심 기운 3",
      "card2_analysis": "(최소 500자) 당신은 어떤 사람인지. 먼저 당신의 태양/달 별자리 위치를 근거로 밝히고, 성향과 연애에서 반복돼온 패턴을 따뜻하지만 정확하게 짚어라.",
      "card3_appearance": "(최소 500자) 배우자의 외모. 먼저 7하우스의 별자리와 행성을 근거로 밝히고('당신의 7하우스에는 OO이...'), 그로부터 첫인상/눈빛/체형/분위기/스타일을 사진 보듯 생생하게. 곰돌이상, 여우상 같은 비유도 좋다.",
      "card4_career": "(최소 500자) 배우자의 직업과 성격. 7하우스와 관련 행성을 근거로 먼저 밝히고, 어떤 일을 하는 사람인지, 돈은 어떻게 쓰는지, 당신을 어떻게 대할지를 구체적으로.",
      "card5_timing": "(최소 700자) [필수] 만나는 시기를 반드시 서로 다른 3개의 구간으로 제시하라. 형식: '① 첫 번째 인연의 신호가 오는 시기(가장 가까운 미래) → ② 가장 강력한 결정적 만남의 시기 → ③ 관계가 결실(약속/결혼)로 무르익는 시기'. 세 시기 모두 반드시 구체적인 연도와 월(예: 2026년 하반기 10~12월 / 2027년 5~9월 / 2028년 봄 3~5월)로 못 박아라. 🚨오늘 날짜 이후의 미래 시점만 써라. 각 시기마다 왜 그때인지 행성의 흐름(목성/토성의 이동 등)을 근거로 짧게 설명하라. 그리고 어떻게 만나는지(소개/우연/이미 아는 사이 등)와 첫 만남의 순간을 영화처럼 실감나게 그려라. 시기 생략이나 뭉뚱그리기 절대 금지.",
      "card6_chemistry": "(최소 400자) 두 사람의 케미. 두 기운이 만나는 지점을 근거로 밝히고, 어떤 점이 잘 맞고 어떻게 끌리는지를 <b>강조</b> 섞어 감동적으로.",
      "card7_destiny_guide": "(최소 500자) 좋은 인연을 잡기 위한 조언과 응원. 단, 만나면 힘들어지는 '피해야 할 상대의 특징(레드플래그)'은 <span style='color:#ff3b30;font-weight:900;'>빨간 글씨</span>로 분명하게 경고하라.",
      "card8_teaser": "(더 깊은 리포트를 권하는 미끼 3문장)"
    }
    `;

    // ✅ Gemini v1beta 직접 호출
    // - thinkingBudget 0: '생각' 기능 OFF → 응답속도 10~25초로 단축 (504 타임아웃 해결)
    // - responseMimeType JSON: 순수 JSON만 답하도록 강제 (500 파싱에러 해결)
    // - 실패 시 자동 1회 재시도 + 깨진 JSON 복구 파싱
    let parsedData = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 2; attempt++) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 16384,
                temperature: 0.9,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 0 }
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
        console.log(`✅ [3] Gemini 응답 수신 (시도 ${attempt})`);

        const parts = (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts) || [];
        const responseText = parts.map(p => p.text || "").join("");
        const s = responseText.indexOf("{");
        const e = responseText.lastIndexOf("}");
        if (s === -1 || e === -1) {
          lastErr = "응답에 JSON 없음: " + responseText.slice(0, 200);
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          continue;
        }
        parsedData = JSON.parse(responseText.slice(s, e + 1));
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}] 실패:`, err.message);
      }
    }

    if (!parsedData) {
      return res.status(500).json({ error: `[Gemini 실패] ${lastErr}` });
    }

    console.log("✅ [4] JSON 파싱 성공, 응답 전송");
    res.status(200).json(parsedData);

  } catch (error) {
    console.error("🔥 gemini.js 에러:", error);
    res.status(500).json({ error: `[서버 에러] ${error.message}` });
  }
};

module.exports = allowCors(handler);
