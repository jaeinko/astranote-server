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

function buildPrompt(v) {
  const P = v.P, D = v.D, Y = D.year;
  const focusKey = FOCUS_CH[v.focus];
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

[역할]
너는 명리학을 오래 공부하다 서양 점성술로 넘어온 상담가다. 이과 출신이라 근거 없는 말을 싫어한다.
${P.name}님이 14,900원을 내고 ${Y}년 한 해를 물어보러 왔다. 띠별 운세와 달라야 한다 — 이 사람의 차트에만 해당하는 이야기를 써라.

[손님]
${P.name}님 (${P.gender}). 연애 상태: ${v.status}. 올해 가장 궁금한 것: ${v.focus}.
${STATUS_GUIDE[v.status] || STATUS_GUIDE['솔로']}
${focusKey ? `🚨 손님이 가장 궁금한 것은 '${v.focus}'다. 해당 장을 다른 장보다 1.5배 길고 구체적으로 써라.` : ''}

[🚨 시간 기준]
오늘은 ${v.todayStr}이다. 이 리포트는 ${Y}년 1월~12월을 본다.
${passed > 0 ? `🚨 ${Y}년 1월~${passed}월은 이미 지났다. 그 달들은 과거형으로 "이 무렵 ~한 일이 있지 않으셨나요"처럼 짚어라. 손님이 "맞다"고 느끼는 순간 앞으로의 달이 믿음이 된다. 단, 구체적 사건을 지어내지 말고 '그 달의 성격'만 짚어라.` : '모든 달은 아직 오지 않았다. 미래형으로 써라.'}
날짜는 아래 계산된 것만 쓴다. 오늘 날짜 자체는 본문에 쓰지 마라.

${P.timeUnknown ? `[태어난 시간을 모른다]
하우스는 태양 별자리를 1하우스로 두는 방식(솔라 차트)으로 계산했다. 그 사실을 본문에 반복하지 말고, closing 끝에 딱 한 번만
"태어난 시간을 알면 올해의 방을 더 정확히 나눌 수 있습니다" 정도로 담백하게 안내하라.

` : ''}[정밀 계산된 데이터]
${D.text}

위 날짜·하우스·점수는 전부 실제 천체 계산 결과다. 이 데이터만 인용하고 없는 것을 지어내지 마라.

[✍️ 문장 규칙]
· 첫 문장은 장면이나 단정으로. 첫 문장에 '마치·~같은·~듯한·~처럼' 금지.
· 별자리 일반론 금지 ("사자자리는 열정적" 금지). 유사영성 어휘 금지 (우주의 기운, 파동, 에너지가 흐르다).
· 행성이 내 몇 하우스를 지나는지를 쉬운 말로 풀어라. 예: "목성이 연애와 즐거움의 방(5하우스)을 지납니다"
· 발뺌 금지("~일 수도 있어요", "아마"). 과잉 단정도 금지("반드시", "100%").
· 각 장에 15자 이내 짧은 단정문을 하나씩. 문장·단락 길이를 섞어라. 단락 구분은 <br><br>.
· 각 장마다 <b>올해 실제로 할 행동</b>을 최소 하나. "긍정적으로 생각하세요"는 행동이 아니다.
· 소제목이 필요하면 【】로 감싸고 반드시 문장으로.

[강조]
금색 <b>...</b> — 손님이 캡처할 판정 문장에만. 한 장에 2~3개. 행성·별자리·숫자·날짜에는 치지 마라.
빨강 <span style="color:#ff3b30;font-weight:900;">...</span> — 리포트 전체에 최대 2개. 하지 말아야 할 행동에만.

[출력 형식 — 아래 JSON 키를 정확히 그대로, 순수 JSON 만]
{
  "headline": "(22자 이내) ${Y}년을 한 문장으로. 뾰족하게. 덕담 금지. 좋은 예: '사람이 돈이 되는 해, 단 7월은 쉬어 갈 것' / '판을 접고 새로 까는 해'",
  "keyword_1": "(6자 이내) 올해의 키워드",
  "keyword_2": "(6자 이내)",
  "keyword_3": "(6자 이내)",
  "ch1_overview": "(최소 1100자) [1장 · ${Y}년 총론] 올해의 무대(몇 번째 방의 해인지)와 주인 행성, 목성·토성의 방을 엮어 한 해의 큰 줄기를. 가장 좋은 달과 숨 고를 달을 이 장에서 먼저 예고하라.",
  "ch2_theme": "(최소 900자) [2장 · 올해 내 인생의 무대] 올해가 몇 번째 방의 해인지, 그 방이 무엇을 뜻하는지, 올해의 주인 행성이 출생차트 어디에 있어서 무엇을 끌고 오는지. 생일 전후로 무대가 바뀌면 그 시점을 분명히.",
  "ch3_jupiter": "(최소 900자) [3장 · 복이 들어오는 방] 목성이 지나는 방과 들어오고 나가는 날짜. 그 방에서 무엇을 늘리면 되는지 행동으로.",
  "ch4_saturn": "(최소 900자) [4장 · 올해의 시험] 토성이 지나는 방. 겁주지 말고 '무엇을 단단히 하면 내년에 남는지'로. 토성이 역행하는 구간이 있으면 그때 다시 점검할 것을 짚어라.",
  "ch5_love": "(최소 1000자) [5장 · 애정운] 위 연애 상태에 맞춰. 애정이 가장 좋은 달과 조심할 달을 데이터에서 짚어라.",
  "ch6_money": "(최소 900자) [6장 · 금전운] 돈이 들어오는 흐름과 새는 구멍. 금전이 가장 좋은 달. 투자 권유 금지.",
  "ch7_work": "(최소 900자) [7장 · 일과 성취${v.focus === '공부·시험' ? ' · 공부와 시험' : ''}] 성과가 나는 시점과 무리하면 안 되는 시점. 이직·승진·창업${v.focus === '공부·시험' ? '·시험' : ''} 타이밍을 데이터로.",
  "ch8_body": "(최소 700자) [8장 · 컨디션과 마음] 체력과 집중의 리듬. 가장 먼저 무너지는 지점. 의학적 표현 금지.",
  "month_1": "(최소 140자) 1월. 위 월별 흐름의 그 달 접촉을 근거로, 그 달에 할 것 하나와 피할 것 하나까지.",
  "month_2": "(최소 140자) 2월",
  "month_3": "(최소 140자) 3월",
  "month_4": "(최소 140자) 4월",
  "month_5": "(최소 140자) 5월",
  "month_6": "(최소 140자) 6월",
  "month_7": "(최소 140자) 7월",
  "month_8": "(최소 140자) 8월",
  "month_9": "(최소 140자) 9월",
  "month_10": "(최소 140자) 10월",
  "month_11": "(최소 140자) 11월",
  "month_12": "(최소 140자) 12월",
  "ch9_keydates": "(최소 800자) [꼭 기억할 날] 일식·월식(특히 내 행성 위에 떨어지는 것)과 큰 행성이 정확히 닿는 날, 역행 구간을 날짜 그대로 인용. 각 날에 할 것을 행동으로.",
  "ch10_action": "(최소 600자) [${Y}년 실천 지침] 올해 반드시 할 것 3가지를 【】 소제목으로. 다이어리에 적어둘 수 있는 수준의 행동으로.",
  "closing": "(최소 300자) 맺음말. ${P.name}님에게 건네는 말. 올해의 핵심을 한 번 더 못 박아라. 마지막 한 문장은 <blockquote> 태그로.",
  "teaser": "(3문장) 이 리포트는 ${Y}년 한 해의 흐름이다. 그 흐름을 받아내는 그릇 — 타고난 기질과 평생의 패턴 — 은 출생차트 전체에 있다는 점을 짚어라. 이번에 드러난 배치 하나를 지목하고 질문으로 끝내라. 가격·강매 금지."
}`;
}

/* ── 검증 ─────────────────────────────────────────────────── */
const SPEC = [
  { key: 'ch1_overview', min: 1100 }, { key: 'ch2_theme', min: 900 }, { key: 'ch3_jupiter', min: 900 },
  { key: 'ch4_saturn', min: 900 }, { key: 'ch5_love', min: 1000 }, { key: 'ch6_money', min: 900 },
  { key: 'ch7_work', min: 900 }, { key: 'ch8_body', min: 700 },
  { key: 'ch9_keydates', min: 800 }, { key: 'ch10_action', min: 600 }, { key: 'closing', min: 300 }
].concat([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12].map(m => ({ key: 'month_' + m, min: 140 })));
const TEXT_KEYS = ['headline'].concat(SPEC.map(s => s.key));

const BANNED = /undefined|\bnull\b|NaN|다이제스트|확정값|프로펙션|흐름 점수|상대 점수|솔라 차트로 계산/i;
const HEDGE = /(수 있습니다|수 있어요|수도 있습니다|수 있고|수 있으며|여지가 있습니다)/g;
const HEDGE_LIMIT = 14;
const METAPHOR_OPEN = /^.{0,40}(마치|듯한|처럼 느껴지는)/;

const UNSAFE = [
  { why: '병·사고·죽음을 예고하는 문장이 있다. 컨디션은 체력과 집중의 리듬으로만 쓰고, 그런 문장은 전부 빼라.',
    re: /(병에 걸|질환이 (생|찾아|발병)|수술을 (받게|하게)|사고를 당|사고가 (납니다|나게)|사망|목숨|큰 병|암에 걸|쓰러지게 됩니다)/ },
  { why: '특정 투자를 권했다. 돈은 흐름과 태도로만 쓰고, 주식·코인·부동산을 사라는 문장은 전부 빼라.',
    re: /((주식|코인|비트코인|가상화폐|종목|부동산|아파트)[^.。!?\n]{0,15}(사세요|매수하세요|투자하세요|사두세요|들어가세요|베팅))/ },
  { why: '한 해를 저주하는 표현이 있다. "최악의 해", "불운한 해" 같은 말을 빼고 무엇을 조심하면 되는지로 다시 써라.',
    re: /(최악의 (해|한 해|1년)|불운한 (해|한 해)|아무것도 (되지 않|안 되)는 해|망하는 해|저주)/ }
];

function validate(c, P, ctx, isLast) {
  if (!c || typeof c !== 'object') return { msg: '응답이 객체가 아님' };

  /* 🚨 안전 검사가 맨 먼저 — 분량 반려보다 앞서야 위험한 원고가 차선 후보로 남지 않는다 */
  const all = TEXT_KEYS.concat(['teaser']).map(k => String(c[k] || '')).join(' ');
  for (const r of UNSAFE) if (r.re.test(all)) return { msg: r.why, unsafe: true };
  if (ctx.status === '기혼' && /(새로운 (이성|연인|인연)|새 연애|소개팅|썸)/.test(c.ch5_love || '')) {
    return { msg: '기혼 손님에게 새 연애·이성 인연을 암시했다. 부부 사이의 온도와 집안의 일로만 다시 써라.', unsafe: true };
  }
  for (const sp of SPEC) {
    const v = String(c[sp.key] || '').trim();
    if (!v) return { msg: '필수 항목 누락: ' + sp.key };
    let min = sp.min;
    if (ctx.focusKey === sp.key) min = Math.round(min * 1.3);
    const need = isLast ? Math.round(min * 0.7) : min;
    if (v.length < need) return { msg: `${sp.key} 분량 부족 (${v.length}자 / 최소 ${need}자)` };
  }
  if (!String(c.headline || '').trim()) return { msg: '필수 항목 누락: headline' };
  const body = TEXT_KEYS.map(k => String(c[k] || '')).join(' ');
  if (BANNED.test(body)) return { msg: '시스템 용어 노출 (' + (body.match(BANNED) || [''])[0] + ')' };
  if (!body.includes(P.name)) return { msg: P.name + ' 이름 누락' };


  if (!isLast) {
    /* 가장 좋은 달이 실제로 인용됐는가 */
    const cited = ctx.bestMonths.filter(m => body.includes(m + '월')).length;
    if (cited < 2) return { msg: `가장 좋은 달(${ctx.bestMonths.map(m => m + '월').join(', ')})을 본문에서 짚지 않았다. 1장과 해당 영역 장에서 그대로 인용하라.` };
    const hedges = (body.match(HEDGE) || []).length;
    if (hedges > HEDGE_LIMIT) return { msg: `발뺌 화법 과다 (${hedges}회 / 허용 ${HEDGE_LIMIT}회)` };
    for (const sp of SPEC) if (sp.min >= 600 && METAPHOR_OPEN.test(String(c[sp.key]))) return { msg: sp.key + ' 이 비유로 시작함' };
    if (/(우주의 기운|우주가 당신|파동|에너지가 흐)/.test(body)) return { msg: '유사영성 어휘 사용 (우주의 기운/파동/에너지가 흐르다)' };
  }
  return null;
}

function repair(c, ctx) {
  const rules = UNSAFE.slice();
  if (ctx.status === '기혼') rules.push({ re: /(새로운 (이성|연인|인연)|새 연애|소개팅|썸)/ });
  const out = JSON.parse(JSON.stringify(c));
  for (const k of TEXT_KEYS.concat(['teaser'])) {
    if (typeof out[k] !== 'string') continue;
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
    const D = NY.buildNewYearDigest(N, P.name, { todayYmd });
    console.log(`✅ [신년] ${D.year}년 계산 — 총운 ${D.meta.scores.total} / ${D.meta.profection.house}하우스의 해 / 좋은 달 ${D.meta.bestMonths.join(',')}`);

    const ctx = { status, focusKey: FOCUS_CH[focus] || null, bestMonths: D.meta.bestMonths };
    const run = await GR.runWithBudget({
      tag: '[신년 ' + (orderId || '-') + ']',
      buildPrompt: correction => buildPrompt({
        P, D, status, focus, correction, todayStr: `${ty}년 ${tm}월 ${td}일`
      }),
      validate: (c, isLast) => validate(c, P, ctx, isLast),
      lengthOf: c => TEXT_KEYS.reduce((n, k) => n + String(c[k] || '').length, 0),
      repair: c => repair(c, ctx),
      gemini: { thinkingBudget: 5120, temperature: 0.88 }
    });
    if (!run.data) return await fail(500, '리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', run.lastErr);

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
module.exports._test = { buildPrompt, validate, repair, normPerson, SPEC, UNSAFE };
