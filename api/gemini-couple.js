// ============================================================================
//  api/gemini-couple.js  —  아스트라노트 궁합 리포트 (19,900원 / 특가 14,900원)
// ----------------------------------------------------------------------------
//  ★ 기존 api/gemini.js, api/gemini-vip.js 를 전혀 수정하지 않습니다.
//     새 파일 2개(lib/astro-synastry.js + 이 파일)만 추가하면 배포 끝입니다.
//
//  설계 원칙
//   1) 점수·시기·각도는 전부 코드가 계산 → AI는 '해석'만 한다 (재현성 보장)
//   2) 생성 락(SET NX EX)으로 중복 결제/더블클릭 시 Gemini 이중 호출 차단
//   3) 상태 머신(pending → completed / failed) + 상태별 캐시 헤더 분리
//   4) 두 사람 이름 혼용을 코드에서 검증 → 실패 시 재생성
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');
const SYN = require('../lib/astro-synastry.js');

// ⚠️ [필수 작업] api/gemini.js 상단의 cityCoordinates 객체를 그대로 복사해
//    lib/cities.js 로 옮기고 module.exports = cityCoordinates 한 줄만 붙이세요.
//    (좌표 목록이 두 상품에서 어긋나면 출생지가 조용히 서울로 대체되는 사고가 납니다)
const cityCoordinates = require('../lib/cities.js');

const KEY_PREFIX = 'couple-report:';
const LOCK_PREFIX = 'couple-lock:';
const TTL_DAYS = 60;

/* -------------------------------------------------------------------------
   CORS
------------------------------------------------------------------------- */
function allowCors(fn) {
  return async (req, res) => {
    res.setHeader('Access-Control-Allow-Credentials', 'true');
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
    if (req.method === 'OPTIONS') { res.status(200).end(); return; }
    return await fn(req, res);
  };
}

/* -------------------------------------------------------------------------
   입력 정규화 · 검증
------------------------------------------------------------------------- */
function cleanName(v) {
  return String(v || '').trim().replace(/[<>{}\\"']/g, '').slice(0, 20);
}

function normPerson(p, fallbackName) {
  if (!p) return null;
  const name = cleanName(p.name) || fallbackName;
  const date = String(p.date || '').trim().replace(/\./g, '-');
  const time = String(p.time || '').trim();

  // 시각 '모름' — 프론트에서 timeUnknown:true 를 보내거나 time을 비워두면 됨
  const timeUnknown = !!p.timeUnknown || time === '' || time === '모름';

  if (!name || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!timeUnknown && !/^\d{2}:\d{2}$/.test(time)) return null;

  return {
    name,
    date,
    time: timeUnknown ? null : time,
    timeUnknown,
    city: p.city && cityCoordinates[p.city] ? p.city : 'Seoul',
    cityGiven: p.city || null,
    gender: p.gender === '남성' ? '남성' : (p.gender === '여성' ? '여성' : '미상')
  };
}

const STAGE_GUIDE = {
  '썸':      '아직 확실하지 않은 사이다. "이 사람이 나에게 마음이 있는가", "밀어야 하는가 기다려야 하는가"가 가장 궁금한 지점이다.',
  '연인':    '이미 만나고 있다. "이 사람과 끝까지 갈 수 있는가", "지금 이 갈등이 일시적인가 본질적인가"가 핵심 질문이다.',
  '부부':    '결혼한 사이다. 헤어짐을 부추기는 서술은 절대 금지. 갈등의 구조를 정확히 짚되 반드시 다룰 방법까지 제시하라.',
  '짝사랑':  '아직 상대가 모른다. 가능성을 냉정하게 짚되, 자존감을 깎는 표현은 절대 쓰지 마라.',
  '재회고민': '헤어진 뒤 다시 만날지 고민 중이다. 미화도 비하도 하지 말고, 다시 만났을 때 반복될 패턴을 구조적으로 보여줘라.'
};

/* -------------------------------------------------------------------------
   Prokerala → 차트 (실패 시 null, 리포트는 중단)
------------------------------------------------------------------------- */
async function getToken() {
  const r = await fetch('https://api.prokerala.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'client_credentials',
      client_id: process.env.PROKERALA_CLIENT_ID,
      client_secret: process.env.PROKERALA_CLIENT_SECRET
    })
  });
  if (!r.ok) throw new Error(`Prokerala 토큰 실패 ${r.status}`);
  return (await r.json()).access_token;
}

async function rawChart(iso, loc, token) {
  const url = `https://api.prokerala.com/v2/astrology/planet-position`
            + `?datetime=${encodeURIComponent(iso)}`
            + `&coordinates=${loc.lat},${loc.lon}&ayanamsa=1`;
  const r = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
  if (!r.ok) throw new Error(`Prokerala 차트 실패 ${r.status}: ${(await r.text()).slice(0, 200)}`);
  return (await r.json()).data;
}

/**
 * 시각을 아는 사람  → Prokerala 1회 호출
 * 시각을 모르는 사람 → 그날 00:01 / 23:59 두 시점 2회 호출
 *   두 시점에서 별자리가 바뀌는 행성은 통째로 제외한다. 추측하지 않는다.
 * ⚠️ 크레딧: 둘 다 아는 커플 2회 / 한 명 모름 3회 / 둘 다 모름 4회
 */
async function fetchChart(person, token) {
  const loc = cityCoordinates[person.city] || cityCoordinates['Seoul'];

  if (!person.timeUnknown) {
    const iso = `${person.date}T${person.time}:00+09:00`;
    const chart = SYN.parseChart(await rawChart(iso, loc, token), iso);
    if (!chart) throw new Error(`차트 파싱 실패 (${person.name})`);
    return chart;
  }

  const isoStart = `${person.date}T00:01:00+09:00`;
  const isoEnd   = `${person.date}T23:59:00+09:00`;
  const [ds, de] = await Promise.all([
    rawChart(isoStart, loc, token),
    rawChart(isoEnd,   loc, token)
  ]);
  const chart = SYN.buildUnknownTimeChart(ds, de, isoStart);
  if (!chart) throw new Error(`차트 파싱 실패 (${person.name}, 시각 미상)`);
  return chart;
}

/* -------------------------------------------------------------------------
   프롬프트
------------------------------------------------------------------------- */
function buildPrompt({ A, B, digest, stage, todayStr }) {
  return `
[🚨🚨 최우선 절대 금지]
'undefined', 'null', 'NaN', '데이터 없음', '어스펙트 목록', '차트 다이제스트' 같은 시스템 용어를 본문에 절대 쓰지 마라.
손님은 일반인이다. 계산되지 않은 항목이 있으면 그 사실을 언급하지 말고 다른 근거로 자연스럽게 서술하라.

[🚨 이름 혼용 절대 금지 — 이 리포트에서 가장 치명적인 사고]
이 리포트에는 두 사람이 등장한다. ${A.name}님(${A.gender})과 ${B.name}님(${B.gender})이다.
- 아래 차트 데이터에 적힌 소유자를 한 글자도 틀리지 말고 그대로 따라라.
- ${A.name}님의 배치를 ${B.name}님 것으로 쓰거나 그 반대로 쓰면 리포트 전체가 실패다.
- 매 문장에서 누구 얘기인지 이름을 분명히 밝혀라. "그는", "상대는" 같은 대명사로 뭉개지 마라.
- 리포트를 다 쓴 뒤 각 문장의 이름이 데이터와 일치하는지 스스로 한 번 더 검토하라.

[🚨 시간 기준]
오늘은 ${todayStr}이다. 모든 시기는 반드시 오늘 이후의 연도·월로만 써라. 지난 시기를 미래로 쓰면 치명적 실패다.

[역할]
너는 명리학을 오래 공부하다 서양 점성술로 넘어온, 두 사람의 관계를 소름 돋게 읽어내기로 소문난 40년 경력의 상담가다.
이 리포트는 30만원짜리 커플 상담처럼 느껴져야 한다. 가볍거나 뻔하면 실패다.

${(A.timeUnknown || B.timeUnknown) ? `[🚨 태어난 시간을 모르는 사람이 있다]
${[A.timeUnknown ? A.name : null, B.timeUnknown ? B.name : null].filter(Boolean).join('님, ')}님의 태어난 시간을 모른다.
아래 '정보 한계'에 제외된 항목은 계산 자체가 불가능하다. 절대 추측해서 채우지 마라.
대신 남은 배치만으로 확신 있게 단정하라. 정보가 적다고 문장을 흐리멍덩하게 쓰면 그게 더 큰 실패다.
리포트 전체에서 딱 한 번만, card9_verdict 끝에 "태어난 시간을 알면 두 분의 하루하루가 맞물리는 방식까지 볼 수 있습니다" 정도로 담백하게 안내하라. 사과나 변명은 금지다.

` : ''}[관계 상황 — 톤을 여기에 맞춰라]
현재 두 사람은 '${stage}' 관계다. ${STAGE_GUIDE[stage] || STAGE_GUIDE['연인']}

[정밀 계산된 두 사람의 차트와 관계 데이터 — 트로피컬(서양식) 기준]
${digest}

위 좌표와 각도, 시기, 점수는 전부 실제 천체 계산 결과다. 반드시 이 데이터만 인용하고, 없는 배치나 각도를 지어내지 마라.

[🚨 점수 규칙]
위에 '확정 점수'로 주어진 숫자를 단 1점도 바꾸지 마라. 다른 숫자를 지어내면 실패다.
점수를 그냥 나열하지 말고, 왜 그 점수인지를 실제 각도를 근거로 설명하라.

[🚨 서술 규칙 — 이 리포트의 생명]
1. 교과서적 점성술 일반론 금지. ("금성은 사랑의 별입니다" 같은 문장 금지)
   [[🚨 비유로 시작 금지]] "마치 ~와 같아서", "~에 비유하자면" 으로 카드를 열지 마라.
   첫 문장은 반드시 두 사람에게 실제로 벌어지는 장면이나 단정으로 시작하라.
   나쁜 예: "두 분의 관계는 마치 깊은 우물과 같아서..."
   나쁜 예: "서로에게 이끌릴 수밖에 없는 강력한 자석 같은 관계입니다."
   나쁜 예: "마치 잃어버렸던 집을 찾은 듯한 안도감을 느꼈을 것입니다."
   좋은 예: "두 분은 같은 문제로 세 번 이상 싸웠을 겁니다."
   좋은 예: "수진님은 민준님 앞에서만 목소리가 작아집니다."
   🚨 '마치', '~같은', '~듯한' 으로 카드의 첫 문장을 열면 그 리포트는 폐기된다.
   대신 두 사람이 실제로 겪었을 법한 구체적 장면으로 써라.
   예: "${A.name}님이 서운한 걸 삼키고 말을 아끼는 동안, ${B.name}님은 아무 문제 없다고 믿고 넘어갑니다. 이 어긋남이 반복됩니다."
2. 어스펙트(두 차트 사이의 각도)를 리포트 전체에서 최소 3개 이상 직접 근거로 인용하라.
3. 화법은 '~한 편입니다' 같은 부드러운 단언을 기본으로 써라.
   [[발뺌 화법 금지]] "~한 느낌도 있습니다", "~일 수도 있어요", "아마 ~일지도" 처럼 빠져나갈 구멍을 만드는 표현은 소름을 죽인다. 절대 금지.
   [[과잉 단정 금지]] "~라는 겁니다", "반드시 헤어집니다" 처럼 운명을 못 박는 표현도 금지.
   [[🚨 헤징 총량 제한]] "~할 수 있습니다", "~할 것입니다", "~일 수 있어요" 는 리포트 전체에서 합쳐 3번을 넘기지 마라.
   손님이 이미 겪은 일을 서술할 때는 단정형으로 써라.
   나쁜 예: "수진님은 답답해할 수 있습니다" → 좋은 예: "수진님은 그 순간 답답해집니다"
   나쁜 예: "서로에게 실망할 수 있습니다" → 좋은 예: "이 대화는 매번 같은 자리에서 멈춥니다"
   나쁜 예: "제동을 걸 수 있습니다" → 좋은 예: "제동을 겁니다"
   나쁜 예: "상처를 줄 수 있습니다" → 좋은 예: "이때 상처가 남습니다"
   나쁜 예: "느꼈을 것입니다" → 좋은 예: "느꼈습니다"
   🚨 이 표현들은 자동으로 세어진다. 8회를 넘기면 리포트가 반려되어 처음부터 다시 쓰게 된다.
   [[🚨 '~편입니다' 오용 금지]] 이 어미는 '현재의 성향'에만 붙는다.
   "직감했을 편입니다", "느꼈을 편입니다" 같은 과거 추측형에 붙이면 비문이다. 과거는 "직감했습니다"로 단정하라.
4. 두 사람 모두를 다뤄라. 한 사람만 분석하고 끝내면 실패다. 분량을 비슷하게 배분하라.
5. 갈등을 다룰 때 누구 한 명을 가해자로 만들지 마라. '기질의 어긋남'으로 프레임하라.
6. 연민 금지. "얼마나 힘드셨어요" 같은 표현은 손님을 약자로 만든다.
   대신 정확히 읽어주고("두 분은 싸울 때 ${A.name}님이 먼저 입을 닫는 편입니다"), 다룰 방법으로 끝내라.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON만]
{
  "headline": "(20자 이내) 이 관계의 정체를 한 문장으로 도려내라. 손님이 캡처해서 친구에게 보낼 만큼 뾰족해야 한다.\n     🚨 덕담·칭찬·무난한 요약 절대 금지. '견고한 애정', '성장하는 관계', '아름다운 인연' 같은 표현은 실패다.\n     반드시 '대가'나 '역설'이 드러나야 한다. 좋은 것 하나를 얻는 대신 무엇을 내주고 있는지를 짚어라.\n     좋은 예: '편안한 대신, 설렘을 반납한 사이' / '싸울수록 붙는, 지치는 인연' / '사랑은 맞는데 속도가 다른 두 사람'",
  "keyword_1": "(6자 이내) 관계 키워드. 셋 중 최소 하나는 반드시 불편한 진실이어야 한다. 예: '속도차', '참는쪽', '뒤늦은후회'",
  "keyword_2": "(6자 이내 관계 키워드)",
  "keyword_3": "(6자 이내 관계 키워드)",
  "score_total": (확정 점수의 종합 점수 숫자만),
  "score_emotion": (숫자만),
  "score_attraction": (숫자만),
  "score_talk": (숫자만),
  "score_lasting": (숫자만),
  "card1_overview": "(400자 이상) 이 관계의 전체 구조. 왜 이 두 사람이 서로에게 끌렸는지를 실제 각도를 근거로. 종합 점수의 의미도 여기서 설명.",
  "card2_first_meet": "(400자 이상) 서로가 서로를 어떻게 보고 있는가. 하우스 오버레이(상대 행성이 내 몇 하우스에 들어왔는지)를 근거로, 처음 끌린 지점과 지금 느끼는 감정의 차이를 그려라.",
  "card3_emotion": "(400자 이상) 감정 교류 방식. 두 사람의 달 배치를 근거로, 위로받고 싶을 때 각자 무엇을 원하는지가 어떻게 다른지 장면으로 보여라.",
  "card4_attraction": "(400자 이상) 끌림과 케미. 금성·화성 각도를 근거로 <b>강조</b>를 섞어 생생하게. 단, 노골적 성적 묘사는 금지.",
  "card5_conflict": "(500자 이상) 🚨 점수 언급으로 시작하지 마라. 첫 문장은 두 사람이 싸우는 장면 그 자체로 열어라. 반복되는 갈등 패턴. 마찰각을 근거로 '이 커플이 싸우는 방식'을 대사가 들릴 만큼 구체적으로 그려라. 특히 위험한 지점 한 가지는 <span style='color:#ff3b30;font-weight:900;'>빨간 글씨</span>로 분명히 경고하라.",
  "card6_bond_type": "(400자 이상) 이 인연의 종류. 토성·8하우스·12하우스 접촉을 근거로 '쉽게 못 놓는 인연인지, 편안한 인연인지, 배울 게 있어 만난 인연인지'를 규정하라.",
  "card7_timing": "(400자 이상) 관계의 분기점 시기. 위에 계산된 시기만 사용하고, 각 시기에 무슨 일이 벌어지기 쉬운지를 구체적으로. 계산된 시기가 없다고 나왔으면 그 사실을 정직하게 다루되 시스템 용어는 쓰지 마라.",
  "card8_manual": "(500자 이상) 실전 사용법.\n     🚨 아래 두 소제목을 그대로 쓰고 한 글자도 바꾸지 마라. 순서도 바꾸지 마라. 뒤집으면 리포트 전체가 실패다.\n     첫 번째 소제목: '${A.name}님이 ${B.name}님에게 해야 할 3가지' → 그 아래는 전부 ${A.name}님이 하는 행동만 쓴다.\n     두 번째 소제목: '${B.name}님이 ${A.name}님에게 해야 할 3가지' → 그 아래는 전부 ${B.name}님이 하는 행동만 쓴다.\n     각 항목은 행동 단위로 구체적으로. '소통하세요' 같은 뻔한 조언 금지.\n     🚨 색상 지정 금지. 강조가 필요하면 <b>만 써라.",
  "card9_verdict": "(400자 이상) 결론. 이 관계를 어떻게 다룰 것인가. 단정적 예언이 아니라 '무엇을 지키면 무엇이 가능한가'의 조건부로. 읽고 나서 힘이 나게 끝내라.",
  "card10_teaser": "(3문장) 궁합은 '두 사람 사이'만 본 것이다. 이 관계에서 손님이 반복하는 패턴이 어디서 왔는지는 손님 개인 차트에만 적혀 있다는 점을 짚어라.\n     이번 리포트에서 실제로 드러난 갈등 축 하나를 직접 지목하고, 그 뿌리를 알려면 개인 차트를 봐야 한다는 흐름으로 자연스럽게 이어라.\n     강매 톤·가격 언급 금지. 마지막 문장은 질문으로 끝내 궁금증을 남겨라."
}`;
}

/* -------------------------------------------------------------------------
   Gemini 호출 + 검증
------------------------------------------------------------------------- */
const REQUIRED_KEYS = [
  'headline','card1_overview','card2_first_meet','card3_emotion','card4_attraction',
  'card5_conflict','card6_bond_type','card7_timing','card8_manual','card9_verdict'
];
const BANNED = /undefined|null|NaN|어스펙트 목록|다이제스트|차트 데이터에/i;

/* 발뺌 화법 패턴 — 프롬프트만으로는 못 막아서 코드로 센다 */
const HEDGE = /(수 있습니다|수 있어요|수도 있습니다|수 있음|여지가 있습니다|위험이 있습니다|것입니다|겠습니다)/g;
const HEDGE_LIMIT = 8;   // 리포트 전체 허용치

/* 비유로 카드를 여는 패턴 */
const METAPHOR_OPEN = /^.{0,40}(마치|같은 관계|듯한|처럼 느껴지는)/;

/**
 * 브랜드 밖 색상을 강제 교정한다.
 * AI가 파란색(#007aff) 등을 멋대로 넣는 사례가 있어, 경고용 빨강 외에는 전부 금색으로 통일.
 * 재생성 없이 결정론적으로 고치므로 비용이 들지 않는다.
 */
function sanitize(data) {
  for (const k of Object.keys(data)) {
    if (typeof data[k] !== 'string') continue;
    data[k] = data[k]
      .replace(/color:\s*#(?!ff3b30\b)[0-9a-fA-F]{3,8}/gi, 'color:#d4af37')
      .replace(/\u00a0/g, ' ')
      .trim();
  }
  return data;
}

function validate(data, A, B, isLastAttempt) {
  if (!data || typeof data !== 'object') return '응답이 객체가 아님';
  for (const k of REQUIRED_KEYS) {
    if (!data[k] || String(data[k]).trim().length < 10) return `필수 항목 누락/부실: ${k}`;
  }
  const body = REQUIRED_KEYS.map(k => String(data[k])).join(' ');
  if (BANNED.test(body)) return '시스템 용어 노출';
  // 두 사람 이름이 모두 등장해야 한다 (한 명만 분석하고 끝낸 경우 차단)
  if (!body.includes(A.name)) return `${A.name} 이름 누락`;
  if (!body.includes(B.name)) return `${B.name} 이름 누락`;

  /* ── 아래는 '품질' 검사. 마지막 시도에서는 통과시킨다.
        완벽을 고집하다 손님에게 아무것도 못 주는 게 더 큰 실패이기 때문. ── */
  if (!isLastAttempt) {
    const hedges = (body.match(HEDGE) || []).length;
    if (hedges > HEDGE_LIMIT) return `발뺌 화법 과다 (${hedges}회 / 허용 ${HEDGE_LIMIT}회)`;

    for (const k of ['card1_overview', 'card2_first_meet', 'card5_conflict']) {
      if (METAPHOR_OPEN.test(String(data[k]))) return `${k} 비유로 시작함`;
    }
  }
  return null;
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const r = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 24576,
        temperature: 0.92,
        responseMimeType: 'application/json',
        thinkingConfig: { thinkingBudget: 5120 }
      }
    })
  });
  if (!r.ok) {
    const t = await r.text();
    const err = new Error(`Gemini ${r.status}: ${t.slice(0, 200)}`);
    err.status = r.status;
    throw err;
  }
  const j = await r.json();
  const parts = (j.candidates && j.candidates[0] && j.candidates[0].content && j.candidates[0].content.parts) || [];
  const text = parts.map(p => p.text || '').join('');
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e === -1) throw new Error('응답에 JSON 없음: ' + text.slice(0, 150));
  return JSON.parse(text.slice(s, e + 1));
}

/* -------------------------------------------------------------------------
   핸들러
------------------------------------------------------------------------- */
const handler = async (req, res) => {

  /* ---------- 다시보기: GET ?orderId= ---------- */
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(KEY_PREFIX + orderId);
      if (!saved) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: '저장된 리포트 없음' });
      }
      // 완료본만 캐시. 생성 중/실패는 절대 캐시하지 않는다 (빈 화면 사고 방지)
      if (saved.status === 'completed') {
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('ETag', `"couple-${orderId}"`);
      } else {
        res.setHeader('Cache-Control', 'no-store');
      }
      return res.status(200).json(saved);
    } catch (e) {
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  const body = req.body || {};
  const orderId = body.orderId ? String(body.orderId).slice(0, 60) : null;
  let lockKey = null;

  try {
    /* ---------- 1. 입력 검증 ---------- */
    const A = normPerson(body.personA, '본인');
    const B = normPerson(body.personB, '상대방');
    if (!A) return res.status(400).json({ error: '본인 정보를 다시 확인해주세요. (생년월일·태어난 시간 형식)' });
    if (!B) return res.status(400).json({ error: '상대방 정보를 다시 확인해주세요. (생년월일·태어난 시간 형식)' });
    if (A.name === B.name) B.name = B.name + '(상대)';   // 동명이인 → 이름 혼용 사고 원천 차단

    const stage = STAGE_GUIDE[body.stage] ? body.stage : '연인';

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: '서버 설정 오류(GEMINI)' });
    if (!process.env.PROKERALA_CLIENT_ID || !process.env.PROKERALA_CLIENT_SECRET) {
      return res.status(500).json({ error: '서버 설정 오류(PROKERALA)' });
    }

    /* ---------- 2. 완성본 재사용 ---------- */
    if (orderId) {
      const saved = await kv.get(KEY_PREFIX + orderId);
      if (saved && saved.status === 'completed') {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(saved);
      }
    }

    /* ---------- 3. 생성 락 (중복 Gemini 호출 차단) ---------- */
    if (orderId) {
      lockKey = LOCK_PREFIX + orderId;
      const got = await kv.set(lockKey, '1', { nx: true, ex: 300 });
      if (!got) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(202).json({ status: 'pending', message: '리포트를 만들고 있습니다. 잠시만 기다려주세요.' });
      }
      await kv.set(KEY_PREFIX + orderId, { status: 'pending', at: Date.now() }, { ex: 60 * 60 });
    }

    /* ---------- 4. 두 사람 차트 ---------- */
    const token = await getToken();
    const [chartA, chartB] = await Promise.all([fetchChart(A, token), fetchChart(B, token)]);

    const built = SYN.buildCoupleDigest(chartA, chartB, A.name, B.name);

    /* ---------- 5. 리포트 생성 (최대 3회) ---------- */
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    const prompt = buildPrompt({ A, B, digest: built.text, stage, todayStr });

    let data = null, lastErr = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const candidate = sanitize(await callGemini(prompt));
        const bad = validate(candidate, A, B, attempt === 3);
        if (bad) { lastErr = bad; console.error(`🔥 [시도 ${attempt}] 검증 실패: ${bad}`); continue; }
        data = candidate;
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}]`, err.message);
        if (err.status === 503 || err.status === 429) await new Promise(r => setTimeout(r, 1500 * attempt));
      }
    }

    if (!data) {
      if (orderId) {
        await kv.set(KEY_PREFIX + orderId, { status: 'failed', error: lastErr, at: Date.now() }, { ex: 60 * 30 });
        await kv.del(lockKey);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: `리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.`, detail: lastErr });
    }

    /* ---------- 6. 점수는 코드값으로 덮어쓴다 (AI가 바꿨을 가능성 차단) ---------- */
    data.score_total      = built.score.total;
    data.score_emotion    = built.score.emotion;
    data.score_attraction = built.score.attraction;
    data.score_talk       = built.score.talk;
    data.score_lasting    = built.score.lasting;

    const payload = {
      status: 'completed',
      generatedAt: Date.now(),
      version: 1,
      meta: { nameA: A.name, nameB: B.name, stage },
      report: data
    };

    if (orderId) {
      try {
        await kv.set(KEY_PREFIX + orderId, payload, { ex: 60 * 60 * 24 * TTL_DAYS });
        await kv.del(lockKey);
      } catch (e) {
        console.log('⚠️ KV 저장 실패(전송은 정상):', e.message);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);

  } catch (error) {
    console.error('🔥 gemini-couple.js 에러:', error);
    if (orderId) {
      try {
        await kv.set(KEY_PREFIX + orderId, { status: 'failed', error: error.message, at: Date.now() }, { ex: 60 * 30 });
        if (lockKey) await kv.del(lockKey);
      } catch (e) { /* 무시 */ }
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(500).json({ error: '잠시 문제가 있었습니다. 다시 시도해주세요.', detail: error.message });
  }
};

module.exports = allowCors(handler);
