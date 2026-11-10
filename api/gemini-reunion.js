// ============================================================================
//  api/gemini-reunion.js — 아스트라노트 재회운 리포트 (product_no=16 · 12,900원)
// ----------------------------------------------------------------------------
//  ★ 기존 상품 파일을 한 줄도 수정하지 않습니다.
//     추가: lib/astro-reunion.js · lib/natal.js · lib/gemini-run.js · 이 파일
//
//  구조는 api/gemini-child.js 와 같습니다 (시간 예산 · 호출 상한 · 차선 원고).
//   1) 판정·시기는 전부 코드가 계산 → AI 는 해석만 한다
//   2) 생성 락(SET NX EX)으로 더블클릭·새로고침 이중 호출 차단
//   3) 상태: pending → completed / failed
//   4) 출생정보는 생성 전에 서버에 먼저 보관 (reunion-intake:주문번호)
//      → 다른 기기·인앱 브라우저로 들어와도 다시 입력하지 않는다
//   5) 다른 상품의 주문번호로는 만들지 않는다 (1,900원 주문번호로 12,900원 리포트 방지)
//
//  ▣ 이 상품만의 안전 차단 — 마지막 시도에서도 통과시키지 않습니다
//
//   재회를 검색하는 사람은 가장 약한 상태에 있습니다.
//   그 상태에서 들은 한 문장이 몇 달의 행동을 바꿉니다.
//
//     · 상대의 속마음을 단정하는 문장   ("○○님은 아직 당신을 사랑합니다")
//     · 재회 확률을 숫자로 주는 문장    ("재회 가능성 73%")
//     · 조종 기술                       (밀당·질투 유발·일부러 무시)
//     · 제3자를 지어내는 문장           ("상대에게 새 사람이 생겼습니다")
//     · 미래 저주                       ("평생 혼자", "다시는 사랑 못 합니다")
//     · 차단당한 손님에게 우회 연락 권유 (부계정·지인 통해·찾아가기)
//
//   세 번 다 걸리면, 걸린 문장만 도려낸 판을 다시 검사해 통과할 때만 보냅니다.
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');
const RU = require('../lib/astro-reunion.js');
const NA = require('../lib/natal.js');
const GR = require('../lib/gemini-run.js');
const V = require('../lib/validate.js');
const cityCoordinates = require('../lib/cities.js');
const { allowCors } = require('../lib/cors.js');
const { enforceRateLimit } = require('../lib/security.js');

const NO = '16';
const KEY_PREFIX = 'reunion-report:';
const LOCK_PREFIX = 'reunion-lock:';
const INTAKE_PREFIX = 'reunion-intake:';
const YEAR_SEC = 60 * 60 * 24 * 365;

/* 다른 상품의 저장 키. 이 주문번호로 이미 다른 리포트가 있으면 재회운을 만들지 않는다. */
const OTHER_PRODUCT_KEYS = ['report:', 'vip-report:', 'monthly:', 'couple-report:', 'child-report:', 'newyear-report:'];

/* ── 입력 정규화 ───────────────────────────────────────────── */
function normPerson(p, fallbackName) {
  if (!p || typeof p !== 'object') return null;
  const name = V.cleanName(p.name, 20) || fallbackName;
  const time = String(p.time || '').trim();
  const timeUnknown = !!p.timeUnknown || time === '' || time === '모름';
  const date = V.normalizeDate(p.date);
  if (!name || !date) return null;
  const okTime = timeUnknown ? null : V.normalizeTime(time);
  if (!timeUnknown && !okTime) return null;
  return {
    name, date, time: okTime, timeUnknown,
    city: p.city && cityCoordinates[p.city] ? p.city : 'Seoul',
    gender: p.gender === '남성' ? '남성' : (p.gender === '여성' ? '여성' : '미상')
  };
}

/* ── 프롬프트 ─────────────────────────────────────────────── */
const CONTACT_GUIDE = {
  '완전히 끊김': '지금 연락이 완전히 끊겨 있다. 7장은 "먼저 연락한다면 언제, 어떤 말로"를 다루되, 연락하지 않는 선택도 똑같이 존중하라.',
  '가끔 연락': '지금도 가끔 연락이 오간다. 7장은 "이 연락을 관계로 다시 바꿀 때인가, 정리할 때인가"를 다뤄라.',
  '차단된 상태': '🚨 지금 연락이 차단된 상태다. 상대가 거리를 원한다는 뜻이다. 다른 계정·새 번호·지인을 통하거나 찾아가는 방법은 단 한 글자도 쓰지 마라. 7장은 "상대가 먼저 손을 내민다면 받아도 되는 때"와 "내가 정리하기 좋은 때"로 바꿔 써라.',
  '친구처럼 지냄': '지금 친구처럼 지내고 있다. 7장은 "선을 다시 넘어도 되는 때인가"를 다뤄라. 친구 관계까지 잃을 위험을 정직하게 짚어라.'
};
const INIT_GUIDE = {
  '내가': '손님이 먼저 끝냈다. 후회와 미안함이 섞여 있다. 죄책감을 키우지 말고, 그때 왜 그 선택을 했는지를 차트로 설명해 줘라.',
  '상대가': '상대가 먼저 끝냈다. 거절당한 아픔이 크다. 손님의 가치를 깎는 해석은 절대 금지. 끝난 이유를 "누가 부족해서"가 아니라 "구조가 어긋나서"로 써라.',
  '서로': '서로 합의해서 끝냈다. 둘 다 이유를 알고 있다. 그 이유가 지금도 유효한지를 중심으로 써라.',
  '애매함': '누가 끝냈는지 애매하다. 흐지부지 멀어진 관계다. "끝맺지 못한 것"이 미련의 큰 부분임을 짚어라.'
};

function buildPrompt(v) {
  const A = v.A, B = v.B, D = v.D;
  return `${v.correction ? `[🚨🚨🚨 직전 원고 반려 — 아래를 반드시 고쳐서 다시 써라]
${v.correction}
이 지적을 무시하면 또 반려된다. 나머지 규칙은 그대로 지키면서 이 부분만 확실히 고쳐라.

` : ''}[🚨🚨 최우선 절대 금지]
'undefined', 'null', 'NaN', '다이제스트', '확정 판정', '5요인', '합성 금성', '합성 태양' 같은 시스템 용어를 본문에 쓰지 마라.
🚨 마크다운 금지. **굵게**, # 제목 전부 금지. HTML 로 그대로 출력된다.

[🚨🚨🚨 제1원칙 — 다른 모든 규칙보다 위에 있다]
이 리포트를 읽는 ${A.name}님은 지금 가장 약한 상태에 있다. 여기 적힌 한 문장이 몇 달의 행동을 바꾼다.
1. ${B.name}님의 속마음을 단정하지 마라. 차트는 사람의 '기질'과 '시기'를 보여줄 뿐 지금 이 순간의 감정을 보여주지 않는다.
   ❌ ${B.name}님은 아직 ${A.name}님을 사랑하고 있습니다 / 그리워하고 있습니다 / 후회하고 있습니다
   ✅ ${B.name}님은 감정을 늦게 정리하는 기질입니다 / 지금 ${B.name}님이 통과하는 시기는 지난 관계를 다시 돌아보게 만드는 시기입니다
2. 재회 '확률'이나 '가능성'을 숫자로 말하지 마라. 아래 3장의 퍼센트는 확률이 아니라 '붙잡는 힘의 성분'이다. 반드시 그렇게 설명하라.
3. 상대를 움직이는 기술을 가르치지 마라. 밀당, 질투 유발, 일부러 늦게 답하기, 새 사람이 있는 척하기 — 전부 금지.
4. 있지도 않은 제3자를 지어내지 마라. "${B.name}님에게 새 사람이 생겼습니다" 같은 말은 차트에서 나올 수 없다.
5. 미래를 저주하지 마라. "평생 혼자", "다시는 사랑하지 못합니다" 금지.
6. 손님을 깎지 마라. 이 관계가 끝난 건 누가 부족해서가 아니라 두 기질이 어긋나서다.

[상황]
${A.name}님(${A.gender})이 ${B.name}님(${B.gender})과의 재회를 고민하고 있다.
헤어진 지: ${v.stage} / 끝낸 쪽: ${v.initiator} / 지금 연락 상태: ${v.contact}
${INIT_GUIDE[v.initiator] || INIT_GUIDE['애매함']}
${CONTACT_GUIDE[v.contact] || CONTACT_GUIDE['완전히 끊김']}

[이 상품의 정체 — 반드시 이 방향으로]
"다시 만날 수 있나요"에 답하는 리포트가 아니다. "내가 이 사람을 못 놓는 이유가 무엇인가"에 답하는 리포트다.
그 답을 알면 다시 두드리든 놓든, 손님은 처음으로 자기 이유로 결정할 수 있다.
그래서 이 리포트는 재회를 부추기지도, 말리지도 않는다. 정확하게 보여준다.

[역할]
너는 명리학을 오래 공부하다 서양 점성술로 넘어온 40년 경력의 상담가다. 이과 출신이라 근거 없는 말을 싫어한다.
재회 상담을 수천 건 해 봤고, 그래서 듣기 좋은 말이 사람을 얼마나 오래 붙잡아 두는지 안다.

[🚨 시간 기준]
오늘은 ${v.todayStr}이다. 시기는 아래 계산된 날짜만 쓴다. 지난 날짜를 미래로 쓰면 치명적 실패다.
오늘 날짜 자체는 본문에 쓰지 마라. 올해는 "올해 12월", 내년은 "내년 2월", 그 뒤는 "2028년 3월"처럼만.

${(A.timeUnknown || B.timeUnknown) ? `[태어난 시간을 모르는 사람이 있다]
아래 정보 한계에서 제외된 항목은 계산이 불가능하다. 추측해 채우지 말고 남은 배치로 확신 있게 써라.
closing 끝에 딱 한 번만 "태어난 시간을 알면 두 분의 하우스까지 볼 수 있습니다" 정도로 담백하게 안내하라.

` : ''}[정밀 계산된 데이터 — 트로피컬 · 홀사인]
${D.text}

위 좌표·각도·시기·비율은 전부 실제 천체 계산 결과다. 이 데이터만 인용하고 없는 것을 지어내지 마라.

[✍️ 문장 규칙]
· 첫 문장은 장면이나 단정으로 연다. 첫 문장에 '마치·~같은·~듯한·~처럼' 금지. 사물 비유(자석·실·끈·퍼즐) 전면 금지.
· 교과서 일반론 금지 ("금성은 사랑의 별입니다" 금지).
· 배치를 인용할 때 누구의 어떤 행성이 누구의 무엇과 어떤 각인지를 밝혀라. 각 장에 최소 하나.
· 근거는 쉬운 말로. "재인님의 금성과 민수님의 토성이 직각" 정도까지만 쓰고, '하우스'·'오브'·'어스펙트' 같은 전문 용어는 쓰지 마라.
  하우스가 꼭 필요하면 생활 영역으로 풀어라. "8하우스" ❌ → "깊이 얽히고 쉽게 못 끊는 자리" ✅
· 발뺌 금지("~일 수도 있어요", "아마"). 과잉 단정도 금지("반드시 돌아옵니다", "절대").
· 매 문장에서 누구 얘기인지 이름을 분명히 밝혀라. "그는", "그 사람"으로 뭉개지 마라.
· 짧은 문장과 긴 문장을 섞어라. 단락 길이도 들쭉날쭉하게. 단락 구분은 <br><br>.
· 연민 금지("얼마나 힘드셨어요"). 정확히 읽어주는 것이 위로다.
· 소제목이 필요하면 【】로 감싸고 반드시 문장으로.

${GR.KO_STYLE}
[강조]
금색 <b>...</b> — 손님이 캡처할 판정 문장에만. 한 장에 2~3개. 행성·별자리·숫자·날짜에는 치지 마라.
빨강 <span style="color:#ff3b30;font-weight:900;">...</span> — 리포트 전체에 최대 2개. 하면 안 되는 행동에만.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON 만]
{
  "headline": "(22자 이내) 이 관계를 한 문장으로. 대가나 역설이 드러나게. 덕담 금지. 좋은 예: '사랑보다 익숙함이 더 무거운 사이' / '끝낸 이유가 아직 유효한 사람' / '다시 만나면 같은 자리에서 멈추는 두 사람'",
  "keyword_1": "(6자 이내) 관계 키워드. 셋 중 하나는 불편한 진실",
  "keyword_2": "(6자 이내)",
  "keyword_3": "(6자 이내)",
  "ch1_title": "(16자 이내) 1장 제목",
  "ch1_ended": "(최소 1000자) [1장 · 이 관계는 왜 끝났는가] 위 갈등 축을 근거로. 누가 잘못했는지가 아니라 두 기질이 어디서 어긋났는지. 끝나는 장면이 들리도록 구체적으로.",
  "ch2_title": "(16자 이내)",
  "ch2_remains": "(최소 1000자) [2장 · 지금도 남아 있는 것] 남아 있는 끌림과 깊은 결속의 근거. 왜 시간이 지나도 생각나는지.",
  "ch3_title": "(16자 이내)",
  "ch3_love_or_inertia": "(최소 1600자) [3장 · 못 놓는 이유는 사랑인가 관성인가] ★이 상품의 심장\\n     위 확정 판정의 다섯 성분과 비율을 그대로 쓰고, 이것이 확률이 아니라 '이 관계가 사람을 붙잡는 힘의 성분'이라고 먼저 밝혀라.\\n     【정】【성장】【익숙함】【책임감】【집착】 다섯 소제목을 이 순서로. 각 성분이 이 두 사람에게 실제로 어떤 장면으로 나타나는지 근거와 함께.\\n     비율이 낮은 성분은 짧게, 높은 성분은 길게. 마지막에 판정 문장을 금색으로 한 번.\\n     노스노드 접촉은 '앞으로 가게 하는 인연', 사우스노드 접촉은 '이미 아는 것 같은, 뒤로 끌어당기는 인연'으로 풀어 써라. '노드'라는 단어는 한 번만 쉽게 설명하고 써라.",
  "ch4_title": "(16자 이내)",
  "ch4_repeat": "(최소 1000자) [4장 · 다시 만나면 반복될 것] 같은 각도는 다시 만나도 그대로 작동한다. 반복될 장면을 두 개 이상, 대사가 들릴 만큼 구체적으로. 가장 위험한 하나는 빨간 글씨로.",
  "ch5_title": "(16자 이내)",
  "ch5_changed": "(최소 1000자) [5장 · 다시 만나면 달라질 것] 위 '헤어질 무렵 하늘 vs 지금 하늘'만 근거로. 풀린 것·새로 생긴 것을 정직하게. 바뀐 게 없으면 그렇게 말하라.",
  "ch6_title": "(16자 이내)",
  "ch6_their_now": "(최소 800자) [6장 · ${B.name}님은 지금 어떤 시기를 지나고 있나] 속마음이 아니라 '시기의 성격'만. 첫 단락에서 '차트는 마음이 아니라 시기를 보여준다'는 한계를 한 문장으로 먼저 밝혀라.",
  "ch7_title": "(16자 이내)",
  "ch7_timing": "(최소 1300자) [7장 · ${v.contact === '차단된 상태' ? '마음을 정리하기 좋은 때, 다시 손을 잡아도 되는 때' : '연락한다면 언제'}] ★\\n     위 확정 시기만 그대로 인용. '가장 좋은 문'을 먼저, 그다음 '옛 감정이 되살아나는 때', 마지막에 '조심할 때'.\\n     각 시기마다 그때 할 것과 하지 말 것을 행동 단위로.${v.contact === '차단된 상태' ? ' 🚨 연락을 시도하라는 말은 쓰지 마라. 차단은 상대의 선택이다.' : '\\n     마지막에 【보낸다면 이렇게】 — 실제로 보낼 수 있는 첫 메시지 예시 2개를 따옴표로. 부담을 주지 않고, 답을 강요하지 않는 문장으로.'}",
  "ch8_title": "(16자 이내)",
  "ch8_letgo": "(최소 1200자) [8장 · 놓아야 한다면, 그 근거] ★ 반드시 쓴다. 위 확정 근거를 그대로 인용. 근거가 없다고 나왔으면 【이런 일이 다시 생기면 그때는 놓으세요】 판단 기준 3가지를 행동 단위로 줘라.\\n     재회를 원하는 손님에게도 이 장이 있어야 이 리포트를 믿는다.",
  "ch9_title": "(16자 이내)",
  "ch9_verdict": "(최소 1000자) [9장 · 결론] 위 확정 결론 방향을 첫 단락에서 그대로 밝혀라. 뒤집지 마라.\\n     '무엇이 지켜지면 무엇이 가능한가'의 조건부로. 어느 쪽이든 ${A.name}님이 자기 이유로 결정할 수 있게. 마지막 문장은 ${A.name}님에 대한 것으로.",
  "closing": "(최소 300자) 맺음말. ${A.name}님에게 건네는 말. 감상에 빠지지 말고 이 리포트의 핵심을 한 번 더 못 박아라. 마지막 한 문장은 <blockquote> 태그로.",
  "teaser": "(3문장) 이 리포트는 '두 사람 사이'만 본 것이다. ${A.name}님이 관계에서 반복하는 패턴의 뿌리는 ${A.name}님 개인 차트에 있다는 점을 짚어라. 이번에 드러난 배치 하나를 지목하고 질문으로 끝내라. 가격·강매 금지."
}`;
}

/* ── 검증 ─────────────────────────────────────────────────── */
const SPEC = [
  { key: 'ch1_ended', min: 1000 },
  { key: 'ch2_remains', min: 1000 },
  { key: 'ch3_love_or_inertia', min: 1600 },
  { key: 'ch4_repeat', min: 1000 },
  { key: 'ch5_changed', min: 1000 },
  { key: 'ch6_their_now', min: 800 },
  { key: 'ch7_timing', min: 1300 },
  { key: 'ch8_letgo', min: 1200 },
  { key: 'ch9_verdict', min: 1000 },
  { key: 'closing', min: 300 }
];
const TITLE_KEYS = ['ch1_title', 'ch2_title', 'ch3_title', 'ch4_title', 'ch5_title', 'ch6_title', 'ch7_title', 'ch8_title', 'ch9_title'];
const TEXT_KEYS = ['headline'].concat(SPEC.map(s => s.key));

const BANNED = /undefined|\bnull\b|NaN|다이제스트|확정 판정|5요인|합성 금성|합성 태양|합성 달|정보 완전도/i;
const HEDGE = /(수 있습니다|수 있어요|수도 있습니다|수 있고|수 있으며|여지가 있습니다)/g;
const HEDGE_LIMIT = 12;
const METAPHOR_OPEN = /^.{0,40}(마치|같은 관계|듯한|처럼 느껴지는)/;

const esc = s => String(s).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

/* 안전 위반 — 문장 단위로 찾는다 (repair 가 같은 패턴으로 도려낸다) */
function unsafeRules(A, B, contact) {
  const b = esc(B.name);
  const rules = [
    { why: `${B.name}님의 속마음을 단정했다. 차트는 감정이 아니라 기질과 시기를 보여준다. "${B.name}님은 감정을 늦게 정리하는 기질입니다"처럼 기질로만 다시 써라.`,
      re: new RegExp(b + '(님)?(은|는|이|가|도)\\s*[^.。!?\\n]{0,30}(사랑하고 있습니다|그리워하고 있습니다|후회하고 있습니다|기다리고 있습니다|잊지 못하고 있습니다|마음이 남아 있습니다|돌아오고 싶어 합니다|돌아오고 싶어합니다|연락을 기다립니다|미련이 남아 있습니다)') },
    { why: '재회 확률·가능성을 숫자로 말했다. 확률은 계산할 수 없다. 숫자를 빼고, 3장의 비율은 "붙잡는 힘의 성분"이라고만 설명하라.',
      re: /((재회|다시 만날)\s*(확률|가능성)[^.。!?\n]{0,14}\d{1,3}\s*(%|퍼센트))|(\d{1,3}\s*(%|퍼센트)[^.。!?\n]{0,8}(재회|다시 만날)\s*(확률|가능성))/ },
    { why: '상대를 움직이는 조종 기술을 권했다. 밀당·질투 유발·일부러 무시하기 같은 방법을 전부 빼라.',
      re: /(밀당을\s*(하|해|시도)|질투(를|심을)?\s*(유발|자극|느끼게)|일부러\s*[^.。!?\n]{0,10}(늦게 답|무시|답하지|읽고 답|연락하지 않)|애태우게\s*(하|만드)|새\s*(사람|애인|연인)이 있는 척|(SNS|인스타)[^.。!?\n]{0,15}(염탐|보여주기용))/ },
    { why: `있지도 않은 제3자를 지어냈다. ${B.name}님에게 새 사람이 생겼다는 말은 차트에서 나올 수 없다. 전부 빼라.`,
      re: new RegExp(b + '(님)?(은|는|이|가|에게|께)\\s*[^.。!?\\n]{0,20}(새로운 사람|다른 사람|새 연인|새 애인)[^.。!?\\n]{0,10}(생겼|만나고 있|있습니다)') },
    { why: '미래를 저주하는 문장이 있다. "평생 혼자", "다시는 사랑하지 못합니다" 같은 말을 전부 빼라.',
      re: /(평생\s*(혼자|외롭|불행)|다시는\s*[^.。!?\n]{0,8}(사랑하지 못|행복하지 못|만나지 못)|절대\s*행복할 수 없|불행해집니다)/ }
  ];
  if (contact === '차단된 상태') {
    rules.push({ why: '차단된 상태인데 우회 연락을 권했다. 다른 계정·새 번호·지인을 통하거나 찾아가는 방법은 상대의 선택을 무시하는 것이다. 전부 빼라.',
      re: /(다른 계정|부계정|새 번호|다른 번호|번호를 바꿔|(친구|지인)를?\s*통해|찾아가(세요|보세요|십시오|는 것)|집 앞|회사 앞)/ });
  }
  return rules;
}

function validate(c, A, B, ctx, isLast) {
  if (!c || typeof c !== 'object') return { msg: '응답이 객체가 아님' };

  /* 🚨 안전 검사를 맨 먼저 한다 — 마지막 시도에서도 통과시키지 않는다.
     (분량 검사가 먼저면, 짧으면서 위험한 원고가 '분량 부족'으로만 반려되어
      차선 원고 후보로 남는다. 실제로 테스트에서 그렇게 새어 나갔다.) */
  const all = TEXT_KEYS.concat(['teaser']).map(k => String(c[k] || '')).join(' ');
  for (const r of unsafeRules(A, B, ctx.contact)) {
    if (r.re.test(all)) return { msg: r.why, unsafe: true };
  }
  for (const sp of SPEC) {
    const v = String(c[sp.key] || '').trim();
    if (!v) return { msg: '필수 항목 누락: ' + sp.key };
    const need = isLast ? Math.round(sp.min * 0.7) : sp.min;
    if (v.length < need) return { msg: `${sp.key} 분량 부족 (${v.length}자 / 최소 ${need}자)` };
  }
  if (!String(c.headline || '').trim()) return { msg: '필수 항목 누락: headline' };
  for (const k of TITLE_KEYS) if (!String(c[k] || '').trim()) return { msg: '필수 항목 누락: ' + k };

  const body = TEXT_KEYS.map(k => String(c[k] || '')).join(' ');
  if (BANNED.test(body)) return { msg: '시스템 용어 노출 (' + (body.match(BANNED) || [''])[0] + ')' };
  if (!body.includes(A.name)) return { msg: A.name + ' 이름 누락' };
  if (!body.includes(B.name)) return { msg: B.name + ' 이름 누락' };

  /* 3장이 확정 비율을 실제로 인용했는가 — 이 상품의 심장이라 품질 검사지만 엄격히 본다 */
  const ch3 = String(c.ch3_love_or_inertia);
  const cited = ['정', '성장', '익숙함', '책임감', '집착']
    .filter(k => new RegExp('(^|[^0-9])' + ctx.share[k] + '\\s*(%|퍼센트)').test(ch3)).length;
  if (!isLast && cited < 3) return { msg: `3장에 확정 비율이 빠졌다 (${cited}/5개 인용). 정 ${ctx.share['정']}% · 성장 ${ctx.share['성장']}% · 익숙함 ${ctx.share['익숙함']}% · 책임감 ${ctx.share['책임감']}% · 집착 ${ctx.share['집착']}% 를 그대로 쓰라.` };

  if (!isLast) {
    const hedges = (body.match(HEDGE) || []).length;
    if (hedges > HEDGE_LIMIT) return { msg: `발뺌 화법 과다 (${hedges}회 / 허용 ${HEDGE_LIMIT}회)` };
    for (const sp of SPEC) if (METAPHOR_OPEN.test(String(c[sp.key]))) return { msg: sp.key + ' 이 비유로 시작함' };
    if (/(자석처럼|붉은 실|운명의 실|퍼즐 조각|반쪽)/.test(body)) return { msg: '상투적 비유 사용 (자석/붉은 실/퍼즐/반쪽)' };
    const ko = GR.koStyleIssue(body);
    if (ko) return { msg: ko };
  }
  return null;
}

/* 안전 위반 문장만 도려낸다 — runWithBudget 의 최후 수단 */
function repair(c, A, B, contact) {
  const rules = unsafeRules(A, B, contact);
  const out = JSON.parse(JSON.stringify(c));
  for (const k of TEXT_KEYS.concat(['teaser'])) {
    if (typeof out[k] !== 'string') continue;
    /* 문장 경계: 마침표·물음표·느낌표 + 공백, 또는 <br> */
    const parts = out[k].split(/(?<=[.!?。])\s+|(?=<br>)/);
    out[k] = parts.filter(s => !rules.some(r => r.re.test(s))).join(' ').replace(/(<br>\s*){3,}/g, '<br><br>').trim();
  }
  return out;
}

/* ── 핸들러 ──────────────────────────────────────────────── */
async function otherProductOwns(orderId) {
  try {
    const hits = await Promise.all(OTHER_PRODUCT_KEYS.map(p => kv.get(p + orderId).catch(() => null)));
    if (hits.some(h => h && h.status !== 'failed' && !h.error)) return true;
    const ik = await kv.get('intake:' + orderId).catch(() => null);   // 배우자(9) 입력값
    return !!(ik && ik.product && String(ik.product) !== NO);
  } catch (e) { return false; }   // KV 장애 시엔 손님을 막지 않는다
}

const handler = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');

  /* ── 다시보기 ── */
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId ? String(req.query.orderId).slice(0, 60) : null;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    if (await enforceRateLimit(req, res, { bucket: 'reunion-get', limit: 120, windowSec: 60 })) return;
    try {
      const [saved, intake] = await Promise.all([
        kv.get(KEY_PREFIX + orderId),
        kv.get(INTAKE_PREFIX + orderId).catch(() => null)
      ]);
      if (saved && saved.status === 'completed') return res.status(200).json(saved);
      if (saved && saved.status === 'pending') return res.status(202).json({ status: 'pending', error: 'pending' });
      /* 출생정보 자체는 절대 내보내지 않는다(주문번호는 연번이라 훑을 수 있다). 있다는 사실만. */
      return res.status(404).json({ error: '저장된 리포트 없음', state: saved ? saved.status : 'none', canRegenerate: !!(intake && intake.me) });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });
  if (await enforceRateLimit(req, res, { bucket: 'reunion-post', limit: 10, windowSec: 60 })) return;

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
    /* ── 1. 완성본이 있으면 그대로 (새로고침마다 새로 쓰면 내용이 바뀌고 비용이 나간다) ── */
    if (orderId) {
      const saved = await kv.get(KEY_PREFIX + orderId);
      if (saved && saved.status === 'completed') return res.status(200).json(saved);
      if (await otherProductOwns(orderId)) {
        return res.status(409).json({ error: '다른 상품의 주문번호입니다. 재회운 주문번호로 다시 열어주세요.' });
      }
    }

    /* ── 2. 입력값: 요청 → 없으면 서버 보관본 ── */
    let src = body;
    if ((!body.me || !body.ex) && orderId) {
      const k = await kv.get(INTAKE_PREFIX + orderId).catch(() => null);
      if (k && k.me && k.ex) { src = k; console.log('♻️ [재회] 서버 보관 입력값으로 재생성:', orderId); }
    }
    const A = normPerson(src.me, '나');
    const B = normPerson(src.ex, '그 사람');
    if (!A || !src.me) return res.status(400).json({ error: '내 정보를 다시 확인해주세요. (생년월일·태어난 시간)', needInput: true });
    if (!B || !src.ex) return res.status(400).json({ error: '상대 정보를 다시 확인해주세요. (생년월일·태어난 시간)', needInput: true });
    if (A.name === B.name) B.name = B.name + '(상대)';
    const stage = RU.STAGES.includes(src.stage) ? src.stage : '3개월';
    const initiator = RU.INITIATORS.includes(src.initiator) ? src.initiator : '애매함';
    const contact = RU.CONTACTS.includes(src.contact) ? src.contact : '완전히 끊김';

    if (!process.env.GEMINI_API_KEY) return await fail(500, '서버 설정 오류(GEMINI)', 'GEMINI_API_KEY 없음');

    /* ── 3. 입력값을 먼저 서버에 보관 + 생성 락 ── */
    if (orderId) {
      try {
        await kv.set(INTAKE_PREFIX + orderId, {
          product: NO, me: A, ex: B, stage, initiator, contact, at: Date.now()
        }, { ex: YEAR_SEC });
      } catch (e) { console.log('⚠️ [재회] intake 저장 실패(생성은 계속):', e.message); }

      lockKey = LOCK_PREFIX + orderId;
      const got = await kv.set(lockKey, '1', { nx: true, ex: 300 });
      if (!got) return res.status(202).json({ status: 'pending', message: '리포트를 만들고 있습니다. 잠시만 기다려주세요.' });
      await kv.set(KEY_PREFIX + orderId, { status: 'pending', at: Date.now() }, { ex: 60 * 60 });
    }

    /* ── 4. 두 사람 차트 (토큰 1회) ── */
    let token = null;
    if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
      token = NA.getToken().catch(e => { console.warn('⚠️ Prokerala 토큰 실패 → 자체 계산:', e.message); return null; });
    }
    const [nA, nB] = await Promise.all([NA.fetchNatal(A, { token }), NA.fetchNatal(B, { token })]);

    /* ── 5. 재회 전용 계산 ── */
    const todayYmd = GR.seoulToday();
    const [ty, tm, td] = todayYmd.split('-').map(Number);
    const D = RU.buildReunionDigest(nA, nB, A.name, B.name, { todayYmd, stage });
    console.log(`✅ [재회] 계산 — 사랑 ${D.ff.love}% / 관성 ${D.ff.inertia}% / 방향 ${D.direction.dir}(${D.direction.s}) / 문 ${D.win.open.length}개 / 근거 ${D.letgo.length}개`);

    /* ── 6. 원고 ── */
    const ctx = { contact, share: D.ff.share };
    const run = await GR.runWithBudget({
      tag: '[재회 ' + (orderId || '-') + ']',
      buildPrompt: correction => buildPrompt({
        A, B, D, stage, initiator, contact, correction,
        todayStr: `${ty}년 ${tm}월 ${td}일`
      }),
      validate: (c, isLast) => validate(c, A, B, ctx, isLast),
      lengthOf: c => TEXT_KEYS.reduce((n, k) => n + String(c[k] || '').length, 0),
      repair: c => repair(c, A, B, contact),
      /* 원고가 1만 자가 넘는다. 한 번 호출 상한을 120초로 늘리고, 생각 예산을 줄여 쓰는 시간을 확보한다 */
      gemini: { thinkingBudget: 4096, temperature: 0.9, timeoutMs: 120000 }
    });
    if (!run.data) return await fail(500, '리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', run.lastErr);

    /* ── 7. 계산값은 코드값으로 (AI 가 바꿀 수 없게) ── */
    const win = D.win;
    const pickW = w => ({ kind: w.kind, label: w.label, start: w.start, end: w.end, peak: w.peak || null, when: w.when, why: w.why });
    const payload = {
      status: 'completed',
      generatedAt: Date.now(),
      version: 1,
      product: NO,
      meta: {
        nameA: A.name, nameB: B.name, stage, initiator, contact,
        share: D.ff.share, love: D.ff.love, inertia: D.ff.inertia,
        direction: D.direction.dir,
        best: win.best ? pickW(win.best) : null,
        windows: win.all.map(pickW),
        letgo: D.letgo.slice(0, 5).map(x => ({ kind: x.kind, meaning: x.meaning })),
        timeUnknown: A.timeUnknown || B.timeUnknown,
        today: todayYmd,
        degraded: run.usedFallback || undefined
      },
      report: run.data
    };

    if (orderId) {
      try {
        await kv.set(KEY_PREFIX + orderId, payload);   /* 완성본은 만료 없이 영구 보관 (전 상품 봉인 정책) */
        await kv.del(lockKey);
        try { await kv.del('failed:' + orderId); } catch (e) {}
      } catch (e) { console.log('⚠️ [재회] KV 저장 실패(전송은 정상):', e.message); }
    }
    return res.status(200).json(payload);

  } catch (error) {
    console.error('🔥 gemini-reunion.js 에러:', error);
    return await fail(500, '잠시 문제가 있었습니다. 다시 시도해주세요.', error.message);
  }
};

module.exports = allowCors(handler);
module.exports._test = { buildPrompt, validate, repair, unsafeRules, normPerson, SPEC };
