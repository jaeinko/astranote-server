// ============================================================================
//  api/gemini-vip.js  —  아스트라노트 VVIP 심층 리포트 (29,900원)
// ----------------------------------------------------------------------------
//  ▣ 2026-07 대개편 v3 — '수동 리포트 품질' 도달 목표
//   1. 분량 지시 모순 제거 → 자수 기준을 JSON 필드 스펙 한 곳으로 통일
//   2. maxOutputTokens 32768 → 65536 (thinking 토큰이 output 예산에서 차감되므로
//      기존 설정으로는 목표 분량이 상한에 붙어 모델이 알아서 줄여 썼음)
//   3. 천왕성·해왕성·명왕성 추가 → PAIR_MEANING의 4개 항목이 구조적으로
//      절대 안 걸리던 버그 해소. 애스펙트 매핑을 13쌍 → 50쌍으로 확장.
//      Prokerala가 외행성을 안 주면 로컬 궤도계산으로 폴백(오차 <1도).
//   4. 1회 호출 → 2회 병렬 호출 분할 (출력·사고 예산 2배).
//      서사 단절 방지를 위해 서버가 '중심 서사'를 규칙 기반으로 확정해
//      양쪽 프롬프트에 동일하게 주입.
//   5. 토성/목성/천왕성 주기 실계산 → 연령대 점수표에 실제 연도 근거 주입.
//      목성 트랜짓을 인연축 외에 커리어(10H)·재물(2H)축까지 확장.
//   6. KV 만료 30일 → 1년 (3만원 상품의 다시보기가 한 달 만에 사라지던 문제)
// ============================================================================

'use strict';

const { kv } = require('@vercel/kv');

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

// ── 공용 모듈 ──────────────────────────────────────────────────────────
//  도시 좌표와 시간대 변환은 lib/ 아래 정본 하나만 씁니다.
//  예전에는 이 로직이 API 4개에 복사돼 있어서, 한 곳만 고치면 나머지 세 곳에
//  버그가 남았습니다(한국 1954~61 UTC+8:30 · 1987~88 서머타임 미반영).
const cityCoordinates = require('../lib/cities.js');
const { cityTimezones, getUtcOffsetMinutes, buildBirthIso, dayRangeIso, tzLabel } = require('../lib/time.js');


// ═══ 도시별 시간대 (해외 출생 정확도) ═══



// ============================================================================
//  🔭 상수 정의
// ============================================================================
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const SIGN_GLYPH = { '양자리':'♈','황소자리':'♉','쌍둥이자리':'♊','게자리':'♋','사자자리':'♌','처녀자리':'♍','천칭자리':'♎','전갈자리':'♏','사수자리':'♐','염소자리':'♑','물병자리':'♒','물고기자리':'♓' };

const PLANET_KR = {
  Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성',
  Jupiter:'목성', Saturn:'토성', Uranus:'천왕성', Neptune:'해왕성', Pluto:'명왕성'
};
const PLANET_GLYPH = { '태양':'☉','달':'☽','수성':'☿','금성':'♀','화성':'♂','목성':'♃','토성':'♄',
  '천왕성':'♅','해왕성':'♆','명왕성':'♇','상승점':'AC','천정':'MC','노스노드':'☊','사우스노드':'☋' };

const PERSONAL = ['태양','달','수성','금성','화성','상승점'];
const SOCIAL = ['목성','토성'];
const OUTER = ['천왕성','해왕성','명왕성'];
const PLANET_ORDER = ['태양','달','수성','금성','화성','목성','토성','천왕성','해왕성','명왕성'];

// ── 품위(Dignity) — 수동 리포트의 '지배 · 제 집', '고양' 표기를 재현 ──
const RULER = {
  '태양':['사자자리'], '달':['게자리'], '수성':['쌍둥이자리','처녀자리'],
  '금성':['황소자리','천칭자리'], '화성':['양자리','전갈자리'],
  '목성':['사수자리','물고기자리'], '토성':['염소자리','물병자리'],
  '천왕성':['물병자리'], '해왕성':['물고기자리'], '명왕성':['전갈자리']
};
const EXALT = { '태양':'양자리','달':'황소자리','수성':'처녀자리','금성':'물고기자리',
  '화성':'염소자리','목성':'게자리','토성':'천칭자리' };
const oppSign = s => SIGNS_KR[(SIGNS_KR.indexOf(s) + 6) % 12];

function dignityOf(planet, sign) {
  const r = RULER[planet];
  if (r && r.indexOf(sign) >= 0) return { tag: '지배 · 제 집', weight: 3, note: '이 행성이 가장 힘을 잘 쓰는 자리' };
  if (EXALT[planet] === sign) return { tag: '고양 · 가장 편안한 자리', weight: 3, note: '타고난 축복에 해당하는 자리' };
  if (r && r.some(x => oppSign(x) === sign)) return { tag: '함몰 · 힘이 약한 자리', weight: -2, note: '이 영역에서 애를 더 써야 하는 자리' };
  if (EXALT[planet] && oppSign(EXALT[planet]) === sign) return { tag: '추락 · 가장 불편한 자리', weight: -2, note: '가장 서툴지만 그래서 깊어지는 자리' };
  return null;
}

const ELEMENT = { '불':['양자리','사자자리','사수자리'], '흙':['황소자리','처녀자리','염소자리'],
  '공기':['쌍둥이자리','천칭자리','물병자리'], '물':['게자리','전갈자리','물고기자리'] };
const MODALITY = { '활동(cardinal)':['양자리','게자리','천칭자리','염소자리'],
  '고정(fixed)':['황소자리','사자자리','전갈자리','물병자리'],
  '변통(mutable)':['쌍둥이자리','처녀자리','사수자리','물고기자리'] };
const ELEMENT_MEANING = { '불':'추진력·즉시 행동·주도', '흙':'현실감·축적·꾸준함',
  '공기':'사고·언어·관계 조율', '물':'감정·직관·공감' };
const MODALITY_MEANING = { '활동(cardinal)':'먼저 시작하고 판을 여는 힘',
  '고정(fixed)':'한번 정하면 끝까지 가는 뚝심(대신 잘 안 바꿈)',
  '변통(mutable)':'상황에 맞춰 유연하게 바꾸는 적응력(대신 산만해짐)' };

const HOUSE_MEANING = {
  1:'자아·타고난 기질·첫인상', 2:'돈·자존감·타고난 재능', 3:'소통·형제자매·초년 학습환경',
  4:'부모·가정·뿌리·마음의 안식처', 5:'연애·자녀·창조성·즐거움', 6:'일상·건강·직장생활·성실함',
  7:'배우자·결혼·1:1 관계', 8:'깊은 결속·상처·타인의 자원·변형', 9:'배움·여행·먼 곳·신념',
  10:'커리어·사회적 지위·명예', 11:'인간관계·인맥·꿈과 소망', 12:'무의식·숨겨진 상처·혼자만의 세계'
};

const ASPECTS = [
  { ang:0, name:'합', orb:7, tone:'융합' }, { ang:180, name:'대립', orb:6, tone:'긴장' },
  { ang:120, name:'삼각', orb:6, tone:'조화' }, { ang:90, name:'사각', orb:6, tone:'긴장' },
  { ang:60, name:'육각', orb:4, tone:'조화' }
];
const PAIR_MEANING = {
  // ── 태양 계열 ──────────────────────────────────────────────
  '태양-달':      { 조화: '겉과 속이 일치해 자기 자신과 사이가 좋다', 긴장: '하고 싶은 것과 마음이 원하는 것이 자주 어긋나 스스로와 싸운다', 융합: '의지와 감정이 한 덩어리라 한번 몰입하면 끝까지 간다' },
  '태양-수성':    { 조화: '자기 생각을 막힘 없이 언어로 옮긴다', 긴장: '머리가 앞서 나가 말이 생각을 못 따라간다', 융합: '생각이 곧 자기 정체성이다. 논리로 자신을 증명한다' },
  '태양-금성':    { 조화: '사람을 끌어당기는 호감의 힘이 있다', 긴장: '사랑받고 싶은 마음과 인정받고 싶은 마음이 충돌한다', 융합: '매력 자체가 정체성이다. 미움받는 것을 견디기 어렵다' },
  '태양-화성':    { 조화: '결정하면 바로 실행하는 추진력', 긴장: '의욕이 넘쳐 무리하다 스스로를 태운다', 융합: '경쟁에서 살아나는 사람. 도전 없으면 시든다' },
  '태양-목성':    { 조화: '운이 따르고 사람이 모인다', 긴장: '자신감이 과해 일을 크게 벌인다', 융합: '스케일이 큰 사람. 작은 판에서는 답답해한다' },
  '태양-토성':    { 조화: '어릴 때부터 책임감이 몸에 배어 신뢰를 얻는다', 긴장: '늘 부족하다 느끼며 스스로를 몰아붙인다. 인정에 목마르다', 융합: '일찍 어른이 된 사람. 무겁지만 단단하다' },
  '태양-천왕성':  { 조화: '남과 다른 길을 두려워하지 않는 독창성', 긴장: '틀에 갇히면 갑자기 다 뒤집어버린다. 안정과 자유 사이를 오간다', 융합: '평범하게 살 수 없는 사람. 이상함이 곧 무기다' },
  '태양-해왕성':  { 조화: '사람의 마음을 움직이는 이미지와 감성의 재능', 긴장: '내가 누구인지 계속 흐릿하다. 남의 기대에 자신을 맞춰왔다', 융합: '현실보다 이상에 사는 사람. 예술·영성에 끌린다' },
  '태양-명왕성':  { 조화: '위기에서 오히려 강해지는 회복력', 긴장: '통제받는 것을 극도로 싫어하고, 반대로 자기가 통제하려 든다', 융합: '한 번 무너졌다 다시 태어난 이력이 있다. 밀도가 다르다' },
  '태양-상승점':  { 조화: '보이는 모습과 실제 자신이 일치해 오해를 덜 받는다', 긴장: '남들이 보는 나와 진짜 나 사이의 간극이 크다', 융합: '존재감이 강해 어디 있어도 눈에 띈다' },
  // ── 달 계열 ────────────────────────────────────────────────
  '달-수성':      { 조화: '감정을 말로 정확히 옮길 줄 안다', 긴장: '생각이 감정을 갉아먹어 밤에 잠이 안 온다', 융합: '느낀 것을 곧바로 말하는 사람. 솔직하지만 상처도 준다' },
  '달-금성':      { 조화: '정서적으로 따뜻하고 사랑스러운 기질', 긴장: '애정 욕구와 감정 사이에서 흔들린다', 융합: '사랑받고 싶은 마음이 크다' },
  '달-화성':      { 조화: '감정이 곧 행동력으로 전환된다', 긴장: '욱하고 올라오면 참지 못하고 터진다. 나중에 후회한다', 융합: '감정의 온도가 높다. 미지근한 관계를 못 견딘다' },
  '달-목성':      { 조화: '정서적으로 넉넉해 사람들이 편안해한다', 긴장: '기분에 따라 씀씀이와 약속이 커진다', 융합: '품이 큰 사람. 남을 먹이고 챙기는 데서 만족을 얻는다' },
  '달-토성':      { 조화: '감정을 절제할 줄 아는 어른스러움', 긴장: '감정을 드러내면 안 된다고 배워 혼자 삼킨다. 외로움의 뿌리', 융합: '정서적으로 일찍 독립했지만 그만큼 결핍이 있다' },
  '달-천왕성':    { 조화: '감정의 진폭을 창의성으로 바꾼다', 긴장: '기분이 예고 없이 급변한다. 정착하면 답답해 도망치고 싶어진다', 융합: '평범한 안정에 만족 못 하는 정서 구조' },
  '달-해왕성':    { 조화: '말 안 해도 남의 감정을 읽어내는 촉', 긴장: '남의 감정이 내 것처럼 밀려들어 경계가 무너진다. 쉽게 지친다', 융합: '공감 능력이 재능이자 짐이다' },
  '달-명왕성':    { 조화: '사람 속을 꿰뚫는 깊은 감정 통찰', 긴장: '애착이 강해 집착·통제를 사랑으로 착각하기 쉽다', 융합: '감정의 밀도가 극단적으로 깊다' },
  '달-상승점':    { 조화: '감정이 얼굴에 그대로 드러나 진심이 전해진다', 긴장: '기분이 태도가 되어 오해를 산다', 융합: '첫인상부터 정서적으로 다가가는 사람' },
  // ── 수성 계열 ──────────────────────────────────────────────
  '수성-금성':    { 조화: '말과 글에 사람을 편안하게 만드는 감각이 있다', 긴장: '듣기 좋은 말과 해야 할 말 사이에서 망설인다', 융합: '표현 자체가 매력인 사람' },
  '수성-화성':    { 조화: '판단이 빠르고 말에 힘이 실린다', 긴장: '말이 칼처럼 나가 관계를 베고, 논쟁에서 물러서지 못한다', 융합: '생각과 말의 속도가 남보다 한 박자 빠르다' },
  '수성-목성':    { 조화: '큰 그림을 보고 설명해내는 능력', 긴장: '말이 커지고 디테일을 건너뛴다', 융합: '가르치고 전파하는 데 타고났다' },
  '수성-토성':    { 조화: '깊이 있게 사고하고 신중하게 말한다', 긴장: '말하기 전에 재고 또 재느라 표현이 늦다. 자기 검열이 심하다', 융합: '생각이 무겁고 진지하다' },
  '수성-천왕성':  { 조화: '남이 못 본 각도를 찾아내는 발상', 긴장: '생각이 여러 갈래로 튀어 마무리가 안 된다', 융합: '아이디어가 번쩍이는 사람. 지루한 반복은 못 견딘다' },
  '수성-해왕성':  { 조화: '이미지와 이야기로 설명하는 재능', 긴장: '기억과 사실이 흐려지고, 애매하게 말해 오해를 만든다', 융합: '논리보다 직감으로 아는 사람' },
  '수성-명왕성':  { 조화: '표면 아래 진짜 의도를 읽어내는 통찰', 긴장: '한번 의심이 들면 파고들어 스스로를 괴롭힌다', 융합: '조사하고 캐내는 데 재능이 있다' },
  '수성-상승점':  { 조화: '말로 첫인상을 만드는 사람', 긴장: '말이 많거나 적어 실제보다 다르게 보인다', 융합: '지적인 인상으로 기억된다' },
  // ── 금성 계열 ──────────────────────────────────────────────
  '금성-화성':    { 조화: '끌리면 다가가는 데 주저함이 없다', 긴장: '사랑과 욕망이 엇갈려 관계가 롤러코스터가 된다', 융합: '매력과 열정이 한 덩어리. 연애가 인생의 큰 축이다' },
  '금성-목성':    { 조화: '풍요와 인복이 따르고 즐길 줄 안다', 긴장: '좋은 것에 씀씀이가 커지고 관계를 과하게 낙관한다', 융합: '사람과 아름다움에서 인생의 의미를 찾는다' },
  '금성-토성':    { 조화: '오래가는 진중한 사랑을 만든다', 긴장: '사랑에 조건을 붙이거나 마음을 늦게 연다. 애정 결핍의 흔적', 융합: '가볍게 사랑하지 못하는 사람. 늦지만 깊다' },
  '금성-천왕성':  { 조화: '연애에서 자유롭고 독특한 매력', 긴장: '설렘에 훅 빠졌다 훅 식는다. 구속을 못 견딘다', 융합: '평범한 관계로는 만족 못 한다' },
  '금성-해왕성':  { 조화: '낭만적이고 예술적인 사랑의 감각', 긴장: '콩깍지가 두꺼워 상대를 이상화하다 상처받는다', 융합: '사랑을 환상으로 그리는 사람' },
  '금성-명왕성':  { 조화: '한 사람에게 깊이 헌신하는 힘', 긴장: '사랑이 소유가 된다. 잃을까 두려워 붙잡을수록 밀어낸다', 융합: '연애의 강도가 극단적이다. 미지근한 사랑은 사랑이 아니라 느낀다' },
  '금성-상승점':  { 조화: '첫인상에서 호감을 얻는 사람', 긴장: '보이는 매력과 실제 취향이 달라 엉뚱한 상대가 다가온다', 융합: '겉모습과 분위기 자체가 무기다' },
  // ── 화성 계열 ──────────────────────────────────────────────
  '화성-목성':    { 조화: '한번 시작하면 판을 키워 결과를 낸다', 긴장: '과신해서 무리한 규모로 밀어붙인다', 융합: '도전 자체가 연료인 사람' },
  '화성-토성':    { 조화: '끈질기게 밀어붙여 결과를 낸다', 긴장: '하고 싶은데 브레이크가 걸린다. 참다가 한 번에 터진다', 융합: '욕망을 억누르며 사는 사람' },
  '화성-천왕성':  { 조화: '순간적 판단으로 판을 뒤집는 힘', 긴장: '충동적으로 던지고 수습을 나중에 한다. 한번 정하면 뒤돌아보지 않는다', 융합: '예측 불가능한 추진력' },
  '화성-해왕성':  { 조화: '싸우지 않고 흐름으로 이기는 방식', 긴장: '방향을 못 잡아 힘이 새어나간다. 시작은 뜨겁고 끝이 흐리다', 융합: '이상을 위해서만 움직이는 사람' },
  '화성-명왕성':  { 조화: '한번 정하면 끝을 보는 폭발적 추진력', 긴장: '관계의 온도가 극단적이다. 격렬하게 타오르다 파괴적으로 끝난다', 융합: '집념이 무섭게 강하다' },
  '화성-상승점':  { 조화: '행동으로 존재를 증명하는 사람', 긴장: '실제보다 공격적으로 보여 불필요한 마찰이 생긴다', 융합: '기세가 먼저 도착하는 사람' },
  // ── 목성·토성 계열 ─────────────────────────────────────────
  '목성-토성':    { 조화: '꿈을 현실로 착륙시키는 균형 감각', 긴장: '벌리려는 힘과 조이려는 힘이 부딪쳐 확장 타이밍을 놓친다', 융합: '크게 벌리되 반드시 계산하고 움직인다' },
  '목성-천왕성':  { 조화: '남보다 먼저 기회를 알아채는 감각', 긴장: '갑작스러운 기회에 뛰어들다 뒤통수를 맞는다', 융합: '판이 바뀌는 순간에 크게 먹는 사람' },
  '목성-해왕성':  { 조화: '사람의 마음을 모으는 이상과 명분', 긴장: '희망적으로만 보고 실체를 확인하지 않는다', 융합: '믿음의 힘으로 사는 사람' },
  '목성-명왕성':  { 조화: '한 분야를 끝까지 파서 권위를 얻는다', 긴장: '영향력에 대한 욕심이 관계를 압박한다', 융합: '규모를 근본부터 바꿔버리는 힘' },
  '목성-상승점':  { 조화: '넉넉하고 신뢰감 있는 첫인상', 긴장: '실제보다 여유 있어 보여 부탁이 몰린다', 융합: '함께 있으면 기분이 풀리는 사람' },
  '토성-천왕성':  { 조화: '전통과 혁신을 동시에 다룰 줄 안다', 긴장: '지켜야 한다는 압박과 벗어나고 싶은 충동이 계속 충돌한다', 융합: '규칙을 알면서 규칙을 바꾸는 사람' },
  '토성-해왕성':  { 조화: '이상을 구조로 만들어내는 능력', 긴장: '현실의 벽 앞에서 꿈을 포기해온 이력이 있다', 융합: '고독을 견디며 무언가를 완성하는 사람' },
  '토성-명왕성':  { 조화: '고통을 견뎌 실력으로 바꾸는 지구력', 긴장: '한번 무너진 경험이 두려움으로 남아 새 시작을 미룬다', 융합: '밑바닥에서 다시 쌓아 올린 이력이 있다' },
  '토성-상승점':  { 조화: '진중하고 믿음직한 인상', 긴장: '실제보다 차갑고 어렵게 보여 사람이 먼저 다가오지 않는다', 융합: '어릴 때부터 나이 들어 보인다는 말을 들어왔다' },
  // ── 세대행성-상승점 (하우스와 함께 쓸 때만 유의미) ────────────
  '천왕성-상승점': { 조화: '남과 다른 개성이 매력으로 읽힌다', 긴장: '어디에도 완전히 속하지 못한다는 느낌을 오래 안고 살았다', 융합: '첫인상부터 독특하다는 말을 듣는다' },
  '해왕성-상승점': { 조화: '분위기로 사람을 끌어당긴다', 긴장: '남들이 나를 멋대로 해석하고 나도 나를 잘 모른다', 융합: '실체보다 이미지가 먼저 전달되는 사람' },
  '명왕성-상승점': { 조화: '존재만으로 상황의 무게를 바꾼다', 긴장: '만만하게 보이지 않아 오해와 견제를 받아왔다', 융합: '눈빛에 밀도가 있어 처음 본 사람도 함부로 못 한다' }
};

const NODE_MEANING = {
  '양자리': { south: '남을 위해 자신을 지우고 맞춰주는 삶', north: '내 뜻대로 결단하고 앞장서는 용기' },
  '황소자리': { south: '남의 자원과 감정에 얽혀 소모되는 삶', north: '내 힘으로 안정과 가치를 쌓는 뚝심' },
  '쌍둥이자리': { south: '큰 신념에만 기대어 세부를 놓치는 삶', north: '눈앞의 사람과 소통하고 배우는 유연함' },
  '게자리': { south: '성취와 지위에만 매달려 자신을 몰아붙인 삶', north: '감정을 돌보고 진짜 내 편을 만드는 것' },
  '사자자리': { south: '집단과 이상 뒤에 숨어 나를 드러내지 않은 삶', north: '나 자신으로 당당히 빛나고 사랑받는 것' },
  '처녀자리': { south: '희생과 환상에 빠져 현실을 놓친 삶', north: '성실한 실천과 구체적 쓸모로 세상에 기여' },
  '천칭자리': { south: '혼자 다 짊어지고 독립만 고집한 삶', north: '기대고 협력하며 진짜 관계를 맺는 것' },
  '전갈자리': { south: '안전한 것만 붙잡고 변화를 피한 삶', north: '깊이 파고들고 함께 변화를 감당하는 용기' },
  '사수자리': { south: '눈앞의 정보와 잡담에 흩어진 삶', north: '더 큰 의미와 진리를 향해 나아가는 것' },
  '염소자리': { south: '가족과 안전지대에 머물러 안주한 삶', north: '세상에 나가 내 이름으로 성취하는 것' },
  '물병자리': { south: '주목받고 인정받는 데 집착한 삶', north: '나를 넘어 더 큰 공동체에 기여하는 것' },
  '물고기자리': { south: '통제와 완벽주의로 자신을 옥죈 삶', north: '내려놓고 흐름을 믿으며 연민을 배우는 것' }
};

// ============================================================================
//  🧮 천문 계산 — 상승점·천정은 로컬 정밀 산출
// ----------------------------------------------------------------------------
//  ▣ 검증 결과 (2021-07-05 19:58 AEST 시드니 출생, Swiss Ephemeris 대조)
//     상승점 오차 0.008도 · 천정 0.002도 · 천왕성 0.029도 · 해왕성 0.025도 · 명왕성 0.017도
//     → 전부 2분(arcmin) 이내. 도·분 표기를 해도 되는 정밀도다.
//  ▣ 카이런은 궤도 교란이 심해 단일 궤도요소로 시점별 3도까지 벌어진다 → 명세표 제외.
// ============================================================================
const RAD = Math.PI / 180;
const norm360 = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * RAD);
const cosd = x => Math.cos(x * RAD);
const tand = x => Math.tan(x * RAD);

function angleDiff(a, b) {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}
const toJD = iso => new Date(iso).getTime() / 86400000 + 2440587.5;
const d2000 = iso => toJD(iso) - 2451543.5;

function obliquity(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return 23.439291 - 0.0130042 * T - 1.64e-7 * T * T + 5.04e-7 * T * T * T;
}
function gmst(jd) {
  const T = (jd - 2451545.0) / 36525.0;
  return norm360(280.46061837 + 360.98564736629 * (jd - 2451545.0) + 0.000387933 * T * T - (T * T * T) / 38710000);
}
const ramc = (jd, lonE) => norm360(gmst(jd) + lonE);

// 천정(MC):  tanλ = tanα / cosε
function calcMC(jd, lonE) {
  const a = ramc(jd, lonE), e = obliquity(jd);
  return norm360(Math.atan2(sind(a), cosd(a) * cosd(e)) / RAD);
}
// 상승점(ASC)
function calcASC(jd, lonE, lat) {
  const a = ramc(jd, lonE), e = obliquity(jd);
  return norm360(Math.atan2(-cosd(a), sind(a) * cosd(e) + tand(lat) * sind(e)) / RAD + 180);
}

function heliocentricXYZ(el) {
  const { N, i, w, a, e, M } = el;
  const eDeg = (180 / Math.PI) * e;
  let E = M + eDeg * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 12; k++) {
    const E0 = E;
    E = E0 - (E0 - eDeg * sind(E0) - M) / (1 - e * cosd(E0));
    if (Math.abs(E - E0) < 1e-10) break;
  }
  const xv = a * (cosd(E) - e), yv = a * Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD, r = Math.sqrt(xv * xv + yv * yv), vw = v + w;
  return { x: r * (cosd(N) * cosd(vw) - sind(N) * sind(vw) * cosd(i)),
           y: r * (sind(N) * cosd(vw) + cosd(N) * sind(vw) * cosd(i)) };
}
function sunGeoXY(d) {
  const M = norm360(356.0470 + 0.9856002585 * d);
  const w = 282.9404 + 4.70935e-5 * d, e = 0.016709 - 1.151e-9 * d;
  const E = M + (180 / Math.PI) * e * sind(M) * (1 + e * cosd(M));
  const xv = cosd(E) - e, yv = Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD, r = Math.sqrt(xv * xv + yv * yv);
  return { x: r * cosd(v + w), y: r * sind(v + w) };
}
function geoLon(el, d) {
  const h = heliocentricXYZ(el), s = sunGeoXY(d);
  return norm360(Math.atan2(h.y + s.y, h.x + s.x) / RAD);
}
function calcUranusLon(d) {
  const base = geoLon({ N:74.0005+1.3978e-5*d, i:0.7733+1.9e-8*d, w:96.6612+3.0565e-5*d,
    a:19.18171-1.55e-8*d, e:0.047318+7.45e-9*d, M:norm360(142.5905+0.011725806*d) }, d);
  // 목성·토성 섭동 보정 (없으면 2~3분 오차가 남는다)
  const Mj = norm360(19.8950 + 0.0830853001*d), Ms = norm360(316.9670 + 0.0334442282*d), Mu = norm360(142.5905 + 0.011725806*d);
  return norm360(base + 0.040*sind(Ms-2*Mu+6) + 0.035*sind(Ms-3*Mu+6) - 0.015*sind(Mj-Mu+20));
}
function calcNeptuneLon(d) {
  return geoLon({ N:131.7806+3.0173e-5*d, i:1.7700-2.55e-7*d, w:272.8461-6.027e-6*d,
    a:30.05826+3.313e-8*d, e:0.008606+2.15e-9*d, M:norm360(260.2471+0.005995147*d) }, d);
}
function calcPlutoLon(d) {
  const S = norm360(50.03+0.033459652*d), P = norm360(238.95+0.003968789*d);
  const lonecl = 238.9508 + 0.00400703*d
    - 19.799*sind(P) + 19.848*cosd(P) + 0.897*sind(2*P) - 4.956*cosd(2*P)
    + 0.610*sind(3*P) + 1.211*cosd(3*P) - 0.341*sind(4*P) - 0.190*cosd(4*P)
    + 0.128*sind(5*P) - 0.034*cosd(5*P) - 0.038*sind(6*P) + 0.031*cosd(6*P)
    + 0.020*sind(S-P) - 0.010*cosd(S-P);
  const latecl = -3.9082 - 5.453*sind(P) - 14.975*cosd(P) + 3.527*sind(2*P) + 1.673*cosd(2*P)
    - 1.051*sind(3*P) + 0.328*cosd(3*P) + 0.179*sind(4*P) - 0.292*cosd(4*P)
    + 0.019*sind(5*P) + 0.100*cosd(5*P) - 0.031*sind(6*P) + 0.026*cosd(6*P) + 0.011*cosd(S-P);
  const r = 40.72 + 6.68*sind(P) + 6.90*cosd(P) - 1.18*sind(2*P) - 0.03*cosd(2*P) + 0.15*sind(3*P) - 0.14*cosd(3*P);
  const xh = r*cosd(lonecl)*cosd(latecl), yh = r*sind(lonecl)*cosd(latecl);
  const s = sunGeoXY(d);
  return norm360(Math.atan2(yh + s.y, xh + s.x) / RAD);
}
function calcNorthNode(iso) {
  const T = (toJD(iso) - 2451545.0) / 36525.0;
  return norm360(125.04452 - 1934.136261*T + 0.0020708*T*T + (T*T*T)/450000);
}
function lahiriAyanamsa(iso) {
  const d = new Date(iso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000);
}

// 도·분 표기 (수동 리포트의 "물병자리 21°46′" 형식)
function dms(lon) {
  const l = norm360(lon), inSign = l % 30;
  let deg = Math.floor(inSign), min = Math.round((inSign - deg) * 60);
  if (min === 60) { deg += 1; min = 0; }
  return { sign: SIGNS_KR[Math.floor(l / 30)], text: deg + '°' + String(min).padStart(2, '0') + '′',
           deg: deg, min: min, abs: l };
}
// 홀사인 하우스
const wholeSignHouse = (lon, asc) =>
  ((Math.floor(norm360(lon)/30) - Math.floor(norm360(asc)/30)) % 12 + 12) % 12 + 1;

// 역행 판정 (하루 전 대비 황경 감소)
function isRetro(fn, d) {
  try { return angleDiff(fn(d), fn(d - 1)) > 0 && norm360(fn(d) - fn(d - 1)) > 180; }
  catch (e) { return false; }
}

const JUPITER_TABLE_START = { year: 2026, month: 8 };
const JUPITER_LON_TABLE = [126.96,133.7,139.59,144.32,146.79,146.44,143.35,139.75,137.23,137.49,140.41,145.13,151.2,157.84,164.27,170.28,174.81,177.31,176.9,174.08,170.18,167.79,168.03,170.79,175.57,181.59,187.99,194.6,200.38,204.96,207.28,206.89,203.95,200.22,197.76,197.94,200.73,205.53,211.39,218.07,224.54,230.57,235.17,237.39,237.11,234.33,230.5,228.06,228.19,231.01,235.72,241.9,248.52,255.37,261.56,265.92,268.66,268.61,265.9,262.17,259.5,259.53,262.23,267.17,273.31,280.36,287.44,293.49,298.64,301.6,301.9,299.51,295.63,292.76,292.59,295.31,300.16,306.66,313.91,320.52,327.3,332.71,336.34,337.28,335.32,331.47,328.28,327.59,329.89,334.74,341.23,347.82,355.28,2.1,8.1,12.22,13.94,12.61,9.06,5.35,4.03];

function idxToPeriod(startIdx, endIdx) {
  const sy = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + startIdx) / 12);
  const sm = ((JUPITER_TABLE_START.month - 1 + startIdx) % 12) + 1;
  const ey = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + endIdx) / 12);
  const em = ((JUPITER_TABLE_START.month - 1 + endIdx) % 12) + 1;
  if (sy === ey && sm === em) return sy + '년 ' + sm + '월';
  return (sy === ey)
    ? sy + '년 ' + sm + '월~' + em + '월'
    : sy + '년 ' + sm + '월 ~ ' + ey + '년 ' + em + '월';
}

function findJupiterTransitWindows(targetDeg, limit) {
  const aspects = [
    { name: '합 · 강력', angle: 0, orb: 6, minMonths: 1 },
    { name: '삼각 · 우호적', angle: 120, orb: 5, minMonths: 1 },
    { name: '삼각 · 우호적', angle: 240, orb: 5, minMonths: 1 },
    // 육각은 영향이 약하므로 2개월 이상 유지될 때만 채택 (스치듯 지나가는 1개월 구간 배제)
    { name: '육각 · 기회', angle: 60, orb: 4, minMonths: 2 },
    { name: '육각 · 기회', angle: 300, orb: 4, minMonths: 2 }
  ];
  const all = [];
  for (const asp of aspects) {
    let inWindow = false, windowStart = null;
    const push = end => {
      if (end - windowStart + 1 >= asp.minMonths) all.push({ start: windowStart, end: end, name: asp.name });
    };
    for (let i = 0; i < JUPITER_LON_TABLE.length; i++) {
      const within = angleDiff(JUPITER_LON_TABLE[i], targetDeg + asp.angle) <= asp.orb;
      if (within && !inWindow) { inWindow = true; windowStart = i; }
      if (!within && inWindow) { inWindow = false; push(i - 1); }
    }
    if (inWindow) push(JUPITER_LON_TABLE.length - 1);
  }
  if (all.length === 0) return null;
  all.sort((a, b) => a.start - b.start);
  return all.slice(0, limit || 3).map(w => idxToPeriod(w.start, w.end) + ' (목성 ' + w.name + ')');
}

// ============================================================================
//  📅 [수정 5] 인생 주기 실계산 — 연령대 점수표의 유일한 객관 근거
// ----------------------------------------------------------------------------
//  기존에는 AI가 연령대 점수를 사실상 감으로 매겼다. 근거가 0이니 부실했다.
//  토성/목성/천왕성 주기는 출생 시각만으로 정확히 계산 가능하므로,
//  '만 나이 + 실제 연도'로 환산해 프롬프트에 주입한다.
// ============================================================================
const LIFE_EVENTS = [
  { age: 7.36,  name: '토성 1차 스퀘어',    desc: '처음으로 세상의 규율과 벽을 체감한 시기' },
  { age: 11.86, name: '목성 1차 리턴',      desc: '세계관이 한 번 넓어지는 시기' },
  { age: 14.73, name: '토성 오포지션',      desc: '자아와 통제가 정면으로 부딪친 사춘기 위기' },
  { age: 22.09, name: '토성 2차 스퀘어',    desc: '사회로 나가며 현실의 무게를 처음 짊어진 시기' },
  { age: 23.72, name: '목성 2차 리턴',      desc: '진로와 세계가 크게 열리는 시기' },
  { age: 29.46, name: '★토성 1차 리턴',     desc: '인생 최대의 구조 재편. 가짜를 덜어내고 진짜 궤도로 들어서는 시기. 여기서의 선택이 40대까지 지배한다' },
  { age: 35.59, name: '목성 3차 리턴',      desc: '쌓아온 실력이 사회적 성과로 전환되는 시기' },
  { age: 36.82, name: '토성 3차 스퀘어',    desc: '지금까지 쌓은 것을 점검하고 구조조정하는 시기' },
  { age: 41.50, name: '천왕성 오포지션',    desc: '중년의 각성. 억눌러온 진짜 욕구가 터져나오는 시기 (개인차 39~44세)' },
  { age: 44.19, name: '토성 2차 오포지션',  desc: '커리어의 정점과 한계를 동시에 마주하는 시기' },
  { age: 47.45, name: '목성 4차 리턴',      desc: '영향력과 인맥이 최대로 확장되는 시기' },
  { age: 50.70, name: '카이런 리턴',        desc: '오래된 상처가 남을 치유하는 능력으로 전환되는 시기' },
  { age: 51.55, name: '토성 4차 스퀘어',    desc: '삶의 후반전 설계를 다시 짜는 시기' },
  { age: 58.91, name: '★토성 2차 리턴',     desc: '두 번째 인생 재편. 진짜 원하는 삶만 남기고 정리되는 시기' },
  { age: 59.31, name: '목성 5차 리턴',      desc: '지혜와 여유가 함께 도착하는 시기' },
  { age: 71.17, name: '목성 6차 리턴',      desc: '삶을 조망하고 나누는 시기' },
  { age: 83.03, name: '목성 7차 리턴',      desc: '삶의 결실을 거두는 시기' },
  { age: 88.37, name: '토성 3차 리턴',      desc: '삶을 완결하는 시기' }
];

function buildLifeCycles(dateStr) {
  try {
    const ds = String(dateStr).replace(/\./g, '-').split('-').map(Number);
    const by = ds[0];
    if (!by || by < 1900 || by > 2100) return null;
    const bm = ds[1] || 1, bd = ds[2] || 1;
    const birthMs = Date.UTC(by, bm - 1, bd);
    const YEAR_MS = 365.2425 * 86400000;
    const curAge = Math.floor((Date.now() - birthMs) / YEAR_MS);

    const ev = LIFE_EVENTS.map(e => {
      const at = new Date(birthMs + e.age * YEAR_MS);
      return {
        age: Math.round(e.age),
        year: at.getUTCFullYear(),
        name: e.name,
        desc: e.desc,
        past: at.getTime() < Date.now()
      };
    });

    const lines = [];
    lines.push('현재 만 나이: ' + curAge + '세 (' + by + '년생)');
    lines.push('※ 아래는 출생 시각으로부터 실제 계산된 주기다. 연령대 점수와 설명은 반드시 이 표를 근거로 매겨라. 지어내지 마라.');
    lines.push('');
    for (const e of ev) {
      lines.push('· 만 ' + e.age + '세 (' + e.year + '년) ' + e.name + (e.past ? ' [이미 지남]' : ' [앞으로]') + ' — ' + e.desc);
    }
    lines.push('');
    lines.push('[연령대별 배치 — 점수표 작성 시 이 구간에 무엇이 걸리는지 그대로 반영하라]');
    for (const dec of [10, 20, 30, 40, 50, 60, 70, 80]) {
      const inRange = ev.filter(e => e.age >= dec && e.age < dec + 10);
      const y1 = by + dec, y2 = by + dec + 9;
      const tag = (curAge >= dec + 10) ? '이미 지난 시기' : (curAge >= dec ? '★지금 이 구간' : '앞으로 올 시기');
      const names = inRange.length ? inRange.map(e => e.name + '(' + e.year + '년)').join(', ') : '주요 주기 없음 — 앞 구간의 흐름이 이어지는 안정 구간';
      lines.push(dec + '대(' + y1 + '~' + y2 + '년, ' + tag + '): ' + names);
    }
    return lines.join('\n');
  } catch (e) {
    console.log('⚠️ 인생 주기 계산 실패:', e.message);
    return null;
  }
}


// ============================================================================
//  🔬 차트 분석 — 다이제스트 + 명세표 + 방법론 + 통계
// ----------------------------------------------------------------------------
//  반환:
//   digest      AI에게 줄 한국어 요약 (해석 재료)
//   core        중심 서사 앵커 (두 번의 호출에 동일하게 주입 → 이야기 갈라짐 방지)
//   table       출생 천체 명세표 (서버 계산 → 할루시네이션 0). 프론트가 그대로 렌더
//   methodNote  "이 차트를 어떻게 계산했는가" 문단 (서버 생성)
//   stats       원소·성질 통계 문장
// ============================================================================
function analyzeChart(data, iso, loc, tzLabel, cityResolved) {
  try {
    const jd = toJD(iso), dd = d2000(iso);
    const ay = lahiriAyanamsa(iso);
    const planets = {}, retro = {};

    // ── 1) Prokerala의 고전 7행성 (사이더리얼 → 트로피컬 보정) ──
    const list = (data && (data.planet_position || data.planet_positions)) || [];
    for (const p of list) {
      const kr = PLANET_KR[p.name];
      if (!kr || typeof p.longitude !== 'number') continue;
      planets[kr] = norm360(p.longitude + ay);
      retro[kr] = !!(p.is_retrograde || p.isRetrograde || p.retrograde);
    }

    // ── 2) 상승점·천정은 로컬 정밀 계산 (Prokerala 값보다 정확) ──
    const ascLon = calcASC(jd, loc.lon, loc.lat);
    const mcLon = calcMC(jd, loc.lon);
    planets['상승점'] = ascLon;

    // ── 3) 외행성 (Prokerala가 안 주면 로컬) ──
    const localOuter = [];
    if (planets['천왕성'] === undefined) { planets['천왕성'] = calcUranusLon(dd); retro['천왕성'] = isRetro(calcUranusLon, dd); localOuter.push('천왕성'); }
    if (planets['해왕성'] === undefined) { planets['해왕성'] = calcNeptuneLon(dd); retro['해왕성'] = isRetro(calcNeptuneLon, dd); localOuter.push('해왕성'); }
    if (planets['명왕성'] === undefined) { planets['명왕성'] = calcPlutoLon(dd); retro['명왕성'] = isRetro(calcPlutoLon, dd); localOuter.push('명왕성'); }
    if (localOuter.length) console.log('🪐 외행성 자체 계산: ' + localOuter.join(', '));

    if (!planets['태양'] || !planets['달']) {
      console.error('⚠️ 태양/달 좌표 없음 — Prokerala 응답 확인 필요');
      return { digest: null, core: null, table: null, methodNote: null, stats: null };
    }

    const nnLon = calcNorthNode(iso);
    const lines = [], houseMap = {}, houseOf = {};

    // ── 4) 명세표 (프론트가 그대로 렌더 · AI를 거치지 않음) ──
    const table = [];
    function row(name, lon, opts) {
      opts = opts || {};
      const s = dms(lon);
      const h = wholeSignHouse(lon, ascLon);
      const dig = opts.noDignity ? null : dignityOf(name, s.sign);
      table.push({
        name: name, glyph: PLANET_GLYPH[name] || '✦', sign: s.sign, signGlyph: SIGN_GLYPH[s.sign],
        deg: s.text, house: h, houseName: HOUSE_MEANING[h],
        retro: !!opts.retro, dignity: dig ? dig.tag : null, role: opts.role || null
      });
      return { s: s, h: h, dig: dig };
    }

    const ascRow = row('상승점', ascLon, { noDignity: true, role: '모든 해석의 첫 단추' });
    for (const n of PLANET_ORDER) {
      if (planets[n] === undefined) continue;
      const r = row(n, planets[n], { retro: retro[n] });
      houseOf[n] = r.h;
      houseMap[r.h] = houseMap[r.h] || [];
      houseMap[r.h].push(n);
    }
    row('천정', mcLon, { noDignity: true, role: '사회적 정점이 향하는 방향' });
    const nnRow = row('노스노드', nnLon, { noDignity: true, role: '이번 생의 방향' });
    const snRow = row('사우스노드', nnLon + 180, { noDignity: true, role: '전생에 통달한 것' });

    // ── 5) 원소·성질 통계 (수동 리포트의 "고정성 행성 다섯 개") ──
    const bodies = PLANET_ORDER.filter(n => planets[n] !== undefined).concat(['상승점']);
    const eCount = {}, mCount = {};
    for (const n of bodies) {
      const sg = dms(planets[n]).sign;
      for (const k in ELEMENT) if (ELEMENT[k].indexOf(sg) >= 0) eCount[k] = (eCount[k] || 0) + 1;
      for (const k in MODALITY) if (MODALITY[k].indexOf(sg) >= 0) mCount[k] = (mCount[k] || 0) + 1;
    }
    const topE = Object.keys(eCount).sort((a, b) => eCount[b] - eCount[a])[0];
    const topM = Object.keys(mCount).sort((a, b) => mCount[b] - mCount[a])[0];
    const lackE = ['불','흙','공기','물'].filter(k => !eCount[k] || eCount[k] <= 1);
    const stats =
      '원소 분포 — ' + ['불','흙','공기','물'].map(k => k + ' ' + (eCount[k] || 0) + '개').join(' / ') +
      '  ▸ 가장 강한 원소: ' + topE + '(' + eCount[topE] + '개, ' + ELEMENT_MEANING[topE] + ')' +
      (lackE.length ? '  ▸ 결핍: ' + lackE.join('·') + ' → 이 영역은 의식적으로 채워야 한다' : '') +
      '\n성질 분포 — ' + Object.keys(MODALITY).map(k => k.replace(/\(.*\)/, '') + ' ' + (mCount[k] || 0) + '개').join(' / ') +
      '  ▸ 가장 강한 성질: ' + topM + '(' + mCount[topM] + '개, ' + MODALITY_MEANING[topM] + ')';

    // ── 6) 계산 방법론 (서버 생성 · 손님에게 그대로 보여줄 문단) ──
    const isHighLat = Math.abs(loc.lat) > 40;
    // 🚨 출생지를 목록에서 못 찾아 서울 좌표로 대체된 경우, 정밀도를 주장하면 거짓말이 된다.
    //    그때는 좌표 문장을 빼고 정직하게만 쓴다.
    const methodNote =
      (cityResolved
        ? '이 차트는 출생지 현지 시간대(' + (tzLabel || 'Asia/Seoul · UTC+09:00') + ')를 그대로 적용해 계산했습니다. ' +
          '<b>상승점과 천정(MC)은 출생지 좌표(위도 ' + loc.lat.toFixed(2) + '° · 경도 ' + loc.lon.toFixed(2) + '°)와 ' +
          '출생 순간의 지방 항성시로 직접 산출</b>했으며, 실제 천문 계산값과 1분(arcmin) 이내로 일치합니다. '
        : '이 차트는 출생 시각의 시간대(' + (tzLabel || 'Asia/Seoul') + ')를 적용해 계산했습니다. ' +
          '다만 선택하신 출생지의 정밀 좌표가 확인되지 않아 <b>상승점과 하우스는 근사치</b>입니다. ' +
          '정확한 출생지를 알려주시면 다시 계산해 드립니다. ') +
      '별자리 좌표는 베딕식 환산이 아닌 <b>서양 점성술의 트로피컬 기준</b>입니다.<br><br>' +
      '하우스는 <b>홀사인(Whole Sign) 체계</b>를 씁니다. ' +
      (isHighLat
        ? '위도 ' + Math.abs(loc.lat).toFixed(0) + '도는 상당히 높은 편이어서, 플라시더스 같은 현대 체계에서는 하우스 크기가 심하게 뒤틀려 경계에 놓인 행성이 실제와 다른 방에 배정되는 일이 잦습니다. 홀사인은 위도의 영향을 받지 않아 이 출생지에서 가장 어긋남이 없는 기준입니다.'
        : '경계 근처의 행성이 옆방으로 잘못 넘어가는 문제가 없어, 어느 행성이 어느 방에 있는지가 흔들리지 않습니다.') +
      ' 다른 곳에서 본 리딩과 하우스가 한 칸 다르게 나왔다면, 대개 이 체계 차이 때문입니다.';

    // ── 7) 다이제스트 (AI용 해석 재료) ──
    lines.push('[정밀 좌표 · 도·분 단위. 본문에 인용할 때 이 표기를 그대로 쓸 것]');
    for (const t of table) {
      lines.push('· ' + t.name + ': ' + t.sign + ' ' + t.deg + ' / ' + t.house + '하우스(' + t.houseName + ')' +
        (t.retro ? ' [역행]' : '') + (t.dignity ? ' 【' + t.dignity + '】' : '') + (t.role ? ' — ' + t.role : ''));
    }
    lines.push('');
    lines.push('[원소·성질 통계 — 반드시 본문에 최소 1회 숫자로 인용하라]');
    lines.push(stats);

    // 세대행성 규칙
    lines.push('');
    lines.push('🚨[세대행성] 천왕성·해왕성·명왕성은 한 별자리에 7~20년 머물러 같은 세대 전체가 동일하다.');
    lines.push('   "명왕성이 전갈자리라 ~합니다" 같은 사인 단독 인용은 또래 수천만 명에게 해당되는 일반론 → 절대 금지.');
    lines.push('   이 셋은 ①하우스 위치 ②개인행성(태양·달·수성·금성·화성·상승점)과의 각도, 이 둘만 근거로 써라.');

    // 목성 트랜짓 3축
    const axes = [
      { key: '인연·결혼(7하우스 축)', target: norm360(ascLon + 180), limit: 3 },
      { key: '커리어·사회적 성취(천정 축)', target: mcLon, limit: 2 },
      { key: '재물·수입(2하우스 축)', target: norm360(ascLon + 30), limit: 2 }
    ];
    const blocks = [];
    for (const ax of axes) {
      const w = (findJupiterTransitWindows(ax.target, ax.limit) || [])
        .filter(x => typeof x === 'string' && x && x.indexOf('undefined') === -1);
      if (w.length) blocks.push('· [' + ax.key + '] ' + w.join(' / '));
    }
    lines.push('');
    if (blocks.length) {
      lines.push('[🪐 실제 계산된 목성 트랜짓 — 시기는 이 값만 쓸 것. 임의의 연도로 바꾸면 치명적 실패]');
      blocks.forEach(b => lines.push(b));
    } else {
      lines.push('[🪐 계산 결과] 향후 8년간(~2034년) 목성이 주요 축과 뚜렷한 각을 맺는 시기가 없다.');
      lines.push('   시기를 단정하지 말고 "특정 시기를 기다릴 때가 아니라 태도와 자리를 넓힐 때"라고 정직하게 안내하라.');
    }

    // 특이 배치
    const highlights = [];
    for (const h of Object.keys(houseMap)) {
      const ps = houseMap[h];
      if (ps.length >= 3) highlights.push('【스텔리움】 ' + h + '하우스(' + HOUSE_MEANING[h] + ')에 ' + ps.join('·') + ' ' + ps.length + '개 집중 → 인생의 최대 화두. 아무나 가질 수 없는 배치다.');
      else if (ps.length === 2) highlights.push('【집중】 ' + h + '하우스(' + HOUSE_MEANING[h] + ')에 ' + ps.join('·') + ' 2개.');
    }
    for (const t of table) {
      // 🚨 세대행성의 품위는 또래 전체가 동일하다(1984~95년생은 전부 명왕성 전갈=제 집).
      //    명세표에는 사실이니 그대로 두되, AI의 개인화 근거로는 쓰지 않는다.
      if (OUTER.indexOf(t.name) >= 0) continue;
      if (t.dignity && t.dignity.indexOf('지배') === 0) highlights.push('【품위】 ' + t.name + '이 ' + t.sign + '에서 제 집에 있다 → 이 행성의 능력이 온전히 발휘된다. 강점 서술의 1순위 근거.');
      if (t.dignity && t.dignity.indexOf('고양') === 0) highlights.push('【품위】 ' + t.name + '이 ' + t.sign + '에서 고양 → 타고난 축복. 아무나 못 가진 자리다.');
      if (t.dignity && (t.dignity.indexOf('함몰') === 0 || t.dignity.indexOf('추락') === 0)) highlights.push('【품위】 ' + t.name + '이 ' + t.sign + '에서 ' + t.dignity.split(' ')[0] + ' → 이 영역에서 유독 애를 써야 했다. 그래서 남보다 깊어진 자리로 뒤집어라.');
    }
    if (houseMap[7]) highlights.push('【배우자궁】 7하우스에 ' + houseMap[7].join('·') + ' → 관계 해석의 결정적 단서.');
    if (houseMap[12]) highlights.push('【숨겨진 상처】 12하우스에 ' + houseMap[12].join('·') + ' → 남에게 말 못 한 감정. 짚으면 소름 돋는다.');
    if (houseMap[4]) highlights.push('【부모·뿌리】 4하우스에 ' + houseMap[4].join('·') + ' → 가정환경이 성격 형성에 결정적이었다.');
    if (houseMap[8]) highlights.push('【깊은 결속】 8하우스에 ' + houseMap[8].join('·') + ' → 얕은 관계로 만족 못 한다. 타인의 자본·투자·중개 재능.');
    if (houseMap[11]) highlights.push('【인맥】 11하우스에 ' + houseMap[11].join('·') + ' → 모임·네트워크가 인생의 큰 축.');
    if (houseMap[1]) highlights.push('【강한 자아】 1하우스에 ' + houseMap[1].join('·') + ' → 존재감이 강하고 첫인상이 뚜렷하다.');
    if (houseMap[6]) highlights.push('【일상·건강】 6하우스에 ' + houseMap[6].join('·') + ' → 일하는 방식과 몸 상태가 삶의 질을 좌우한다.');
    // 노드와 행성의 겹침 (수동 샘플의 결정적 장치)
    for (const n of PLANET_ORDER) {
      if (planets[n] === undefined) continue;
      if (angleDiff(planets[n], nnLon) <= 6)
        highlights.push('【겹침 · 매우 중요】 ' + n + '이 노스노드와 ' + angleDiff(planets[n], nnLon).toFixed(1) + '도 이내로 겹친다 → 이 행성의 재능을 키우는 일이 곧 이번 생의 과제다. 리포트를 하나로 봉합하는 결정적 단서.');
      if (angleDiff(planets[n], mcLon) <= 5)
        highlights.push('【천정 합】 ' + n + '이 천정(MC)과 ' + angleDiff(planets[n], mcLon).toFixed(1) + '도로 겹친다 → 이 행성의 성질이 곧 사회적 얼굴이 된다. 직업 해석의 1순위.');
    }

    // 애스펙트
    const weightOf = n => (PERSONAL.indexOf(n) >= 0 ? 3 : (SOCIAL.indexOf(n) >= 0 ? 2 : 1));
    const raw = [], pnames = Object.keys(planets);
    for (let i = 0; i < pnames.length; i++) {
      for (let j = i + 1; j < pnames.length; j++) {
        const a = pnames[i], b = pnames[j];
        if (OUTER.indexOf(a) >= 0 && OUTER.indexOf(b) >= 0) continue;
        const diff = angleDiff(planets[a], planets[b]);
        for (const asp of ASPECTS) {
          const orbErr = Math.abs(diff - asp.ang);
          if (orbErr <= asp.orb) {
            const key = PAIR_MEANING[a + '-' + b] ? a + '-' + b : (PAIR_MEANING[b + '-' + a] ? b + '-' + a : null);
            if (key && PAIR_MEANING[key][asp.tone]) {
              raw.push({ score: weightOf(a) + weightOf(b), orbErr: orbErr,
                text: '【각도】 ' + key.replace('-', '과 ') + ' ' + asp.name + '(' + asp.ang + '도, 오차 ' + orbErr.toFixed(1) + '도, ' + asp.tone + ') → ' + PAIR_MEANING[key][asp.tone] });
            }
            break;
          }
        }
      }
    }
    raw.sort((x, y) => (y.score - x.score) || (x.orbErr - y.orbErr));
    const aspectLines = raw.slice(0, 10).map(r => r.text);
    if (aspectLines.length) {
      highlights.push('--- 아래는 행성 간 각도다. 가장 정밀한 근거이니 최소 2개를 본문에 녹이고, 인용할 때 오차 도수까지 함께 써라 ---');
      aspectLines.forEach(l => highlights.push(l));
    }
    if (highlights.length) {
      lines.push('');
      lines.push('[🔬 이 사람만의 특이 배치 — 중심 스토리로 반드시 활용하라]');
      highlights.forEach(h => lines.push(h));
    }

    // 달의 교점
    const meaning = NODE_MEANING[nnRow.s.sign];
    lines.push('');
    lines.push('[🔮 전생과 영혼의 과제 — 달의 교점]');
    lines.push('사우스노드(전생에 통달한 것): ' + snRow.s.sign + ' ' + snRow.s.text + ' / ' + snRow.h + '하우스(' + HOUSE_MEANING[snRow.h] + ')');
    lines.push('노스노드(이번 생의 과제): ' + nnRow.s.sign + ' ' + nnRow.s.text + ' / ' + nnRow.h + '하우스(' + HOUSE_MEANING[nnRow.h] + ')');
    if (meaning) {
      lines.push('→ 전생의 익숙한 패턴: ' + meaning.south);
      lines.push('→ 이번 생에 배워야 할 것: ' + meaning.north);
    }

    // 사인 경계 경고 — 경계 1도 이내면 출생시각 오차에 별자리가 뒤집힐 수 있다
    const nearCusp = table.filter(t => {
      const inSign = ((t.deg.match(/^(\d+)/) || [0, 0])[1] | 0) + (((t.deg.match(/°(\d+)/) || [0, 0])[1] | 0) / 60);
      return inSign < 1 || inSign > 29;
    });
    if (nearCusp.length) {
      console.warn('⚠️ 사인 경계 1도 이내: ' + nearCusp.map(t => t.name + '(' + t.sign + ' ' + t.deg + ')').join(', '));
      lines.push('');
      lines.push('⚠️[경계 주의] ' + nearCusp.map(t => t.name).join('·') + '은 별자리 경계에서 1도 이내다. 출생시각이 조금만 달라도 옆 별자리로 넘어간다. 이 천체를 해석의 핵심 근거로 삼지 말고, 다른 배치를 중심으로 써라.');
    }

    return {
      digest: lines.join('\n'),
      core: pickCoreNarrative({ planets: planets, houseMap: houseMap, houseOf: houseOf, aspectLines: aspectLines, table: table }),
      table: table, methodNote: methodNote, stats: stats
    };
  } catch (e) {
    console.error('⚠️ analyzeChart 실패:', e.message, e.stack);
    return { digest: null, core: null, table: null, methodNote: null, stats: null };
  }
}

// 중심 서사 앵커 — 호출을 둘로 쪼개도 이야기가 갈라지지 않게 서버가 하나로 고정한다
function pickCoreNarrative(ctx) {
  const { planets, houseMap, houseOf, aspectLines, table } = ctx;
  const pick = t => '이 리포트 전체를 관통하는 중심 배치는 【' + t + '】다. 네 챕터 모두 이 배치에서 출발해, ' +
    '그것이 상처였다가 재능이 되고 결국 이번 생의 과제로 이어지는 하나의 이야기로 써라. 챕터마다 다른 배치를 중심으로 삼지 마라.';

  const nodeConj = (aspectLines || []).length ? null : null;
  void nodeConj;

  const ms = (aspectLines || []).find(l => l.indexOf('달과 토성') >= 0);
  if (ms) return pick('달과 토성의 각 — 감정을 드러내지 않고 혼자 감당해온 구조') + '\n(근거: ' + ms + ')';
  const ss = (aspectLines || []).find(l => l.indexOf('태양과 토성') >= 0);
  if (ss) return pick('태양과 토성의 각 — 늘 부족하다 느끼며 스스로를 몰아붙여온 구조') + '\n(근거: ' + ss + ')';

  const exalt = (table || []).find(t => t.dignity && t.dignity.indexOf('고양') === 0);
  if (exalt) return pick(exalt.name + '이 ' + exalt.sign + '에서 고양 — 타고난 축복이 ' + exalt.house + '하우스(' + exalt.houseName + ')에서 발휘되는 구조');

  for (const h of [12, 8]) {
    const ps = (houseMap[h] || []).filter(n => PERSONAL.indexOf(n) >= 0);
    if (ps.length) return pick(h + '하우스(' + HOUSE_MEANING[h] + ')의 ' + ps.join('·'));
  }
  for (const h of Object.keys(houseMap)) {
    if (houseMap[h].length >= 3) return pick(h + '하우스(' + HOUSE_MEANING[h] + ')의 스텔리움 — ' + houseMap[h].join('·'));
  }
  if (planets['토성'] !== undefined && houseOf['토성'])
    return pick('토성이 자리한 ' + houseOf['토성'] + '하우스(' + HOUSE_MEANING[houseOf['토성']] + ') — 반복해 벽을 만나며 단단해진 구조');
  return pick('달이 자리한 ' + dms(planets['달']).sign + (houseOf['달'] ? ' ' + houseOf['달'] + '하우스' : '') + ' — 감정의 근본 구조');
}

// ============================================================================
//  ✍️ 프롬프트 — 공통부
// ----------------------------------------------------------------------------
//  설계 원칙
//  1. 상세페이지(product_no=11)에서 약속한 항목과 1:1 대응. 약속 불이행 = 환불 사유.
//  2. 자수 기준은 JSON 필드 스펙에만 적는다 (단일 출처).
//  3. 'AI 냄새' 어휘를 블랙리스트로 차단. 이게 수동 리포트와의 가장 큰 체감 차이다.
//  4. 소제목은 라벨형(【타고난 것】)이 아니라 서술형 문장으로. 대신 상세페이지
//     약속 키워드를 본문에 그대로 등장시켜 손님이 "내가 산 그것"을 알아보게 한다.
// ============================================================================
function buildCommonPrompt(v) {
  return `
[화자 설정 — 이 목소리로만 써라]
너는 명리학(사주)을 이십 년 공부한 뒤 서양 점성술로 옮겨온 상담가다. 이과 출신이라 근거 없는 말을 싫어한다.
계산된 것만 말하고, 계산되지 않은 것은 말하지 않는다. 손님을 위로하려 들지 않는다. 다정하지만 단호하다.
지금 네 앞에 ${v.name}님이 앉아 있다. 29,900원을 낸 손님이다. 다 읽고 "누군가 드디어 내 인생을 제대로 봤다"고 느끼게 만드는 것이 네 일이다.

[🚨 시간 기준]
오늘은 ${v.todayStr}이다. 학습 데이터 기준 연도가 아니라 이 날짜가 현재다.
${v.ageLine}
미래 시기는 반드시 오늘 이후의 연·월로만 써라. 이미 지난 시기를 미래로 쓰면 치명적 실패다.

[🚫 절대 금지 어휘 — 하나라도 쓰면 실패]
① 유사영성 상투어: 우주가 당신에게, 에너지, 파동, 진동, 기운이 흐르다, 빛과 어둠, 신성한, 고귀한 영혼
② AI 접속어: 결국, 즉, 다시 말해, 요약하면, 살펴보겠습니다, ~라는 점입니다, ~에 대해 말씀드리자면, 이는 ~을 의미합니다, ~라고 할 수 있습니다
③ 하나마나한 덕담: 긍정적으로 생각하세요, 자신을 사랑하세요, 있는 그대로의 당신, 완벽한 사람은 없습니다, 시간이 해결해줍니다
④ 발뺌 화법: ~한 느낌도 있습니다, ~한 면이 있으신 것 같아요, ~할 수도 있어요, 아마 ~일지도, 경우에 따라
⑤ 연민: 얼마나 힘드셨어요, 안타깝네요, 가여운, 마음이 아프네요
발뺌 대신 "~한 편입니다" 또는 단정을 써라. 이게 이 리포트의 기본 화법이다.

[✍️ 문장 리듬 — AI는 문장 길이가 균일해서 티가 난다]
· 각 단락에 15자 이내의 짧은 단정문을 최소 하나 넣어라. (예: "그건 성격이 아닙니다.")
· 40자 넘는 문장이 연속 세 개 이상 나오면 실패다.
· 단락 길이도 들쭉날쭉하게. 두 줄 단락과 여덟 줄 단락을 섞어라.

[📌 소제목 규격]
소제목은 라벨이 아니라 문장으로 써라. <b>【타고난 것】</b>(X) → <b>애어른의 별을 달고 태어났습니다</b>(O)
형식: <b>소제목 문장</b> 으로 감싸고, 각 챕터에 지정된 개수만큼 쓴다.

[🔬 차트 근거 인용 규격 — 이 리포트가 다른 곳과 다른 지점]
아래 좌표는 실제 천문 계산 결과다. 없는 배치를 지어내면 치명적 실패다.
1. 도·분 표기를 그대로 인용하라. "달이 황소자리에 있고"(X) → "<b>달이 황소자리 22°25′</b>에 있고"(O)
2. 각도를 인용할 때는 오차 도수까지 함께 써라. "<b>달과 상승점이 정확히 90도, 오차 0.7도로 맞물려 있습니다.</b>"
3. 품위(지배·고양·함몰·추락)가 표시된 행성이 있으면 최소 하나를 근거로 써라. 쉬운 말로 풀어서:
   "수성이 쌍둥이자리에 있는데, 이건 수성이 가장 힘을 잘 쓰는 '제 집'입니다."
4. 원소·성질 통계를 최소 한 번 숫자로 인용하라. "<b>고정성 별자리에 행성이 다섯 개</b> 몰려 있습니다."
5. 근거는 챕터당 두세 개까지만 굵고 명확하게. 용어를 줄줄이 나열해 어렵게 만들지 마라.

[정밀 계산된 네이탈 차트]
${v.astro}

[손님 정보] 이름 ${v.name} / 성별 ${v.myGender || '미기재'} / 출생지 ${v.city} / 생년월일시 ${v.date} ${v.time}

[🎯 중심 서사 — 반드시 지켜라]
${v.core}

[🎬 장면 규격 — 추상적인 말이 이 리포트를 망친다]
패턴을 설명할 때는 반드시 눈에 보이는 장면으로 써라. 아래 중 세 개 이상을 넣어라.
① 시간·상황 (새벽 두 시, 회식 자리, 카톡 답장 전) ② 구체적 행동 (다 쓰고 지운다, 먼저 웃는다)
③ 상대의 반응 ④ 몸의 감각 (가슴이 조인다, 목이 막힌다) ⑤ 속으로 한 말 (따옴표로 직접 인용)
나쁜 예: "감정을 잘 표현하지 못합니다."
좋은 예: "새벽 두 시에 답장을 다 써놓고, 보내기 직전에 지웁니다. <b>괜히 부담될까 봐.</b>"

[🎯 과거 검증 문장 — CHAPTER 01에 반드시 하나]
아래 [인생 주기] 표에서 이미 지난 시기 하나를 골라, 특정 나이와 연도를 짚고 단정하라.
"<b>스물아홉, 2020년 무렵</b>에 그때까지의 관계나 일을 한 번 갈아엎으셨을 겁니다."
이게 맞으면 손님은 나머지 전부를 믿는다. 가장 강력한 장치다.

[🎯 반증 조건 — CHAPTER 01 또는 02 끝에 반드시 하나]
"만약 ~라면 이 해석은 ${v.name}님에게 안 맞습니다. 그때는 ~쪽을 보십시오."
스스로 틀릴 조건을 밝히는 리포트는 없다. 이 한 줄이 나머지 전부의 신뢰를 만든다.

[🎯 명리학 대비 — 리포트 전체에서 최대 두 번만]
사주 관점을 짧게 언급한 뒤 네이탈로 뒤집어라. 자랑이 아니라 왜 이 리포트가 다른지 보여주는 용도다.
"사주로 보면 이건 '토(土)가 강한 사람'으로 끝납니다. 네이탈 차트는 그게 <b>어느 방에서 벌어지는 일인지</b>까지 말해줍니다."
세 번 이상 쓰면 장사꾼처럼 보인다. 두 번 이하로 제한하라.

[🚨 감정 vs 연민 — 이 리포트의 심장]
감정을 정확히 읽는 것(공감)과 불쌍하게 여기는 것(연민)은 다르다.
공감(O): "힘들 때 아무에게도 기대지 못하고 혼자 삼켜왔습니다." → 마음을 읽어 문을 연다.
연민(X): "얼마나 힘드셨어요." → 손님을 약자로 만든다.
규칙: 감정을 읽어 문을 연 뒤, 반드시 그 상처를 강점으로 뒤집어 끝내라.
"늘 혼자 감당해왔습니다(공감) → 그건 약함이 아니라 아무나 못 가진 강인함입니다(반전)"
다 읽고 '위로받았다'가 아니라 '내가 이런 사람이었구나'라고 느끼게 하라.

[💪 강점은 확신 있게, 특이점은 콕 집어서]
· 강점은 "남들은 못 하는데 당신은 되는 것" 형태로 단정하라. 뭉뚱그린 칭찬은 실패다.
· 반드시 실제 배치에서 도출하라. 품위(제 집·고양) 행성, 스텔리움, 노드와 겹친 행성이 1순위 근거다.
· 이 사람만의 특이 배치를 최소 하나 골라 "이건 아무나 가질 수 없는 배치입니다"라고 못 박아라.

[🕳️ 성격의 그림자 — 신뢰도의 결정타]
칭찬만 있으면 '누구한테나 하는 말'로 읽혀 안 믿긴다. 뜨끔한 단점을 정확히 짚으면 앞의 칭찬까지 다 믿게 된다.
🚨 절대 모두에게 '급하다'고 쓰지 마라. 실제 배치에서 도출되는 것만 골라라.
화성 양자리·사자·1하우스 또는 불 원소 상승점 → 급함·욱함 / 수성 쌍둥이·사수·3하우스 → 산만함
수성·화성 처녀·염소 → 완벽주의로 미룸·잔소리 / 달·금성 게자리·물고기·12하우스 → 거절 못 함·혼자 삼킴
토성 1·10하우스 → 자기검열·경직 / 천칭·2하우스 → 우유부단 / 전갈·8하우스 → 의심 많음·속을 안 보임
명왕성이 개인행성과 긴장각 → 통제 욕구 / 천왕성 긴장각 → 싫증·이탈 / 해왕성 긴장각 → 회피·이상화
프레임: 그 기질이 준 강점을 먼저 인정한 뒤 "다만 그것 때문에 ~할 때가 있죠"로 짚어라. 기죽이지 말되 정확히 찔러라.

[출력 형식]
· 마크다운(*) 절대 금지. 단락 구분은 <br><br>.
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

· 각 필드에 적힌 최소 자수를 반드시 지켜라. 그 숫자가 유일한 기준이다.
· 순수 JSON 객체만 출력. 앞뒤에 아무것도 붙이지 마라.
`;
}

// ── 호출 A: CHAPTER 01 + 02 ────────────────────────────────
//    상세페이지 CHAPTER 01은 3개, CHAPTER 02는 4개 항목을 약속했다. 전부 이행한다.
function buildPromptA(v) {
  return buildCommonPrompt(v) + `
[출력 JSON — 아래 세 필드만]
{
  "core_sentence": "(30~45자) ${v.name}님의 인생을 한 문장으로 요약한 선언. 리포트 맨 위에 크게 박힌다. 중심 서사에서 뽑아내고, 뻔한 덕담이 아니라 읽는 순간 숨이 멎는 문장으로. 예: '당신의 서늘함은 차가움이 아니라, 너무 일찍 어른이 된 대가입니다.' <b> 태그 쓰지 말고 순수 텍스트로.",

  "vip_card1": "(최소 2400자) [CHAPTER 01. 왜 나는 항상 비슷한 곳에서 넘어지는가?]\\n\\n먼저 <p class='lead'>...</p> 로 2~3문장의 리드문을 써라. 이 챕터에서 무엇을 밝힐지 예고하되 결론은 아직 말하지 마라.\\n\\n그다음 아래 네 개의 소제목 단락을 순서대로. 각 단락 550자 이상. 소제목은 반드시 서술형 문장으로.\\n\\n【1. 내 삶을 갉아먹는 무의식의 방해 공작】 달·토성·12하우스 등 중심 배치를 도·분과 함께 밝히고, 그것이 준 '아무나 못 가진 능력'을 먼저 인정하라. 그다음 그 능력의 이면에 자리잡은 무의식적 불안·결핍의 정체를 콕 집어라 — 잘 살고 싶은 마음과 반대로 자꾸 스스로를 망치는 선택으로 몰아온 패턴을. 위 【각도】 항목 중 최소 하나를 오차 도수까지 인용하라. 그리고 이 단락 안에 <b>과거 검증 문장</b>을 반드시 하나 넣어라(특정 나이·연도 지목).\\n\\n【2. 상처가 만들어낸 가짜 방어기제】 🚨상세페이지에서 약속한 항목이다. 반드시 <b>'가짜 방어기제'</b>라는 표현을 본문에 그대로 쓰라. 타인의 시선이나 과거의 경험 때문에 억지로 만들어 입은 갑옷 — 그 갑옷의 정체를 밝혀라. 그리고 <b>그 갑옷이 ${v.name}님의 진짜 매력을 어떻게 가리고 있는지</b>를 구체적으로 짚어라. 사람들이 오해하는 모습 vs 실제 모습을 대비시켜라. 상승점·토성·12하우스 배치가 근거다. 여기서 반드시 장면 규격을 지켜 눈에 보이게 써라.\\n\\n【3. 인간관계와 돈이 새어나가는 진짜 이유】 🚨상세페이지 약속 항목이다. '운이 나빠서가 아니다'라는 전제로 시작하라. 차트 속 꼬여있는 심리적 패턴이 어떻게 <b>현실의 재정 누수</b>와 <b>악연</b>으로 이어지는지 그 경로를 단계적으로 보여줘라. 예: 거절을 못 함 → 부탁을 다 받음 → 돈과 시간이 새어나감 → 정작 내 일이 밀림. 2하우스·8하우스·11하우스·12하우스 배치와 금성·화성의 각도를 근거로. 돈이 새는 구체적 항목(빌려주고 못 받음, 체면 지출, 감정 소비, 손해 보는 계약 등) 중 이 차트에 맞는 것을 콕 집어라.\\n\\n【4. 뿌리와 열쇠】 이 패턴이 어디서 시작됐는지(4하우스=가정·부모, 12하우스=숨은 상처) 뿌리를 추적하고, 그것이 결함이 아니라 '너무 일찍 유능해진 대가'였음을 밝혀라. 그리고 그 힘이 앞으로 어떻게 무기가 되는지 방향을 제시하라.\\n\\n마지막은 <blockquote> 태그로 가슴을 관통하되 힘을 주는 한 문장. 연민 절대 금지.",

  "vip_card2": "(최소 3200자) [CHAPTER 02. 타고난 재능과, 내가 두각을 나타낼 자리]\\n\\n<p class='lead'>...</p> 리드문 2~3문장 먼저. 그다음 아래 여섯 항목을 순서대로, 각 500자 이상, 서술형 소제목을 달아서.\\n톤은 '당신은 이런 걸 타고난 사람'이라는 확신에 찬 선언이다. 겸손하게 굴리거나 발뺌하지 마라.\\n\\n【1. 가지고 태어난 재능 3가지】 🚨상세페이지 약속. 2하우스(재능·자산)·6하우스(일하는 방식)·10하우스(커리어)와 그 안의 행성, 그리고 품위(제 집·고양) 행성을 근거로 재능 세 가지를 콕 집어라. 추상어('창의적입니다') 금지. '남들은 못 하는데 당신은 되는 것' 형태로. 예: 남이 놓치는 미세한 흐름의 변화를 먼저 감지하는 촉 / 처음 만난 사람도 삼 분 만에 무장해제시키는 언어 / 모두가 포기한 뒤에도 혼자 남아 끝을 보는 집요함.\\n\\n【2. 두각을 나타낼 직군·업종 3가지】 🚨상세페이지가 '실명으로 제시'를 약속했다. 반드시 <b>구체적인 직군·업종 세 개를 실명으로</b> 써라. 예: 수익형 부동산·경매, 심리상담·코칭, 온라인 강의 콘텐츠, 브랜드 컨설팅, 데이터 분석, 세무·회계, 커머스 셀러, B2B 영업, 의료·재활, 교육 콘텐츠, 크리에이터. 오늘 당장 검색해서 알아볼 수 있는 수준으로. 각 직군마다 '이 차트의 어떤 배치 때문에 맞는지' 근거를 한 줄씩 붙여라. 그중 <b>1순위</b>를 못 박아라.\\n\\n【3. 조직인가 독립인가】 10하우스·천정(MC)·토성 위치를 근거로 조직에서 성장할 사람인지 독립해 자기 것을 세울 사람인지 단정하라. '둘 다 가능합니다' 금지. 독립이라면 언제가 적기인지 위 [목성 트랜짓]의 커리어 축 시기를 인용해 짚어라.\\n\\n【4. 나에게 맞는 돈 버는 방식】 🚨상세페이지 약속. 2하우스와 8하우스를 근거로, 네 유형 중 어디인지 단정하라 — 시간을 팔아 버는 사람(월급·수임) / 결과물을 팔아 버는 사람(제품·콘텐츠) / 남의 돈을 굴려 버는 사람(투자·중개) / 신뢰를 자본 삼아 버는 사람(브랜드·커뮤니티). 그리고 <b>절대 손대면 안 되는 방식</b>을 반드시 경고하라. 이것도 상세페이지 약속이다.\\n\\n【5. 재물이 불어나는 나만의 원리】 🚨상세페이지 약속. 목성(확장)과 토성(축적)의 위치·품위를 근거로 재물이 커지는 구조를 밝혀라. 한 방에 크게 버는 사람인지, 시간을 들여 복리로 쌓는 사람인지. 자산을 어떤 형태로 굴려야 하는지(부동산·현물·사업지분·현금흐름 중). 그리고 위 [목성 트랜짓]의 <b>재물·수입 축 시기를 그대로 인용</b>해 <b>부(富)의 크기와 실현 시점</b>을 못 박아라.\\n\\n【6. 몸과 일의 리듬】 6하우스·상승점·화성 배치를 근거로, 무리하면 가장 먼저 무너지는 지점과 성과가 최대로 나오는 일하는 방식(단기 집중형인지 장기 지속형인지, 혼자인지 팀인지)을 짚어라. 의학적 진단이 아니라 '체력과 집중의 리듬' 관점으로만.\\n\\n이 챕터 안 어딘가에 <b>반증 조건 문장</b>을 반드시 하나 넣어라(CHAPTER 01에 넣지 않았다면 여기에). 마지막은 '나도 할 수 있겠다'는 확신이 서도록 뜨겁게 마무리."
}
`;
}

// ── 호출 B: CHAPTER 03 + 04 + 봉합 + 점수표 ─────────────────
function buildPromptB(v) {
  return buildCommonPrompt(v) + `
[📅 인생 주기 실계산 — 연령대 점수표와 과거 검증의 유일한 근거]
${v.lifeCycles || '인생 주기 계산값이 없다. 이 경우 연령대 점수는 토성·목성의 하우스 배치만 근거로 매기고 특정 연도를 단정하지 마라.'}

[🚨 연령대별 점수 작성 규칙]
· 위 표를 근거로 삼아라. 토성 리턴·토성 스퀘어가 걸린 구간은 낮고(시련·재편), 목성 리턴이 걸린 구간은 높다(확장·기회). 표에 없는 연도를 지어내지 마라.
· 점수는 구간마다 뚜렷하게 갈라라. 최고와 최저가 20점 이상 차이 나야 한다. 전부 비슷하면 실패다.
· 각 설명에 그 구간에 실제로 걸리는 주기의 연도를 자연스럽게 녹여라. 단 '토성 리턴' 같은 용어는 쉬운 말로 풀어서.
· 이미 지난 구간은 "그때 이런 일이 있었을 겁니다"라고 과거를 짚어 맞혀라. 과거가 맞으면 미래 예측의 신뢰도가 폭발한다.
· best_age는 반드시 최고점을 매긴 구간과 정확히 일치해야 한다.

[출력 JSON — 아래 필드 전부]
{
  "vip_card3": "(최소 2400자) [CHAPTER 03. 언제, 어떻게 승부수를 띄울 것인가?]\\n\\n<p class='lead'>...</p> 리드문 2~3문장 먼저. 막연한 희망이 아니라 하늘에 적힌 일정표를 펼쳐 보이는 톤으로. 그다음 아래 세 항목, 각 700자 이상, 서술형 소제목.\\n\\n【1. 운이 뚫리는 골든 크로스 시기】 🚨상세페이지 약속. 반드시 <b>'골든 크로스'</b>라는 표현을 본문에 그대로 쓰라. 위 [🪐 실제 계산된 목성 트랜짓]의 세 축(인연·결혼 / 커리어·사회적 성취 / 재물·수입)을 <b>각각 모두</b> 그대로 인용하라. 절대로 임의의 연도로 바꾸지 마라. 왜 그 시기인지(목성이 그 축과 이루는 각도)를 짧게 설명하라. '뚜렷한 트랜짓이 없다'는 결과라면 정직하게 인정하고 시기보다 태도·행동에 집중하라고 안내하라. 시기 생략이나 임의 변경은 치명적 실패다.\\n\\n【2. 대운을 내 통장에 꽂아 넣는 행동 전략】 🚨상세페이지 약속 항목이다. 반드시 <b>'대운'</b>이라는 표현을 그대로 쓰라. 시기를 아는 것과 그 시기를 자기 것으로 만드는 것은 다르다. 위에서 짚은 각 시기마다 <b>구체적인 액션 플랜</b>을 써라 — 그 시기가 오기 전 몇 개월 동안 무엇을 준비해두어야 하는지, 시기가 왔을 때 무엇을 실행하는지, 무엇을 하면 기회를 날리는지. 반드시 오늘 당장 적어둘 수 있는 수준으로 구체적으로. 그리고 이 사람의 성격적 약점(CHAPTER 01에서 짚은 그것) 때문에 기회 앞에서 어떻게 도망칠 위험이 있는지, 그때 어떻게 붙잡아야 하는지를 연결해서 경고하라.\\n\\n【3. 놓치지 말아야 할 귀인, 피해야 할 악연】 🚨상세페이지 약속. <b>'귀인'</b>과 <b>'악연'</b> 두 단어를 반드시 그대로 쓰라. 먼저 <b>귀인</b>: 7하우스·11하우스·목성 배치를 근거로, ${v.name}님의 성공을 증폭시켜 줄 사람의 유형을 구체적으로 그려라 — 어떤 성향, 어떤 나이대·위치, 어디서 만나게 되는지, 어떻게 알아보는지. 귀인을 빼먹으면 약속 불이행이다. 그다음 <b>악연</b>: 8하우스·12하우스·토성·명왕성 배치를 근거로 ${v.name}님을 갉아먹는 사람의 유형을 <span style='color:#ff3b30;font-weight:900;'>빨간 글씨</span>로 분명히 경고하라. 처음엔 어떻게 보여서 속게 되는지, 어떤 신호가 나타나면 손절해야 하는지까지.\\n\\n마지막은 ${v.name}님을 굳게 믿어주는 뜨거운 축복으로 끝내라.",

  "vip_card4": "(최소 2200자) [CHAPTER 04. 전생의 나, 이번 생의 과제]\\n\\n<p class='lead'>...</p> 리드문 2~3문장. 노스노드와 사우스노드가 영혼의 두 방향을 가리킨다는 것을 짧게. 그다음 아래 세 항목, 각 600자 이상, 서술형 소제목.\\n\\n【1. 전생에 이미 통달한 익숙한 길】 🚨상세페이지 약속. 사우스노드의 별자리·도분·하우스를 근거로, ${v.name}님이 전생에서 이미 완벽히 익혔기에 이번 생에도 너무 익숙하고 편안한 패턴을 짚어라. 먼저 '대단한 강함'으로 인정하라. 그리고 힘들 때마다 자꾸 그 자리로 도망쳐 왔다는 것을, 왜 그 길이 안전하지만 공허해지는지를 밝혀라. 상세페이지 표현대로 <b>'익숙한 길'</b>이라는 말을 그대로 쓰라.\\n\\n【2. 영혼이 이번 생에 배우러 온 진짜 과제】 🚨상세페이지 약속. 노스노드의 별자리·도분·하우스를 근거로 이번 생에 반드시 배워야 할 것을 밝혀라 — 불편하고 어색하지만 바로 거기에 성장과 가장 큰 행복이 있음을. 위 차트에 <b>【겹침】</b> 항목(행성이 노스노드와 겹침)이 있으면 그것을 결정적 단서로 반드시 활용하라. 그 행성의 재능을 키우는 일이 곧 이번 생의 과제라는 뜻이다.\\n\\n【3. 이번 생에 풀어야 할 단 하나의 숙제】 🚨상세페이지 약속. 앞의 세 챕터(무의식의 방해 공작, 가짜 방어기제, 타고난 재능, 다가올 시기)와 전부 연결해, <b>왜 ${v.name}님의 인생이 지금까지 이렇게 흘러왔는지</b>가 마침내 납득되게 하라. 이게 이 챕터의 존재 이유다. 흩어진 조각이 하나로 맞물리는 순간을 만들어라.\\n\\n마지막은 <blockquote> 태그로 '이번 생에 풀어야 할 단 하나의 숙제'를 못 박아라. 약해지라는 게 아니라 '이미 강한 당신이 이제 ~하는 것'이라는 힘 있는 방향으로. 연민 금지.",

  "closing": "(400~600자) 리포트 전체를 봉합하는 마지막 문단. 챕터 번호나 소제목 없이 순수한 산문으로. 네 챕터에서 밝힌 것들을 한 흐름으로 엮어 ${v.name}님이 어떤 사람이고 어디로 가는 사람인지를 조용히 정리하라. 마지막 두세 문장은 짧게 끊어서 여운을 남겨라. 여기서는 차트 용어를 쓰지 마라. '이 리포트는 정해진 운명을 통보하는 글이 아닙니다'라는 태도로, 손님이 다 읽고 화면을 닫을 때 등이 펴지게 만들어라. <b> 태그는 한두 곳만.",

  "life_score_10": 점수숫자만,
  "life_desc_10": "(2~3문장) 10대의 흐름 — 이 시기에 뿌려진 씨앗과 그것이 지금까지 남긴 것",
  "life_score_20": 점수숫자만,
  "life_desc_20": "(2~3문장) 20대",
  "life_score_30": 점수숫자만,
  "life_desc_30": "(2~3문장) 30대",
  "life_score_40": 점수숫자만,
  "life_desc_40": "(2~3문장) 40대",
  "life_score_50": 점수숫자만,
  "life_desc_50": "(2~3문장) 50대",
  "life_score_60": 점수숫자만,
  "life_desc_60": "(2~3문장) 60대",
  "life_score_70": 점수숫자만,
  "life_desc_70": "(2~3문장) 70대",
  "life_score_80": 점수숫자만,
  "life_desc_80": "(2~3문장) 80대 — 인생을 마무리하는 시기",
  "best_age": "가장 점수 높은 연령대 (예: 40대)",
  "best_age_reason": "(3~4문장) 왜 그 시기가 인생의 황금기인지, 위 인생 주기 표의 실제 연도와 차트 근거를 함께 들어"
}
`;
}

// ============================================================================
//  🚦 품질 게이트 — 프롬프트에 "쓰지 마라"고 적는 것만으로는 안 지켜진다.
//     서버가 직접 검사해서 걸리면 재생성한다. 이게 수동 리포트와의 체감 차이를 만든다.
// ============================================================================
const BANNED = [
  // 유사영성 상투어
  '우주가 당신', '에너지가', '파동', '진동수', '기운이 흐르', '빛과 어둠', '고귀한 영혼',
  // AI 접속어·문어체 습관
  '다시 말해', '요약하면', '살펴보겠습니다', '라는 점입니다', '말씀드리자면',
  '을 의미합니다', '를 의미합니다', '라고 할 수 있습니다', '할 수 있겠습니다',
  // 하나마나한 덕담
  '긍정적으로 생각', '자신을 사랑하', '있는 그대로의 당신', '완벽한 사람은 없',
  '시간이 해결', '노력하면 됩니다',
  // 발뺌 화법
  '느낌도 있습니다', '면이 있으신 것 같', '할 수도 있어요', '아마 ', '일지도 모릅니다',
  '경우에 따라', '사람에 따라 다르',
  // 연민
  '얼마나 힘드셨', '안타깝네요', '가여운', '마음이 아프네요', '안쓰럽',
  // 시스템 용어 누출
  'undefined', 'null', 'NaN', '하우스맵', '트랜짓 항목', '데이터에 없', '계산되지 않'
];

function scanBanned(text) {
  if (typeof text !== 'string') return [];
  const hits = [];
  for (const w of BANNED) if (text.indexOf(w) >= 0) hits.push(w);
  return hits;
}

// 상세페이지에서 약속한 키워드가 본문에 실제로 등장하는지 검사.
// 빠지면 약속 불이행 = 환불 사유이므로 재생성한다.
const PROMISE_KEYWORDS = {
  vip_card1: ['가짜 방어기제'],
  vip_card3: ['골든 크로스', '대운', '귀인', '악연']
};

function makeValidator(specs) {
  return (d, lenient) => {
    for (const s of specs) {
      const v = d[s.key];
      if (s.numeric) {
        if (v === undefined || v === null || isNaN(Number(v))) return { ok: false, reason: s.key + ' 누락/비숫자' };
        continue;
      }
      if (typeof v !== 'string' || !v.trim()) return { ok: false, reason: s.key + ' 누락' };
      if (s.min && v.length < s.min) {
        if (!lenient) return { ok: false, reason: s.key + ' 분량 부족(' + v.length + '자 < ' + s.min + ')' };
      }
      if (s.max && v.length > s.max) return { ok: false, reason: s.key + ' 분량 초과(' + v.length + '자)' };
      // 약속 키워드 (관용 모드에서도 검사 — 약속 불이행은 분량보다 중대하다)
      const need = PROMISE_KEYWORDS[s.key];
      if (need) {
        const miss = need.filter(k => v.indexOf(k) === -1);
        if (miss.length && !lenient) return { ok: false, reason: s.key + ' 상세페이지 약속 키워드 누락: ' + miss.join(', ') };
        if (miss.length) console.warn('⚠️ [약속 누락 방출] ' + s.key + ' → ' + miss.join(', '));
      }
      // 금지 어휘
      const bad = scanBanned(v);
      if (bad.length) {
        if (!lenient) return { ok: false, reason: s.key + ' 금지 어휘 ' + bad.length + '개: ' + bad.slice(0, 4).join(', ') };
        console.warn('⚠️ [금지 어휘 방출] ' + s.key + ' → ' + bad.join(', '));
      }
    }
    return { ok: true };
  };
}

const VALIDATE_A = makeValidator([
  { key: 'core_sentence', min: 18, max: 90 },
  { key: 'vip_card1', min: 1680 },
  { key: 'vip_card2', min: 2240 }
]);
const VALIDATE_B = makeValidator([
  { key: 'vip_card3', min: 1680 },
  { key: 'vip_card4', min: 1540 },
  { key: 'closing', min: 280 },
  { key: 'best_age' }, { key: 'best_age_reason' },
  { key: 'life_score_10', numeric: true }, { key: 'life_score_20', numeric: true },
  { key: 'life_score_30', numeric: true }, { key: 'life_score_40', numeric: true },
  { key: 'life_score_50', numeric: true }, { key: 'life_score_60', numeric: true },
  { key: 'life_score_70', numeric: true }, { key: 'life_score_80', numeric: true }
]);

// ============================================================================
//  🤖 Gemini 호출
// ============================================================================
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_ATTEMPTS = 3;

function extractJson(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  try { return JSON.parse(raw); }
  catch (err) { try { return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')); } catch (e2) { return null; } }
}

async function callGemini(o) {
  let lastErr = '';
  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS;
    try {
      const r = await fetch(GEMINI_URL + '?key=' + process.env.GEMINI_API_KEY, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: o.prompt }] }],
          generationConfig: {
            maxOutputTokens: 65536, temperature: 0.92,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: o.thinkingBudget }
          }
        })
      });
      if (!r.ok) {
        lastErr = 'Gemini ' + r.status + ': ' + (await r.text()).slice(0, 250);
        console.error('🔥 [' + o.label + ' ' + attempt + '/' + MAX_ATTEMPTS + '] ' + lastErr);
        if (r.status === 503 || r.status === 429) {
          const w = RETRY_WAIT_MS[attempt - 1] || 0;
          if (w) { console.warn('⏳ Gemini ' + r.status + ' — ' + (w / 1000) + '초 대기 후 재시도'); await new Promise(s => setTimeout(s, w)); }
        }
        continue;
      }
      const j = await r.json();
      const cand = j.candidates && j.candidates[0];
      if (cand && cand.finishReason && cand.finishReason !== 'STOP')
        console.warn('⚠️ [' + o.label + '] finishReason=' + cand.finishReason);
      const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
      const parsed = extractJson(text);
      if (!parsed) {
        lastErr = 'JSON 파싱 실패: ' + text.slice(0, 180);
        console.error('🔥 [' + o.label + ' ' + attempt + '] ' + lastErr);
        continue;
      }
      const chk = o.validate(parsed, isLast);
      if (!chk.ok) {
        lastErr = chk.reason;
        console.warn('⚠️ [' + o.label + ' ' + attempt + '] 재생성: ' + chk.reason);
        if (!isLast) continue;

        /* 🚨 2026-08-02 수정 — 손님이 "리포트가 3장부터 시작한다" 고 문의한 사고
           ------------------------------------------------------------------
           [기존 동작]
           마지막 시도에서는 검증이 실패해도 그대로 ok:true 로 반환했다.
           "분량이 조금 모자라도 아예 못 주는 것보다 낫다" 는 취지였다.

           [무엇이 잘못됐나]
           그 취지는 '분량 부족' 에만 맞는다. 그런데 Gemini 가 vip_card1,
           vip_card2 자체를 응답에서 빼먹은 경우에도 같은 경로를 타서
           빈 리포트가 ok:true 로 저장됐다.
           손님 화면에는 3장부터 나왔고, 29,900원을 내고 절반을 못 받았다.

           [조치]
           '내용이 모자란 것' 과 '내용이 없는 것' 을 구분한다.
           누락은 어떤 경우에도 통과시키지 않는다.
           차라리 500 을 내고 재시도하게 하는 편이 훨씬 낫다. */
        if (/누락/.test(chk.reason)) {
          console.error('🔥 [' + o.label + '] 필수 항목 누락 — 채택 불가: ' + chk.reason);
          continue;   // 남은 시도가 없으면 아래에서 ok:false 로 빠진다
        }
      }
      console.log('✅ [' + o.label + '] 통과 (' + attempt + '회)' + (chk.ok ? '' : ' — 마지막 시도라 미달 상태로 채택'));
      return { ok: true, data: parsed };
    } catch (e) {
      lastErr = e.message;
      console.error('🔥 [' + o.label + ' ' + attempt + '] ' + e.message);
    }
  }
  return { ok: false, error: '[' + o.label + '] ' + lastErr };
}

function normalizeScores(d) {
  const decades = [10, 20, 30, 40, 50, 60, 70, 80];
  let best = null, hi = -1;
  for (const dec of decades) {
    let n = Number(d['life_score_' + dec]);
    if (isNaN(n)) n = 50;
    n = Math.max(1, Math.min(100, Math.round(n)));
    d['life_score_' + dec] = n;
    if (n > hi) { hi = n; best = dec + '대'; }
  }
  const lo = Math.min.apply(null, decades.map(x => d['life_score_' + x]));
  if (hi - lo < 20) console.warn('⚠️ 연령대 점수 편차 ' + (hi - lo) + '점뿐 — 프롬프트 준수 미흡');
  if (d.best_age && best && String(d.best_age).indexOf(best.replace('대', '')) === -1)
    console.warn('⚠️ best_age(' + d.best_age + ') ≠ 최고점 구간(' + best + ')');
  if (!d.best_age) d.best_age = best;
  return d;
}

// ============================================================================
//  🚀 핸들러
// ============================================================================
const handler = async (req, res) => {
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get('vip-report:' + orderId);
      res.setHeader('Cache-Control', 'no-store');
      return saved ? res.status(200).json(saved) : res.status(404).json({ error: '저장된 리포트 없음' });
    } catch (e) { return res.status(500).json({ error: 'KV 조회 실패: ' + e.message }); }
  }
  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log('✅ [1] gemini-vip 진입');
  try {
    const b = req.body || {};
    const { name, date, city, myGender } = b;
    let time = b.time;
    // 🚨 출생시간 미상 처리: 상승점·천정·하우스가 무의미해지므로 정밀도를 주장하지 않는다.
    const timeUnknown = !!b.timeUnknown || !time || String(time).trim() === '';
    if (timeUnknown) time = '12:00';
    if (!name || !date) return res.status(400).json({ error: '이름과 생년월일은 필수입니다.' });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY 없음' });

    let location = cityCoordinates[city];
    const cityResolved = !!location && !timeUnknown;
    if (!location) {
      console.error('⚠️ 출생지 좌표 없음: "' + city + '" → 서울 대체. 도시 목록 확인 필요');
      location = cityCoordinates['Seoul'];
    }
    if (timeUnknown) console.warn('⚠️ 출생시간 미상 → 정오 기준 근사. 정밀도 주장 철회됨');

    const dateTimeIso = buildBirthIso(date, time, city);
    const tzName = cityTimezones[city] || 'Asia/Seoul';
    const tzLabel = tzName + ' · UTC' + dateTimeIso.slice(-6);

    let astro = '정밀 천체 궤도 역산 데이터 기반.';
    let core = '중심 배치를 하나 골라 네 챕터를 하나의 이야기로 이어라.';
    let table = null, methodNote = null, chartStats = null;
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
            encodeURIComponent(dateTimeIso) + '&coordinates=' + location.lat + ',' + location.lon + '&ayanamsa=1',
            { headers: { Authorization: 'Bearer ' + td.access_token } });
          if (ar.ok) {
            const aj = await ar.json();
            const r = analyzeChart(aj.data, dateTimeIso, location, tzLabel, cityResolved);
            if (r.digest) {
              astro = r.digest; table = r.table; methodNote = r.methodNote; chartStats = r.stats;
              if (r.core) core = r.core;
              console.log('📊 다이제스트\n' + r.digest);
            }
          } else console.log('⚠️ Prokerala planet-position ' + ar.status);
        }
      }
    } catch (e) { console.log('⚠️ Prokerala Fallback:', e.message); }

    const lifeCycles = buildLifeCycles(date);
    const now = new Date();
    const birthY = Number(String(date).replace(/\./g, '-').split('-')[0]);
    const age = birthY ? now.getFullYear() - birthY : null;
    const ageLine = age
      ? '${name}님은 올해 만 ' + (age - 1) + '~' + age + '세다. 이 나이에 맞는 맥락으로 써라. 20대에게 "이미 늦었다", 50대에게 "이제 커리어를 시작" 같은 말은 실패다.'
          .replace('${name}', name)
      : '';

    const v = { name: name, date: date, time: timeUnknown ? time + ' (미상 · 정오 기준)' : time,
      city: city, myGender: myGender, astro: astro, core: core, lifeCycles: lifeCycles,
      ageLine: ageLine, todayStr: now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일' };

    console.log('✅ [2] 차트 준비 완료 → Gemini 2회 병렬 호출');
    const [A, B] = await Promise.all([
      callGemini({ prompt: buildPromptA(v), thinkingBudget: 8192, label: 'CH01-02', validate: VALIDATE_A }),
      callGemini({ prompt: buildPromptB(v), thinkingBudget: 6144, label: 'CH03-04', validate: VALIDATE_B })
    ]);
    if (!A.ok || !B.ok) {
      const err = [A.ok ? null : A.error, B.ok ? null : B.error].filter(Boolean).join(' | ');
      console.error('🔥 병렬 호출 실패:', err);
      return res.status(500).json({ error: '[Gemini VIP 실패] ' + err });
    }

    const out = normalizeScores(Object.assign({}, A.data, B.data));

    /* 🚨 저장 직전 최종 관문 — 2026-08-02 추가
       ------------------------------------------------------------------
       위 검증을 어떤 경로로든 뚫고 온 빈 리포트를 여기서 막는다.
       한 번 KV 에 저장되면 1년간 그대로 손님에게 보이므로,
       빈 채로 저장되는 것이 가장 나쁘다. 차라리 500 이 낫다.
       (500 이면 손님이 다시 눌러 재생성할 수 있지만,
        빈 리포트가 저장되면 다시 눌러도 그 빈 것만 나온다) */
    const MUST = ['vip_card1', 'vip_card2', 'vip_card3', 'vip_card4', 'closing'];
    const empty = MUST.filter(k => !out[k] || String(out[k]).trim().length < 200);
    if (empty.length) {
      console.error('🔥 저장 차단 — 내용이 비었거나 너무 짧음: ' + empty.join(', '));
      return res.status(500).json({
        error: '[VIP 생성 미완] ' + empty.join(', ') + ' 항목이 비어 있어 저장하지 않았습니다.'
      });
    }
    // 서버 계산 산출물 (AI를 거치지 않음 → 할루시네이션 0)
    if (table) out.chart_table = table;
    if (methodNote) out.method_note = methodNote;
    if (chartStats) out.chart_stats = chartStats;
    out.time_unknown = timeUnknown;

    console.log('✅ [3] 완료 — card1 ' + (out.vip_card1 || '').length + ' / card2 ' + (out.vip_card2 || '').length +
      ' / card3 ' + (out.vip_card3 || '').length + ' / card4 ' + (out.vip_card4 || '').length +
      ' / closing ' + (out.closing || '').length + '자');

    if (b.orderId) {
      try {
        await kv.set('vip-report:' + b.orderId, out, { ex: 60 * 60 * 24 * 365 });
        console.log('💾 KV 저장(1년): vip-report:' + b.orderId);
      } catch (e) { console.log('⚠️ KV 저장 실패(전송은 진행):', e.message); }
    }
    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(out);
  } catch (error) {
    console.error('🔥 gemini-vip 에러:', error);
    return res.status(500).json({ error: '[VIP 서버 에러] ' + error.message });
  }
};

module.exports = allowCors(handler);
