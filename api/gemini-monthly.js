// ============================================================================
//  api/gemini-monthly.js  —  아스트라노트 '오늘부터 30일' 운세 (1,900원)
// ----------------------------------------------------------------------------
//  ★ 기존 gemini.js / gemini-vip.js / gemini-couple.js 를 전혀 건드리지 않습니다.
//
//  💰 비용 설계 (1,900원 상품이라 여기가 생명)
//   · '오늘 하늘'은 모든 손님이 공유한다 → Redis에 하루 단위로 캐싱
//     - 그날 첫 손님만 Prokerala 11회를 쓰고, 이후 손님은 0회
//     - 하루 방문자가 100명이어도 하늘 계산은 하루 11회로 끝
//   · 손님당 실제 호출 = 본인 네이탈 1회 (시각 미상이면 2회)
//   · Gemini 1회 (thinkingBudget을 낮춰 단가 절감)
//
//  ⚠️ 하늘 캐시는 '날짜'로만 구분한다. 손님 정보와 무관하므로 개인정보가 아니다.
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');
const SYN = require('../lib/astro-synastry.js');
const TR  = require('../lib/astro-transit.js');
const cityCoordinates = require('../lib/cities.js');

const KEY_PREFIX  = 'monthly-report:';
const LOCK_PREFIX = 'monthly-lock:';
const SKY_PREFIX  = 'sky:';           // 하늘 캐시 (모든 손님 공유)
const TTL_DAYS    = 45;

/* 하늘 계산 기준 좌표 — 지구중심 황경이므로 관측지 영향이 사실상 없다.
   서울로 고정해 캐시 적중률을 100%로 만든다. */
const SKY_ORIGIN = { lat: 37.5665, lon: 126.978 };

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
   입력 정규화
------------------------------------------------------------------------- */
function cleanName(v) {
  return String(v || '').trim().replace(/[<>{}\\"']/g, '').slice(0, 20);
}

function normPerson(body) {
  const name = cleanName(body.name) || '고객';
  const date = String(body.date || '').trim().replace(/\./g, '-');
  const time = String(body.time || '').trim();

  /* 프론트가 timeUnknown을 보내거나 time이 비면 미상으로 본다.
     🚨 절대 12:00 같은 임의값으로 채우지 않는다. */
  const timeUnknown = !!body.timeUnknown || time === '' || time === '모름';

  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null;
  if (!timeUnknown && !/^\d{2}:\d{2}$/.test(time)) return null;

  return {
    name,
    date,
    time: timeUnknown ? null : time,
    timeUnknown,
    city: body.city && cityCoordinates[body.city] ? body.city : 'Seoul',
    gender: body.myGender === '남성' ? '남성' : (body.myGender === '여성' ? '여성' : '미상')
  };
}

/* -------------------------------------------------------------------------
   Prokerala
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
  if (!r.ok) throw new Error(`Prokerala 실패 ${r.status}: ${(await r.text()).slice(0, 160)}`);
  return (await r.json()).data;
}

/**
 * 손님 네이탈 차트.
 * 시각을 알면 1회, 모르면 그날 00:01 / 23:59 두 시점을 받아
 * 별자리가 바뀌는 행성은 통째로 제외한다 (추측 금지).
 */
async function fetchNatal(person, token) {
  const loc = cityCoordinates[person.city] || cityCoordinates['Seoul'];

  if (!person.timeUnknown) {
    const iso = `${person.date}T${person.time}:00+09:00`;
    const chart = SYN.parseChart(await rawChart(iso, loc, token), iso);
    if (!chart) throw new Error('차트 파싱 실패');
    return chart;
  }

  const isoStart = `${person.date}T00:01:00+09:00`;
  const isoEnd   = `${person.date}T23:59:00+09:00`;
  const [ds, de] = await Promise.all([
    rawChart(isoStart, loc, token),
    rawChart(isoEnd,   loc, token)
  ]);
  const chart = SYN.buildUnknownTimeChart(ds, de, isoStart);
  if (!chart) throw new Error('차트 파싱 실패 (시각 미상)');
  return chart;
}

/**
 * 🚨 오늘 하늘 — 모든 손님이 공유하므로 하루 단위로 캐싱한다.
 * 이 캐싱이 없으면 손님 1명당 Prokerala 11회가 나가 1,900원에 적자가 난다.
 */
async function fetchSky(samples, token) {
  const isoList = samples.map(s => `${TR.ymd(s.date)}T12:00:00+09:00`);
  const cacheKey = SKY_PREFIX + TR.ymd(samples[0].date);

  try {
    const cached = await kv.get(cacheKey);
    if (cached && Array.isArray(cached.raw) && cached.raw.length === samples.length) {
      console.log('☀️ 하늘 캐시 적중 — Prokerala 호출 0회');
      return TR.parseSky(cached.raw, isoList);
    }
  } catch (e) {
    console.log('하늘 캐시 조회 실패(무시하고 계산):', e.message);
  }

  /* 캐시 미스 — 그날 첫 손님만 여기로 온다 */
  console.log(`🌌 하늘 신규 계산 (Prokerala ${samples.length}회)`);
  const raw = [];
  for (let i = 0; i < isoList.length; i++) {
    raw.push(await rawChart(isoList[i], SKY_ORIGIN, token));
  }

  try {
    /* 36시간 보관 — 자정 전후 경계에서도 안전하게 겹치도록 */
    await kv.set(cacheKey, { raw, at: Date.now() }, { ex: 60 * 60 * 36 });
  } catch (e) {
    console.log('하늘 캐시 저장 실패(동작에는 영향 없음):', e.message);
  }

  return TR.parseSky(raw, isoList);
}

/* -------------------------------------------------------------------------
   프롬프트
------------------------------------------------------------------------- */
function buildPrompt({ P, digest, todayStr, endStr, correction }) {
  return `${correction ? `[🚨🚨🚨 직전 원고 반려 — 아래를 반드시 고쳐서 다시 써라]
${correction}
이 지적을 무시하면 또 반려된다. 나머지 규칙은 그대로 지키면서 이 부분만 확실히 고쳐라.

` : ''}[🚨🚨 최우선 절대 금지]
'undefined', 'null', 'NaN', '데이터 없음', '트랜짓 목록', '다이제스트' 같은 시스템 용어를 본문에 절대 쓰지 마라.
🚨 마크다운 금지. **굵게**, *기울임*, # 제목 전부 안 된다. 이 글은 HTML로 출력되므로 별표가 화면에 그대로 보인다.
   강조는 <b>강조할 말</b> 만 써라.
🚨 '오차 0.3도', '트랜짓 화성 — 내 태양 삼각', '금성 양자리 4.4도' 같은 계산 표기를 그대로 옮기지 마라.
   별자리 이름과 도수를 손님에게 읽어주면 암호로 보인다. 그 배치가 뜻하는 '실제 벌어지는 일'로만 풀어써라.
   나쁜 예: "타고난 금성 양자리 4.4도의 영향을 받습니다"
   좋은 예: "마음이 가는 대로 먼저 움직이는 편이라, 이 시기에 그 성향이 그대로 드러납니다"

[🚨 시간 기준 — 이 상품의 핵심]
오늘은 ${todayStr}이다. 이 리포트가 다루는 기간은 <b>오늘부터 30일</b>, 즉 ${todayStr} ~ ${endStr}이다.
- 이 기간 밖의 날짜를 언급하면 치명적 실패다.
- '이번 달', '다음 달' 같은 달력 단위 표현을 쓰지 마라. 우리는 달력이 아니라 실제 하늘의 움직임을 본다.
- 날짜는 아래 계산된 것만 써라. 지어낸 날짜는 즉시 실패다.
- 오늘 날짜 자체를 "오늘 ${todayStr}" 처럼 본문에 박아 넣지 마라. 시스템 로그처럼 읽힌다.

[역할]
너는 명리학을 오래 공부하다 서양 점성술로 넘어온, 40년 경력의 상담가다.
${P.name}님(${P.gender})의 앞으로 30일을 읽어준다.
이 리포트는 1,900원짜리지만, 읽고 나서 "이 값에 이걸?" 소리가 나와야 한다. 그래야 다음 상품을 산다.

[정밀 계산된 데이터 — 트로피컬(서양식) 기준]
${digest}

위 좌표·각도·날짜·점수는 전부 실제 천체 계산 결과다. 이것만 인용하고 없는 것을 지어내지 마라.

[🚨 점수 규칙]
위에 '확정 점수'로 주어진 숫자를 단 1점도 바꾸지 마라.
🚨 카드를 점수 언급으로 시작하지 마라. "애정운은 81점으로 높은 편입니다" 같은 첫 문장은 금지다.
   여섯 장이 전부 같은 방식으로 열리면 성의 없어 보인다.
   첫 문장은 그 영역에서 실제 벌어지는 장면이나 단정으로 열고, 점수는 중간이나 끝에서 근거와 함께 한 번만 언급하라.
   나쁜 예: "금전운은 74점으로 다소 주의가 필요합니다."
   좋은 예: "이번 30일은 들어오는 돈보다 나가는 돈의 속도가 빠릅니다."
🚨 각 카드가 서로 다른 방식으로 시작해야 한다. 같은 문장 구조를 반복하지 마라.

[🚨 서술 규칙 — 이 리포트의 생명]
1. 교과서적 점성술 일반론 금지. ("화성은 열정의 별입니다" 같은 문장 금지)
   대신 ${P.name}님이 그 시기에 실제로 겪을 장면으로 써라.
   🚨 첫 문장에 '마치', '~같은', '~듯한', '~처럼' 을 쓰면 자동 반려된다.
   사물에 빗대는 비유(파도·우물·자석·나무·바다 등)는 어떤 카드에서도 금지다. 흔해빠져서 값이 싸 보인다.
2. 화법은 '~한 편입니다' 같은 부드러운 단언을 기본으로.
   [[발뺌 금지]] "~할 수도 있어요", "아마 ~일지도" 처럼 빠져나갈 구멍을 만들지 마라.
   "~할 수 있습니다" → "~합니다" 로 바꿔 쓰면 대부분 해결된다. 이 표현은 자동으로 세어진다.
   [[과잉 단정 금지]] "반드시 ~합니다", "무조건 ~됩니다" 같은 표현도 금지.
   [[어미 오용 금지]] '~편입니다'는 현재 성향에만 붙는다. "느꼈을 편입니다" 같은 과거 추측형은 비문이다.
3. 날짜를 반드시 구체적으로 써라. "월초", "중순" 같은 뭉뚱그림 금지. 계산된 날짜를 그대로 인용하라.
4. 연민 금지. "힘드시겠어요" 같은 표현은 손님을 약자로 만든다. 정확히 읽어주고 다룰 방법으로 끝내라.
5. 나쁜 시기를 다룰 때 공포를 팔지 마라. 무슨 일이 벌어지는지 짚고, 어떻게 넘길지를 반드시 붙여라.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON만]
{
  "headline": "(20자 이내) 이 30일을 한 문장으로. 손님이 캡처해서 저장하고 싶을 만큼 뾰족하게.\\n     🚨 덕담·무난한 요약 금지. '좋은 기운이 가득한 달' 같은 표현은 실패다.\\n     반드시 '대가'나 '역설'이 드러나야 한다. 좋은 것 하나를 얻는 대신 무엇을 내주는지 짚어라.\\n     좋은 예: '지갑은 열리고, 마음은 바쁜 30일' / '기회는 오는데 몸이 안 따라주는 시기'",
  "keyword_1": "(6자 이내) 이 30일의 키워드. 셋 중 최소 하나는 불편한 진실이어야 한다.",
  "keyword_2": "(6자 이내)",
  "keyword_3": "(6자 이내)",
  "score_total": (확정 점수의 종합 숫자만),
  "score_love": (숫자만),
  "score_money": (숫자만),
  "score_work": (숫자만),
  "score_body": (숫자만),
  "card1_overview": "(400자 이상) 이 30일의 전체 흐름. 어떤 기조로 흘러가는지, 그 안에서 ${P.name}님이 무엇을 붙잡고 무엇을 놓아야 하는지. 종합 점수의 의미도 여기서 설명하라.",
  "card2_love": "(350자 이상) 애정운. 지금 만나는 사람이 있든 없든 읽히게 써라. 계산된 날짜를 최소 1개 인용하고, 그날 무슨 일이 벌어지기 쉬운지 장면으로.",
  "card3_money": "(350자 이상) 금전운. 들어오는 흐름과 새는 구멍을 함께 짚어라. 막연한 '재물운이 좋다' 금지. 어디서 벌고 어디서 빠져나가는지 구체적으로.",
  "card4_work": "(350자 이상) 일과 성취. 밀어붙일 시기와 물러설 시기를 날짜로 나눠서 제시하라.",
  "card5_body": "(300자 이상) 컨디션과 마음 상태. 몸이 먼저 신호를 보내는 지점을 짚되, 의학적 진단처럼 쓰지 마라.",
  "card6_gooddays": "(300자 이상) 🚨 계산된 '좋은 날'만 써라. 각 날짜에 무엇을 하면 좋은지 행동 단위로 구체적으로. '좋은 일이 생깁니다' 같은 뭉뚱그림 금지.",
  "card7_caredays": "(300자 이상) 🚨 계산된 '조심할 날'만 써라. 무엇을 조심해야 하는지, 그리고 그날을 어떻게 넘길지까지. 공포만 주고 끝내면 실패다.",
  "card8_action": "(350자 이상) 이 30일 동안 해야 할 것 3가지와 하지 말아야 할 것 3가지.\n     🚨 서식을 반드시 아래 구조 그대로 지켜라. 줄바꿈 없이 붙여 쓰면 읽을 수가 없다.\n     <b>해야 할 것</b><br>1. ...<br>2. ...<br>3. ...<br><br><b>하지 말아야 할 것</b><br>1. ...<br>2. ...<br>3. ...\n     각 항목은 계산된 날짜를 최소 1개 포함하고 행동 단위로 구체적으로. '긍정적으로 생각하세요' 같은 뻔한 조언 금지.",
  "card9_teaser": "(3문장) 이 30일의 흐름은 ${P.name}님의 타고난 차트 위에서 벌어지는 일이라는 점을 짚어라.\\n     이번 리포트에서 실제로 드러난 흐름 하나를 지목하고, 그 뿌리는 개인 차트에 있다는 방향으로 자연스럽게 이어라.\\n     강매 톤·가격 언급 금지. 마지막은 질문으로 끝내 궁금증을 남겨라."
}`;
}

/* -------------------------------------------------------------------------
   Gemini 호출 + 검증
------------------------------------------------------------------------- */
const REQUIRED_KEYS = [
  'headline', 'card1_overview', 'card2_love', 'card3_money', 'card4_work',
  'card5_body', 'card6_gooddays', 'card7_caredays', 'card8_action'
];

/* 🚨 '금성 양자리 4.4도' 같은 좌표 표기가 실제로 손님에게 나간 사례가 있었다.
   일반인에게는 암호로 읽히므로 도수 표기를 통째로 차단한다. */
const BANNED = /undefined|null|NaN|트랜짓 목록|다이제스트|확정 점수|정보 완전도|오차 \d|[가-힣]+자리\s*\d+(\.\d+)?\s*도|\d+하우스\s*\d+도/i;
const HEDGE = /(수 있습니다|수 있어요|수도 있습니다|수 있고|수 있으며|여지가 있습니다|위험이 있습니다)/g;
const HEDGE_LIMIT = 12;
const METAPHOR_OPEN = /^.{0,40}(마치|같은 |듯한|처럼 느껴지는)/;
/* 카드를 점수 언급으로 여는 패턴. 실측에서 6장 중 4장이 그랬다.
   한두 장은 자연스럽지만 3장 넘어가면 성의 없어 보인다. */
const SCORE_OPEN = /^.{0,25}(\d{2}\s*점|점수\s*\d{2})/;
const SCORE_OPEN_LIMIT = 2;
const CLICHE = /(잃어버[린렸]|반쪽|자석|우물|나침반|퍼즐 조각)/;

/** 브랜드 밖 색상·마크다운을 재생성 없이 결정론적으로 교정한다 */
function sanitize(data) {
  for (const k of Object.keys(data)) {
    if (typeof data[k] !== 'string') continue;
    data[k] = data[k]
      .replace(/color:\s*#(?!ff3b30\b)[0-9a-fA-F]{3,8}/gi, 'color:#d4af37')
      .replace(/\*\*\*(.+?)\*\*\*/g, '<b>$1</b>')
      .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
      .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<b>$2</b>')
      .replace(/^#{1,6}\s+/gm, '')
      .replace(/\u00a0/g, ' ')
      .trim();
  }
  return data;
}

function validate(data, P, isLastAttempt) {
  if (!data || typeof data !== 'object') return '응답이 객체가 아님';
  for (const k of REQUIRED_KEYS) {
    if (!data[k] || String(data[k]).trim().length < 10) return `필수 항목 누락/부실: ${k}`;
  }
  const body = REQUIRED_KEYS.map(k => String(data[k])).join(' ');
  if (BANNED.test(body)) return '시스템 용어 노출';

  /* 품질 검사 — 마지막 시도에서는 통과시킨다.
     완벽을 고집하다 결제한 손님에게 아무것도 못 주는 게 더 큰 실패이기 때문. */
  if (!isLastAttempt) {
    const hedges = (body.match(HEDGE) || []).length;
    if (hedges > HEDGE_LIMIT) return `발뺌 화법 과다 (${hedges}회 / 허용 ${HEDGE_LIMIT}회)`;
    for (const k of REQUIRED_KEYS) {
      if (METAPHOR_OPEN.test(String(data[k]))) return `${k} 카드가 비유로 시작함`;
    }
    if (CLICHE.test(body)) return '상투적 비유 사용';

    let scoreOpens = 0;
    for (const k of REQUIRED_KEYS) {
      if (SCORE_OPEN.test(String(data[k]))) scoreOpens++;
    }
    if (scoreOpens > SCORE_OPEN_LIMIT) {
      return `${scoreOpens}개 카드가 점수 언급으로 시작함 (허용 ${SCORE_OPEN_LIMIT}개). 각 카드를 다른 방식으로 열어라`;
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
        maxOutputTokens: 16384,
        temperature: 0.9,
        responseMimeType: 'application/json',
        /* 1,900원 상품이라 사고 예산을 낮춰 단가를 줄인다 */
        thinkingConfig: { thinkingBudget: 2048 }
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

  /* ---------- 다시보기 ---------- */
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(KEY_PREFIX + orderId);
      if (!saved) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(404).json({ error: '저장된 리포트 없음' });
      }
      if (saved.status === 'completed') {
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('ETag', `"monthly-${orderId}"`);
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
    const P = normPerson(body);
    if (!P) return res.status(400).json({ error: '생년월일과 태어난 시간을 다시 확인해주세요.' });

    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: '서버 설정 오류(GEMINI)' });
    if (!process.env.PROKERALA_CLIENT_ID || !process.env.PROKERALA_CLIENT_SECRET) {
      return res.status(500).json({ error: '서버 설정 오류(PROKERALA)' });
    }

    /* ---------- 완성본 재사용 ----------
       ⚠️ 단, 리포트가 만들어진 날짜가 오늘과 다르면 기간이 어긋나므로 다시 만든다.
          "오늘부터 30일" 상품이라 어제 만든 리포트를 그대로 주면 하루가 빈다. */
    const today = new Date();
    const todayKey = TR.ymd(today);

    if (orderId) {
      const saved = await kv.get(KEY_PREFIX + orderId);
      if (saved && saved.status === 'completed' && saved.baseDate === todayKey) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(saved);
      }
    }

    /* ---------- 생성 락 ---------- */
    if (orderId) {
      lockKey = LOCK_PREFIX + orderId;
      const got = await kv.set(lockKey, '1', { nx: true, ex: 300 });
      if (!got) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(202).json({ status: 'pending', message: '리포트를 만들고 있습니다.' });
      }
      await kv.set(KEY_PREFIX + orderId, { status: 'pending', at: Date.now() }, { ex: 60 * 60 });
    }

    /* ---------- 차트 + 하늘 ---------- */
    const token = await getToken();
    const samples = TR.sampleDates(today);

    /* 하늘은 캐시가 있으면 Prokerala 호출 0회 */
    const [natal, sky] = await Promise.all([
      fetchNatal(P, token),
      fetchSky(samples, token)
    ]);

    if (!sky.length) throw new Error('하늘 데이터를 가져오지 못했습니다');

    const built = TR.buildMonthlyDigest(natal, sky, samples, today, P.name);

    /* ---------- 리포트 생성 (최대 3회, 반려 사유 되먹임) ---------- */
    const todayStr = TR.krDate(today, today);
    const endStr   = TR.krDate(TR.addDays(today, TR.SPAN_DAYS), today);

    let data = null, lastErr = '', correction = '';
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const prompt = buildPrompt({ P, digest: built.text, todayStr, endStr, correction });
        const candidate = sanitize(await callGemini(prompt));
        const bad = validate(candidate, P, attempt === 3);
        if (bad) {
          lastErr = bad; correction = bad;
          console.error(`🔥 [시도 ${attempt}] 검증 실패: ${bad}`);
          continue;
        }
        data = candidate;
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}]`, err.message);
        /* 503(과부하)·429(한도)는 수십 초 지속된다. 짧게 두드리면 같은 답만 받는다. */
        if (err.status === 503 || err.status === 429) {
          await new Promise(r => setTimeout(r, 8000 * attempt));
        }
      }
    }

    if (!data) {
      if (orderId) {
        await kv.set(KEY_PREFIX + orderId, { status: 'failed', error: lastErr, at: Date.now() }, { ex: 60 * 30 });
        await kv.del(lockKey);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: '리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', detail: lastErr });
    }

    /* ---------- 점수는 코드값으로 덮어쓴다 (AI가 바꿨을 가능성 차단) ---------- */
    data.score_total = built.score.total;
    data.score_love  = built.score.love;
    data.score_money = built.score.money;
    data.score_work  = built.score.work;
    data.score_body  = built.score.body;

    const payload = {
      status: 'completed',
      generatedAt: Date.now(),
      baseDate: todayKey,                  // 기간 판정용
      version: 1,
      meta: {
        name: P.name,
        periodStart: todayStr,
        periodEnd: endStr,
        goodDays: built.dates.good.map(d => d.peak),
        careDays: built.dates.care.map(d => d.peak)
      },
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
    console.error('🔥 gemini-monthly.js 에러:', error);
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
