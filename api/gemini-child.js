// ============================================================================
//  api/gemini-child.js  —  아스트라노트 우리 아이 양육설명서 (24,900원)
// ----------------------------------------------------------------------------
//  ★ 기존 상품 파일을 한 줄도 수정하지 않습니다.
//     추가: lib/astro-child.js · 이 파일   /   수정: vercel.json 한 줄
//
//  구조는 api/gemini-couple.js 와 동일합니다.
//   1) 판정·시기는 전부 코드가 계산 → AI는 '해석'만 한다 (재현성 보장)
//   2) 생성 락(SET NX EX)으로 중복 결제 시 Gemini 이중 호출 차단
//   3) 상태 머신(pending → completed / failed) + 상태별 캐시 헤더 분리
//   4) 두 사람 이름 혼용을 코드에서 검증 → 실패 시 재생성
//
//  ▣ 이 상품만의 절대 원칙 — 아이는 자기를 변호할 수 없다
//
//  부정적 낙인이 찍히면 부모가 그렇게 대하고, 그게 실제로 그 아이를 만듭니다.
//  리포트 한 줄이 한 아이의 몇 년을 바꿀 수 있습니다.
//  그래서 아래 두 가지는 프롬프트로만 막지 않고 코드로 차단합니다.
//
//      · 아이의 능력·성격을 결함으로 규정하는 문장  → 3회 전부 반려
//      · 아이의 미래를 부정적으로 단정하는 문장      → 3회 전부 반려
//
//  다른 검증은 "완벽을 고집하다 손님에게 아무것도 못 주는 게 더 나쁘다"는
//  기준으로 마지막 시도에서 통과시키지만, 이 둘만은 예외입니다.
//
//  ▣ 7장이 이 상품의 심장
//
//  토성 하드각이 오는 시기를 lib/astro-child.js 가 실제로 계산합니다.
//  Swiss Ephemeris 대조 결과 최대 오차 18일, 통과 횟수 불일치 0건.
//  이미 지나간 시기를 맞히면 앞으로의 예고가 믿음이 됩니다.
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');
const SYN = require('../lib/astro-synastry.js');
const CH = require('../lib/astro-child.js');
const cityCoordinates = require('../lib/cities.js');
const V = require('../lib/validate.js');
const { buildBirthIso, dayRangeIso } = require('../lib/time.js');

/* 🚨 Gemini 과부하(503·429) 대기 — 2026-08-02 상향
   ----------------------------------------------------------------------------
   실제 손님 요청에서 Gemini 가 3번 연속 503 을 뱉었는데,
   대기가 짧아 11초 만에 포기하고 500 을 던진 사고가 있었다.
   503 은 구글 쪽 일시 과부하로 보통 수십 초 지속된다.
   짧게 두드리면 같은 거절만 받는다.

   양육 리포트는 시간 예산(BUDGET_MS)이 따로 있으므로,
   아래 값을 원하되 남은 예산을 넘기지 않는 선에서만 기다린다. */
const RETRY_WAIT_MS = [20000, 45000, 0];

const KEY_PREFIX = 'child-report:';
const LOCK_PREFIX = 'child-lock:';
const TTL_DAYS = 60;

/* 🔒 CORS `*` → 화이트리스트 · rate limit · 뷰 토큰 (2026-08-03, lib/security.js) */
const SEC = require('../lib/security.js');

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
  const timeUnknown = !!p.timeUnknown || time === '' || time === '모름';

  /* 🚨 형식만 보면 2026-02-31 이 통과하고, Date 가 그걸 2026-03-03 으로
     조용히 바꿔버린다. 실존하는 날짜인지까지 확인해야 한다. (lib/validate.js) */
  const okDate = V.normalizeDate(date);
  if (!name || !okDate) return null;
  const okTime = timeUnknown ? null : V.normalizeTime(time);
  if (!timeUnknown && !okTime) return null;

  const m = date.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return {
    name,
    date,
    y: +m[1], mo: +m[2], d: +m[3],
    time: timeUnknown ? null : okTime,   /* 정규화된 값 사용 (9:05 → 09:05) */
    timeUnknown,
    city: p.city && cityCoordinates[p.city] ? p.city : 'Seoul',
    gender: p.gender === '남성' ? '남성' : (p.gender === '여성' ? '여성' : '미상')
  };
}

const AGE_BANDS = Object.keys(CH.AGE_GUIDE);
const DEFAULT_BAND = '초등';

/* -------------------------------------------------------------------------
   Prokerala → 차트  (궁합과 동일. 호출 횟수도 동일)
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

async function fetchChart(person, token) {
  const loc = cityCoordinates[person.city] || cityCoordinates['Seoul'];

  if (!person.timeUnknown) {
    const iso = buildBirthIso(person.date, person.time, person.city);
    const chart = SYN.parseChart(await rawChart(iso, loc, token), iso);
    if (!chart) throw new Error(`차트 파싱 실패 (${person.name})`);
    return chart;
  }

  const [isoStart, isoEnd] = dayRangeIso(person.date, person.city);
  const [ds, de] = await Promise.all([
    rawChart(isoStart, loc, token),
    rawChart(isoEnd, loc, token)
  ]);
  const chart = SYN.buildUnknownTimeChart(ds, de, isoStart);
  if (!chart) throw new Error(`차트 파싱 실패 (${person.name}, 시각 미상)`);
  return chart;
}

/* -------------------------------------------------------------------------
   프롬프트
------------------------------------------------------------------------- */
function buildPrompt({ P, C, digest, band, D, todayStr, correction }) {
  const temp = D.temperament, praise = D.praise;
  const hasP = D.hasParent;
  return `${correction ? `[🚨🚨🚨 직전 원고 반려 — 아래를 반드시 고쳐서 다시 써라]
${correction}
이 지적을 무시하면 또 반려된다. 나머지 규칙은 그대로 지키면서 이 부분만 확실히 고쳐라.

` : ''}
[🚨🚨 최우선 절대 금지]
'undefined', 'null', 'NaN', '데이터 없음', '다이제스트', '확정 판정', '강도', '속도축' 같은 시스템 용어를 본문에 절대 쓰지 마라.
🚨 마크다운 금지. **굵게**, *기울임*, # 제목 전부 금지. HTML로 그대로 출력되므로 별표가 화면에 보인다.

[🚨🚨🚨 제1원칙 — 다른 모든 규칙보다 위에 있다]
${C.name}는 아직 어리고, 이 리포트를 읽고 자기를 변호할 수 없다.
부모가 여기 적힌 말을 믿고 아이를 그렇게 대하면, 그 말이 실제로 그 아이를 만든다.

아이의 능력이나 성격을 <b>결함으로 규정하지 마라.</b>
  ❌ 공부에 소질이 없습니다 / 거짓말을 잘합니다 / 산만한 아이입니다 / 커서 ~하게 됩니다
  ✅ 재촉하면 더 느려지는 편입니다 / 조용해지면 화난 게 아니라 정리 중입니다

같은 기질도 쓰기에 따라 강점이 된다. <b>반드시 대응 방법과 함께</b> 써라.
특징만 말하고 방법을 안 주면 부모는 그걸 결함으로 읽는다.
🚨 아이를 진단하지 마라. 발달·학습·정서 관련 의학적 표현은 한 글자도 금지.
🚨 부모도 탓하지 마라. "부모님이 이렇게 하셔서"는 금지. 기질의 어긋남으로만 프레임하라.
🚨 성적·지능을 평가하지 마라. 무엇을 잘한다가 아니라 어떻게 배우는 아이인가를 써라.

[읽는 사람]
읽는 사람은 ${P.name}(${P.role || '부모'})이고 대상은 ${C.name}(만 ${D.ageNow}세)다.
${P.name}에게 말하듯 쓴다. 아이에게 말하지 마라. 배치의 소유자를 절대 바꾸지 마라.

[🚨 부모가 이미 아는 것을 말하지 마라]
부모는 아이를 매일 본다. "활발한 아이입니다"는 이미 안다.
부모가 모르는 건 <b>왜 그런가</b>와 <b>언제 무슨 일이 오는가</b>다. 거기에 분량을 몰아라.

[★ 세 가지 장치 — 이 리포트가 사람을 울리는 이유다. 각 장에 최소 하나씩 넣어라]

■ 장치1 · 직감 승인 — 부모가 이미 느꼈지만 확신 못 하던 것을 확인해 준다
   "아이를 처음 안았을 때 어딘가 어른스럽다고 느끼셨다면, <b>그 직감이 정확합니다.</b>"
   새 정보를 주는 게 아니라 이미 본 것에 이름과 근거를 준다.

■ 장치2 · 이름 바꿔주기 — 부모가 답답해하던 것에 다른 이름을 붙인다
   "<b>고집이 아니라 뚝심입니다.</b>" / "느린 게 아니라 확인하는 중입니다."
   반드시 부모가 실제로 겪는 장면과 함께.

■ 장치3 · 아이 대신 말해주기 — 아이가 못 한 말을 각도로 증명해서 대신 한다
   "안으로는 따뜻함을 바라면서 밖으로는 담담한 얼굴을 내밉니다.
    그래서 힘들 때 <b>'괜찮아'라고 말하는 아이</b>가 됩니다."
   🚨 장치3은 반드시 장치1로 열고 <b>부모가 할 행동</b>으로 닫아라.
      죄책감만 남기면 부모는 리포트를 덮는다. 이게 이 상품에서 가장 중요한 규칙이다.

[✍️ 문장 규칙]
· AI는 문장 길이가 균일해서 티가 난다. 짧은 문장과 긴 문장을 섞어라. 단락 길이도 들쭉날쭉하게.
· 교과서적 점성술 일반론 금지. ("달은 감정을 뜻합니다" 금지)
· 첫 문장에 '마치·~같은·~듯한·~처럼' 을 쓰면 자동 반려다. 사물 비유(씨앗·나무·그릇·거울) 전면 금지.
· 첫 문장은 아이에게 실제로 벌어지는 장면이나 단정으로 연다.
· 발뺌 금지 — "~일 수도 있어요", "아마 ~일지도". 과잉 단정도 금지 — "반드시", "절대".
· 배치를 인용할 때 <b>별자리와 도수를 함께</b> 밝혀라. "달이 황소자리 22도에 있습니다."
· 각 장마다 <b>부모가 내일 아침에 할 수 있는 행동</b>을 최소 하나. "이해해 주세요"는 행동이 아니다.
· 아이가 말하지 않은 과거 사건을 지어내지 마라. 기질의 구조만 말하고 사건은 말하지 마라.
· 연민 금지. "얼마나 힘드셨어요"는 부모를 약자로 만든다.

[강조 표시]
금색 형광펜 <b>...</b> — 부모가 캡처해 저장할 문장에만. 한 장에 2~3개.
빨간 경고 <span style="color:#ff3b30;font-weight:900;">...</span> — 리포트 전체에 최대 2개.
   아이를 향한 경고가 아니라 <b>부모가 하지 말아야 할 행동</b>에만.
🚨 행성·별자리·하우스·숫자 자체는 절대 강조하지 마라. 판정 문장에만 친다.

[🚨 확정 판정 — 1장은 이걸 그대로 따른다. 뒤집지 마라]
  속도 ${temp.side['속도']} (${temp.strength['속도']})
  표현 ${temp.side['표현']} (${temp.strength['표현']})
  자극 ${temp.side['자극']} (${temp.strength['자극']})
  경계 ${temp.side['경계']} (${temp.strength['경계']})
어느 쪽도 우열이 없다. 한쪽을 문제로 규정하면 실패다.
"중간 — 상황에 따라 달라짐"인 축은 단정하지 말고 그대로 그렇게 써라.

[🚨 사랑이 닿는 통로 — 7장은 이걸 따른다]
1순위 ${praise.top} / 2순위 ${praise.second}
${praise.decisive ? '뚜렷하다. 분명하게 안내하라.' : '차이가 크지 않다. 둘을 섞어 안내하라.'}

[🚨 시간 기준]
오늘은 ${todayStr}, ${C.name}는 만 ${D.ageNow}세다. 이 리포트는 만 ${D.ageTo}세까지 본다.
시기는 아래 계산된 것만 쓴다. 오늘 날짜 자체는 본문에 쓰지 마라.

[역할]
너는 명리학을 오래 공부하다 서양 점성술로 넘어온 40년 경력의 상담가다.
부모 상담을 수천 건 해 봤고, 그래서 아이를 함부로 규정하지 않는다.
아이를 바꾸라고 하지 않고 <b>부모가 아이를 다루는 방식</b>을 바꾸도록 돕는다.
이 리포트는 부모가 평생 소장하며 아이가 클 때마다 다시 꺼내 볼 물건이다.

${(P.timeUnknown || C.timeUnknown) ? `[🚨 태어난 시간을 모르는 사람이 있다]
아래 정보 한계에 제외된 항목은 계산이 불가능하다. 추측해 채우지 마라.
남은 배치로 확신 있게 쓰되, closing 끝에 딱 한 번만 담백하게 안내하라.

` : ''}${!hasP ? `[🚨 부모 출생정보가 없다]
ch5_chemistry 를 빈 문자열 ""로 두어라. 관계를 지어내는 것이 이 상품에서 가장 나쁜 실패다.

` : ''}[아이 나이대 — 톤을 여기 맞춰라]
${CH.AGE_GUIDE[band] || CH.AGE_GUIDE[DEFAULT_BAND]}

[정밀 계산된 데이터 — 트로피컬 · 홀사인]
${digest}

위 좌표·각도·시기는 전부 실제 천체 계산 결과다. 이 데이터만 인용하고 없는 것을 지어내지 마라.

[🚨 분량 — 아래 JSON 필드에 적힌 최소 자수가 유일한 기준이다]
그 숫자를 반드시 지켜라. 짧으면 반려된다. 각 장은 리드문 + 소제목 단락들로 구성한다.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON만]
{
  "headline": "(20자 이내) 이 아이를 한 문장으로. 부모가 저장해 둘 만큼 뾰족하되 <b>절대 부정적이면 안 된다</b>. 덕담도 금지.\\n     좋은 예: '느린 게 아니라 확인하는 중입니다' / '조용한 만큼 안에서 다 봅니다' / '밀면 멈추고, 기다리면 갑니다'",
  "keyword_1": "(6자 이내) 중립이거나 긍정인 키워드. 예: '확인형', '속깊음', '늦게트임'",
  "keyword_2": "(6자 이내)",
  "keyword_3": "(6자 이내)",

  "ch1_title": "(16자 이내) 1장의 제목. 이 아이만의 것으로. 예: '고요한 물 아래, 오래된 영혼'",
  "ch1_lead": "(2~3문장) 1장 리드문. 장치1(직감 승인)으로 열어라.",
  "ch1_nature": "(최소 2100자) [1장 · 우리 아이의 타고난 기질과 성향]\\n     아래 네 개의 서술형 소제목 단락, 각 550자 이상. 소제목은 【】로 감싸고 반드시 문장으로.\\n     【1】 이 아이가 세상에 내민 첫 얼굴 — 상승점을 별자리·도수와 함께. 낯선 자리에서 어떻게 하는지 장면으로.\\n     【2】 속에서 실제로 느끼는 방식 — 달을 별자리·도수와 함께. 무엇이 있어야 안심하는 아이인지.\\n     【3】 이 아이의 속도와 경계 — 위 확정 판정의 속도·경계 축을 장면으로. 재촉했을 때 실제로 벌어지는 일.\\n     【4】 원소와 성질이 말하는 것 — 밸런스 수치를 <b>최소 한 번 숫자로 인용</b>하라. '고정성 별자리에 별이 다섯 개 몰려 있습니다' 처럼.\\n     🚨 축 이름·숫자(±100)를 쓰지 마라. 장치2(이름 바꿔주기)를 반드시 한 번 이상.",

  "ch2_title": "(16자 이내) 2장 제목",
  "ch2_lead": "(2~3문장) 2장 리드문. 장치1로 열어라.",
  "ch2_inside": "(최소 2100자) [2장 · \\"괜찮아\\"라고 할 때, 정말 괜찮은 걸까] ★이 리포트의 심장부\\n     【1】 안에서 느끼는 것 — 달의 배치가 원하는 것을 구체적 장면으로.\\n     【2】 밖으로 보이는 것 — 상승점이 만드는 인상. 사람들이 오해하는 모습 vs 실제 모습을 대비시켜라.\\n     【3】 그래서 이런 아이가 됩니다 — ★장치3을 여기서 터뜨려라. 위 [2장] 판정을 그대로 따르라.\\n         어긋남이 있다고 나왔으면 그 어긋남을, 없다고 나왔으면 일치의 안심을 써라. 판정을 뒤집지 마라.\\n     【4】 이럴 때 이런 신호가 나옵니다 — 부모가 알아볼 수 있는 신호를 3가지 이상 구체적으로.\\n     【5】 그래서 부모님이 하실 일 — 반드시 행동으로 닫아라. 죄책감으로 끝내면 실패다.\\n     각 단락 420자 이상.",

  "ch3_title": "(16자 이내) 3장 제목",
  "ch3_lead": "(2~3문장) 3장 리드문",
  "ch3_outside": "(최소 1400자) [3장 · 집 밖에서 이 아이는 어떤 얼굴일까]\\n     부모는 집에서의 아이만 본다. 여기서는 밖에서의 모습만.\\n     【1】 처음 보는 사람에게 비치는 모습 — 상승점·수성 근거.\\n     【2】 또래 사이에서의 자리 — 계산된 하우스 근거만. 근거가 없다고 나왔으면 억지로 사교성을 논하지 마라.\\n     【3】 학교나 단체에서 힘들어지는 순간과, 그때 집에서 해줄 것.\\n     각 단락 440자 이상. 🚨 친구가 많다/적다를 단정하지 마라. 관계를 맺는 방식만 써라.",

  "ch4_title": "(16자 이내) 4장 제목",
  "ch4_lead": "(2~3문장) 4장 리드문",
  "ch4_talent": "(최소 1600자) [4장 · 이 아이가 타고난 것은 어디에 있을까]\\n     【1】 이 아이가 남들보다 쉽게 되는 것 — 계산된 하우스·행성 근거로 2~3가지. '창의적입니다' 같은 추상어 금지.\\n     【2】 배우는 방식 — 수성 근거. 어떻게 가르쳐야 들어가는지 부모가 바로 쓸 수 있게.\\n     【3】 지금 시켜볼 만한 것 — 구체적으로. 🚨 직업을 못 박지 마라. '이 아이는 의사가 됩니다'는 아이 인생을 좁힌다.\\n         '예를 들면' 수준으로 활동을 들어라. 예: 만들기, 악기, 글쓰기, 운동 종목.\\n     각 단락 480자 이상.",

  "ch5_title": "(16자 이내) 5장 제목${hasP ? '' : ' — 부모 정보가 없으므로 빈 문자열'}",
  "ch5_lead": "(2~3문장) 5장 리드문${hasP ? '' : ' — 빈 문자열'}",
  "ch5_chemistry": "${hasP ? `(최소 2200자) [5장 · 나와 이 아이의 케미스트리]\\\\n     【1】 ${P.name}은 이런 사람입니다 — 부모 기질을 먼저. 🚨 아이만 분석하면 실패다. 부모도 자기를 이해받아야 한다.\\\\n     【2】 붙는 자리 — 소프트각 근거. 두 사람이 서로 편해지는 지점. 여기를 늘리는 방법까지.\\\\n     【3】 거리를 둘 자리 — 하드각 근거. 🚨 멀어지라는 뜻이 아니라 그 주제에서만 한 발 물러서라는 뜻이다.\\\\n         🚨 아이의 문제로 쓰지 마라. 두 기질이 어긋날 뿐 둘 다 잘못이 없다.\\\\n     【4】 이 아이가 내 인생에 들어온 방 — 하우스 오버레이 근거. 같은 부모라도 아이마다 방이 다르다.\\\\n     【5】 물려받은 자리 — 위 데이터에 이 항목이 있을 때만 쓴다. 없으면 이 소제목을 통째로 빼라.\\\\n     각 단락 440자 이상.` : '(빈 문자열 "")'}",

  "ch6_title": "(16자 이내) 6장 제목",
  "ch6_lead": "(2~3문장) 6장 리드문",
  "ch6_pace": "(최소 1600자) [6장 · 기다려야 할 때와, 밀어줘야 할 때]\\n     🚨 아래 두 소제목을 그대로, 순서도 바꾸지 마라.\\n     【기다려야 할 것 3가지】 각각 행동 단위로. '기다려 주세요' 같은 뻔한 말 금지. 왜 기다려야 하는지 배치 근거와 함께.\\n     【밀어줘도 되는 것 3가지】 이 아이는 여기서는 밀어도 부러지지 않는다는 것을 근거와 함께.\\n     마지막에 【재촉이 통하지 않을 때 대신 쓸 문장】 — 부모가 실제로 입에 올릴 문장 3개를 따옴표로.",

  "ch7_title": "(16자 이내) 7장 제목",
  "ch7_lead": "(2~3문장) 7장 리드문",
  "ch7_love": "(최소 1400자) [7장 · 이 아이에게 사랑이 도착하는 통로]\\n     【1】 이 아이에게 사랑이 들어가는 문 — 위 확정된 통로를 배치 근거와 함께.\\n     【2】 지금까지 어긋났다면 그 이유 — 🚨 부모가 사랑을 안 준 게 아니라 다른 문으로 넣었을 뿐이다. 이걸 분명히 하라.\\n     【3】 오늘부터 쓸 수 있는 말과 행동 — 실제 문장 예시 3개 이상을 따옴표로.\\n     🚨 반응이 시원찮은 아이로 몰지 마라. 잘 반응하는 아이라면 '지금 방식이 맞습니다'가 답이다.\\n     각 단락 440자 이상.",

  "ch8_title": "(16자 이내) 8장 제목",
  "ch8_lead": "(2~3문장) 8장 리드문",
  "ch8_timeline": "(최소 2200자) [8장 · 앞으로 열리는 시기와, 잠깐 단단해질 시기] ★★\\n     🚨 반드시 열리는 시기를 먼저, 단단해질 시기를 뒤에. 고비로 열면 부모가 불안해진다.\\n     【1】 열리는 시기 — 위 목성 항목의 나이와 연도를 <b>그대로</b> 인용. 그때 부모가 할 일까지.\\n         🚨 그 시기를 '정점'으로 쓰지 마라. 첫 개화일 뿐이고 진짜 절정은 훨씬 뒤다.\\n     【2】 이미 지나간 시기 — 계산된 시기 중 지금 나이보다 이전 것이 있으면 <b>반드시 먼저 짚어라</b>.\\n         '이 무렵 이런 일이 있지 않으셨나요' 형태로. 부모가 맞다고 확인하는 순간 앞의 예고가 믿음이 된다.\\n         지나간 시기가 없으면 이 소제목을 빼라.\\n     【3】 앞으로 단단해질 시기 — 토성 항목의 나이·연도를 그대로 인용. 여러 번에 걸쳐 온다고 나온 시기는\\n         그 사실을 반드시 알려라. 한 번 지나갔다고 끝난 게 아니다.\\n         🚨 불행 예고로 쓰지 마라. 성장통이고 미리 알면 훨씬 수월하다는 톤으로.\\n     【4】 그 시기마다 부모가 할 일 — 각 시기별로 구체적으로.\\n     각 단락 480자 이상. 🚨 곡선이나 시기에 점수를 매기지 마라.",

  "ch9_title": "(16자 이내) 9장 제목",
  "ch9_lead": "(2~3문장) 9장 리드문",
  "ch9_tenyears": "(최소 1250자) [9장 · 10년 뒤, 이 아이와 나]\\n     오늘 만 ${D.ageNow}세인 ${C.name}는 10년 뒤 만 ${D.ageTo}세가 된다.\\n     【1】 지금의 기질이 그때 어떤 모습이 되는가 — 구체적으로.\\n     【2】 그때의 두 사람 — 아이가 부모에게서 멀어지는 것은 정상이라는 전제로.\\n     🚨 마지막 문장은 ${P.name}에 대한 것으로 끝내라. 아이가 아니라 부모가 주어여야 한다.",

  "closing": "(최소 400자) 맺음말. <b>${C.name}를 대신해 부모에게 건네는 말</b>의 결로.\\n     감상적으로 흐르지 말고, 이 리포트 전체에서 드러난 이 아이의 핵심을 한 번 더 못 박아라.\\n     마지막 한 문장은 <blockquote> 태그로.",

  "teaser": "(3문장) 이 리포트는 ${C.name} 한 아이만 본 것이다. 형제가 있다면 같은 부모라도 완전히 다른 자리에 들어와 있다는 점을 짚어라.\\n     이번에 드러난 배치 하나를 지목하고, 다른 아이는 그 자리가 어떻게 다른지 궁금해지도록. 강매 톤·가격 언급 금지. 질문으로 끝내라."
}`;
}

/* -------------------------------------------------------------------------
   Gemini 호출 + 검증
------------------------------------------------------------------------- */
/* 🚨 분량 기준은 여기 한 곳에만 둔다.
   api/gemini-vip.js 주석에 적힌 교훈이다 — 분량 지시가 여러 곳에 흩어져 있으면
   모델이 그중 가장 짧은 것에 맞춰 알아서 줄여 쓴다. 프롬프트 본문에서는
   분량을 말하지 않고 JSON 필드 스펙에만 적었으며, 검증도 이 표만 본다. */
/* 🚨 최소 분량 — 2026-08-02 하향 조정
   ----------------------------------------------------------------------------
   [무슨 일이 있었나]
   실제 주문(20260802-0000842) 로그에서 Gemini 를 3번 호출했다.

       1차  5.67초  → 분량 미달로 반려
       2차 17.25초  → 반려
       3차 23.93초  → 통과 (마지막 시도라 70% 로 완화된 덕분)

   총 4분 4초가 걸렸다. 제한이 5분이므로 여유가 56초뿐이었다.
   Gemini 가 조금만 느렸으면 타임아웃으로 손님이 또 못 받았다.

   [원인]
   기존 합계가 18,200자였다. 한 번의 응답으로 그만큼 내기 어려워
   1차가 짧게 나오고, 반려되며 점점 길어지는 패턴이 반복됐다.

   [조치]
   합계 18,200 → 16,250자 (기존의 89%, A4 약 11.6쪽).

   깎는 위치를 고르는 것이 중요했다. 이 상품의 값어치는
   5장(부모와 부딪히는 자리)과 8장(성장 분기점)에 있으므로
   그 둘은 2400 → 2200 으로 거의 유지하고, 보조 장에서 더 깎았다.

   ⚠️ 이 값은 '최소 기준'이지 '목표'가 아니다.
      Gemini 는 보통 기준보다 길게 쓴다. 기준을 내린다고 리포트가
      짧아지는 것이 아니라 "이 정도면 통과" 의 선이 내려갈 뿐이다.
      기존 18,200 이 문제였던 건 한 번에 그 분량이 안 나와
      매번 2~3회씩 재시도했고, 그래서 4분이 걸리고 비용이 3배로 든 것이다.

   ⚠️ 이 아래로 내리지 말 것. 24,900원짜리의 체감 분량이 무너진다.
      참고로 VVIP(29,900원)의 최소 기준이 7,438자다. */
const SPEC = [
  { key: 'ch1_nature',    min: 2100 },
  { key: 'ch2_inside',    min: 2100 },
  { key: 'ch3_outside',   min: 1400 },
  { key: 'ch4_talent',    min: 1600 },
  { key: 'ch5_chemistry', min: 2200, needsParent: true },   /* ★ 핵심 */
  { key: 'ch6_pace',      min: 1600 },
  { key: 'ch7_love',      min: 1400 },
  { key: 'ch8_timeline',  min: 2200 },                      /* ★ 핵심 */
  { key: 'ch9_tenyears',  min: 1250 },
  { key: 'closing',       min: 400 }
];
const TITLE_KEYS = ['ch1_title','ch2_title','ch3_title','ch4_title','ch5_title',
                    'ch6_title','ch7_title','ch8_title','ch9_title'];
const LEAD_KEYS  = ['ch1_lead','ch2_lead','ch3_lead','ch4_lead','ch5_lead',
                    'ch6_lead','ch7_lead','ch8_lead','ch9_lead'];
const REQUIRED_KEYS = ['headline'].concat(SPEC.map(x => x.key));

const BANNED = /undefined|null|NaN|어스펙트 목록|다이제스트|확정 판정|판정문|사우스노드|노스노드|합성차트|정보 완전도|속도축|표현축|자극축|경계축/i;

const HEDGE = /(수 있습니다|수 있어요|수도 있습니다|수 있고|수 있으며|여지가 있습니다)/g;
const HEDGE_LIMIT = 12;

const METAPHOR_OPEN = /^.{0,40}(마치|같은 아이|듯한|처럼 느껴지는)/;

/* 🚨🚨 아이 낙인 차단 — 마지막 시도에서도 통과시키지 않는다.
   ----------------------------------------------------------------------
   ⚠️ 정규식을 넓게 잡으면 정상 문장까지 반려되어 손님이 에러 화면을 본다.
      그래서 '결함으로 규정하는 표현' 자체를 고정 패턴으로 잡고,
      '아이 이름 + 부정 단정' 형태는 이름을 넣어 동적으로 만든다.
      "집중하기 어려워하는 편입니다" 같은 완화형은 통과시킨다. 그건 기질 서술이다. */
const LABEL_FIXED =
  /(소질이 없|재능이 없|재능은 없|머리가 나쁘|공부를 못|거짓말을 잘|거짓말쟁이|게으른 아이|게을러서|산만한 아이|문제아|버릇없는 아이|이기적인 아이|모자란 아이|뒤떨어지는 아이|잘하는 게 없|집중력이 없)/;
/* 🚨 한글은 음절 단위다: "잘하"는 "잘합니다"(잘+합)와 매칭되지 않는다.
   그래서 "거짓말을 잘", "공부를 못"처럼 어간 앞에서 끊는다.
   "공부를 못 하는 게 아니라" 같은 방어적 문장까지 같이 걸리지만,
   그런 화법 자체를 프롬프트가 금지하고 있고, 아이 보호가 오탐 한 건보다 무겁다. */

/* 아이의 미래를 부정적으로 단정하는 형태
   🚨 "이 시기가 어렵습니다"(시기 예고 = 상품의 본질)는 잡지 않는다.
      잡는 것은 능력·인생 자체에 대한 단정이다: "커서 성공하기 어렵습니다",
      "평생 못 고칩니다", "어른이 되어도 힘들 겁니다" 류.
   🚨 (?<![잊잃]지\s?)못 : "평생 잊지 못할 순간" 같은 긍정 관용구만 예외로 뺀다. */
const DOOM_FIXED =
  /((커서|평생|어른이 되어도|나중에도|앞으로도)\s*[^.。!?\n]{0,15}((?<![잊잃]지\s?)못|힘들|실패|고생|어렵)|(성공|행복)하기\s*어렵|장래가|가망이)/;

function labelFor(name) {
  const n = String(name).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return new RegExp(
    n + '(은|는|이|가)\\s*[^.。!?\\n]{0,20}' +
    '(소질이 없|재능이 없|능력이 없|잘하지 못합니다|못하는 아이|안 되는 아이|부족한 아이|거짓말을 잘|공부를 못)'
  );
}

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

function validate(data, P, C, hasParent, isLastAttempt) {
  if (!data || typeof data !== 'object') return '응답이 객체가 아님';

  /* 부모 정보가 없으면 5장은 비어 있는 게 정답이다 */
  for (const sp of SPEC) {
    if (sp.needsParent && !hasParent) continue;
    const v = String(data[sp.key] || '').trim();
    if (!v) return `필수 항목 누락: ${sp.key}`;
    /* 마지막 시도에서는 70%까지 봐준다. 완벽을 고집하다 손님에게
       아무것도 못 주는 것이 더 나쁘기 때문이다. */
    const need = isLastAttempt ? Math.round(sp.min * 0.7) : sp.min;
    if (v.length < need) return `${sp.key} 분량 부족 (${v.length}자 / 최소 ${need}자)`;
  }
  if (!hasParent && String(data.ch5_chemistry || '').trim().length > 50) {
    return '부모 출생정보가 없는데 ch5_chemistry 를 채웠다. 관계를 지어내면 안 된다. 빈 문자열로 두어라.';
  }
  for (const k of TITLE_KEYS.concat(LEAD_KEYS)) {
    const skip = (!hasParent && (k === 'ch5_title' || k === 'ch5_lead'));
    if (!skip && !String(data[k] || '').trim()) return `필수 항목 누락: ${k}`;
  }

  const body = REQUIRED_KEYS.map(k => String(data[k] || '')).join(' ');
  if (BANNED.test(body)) return '시스템 용어 노출';
  if (hasParent && !body.includes(P.name)) return `${P.name} 이름 누락`;
  if (!body.includes(C.name)) return `${C.name} 이름 누락`;

  /* 🚨 아래 둘은 마지막 시도에서도 절대 통과시키지 않는다.
        품질 문제가 아니라 아이에게 실제 해가 가는 문제이기 때문이다. */
  if (LABEL_FIXED.test(body) || labelFor(C.name).test(body)) {
    return `${C.name}의 능력이나 성격을 결함으로 규정한 문장이 있다. ` +
           `"소질이 없습니다", "산만한 아이" 같은 표현을 전부 빼고, ` +
           `"${C.name}는 한 번에 하나씩 줄 때 훨씬 멀리 갑니다"처럼 대응 방법과 함께 중립적으로 다시 써라.`;
  }
  if (DOOM_FIXED.test(body)) {
    return `${C.name}의 미래를 부정적으로 단정한 문장이 있다. ` +
           `"커서 ~하게 됩니다", "평생 ~" 을 전부 빼고 지금의 기질과 부모가 할 수 있는 일만 써라.`;
  }

  if (!isLastAttempt) {
    const hedges = (body.match(HEDGE) || []).length;
    if (hedges > HEDGE_LIMIT) return `발뺌 화법 과다 (${hedges}회 / 허용 ${HEDGE_LIMIT}회)`;
    for (const sp of SPEC) {
      if (sp.needsParent && !hasParent) continue;
      if (METAPHOR_OPEN.test(String(data[sp.key]))) return `${sp.key} 이 비유로 시작함`;
    }
    const CLICHE = /(씨앗처럼|나무처럼|그릇처럼|거울처럼|한 송이|잃어버[린렸])/;
    if (CLICHE.test(body)) return '상투적 비유 사용 (씨앗/나무/그릇/거울 등)';
  }
  return null;
}

/* 🚨 한 번의 Gemini 호출에 상한을 건다 — 2026-08-02 추가
   --------------------------------------------------------------------------
   시간 예산만으로는 부족하다. "다음 시도를 시작해도 되는가" 는 막을 수 있지만
   "시작한 시도가 언제 끝나는가" 는 막지 못한다.

   전수 탐색 결과, 75초 · 75초로 두 번 돌고 3차가 246초로 튀면
   총 396초가 되어 Vercel 제한(300초)을 넘긴다.

   타임아웃은 최악의 실패다. 함수가 통째로 죽어서
   KV 에 실패 기록도 못 남기고 락도 안 풀린다.
   그러면 손님이 다시 눌러도 5분간 202(pending) 만 돌아온다.

   그래서 한 호출이 이 시간을 넘기면 스스로 끊는다.
   끊긴 시도는 실패로 처리되고, 남은 예산으로 다음을 시도하거나
   차선 원고를 쓴다. 어느 쪽이든 손님은 무언가를 받는다. */
const CALL_TIMEOUT_MS = 100000;   // 100초

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`;
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), CALL_TIMEOUT_MS);
  try {
  const r = await fetch(url, {
    signal: ac.signal,
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: {
        maxOutputTokens: 65536,
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
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Gemini 응답 ${CALL_TIMEOUT_MS / 1000}초 초과로 중단`);
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
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
      /* 🔒 IDOR 가드 — 새 리포트는 토큰 필요(강제 모드), 구버전은 통과 */
      if (!SEC.guardView(saved, req)) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(403).json({ error: '접근 권한이 없습니다. 결제하신 기기·링크로 다시 열어주세요.' });
      }
      if (saved.status === 'completed') {
        res.setHeader('Cache-Control', 'private, max-age=300');
        res.setHeader('ETag', `"child-${orderId}"`);
      } else {
        res.setHeader('Cache-Control', 'no-store');
      }
      return res.status(200).json(SEC.stripToken(saved));
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
    const P = normPerson(body.parent || body.personA, '부모');
    const C = normPerson(body.child || body.personB, '아이');
    if (!P) return res.status(400).json({ error: '부모 정보를 다시 확인해주세요. (생년월일·태어난 시간 형식)' });
    if (!C) return res.status(400).json({ error: '아이 정보를 다시 확인해주세요. (생년월일·태어난 시간 형식)' });
    if (P.name === C.name) C.name = C.name + '(아이)';

    /* 아이가 부모보다 먼저 태어난 입력은 자리를 바꿔 넣은 것이다 */
    if (C.date < P.date) {
      return res.status(400).json({ error: '아이의 생년월일이 부모보다 빠릅니다. 입력 순서를 확인해주세요.' });
    }

    const band = AGE_BANDS.indexOf(body.ageBand) !== -1 ? body.ageBand : DEFAULT_BAND;

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

    /* ---------- 3. 생성 락 ---------- */
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
    const [pChart, cChart] = await Promise.all([fetchChart(P, token), fetchChart(C, token)]);

    /* ---------- 5. 양육 전용 계산 ---------- */
    const built = CH.buildChildDigest(
      pChart, cChart, P.name, C.name, band, { y: C.y, m: C.mo, d: C.d }
    );

    /* ---------- 6. 리포트 생성 (최대 3회) ---------- */
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;
    /* 🚨 시간 예산 관리 — 2026-08-02 추가
       ------------------------------------------------------------------
       실제 주문에서 3회 시도에 4분 4초가 걸렸다. 제한은 5분이다.
       여유가 56초뿐이었고, Gemini 가 조금만 느렸으면 타임아웃이 나서
       손님이 결제하고도 아무것도 못 받았을 것이다.

       타임아웃은 최악의 실패다. 함수가 통째로 죽어서
       KV 에 실패 기록조차 남기지 못하고, 락도 안 풀린다.
       그러면 손님이 다시 눌러도 5분간 202(pending) 만 돌아온다.

       그래서 매 시도 전에 "다음 시도를 감당할 시간이 있는가" 를 본다.
       없으면 루프를 끊고, 지금까지 받은 것 중 가장 나은 후보를 쓴다.
       완벽한 리포트를 못 주는 것보다 아무것도 못 주는 것이 훨씬 나쁘다. */
    const T0 = Date.now();
    const BUDGET_MS = 240000;        // 4분. 남은 60초는 저장·응답 몫
    let   needMs    = 70000;         // 다음 시도에 필요할 시간 (실측으로 갱신)

    let data = null, lastErr = '', correction = '';
    let best = null, bestLen = 0;    // 전부 반려됐을 때 쓸 차선책

    for (let attempt = 1; attempt <= 3; attempt++) {
      const spent = Date.now() - T0;
      if (attempt > 1 && spent + needMs > BUDGET_MS) {
        console.error(`⏱️ 시간 부족으로 ${attempt}차 시도 생략 ` +
                      `(경과 ${Math.round(spent/1000)}초 · 예상 소요 ${Math.round(needMs/1000)}초)`);
        break;
      }
      /* 마지막 기회인지 판단할 때 시간도 함께 본다.
         3차가 아니어도 시간이 없으면 그게 마지막이므로 기준을 완화해야 한다. */
      const isLast = (attempt === 3) || (spent + needMs * 2 > BUDGET_MS);
      const tryStart = Date.now();

      try {
        const prompt = buildPrompt({
          P, C, digest: built.text, band, D: built, todayStr, correction
        });
        const candidate = sanitize(await callGemini(prompt));

        /* 🚨 다음 시도에 필요한 시간을 '직전 실측값'으로 갱신한다.
           고정값 70초로 예측하면, 한 번이 150초 걸리는 날에
           "아직 여유 있다" 고 판단해 시작했다가 5분을 넘겨 타임아웃이 난다.
           20% 여유를 붙여 보수적으로 잡는다. */
        needMs = Math.max(needMs, Math.round((Date.now() - tryStart) * 1.2));

        const bad = validate(candidate, P, C, built.hasParent, isLast);
        if (bad) {
          lastErr = bad;
          correction = bad;
          /* 반려됐어도 버리지 않는다. 분량 부족 정도라면
             아무것도 못 주는 것보다는 이쪽이 낫다.
             단, 아이를 규정하거나 미래를 단정한 원고는 절대 후보로 삼지 않는다. */
          const len = REQUIRED_KEYS.reduce((n, k) => n + String(candidate[k] || '').length, 0);
          const unsafe = /규정한 문장|부정적으로 단정/.test(bad);
          if (!unsafe && len > bestLen) { best = candidate; bestLen = len; }
          console.error(`🔥 [시도 ${attempt}] 검증 실패: ${bad}`);
          continue;
        }
        data = candidate;
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}]`, err.message);
        if (err.status === 503 || err.status === 429) {
          /* 대기 시간도 예산 안에서만 쓴다.
             503 은 수십 초 지속되므로 20초·45초를 확보하되,
             남은 시간이 그만큼 없으면 그 안에서만 기다린다. */
          const want = RETRY_WAIT_MS[attempt - 1] || 0;
          const room = Math.max(0, BUDGET_MS - (Date.now() - T0) - needMs);
          const wait = Math.min(want, room);
          if (wait > 0) {
            console.warn(`⏳ Gemini ${err.status} — ${Math.round(wait / 1000)}초 대기 후 재시도`);
            await new Promise(r => setTimeout(r, wait));
          }
        }
      }
    }

    /* 전부 반려됐지만 안전 기준은 통과한 원고가 있으면 그것을 쓴다 */
    if (!data && best) {
      console.error(`⚠️ 전 시도 반려. 차선 원고 사용 (${bestLen}자, 사유: ${lastErr})`);
      data = best;
    }

    if (!data) {
      if (orderId) {
        await kv.set(KEY_PREFIX + orderId, { status: 'failed', error: lastErr, at: Date.now() }, { ex: 60 * 30 });
        await kv.del(lockKey);
      }
      res.setHeader('Cache-Control', 'no-store');
      return res.status(500).json({ error: '리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', detail: lastErr });
    }

    /* ---------- 7. 계산값은 코드값으로 덮어쓴다 (AI가 바꿨을 가능성 차단) ---------- */
    data.temperament = built.temperament.side;
    data.temper_strength = built.temperament.strength;
    data.praise_top = built.praise.top;
    data.balance = built.balance;
    data.saturn_timeline = built.saturn;
    data.jupiter_bloom = built.jupiter;
    data.growth_curve = built.curve;

    const payload = {
      status: 'completed',
      /* 🔒 뷰 토큰 — POST 응답에 실려 프론트 localStorage에 저장된다 */
      _vt: SEC.makeViewToken(orderId) || undefined,
      generatedAt: Date.now(),
      version: 1,
      meta: {
        parentName: P.name,
        childName: C.name,
        childBirth: C.date,
        ageBand: band,
        temperament: built.temperament.side,
        praiseTop: built.praise.top,
        ageNow: built.ageNow,
        ageTo: built.ageTo,
        saturn: built.saturn,
        jupiter: built.jupiter,
        balance: built.balance,
        curve: built.curve,
        hasParent: built.hasParent
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
    console.error('🔥 gemini-child.js 에러:', error);
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

module.exports = SEC.secure(handler, { name: 'child' });
