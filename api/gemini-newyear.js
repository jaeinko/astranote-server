// ============================================================================
//  api/gemini-newyear.js — 아스트라노트 신년운세 (product_no=18 · 14,900원)
// ----------------------------------------------------------------------------
//  ★ 기존 상품 파일을 한 줄도 수정하지 않습니다.
//     추가: lib/astro-newyear.js · lib/natal.js · lib/gemini-run.js · 이 파일
//
//  ▣ 어느 해를 보나
//     서울 날짜 기준 11월 1일부터는 '다음 해', 그 전에는 '올해'.
//     (2026-11-09 구매 → 2027년 신년운세)
//     연중에 산 손님에게는 이미 지난 달이 '맞혀보기' 장치가 됩니다.
//
//  ▣ 상품번호 18 — 카페24에서 상품을 만든 뒤 번호가 다르면
//     이 파일의 NO, public/newyear.js 의 NO, public/intake.js 의 NEWYEAR_NO,
//     public/resolve.js · public/save.js · api/admin-order.js 의 18 을 같이 바꾸세요.
//
//  ▣ 안전 차단 (마지막 시도에서도 통과 안 함)
//     · 질병·사고·죽음 예고           · 특정 투자 권유(주식·코인 매수)
//     · "최악의 해" 같은 한 해 저주
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');
const NY = require('../lib/astro-newyear.js');
const FC = require('../lib/astro-forecast.js');
const NA = require('../lib/natal.js');
const GR = require('../lib/gemini-run.js');
const V = require('../lib/validate.js');
const cityCoordinates = require('../lib/cities.js');
const { allowCors } = require('../lib/cors.js');
const { enforceRateLimit } = require('../lib/security.js');

const NO = '18';
const KEY_PREFIX = 'newyear-report:';
const LOCK_PREFIX = 'newyear-lock:';
const INTAKE_PREFIX = 'newyear-intake:';
const YEAR_SEC = 60 * 60 * 24 * 365;
const OTHER_PRODUCT_KEYS = ['report:', 'vip-report:', 'monthly:', 'couple-report:', 'child-report:', 'reunion-report:'];

const STATUSES = ['솔로', '연애 중', '기혼', '복잡한 관계'];
const FOCUSES = ['전체', '연애·결혼', '돈', '일·이직', '건강', '공부·시험'];
const FOCUS_CH = { '연애·결혼': 'ch5_love', '돈': 'ch6_money', '일·이직': 'ch7_work', '건강': 'ch8_body', '공부·시험': 'ch7_work' };

function normPerson(p) {
  if (!p || typeof p !== 'object') return null;
  const name = V.cleanName(p.name, 20);
  const time = String(p.time || '').trim();
  const timeUnknown = !!p.timeUnknown || time === '' || time === '모름';
  const date = V.normalizeDate(p.date);
  if (!name || !date) return null;
  const okTime = timeUnknown ? null : V.normalizeTime(time);
  if (!timeUnknown && !okTime) return null;
  return { name, date, time: okTime, timeUnknown,
    city: p.city && cityCoordinates[p.city] ? p.city : 'Seoul',
    gender: p.gender === '남성' ? '남성' : (p.gender === '여성' ? '여성' : '미상') };
}

/* ── 프롬프트 ─────────────────────────────────────────────── */
const STATUS_GUIDE = {
  '솔로': '지금 연애하지 않는다. 애정운은 "언제, 어디서, 어떤 사람이 들어오는가"를 중심으로.',
  '연애 중': '지금 연애 중이다. 애정운은 "이 관계가 올해 어디로 가는가(깊어짐·결혼 이야기·고비)"를 중심으로. 헤어짐을 부추기지 마라.',
  '기혼': '결혼했다. 애정운은 "부부 사이의 온도와 집안의 일"을 중심으로. 새로운 연애·이성 인연을 암시하는 문장은 절대 쓰지 마라.',
  '복잡한 관계': '관계가 정리되지 않은 상태다. 애정운은 "올해 이 관계가 정리되는 방향과 시기"를 중심으로. 어느 쪽도 강요하지 마라.'
};

/* ============================================================================
   원고는 두 덩어리로 나눠 '동시에' 쓴다 (2026-11-10)
   ----------------------------------------------------------------------------
   분량을 약 1만 9천 자로 늘렸다. 한 번에 쓰면 Gemini 한 번 호출이 100초를 넘겨
   손님이 기다리다 시간 초과가 난다. 앞(A)·뒤(B)를 병렬로 쓰면 기다리는 시간은 그대로다.

     A  첫 화면 한 문장 · 키워드 · 1~6장 · 맺음말 · VVIP 연결   약 1만 자
     B  7~8장 · 열두 달 · 꼭 기억할 날 · 세 가지 힌트          약 9천 자
   ============================================================================ */
const SPEC_A = [
  { key: 'ch1_overview', min: 1600 }, { key: 'ch2_theme', min: 1400 },
  { key: 'ch3_jupiter', min: 1800, three: true }, { key: 'ch4_saturn', min: 1800, three: true },
  { key: 'ch5_love', min: 1700 }, { key: 'ch6_money', min: 1500 }, { key: 'closing', min: 500 }
];
const SPEC_B = [
  { key: 'ch7_work', min: 1500 }, { key: 'ch8_body', min: 1200 },
  { key: 'ch9_keydates', min: 1200 }, { key: 'ch10_action', min: 1000, three: true }
].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ key: 'month_' + m, min: 350 })));
const SPEC = SPEC_A.concat(SPEC_B);
const TEXT_KEYS = ['headline'].concat(SPEC.map(s => s.key));

/* 두 덩어리가 똑같이 받는 앞부분 — 손님 정보·계산 데이터·문장 규칙 */
function promptHead(v) {
  const P = v.P, D = v.D, Y = D.year;
  const passed = D.passedUntil;
  return `${v.correction ? `[🚨🚨🚨 직전 원고 반려 — 아래를 반드시 고쳐서 다시 써라]
${v.correction}
이 지적을 무시하면 또 반려된다. 나머지 규칙은 그대로 지키면서 이 부분만 확실히 고쳐라.

` : ''}[🚨🚨 최우선 절대 금지]
'undefined', 'null', 'NaN', '다이제스트', '확정값', '프로펙션', '흐름 점수', '상대 점수' 같은 시스템 용어를 본문에 쓰지 마라.
🚨 마크다운 금지. **굵게**, # 제목 전부 금지. HTML 로 그대로 출력된다.

[🚨 제1원칙]
1. 병·사고·죽음을 예고하지 마라. 컨디션은 '체력과 집중의 리듬'으로만 쓴다. 의학적 진단 금지.
2. 특정 투자(주식·코인·부동산 매수)를 권하지 마라. 돈은 '흐름과 태도'로만 쓴다.
3. 한 해를 저주하지 마라. "최악의 해", "불운한 해", "아무것도 되지 않는 해" 금지. 힘든 달은 "무엇을 조심하면 지나가는지"로 쓴다.
4. 나이·외모·결혼 여부로 손님을 평가하지 마라.
5. 새해 리포트다. 읽고 나서 기운이 나야 한다. 조심할 것도 '미리 알면 약이 된다'는 마음으로, 겁이 아니라 준비로 써라.

[역할]
너는 명리학을 오래 공부하다 서양 점성술로 넘어온 상담가다. 이과 출신이라 근거 없는 말을 싫어한다.
${P.name}님이 14,900원을 내고 ${Y}년 한 해를 물어보러 왔다. 띠별 운세와 달라야 한다 — 이 사람의 차트에만 해당하는 이야기를 써라.
분량이 넉넉한 프리미엄 리포트다. 각 장을 꽉 채워라. 같은 말을 되풀이해 분량을 채우지 말고, 장면·시기·행동을 더 구체적으로 풀어서 채워라.

[손님]
${P.name}님 (${P.gender}). 연애 상태: ${v.status}. 올해 가장 궁금한 것: ${v.focus}.
${STATUS_GUIDE[v.status] || STATUS_GUIDE['솔로']}

[🚨 시간 기준]
오늘은 ${v.todayStr}이다. 이 리포트는 ${Y}년 1월~12월을 본다.
${passed > 0 ? `🚨 ${Y}년 1월~${passed}월은 이미 지났다. 그 달들은 과거형으로 "이 무렵 ~한 일이 있지 않으셨나요"처럼 짚어라. 손님이 "맞다"고 느끼는 순간 앞으로의 달이 믿음이 된다. 단, 구체적 사건을 지어내지 말고 '그 달의 성격'만 짚어라.` : '모든 달은 아직 오지 않았다. 미래형으로 써라.'}
날짜는 아래 계산된 것만 쓴다. 오늘 날짜 자체는 본문에 쓰지 마라.

${P.timeUnknown ? `[태어난 시간을 모른다]
하우스는 태양 별자리를 1하우스로 두는 방식으로 계산했다. 그 사실을 본문에 반복하지 마라.

` : ''}[정밀 계산된 데이터]
${D.text}

위 날짜·하우스·점수는 전부 실제 천체 계산 결과다. 이 데이터만 인용하고 없는 것을 지어내지 마라.

[🔭 네 가지 기법을 이렇게 써라]
이 리포트는 기법 네 개로 1년을 본다: ① 1년 365일 행성의 이동  ② 올해의 메인테마(나이마다 한 칸씩 도는 인생의 주제)
③ 올해 생일 차트(솔라 리턴 — 태양이 태어난 자리로 돌아오는 순간의 차트)  ④ 마음의 시계(진행 달 — 태어난 뒤 하루가 인생 1년)
· 손님에게는 "올해 생일 차트", "마음의 시계"라고 부르고, 처음 한 번만 괄호로 원래 이름을 붙여라.
· ★ '여러 기법이 겹치는 곳'은 이 리포트의 중심이다. 1장에서 "기법 몇 개가 같은 곳을 가리킨다"고 분명히 밝히고 확신 있게 말하라.
  한 기법만 가리키는 것은 가볍게. 겹치지 않는 것을 세게 말하면 틀린다.
· 2장 메인테마는 메인테마 + 올해 생일 차트의 얼굴(상승 별자리가 떨어진 자리)을 엮어서.
· 열두 달은 마음의 시계가 출생 행성에 닿는 달을 그 달의 핵심으로 써라. 마음의 시계가 자리를 옮기는 날은 "이때부터 마음이 ○○ 쪽으로 기웁니다"처럼 날짜와 함께.

[✍️ 문장 규칙]
· 첫 문장은 장면이나 단정으로. 첫 문장에 '마치·~같은·~듯한·~처럼' 금지.
· 별자리 일반론 금지 ("사자자리는 열정적" 금지). 유사영성 어휘 금지 (우주의 기운, 파동, 에너지가 흐르다).
· '하우스'·'방'이라는 말은 되도록 쓰지 말고 생활 영역으로 풀어라. "목성이 5하우스를 지납니다" ❌ → "올해 상반기, 복은 연애와 즐거움 쪽으로 들어옵니다" ✅
  꼭 써야 하면 괄호 안에만 한 번: "연애와 즐거움 쪽(5하우스)"
· 발뺌 금지("~일 수도 있어요", "아마"). 과잉 단정도 금지("반드시", "100%").
· 각 장에 15자 이내 짧은 단정문을 하나씩. 문장·단락 길이를 섞어라. 단락 구분은 <br><br>.
· 각 장마다 <b>올해 실제로 할 행동</b>을 최소 하나. "긍정적으로 생각하세요"는 행동이 아니다.
· 소제목은 【】로 감싸고 반드시 문장으로.

${GR.KO_STYLE}
[강조]
금색 <b>...</b> — 손님이 캡처할 판정 문장에만. 한 장에 2~3개. 행성·별자리·숫자·날짜에는 치지 마라.
빨강 <span style="color:#ff3b30;font-weight:900;">...</span> — 이 원고 전체에 최대 1개. 하지 말아야 할 행동에만.
`;
}

const FOCUS_NOTE = (v, keys) => {
  const k = FOCUS_CH[v.focus];
  return k && keys.includes(k) ? `\n🚨 손님이 가장 궁금한 것은 '${v.focus}'다. ${k} 를 적힌 최소 분량의 1.5배로, 가장 구체적으로 써라.\n` : '';
};

function buildPromptA(v) {
  const P = v.P, Y = v.D.year;
  return promptHead(v) + FOCUS_NOTE(v, SPEC_A.map(s => s.key)) + `
[이 원고의 범위]
이 원고는 리포트의 앞부분이다. 7~8장·열두 달·꼭 기억할 날·세 가지 힌트는 다른 원고가 따로 쓴다. 그 내용을 미리 당겨 쓰지 마라.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON 만]
{
  "headline": "(22자 이내) ${Y}년을 한 문장으로. 뾰족하게. 덕담 금지. 좋은 예: '사람이 돈이 되는 해, 단 7월은 쉬어 갈 것' / '판을 접고 새로 까는 해'",
  "keyword_1": "(6자 이내) 올해의 키워드",
  "keyword_2": "(6자 이내)",
  "keyword_3": "(6자 이내)",
  "ch1_overview": "(최소 1600자) [1장 · 한눈에 보는 ${Y}년] 메인테마와 올해를 이끄는 별, 목성·토성이 지나는 생활 영역을 엮어 한 해의 큰 줄기를. 가장 좋은 달과 숨 고를 달을 이 장에서 먼저 예고하라. 상반기·하반기로 나눠 흐름을 그려라.",
  "ch2_theme": "(최소 1400자) [2장 · 나의 ${Y}년 메인테마] 올해가 인생의 어느 영역이 주인공인 해인지, 그게 일상에서 어떤 장면으로 나타나는지, 올해를 이끄는 별이 출생차트 어디에 있어서 무엇을 끌고 오는지. 생일 전후로 메인테마가 바뀌면 그 날짜와 달라지는 점을 분명히.",
  "ch3_jupiter": "(최소 1800자) [3장 · ${Y}년 나에게 오는 세 가지 행운] 목성이 지나는 생활 영역과 날짜, 목성이 내 행성에 순풍으로 닿는 날, 가장 좋은 달을 근거로 행운 세 가지를 뽑아라.\\n     【첫 번째 행운 — (문장)】【두 번째 행운 — (문장)】【세 번째 행운 — (문장)】 세 소제목으로. 각 행운마다 언제 오는지(데이터의 날짜·달), 어떤 모습으로 오는지, 그 행운을 잡으려면 무엇을 해야 하는지를 600자 이상씩.",
  "ch4_saturn": "(최소 1800자) [4장 · ${Y}년 미리 알면 약이 되는 세 가지] 토성이 지나는 생활 영역, 역풍으로 닿는 날, 숨 고를 달, 역행 구간을 근거로 세 가지를 뽑아라.\\n     【첫 번째 — (문장)】【두 번째 — (문장)】【세 번째 — (문장)】 세 소제목으로. 각각 언제인지, 무엇을 조심하면 되는지, 그렇게 했을 때 무엇이 남는지를 600자 이상씩.\\n     🚨 겁주지 마라. '이걸 알고 넘기면 내년에 단단해진다'는 톤으로. '고비', '시련', '불운' 같은 말은 쓰지 마라.",
  "ch5_love": "(최소 1700자) [5장 · 애정운] 위 연애 상태에 맞춰. 애정이 가장 좋은 달과 숨 고를 달을 데이터에서 짚고, 그때 할 행동까지.",
  "ch6_money": "(최소 1500자) [6장 · 금전운] 돈이 들어오는 길과 새는 구멍. 금전이 가장 좋은 달. 지갑을 열어도 되는 때와 닫아야 할 때. 투자 권유 금지.",
  "closing": "(최소 500자) 맺음말. ${P.name}님에게 건네는 말. 올해의 핵심을 한 번 더 못 박아라. 새해 인사처럼 따뜻하게 끝내라. 마지막 한 문장은 <blockquote> 태그로.${P.timeUnknown ? ' 끝에서 두 번째 문장으로 \\"태어난 시간을 알면 올해의 흐름을 더 정확히 나눌 수 있습니다\\" 정도를 담백하게 한 번만.' : ''}",
  "teaser": "(3문장) 이 리포트는 ${Y}년 한 해의 흐름이다. 그 흐름을 받아내는 그릇 — 타고난 기질과 평생의 패턴 — 은 출생차트 전체에 있다는 점을 짚어라. 이번에 드러난 배치 하나를 지목하고 질문으로 끝내라. 가격·강매 금지."
}`;
}

function buildPromptB(v) {
  const Y = v.D.year;
  const mk = m => `  "month_${m}": "(최소 350자) ${m}월"`;
  return promptHead(v) + FOCUS_NOTE(v, SPEC_B.map(s => s.key)) + `
[이 원고의 범위]
이 원고는 리포트의 뒷부분이다. 한 해 총평·메인테마·세 가지 행운·미리 알면 약이 되는 세 가지·애정운·금전운은 다른 원고가 따로 쓴다. 그 내용을 되풀이하지 마라.

[열두 달 공통 규칙]
· 위 월별 흐름의 그 달 접촉과 강한·약한 영역만 근거로 쓴다.
· 첫 문장은 그 달을 한 줄로 정의하는 짧은 단정문. 예: "3월은 씨를 뿌리는 달입니다."
· 그 달에 할 것 하나, 피할 것 하나를 문장 안에서 분명하게. 좋은 날이 있으면 날짜까지.
· 열두 달의 첫 문장이 서로 겹치지 않게.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON 만]
{
  "ch7_work": "(최소 1500자) [7장 · 일과 성취${v.focus === '공부·시험' ? ' · 공부와 시험' : ''}] 성과가 나는 시점과 무리하면 안 되는 시점. 이직·승진·창업${v.focus === '공부·시험' ? '·시험' : ''} 타이밍을 데이터의 달·날짜로.",
  "ch8_body": "(최소 1200자) [8장 · 컨디션과 마음] 체력과 집중의 리듬. 가장 먼저 지치는 지점과 그때 할 회복 습관. 의학적 표현 금지.",
${[1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(mk).join(',\n')},
  "ch9_keydates": "(최소 1200자) [${Y}년 꼭 기억할 날] 일식·월식(특히 내 행성 위에 떨어지는 것)과 큰 행성이 정확히 닿는 날, 역행 구간을 날짜 그대로 인용. 각 날에 할 것을 행동으로. 다이어리에 옮겨 적고 싶게.",
  "ch10_action": "(최소 1000자) [${Y}년의 세 가지 힌트] 올해를 잘 보내는 열쇠 세 가지를 【첫 번째 힌트 — (문장)】【두 번째 힌트 — (문장)】【세 번째 힌트 — (문장)】로. 각각 다이어리에 적어둘 수 있는 구체적인 행동으로."
}`;
}

/* ── 검증 ─────────────────────────────────────────────────── */
const BANNED = /undefined|\bnull\b|NaN|다이제스트|확정값|프로펙션|흐름 점수|상대 점수|솔라 차트로 계산/i;
const HEDGE = /(수 있습니다|수 있어요|수도 있습니다|수 있고|수 있으며|여지가 있습니다)/g;
const HEDGE_LIMIT = 12;   /* 덩어리 하나당 */
const METAPHOR_OPEN = /^.{0,40}(마치|듯한|처럼 느껴지는)/;

const UNSAFE = [
  { why: '병·사고·죽음을 예고하는 문장이 있다. 컨디션은 체력과 집중의 리듬으로만 쓰고, 그런 문장은 전부 빼라.',
    re: /(병에 걸|질환이 (생|찾아|발병)|수술을 (받게|하게)|사고를 당|사고가 (납니다|나게)|사망|목숨|큰 병|암에 걸|쓰러지게 됩니다)/ },
  { why: '특정 투자를 권했다. 돈은 흐름과 태도로만 쓰고, 주식·코인·부동산을 사라는 문장은 전부 빼라.',
    re: /((주식|코인|비트코인|가상화폐|종목|부동산|아파트)[^.。!?\n]{0,15}(사세요|매수하세요|투자하세요|사두세요|들어가세요|베팅))/ },
  { why: '한 해를 저주하는 표현이 있다. "최악의 해", "불운한 해" 같은 말을 빼고 무엇을 조심하면 되는지로 다시 써라.',
    re: /(최악의 (해|한 해|1년)|불운한 (해|한 해)|아무것도 (되지 않|안 되)는 해|망하는 해|저주)/ }
];
const MARRIED_RE = /(새로운 (이성|연인|인연)|새 연애|소개팅|썸)/;

function validatePart(c, spec, P, ctx, isLast, part) {
  if (!c || typeof c !== 'object') return { msg: '응답이 객체가 아님' };
  const keys = (part === 'A' ? ['headline', 'teaser'] : []).concat(spec.map(s => s.key));

  /* 🚨 안전 검사가 맨 먼저 — 분량 반려보다 앞서야 위험한 원고가 차선 후보로 남지 않는다 */
  const all = keys.map(k => String(c[k] || '')).join(' ');
  for (const r of UNSAFE) if (r.re.test(all)) return { msg: r.why, unsafe: true };
  if (ctx.status === '기혼' && part === 'A' && MARRIED_RE.test(c.ch5_love || '')) {
    return { msg: '기혼 손님에게 새 연애·이성 인연을 암시했다. 부부 사이의 온도와 집안의 일로만 다시 써라.', unsafe: true };
  }
  for (const sp of spec) {
    const v = String(c[sp.key] || '').trim();
    if (!v) return { msg: '필수 항목 누락: ' + sp.key };
    let min = sp.min;
    if (ctx.focusKey === sp.key) min = Math.round(min * 1.3);
    const need = isLast ? Math.round(min * 0.7) : min;
    if (v.length < need) return { msg: `${sp.key} 분량 부족 (${v.length}자 / 최소 ${need}자)` };
  }
  if (part === 'A' && !String(c.headline || '').trim()) return { msg: '필수 항목 누락: headline' };
  const body = keys.filter(k => k !== 'teaser').map(k => String(c[k] || '')).join(' ');
  if (BANNED.test(body)) return { msg: '시스템 용어 노출 (' + (body.match(BANNED) || [''])[0] + ')' };
  if (!body.includes(P.name)) return { msg: P.name + ' 이름 누락' };

  if (!isLast) {
    for (const sp of spec) {
      if (sp.three && (String(c[sp.key]).match(/【/g) || []).length < 3) {
        return { msg: `${sp.key} 는 【】 소제목 세 개로 나눠야 한다 (지금 ${(String(c[sp.key]).match(/【/g) || []).length}개)` };
      }
    }
    if (part === 'A') {
      const cited = ctx.bestMonths.filter(m => String(c.ch1_overview || '').includes(m + '월')).length;
      if (cited < 2) return { msg: `1장에서 가장 좋은 달(${ctx.bestMonths.map(m => m + '월').join(', ')})을 짚지 않았다. 그대로 인용하라.` };
      if (/(고비|시련|불운)/.test(String(c.ch4_saturn || ''))) return { msg: "4장에 '고비·시련·불운'을 썼다. '미리 알면 약이 된다'는 준비의 말로 바꿔라." };
    }
    const hedges = (body.match(HEDGE) || []).length;
    if (hedges > HEDGE_LIMIT) return { msg: `발뺌 화법 과다 (${hedges}회 / 허용 ${HEDGE_LIMIT}회)` };
    for (const sp of spec) if (sp.min >= 600 && METAPHOR_OPEN.test(String(c[sp.key]))) return { msg: sp.key + ' 이 비유로 시작함' };
    if (/(우주의 기운|우주가 당신|파동|에너지가 흐)/.test(body)) return { msg: '유사영성 어휘 사용 (우주의 기운/파동/에너지가 흐르다)' };
    const ko = GR.koStyleIssue(body);
    if (ko) return { msg: ko };
  }
  return null;
}

function repairPart(c, ctx, part) {
  const rules = UNSAFE.slice();
  if (ctx.status === '기혼') rules.push({ re: MARRIED_RE });
  const keys = (part === 'A' ? ['headline', 'teaser'].concat(SPEC_A.map(s => s.key)) : SPEC_B.map(s => s.key));
  const out = JSON.parse(JSON.stringify(c));
  for (const k of keys) {
    if (typeof out[k] !== 'string') continue;
    const parts = out[k].split(/(?<=[.!?。])\s+|(?=<br>)/);
    out[k] = parts.filter(s => !rules.some(r => r.re.test(s))).join(' ').replace(/(<br>\s*){3,}/g, '<br><br>').trim();
  }
  return out;
}

/* 두 덩어리를 합친 전체 원고 검사 (테스트·관리용) */
function validate(c, P, ctx, isLast) {
  return validatePart(c, SPEC_A, P, ctx, isLast, 'A') || validatePart(c, SPEC_B, P, ctx, isLast, 'B');
}

/* ── 핸들러 ──────────────────────────────────────────────── */
async function otherProductOwns(orderId) {
  try {
    const hits = await Promise.all(OTHER_PRODUCT_KEYS.map(p => kv.get(p + orderId).catch(() => null)));
    if (hits.some(h => h && h.status !== 'failed' && !h.error)) return true;
    const ik = await kv.get('intake:' + orderId).catch(() => null);
    return !!(ik && ik.product && String(ik.product) !== NO);
  } catch (e) { return false; }
}

const handler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId ? String(req.query.orderId).slice(0, 60) : null;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    if (await enforceRateLimit(req, res, { bucket: 'newyear-get', limit: 120, windowSec: 60 })) return;
    try {
      const [saved, intake] = await Promise.all([
        kv.get(KEY_PREFIX + orderId),
        kv.get(INTAKE_PREFIX + orderId).catch(() => null)
      ]);
      if (saved && saved.status === 'completed') return res.status(200).json(saved);
      if (saved && saved.status === 'pending') return res.status(202).json({ status: 'pending', error: 'pending' });
      return res.status(404).json({ error: '저장된 리포트 없음', state: saved ? saved.status : 'none', canRegenerate: !!(intake && intake.me) });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });
  if (await enforceRateLimit(req, res, { bucket: 'newyear-post', limit: 10, windowSec: 60 })) return;

  const body = req.body || {};
  const orderId = body.orderId ? String(body.orderId).replace(/[^0-9A-Za-z-]/g, '').slice(0, 60) : null;
  let lockKey = null;

  async function fail(status, message, detail) {
    if (orderId) {
      const err = String(detail || message).slice(0, 400);
      try { await kv.set(KEY_PREFIX + orderId, { status: 'failed', error: err, at: Date.now() }, { ex: 60 * 30 }); } catch (e) {}
      /* 관리자 콘솔 '실패한 주문' 목록용 — 30일 보관 (위 표시는 30분이면 사라져 문의 올 때 못 찾는다) */
      try { await kv.set('failed:' + orderId, { product: NO, error: err, at: Date.now() }, { ex: 60 * 60 * 24 * 30 }); } catch (e) {}
      if (lockKey) { try { await kv.del(lockKey); } catch (e) {} }
    }
    return res.status(status).json({ error: message, detail: detail || undefined });
  }

  try {
    if (orderId) {
      const saved = await kv.get(KEY_PREFIX + orderId);
      if (saved && saved.status === 'completed') return res.status(200).json(saved);
      if (await otherProductOwns(orderId)) {
        return res.status(409).json({ error: '다른 상품의 주문번호입니다. 신년운세 주문번호로 다시 열어주세요.' });
      }
    }

    let src = body;
    if (!body.me && orderId) {
      const k = await kv.get(INTAKE_PREFIX + orderId).catch(() => null);
      if (k && k.me) { src = k; console.log('♻️ [신년] 서버 보관 입력값으로 재생성:', orderId); }
    }
    const P = normPerson(src.me);
    if (!P) return res.status(400).json({ error: '정보를 다시 확인해주세요. (이름·생년월일·태어난 시간)', needInput: true });
    const status = STATUSES.includes(src.status) ? src.status : '솔로';
    const focus = FOCUSES.includes(src.focus) ? src.focus : '전체';

    if (!process.env.GEMINI_API_KEY) return await fail(500, '서버 설정 오류(GEMINI)', 'GEMINI_API_KEY 없음');

    if (orderId) {
      try {
        await kv.set(INTAKE_PREFIX + orderId, { product: NO, me: P, status, focus, at: Date.now() }, { ex: YEAR_SEC });
      } catch (e) { console.log('⚠️ [신년] intake 저장 실패(생성은 계속):', e.message); }
      lockKey = LOCK_PREFIX + orderId;
      const got = await kv.set(lockKey, '1', { nx: true, ex: 300 });
      if (!got) return res.status(202).json({ status: 'pending', message: '리포트를 만들고 있습니다. 잠시만 기다려주세요.' });
      await kv.set(KEY_PREFIX + orderId, { status: 'pending', at: Date.now() }, { ex: 60 * 60 });
    }

    const N = await NA.fetchNatal(P);
    const todayYmd = GR.seoulToday();
    const [ty, tm, td] = todayYmd.split('-').map(Number);
    /* 솔라 리턴 · 진행 달 — 시각 미상이면 null. 실패해도 리포트는 나간다 */
    let fc = null;
    try {
      const tok = (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET)
        ? NA.getToken().catch(() => null) : null;
      fc = await FC.computeForecast(N, NY.targetYear(todayYmd), { token: tok });
    } catch (e) { console.warn('⚠️ [신년] 솔라 리턴·진행 달 계산 실패(리포트는 계속):', e.message); }
    const D = NY.buildNewYearDigest(N, P.name, { todayYmd, fc });
    console.log(`✅ [신년] ${D.year}년 계산 — 총운 ${D.meta.scores.total} / ${D.meta.profection.house}하우스의 해 / 좋은 달 ${D.meta.bestMonths.join(',')}`);

    const ctx = { status, focusKey: FOCUS_CH[focus] || null, bestMonths: D.meta.bestMonths };
    const todayStr = `${ty}년 ${tm}월 ${td}일`;
    const gem = { thinkingBudget: 4096, temperature: 0.88, timeoutMs: 120000 };
    const lenOf = keys => c => keys.reduce((n, k) => n + String(c[k] || '').length, 0);

    /* 앞·뒤 원고를 동시에 */
    const [runA, runB] = await Promise.all([
      GR.runWithBudget({
        tag: '[신년A ' + (orderId || '-') + ']',
        buildPrompt: correction => buildPromptA({ P, D, status, focus, correction, todayStr }),
        validate: (c, isLast) => validatePart(c, SPEC_A, P, ctx, isLast, 'A'),
        lengthOf: lenOf(SPEC_A.map(s => s.key)),
        repair: c => repairPart(c, ctx, 'A'),
        gemini: gem
      }),
      GR.runWithBudget({
        tag: '[신년B ' + (orderId || '-') + ']',
        buildPrompt: correction => buildPromptB({ P, D, status, focus, correction, todayStr }),
        validate: (c, isLast) => validatePart(c, SPEC_B, P, ctx, isLast, 'B'),
        lengthOf: lenOf(SPEC_B.map(s => s.key)),
        repair: c => repairPart(c, ctx, 'B'),
        gemini: gem
      })
    ]);
    if (!runA.data || !runB.data) {
      return await fail(500, '리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.',
        (!runA.data ? 'A: ' + runA.lastErr : '') + (!runB.data ? ' B: ' + runB.lastErr : ''));
    }
    const keepA = ['headline', 'keyword_1', 'keyword_2', 'keyword_3', 'teaser'].concat(SPEC_A.map(s => s.key));
    const keepB = SPEC_B.map(s => s.key);
    const report = {};
    keepA.forEach(k => { if (runA.data[k] !== undefined) report[k] = runA.data[k]; });
    keepB.forEach(k => { if (runB.data[k] !== undefined) report[k] = runB.data[k]; });
    const run = { data: report, usedFallback: runA.usedFallback || runB.usedFallback };

    const payload = {
      status: 'completed',
      generatedAt: Date.now(),
      version: 1,
      product: NO,
      meta: Object.assign({ name: P.name, status, focus, timeUnknown: P.timeUnknown, today: todayYmd,
                            degraded: run.usedFallback || undefined }, D.meta),
      report: run.data
    };

    if (orderId) {
      try {
        await kv.set(KEY_PREFIX + orderId, payload);
        await kv.del(lockKey);
        try { await kv.del('failed:' + orderId); } catch (e) {}
      } catch (e) { console.log('⚠️ [신년] KV 저장 실패(전송은 정상):', e.message); }
    }
    return res.status(200).json(payload);

  } catch (error) {
    console.error('🔥 gemini-newyear.js 에러:', error);
    return await fail(500, '잠시 문제가 있었습니다. 다시 시도해주세요.', error.message);
  }
};

module.exports = allowCors(handler);
module.exports._test = { buildPromptA, buildPromptB, validate, validatePart, repairPart, normPerson, SPEC, SPEC_A, SPEC_B, UNSAFE };
