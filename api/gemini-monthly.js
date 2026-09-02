// ============================================================================
//  api/gemini-monthly.js — 오늘부터 30일 운세 (product_no=14)
// ----------------------------------------------------------------------------
//  ▣ 왜 다시 썼나
//    상세페이지에 "8월치·9월치를 미리 찍어둔 운세가 아닙니다. 오늘 하늘의
//    실제 위치를 당신의 차트에 겹쳐 계산합니다"라고 약속해 두었는데,
//    기존 코드는 2026~2031년 월별 트랜짓 표(매월 15일 기준)를 쓰고 있었습니다.
//    약속과 코드가 달랐습니다. 이제 하루 단위로 실제 계산합니다.
//
//  ▣ 프론트와 응답 모양이 안 맞아 생긴 증상들
//    · 애정·금전·일·컨디션이 전부 "—"      ← label_* / score_* 를 안 줬음
//    · 곡선 그래프가 빈칸                  ← meta.flow 를 안 줬음
//    · 움직일 날에 7월 24일이 두 번         ← goodDays 를 서버가 안 만들었음
//    · 한 날짜가 움직일 날·조심할 날 양쪽에  ← 같은 이유
//    이제 서버가 전부 계산해 내려주고, 중복·모순은 lib/transit.js 에서
//    구조적으로 불가능합니다(극대점과 극소점은 겹칠 수 없고 Set 으로 중복 차단).
//
//  ▣ 프론트가 두 버전 있어서 상위집합으로 내려줍니다
//    report{} 안에도 넣고, 최상위에도 같은 키를 복사해 둡니다.
//    어느 쪽 프론트가 살아 있어도 화면이 채워집니다.
//
//  ▣ Prokerala 호출은 1회입니다 (출생차트만).
//    31일치 행성 위치는 lib/ephemeris.js 로 자체 계산합니다.
//    표로 부르면 크레딧이 31배가 되고, 트랜짓 판정은 오브(3~6도) 안에
//    드는지를 보는 일이라 분(arcmin) 정확도면 충분합니다.
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');
const cityCoordinates = require('../lib/cities.js');
const { buildBirthIso } = require('../lib/time.js');
const CH = require('../lib/chart.js');
const TR = require('../lib/transit.js');

/* 🚨 Gemini 과부하(503·429) 대기 — 2026-08-02 상향
   ----------------------------------------------------------------------------
   [무슨 일이 있었나]
   실제 손님 요청에서 Gemini 가 3번 연속 503 을 뱉었다.

       1차 503 (1.44초) → 1.5초 대기
       2차 503 (0.30초) → 3초 대기
       3차 503 (0.37초) → 포기

   11초 만에 손을 들고 손님에게 500 을 던졌다.

   [왜 짧으면 안 되나]
   503 은 구글 쪽 일시 과부하다. 보통 수십 초 지속된다.
   몇 초 만에 다시 두드리면 같은 거절만 받는다.
   게다가 503 은 즉시 거절이라 호출 자체가 1초도 안 걸린다.
   즉 대기 시간이 곧 회복 기회의 전부다.

   [조치] 20초 → 45초 (총 65초 확보)
   최악의 경우(503 두 번 + 3차 정상 생성)에도 약 185초로
   함수 제한 300초 안에 들어온다. */
const RETRY_WAIT_MS = [20000, 45000, 0];   // 1·2차 실패 후 대기. 3차는 마지막이라 0.


/* 🚨 CORS 는 lib/cors.js 화이트리스트 정본 하나만 씁니다.
   예전의 '*' 는 아무 사이트나 우리 Gemini 크레딧을 태울 수 있게 했습니다. */
const { allowCors } = require('../lib/cors.js');
const { normalizeDate, normalizeTime, cleanName } = require('../lib/validate.js');

const KEY = oid => 'monthly:' + oid;
const TTL = 60 * 60 * 24 * 365;     // v2: 60일 → 365일. 전 상품 통일.
                                    // 운세 내용은 그 달 것이지만, 손님이 나중에 다시 꺼내 보는 것은 막을 이유가 없다.

/* ── 출생차트 요약 (AI 가 읽을 재료) ───────────────────────── */
function natalDigest(natal, ascLon) {
  const L = [];
  L.push('[출생차트 — 트로피컬 · 홀사인 하우스]');
  for (const k of ['상승점', '태양', '달', '수성', '금성', '화성', '목성', '토성', '천정']) {
    if (natal[k] === undefined) continue;
    const d = CH.dms(natal[k]);
    const h = CH.wholeSignHouse(natal[k], ascLon);
    L.push('· ' + k + ': ' + d.sign + ' ' + d.text + ' / ' + h + '하우스(' + CH.HOUSE_MEANING[h] + ')');
  }
  return L.join('\n');
}

/* ── 프롬프트 ─────────────────────────────────────────────── */
function buildPrompt(v) {
  return `
[🚨 절대 금지]
'undefined', 'null', 'NaN', '트랜짓 항목', '데이터에 없음' 같은 시스템 용어를 본문에 쓰지 마라. 손님은 일반인이다.
아래 [실제 계산된 날짜]에 없는 날짜를 지어내면 치명적 실패다. 날짜는 반드시 준 것만 써라.

너는 명리학을 이십 년 공부한 뒤 서양 점성술로 옮겨온 상담가다. 이과 출신이라 근거 없는 말을 싫어한다.
${v.name}님이 1,900원을 내고 "오늘부터 30일"을 물어보러 왔다. 짧지만 정확해야 한다.

[기간] ${v.periodStart} ~ ${v.periodEnd}  (오늘은 ${v.todayStr})

${v.natal}

[🔭 실제 계산된 일별 트랜짓 — 이 리포트의 유일한 근거]
${v.transitDigest}

[📅 실제 계산된 날짜 — 이 날짜만 쓸 것]
움직여야 할 날: ${v.goodDays.length ? v.goodDays.join(', ') : '뚜렷한 정점 없음 (특정일보다 꾸준함이 통하는 30일)'}
조심할 날: ${v.careDays.length ? v.careDays.join(', ') : '뚜렷하게 조심할 날 없음'}

[📊 계산된 점수 — 본문 톤을 여기에 맞춰라]
총평 ${v.scores.total} / 애정 ${v.scores.love} / 금전 ${v.scores.money} / 일·성취 ${v.scores.work} / 컨디션 ${v.scores.body}
점수가 높은 영역은 자신 있게 밀어주고, 낮은 영역은 겁주지 말고 "무엇을 조심하면 되는지"로 써라.

[작성 규칙]
1. 위 트랜짓을 최소 3개 본문에 녹여라. 인용할 때는 쉬운 말로. 예: "이번 달 화성이 당신의 일상을 담당하는 6하우스를 지나며"
2. 별자리 일반론('사자자리는 열정적') 절대 금지. 이 사람의 이 30일에만 해당하는 이야기를 써라.
3. 발뺌 화법 금지: '~일 수 있습니다', '~한 느낌도 있습니다', '아마' 금지. '~한 편입니다', '~합니다'로 부드럽게 단정하라.
4. 유사영성 어휘 금지: 우주가 당신에게, 에너지, 파동, 기운이 흐르다.
5. 하나마나한 덕담 금지: 긍정적으로 생각하세요, 시간이 해결해줍니다.
6. 각 단락에 15자 이내의 짧은 단정문을 하나씩 넣어라. 길이가 균일하면 기계가 쓴 것처럼 읽힌다.
7. 마크다운(*) 금지. 단락 구분은 <br><br>.
[강조 표시 — 여기가 리포트의 인상을 결정한다]
강조는 두 가지만 쓴다.
  금색 형광펜 : <b>...</b>
  빨간 경고   : <span style="color:#ff3b30;font-weight:900;">...</span>

■ 금색은 <b>손님에 대한 판정</b>에만 친다. 한 카드에 2~3개.
   손님이 캡처해서 친구에게 보낼 만한 문장, 다시 읽고 싶은 문장에만 친다.
   예) 금성이 전갈자리에 있습니다. <b>좋아하면 다 주는 사람입니다.</b>

■ 빨강은 <b>경고</b>에만 친다. 한 카드에 최대 1개.
   하면 안 되는 것, 피해야 할 사람, 놓치면 되돌리기 어려운 것.

■ 절대 강조하지 않는 것 : 행성 이름, 별자리 이름, 하우스 번호, 각도 수치, 날짜.
   그건 정보지 판정이 아니다. 명사에 색을 칠하면 정작 중요한 문장이 묻힌다.
   ❌ <b>금성</b>이 <b>전갈자리</b>에 있어서
   ✅ 금성이 전갈자리에 있습니다. <b>좋아하면 다 주는 사람입니다.</b>

■ 개수를 넘기지 마라. 많이 칠수록 아무것도 안 보인다.
   한 문단에 두 개 이상 치지 마라.

8. 순수 JSON 객체만 출력. 앞뒤에 아무것도 붙이지 마라.

[출력 JSON]
{
  "headline": "(35자 이내) 이 30일을 관통하는 한 줄. 구체적이고 강렬하게. 예: '지갑은 닫고, 사람은 여는 30일'",
  "keyword_1": "(2~5자) 이 30일의 키워드",
  "keyword_2": "(2~5자)",
  "keyword_3": "(2~5자)",
  "label_love":  "(8자 이내) 애정 영역을 한마디로. 예: '먼저 연락할 때'",
  "label_money": "(8자 이내) 금전 영역을 한마디로. 예: '지출 점검기'",
  "label_work":  "(8자 이내) 일·성취를 한마디로. 예: '성과 나오는 달'",
  "label_body":  "(8자 이내) 컨디션을 한마디로. 예: '수면부터 챙기기'",
  "card1_overview": "(400자 이상) 이 30일 전체 흐름. 어디서 시작해 어디로 가는지. 위 트랜짓 중 가장 강한 것 하나를 근거로 밝히고, 곡선이 올라가는 구간과 내려가는 구간을 함께 짚어라.",
  "card2_love":  "(300자 이상) 애정운. 솔로와 커플 모두에게 해당하도록. 관계가 움직이는 시기를 위 날짜 안에서 짚어라.",
  "card3_money": "(300자 이상) 금전운. 수입·지출·기회를 구체적 장면으로. 무엇을 조심하고 무엇을 밀어붙일지.",
  "card4_work":  "(300자 이상) 일과 성취. 성과가 나는 시점과 무리하면 안 되는 시점을 나눠서.",
  "card5_body":  "(250자 이상) 컨디션과 마음. 의학적 진단이 아니라 '체력과 집중의 리듬' 관점으로만. 무리하면 가장 먼저 무너지는 지점을 짚어라.",
  "card6_gooddays": "(250자 이상) 움직여야 할 날. 위에 준 날짜를 그대로 인용하고, 각 날짜에 무엇을 하면 좋은지 행동 단위로 써라. 날짜가 없다고 나왔으면 그 사실을 정직하게 말하고 '이번 30일은 특정일을 노리기보다 꾸준함이 통한다'는 방향으로 안내하라.",
  "card7_caredays": "(250자 이상) 조심할 날. 위에 준 날짜만 인용하라. 겁주지 말고 '이 날은 이것만 피하면 된다'로 구체적으로. 날짜가 없다고 나왔으면 정직하게 그렇게 말하라.",
  "card8_action": "(300자 이상) 이 30일의 행동 지침. 오늘 당장 적어둘 수 있는 수준으로 3가지. 추상적인 다짐이 아니라 행동으로.",
  "card9_teaser": "(120자 내외) 이번 30일 흐름은 여기까지. 타고난 차트 자체가 궁금해지도록 자연스럽게 이어지는 문장. 강매하지 마라."
}
`;
}

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function extractJson(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  try { return JSON.parse(raw); }
  catch (err) { try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; } }
}

const NEED = ['headline', 'card1_overview', 'card2_love', 'card3_money', 'card4_work',
              'card5_body', 'card6_gooddays', 'card7_caredays', 'card8_action'];

async function callGemini(prompt) {
  let lastErr = '';
  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const r = await fetch(GEMINI_URL + '?key=' + process.env.GEMINI_API_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 32768, temperature: 0.9,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: 4096 }
          }
        })
      });
      if (!r.ok) {
        lastErr = 'Gemini ' + r.status + ': ' + (await r.text()).slice(0, 200);
        console.error('🔥 [시도 ' + attempt + '] ' + lastErr);
        if (r.status === 503 || r.status === 429) {
          const w = RETRY_WAIT_MS[attempt - 1] || 0;
          if (w) { console.warn('⏳ Gemini ' + r.status + ' — ' + (w / 1000) + '초 대기 후 재시도'); await new Promise(s => setTimeout(s, w)); }
        }
        continue;
      }
      const j = await r.json();
      const cand = j.candidates && j.candidates[0];
      if (cand && cand.finishReason && cand.finishReason !== 'STOP') {
        console.warn('⚠️ finishReason=' + cand.finishReason);
      }
      const txt = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
      const parsed = extractJson(txt);
      if (!parsed) { lastErr = 'JSON 파싱 실패'; console.error('🔥 [시도 ' + attempt + '] ' + lastErr); continue; }
      const miss = NEED.filter(k => !parsed[k] || String(parsed[k]).trim().length < 40);
      if (miss.length && attempt < 3) {
        lastErr = '필수 필드 부족: ' + miss.join(', ');
        console.warn('⚠️ [시도 ' + attempt + '] 재생성 — ' + lastErr);
        continue;
      }
      console.log('✅ Gemini 통과 (' + attempt + '회)');
      return { ok: true, data: parsed };
    } catch (e) {
      lastErr = e.message;
      console.error('🔥 [시도 ' + attempt + '] ' + e.message);
    }
  }
  return { ok: false, error: lastErr };
}

/* ── 응답 조립 (프론트 두 버전 모두 만족하는 상위집합) ───────── */
function buildPayload(v, ai) {
  const report = {
    headline: ai.headline || (v.periodStart + ' ~ ' + v.periodEnd),
    keyword_1: ai.keyword_1 || '', keyword_2: ai.keyword_2 || '', keyword_3: ai.keyword_3 || '',
    label_love: ai.label_love || '', label_money: ai.label_money || '',
    label_work: ai.label_work || '', label_body: ai.label_body || '',
    score_total: v.scores.total, score_love: v.scores.love,
    score_money: v.scores.money, score_work: v.scores.work, score_body: v.scores.body,
    card1_overview: ai.card1_overview || '', card2_love: ai.card2_love || '',
    card3_money: ai.card3_money || '', card4_work: ai.card4_work || '',
    card5_body: ai.card5_body || '', card6_gooddays: ai.card6_gooddays || '',
    card7_caredays: ai.card7_caredays || '', card8_action: ai.card8_action || '',
    card9_teaser: ai.card9_teaser || ''
  };
  const meta = {
    periodStart: v.periodStart, periodEnd: v.periodEnd,
    goodDays: v.goodDays, careDays: v.careDays,
    flow: v.flow, scores: v.scores
  };
  /* 구버전 프론트 대비로 최상위에도 복사해 둡니다 */
  return Object.assign({
    status: 'completed',
    baseDate: v.baseDate,
    customer_name: v.name,
    generated_at: Date.now(),
    report: report,
    meta: meta
  }, report, meta);
}

/* ── 핸들러 ──────────────────────────────────────────────── */
const handler = async (req, res) => {
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(KEY(orderId));
      res.setHeader('Cache-Control', 'no-store');
      if (!saved) return res.status(404).json({ error: '저장된 리포트 없음' });
      /* 기간이 지난 저장본은 다시 만들게 합니다. "오늘부터 30일"이니까요. */
      const today = new Date(); today.setHours(0, 0, 0, 0);
      if (saved.baseDate && new Date(saved.baseDate) < today) {
        return res.status(404).json({ error: '기간이 지나 다시 계산해야 합니다', stale: true });
      }
      return res.status(200).json(saved);
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });
  console.log('✅ [1] gemini-monthly 진입');

  try {
    const b = req.body || {};
    let { name, date, city, myGender } = b;
    let time = b.time;
    const timeUnknown = !!b.timeUnknown || !time || String(time).trim() === '';
    if (timeUnknown) time = '12:00';
    if (!name || !date) return res.status(400).json({ error: '이름과 생년월일은 필수입니다.' });

    /* 🚨 2026-08-21 — 달력에 없는 날짜(1990-02-31 등)가 조용히 통과해
       엉뚱한 날짜의 차트가 나가던 구멍. lib/validate.js 를 연결한다. */
    const vDate = normalizeDate(date);
    if (!vDate) return res.status(400).json({ error: '생년월일을 다시 확인해 주세요. 달력에 없는 날짜입니다.' });
    date = vDate;
    if (!timeUnknown) {
      const vTime = normalizeTime(time);
      if (!vTime) return res.status(400).json({ error: '태어난 시각을 다시 확인해 주세요. (예: 14:30)' });
      time = vTime;
    }
    name = cleanName(name, 20);
    if (!name) return res.status(400).json({ error: '이름을 다시 입력해 주세요.' });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: '서버 설정 오류(GEMINI)' });

    let loc = cityCoordinates[city];
    const cityResolved = !!loc;
    if (!loc) { console.error('⚠️ 출생지 좌표 없음: "' + city + '" → 서울 대체'); loc = cityCoordinates['Seoul']; }
    const iso = buildBirthIso(date, time, city);

    /* ── 출생차트 (Prokerala 1회) ── */
    let natal = null;
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
        const tk = await fetch('https://api.prokerala.com/token', {
          method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials',
            client_id: process.env.PROKERALA_CLIENT_ID, client_secret: process.env.PROKERALA_CLIENT_SECRET })
        });
        if (tk.ok) {
          const td = await tk.json();
          const ar = await fetch('https://api.prokerala.com/v2/astrology/planet-position?datetime=' +
            encodeURIComponent(iso) + '&coordinates=' + loc.lat + ',' + loc.lon + '&ayanamsa=1',
            { headers: { Authorization: 'Bearer ' + td.access_token } });
          if (ar.ok) {
            const aj = await ar.json();
            const r = CH.natalFromProkerala(aj.data, iso, loc);
            if (r && r.lon && r.lon['태양'] !== undefined) natal = r.lon;
          } else console.log('⚠️ Prokerala planet-position ' + ar.status);
        }
      }
    } catch (e) { console.log('⚠️ Prokerala 실패:', e.message); }

    if (!natal) return res.status(500).json({ error: '출생차트를 계산하지 못했습니다. 잠시 후 다시 시도해주세요.' });

    const ascLon = natal['상승점'];
    console.log('✅ [2] 출생차트 완료 — 상승점 ' + CH.dms(ascLon).sign + ' ' + CH.dms(ascLon).text);

    /* ── 31일치 트랜짓 실계산 ── */
    const tzOffset = iso.slice(-6);
    const T = TR.analyze({ natal: natal, ascLon: ascLon, days: 31, tzOffset: '+09:00' });
    void tzOffset;
    console.log('✅ [3] 트랜짓 계산 — ' + T.periodStart + '~' + T.periodEnd +
      ' / 움직일날 ' + T.goodDays.length + '개 / 조심할날 ' + T.careDays.length + '개' +
      ' / 총평 ' + T.scores.total);

    const now = new Date();
    const v = {
      name: name, myGender: myGender,
      baseDate: T.baseDate, periodStart: T.periodStart, periodEnd: T.periodEnd,
      goodDays: T.goodDays, careDays: T.careDays, flow: T.flow, scores: T.scores,
      natal: natalDigest(natal, ascLon), transitDigest: T.digest,
      timeUnknown: timeUnknown, cityResolved: cityResolved,
      todayStr: now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일'
    };

    const g = await callGemini(buildPrompt(v));
    if (!g.ok) {
      console.error('🔥 Gemini 실패:', g.error);
      return res.status(500).json({ error: '리포트 생성에 실패했습니다. 잠시 후 다시 시도해주세요.', detail: g.error });
    }

    const payload = buildPayload(v, g.data);
    payload.time_unknown = timeUnknown;

    console.log('✅ [4] 완료 — 카드 길이: ' +
      ['card1_overview','card2_love','card3_money','card4_work','card5_body','card6_gooddays','card7_caredays','card8_action']
        .map(k => (payload.report[k] || '').length).join('/'));

    if (b.orderId) {
      try { await kv.set(KEY(b.orderId), payload, { ex: TTL });
        console.log('💾 KV 저장(60일): ' + KEY(b.orderId));
      } catch (e) { console.log('⚠️ KV 저장 실패:', e.message); }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(payload);
  } catch (error) {
    console.error('🔥 gemini-monthly 에러:', error);
    return res.status(500).json({ error: '[서버 에러] ' + error.message });
  }
};

module.exports = allowCors(handler);
