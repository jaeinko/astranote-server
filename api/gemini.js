// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출로 패키지 버전 문제 원천 차단
//
// ════════════════════════════════════════════════════════════════════════════
//   v4 (2026-09-15) — v3 에서 추가로 고친 것
// ────────────────────────────────────────────────────────────────────────────
//   [치명] 손님 나이가 프롬프트에 없었다. 모델은 이름과 성별만 안다.
//          → 22세에게 "수없이 반복돼 왔습니다", 54세에게 "2033년에 만납니다"가 나간다.
//          차트에는 생년월일이 안 들어간다. 행성 위치만 들어간다. → ageLine 추가.
//   [치명] card5 에 "총 3개의 시기를 뽑는것이다"가 들어가 있었다.
//          findJupiterTransitWindows 는 '최대' 3개다. 1개뿐이거나 0개인 사람도 있다.
//          숫자 명령이 "지어내지 마라"보다 강해서 없는 연도 두 개가 나간다.
//          → 개수 지시를 없애고 목록에 맡긴다. 1개면 오히려 강조하도록 프레임 전환.
//   [치명] card3 이 [👤 배우자 외모] 블록을 무조건 참조했다. lib/appearance.js 가
//          없으면 없는 블록을 보며 900자를 써야 해서 3회 재생성 + 품질 최악.
//          → 블록 유무에 따라 card3 지시 자체가 갈리게 한다(card3Spec).
//   [버그] card6 이 "두 사람의 궁합"을 요구했다. 배우자는 차트가 없다. 7하우스는
//          손님 차트의 일부지 별개 사람이 아니다. 두 차트 사이 각도가 존재하지 않아
//          "각도를 인용하라"를 지킬 방법이 없었다. → 7하우스 지배성과 태양·달·금성의
//          각도로 근거 교체. 분량이 두 배가 됐는데 게이트는 400 그대로여서 같이 상향.
//   [운영] 최악의 경로가 300초를 넘길 수 있었다(3회 생성 × 110초 + 503 대기).
//          → 시간 예산 감시 + 게이트 탈락 원고 보관(lastGood).
//          손님에게 '조금 아쉬운 리포트'와 '결제하고 500' 은 비교 대상이 아니다.
//   [운영] 시각 미상 안내가 프롬프트에 없었다. 상승점이 근사치인데 "사진 보듯
//          단정하라"를 시키고 있었다. → timeUnknownLine 추가.
//   [품질] 팩폭을 카드마다 요구했다 = 6개. card3·4·5·6 은 배우자 이야기인데
//          거기서 팩폭을 만들려면 손님을 끌어와 찔러야 한다. 배우자 외모를 읽다가
//          "당신은 늘 외모만 봤습니다"가 튀어나온다. → card2 2개 + card7 1개로 집중.
//   [품질] 과거 트랜짓 스캔이 만 18세 이전까지 훑었다. 19세 손님에게
//          "2019년 무렵 관계가 정리됐습니다"는 그냥 틀린 말이다. → 나이로 범위 제한.
//
//   v3 (2026-09-14) 에서 고친 것 (기록 유지)
//   [치명] card3 이 존재하지 않는 [👤 배우자 외모] 블록을 참조 → lib/appearance.js 연결
//   [치명] 프롬프트 본문과 출력 JSON 의 card3 지시가 정면 충돌 → 한쪽으로 통일
//   [치명] timeUnknown 손님이 400 으로 튕김 → 정오 기본값
//   [치명] PAIR_MEANING 의 천왕성·해왕성·명왕성은 PLANET_KR 에 없어 영원히 안 잡히는
//          죽은 코드였는데 프롬프트 팩폭 예시에 들어 있었다 → 제거
//   [버그] 프롬프트 JSON 의 card3 뒤 쉼표 누락
//   [버그] 목성 테이블이 2026-08 부터라 이미 지난 달이 미래 시기로 나감 → 클리핑
//   [개선] 재생성 시 실패 사유를 모델에게 돌려줌(couple.js 의 correction 장치)
//   [개선] POST 레이트리밋. 돈이 나가는 쪽은 GET 이 아니라 POST 다
//   [개선] 과거 목성 트랜짓 스캔 — 지난 일을 먼저 맞혀야 미래가 믿긴다
// ════════════════════════════════════════════════════════════════════════════

const { kv } = require('@vercel/kv');

/* 🚨 Gemini 과부하(503·429) 대기 — 2026-08-02 상향 */
const RETRY_WAIT_MS = [20000, 45000, 0];   // 1·2차 실패 후 대기. 3차는 마지막이라 0.

/* 🚨 시간 예산 (210초) */
const TIME_BUDGET_MS = 210000;

/* 🚨 CORS 및 보안 라이브러리 */
const { allowCors } = require('../lib/cors.js');
const { normalizeDate, normalizeTime, cleanName } = require('../lib/validate.js');
const { enforceRateLimit } = require('../lib/security.js');

// ── 공용 모듈 ──────────────────────────────────────────────────────────
const cityCoordinates = require('../lib/cities.js');
const { cityTimezones, buildBirthIso } = require('../lib/time.js');
const CH = require('../lib/chart.js');
const EPH = require('../lib/ephemeris.js');

/* 🚨 외모 재료 생성기 모듈 불러오기 */
let buildAppearanceSignature = null;
try {
  buildAppearanceSignature = require('../lib/appearance.js').buildAppearanceSignature;
} catch (e) {
  console.warn('⚠️ lib/appearance.js 없음 → card3 은 인상·태도 모드로 생성됩니다');
}

// ===== 🔬 차트 정밀 다이제스트 =====
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점' };

const AVAILABLE_BODIES = ['태양','달','수성','금성','화성','목성','토성','상승점','천정'];

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000);
}

function signDeg(lon) {
  const l = ((lon % 360) + 360) % 360;
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}

const ASPECTS = [
  { ang: 0,   name: '합',   orb: 7, tone: '융합' },
  { ang: 60,  name: '육각', orb: 4, tone: '조화' },
  { ang: 90,  name: '사각', orb: 6, tone: '긴장' },
  { ang: 120, name: '삼각', orb: 6, tone: '조화' },
  { ang: 180, name: '대립', orb: 7, tone: '긴장' }
];
const ASPECT_TONE = { '합': '겹침', '육각': '순풍', '삼각': '순풍', '사각': '마찰', '대립': '팽팽함' };

function sep360(a, b) {
  const d = Math.abs((((a - b) % 360) + 360) % 360);
  return d > 180 ? 360 - d : d;
}

function buildAspects(planets) {
  const out = [];
  for (let i = 0; i < AVAILABLE_BODIES.length; i++) {
    for (let j = i + 1; j < AVAILABLE_BODIES.length; j++) {
      const a = AVAILABLE_BODIES[i], b = AVAILABLE_BODIES[j];
      if (!planets[a] || !planets[b]) continue;
      const d = sep360(planets[a].abs, planets[b].abs);
      for (const A of ASPECTS) {
        const err = Math.abs(d - A.ang);
        if (err > A.orb) continue;
        out.push({ a: a, b: b, name: A.name, err: err, tone: ASPECT_TONE[A.name], mood: A.tone });
        break;
      }
    }
  }
  out.sort(function (x, y) { return x.err - y.err; });
  return out;
}

const SIGN_RULER = {
  '양자리':'화성','황소자리':'금성','쌍둥이자리':'수성','게자리':'달','사자자리':'태양','처녀자리':'수성',
  '천칭자리':'금성','전갈자리':'화성','사수자리':'목성','염소자리':'토성','물병자리':'토성','물고기자리':'목성'
};

const DIGNITY = {
  rul: { '태양':'사자자리','달':'게자리','수성':['쌍둥이자리','처녀자리'],'금성':['황소자리','천칭자리'],
         '화성':['양자리','전갈자리'],'목성':['사수자리','물고기자리'],'토성':['염소자리','물병자리'] },
  exa: { '태양':'양자리','달':'황소자리','수성':'처녀자리','금성':'물고기자리','화성':'염소자리','목성':'게자리','토성':'천칭자리' },
  det: { '태양':'물병자리','달':'염소자리','수성':['사수자리','물고기자리'],'금성':['양자리','전갈자리'],
         '화성':['황소자리','천칭자리'],'목성':['쌍둥이자리','처녀자리'],'토성':['게자리','사자자리'] },
  fal: { '태양':'천칭자리','달':'전갈자리','수성':'물고기자리','금성':'처녀자리','화성':'게자리','목성':'염소자리','토성':'양자리' }
};

function dignityOf(planet, sign) {
  const hit = function (t) {
    const v = DIGNITY[t][planet];
    if (!v) return false;
    return Array.isArray(v) ? v.indexOf(sign) >= 0 : v === sign;
  };
  if (hit('rul')) return '지배(제 집)';
  if (hit('exa')) return '고양';
  if (hit('det')) return '함몰';
  if (hit('fal')) return '추락';
  return '';
}

const GLYPH = { '상승점':'AC','태양':'☉','달':'☽','수성':'☿','금성':'♀','화성':'♂',
                '목성':'♃','토성':'♄','천정':'MC' };
const ROLE = { '상승점':'첫인상·타고난 기질','태양':'나의 중심','달':'감정과 안식',
               '수성':'생각과 말','금성':'사랑하는 방식','화성':'끌리는 방식·추진력',
               '목성':'확장과 기회','토성':'책임과 두려움','천정':'사회적 얼굴' };

function buildChartTable(planets, ascAbs) {
  const order = ['상승점','태양','달','수성','금성','화성','목성','토성','천정'];
  const rows = [];
  for (const n of order) {
    if (!planets[n]) continue;
    const abs = planets[n].abs;
    let house = null;
    if (typeof ascAbs === 'number') {
      const as = Math.floor(((ascAbs % 360) + 360) % 360 / 30);
      const ps = Math.floor(((abs % 360) + 360) % 360 / 30);
      house = (((ps - as) % 12) + 12) % 12 + 1;
    }
    const inSign = ((abs % 360) + 360) % 360 % 30;
    let d = Math.floor(inSign), m = Math.round((inSign - d) * 60);
    if (m === 60) { d += 1; m = 0; }
    rows.push({
      glyph: GLYPH[n] || '✦', name: n, role: ROLE[n] || '',
      sign: planets[n].sign, deg: d + '\u00B0' + String(m).padStart(2, '0') + '\u2032',
      house: house, dignity: (n === '상승점' || n === '천정') ? '' : dignityOf(n, planets[n].sign)
    });
  }
  return rows;
}

function buildMethodNote(iso, cityResolved, timeUnknown) {
  const off = String(iso).slice(-6);
  const L = [];
  L.push('출생 시각을 <b>' + String(iso).slice(0, 16).replace('T', ' ') +
         '</b> (UTC' + off + ') 로 놓고 계산했습니다.');
  L.push('좌표계는 <b>트로피컬</b>, 하우스는 <b>홀사인</b> 방식입니다. 상승점이 속한 별자리 전체가 1하우스가 됩니다.');
  L.push('상승점과 천정은 그 시각의 항성시로 직접 계산했습니다. Swiss Ephemeris 대비 <b>오차 1분(arcmin) 이내</b>입니다.');
  if (timeUnknown) {
    L.push('다만 태어난 시각을 모른다고 하셔서 <b>정오 기준</b>으로 잡았습니다. 별자리는 그대로 유효하지만 <b>상승점과 하우스는 근사치</b>입니다.');
  } else {
    L.push('태어난 시각이 4분만 달라져도 상승점이 1도 움직입니다. 알려주신 시각이 정확하다는 전제에서 이 정밀도가 의미를 갖습니다.');
  }
  if (!cityResolved) {
    L.push('출생지가 목록에 없어 서울 좌표로 계산했습니다. 실제 출생지와 경도 차이가 크면 상승점이 달라질 수 있습니다.');
  }
  return L.join('<br><br>');
}

function localPlanetList(dateTimeIso) {
  const map = { '태양':'Sun', '달':'Moon', '수성':'Mercury', '금성':'Venus',
                '화성':'Mars', '목성':'Jupiter', '토성':'Saturn' };
  const pos = EPH.positions(dateTimeIso, Object.keys(map));
  const ay = lahiriAyanamsa(dateTimeIso);
  const out = [];
  for (const kr in map) {
    if (pos[kr] === undefined) continue;
    out.push({ name: map[kr], longitude: ((pos[kr] - ay) % 360 + 360) % 360 });
  }
  return out;
}

const PAIR_MEANING = {
  '태양-달':    { 조화:'겉과 속이 일치해 자기 자신과 사이가 좋다', 긴장:'하고 싶은 것과 마음이 원하는 것이 자주 어긋나 스스로 갈등한다', 융합:'자기 감정과 의지가 한 덩어리라 몰입이 강하다' },
  '태양-토성':  { 조화:'어릴 때부터 책임감이 몸에 배어 신뢰를 얻는다', 긴장:'늘 부족하다고 느끼며 스스로를 몰아붙인다. 인정받는 데 목마르다', 융합:'일찍 어른이 된 사람. 무겁지만 단단하다' },
  '달-토성':    { 조화:'감정을 절제할 줄 아는 어른스러움', 긴장:'감정을 드러내면 안 된다고 배워 혼자 삼킨다. 외로움의 뿌리', 융합:'정서적으로 일찍 독립했지만 그만큼 결핍이 있다' },
  '금성-토성':  { 조화:'오래가는 진중한 사랑을 만든다', 긴장:'사랑에 조건을 붙이거나 마음을 늦게 연다. 애정 결핍의 흔적', 융합:'가볍게 사랑하지 못하는 사람. 늦지만 깊다' },
  '화성-토성':  { 조화:'끈질기게 밀어붙여 결과를 낸다', 긴장:'하고 싶은데 브레이크가 걸린다. 참다가 한 번에 터진다', 융합:'욕망을 억누르며 사는 사람' },
  '수성-토성':  { 조화:'깊이 있게 사고하고 신중하게 말한다', 긴장:'말하기 전에 재고 또 재느라 표현이 늦다', 융합:'생각이 무겁고 진지하다' },
  '태양-목성':  { 조화:'운이 따르고 사람이 모인다', 긴장:'자신감이 과해 일을 크게 벌인다', 융합:'스케일이 큰 사람' },
  '달-금성':    { 조화:'정서적으로 따뜻하고 사랑스러운 기질', 긴장:'애정 욕구와 감정 사이에서 흔들린다', 융합:'사랑받고 싶은 마음이 크다' },
  '금성-화성':  { 조화:'좋아하는 마음과 다가가는 행동이 어긋나지 않는다', 긴장:'끌리는 사람과 편한 사람이 따로 논다. 그래서 늘 둘 중 하나를 포기해왔다', 융합:'좋아하면 바로 움직인다. 밀어붙이다 놓친 적도 있다' },
  '달-화성':    { 조화:'감정이 곧 행동이라 솔직하다', 긴장:'서운하면 말 대신 날이 먼저 선다. 싸우고 나서 후회하는 쪽', 융합:'감정의 온도가 높고 반응이 빠르다' },
  '금성-목성':  { 조화:'사람 복이 있고 애정에 여유가 있다', 긴장:'상대에게 기대를 크게 걸었다가 실망한다', 융합:'사랑에 후하다. 주는 걸 아끼지 않는다' },
  '수성-화성':  { 조화:'말이 빠르고 정확해 설득력이 있다', 긴장:'말이 먼저 나가 상처를 준다. 이기고 나서 관계를 잃는다', 융합:'논쟁을 즐기는 편이다' },
  '달-상승점':  { 조화:'느끼는 그대로가 겉으로 드러나 편안하다', 긴장:'속마음과 보이는 태도가 달라 오해를 산다', 융합:'감정이 얼굴에 다 뜬다' },
  '금성-상승점':{ 조화:'첫인상에서 호감을 얻는다', 긴장:'꾸미는 것과 편한 것 사이에서 늘 갈등한다', 융합:'외모와 분위기에 신경 쓰는 사람' },
  '토성-상승점':{ 조화:'믿음직해 보이는 인상', 긴장:'실제보다 차갑고 어렵게 보여 다가오는 사람을 놓친다', 융합:'나이보다 성숙해 보인다' },
  '태양-금성':  { 조화:'자기다울 때 가장 매력적이다', 긴장:'인정받고 싶은 마음과 사랑받고 싶은 마음이 부딪힌다', 융합:'존재 자체가 부드럽게 읽힌다' },
  '태양-화성':  { 조화:'하고 싶은 걸 곧장 실행한다', 긴장:'이겨야 직성이 풀려 가까운 사람과 부딪힌다', 융합:'추진력이 정체성이다' },
  '달-목성':    { 조화:'마음이 넉넉해 사람이 기대온다', 긴장:'감정을 크게 키워 실망도 크다', 융합:'품이 넓은 사람' }
};

const JUPITER_TABLE_START = { year: 2026, month: 8 };
const JUPITER_LON_TABLE = [126.96,133.7,139.59,144.32,146.79,146.44,143.35,139.75,137.23,137.49,140.41,145.13,151.2,157.84,164.27,170.28,174.81,177.31,176.9,174.08,170.18,167.79,168.03,170.79,175.57,181.59,187.99,194.6,200.38,204.96,207.28,206.89,203.95,200.22,197.76,197.94,200.73,205.53,211.39,218.07,224.54,230.57,235.17,237.39,237.11,234.33,230.5,228.06,228.19,231.01,235.72,241.9,248.52,255.37,261.56,265.92,268.66,268.61,265.9,262.17,259.5,259.53,262.23,267.17,273.31,280.36,287.44,293.49,298.64,301.6,301.9,299.51,295.63,292.76,292.59,295.31,300.16,306.66,313.91,320.52,327.3,332.71,336.34,337.28,335.32,331.47,328.28,327.59,329.89,334.74,341.23,347.82,355.28,2.1,8.1,12.22,13.94,12.61,9.06,5.35,4.03];

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function tableYM(i) {
  const y = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + i) / 12);
  const m = ((JUPITER_TABLE_START.month - 1 + i) % 12) + 1;
  return { y: y, m: m };
}

function currentTableIndex() {
  const n = new Date();
  const i = (n.getFullYear() - JUPITER_TABLE_START.year) * 12 +
            (n.getMonth() + 1 - JUPITER_TABLE_START.month);
  return Math.max(0, i);
}

function findJupiterTransitWindows(targetDeg, ctx) {
  const aspects = [
    { name: '합 · 강력', angle: 0, orb: 6, weight: 3 },
    { name: '삼각 · 우호적', angle: 120, orb: 5, weight: 2 },
    { name: '삼각 · 우호적', angle: 240, orb: 5, weight: 2 },
    { name: '육각 · 기회', angle: 60, orb: 4, weight: 1 },
    { name: '육각 · 기회', angle: 300, orb: 4, weight: 1 }
  ];

  const FROM = currentTableIndex();
  const all = [];
  for (const asp of aspects) {
    let inWindow = false;
    let windowStart = null;
    for (let i = FROM; i < JUPITER_LON_TABLE.length; i++) {
      const diff = angleDiff(JUPITER_LON_TABLE[i], (targetDeg + asp.angle) % 360);
      const within = diff <= asp.orb;
      if (within && !inWindow) { inWindow = true; windowStart = i; }
      if (!within && inWindow) {
        inWindow = false;
        all.push({ start: windowStart, end: i - 1, name: asp.name, weight: asp.weight });
      }
    }
    if (inWindow) {
      all.push({ start: windowStart, end: JUPITER_LON_TABLE.length - 1, name: asp.name, weight: asp.weight });
    }
  }

  if (all.length === 0) return null;
  all.sort(function (a, b) { return a.start - b.start; });

  let strongest = all[0];
  for (let i = 1; i < all.length; i++) {
    if (all[i].weight > strongest.weight) strongest = all[i];
  }
  let top = all.slice(0, 3);
  if (top.indexOf(strongest) === -1) {
    top[top.length - 1] = strongest;
    top.sort(function (a, b) { return a.start - b.start; });
  }
  const strongestIdx = top.indexOf(strongest);
  if (ctx) ctx.windowCount = top.length;

  return top.map(function (w, idx) {
    const s = tableYM(w.start), e = tableYM(w.end);
    const period = (s.y === e.y)
      ? s.y + '년 ' + s.m + '월~' + e.m + '월'
      : s.y + '년 ' + s.m + '월 ~ ' + e.y + '년 ' + e.m + '월';
    let out = period + ' (목성 ' + w.name + ')';
    if (idx === strongestIdx) {
      out += ' ★★각도상 가장 강력한 결혼·만남의 창★★';
      if (ctx) {
        ctx.strongestYears = (s.y === e.y) ? [String(s.y)] : [String(s.y), String(e.y)];
      }
    }
    return out;
  });
}

function jupiterLonAt(year, month) {
  const iso = year + '-' + String(month).padStart(2, '0') + '-15T12:00:00+09:00';
  const p = EPH.positions(iso, ['목성']);
  return (p && typeof p['목성'] === 'number') ? ((p['목성'] % 360) + 360) % 360 : null;
}

function findJupiterPastHits(targetDeg, ageNow) {
  try {
    const check = jupiterLonAt(JUPITER_TABLE_START.year, JUPITER_TABLE_START.month);
    if (check === null || angleDiff(check, JUPITER_LON_TABLE[0]) > 3) {
      console.warn('⚠️ 과거 트랜짓 자체검증 실패 → 과거 검증 재료 생략');
      return [];
    }
  } catch (e) { return []; }

  const now = new Date();
  const maxBack = (typeof ageNow === 'number' && ageNow > 0)
    ? Math.min(96, Math.max(0, (ageNow - 18) * 12))
    : 96;
  if (maxBack < 12) return [];

  const hits = [];
  for (let back = maxBack; back >= 1; back--) {
    const d = new Date(now.getFullYear(), now.getMonth() - back, 1);
    const lon = jupiterLonAt(d.getFullYear(), d.getMonth() + 1);
    if (lon === null) continue;
    if (angleDiff(lon, targetDeg) <= 5) {
      const prev = hits[hits.length - 1];
      if (prev && back >= prev.back - 3) { prev.back = back; continue; }
      hits.push({ y: d.getFullYear(), m: d.getMonth() + 1, back: back });
    }
  }
  return hits.slice(-2).map(function (h) { return h.y + '년 ' + h.m + '월 무렵'; });
}

function buildChartDigest(data, dateTimeIso, location, ctx) {
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
    let asc = null;
    if (location && typeof location.lat === 'number' && typeof location.lon === 'number') {
      const jdv = CH.toJD(dateTimeIso);
      asc = signDeg(CH.calcASC(jdv, location.lon, location.lat));
      planets['상승점'] = asc;
      planets['천정'] = signDeg(CH.calcMC(jdv, location.lon));
    } else if (planets['상승점']) {
      asc = planets['상승점'];
    }
    if (!asc) {
      console.error('🔥 상승점을 계산하지 못했습니다 → 하우스 없는 리포트를 내보내지 않습니다');
      return null;
    }
    if (ctx) ctx.snapshot = { planets: planets, ascAbs: asc.abs };

    const lines = [];
    const dsc = signDeg(asc.abs + 180);
    lines.push('상승점(ASC): ' + asc.sign + ' ' + asc.deg + '도');
    lines.push('7하우스(배우자궁) 시작점: ' + dsc.sign + ' ' + dsc.deg + '도 ← 배우자 해석의 최우선 근거');
    if (planets['천정']) lines.push('천정(MC): ' + planets['천정'].sign + ' ' + planets['천정'].deg + '도');

    const jupiterWindows = findJupiterTransitWindows(dsc.abs, ctx);
    const validWindows = (jupiterWindows || []).filter(function (w) {
      return typeof w === 'string' && w.length > 0 && w.indexOf('undefined') === -1;
    });
    if (validWindows.length > 0) {
      lines.push('\n[실제 계산된 목성 트랜짓 - 이 시기만 만남 시기로 사용하라]');
      lines.push('🚨 아래 목록은 ' + validWindows.length + '개다. 개수를 늘리거나 줄이지 마라.');
      validWindows.forEach(function (w, i) { lines.push((i + 1) + '순위 시기: ' + w); });
      const strongest = validWindows.find(function (w) { return w.indexOf('★★') >= 0; });
      if (strongest) lines.push('→ ★★ 표시된 구간이 각도상 가장 강력한 결혼·만남의 창이다. card5에서 이 구간만 빨간 강조로 못 박아라. 다른 시기를 최강으로 바꿔치기하면 치명적 실패다.');
      if (validWindows.length === 1) {
        lines.push('→ 뚜렷한 시기가 하나뿐이다. 이건 손해가 아니라 특징이다. "흔치 않게 시기가 한 곳으로 모여 있습니다"라고 오히려 강조하라. 개수를 채우려고 없는 연도를 만들면 치명적 실패다.');
      }
    } else {
      lines.push('\n[실제 계산 결과] 향후 8년간(~2034년) 목성이 배우자궁과 뚜렷한 각을 맺는 시기가 없다. 만남 시기를 단정하지 말고, "지금은 시기보다 태도와 만남의 자리를 넓히는 데 집중할 때"라고 정직하게 안내하라. 없는 시기를 지어내지 마라.');
    }

    const pastHits = findJupiterPastHits(dsc.abs, ctx ? ctx.ageNow : null);
    if (pastHits.length) {
      lines.push('\n[🕰 지난 목성 통과 — card2 과거 검증에 반드시 쓸 것]');
      pastHits.forEach(function (t) { lines.push('· ' + t + ' 목성이 배우자궁을 지났다.'); });
      lines.push('→ 이 시기에 관계가 시작됐거나, 정리됐거나, 한 번 크게 흔들렸다. 하나를 골라 단정하라.');
      lines.push('  맞히면 뒤의 미래 예측이 전부 믿음이 된다. 이 리포트에서 신뢰를 가장 싸게 얻는 장치다.');
      if (ctx) ctx.pastYears = pastHits.map(function (t) { return t.slice(0, 4); });
    }

    const HOUSE_MEANING = {
      1: '자아·타고난 기질·첫인상',
      2: '돈·자존감·타고난 재능',
      3: '소통·형제자매·초년 학습환경',
      4: '부모·가정·뿌리·마음의 안식처',
      5: '연애·즐거움·자기표현',
      6: '일상·건강·직장생활·성실함',
      7: '배우자·결혼·1:1 관계 ★핵심',
      8: '깊은 결속·타인의 자원·변형',
      9: '배움·여행·먼 곳·신념',
      10: '커리어·사회적 지위·명예',
      11: '인간관계·인맥·꿈과 소망',
      12: '무의식·숨겨진 상처·혼자만의 세계'
    };

    const ascSign = Math.floor((((asc.abs % 360) + 360) % 360) / 30);
    const houseOf = function (abs) {
      const ps = Math.floor((((abs % 360) + 360) % 360) / 30);
      return (((ps - ascSign) % 12) + 12) % 12 + 1;
    };

    const houseMap = {};
    for (const n of ['태양','달','수성','금성','화성','목성','토성']) {
      if (!planets[n]) continue;
      const h = houseOf(planets[n].abs);
      houseMap[h] = houseMap[h] || [];
      houseMap[h].push(n);
      lines.push(n + ': ' + planets[n].sign + ' ' + planets[n].deg + '도 (' + h + '하우스 = ' +
                 HOUSE_MEANING[h] + (h === 7 ? ' ★배우자궁 안! 최우선 근거' : '') + ')');
    }

    const ruler = SIGN_RULER[dsc.sign];
    if (ruler && planets[ruler]) {
      const rh = houseOf(planets[ruler].abs);
      const rdg = dignityOf(ruler, planets[ruler].sign);
      lines.push('\n[7하우스 지배성 — 배우자를 만나는 자리 / card6 의 근거]');
      lines.push('7하우스가 ' + dsc.sign + '이므로 지배성은 ' + ruler + '이다.');
      lines.push('그 ' + ruler + '이 ' + planets[ruler].sign + ' ' + planets[ruler].deg +
                 '도, ' + rh + '하우스(' + HOUSE_MEANING[rh] + ')에 있다.' + (rdg ? ' 품위: ' + rdg : ''));
      lines.push('→ 배우자는 이 영역과 얽힌 자리에서 나타난다. 만남의 장소·경로를 여기서 끌어내라.');
      if (ctx) ctx.rulerName = ruler;

      const rulerAsps = buildAspects(planets).filter(function (x) {
        if (x.a !== ruler && x.b !== ruler) return false;
        const other = (x.a === ruler) ? x.b : x.a;
        return ['태양','달','금성','화성','상승점'].indexOf(other) >= 0;
      });
      if (rulerAsps.length) {
        lines.push('\n[card6 전용 — 지배성 ' + ruler + '이 손님 본인과 맺는 각도]');
        rulerAsps.slice(0, 5).forEach(function (x) {
          lines.push('· ' + x.a + ' ' + x.name + ' ' + x.b + ' (오차 ' + x.err.toFixed(1) +
                     '도, ' + x.tone + ') → ' + (x.mood === '긴장' ? '부딪히는 지점' : '편해지는 지점'));
        });
        lines.push('→ card6 은 이 각도들만 근거로 쓴다. 조화각은 편해지는 지점, 마찰각은 부딪히는 지점이다.');
      } else {
        lines.push('\n[card6 안내] 지배성 ' + ruler + '이 손님의 주요 지점과 맺는 각도가 없다. 각도 대신 ' + ruler + '의 별자리·하우스·품위만으로 서술하고, 없는 각도를 지어내지 마라.');
        if (ctx) ctx.noRulerAspect = true;
      }
    }

    (function () {
      const eighthSign = SIGNS_KR[(ascSign + 7) % 12];
      lines.push('\n[8하우스 — 배우자의 수입 구조 (card4 근거)]');
      lines.push('8하우스 별자리: ' + eighthSign);
      if (houseMap[8] && houseMap[8].length) {
        lines.push('8하우스 안의 행성: ' + houseMap[8].join('·'));
        houseMap[8].forEach(function (n) {
          const dg = dignityOf(n, planets[n].sign);
          lines.push('  · ' + n + ' ' + planets[n].sign + (dg ? ' / ' + dg : ''));
        });
      } else {
        const r8 = SIGN_RULER[eighthSign];
        if (r8 && planets[r8]) {
          const d8 = dignityOf(r8, planets[r8].sign);
          lines.push('8하우스는 비어 있다. 지배성 ' + r8 + '이 ' + planets[r8].sign +
                     ' ' + houseOf(planets[r8].abs) + '하우스에 있다' + (d8 ? ' / ' + d8 : '') + '.');
          lines.push('→ 비었다고 없는 게 아니다. 지배성이 앉은 방이 배우자 수입의 출처다.');
        }
      }
    })();

    if (planets['금성'] || planets['화성']) {
      lines.push('\n[지금까지의 연애 패턴 — card2 재료]');
      if (planets['금성']) {
        const dg = dignityOf('금성', planets['금성'].sign);
        lines.push('금성(사랑하는 방식): ' + planets['금성'].sign + ' ' + planets['금성'].deg + '도' +
                   (dg ? ' / ' + dg : '') + ' → 애정을 주는 방식, 끌리는 대상의 결.');
      }
      if (planets['화성']) {
        const dg2 = dignityOf('화성', planets['화성'].sign);
        lines.push('화성(끌리는 방식·추진력): ' + planets['화성'].sign + ' ' + planets['화성'].deg + '도' +
                   (dg2 ? ' / ' + dg2 : '') + ' → 먼저 다가가는 방식, 부딪히는 방식.');
      }
      lines.push('→ 이 둘로 "어떤 사람에게 끌렸고 왜 반복해서 어긋났는지"를 짚어라.');
    }

    const asps = buildAspects(planets);
    if (asps.length) {
      lines.push('\n[실제 계산된 각도 — 오차까지 그대로 인용하라]');
      asps.slice(0, 10).forEach(function (x) {
        lines.push('· ' + x.a + ' ' + x.name + ' ' + x.b +
                   ' (오차 ' + x.err.toFixed(1) + '도, ' + x.tone + ')');
      });
      const tight = asps.filter(function (x) { return x.err <= 1.5; });
      if (tight.length) {
        lines.push('→ 오차 1.5도 이내가 ' + tight.length + '개다. 이 사람 인생에서 가장 강하게 작동하는 힘이다.');
        lines.push('  본문에 최소 2개는 오차까지 밝혀서 인용하라.');
      }
    }

    (function () {
      const EL = ['불','흙','공기','물'], MO = ['활동','고정','변통'];
      const ec = {}, mc = {};
      ['태양','달','수성','금성','화성','목성','토성','상승점'].forEach(function (k) {
        if (!planets[k]) return;
        const si = Math.floor((((planets[k].abs % 360) + 360) % 360) / 30);
        ec[EL[si % 4]] = (ec[EL[si % 4]] || 0) + 1;
        mc[MO[si % 3]] = (mc[MO[si % 3]] || 0) + 1;
      });
      const lack = EL.filter(function (e) { return !ec[e]; });
      const lack2 = MO.filter(function (m) { return !mc[m]; });
      lines.push('\n[원소·성질]');
      lines.push('원소: ' + EL.map(function (e) { return e + ' ' + (ec[e] || 0); }).join(' / '));
      lines.push('성질: ' + MO.map(function (m) { return m + ' ' + (mc[m] || 0); }).join(' / '));
      if (lack.length || lack2.length) {
        lines.push('결핍: ' + lack.concat(lack2).join('·') +
                   ' → 타고나지 않아 의식적으로 채워야 하는 영역. 조언에 반드시 반영하라.');
      }
    })();

    const highlights = [];
    for (const h of Object.keys(houseMap)) {
      const ps = houseMap[h];
      if (ps.length >= 2) {
        highlights.push('【스텔리움】 ' + h + '하우스(' + HOUSE_MEANING[h] + ')에 ' + ps.join('·') +
                        ' ' + ps.length + '개가 몰려 있다 → 이 사람 인생의 최대 화두. 반드시 깊게 다뤄라.');
      }
    }
    if (houseMap[7]) highlights.push('【배우자궁의 행성】 7하우스 안에 ' + houseMap[7].join('·') + '이 있다 → 배우자 해석의 결정적 단서.');
    if (houseMap[12]) highlights.push('【숨겨진 상처】 12하우스에 ' + houseMap[12].join('·') + '이 있다 → 남에게 말 못 한 감정·억눌린 패턴이 있다. 이걸 짚으면 소름 돋는다.');
    if (houseMap[4]) highlights.push('【부모·뿌리】 4하우스에 ' + houseMap[4].join('·') + '이 있다 → 가정환경이 이 사람 성격 형성에 결정적이었다.');
    if (houseMap[11]) highlights.push('【인간관계】 11하우스에 ' + houseMap[11].join('·') + '이 있다 → 인맥·모임이 인생에서 큰 비중을 차지한다.');
    if (houseMap[8]) highlights.push('【깊은 결속】 8하우스에 ' + houseMap[8].join('·') + '이 있다 → 얕은 관계로는 만족 못 하는 사람.');

    const aspectLines = [];
    for (const x of asps) {
      const key = PAIR_MEANING[x.a + '-' + x.b] ? x.a + '-' + x.b
                : (PAIR_MEANING[x.b + '-' + x.a] ? x.b + '-' + x.a : null);
      if (!key) continue;
      const meaning = PAIR_MEANING[key][x.mood];
      if (meaning) {
        aspectLines.push('【각도】 ' + x.a + '-' + x.b + ' ' + x.name + '(' + x.mood +
                         ', 오차 ' + x.err.toFixed(1) + '도) → ' + meaning);
      }
    }
    if (aspectLines.length) {
      highlights.push('--- 아래는 행성 간 각도다. 성격·연애 패턴의 가장 정밀한 근거이니 최소 2개는 해석에 녹여라 ---');
      aspectLines.slice(0, 8).forEach(function (l) { highlights.push(l); });
    }

    if (highlights.length) {
      lines.push('\n[🔬 이 사람만의 특이 배치 - 중심 스토리로 반드시 활용하라]');
      highlights.forEach(function (h) { lines.push(h); });
    }

    if (buildAppearanceSignature) {
      try {
        const ap = buildAppearanceSignature(planets, asc);
        if (ap) { lines.push('\n' + ap); if (ctx) ctx.hasAppearance = true; }
      } catch (e) { console.warn('⚠️️ 외모 재료 생성 실패:', e.message); }
    }

    return lines.join('\n');
  } catch (e) {
    console.error('🔥 buildChartDigest 실패:', e.message);
    return null;
  }
}

const NOUN_ONLY = ['태양','달','수성','금성','화성','목성','토성',
  '상승점','천정','노스노드','사우스노드',
  '양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리',
  '천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const BOLD_LIMIT = 4;

function emphasisIssue(text) {
  const t = String(text || '');
  const bolds = (t.match(/<b>([\s\S]*?)<\/b>/g) || [])
    .map(function (x) { return x.replace(/<\/?b>/g, '').trim(); });
  if (bolds.length > BOLD_LIMIT) return '금색 강조가 ' + bolds.length + '개 (' + BOLD_LIMIT + '개 이하로)';
  for (const b of bolds) {
    if (b.length <= 6 && NOUN_ONLY.indexOf(b.replace(/[·\s]/g, '')) >= 0) {
      return '행성·별자리 이름에 강조: "' + b + '" (판정 문장에만 쳐라)';
    }
  }
  const reds = (t.match(/color:\s*#ff3b30/g) || []).length;
  if (reds > 2) return '빨간 경고가 ' + reds + '개 (1개만)';
  return null;
}

const BANNED = ['undefined', 'NaN', '트랜짓 항목', '데이터에 없음',
  '우주가 당신', '에너지가', '파동', '기운이 흐르', '다시 말해', '살펴보겠습니다',
  '일 수 있습니다', '느낌도 있습니다', '경우에 따라', '아마도',
  '긍정적으로 생각', '시간이 해결', '천왕성', '해왕성', '명왕성'];
const strip = function (v) { return String(v || '').replace(/<[^>]+>/g, ''); };

// ── Gemini REST API 직접 호출 함수 ────────────────────────────────────
async function callGeminiApi(systemPrompt, userPrompt, correctionNotice = '') {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error('GEMINI_API_KEY 환경변수가 설정되지 않았습니다.');

  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`;

  const promptText = correctionNotice
    ? `${userPrompt}\n\n[🚨 이전 생성 검수 실패 수정 요청]\n${correctionNotice}\n위 지적사항을 완벽히 보완하여 규칙과 JSON 형식을 철저히 준수하여 다시 작성하세요.`
    : userPrompt;

  const body = {
    contents: [
      { role: 'user', parts: [{ text: promptText }] }
    ],
    systemInstruction: {
      parts: [{ text: systemPrompt }]
    },
    generationConfig: {
      temperature: 0.75,
      responseMimeType: 'application/json'
    }
  };

  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    const err = new Error(`Gemini API HTTP ${resp.status}: ${errText}`);
    err.status = resp.status;
    throw err;
  }

  const resData = await resp.json();
  const rawText = resData?.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!rawText) throw new Error('Gemini API 응답에서 텍스트를 추출하지 못했습니다.');

  return JSON.parse(rawText);
}

// ── 게이트 검수 함수 ──────────────────────────────────────────────────
function gateCheck(jsonObj, ctx) {
  if (!jsonObj || typeof jsonObj !== 'object') return 'JSON 응답 아님';
  const cards = ['card1', 'card2', 'card3', 'card4', 'card5', 'card6', 'card7'];
  for (const c of cards) {
    if (!jsonObj[c]) return `${c} 항목 누락`;
    const text = strip(jsonObj[c]);
    for (const ban of BANNED) {
      if (text.includes(ban)) return `${c}에 금지어 포함: "${ban}"`;
    }
    const emp = emphasisIssue(jsonObj[c]);
    if (emp) return `${c} ${emp}`;
  }

  if (strip(jsonObj.card1).length < 500) return 'card1 분량 부족 (500자 미만)';
  if (strip(jsonObj.card2).length < 600) return 'card2 분량 부족 (600자 미만)';
  if (strip(jsonObj.card3).length < 500) return 'card3 분량 부족 (500자 미만)';
  if (strip(jsonObj.card4).length < 500) return 'card4 분량 부족 (500자 미만)';
  if (strip(jsonObj.card5).length < 400) return 'card5 분량 부족 (400자 미만)';
  if (strip(jsonObj.card6).length < 600) return 'card6 분량 부족 (600자 미만)';
  if (strip(jsonObj.card7).length < 500) return 'card7 분량 부족 (500자 미만)';

  if (ctx.strongestYears && ctx.strongestYears.length > 0) {
    const c5Text = strip(jsonObj.card5);
    const hasYear = ctx.strongestYears.some(y => c5Text.includes(y));
    if (!hasYear) return `card5에 가장 강력한 트랜짓 연도(${ctx.strongestYears.join(', ')}) 미포함`;
  }

  if (ctx.pastYears && ctx.pastYears.length > 0) {
    const c2Text = strip(jsonObj.card2);
    const hasPastYear = ctx.pastYears.some(y => c2Text.includes(y));
    if (!hasPastYear) return `card2에 과거 목성 통과 연도(${ctx.pastYears.join(', ')}) 미포함`;
  }

  return null;
}

// ── 메인 핸들러 ──────────────────────────────────────────────────────
const handler = async (req, res) => {
  // 🚨 [다시보기] GET + orderId → 저장된 리포트를 KV에서 즉시 조회
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });

    if (await enforceRateLimit(req, res, { bucket: 'report-get', limit: 120, windowSec: 60 })) return;
    try {
      const [saved, st, intakeRec] = await Promise.all([
        kv.get('report:' + orderId),
        kv.get('status:' + orderId).catch(function () { return null; }),
        kv.get('intake:' + orderId).catch(function () { return null; })
      ]);
      res.setHeader('Cache-Control', 'no-store');
      if (saved) return res.status(200).json(saved);
      if (st && st.state === 'pending') return res.status(202).json({ status: 'pending' });
      /* ⚠️ 출생정보를 응답에 실어 보내면 안 된다. 주문번호가 날짜+연번이라
         순서대로 찍어보면 남의 개인정보를 그대로 긁어갈 수 있다.
         "다시 만들 수 있다"는 사실만 boolean으로 내려준다. */
      return res.status(404).json({
        error: '리포트를 찾을 수 없습니다.',
        canRebuild: Boolean(intakeRec)
      });
    } catch (err) {
      console.error('GET 리포트 조회 실패:', err);
      return res.status(500).json({ error: '데이터 조회 중 오류 발생' });
    }
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method Not Allowed' });
  }

  // POST 레이트 리밋
  if (await enforceRateLimit(req, res, { bucket: 'report-post', limit: 10, windowSec: 60 })) return;

  const startTime = Date.now();
  const { orderId, name, gender, birthDate, birthTime, birthCity, timeUnknown } = req.body || {};

  if (!orderId || !birthDate) {
    return res.status(400).json({ error: '필수 매개변수 누락 (orderId, birthDate)' });
  }

  await kv.set('status:' + orderId, { state: 'pending', updatedAt: new Date().toISOString() }, { ex: 600 });

  const cleanedName = cleanName(name) || '손님';
  const normDate = normalizeDate(birthDate);
  const normTime = timeUnknown ? '12:00' : normalizeTime(birthTime || '12:00');
  const city = birthCity || '서울';

  // 나이 계산
  const birthYear = parseInt(normDate.split('-')[0], 10);
  const birthMonth = parseInt(normDate.split('-')[1], 10) - 1;
  const birthDay = parseInt(normDate.split('-')[2], 10);
  const today = new Date();
  let ageNow = today.getFullYear() - birthYear;
  const mDiff = today.getMonth() - birthMonth;
  if (mDiff < 0 || (mDiff === 0 && today.getDate() < birthDay)) {
    ageNow--;
  }

  const ageLine = `손님 나이: 만 ${ageNow}세 (${birthYear}년생, 성별: ${gender || '미지정'})`;
  const timeUnknownLine = timeUnknown
    ? '※ 출생 시각 미상(정오 기준 계산). 상승점과 하우스 위치는 근사치이므로 과도한 단정을 피하고 기질과 분위기 중심으로 서술하세요.'
    : '※ 출생 시각 명확. 하우스와 상승점을 정밀한 근거로 활용하세요.';

  const coords = cityCoordinates[city] || cityCoordinates['서울'] || { lat: 37.5665, lon: 126.9780 };
  const cityResolved = Boolean(cityCoordinates[city]);
  const tz = cityTimezones[city] || 'Asia/Seoul';
  const dateTimeIso = buildBirthIso(normDate, normTime, tz);

  let planetData = { planet_position: localPlanetList(dateTimeIso) };

  const chartCtx = {
    startTime,
    ageNow,
    windowCount: 0,
    strongestYears: [],
    pastYears: [],
    hasAppearance: false,
    noRulerAspect: false
  };

  const chartDigest = buildChartDigest(planetData, dateTimeIso, coords, chartCtx);
  const methodNote = buildMethodNote(dateTimeIso, cityResolved, timeUnknown);

  if (!chartDigest) {
    await kv.set('status:' + orderId, { state: 'failed', reason: '차트 계산 실패' });
    return res.status(500).json({ error: '점성술 차트를 계산하지 못했습니다.' });
  }

  // ── 프롬프트 구성 ────────────────────────────────────────────────────
  const systemPrompt = `당신은 대한민국 최고 수준의 점성술 연구가이자 연애/결혼 분석가입니다.
제시된 점성학 차트 다이제스트를 바탕으로 손님(${cleanedName}님)의 인상, 연애 패턴, 배우자의 외모·직업·만남 시기·케미스트리를 정밀 분석합니다.

[출력 규칙]
1. 반드시 유효한 단일 JSON 객체 형태로 출력하세요.
2. 금지 단어: undefined, NaN, 트랜짓 항목, 데이터에 없음, 우주가 당신, 에너지가, 파동, 기운이 흐르, 다시 말해, 살펴보겠습니다, 일 수 있습니다, 느낌도 있습니다, 경우에 따라, 아마도, 긍정적으로 생각, 시간이 해결, 천왕성, 해왕성, 명왕성.
3. 강조 규칙: <b>태그는 핵심 판정 문장에만 쓰세요(카드당 4개 이하). 행성/별자리 이름 단독에 <b>를 씌우지 마세요.
4. 문체: 깊이 있고 기품 있는 권위적 단정체 ("~합니다", "~입니다"). 어설픈 위로나 애매한 입장을 취하지 말고 명확하게 진단하세요.`;

  const card3Spec = chartCtx.hasAppearance
    ? `[👤 배우자 외모 및 첫인상] (700~900자)
차트 다이제스트의 [👤 배우자 외모] 블록을 정밀 해석하세요. 키, 체형, 이목구비, 분위기, 첫인상을 사진 보듯 구체적으로 묘사하세요.`
    : `[👤 배우자 외모 및 분위기] (700~900자)
7하우스 별자리 및 지배성의 기질을 바탕으로 배우자의 전체적인 인상, 체형, 외적 분위기, 타인에게 주는 첫인상을 구체적으로 묘사하세요.`;

  const userPrompt = `[손님 정보]
이름: ${cleanedName}
${ageLine}
${timeUnknownLine}

[점성술 차트 정밀 다이제스트]
${chartDigest}

위 차트 재료를 완벽히 숙지하고 아래 7개 키를 가지는 JSON 객체로 작성하세요.

{
  "card1": "[🔮 총운 & 타고난 인상/기질] (700~900자) 상승점(ASC), 태양, 달을 바탕으로 타고난 기질, 외적 분위기, 속마음의 핵심 구조를 설명하세요.",
  "card2": "[💔 과거 연애 패턴 & 팩폭] (800~1000자) 금성/화성 배치 및 각도를 바탕으로 어떤 사람에게 끌렸고 왜 반복해서 어긋났는지 짚으세요. 과거 목성 통과 연도(${chartCtx.pastYears.join(', ')} 무렵)를 언급하여 검증하고, 날카로운 팩폭 2개를 포함하세요.",
  "card3": "${card3Spec}",
  "card4": "[💼 배우자 직업 및 경제력] (700~900자) 8하우스 및 지배성의 배치를 근거로 배우자의 수입 구조, 직업군, 경제적 역량을 정밀 분석하세요.",
  "card5": "[📅 결정적 만남 & 결혼 시기] (600~800자) 계산된 목성 트랜짓 시기를 인용하세요. 가장 강력한 구간(${chartCtx.strongestYears.join(', ')}년)을 반드시 빨간 강조(<span style=\\"color:#ff3b30\\">...</span>)로 명시하세요. 지어낸 연도를 추가하지 마세요.",
  "card6": "[🧩 두 사람이 만나면 벌어지는 케미스트리] (800~1000자) 7하우스 지배성과 손님의 태양·달·금성 간 어스펙트를 근거로, 편안해지는 지점과 충돌하는 지점, 이를 극복하는 관계의 법칙을 서술하세요.",
  "card7": "[💡 최종 현실 조언 & 핵심 팩폭] (700~900자) 차트의 원소 결핍 및 전체 구조를 종합하여 만남을 현실로 만들기 위한 실전 행동 지침과 핵심 팩폭 1개를 전달하세요."
}`;

  let lastGood = null;
  let correctionNotice = '';

  for (let attempt = 0; attempt < 3; attempt++) {
    const elapsed = Date.now() - startTime;
    if (elapsed > TIME_BUDGET_MS) {
      console.warn(`⏰ 시간 예산 초과 (${elapsed}ms / ${TIME_BUDGET_MS}ms). 현재까지 확보된 원고 활용.`);
      if (lastGood) break;
    }

    try {
      const resultJson = await callGeminiApi(systemPrompt, userPrompt, correctionNotice);
      lastGood = resultJson;

      const gateErr = gateCheck(resultJson, chartCtx);
      if (!gateErr) {
        console.log(`✅ 생성 성공 및 게이트 통과 (시도 ${attempt + 1})`);
        break;
      }

      console.warn(`⚠️ 게이트 통과 실패 (시도 ${attempt + 1}): ${gateErr}`);
      correctionNotice = gateErr;
    } catch (err) {
      console.error(`🔥 Gemini 호출 에러 (시도 ${attempt + 1}):`, err.message);
      const waitMs = RETRY_WAIT_MS[attempt] || 0;
      if (waitMs > 0 && (Date.now() - startTime + waitMs) < TIME_BUDGET_MS) {
        console.log(`⏱ ${waitMs / 1000}초 대기 후 재시도...`);
        await new Promise(r => setTimeout(r, waitMs));
      }
    }
  }

  if (!lastGood) {
    await kv.set('status:' + orderId, { state: 'failed', reason: '원고 생성 실패' });
    return res.status(500).json({ error: '리포트 생성을 완료하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
  }

  const finalReport = {
    orderId,
    name: cleanedName,
    methodNote,
    cards: lastGood,
    createdAt: new Date().toISOString()
  };

  await Promise.all([
    kv.set('report:' + orderId, finalReport, { ex: 86400 * 30 }),
    kv.set('status:' + orderId, { state: 'completed', updatedAt: new Date().toISOString() }, { ex: 86400 * 30 })
  ]);

  return res.status(200).json(finalReport);
};

module.exports = allowCors(handler);
