// ============================================================================
//  api/gemini-vip.js  —  아스트라노트 VVIP 심층 리포트 (29,900원)
// ----------------------------------------------------------------------------
//  ▣ 2026-07 대개편 내역
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

const allowCors = fn => async (req, res) => {
  res.setHeader('Access-Control-Allow-Credentials', true);
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET,OPTIONS,PATCH,DELETE,POST,PUT');
  res.setHeader('Access-Control-Allow-Headers', 'X-CSRF-Token, X-Requested-With, Accept, Accept-Version, Content-Length, Content-MD5, Content-Type, Date, X-Api-Version');
  if (req.method === 'OPTIONS') { res.status(200).end(); return; }
  return await fn(req, res);
};

const cityCoordinates = {
  "Seoul": { lat: 37.5665, lon: 126.978 },
  "Incheon": { lat: 37.4563, lon: 126.7052 },
  "Gimpo": { lat: 37.6152, lon: 126.7156 },
  "Suwon": { lat: 37.2636, lon: 127.0286 },
  "Seongnam": { lat: 37.42, lon: 127.1265 },
  "Goyang": { lat: 37.6584, lon: 126.832 },
  "Yongin": { lat: 37.2411, lon: 127.1776 },
  "Bucheon": { lat: 37.5034, lon: 126.766 },
  "Ansan": { lat: 37.3219, lon: 126.8309 },
  "Anyang": { lat: 37.3943, lon: 126.9568 },
  "Namyangju": { lat: 37.636, lon: 127.2165 },
  "Hwaseong": { lat: 37.1995, lon: 126.831 },
  "Pyeongtaek": { lat: 36.9921, lon: 127.1129 },
  "Uijeongbu": { lat: 37.7381, lon: 127.0338 },
  "Siheung": { lat: 37.38, lon: 126.8028 },
  "Paju": { lat: 37.7599, lon: 126.7802 },
  "Gwangmyeong": { lat: 37.4772, lon: 126.8646 },
  "Gunpo": { lat: 37.3617, lon: 126.9352 },
  "Osan": { lat: 37.1499, lon: 127.0774 },
  "Icheon": { lat: 37.272, lon: 127.435 },
  "Yangju": { lat: 37.7852, lon: 127.0458 },
  "Guri": { lat: 37.5943, lon: 127.1296 },
  "Anseong": { lat: 37.008, lon: 127.2797 },
  "Pocheon": { lat: 37.8949, lon: 127.2003 },
  "Uiwang": { lat: 37.3446, lon: 126.9683 },
  "Hanam": { lat: 37.5392, lon: 127.2148 },
  "Yeoju": { lat: 37.2982, lon: 127.6371 },
  "Dongducheon": { lat: 37.9036, lon: 127.0606 },
  "Gwacheon": { lat: 37.4292, lon: 126.9877 },
  "Gapyeong": { lat: 37.8315, lon: 127.5105 },
  "Yangpyeong": { lat: 37.4917, lon: 127.4874 },
  "Yeoncheon": { lat: 38.0965, lon: 127.0748 },
  "GyeonggiEtc": { lat: 37.4138, lon: 127.5183 },
  "Chuncheon": { lat: 37.8813, lon: 127.7298 },
  "Wonju": { lat: 37.3422, lon: 127.9202 },
  "Gangneung": { lat: 37.7519, lon: 128.8761 },
  "Sokcho": { lat: 38.207, lon: 128.5918 },
  "Donghae": { lat: 37.5247, lon: 129.1143 },
  "Taebaek": { lat: 37.164, lon: 128.9856 },
  "Samcheok": { lat: 37.4499, lon: 129.1656 },
  "Hongcheon": { lat: 37.6971, lon: 127.8887 },
  "Cheorwon": { lat: 38.1467, lon: 127.3134 },
  "Jeongseon": { lat: 37.3806, lon: 128.6608 },
  "Yeongwol": { lat: 37.1836, lon: 128.4617 },
  "Pyeongchang": { lat: 37.3705, lon: 128.3901 },
  "GangwonEtc": { lat: 37.8228, lon: 128.1555 },
  "Cheongju": { lat: 36.6424, lon: 127.489 },
  "Chungju": { lat: 36.991, lon: 127.9259 },
  "Jecheon": { lat: 37.1326, lon: 128.191 },
  "Eumseong": { lat: 36.9403, lon: 127.6906 },
  "Jincheon": { lat: 36.8553, lon: 127.4355 },
  "Okcheon": { lat: 36.3062, lon: 127.5714 },
  "Yeongdong": { lat: 36.175, lon: 127.7834 },
  "ChungbukEtc": { lat: 36.8, lon: 127.7 },
  "Daejeon": { lat: 36.3504, lon: 127.3845 },
  "Sejong": { lat: 36.48, lon: 127.289 },
  "Cheonan": { lat: 36.8151, lon: 127.1139 },
  "Asan": { lat: 36.7898, lon: 127.0018 },
  "Seosan": { lat: 36.7848, lon: 126.4503 },
  "Dangjin": { lat: 36.8894, lon: 126.6457 },
  "Nonsan": { lat: 36.1872, lon: 127.0987 },
  "Gongju": { lat: 36.4466, lon: 127.119 },
  "Boryeong": { lat: 36.3333, lon: 126.6127 },
  "Buyeo": { lat: 36.2757, lon: 126.9098 },
  "Hongseong": { lat: 36.6014, lon: 126.6608 },
  "Taean": { lat: 36.7456, lon: 126.298 },
  "Geumsan": { lat: 36.1089, lon: 127.4881 },
  "ChungnamEtc": { lat: 36.5184, lon: 126.8 },
  "Jeonju": { lat: 35.8242, lon: 127.148 },
  "Iksan": { lat: 35.9483, lon: 126.9577 },
  "Gunsan": { lat: 35.9676, lon: 126.7369 },
  "Jeongeup": { lat: 35.5699, lon: 126.856 },
  "Namwon": { lat: 35.4164, lon: 127.3905 },
  "Gimje": { lat: 35.8038, lon: 126.8807 },
  "Wanju": { lat: 35.9047, lon: 127.1622 },
  "Gochang": { lat: 35.4358, lon: 126.702 },
  "Buan": { lat: 35.7318, lon: 126.7333 },
  "Imsil": { lat: 35.6178, lon: 127.2892 },
  "Sunchang": { lat: 35.3744, lon: 127.1374 },
  "Jinan": { lat: 35.7917, lon: 127.4247 },
  "Muju": { lat: 36.0068, lon: 127.6608 },
  "Jangsu": { lat: 35.6474, lon: 127.5213 },
  "JeonbukEtc": { lat: 35.7175, lon: 127.153 },
  "Gwangju": { lat: 35.1595, lon: 126.8526 },
  "Yeosu": { lat: 34.7604, lon: 127.6622 },
  "Suncheon": { lat: 34.9506, lon: 127.4872 },
  "Mokpo": { lat: 34.8118, lon: 126.3922 },
  "Naju": { lat: 35.0158, lon: 126.7108 },
  "Gwangyang": { lat: 34.9407, lon: 127.6959 },
  "Damyang": { lat: 35.3211, lon: 126.9882 },
  "Goheung": { lat: 34.6111, lon: 127.285 },
  "Boseong": { lat: 34.7714, lon: 127.08 },
  "Hwasun": { lat: 35.0645, lon: 126.9866 },
  "Jangheung": { lat: 34.6816, lon: 126.907 },
  "Gangjin": { lat: 34.642, lon: 126.7672 },
  "Haenam": { lat: 34.5734, lon: 126.599 },
  "Yeongam": { lat: 34.8, lon: 126.6967 },
  "Muan": { lat: 34.9903, lon: 126.4817 },
  "Hampyeong": { lat: 35.0658, lon: 126.5165 },
  "Yeonggwang": { lat: 35.2772, lon: 126.512 },
  "Jangseong": { lat: 35.3019, lon: 126.7849 },
  "Wando": { lat: 34.311, lon: 126.755 },
  "Jindo": { lat: 34.4867, lon: 126.2634 },
  "Sinan": { lat: 34.8276, lon: 126.1076 },
  "Gokseong": { lat: 35.282, lon: 127.2921 },
  "Gurye": { lat: 35.2025, lon: 127.4629 },
  "JeonnamEtc": { lat: 34.8679, lon: 126.991 },
  "Daegu": { lat: 35.8714, lon: 128.6014 },
  "Pohang": { lat: 36.019, lon: 129.3435 },
  "Gumi": { lat: 36.1196, lon: 128.3446 },
  "Gyeongju": { lat: 35.8562, lon: 129.2247 },
  "Andong": { lat: 36.5684, lon: 128.7294 },
  "Gimcheon": { lat: 36.1398, lon: 128.1136 },
  "Yeongju": { lat: 36.8057, lon: 128.624 },
  "Yeongcheon": { lat: 35.9733, lon: 128.9386 },
  "Sangju": { lat: 36.4109, lon: 128.159 },
  "Mungyeong": { lat: 36.5866, lon: 128.1867 },
  "Gyeongsan": { lat: 35.8251, lon: 128.7413 },
  "Chilgok": { lat: 35.9955, lon: 128.4014 },
  "Uiseong": { lat: 36.3527, lon: 128.6971 },
  "Cheongdo": { lat: 35.6473, lon: 128.7341 },
  "Goryeong": { lat: 35.7261, lon: 128.2626 },
  "Seongju": { lat: 35.9192, lon: 128.2831 },
  "Yecheon": { lat: 36.6575, lon: 128.437 },
  "Bonghwa": { lat: 36.8931, lon: 128.7325 },
  "Uljin": { lat: 36.993, lon: 129.4004 },
  "Ulleung": { lat: 37.4844, lon: 130.9057 },
  "Yeongdeok": { lat: 36.4152, lon: 129.3656 },
  "Cheongsong": { lat: 36.4362, lon: 129.0571 },
  "Yeongyang": { lat: 36.6667, lon: 129.1124 },
  "Gunwi": { lat: 36.2429, lon: 128.5729 },
  "GyeongbukEtc": { lat: 36.2486, lon: 128.6647 },
  "Busan": { lat: 35.1796, lon: 129.0756 },
  "Ulsan": { lat: 35.5384, lon: 129.3114 },
  "Changwon": { lat: 35.228, lon: 128.6811 },
  "Gimhae": { lat: 35.2285, lon: 128.8894 },
  "Jinju": { lat: 35.18, lon: 128.1076 },
  "Yangsan": { lat: 35.335, lon: 129.0378 },
  "Geoje": { lat: 34.8806, lon: 128.6211 },
  "Tongyeong": { lat: 34.8544, lon: 128.4331 },
  "Sacheon": { lat: 35.0036, lon: 128.0642 },
  "Miryang": { lat: 35.5038, lon: 128.7469 },
  "Haman": { lat: 35.2723, lon: 128.4066 },
  "Geochang": { lat: 35.6867, lon: 127.9095 },
  "Changnyeong": { lat: 35.5445, lon: 128.4923 },
  "Goseong": { lat: 34.973, lon: 128.3222 },
  "Namhae": { lat: 34.8377, lon: 127.8925 },
  "Hadong": { lat: 35.0672, lon: 127.7514 },
  "Sancheong": { lat: 35.4156, lon: 127.8735 },
  "Hamyang": { lat: 35.5205, lon: 127.7252 },
  "Hapcheon": { lat: 35.5666, lon: 128.1658 },
  "Uiryeong": { lat: 35.3222, lon: 128.2617 },
  "GyeongnamEtc": { lat: 35.2599, lon: 128.2635 },
  "Jeju": { lat: 33.4996, lon: 126.5312 },
  "Seogwipo": { lat: 33.2541, lon: 126.56 },
  "NewYork": { lat: 40.7128, lon: -74.006 },
  "LosAngeles": { lat: 34.0522, lon: -118.2437 },
  "Chicago": { lat: 41.8781, lon: -87.6298 },
  "Toronto": { lat: 43.6532, lon: -79.3832 },
  "Vancouver": { lat: 49.2827, lon: -123.1207 },
  "MexicoCity": { lat: 19.4326, lon: -99.1332 },
  "SaoPaulo": { lat: -23.5505, lon: -46.6333 },
  "London": { lat: 51.5074, lon: -0.1278 },
  "Paris": { lat: 48.8566, lon: 2.3522 },
  "Berlin": { lat: 52.52, lon: 13.405 },
  "Frankfurt": { lat: 50.1109, lon: 8.6821 },
  "Rome": { lat: 41.9028, lon: 12.4964 },
  "Madrid": { lat: 40.4168, lon: -3.7038 },
  "Tokyo": { lat: 35.6895, lon: 139.6917 },
  "Beijing": { lat: 39.9042, lon: 116.4074 },
  "Shanghai": { lat: 31.2304, lon: 121.4737 },
  "HongKong": { lat: 22.3193, lon: 114.1694 },
  "Singapore": { lat: 1.3521, lon: 103.8198 },
  "Bangkok": { lat: 13.7563, lon: 100.5018 },
  "Manila": { lat: 14.5995, lon: 120.9842 },
  "Sydney": { lat: -33.8688, lon: 151.2093 },
  "Melbourne": { lat: -37.8136, lon: 144.9631 },
  "Auckland": { lat: -36.8485, lon: 174.7633 },
  "Overseas": { lat: 37.5665, lon: 126.978 }
};

// ═══ 도시별 시간대 (해외 출생 정확도) ═══
const cityTimezones = {
  "NewYork": "America/New_York",
  "LosAngeles": "America/Los_Angeles",
  "Chicago": "America/Chicago",
  "Toronto": "America/Toronto",
  "Vancouver": "America/Vancouver",
  "MexicoCity": "America/Mexico_City",
  "SaoPaulo": "America/Sao_Paulo",
  "London": "Europe/London",
  "Paris": "Europe/Paris",
  "Berlin": "Europe/Berlin",
  "Frankfurt": "Europe/Berlin",
  "Rome": "Europe/Rome",
  "Madrid": "Europe/Madrid",
  "Tokyo": "Asia/Tokyo",
  "Beijing": "Asia/Shanghai",
  "Shanghai": "Asia/Shanghai",
  "HongKong": "Asia/Hong_Kong",
  "Singapore": "Asia/Singapore",
  "Bangkok": "Asia/Bangkok",
  "Manila": "Asia/Manila",
  "Sydney": "Australia/Sydney",
  "Melbourne": "Australia/Melbourne",
  "Auckland": "Pacific/Auckland"
};

// 출생일 기준 현지 UTC 오프셋(분). 서머타임 자동 반영.
function getUtcOffsetMinutes(tz, y, mo, d, h, mi) {
  try {
    const asUTC = Date.UTC(y, mo - 1, d, h, mi, 0);
    const dtf = new Intl.DateTimeFormat('en-US', {
      timeZone: tz, hour12: false,
      year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit'
    });
    const p = {};
    for (const part of dtf.formatToParts(new Date(asUTC))) {
      if (part.type !== 'literal') p[part.type] = parseInt(part.value, 10);
    }
    const asLocal = Date.UTC(p.year, p.month - 1, p.day, p.hour % 24, p.minute, p.second);
    return Math.round((asLocal - asUTC) / 60000);
  } catch (e) {
    console.error('시간대 계산 실패:', tz, e.message);
    return 540;
  }
}

// 출생 정보 → 정확한 ISO 문자열 (도시 시간대 반영)
function buildBirthIso(dateStr, timeStr, cityKey) {
  const ds = String(dateStr).replace(/\./g, '-');
  const parts = ds.split('-').map(Number);
  const y = parts[0], mo = parts[1], d = parts[2];
  const tparts = String(timeStr).split(':').map(Number);
  const h = tparts[0], mi = tparts[1] || 0;
  const tz = cityTimezones[cityKey];

  if (!tz) return ds + 'T' + timeStr + ':00+09:00';

  const off = getUtcOffsetMinutes(tz, y, mo, d, h, mi);
  const sign = off >= 0 ? '+' : '-';
  const ab = Math.abs(off);
  const hh = String(Math.floor(ab / 60)).padStart(2, '0');
  const mm = String(ab % 60).padStart(2, '0');
  console.log('🌍 ' + cityKey + ' → ' + tz + ' (UTC' + sign + hh + ':' + mm + ')');
  return ds + 'T' + timeStr + ':00' + sign + hh + ':' + mm;
}

// ============================================================================
//  🔭 상수 정의
// ============================================================================
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];

// 🚨 [수정 3] 천왕성·해왕성·명왕성 추가.
//    기존에는 이 3개가 없어서 PAIR_MEANING의 '달-명왕성', '금성-천왕성',
//    '금성-해왕성', '화성-명왕성' 4개 항목이 구조적으로 절대 발동하지 않았다.
const PLANET_KR = {
  Sun: '태양', Moon: '달', Mercury: '수성', Venus: '금성', Mars: '화성',
  Jupiter: '목성', Saturn: '토성',
  Uranus: '천왕성', Neptune: '해왕성', Pluto: '명왕성',
  Ascendant: '상승점'
};

// 개인행성 = 사람마다 다르므로 개인화 근거로 쓸 수 있다.
// 세대행성(천왕성·해왕성·명왕성) = 한 사인에 7~20년 머물러 또래가 전부 같다.
//   → 사인 단독 인용은 일반론이 되므로 '하우스'와 '개인행성과의 각도'만 근거로 쓴다.
const PERSONAL = ['태양','달','수성','금성','화성','상승점'];
const SOCIAL = ['목성','토성'];
const OUTER = ['천왕성','해왕성','명왕성'];
const PLANET_ORDER = ['태양','달','수성','금성','화성','목성','토성','천왕성','해왕성','명왕성'];

const HOUSE_MEANING = {
  1: '자아·타고난 기질·첫인상',
  2: '돈·자존감·타고난 재능',
  3: '소통·형제자매·초년 학습환경',
  4: '부모·가정·뿌리·마음의 안식처',
  5: '연애·자녀·창조성·즐거움',
  6: '일상·건강·직장생활·성실함',
  7: '배우자·결혼·1:1 관계 ★핵심',
  8: '깊은 결속·상처·타인의 자원·변형',
  9: '배움·여행·먼 곳·신념',
  10: '커리어·사회적 지위·명예',
  11: '인간관계·인맥·꿈과 소망',
  12: '무의식·숨겨진 상처·혼자만의 세계'
};

const ASPECTS = [
  { ang: 0,   name: '합',   orb: 7, tone: '융합' },
  { ang: 180, name: '대립', orb: 6, tone: '긴장' },
  { ang: 120, name: '삼각', orb: 6, tone: '조화' },
  { ang: 90,  name: '사각', orb: 6, tone: '긴장' },
  { ang: 60,  name: '육각', orb: 4, tone: '조화' }
];

// 🚨 [수정 3] 13쌍 → 50쌍으로 확장.
//    이게 "리포트가 부실하다"의 근본 원인이었다. 매핑이 13쌍뿐이라
//    실제로 인용 가능한 【각도】가 0~2개밖에 안 나왔고, 프롬프트는
//    "최소 1개 필수"를 요구하니 AI가 일반론으로 때웠다.
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
//  🧮 기초 수학 유틸
// ============================================================================
const RAD = Math.PI / 180;
const norm360 = x => ((x % 360) + 360) % 360;
const sind = x => Math.sin(x * RAD);
const cosd = x => Math.cos(x * RAD);

function angleDiff(a, b) {
  const d = Math.abs(norm360(a) - norm360(b)) % 360;
  return d > 180 ? 360 - d : d;
}

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000); // 라히리 아야남샤 근사치
}

function signDeg(lon) {
  const l = norm360(lon);
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}

// 홀사인(Whole Sign) 하우스: 상승점이 속한 사인이 1하우스 전체
function wholeSignHouse(planetLon, ascLon) {
  return ((Math.floor(norm360(planetLon) / 30) - Math.floor(norm360(ascLon) / 30)) % 12 + 12) % 12 + 1;
}

// ============================================================================
//  🪐 [수정 3-b] 외행성 로컬 궤도 계산 (폴백)
// ----------------------------------------------------------------------------
//  Prokerala의 planet-position이 천왕성·해왕성·명왕성을 반환하지 않는 경우를
//  대비한 자체 계산. Schlyter 저정밀 궤도요소 기반으로, 외행성은 이동이 느려
//  오차가 0.1~0.5도 수준이다. 애스펙트 오브(4~7도)에 비하면 무의미한 오차.
//
//  🚨 중요: 이 계산 결과는 이미 '트로피컬(황도 춘분점 기준)'이다.
//     Prokerala 값에는 아야남샤를 더해 사이더리얼→트로피컬 보정을 하지만,
//     이 값에는 절대 더하면 안 된다. (이중 보정 = 24도 오차)
// ============================================================================
function daysSince2000(dateTimeIso) {
  const t = new Date(dateTimeIso).getTime();
  return t / 86400000 + 2440587.5 - 2451543.5; // Schlyter의 d (2000 Jan 0.0 TDT)
}

// 케플러 방정식 → 태양 중심 직교좌표
function heliocentricXYZ(el) {
  const { N, i, w, a, e, M } = el;
  const eDeg = (180 / Math.PI) * e;
  let E = M + eDeg * sind(M) * (1 + e * cosd(M));
  for (let k = 0; k < 8; k++) {
    const E0 = E;
    E = E0 - (E0 - eDeg * sind(E0) - M) / (1 - e * cosd(E0));
    if (Math.abs(E - E0) < 1e-9) break;
  }
  const xv = a * (cosd(E) - e);
  const yv = a * Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD;
  const r = Math.sqrt(xv * xv + yv * yv);
  const vw = v + w;
  return {
    x: r * (cosd(N) * cosd(vw) - sind(N) * sind(vw) * cosd(i)),
    y: r * (sind(N) * cosd(vw) + cosd(N) * sind(vw) * cosd(i)),
    z: r * (sind(vw) * sind(i))
  };
}

// 태양의 지구 중심 직교좌표 (= 지구의 태양 중심 좌표에 -1을 곱한 것)
function sunGeoXY(d) {
  const M = norm360(356.0470 + 0.9856002585 * d);
  const w = 282.9404 + 4.70935e-5 * d;
  const e = 0.016709 - 1.151e-9 * d;
  const eDeg = (180 / Math.PI) * e;
  const E = M + eDeg * sind(M) * (1 + e * cosd(M));
  const xv = cosd(E) - e;
  const yv = Math.sqrt(1 - e * e) * sind(E);
  const v = Math.atan2(yv, xv) / RAD;
  const r = Math.sqrt(xv * xv + yv * yv);
  const lonsun = v + w;
  return { x: r * cosd(lonsun), y: r * sind(lonsun) };
}

function calcUranusLon(d) {
  const xyz = heliocentricXYZ({
    N: 74.0005 + 1.3978e-5 * d,
    i: 0.7733 + 1.9e-8 * d,
    w: 96.6612 + 3.0565e-5 * d,
    a: 19.18171 - 1.55e-8 * d,
    e: 0.047318 + 7.45e-9 * d,
    M: norm360(142.5905 + 0.011725806 * d)
  });
  const s = sunGeoXY(d);
  return norm360(Math.atan2(xyz.y + s.y, xyz.x + s.x) / RAD);
}

function calcNeptuneLon(d) {
  const xyz = heliocentricXYZ({
    N: 131.7806 + 3.0173e-5 * d,
    i: 1.7700 - 2.55e-7 * d,
    w: 272.8461 - 6.027e-6 * d,
    a: 30.05826 + 3.313e-8 * d,
    e: 0.008606 + 2.15e-9 * d,
    M: norm360(260.2471 + 0.005995147 * d)
  });
  const s = sunGeoXY(d);
  return norm360(Math.atan2(xyz.y + s.y, xyz.x + s.x) / RAD);
}

// 명왕성은 궤도 이심률이 커서 케플러 근사가 부적합 → Schlyter 전용 급수 (1800~2100)
function calcPlutoLon(d) {
  const S = norm360(50.03 + 0.033459652 * d);
  const P = norm360(238.95 + 0.003968789 * d);
  const lonecl = 238.9508 + 0.00400703 * d
    - 19.799 * sind(P) + 19.848 * cosd(P)
    + 0.897 * sind(2 * P) - 4.956 * cosd(2 * P)
    + 0.610 * sind(3 * P) + 1.211 * cosd(3 * P)
    - 0.341 * sind(4 * P) - 0.190 * cosd(4 * P)
    + 0.128 * sind(5 * P) - 0.034 * cosd(5 * P)
    - 0.038 * sind(6 * P) + 0.031 * cosd(6 * P)
    + 0.020 * sind(S - P) - 0.010 * cosd(S - P);
  const latecl = -3.9082
    - 5.453 * sind(P) - 14.975 * cosd(P)
    + 3.527 * sind(2 * P) + 1.673 * cosd(2 * P)
    - 1.051 * sind(3 * P) + 0.328 * cosd(3 * P)
    + 0.179 * sind(4 * P) - 0.292 * cosd(4 * P)
    + 0.019 * sind(5 * P) + 0.100 * cosd(5 * P)
    - 0.031 * sind(6 * P) + 0.026 * cosd(6 * P)
    + 0.011 * cosd(S - P);
  const r = 40.72
    + 6.68 * sind(P) + 6.90 * cosd(P)
    - 1.18 * sind(2 * P) - 0.03 * cosd(2 * P)
    + 0.15 * sind(3 * P) - 0.14 * cosd(3 * P);
  const xh = r * cosd(lonecl) * cosd(latecl);
  const yh = r * sind(lonecl) * cosd(latecl);
  const s = sunGeoXY(d);
  return norm360(Math.atan2(yh + s.y, xh + s.x) / RAD);
}

// ============================================================================
//  🔮 달의 교점 (전생 / 이번 생의 과제)
// ============================================================================
function calcNorthNode(dateTimeIso) {
  const dt = new Date(dateTimeIso);
  const jd = (dt.getTime() / 86400000) + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  const omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000;
  return norm360(omega);
}

// ============================================================================
//  🪐 목성 트랜짓 실계산 표 (2026.08 ~ 2034.10, 매월 1일 황경)
// ----------------------------------------------------------------------------
//  99개월치. 이 표가 있어야 손님마다 만남·기회 시기가 다르게 나온다.
// ============================================================================
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
//  🔬 차트 정밀 다이제스트
// ----------------------------------------------------------------------------
//  Prokerala의 베딕(사이더리얼) 좌표를 서양 점성술(트로피컬)로 보정하고,
//  AI가 바로 이해할 수 있는 한국어 요약으로 변환한다. 리포트 품질의 핵심.
//  반환: { digest, core } — core는 두 번의 Gemini 호출에 동일하게 주입되는
//  '중심 서사 앵커'다. 이것이 있어야 호출을 쪼개도 이야기가 갈라지지 않는다.
// ============================================================================
function analyzeChart(data, dateTimeIso) {
  try {
    const list = data && (data.planet_position || data.planet_positions) || [];
    if (!list.length) return { digest: null, core: null };

    const ay = lahiriAyanamsa(dateTimeIso);
    const planets = {};

    // 1) Prokerala 값 (사이더리얼 → 트로피컬 보정)
    for (const p of list) {
      const nameKr = PLANET_KR[p.name];
      if (!nameKr || typeof p.longitude !== 'number') continue;
      planets[nameKr] = signDeg(p.longitude + ay);
    }

    // 2) 외행성 폴백 — Prokerala가 안 주면 자체 계산
    //    🚨 자체 계산값은 이미 트로피컬이므로 아야남샤를 더하지 않는다.
    const dd = daysSince2000(dateTimeIso);
    const fallback = [];
    if (!planets['천왕성']) { planets['천왕성'] = signDeg(calcUranusLon(dd)); fallback.push('천왕성'); }
    if (!planets['해왕성']) { planets['해왕성'] = signDeg(calcNeptuneLon(dd)); fallback.push('해왕성'); }
    if (!planets['명왕성']) { planets['명왕성'] = signDeg(calcPlutoLon(dd)); fallback.push('명왕성'); }
    if (fallback.length) console.log('🪐 외행성 자체 계산 사용: ' + fallback.join(', '));

    const asc = planets['상승점'];
    const lines = [];
    const houseMap = {};
    const houseOf = {};

    // ── 상승점 / 하우스 축 ──────────────────────────────────
    if (asc) {
      const dsc = signDeg(asc.abs + 180);
      lines.push('상승점(ASC): ' + asc.sign + ' ' + asc.deg + '도');
      lines.push('7하우스(배우자궁) 시작점: ' + dsc.sign + ' ' + dsc.deg + '도');
      lines.push('10하우스(커리어궁) 축: ' + signDeg(asc.abs + 270).sign + ' 방향');
      lines.push('2하우스(재물궁) 축: ' + signDeg(asc.abs + 30).sign + ' 방향');
    }

    // ── 행성 배치 ──────────────────────────────────────────
    for (const n of PLANET_ORDER) {
      if (!planets[n]) continue;
      let houseTxt = '';
      if (asc) {
        const h = wholeSignHouse(planets[n].abs, asc.abs);
        houseOf[n] = h;
        houseMap[h] = houseMap[h] || [];
        houseMap[h].push(n);
        houseTxt = ' (' + h + '하우스 = ' + HOUSE_MEANING[h] + (h === 7 ? ' ★배우자궁 안! 최우선 근거' : '') + ')';
      }
      const genTag = OUTER.indexOf(n) >= 0 ? ' [세대행성]' : '';
      lines.push(n + ': ' + planets[n].sign + ' ' + planets[n].deg + '도' + houseTxt + genTag);
    }

    if (planets['천왕성'] || planets['해왕성'] || planets['명왕성']) {
      lines.push('');
      lines.push('🚨[세대행성 사용 규칙] 천왕성·해왕성·명왕성은 한 별자리에 7~20년 머물러 같은 세대 전체가 동일하다.');
      lines.push('   따라서 "당신은 명왕성이 전갈자리라 ~합니다" 같은 사인 단독 인용은 또래 수천만 명에게 똑같이 해당되는 일반론이므로 절대 금지.');
      lines.push('   이 세 행성은 반드시 ①어느 하우스에 있는지 ②개인행성(태양·달·수성·금성·화성·상승점)과 몇 도 각을 맺는지 — 이 두 가지만 근거로 써라.');
    }

    // ── 목성 트랜짓 3축 실계산 ──────────────────────────────
    if (asc) {
      const axes = [
        { key: '인연·결혼', target: norm360(asc.abs + 180), limit: 3 },
        { key: '커리어·사회적 성취', target: norm360(asc.abs + 270), limit: 2 },
        { key: '재물·수입', target: norm360(asc.abs + 30), limit: 2 }
      ];
      const blocks = [];
      for (const ax of axes) {
        const w = (findJupiterTransitWindows(ax.target, ax.limit) || []).filter(
          s => typeof s === 'string' && s.length > 0 && s.indexOf('undefined') === -1
        );
        if (w.length) blocks.push('· [' + ax.key + '] ' + w.join(' / '));
      }
      lines.push('');
      if (blocks.length) {
        lines.push('[🪐 실제 계산된 목성 트랜짓 — 시기는 반드시 이 값만 쓸 것. 임의의 연도로 바꾸면 치명적 실패]');
        blocks.forEach(b => lines.push(b));
      } else {
        lines.push('[🪐 실제 계산 결과] 향후 8년간(~2034년) 목성이 주요 축과 뚜렷한 각을 맺는 시기가 없다.');
        lines.push('   이 경우 시기를 단정하지 말고 "지금은 특정 시기를 기다릴 때가 아니라 태도와 자리를 넓힐 때"라고 정직하게 안내하라. 없는 시기를 지어내지 마라.');
      }
    }

    // ── 특이 배치 탐지 ──────────────────────────────────────
    const highlights = [];
    for (const h of Object.keys(houseMap)) {
      const ps = houseMap[h];
      // 🚨 기존 코드는 2개 이상을 스텔리움으로 판정해 프롬프트(3개 이상)와 모순됐다.
      if (ps.length >= 3) {
        highlights.push('【스텔리움】 ' + h + '하우스(' + HOUSE_MEANING[h] + ')에 ' + ps.join('·') + ' ' + ps.length + '개가 몰려 있다 → 이 사람 인생의 최대 화두. 반드시 리포트의 중심으로 다뤄라. 아무나 가질 수 없는 배치다.');
      } else if (ps.length === 2) {
        highlights.push('【집중】 ' + h + '하우스(' + HOUSE_MEANING[h] + ')에 ' + ps.join('·') + ' 2개가 함께 있다 → 이 영역의 비중이 평균보다 크다.');
      }
    }
    if (houseMap[7]) highlights.push('【배우자궁의 행성】 7하우스 안에 ' + houseMap[7].join('·') + '이 있다 → 배우자·관계 해석의 결정적 단서.');
    if (houseMap[12]) highlights.push('【숨겨진 상처】 12하우스에 ' + houseMap[12].join('·') + '이 있다 → 남에게 말 못 한 감정·억눌린 패턴이 있다. 이걸 짚으면 소름 돋는다.');
    if (houseMap[4]) highlights.push('【부모·뿌리】 4하우스에 ' + houseMap[4].join('·') + '이 있다 → 가정환경과 부모와의 관계가 성격 형성에 결정적이었다.');
    if (houseMap[11]) highlights.push('【인간관계】 11하우스에 ' + houseMap[11].join('·') + '이 있다 → 인맥·모임·친구 관계가 인생에서 큰 비중을 차지한다.');
    if (houseMap[8]) highlights.push('【깊은 상처와 변형】 8하우스에 ' + houseMap[8].join('·') + '이 있다 → 얕은 관계로는 만족 못 하는 사람. 또한 타인의 돈·투자·중개로 부를 만드는 재능이 있다.');
    if (houseMap[1]) highlights.push('【강한 자아】 1하우스에 ' + houseMap[1].join('·') + '이 있다 → 존재감이 강하고 첫인상이 뚜렷하다.');
    if (houseMap[6]) highlights.push('【일상·건강】 6하우스에 ' + houseMap[6].join('·') + '이 있다 → 일하는 방식과 몸 상태가 인생의 질을 좌우한다.');

    // ── 재물·직업 축 ────────────────────────────────────────
    const moneyLines = [];
    if (houseMap[2]) moneyLines.push('2하우스(타고난 재능·자산)에 ' + houseMap[2].join('·') + ' → 이 행성들이 돈 버는 능력의 원천이다.');
    if (houseMap[6]) moneyLines.push('6하우스(일하는 방식·기술)에 ' + houseMap[6].join('·') + ' → 실제로 일하는 스타일과 강점.');
    if (houseMap[10]) moneyLines.push('10하우스(커리어·명예)에 ' + houseMap[10].join('·') + ' → 사회적으로 이름을 얻는 분야.');
    if (houseMap[8]) moneyLines.push('8하우스(타인의 자원)에 ' + houseMap[8].join('·') + ' → 투자·중개·타인의 자본을 다루는 재능.');
    if (planets['목성']) moneyLines.push('목성(확장·행운)이 ' + planets['목성'].sign + ' ' + (houseOf['목성'] || '?') + '하우스 → 부가 불어나는 영역. 여기에 투자하면 커진다.');
    if (planets['토성']) moneyLines.push('토성(축적·인내)이 ' + planets['토성'].sign + ' ' + (houseOf['토성'] || '?') + '하우스 → 시간을 들여 단단히 쌓아야 하는 영역. 조급하면 무너진다.');
    if (moneyLines.length) {
      lines.push('');
      lines.push('[💰 재물·직업 분석 재료 — CHAPTER 02에서 반드시 활용하라]');
      moneyLines.forEach(l => lines.push(l));
    }

    // ── 애스펙트 (해석 깊이의 핵심) ──────────────────────────
    const weightOf = n => (PERSONAL.indexOf(n) >= 0 ? 3 : (SOCIAL.indexOf(n) >= 0 ? 2 : 1));
    const raw = [];
    const pnames = Object.keys(planets);
    for (let i = 0; i < pnames.length; i++) {
      for (let j = i + 1; j < pnames.length; j++) {
        const a = pnames[i], b = pnames[j];
        // 세대행성끼리의 각도는 같은 세대 전체가 동일하므로 개인화 근거로 무의미 → 제외
        if (OUTER.indexOf(a) >= 0 && OUTER.indexOf(b) >= 0) continue;
        const diff = angleDiff(planets[a].abs, planets[b].abs);
        for (const asp of ASPECTS) {
          const orbErr = Math.abs(diff - asp.ang);
          if (orbErr <= asp.orb) {
            const key = PAIR_MEANING[a + '-' + b] ? a + '-' + b : (PAIR_MEANING[b + '-' + a] ? b + '-' + a : null);
            if (key && PAIR_MEANING[key][asp.tone]) {
              raw.push({
                score: weightOf(a) + weightOf(b),
                orbErr: orbErr,
                text: '【각도】 ' + key.replace('-', '과 ') + ' ' + asp.name + '(' + asp.tone + ', 오차 ' + orbErr.toFixed(1) + '도) → ' + PAIR_MEANING[key][asp.tone]
              });
            }
            break;
          }
        }
      }
    }
    // 개인행성이 관여한 각도 우선, 그다음 오차가 작은(=강력한) 각도 우선
    raw.sort((x, y) => (y.score - x.score) || (x.orbErr - y.orbErr));
    const aspectLines = raw.slice(0, 10).map(r => r.text);

    if (aspectLines.length) {
      highlights.push('--- 아래는 행성 간 각도다. 이 사람 성격·연애·일 패턴의 가장 정밀한 근거이니 반드시 최소 2개를 해석에 녹여라 ---');
      aspectLines.forEach(l => highlights.push(l));
    }

    if (highlights.length) {
      lines.push('');
      lines.push('[🔬 이 사람만의 특이 배치 — 중심 스토리로 반드시 활용하라]');
      highlights.forEach(h => lines.push(h));
    }

    // ── 달의 교점 ───────────────────────────────────────────
    let nodeInfo = null;
    try {
      const nnLon = calcNorthNode(dateTimeIso);
      const nn = signDeg(nnLon);
      const sn = signDeg(nnLon + 180);
      const meaning = NODE_MEANING[nn.sign];
      lines.push('');
      lines.push('[🔮 전생과 영혼의 과제 — 달의 교점]');
      lines.push('사우스노드(전생에 통달한 것): ' + sn.sign + ' ' + sn.deg + '도');
      lines.push('노스노드(이번 생의 과제): ' + nn.sign + ' ' + nn.deg + '도');
      if (meaning) {
        lines.push('→ 전생의 익숙한 패턴: ' + meaning.south);
        lines.push('→ 이번 생에 반드시 배워야 할 것: ' + meaning.north);
      }
      if (asc) {
        const nh = wholeSignHouse(nnLon, asc.abs);
        const sh = ((nh + 5) % 12) + 1;
        lines.push('노스노드가 ' + nh + '하우스(' + HOUSE_MEANING[nh] + '), 사우스노드가 ' + sh + '하우스(' + HOUSE_MEANING[sh] + ')에 있다 → 이번 생의 성장은 ' + nh + '하우스 영역에서 일어난다.');
      }
      nodeInfo = meaning ? meaning.north : null;
    } catch (e) { /* 교점 실패는 리포트 전체를 막지 않는다 */ }

    // ── 중심 서사 앵커 확정 ─────────────────────────────────
    const core = pickCoreNarrative({ planets, houseMap, houseOf, aspectLines, nodeInfo });

    return { digest: lines.join('\n'), core: core };
  } catch (e) {
    console.error('⚠️ analyzeChart 실패:', e.message);
    return { digest: null, core: null };
  }
}

// ============================================================================
//  🎯 [수정 4-b] 중심 서사 앵커 선정
// ----------------------------------------------------------------------------
//  Gemini 호출을 둘로 쪼개면 각 호출이 서로 다른 배치를 중심으로 잡아
//  리포트가 두 개의 다른 글처럼 갈라질 위험이 있다.
//  그래서 서버가 규칙 기반으로 '중심 배치'를 하나 확정해 양쪽에 똑같이 주입한다.
//  우선순위: 달-토성 각 → 12·8하우스 개인행성 → 스텔리움 → 토성 하우스 → 달 배치
// ============================================================================
function pickCoreNarrative(ctx) {
  const { planets, houseMap, houseOf, aspectLines } = ctx;
  const pick = t => '이 리포트 전체를 관통하는 중심 배치는 【' + t + '】다. 네 챕터 모두 이 배치에서 출발해, 이것이 상처였다가 재능이 되고 결국 이번 생의 과제로 이어지는 하나의 이야기로 써라. 챕터마다 다른 배치를 중심으로 삼지 마라.';

  const moonSaturn = (aspectLines || []).find(l => l.indexOf('달과 토성') >= 0);
  if (moonSaturn) return pick('달과 토성의 각 — 감정을 드러내지 않고 혼자 감당해온 구조') + '\n(근거: ' + moonSaturn + ')';

  const sunSaturn = (aspectLines || []).find(l => l.indexOf('태양과 토성') >= 0);
  if (sunSaturn) return pick('태양과 토성의 각 — 늘 부족하다 느끼며 스스로를 몰아붙여온 구조') + '\n(근거: ' + sunSaturn + ')';

  for (const h of [12, 8]) {
    const ps = (houseMap[h] || []).filter(n => PERSONAL.indexOf(n) >= 0);
    if (ps.length) {
      const label = h === 12 ? '12하우스(무의식·숨겨진 상처)의 ' + ps.join('·') : '8하우스(깊은 결속·변형)의 ' + ps.join('·');
      return pick(label);
    }
  }

  for (const h of Object.keys(houseMap)) {
    if (houseMap[h].length >= 3) {
      return pick(h + '하우스(' + HOUSE_MEANING[h] + ')의 스텔리움 — ' + houseMap[h].join('·') + ' ' + houseMap[h].length + '개 집중');
    }
  }

  if (planets['토성'] && houseOf['토성']) {
    return pick('토성이 자리한 ' + houseOf['토성'] + '하우스(' + HOUSE_MEANING[houseOf['토성']] + ') — 이 영역에서 반복적으로 벽을 만나며 단단해진 구조');
  }

  if (planets['달']) {
    const h = houseOf['달'];
    return pick('달이 자리한 ' + planets['달'].sign + (h ? ' ' + h + '하우스(' + HOUSE_MEANING[h] + ')' : '') + ' — 이 사람 감정의 근본 구조');
  }

  return pick('태양과 상승점이 만드는 기본 기질');
}

// ============================================================================
//  ✍️ 프롬프트 — 공통부
// ----------------------------------------------------------------------------
//  🚨 [수정 1] 분량 지시의 단일 출처(single source of truth)
//     기존에는 [글 쓰는 방식] 6번이 "card1·3·4 각 2000자, card2 2500자"라고 했고
//     JSON 스펙은 "card1 1600자, card2 2000자"라고 해서 서로 모순이었다.
//     모델은 필드 바로 앞의 지시를 따르므로 실제 목표가 1600자로 내려앉아 있었다.
//     → 자수는 JSON 필드 스펙에만 적고, 일반 규칙은 그것을 참조만 한다.
// ============================================================================
function buildCommonPrompt(v) {
  return `
[🚨🚨 절대 금지 - 최우선]
'undefined', 'null', 'NaN', '트랜짓 항목', '데이터에 없음', '하우스맵' 같은 개발자/시스템 용어를 리포트 본문에 절대 쓰지 마라.
손님은 일반인이다. 시스템 내부 사정을 손님에게 설명하지 마라. 어떤 정보가 계산되지 않았다면 그 사실을 언급하지 말고 자연스럽게 다른 근거로 서술하라.

[🚨 시간 기준 - 최우선 규칙]
오늘은 ${v.todayStr}이다. 너의 학습 데이터 기준 연도가 아니라 이 날짜가 진짜 현재다.
미래 예측 시기는 반드시 오늘(${v.todayStr}) 이후의 연도와 월로만 써라. 이미 지난 시기를 미래로 쓰면 치명적인 실패다.

너는 30년간 수많은 사람의 인생을 지켜봐온, 서양 점성술 대가이자 인생 상담가야.
지금 네 앞에는 ${v.name}님이 앉아있어. 이 사람은 삼십만원짜리 인생 리포트를 받으러 온 소중한 손님이야.
네 임무는, 이 사람이 다 읽고 나서 "누군가 드디어 내 인생을 온전히 이해해줬다"며 울컥하게 만드는 거야.

[가장 중요한 원칙]
이 리포트는 따로 노는 글이 아니라 하나로 이어지는 '인생 이야기'다.
CHAPTER 01에서 상처를 정확히 짚고 → 02에서 그 상처가 실은 재능이었다고 뒤집고 → 03에서 나아갈 길과 타이밍을 밝히고 → 04에서 전생부터 이어진 영혼의 과제로 모든 것을 꿰뚫어 납득시키는,
한 편의 영화처럼 감정이 흐르게 써라.

[🎯 중심 서사 - 반드시 지켜라]
${v.core}

[정밀 계산된 네이탈 차트 - 트로피컬(서양식) 기준]
${v.astro}
위 좌표는 실제 천체 계산 결과다. 반드시 이 데이터의 별자리/도수/하우스를 그대로 인용하고, 없는 배치를 절대 지어내지 마라.

[손님 정보] 이름: ${v.name} / 성별: ${v.myGender || '미기재'} / 출생지: ${v.city} / 생년월일시: ${v.date} ${v.time}

[🚨 감정 vs 연민 - 이 리포트의 핵심 톤]
${v.name}님의 감정을 정확히 읽어주는 것(공감)과 불쌍하게 여기는 것(연민)은 완전히 다르다.
- 공감(O): "당신은 힘들 때 아무에게도 기대지 못하고 혼자 삼켜왔습니다" → 마음을 정확히 읽어 문을 연다.
- 연민(X): "얼마나 힘드셨어요", "안타깝네요", "가여운 당신" → 손님을 약자로 만든다. 절대 금지.
🚨 규칙: 감정을 읽어 마음을 연 뒤, 반드시 그 상처를 강점·재능으로 뒤집어 끝내라.
"당신은 늘 혼자 감당해왔습니다(공감) → 그건 약함이 아니라 아무나 못 가진 강인함입니다(반전)" 이 구조가 이 리포트의 심장이다.
손님이 다 읽고 '위로받았다'가 아니라 '내가 이렇게 대단한 사람이었구나'라고 느끼게 하라.

[🚨 강점은 확실하게, 특이점은 콕 집어서]
- 강점은 절대 뭉뚱그리지 말고 "남들은 못 하는데 당신은 되는 것"의 형태로 단정하라. 반드시 이 사람의 실제 배치에서 도출하라.
  배치별 참고: 태양·화성 1하우스 또는 양자리 강함→남보다 먼저 움직여 판을 여는 추진력 / 수성 3·9하우스 또는 쌍둥이·처녀 강함→말과 글로 설명하는 능력 / 금성 강함 또는 천칭·황소→사람 마음을 편하게 만드는 감각, 미적 안목 / 달·물 원소(게·전갈·물고기) 강함→상대 감정을 읽어내는 촉 / 토성 강함 또는 염소·10하우스→끝까지 버텨 결과를 만드는 지구력 / 목성 강함 또는 사수·9하우스→큰 그림을 보고 사람을 끌어들이는 낙천성 / 8·12하우스 강함→표면 아래 본질을 꿰뚫는 통찰 / 11하우스·물병 강함→사람을 모으고 판을 만드는 감각 / 스텔리움→그 하우스 영역의 집중된 재능.
- 차트에서 이 사람만의 특이 배치(스텔리움, 달의 교점, 특정 하우스 집중, 드문 각)를 최소 1개 콕 집어 "이건 아무나 가질 수 없는 배치입니다"라고 강조하라. 평범한 차트처럼 다루면 실패다.

[🚨 성격의 그림자 - 신뢰도의 핵심]
칭찬만 있는 리포트는 '누구한테나 하는 말'처럼 느껴져 안 믿긴다. 뜨끔한 단점을 정확히 짚으면 손님은 '이 사람이 나를 진짜 안다'고 느끼고 앞의 칭찬까지 다 믿게 된다.
- 🚨절대 모두에게 '급하다'고 쓰지 마라. 실제 배치에서 도출되는 것만 골라라:
  화성 양자리·사자·1하우스 또는 불 원소 상승점→급함·욱함 / 수성 쌍둥이·사수·3하우스→산만함 / 수성·화성 처녀·염소→완벽주의로 미룸·잔소리 / 달·금성 게자리·물고기·12하우스→거절 못 함·혼자 삼킴 / 토성 1·10하우스→자기검열·경직 / 천칭·2하우스→우유부단 / 전갈·8하우스→의심 많음·속을 안 보임 / 명왕성이 개인행성과 긴장각→통제 욕구 / 천왕성이 개인행성과 긴장각→싫증·이탈 / 해왕성이 개인행성과 긴장각→회피·이상화.
- 🚨 화법: "성격이 급한 편입니다"처럼 부드럽게 단정하는 톤이 기본. "~합니다", "~하시죠"도 좋다.
  [[발뺌 화법 금지]] "~한 느낌도 있습니다", "~한 면이 있으신 것 같아요", "~할 수도 있어요", "아마 ~일지도"처럼 빠져나갈 구멍을 만드는 표현은 소름을 죽인다. 절대 금지.
- 🚨 균형: 반드시 '강점의 이면'으로 프레임하라. 그 기질이 준 강점을 먼저 인정한 뒤 "다만 그것 때문에 ~할 때가 있죠"로 짚어라. 기죽이지 말되 정확히 찔러라.

[문체 기준]
좋은 예: "<b>${v.name}님의 차트에는 금성·화성·토성 세 별이 전부 12하우스, 숨겨진 방에 몰려 있습니다.</b> 좋아하는 사람이 생겨도 티를 내지 못하고, 힘들어도 괜찮다는 말로 덮어온 것은 성격이 아니라 이 배치가 만든 오래된 습관입니다. <b>그리고 바로 이 배치가, 남의 감정을 누구보다 깊이 읽어내는 당신만의 특별한 재능이 되었습니다.</b>"
나쁜 예(절대 금지): "긍정적으로 생각하세요" 같은 하나마나한 덕담 / 발뺌 화법 / "가여운", "안타까운" 같은 연민 / 강점을 뭉뚱그리는 것 / 교과서적 점성술 일반론.

[글 쓰는 방식]
1. 🚨[차트 근거 필수] 각 챕터마다 최소 1번, 해석 전에 차트상의 근거를 먼저 밝혀라.
   형식: "<b>${v.name}님의 차트를 보면, 달이 OO자리 OO도에 자리하고 있습니다.</b> 이것이 말해주는 것은..." — [차트 근거] → [해석] 순서.
   위 실제 데이터의 행성 위치를 읽고 인용하라. 지어내지 마라. 단, 근거는 챕터당 1~2개만 굵고 명확하게. 용어를 줄줄이 나열해 어렵게 만들지 마라.
2. 근거 뒤의 설명은 쉬운 말로 풀어라. "${v.name}님은~" 하고 이름을 부르며 눈을 마주보고 이야기하듯.
3. 뭉뚱그리지 마라. "힘드셨을 거예요"(X) → "당신은 정작 당신이 힘들 때 아무에게도 기대지 못하고 혼자 삼켜왔습니다"(O)
4. 모든 챕터는 '감정 읽기 → 강점으로 반전 → 구체적 방향' 흐름으로 끝나라. 상처만 파고 끝내지 마라.
5. 강조는 <b> 태그로. 마크다운(*) 절대 금지. 단락 구분은 <br><br>.
6. 🚨[분량] 각 필드에 적힌 최소 자수를 반드시 지켜라. 그 숫자가 유일한 기준이다. 소제목(<b>【소제목】</b>)으로 단락을 나눠 각 단락이 하나의 완결된 이야기가 되게 하라. 짧으면 29,900원 값을 못 한다. 길고 깊게, 그러나 지루하지 않게.
7. 결과는 순수 JSON 객체로만 출력. 앞뒤에 아무것도 붙이지 마.
`;
}

// ── 호출 A: CHAPTER 01 + 02 ────────────────────────────────
function buildPromptA(v) {
  return buildCommonPrompt(v) + `
[출력 JSON 형식 — 아래 두 필드만 출력하라]
{
  "vip_card1": "(최소 2200자) [CHAPTER 01. 내 삶을 갉아먹는 무의식의 방해 공작] 냉정한 진단이되 마지막엔 반드시 강점으로 뒤집어라. 소제목 4개로 나눠 길고 깊게 써라. <b>【타고난 것】</b> 먼저 달·토성·12하우스 등 특이 배치를 차트 근거로 밝히고, 그것이 준 '아무나 못 가진 능력'을 먼저 인정하라. <b>【무의식의 그림자】</b> 🚨위 【각도】 항목 중 최소 1개를 반드시 근거로 인용하라(예: '달과 토성이 각을 이루어, 감정을 드러내면 안 된다고 배우셨습니다'). 이게 정밀함의 핵심이다. 그 능력의 이면에 자리잡은 무의식적 불안·결핍의 정체를 콕 집어라 — 잘 살고 싶은 마음과 반대로 자꾸 스스로를 망치는 선택으로 몰아온 패턴을. 🚨[성격 단점 필수] 이 단락 안에서 화성·수성·상승점 배치를 근거로 실제 성격 단점 1~2개를 '~한 편입니다'로 부드럽게 단정해 콕 집어라. 예시를 베끼지 말고 이 차트에서 도출되는 것만 써라. <b>【반복된 장면】</b> 그 패턴이 관계·일·돈에서 실제로 어떻게 반복됐는지 구체적 장면으로 보여줘라. 두루뭉술한 요약이 아니라 눈에 보이는 장면이어야 한다. <b>【뿌리와 열쇠】</b> 이 패턴이 어디서 시작됐는지(4하우스=가정·부모, 12하우스=숨은 상처) 뿌리를 추적하고, 그것이 결함이 아니라 '너무 일찍 유능해진 대가'였음을, 그리고 그 힘이 앞으로 어떻게 무기가 되는지 방향을 제시하라. 마지막은 <blockquote> 태그로 가슴을 관통하되 힘을 주는 한 문장 (예: '당신은 강한 게 아니라 유능한 사람입니다'). 연민 절대 금지.",
  "vip_card2": "(최소 3000자) [CHAPTER 02. 타고난 재능과, 당신이 두각을 나타낼 자리] 🚨 ${v.name}님이 '내일 당장 뭘 해야 할지' 알게 만드는 실전 챕터다. 톤은 '당신은 이런 걸 타고난 대단한 사람'이라는 확신에 찬 선언. 겸손하게 굴리거나 발뺌하지 마라. 반드시 아래 6개 항목을 모두, 순서대로, <b>【소제목】</b>을 달아 항목당 480자 이상 써라.\\n\\n【1. 타고난 재능】 2하우스(재능·자산), 6하우스(일하는 방식), 10하우스(커리어)와 그 안의 행성을 차트 근거로 밝혀라. 그로부터 타고난 재능 3가지를 콕 집어라. 추상적인 말('창의적입니다') 금지. '남들은 못 하는데 당신은 되는 것'의 형태로 구체적으로 (예: 남이 놓치는 미세한 흐름의 변화를 먼저 감지하는 촉 / 처음 만난 사람도 3분 만에 무장해제시키는 언어 / 모두가 포기한 뒤에도 혼자 남아 끝을 보는 집요함).\\n\\n【2. 두각을 나타낼 직군】 🚨[필수] 위 재능에 맞는 <b>구체적인 직군·업종 3가지를 실명으로</b> 제시하라 (예: 부동산 경매·수익형 부동산, 심리상담·코칭, 온라인 강의 콘텐츠, 브랜드 컨설팅, 데이터 분석, 세무·회계, 커머스 셀러, 크리에이터 등 — 오늘 당장 검색해서 알아볼 수 있는 수준으로). 각 직군마다 '이 차트의 어떤 배치 때문에 맞는지' 근거를 한 줄씩 반드시 붙여라. 그중 <b>가장 강력한 1순위</b>를 못 박아라.\\n\\n【3. 조직인가 독립인가】 10하우스와 토성 위치를 근거로, 조직 안에서 성장할 사람인지 독립해 자기 것을 세울 사람인지 단정하라. '둘 다 가능합니다' 금지. 독립 시점도 짚어라.\\n\\n【4. 나에게 맞는 돈 버는 방식】 2하우스와 8하우스를 근거로 고유한 돈 버는 방식을 밝혀라. 시간을 팔아 버는 사람(월급·수임) / 결과물을 팔아 버는 사람(제품·콘텐츠) / 남의 돈을 굴려 버는 사람(투자·중개) / 신뢰를 자본 삼아 버는 사람(브랜드·커뮤니티) 중 어디인지. <b>절대 손대면 안 되는 돈벌이 방식</b>도 경고하라.\\n\\n【5. 재물이 불어나는 원리】 목성(확장)과 토성(축적)의 위치를 근거로 재물이 커지는 구조를 밝혀라. 한 방에 크게 버는 사람인지, 시간을 들여 복리로 쌓는 사람인지. 자산을 어떤 형태로 굴려야 하는지(부동산·현물·사업지분·현금흐름 중). 위 [목성 트랜짓]의 <b>재물·수입 축 시기를 그대로 인용</b>해 부가 실현되는 시점을 못 박아라.\\n\\n【6. 몸과 일의 리듬】 6하우스·상승점·화성 배치를 근거로, 이 사람이 무리하면 가장 먼저 무너지는 지점과 성과가 최대로 나오는 일하는 방식(단기 집중형인지 장기 지속형인지, 혼자인지 팀인지)을 짚어라. 건강은 의학적 진단이 아니라 '체력과 집중의 리듬' 관점으로만 다뤄라. 마지막은 '나도 할 수 있겠다'는 확신이 서도록 뜨겁게 마무리하라."
}
`;
}

// ── 호출 B: CHAPTER 03 + 04 + 연령대 점수표 ─────────────────
function buildPromptB(v) {
  return buildCommonPrompt(v) + `
[📅 인생 주기 실계산 — 연령대 점수표의 유일한 근거]
${v.lifeCycles || '인생 주기 계산 데이터가 없다. 이 경우 연령대 점수는 차트의 행성 배치(특히 토성과 목성의 하우스)만 근거로 매기고, 특정 연도를 단정하지 마라.'}

[🚨 연령대별 운세 점수 작성 규칙]
- 위 [인생 주기 실계산] 표를 반드시 근거로 삼아라. 토성 리턴·토성 스퀘어가 걸린 구간은 점수가 낮고(시련·재편), 목성 리턴이 걸린 구간은 점수가 높다(확장·기회). 표에 없는 연도를 지어내지 마라.
- 점수는 구간마다 뚜렷하게 차이 나게 매겨라. 최저와 최고가 20점 이상 차이 나야 한다. 전부 비슷한 점수는 실패다.
- 각 설명에는 그 구간에 실제로 걸리는 주기 이름과 연도를 자연스럽게 녹여라 (예: "2020년 토성이 제자리로 돌아오며 그때까지의 관계와 일을 한 번 갈아엎었을 겁니다"). 단, '토성 리턴' 같은 용어는 쉬운 말로 풀어 써라.
- 이미 지난 구간은 "그때 이런 일이 있었을 겁니다"라고 과거를 짚어 맞혀라. 과거를 정확히 맞히면 미래 예측의 신뢰도가 폭발적으로 올라간다. 앞으로 올 구간은 "무엇이 기다리는지" 관점으로.
- best_age는 반드시 위 점수 중 최고점을 매긴 구간과 정확히 일치해야 한다.

[출력 JSON 형식 — 아래 필드를 모두 출력하라]
{
  "vip_card3": "(최소 2200자) [CHAPTER 03. 이제, 당신의 시간이 옵니다] 막연한 희망이 아니라 하늘에 적힌 일정표를 보여주듯 확신 있게 써라. 소제목 4개로 나눠라. 🚨🚨[연도는 반드시 계산된 값 그대로] 위 [🪐 실제 계산된 목성 트랜짓]의 세 축(인연·결혼 / 커리어·사회적 성취 / 재물·수입)을 <b>각각 모두</b> 그대로 인용하라. 절대로 임의의 연도로 바꾸지 마라. 왜 그 시기인지(목성이 그 축과 이루는 각도)를 짧게 설명하라. '뚜렷한 트랜짓이 없다'는 결과라면 그 사실을 정직하게 인정하며 시기보다 태도·행동에 집중하라는 방향으로 안내하라. 시기 생략이나 임의 변경 절대 금지. 그리고 <b>【놓아줘야 할 것】</b>에서 진짜 행복해지기 위해 내려놔야 할 것을 짚고, <b>【곁에 두면 안 되는 사람】</b>에서 ${v.name}님을 갉아먹는 사람의 유형(레드플래그)을 <span style='color:#ff3b30;font-weight:900;'>빨간 글씨</span>로 분명히 경고하라. 이 유형도 차트 근거(7하우스·8하우스·12하우스 배치)에서 도출하라. 마지막은 ${v.name}님을 굳게 믿어주는 뜨거운 축복으로 끝내라.",
  "vip_card4": "(최소 2000자) [CHAPTER 04. 전생의 당신, 이번 생의 과제] 🔮 위 [전생과 영혼의 과제 - 달의 교점] 항목을 반드시 근거로 삼아라. 소제목으로 나눠 길고 깊게 써라. ① <b>【전생에 통달한 것】</b> 사우스노드를 근거로, ${v.name}님이 전생에서 이미 완벽히 익혔기에 이번 생에도 너무 익숙하고 편안한 패턴을 짚어라. 이걸 먼저 '대단한 강함'으로 인정하라 (예: '당신은 어떤 위기가 와도 자기 힘으로 일어서는, 근본적으로 강한 영혼입니다'). ② <b>【익숙함의 함정】</b> 그래서 힘들 때마다 자꾸 그 익숙한 자리로 도망쳐 왔다는 것을, 왜 그 길이 안전하지만 공허해지는지 설명하라. ③ <b>【이번 생의 과제】</b> 노스노드를 근거로 이번 생에 반드시 배워야 할 것을 밝혀라 — 불편하고 어색하지만 바로 거기에 성장과 가장 큰 행복이 있음을. ④ 앞 챕터(무의식의 그림자, 타고난 재능, 다가올 시기)와 연결해, 그 모든 게 하나의 인생 이야기로 납득되게 하라. ⑤ 마지막은 <blockquote> 태그로 '${v.name}님이 이번 생에 풀어야 할 단 하나의 숙제'를, 약해지라는 게 아니라 '이미 강한 당신이 이제 함께 나눌 사람을 만나는 것'이라는 힘 있는 방향으로 못 박아라. 연민 금지, 강함을 전제로.",
  "life_score_10": 점수숫자만,
  "life_desc_10": "(2~3문장) 10대의 흐름 — 이 시기에 뿌려진 씨앗과 그것이 지금까지 남긴 것",
  "life_score_20": 점수숫자만,
  "life_desc_20": "(2~3문장) 20대의 흐름과 핵심",
  "life_score_30": 점수숫자만,
  "life_desc_30": "(2~3문장) 30대의 흐름과 핵심",
  "life_score_40": 점수숫자만,
  "life_desc_40": "(2~3문장) 40대의 흐름과 핵심",
  "life_score_50": 점수숫자만,
  "life_desc_50": "(2~3문장) 50대의 흐름과 핵심",
  "life_score_60": 점수숫자만,
  "life_desc_60": "(2~3문장) 60대의 흐름과 핵심",
  "life_score_70": 점수숫자만,
  "life_desc_70": "(2~3문장) 70대의 흐름과 핵심",
  "life_score_80": 점수숫자만,
  "life_desc_80": "(2~3문장) 80대의 흐름 — 인생을 마무리하는 시기",
  "best_age": "가장 점수 높은 연령대 (예: 40대)",
  "best_age_reason": "(3~4문장) 왜 그 시기가 인생의 황금기인지, 위 인생 주기 표의 실제 연도와 차트 근거를 함께 들어 설명"
}
`;
}

// ============================================================================
//  🤖 Gemini 호출 헬퍼
// ----------------------------------------------------------------------------
//  🚨 [수정 2] maxOutputTokens 32768 → 65536
//     Gemini 2.5는 thinking 토큰이 output 예산에서 차감된다. 기존 설정으로는
//     목표 분량이 상한에 붙어 모델이 스스로 분량을 줄여 썼다.
//  🚨 [수정 4] 1회 호출 → 2회 병렬 호출. 각 호출이 독립적인 출력·사고 예산을
//     갖게 되어 실질 분량과 깊이가 함께 올라간다. 병렬이므로 체감 시간은 동일.
// ============================================================================
const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';
const MAX_ATTEMPTS = 3;

function extractJson(text) {
  const s = text.indexOf('{');
  const e = text.lastIndexOf('}');
  if (s === -1 || e === -1 || e <= s) return null;
  try {
    return JSON.parse(text.slice(s, e + 1));
  } catch (err) {
    // 후행 쉼표 등 흔한 깨짐 1차 복구
    try {
      return JSON.parse(text.slice(s, e + 1).replace(/,\s*([}\]])/g, '$1'));
    } catch (err2) {
      return null;
    }
  }
}

async function callGemini(opts) {
  const { prompt, thinkingBudget, label, validate } = opts;
  let lastErr = '';

  for (let attempt = 1; attempt <= MAX_ATTEMPTS; attempt++) {
    const isLast = attempt === MAX_ATTEMPTS;
    try {
      const r = await fetch(GEMINI_URL + '?key=' + process.env.GEMINI_API_KEY, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{ parts: [{ text: prompt }] }],
          generationConfig: {
            maxOutputTokens: 65536,
            temperature: 0.95,
            responseMimeType: 'application/json',
            thinkingConfig: { thinkingBudget: thinkingBudget }
          }
        })
      });

      if (!r.ok) {
        lastErr = 'Gemini ' + r.status + ': ' + (await r.text()).slice(0, 300);
        console.error('🔥 [' + label + ' 시도 ' + attempt + '] ' + lastErr);
        if (r.status === 503 || r.status === 429) await new Promise(s => setTimeout(s, 1500 * attempt));
        continue;
      }

      const j = await r.json();
      const cand = j.candidates && j.candidates[0];
      // MAX_TOKENS로 잘렸으면 JSON이 깨지므로 원인을 명확히 남긴다
      if (cand && cand.finishReason && cand.finishReason !== 'STOP') {
        console.warn('⚠️ [' + label + '] finishReason=' + cand.finishReason);
      }
      const parts = (cand && cand.content && cand.content.parts) || [];
      const text = parts.map(p => p.text || '').join('');
      const parsed = extractJson(text);

      if (!parsed) {
        lastErr = '응답 JSON 파싱 실패: ' + text.slice(0, 200);
        console.error('🔥 [' + label + ' 시도 ' + attempt + '] ' + lastErr);
        continue;
      }

      const check = validate(parsed, isLast);
      if (!check.ok) {
        lastErr = '품질 미달: ' + check.reason;
        console.warn('⚠️ [' + label + ' 시도 ' + attempt + '] ' + lastErr);
        if (!isLast) continue;
      }

      console.log('✅ [' + label + '] 성공 (시도 ' + attempt + ')' + (check.ok ? '' : ' — 마지막 시도라 품질 미달 상태로 채택'));
      return { ok: true, data: parsed };
    } catch (err) {
      lastErr = err.message;
      console.error('🔥 [' + label + ' 시도 ' + attempt + '] ' + err.message);
    }
  }
  return { ok: false, error: '[' + label + '] ' + lastErr };
}

// 분량·필드 검증 (엄격 기준 = 목표 자수의 70%)
function makeValidator(specs) {
  return (d, lenient) => {
    for (const s of specs) {
      const v = d[s.key];
      if (s.numeric) {
        if (v === undefined || v === null || isNaN(Number(v))) return { ok: false, reason: s.key + ' 누락/비숫자' };
        continue;
      }
      if (typeof v !== 'string' || v.trim().length === 0) return { ok: false, reason: s.key + ' 누락' };
      if (!lenient && s.min && v.length < s.min) {
        return { ok: false, reason: s.key + ' 분량 부족(' + v.length + '자 < ' + s.min + '자)' };
      }
    }
    return { ok: true };
  };
}

const VALIDATE_A = makeValidator([
  { key: 'vip_card1', min: 1540 },
  { key: 'vip_card2', min: 2100 }
]);

const VALIDATE_B = makeValidator([
  { key: 'vip_card3', min: 1540 },
  { key: 'vip_card4', min: 1400 },
  { key: 'best_age' },
  { key: 'best_age_reason' },
  { key: 'life_score_10', numeric: true },
  { key: 'life_score_20', numeric: true },
  { key: 'life_score_30', numeric: true },
  { key: 'life_score_40', numeric: true },
  { key: 'life_score_50', numeric: true },
  { key: 'life_score_60', numeric: true },
  { key: 'life_score_70', numeric: true },
  { key: 'life_score_80', numeric: true }
]);

// 점수 정규화 — 프론트가 숫자를 기대하므로 문자열로 와도 숫자로 강제
function normalizeScores(d) {
  const decades = [10, 20, 30, 40, 50, 60, 70, 80];
  let best = null, bestScore = -1;
  for (const dec of decades) {
    const k = 'life_score_' + dec;
    let n = Number(d[k]);
    if (isNaN(n)) n = 50;
    n = Math.max(1, Math.min(100, Math.round(n)));
    d[k] = n;
    if (n > bestScore) { bestScore = n; best = dec + '대'; }
  }
  const spread = bestScore - Math.min.apply(null, decades.map(x => d['life_score_' + x]));
  if (spread < 20) console.warn('⚠️ 연령대 점수 편차가 ' + spread + '점뿐 — 프롬프트 준수 미흡');
  if (d.best_age && best && String(d.best_age).indexOf(best.replace('대', '')) === -1) {
    console.warn('⚠️ best_age(' + d.best_age + ')와 최고점 구간(' + best + ') 불일치 — 본문 설명과 어긋날 수 있으니 확인 필요');
  }
  if (!d.best_age) d.best_age = best;
  return d;
}

// ============================================================================
//  🚀 핸들러
// ============================================================================
const handler = async (req, res) => {
  // ── 다시보기: GET + orderId ──────────────────────────────
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get('vip-report:' + orderId);
      if (saved) {
        res.setHeader('Cache-Control', 'no-store');
        return res.status(200).json(saved);
      }
      return res.status(404).json({ error: '저장된 리포트 없음' });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log('✅ [1] gemini-vip.js 진입');

  try {
    const { name, date, time, city, myGender } = req.body || {};

    if (!name || !date || !time) return res.status(400).json({ error: '필수 입력값 누락' });
    if (!process.env.GEMINI_API_KEY) return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수 없음' });

    let location = cityCoordinates[city];
    if (!location) {
      console.error('⚠️ 출생지 좌표 없음: "' + city + '" → 서울로 임시 처리. 도시 목록 확인 필요!');
      location = cityCoordinates['Seoul'];
    }
    const dateTimeIso = buildBirthIso(date, time, city);

    // ── 천체 데이터 ─────────────────────────────────────────
    let astrologyDataText = '정밀 천체 궤도 역산 데이터 기반.';
    let core = '중심 배치를 하나 골라 네 챕터를 하나의 이야기로 이어라.';
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
        const tokenRes = await fetch('https://api.prokerala.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({
            grant_type: 'client_credentials',
            client_id: process.env.PROKERALA_CLIENT_ID,
            client_secret: process.env.PROKERALA_CLIENT_SECRET
          })
        });
        if (tokenRes.ok) {
          const tokenData = await tokenRes.json();
          const astroRes = await fetch(
            'https://api.prokerala.com/v2/astrology/planet-position?datetime=' +
            encodeURIComponent(dateTimeIso) + '&coordinates=' + location.lat + ',' + location.lon + '&ayanamsa=1',
            { headers: { Authorization: 'Bearer ' + tokenData.access_token } }
          );
          if (astroRes.ok) {
            const astroJson = await astroRes.json();
            const r = analyzeChart(astroJson.data, dateTimeIso);
            if (r.digest) {
              astrologyDataText = r.digest;
              if (r.core) core = r.core;
              console.log('📊 차트 다이제스트:\n' + r.digest);
            }
          } else {
            console.log('⚠️ Prokerala planet-position 실패: ' + astroRes.status);
          }
        }
      }
    } catch (e) {
      console.log('⚠️ Prokerala Fallback (VIP):', e.message);
    }

    // ── 인생 주기 실계산 ────────────────────────────────────
    const lifeCycles = buildLifeCycles(date);
    if (lifeCycles) console.log('📅 인생 주기:\n' + lifeCycles);

    const now = new Date();
    const v = {
      name: name,
      date: date,
      time: time,
      city: city,
      myGender: myGender,
      astro: astrologyDataText,
      core: core,
      lifeCycles: lifeCycles,
      todayStr: now.getFullYear() + '년 ' + (now.getMonth() + 1) + '월 ' + now.getDate() + '일'
    };

    console.log('✅ [2] 차트 준비 완료 → Gemini 2회 병렬 호출 시작');

    // ── 병렬 호출 ───────────────────────────────────────────
    const [resA, resB] = await Promise.all([
      callGemini({
        prompt: buildPromptA(v),
        thinkingBudget: 8192,   // 재능·직업·돈 분석이 가장 많은 추론을 요구한다
        label: 'CH01-02',
        validate: VALIDATE_A
      }),
      callGemini({
        prompt: buildPromptB(v),
        thinkingBudget: 6144,
        label: 'CH03-04+점수표',
        validate: VALIDATE_B
      })
    ]);

    if (!resA.ok || !resB.ok) {
      const err = [resA.ok ? null : resA.error, resB.ok ? null : resB.error].filter(Boolean).join(' | ');
      console.error('🔥 병렬 호출 실패:', err);
      return res.status(500).json({ error: '[Gemini VIP 실패] ' + err });
    }

    const parsedData = normalizeScores(Object.assign({}, resA.data, resB.data));

    console.log('✅ [3] 병합 완료 — 분량: card1 ' + (parsedData.vip_card1 || '').length +
      ' / card2 ' + (parsedData.vip_card2 || '').length +
      ' / card3 ' + (parsedData.vip_card3 || '').length +
      ' / card4 ' + (parsedData.vip_card4 || '').length + '자');

    // ── 저장 (🚨 [수정 6] 30일 → 1년) ────────────────────────
    if (req.body.orderId) {
      try {
        await kv.set('vip-report:' + req.body.orderId, parsedData, { ex: 60 * 60 * 24 * 365 });
        console.log('💾 KV 저장 완료(1년): vip-report:' + req.body.orderId);
      } catch (e) {
        console.log('⚠️ KV 저장 실패(리포트 전송은 정상 진행):', e.message);
      }
    }

    res.setHeader('Cache-Control', 'no-store');
    return res.status(200).json(parsedData);

  } catch (error) {
    console.error('🔥 gemini-vip.js 에러:', error);
    return res.status(500).json({ error: '[VIP 서버 에러] ' + error.message });
  }
};

module.exports = allowCors(handler);
