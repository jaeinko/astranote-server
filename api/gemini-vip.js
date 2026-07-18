// ✅ @google/generative-ai SDK 완전 제거 → fetch 직접 호출
// ✅ 인생 전체 풀이 + 연령대별 운세 점수표 추가 버전

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


// ===== 🔬 차트 정밀 다이제스트 =====
// Prokerala의 베딕(사이더리얼) 좌표를 서양 점성술(트로피컬)로 보정하고,
// AI가 바로 이해할 수 있는 한국어 요약으로 변환합니다. 이게 리포트 품질의 핵심입니다.
const SIGNS_KR = ['양자리','황소자리','쌍둥이자리','게자리','사자자리','처녀자리','천칭자리','전갈자리','사수자리','염소자리','물병자리','물고기자리'];
const PLANET_KR = { Sun:'태양', Moon:'달', Mercury:'수성', Venus:'금성', Mars:'화성', Jupiter:'목성', Saturn:'토성', Ascendant:'상승점' };

function lahiriAyanamsa(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const y = d.getUTCFullYear() + (d.getUTCMonth() + 1) / 12;
  return 23.853 + 0.013972 * (y - 2000); // 라히리 아야남샤 근사치
}
function signDeg(lon) {
  const l = ((lon % 360) + 360) % 360;
  return { sign: SIGNS_KR[Math.floor(l / 30)], deg: (l % 30).toFixed(1), abs: l };
}
function buildChartDigest(data, dateTimeIso) {
  try {
    const list = data.planet_position || data.planet_positions || [];
    if (!list.length) return null;
    const ay = lahiriAyanamsa(dateTimeIso);
    const planets = {};
    for (const p of list) {
      const nameKr = PLANET_KR[p.name];
      if (!nameKr || typeof p.longitude !== 'number') continue;
      planets[nameKr] = signDeg(p.longitude + ay); // 사이더리얼 → 트로피컬 보정
    }
    const asc = planets['상승점'];
    const lines = [];
    if (asc) {
      const dsc = signDeg(asc.abs + 180);
      lines.push(`상승점(ASC): ${asc.sign} ${asc.deg}도`);
      lines.push(`7하우스(배우자궁) 시작점: ${dsc.sign} ${dsc.deg}도 ← 배우자 해석의 최우선 근거`);

      // 🪐 실제 계산된 목성 트랜짓 (사람마다 달라야 하는 만남 시기의 유일한 근거)
      const jupiterWindows = findJupiterTransitWindows(dsc.abs);
      // 🚨 안전장치: 결과가 비었거나 undefined가 섞이면 '없음'으로 처리 (리포트에 undefined 노출 방지)
      const validWindows = (jupiterWindows || []).filter(function(w) {
        return typeof w === 'string' && w.length > 0 && w.indexOf('undefined') === -1;
      });
      if (validWindows.length > 0) {
        lines.push(`\n[실제 계산된 목성 트랜짓 - 이 시기만 만남 시기로 사용하라]`);
        validWindows.forEach((w, i) => lines.push((i+1) + '순위 시기: ' + w));
      } else {
        lines.push(`\n[실제 계산 결과] 향후 8년간(~2034년) 목성이 배우자궁과 뚜렷한 각을 맺는 시기가 없다. 이 경우 만남 시기를 단정하지 말고, "현재는 특별히 두드러진 트랜짓이 없어 시기보다 태도와 만남의 자리를 넓히는 데 집중할 시점"이라고 정직하게 안내하라. 없는 시기를 지어내지 마라.`);
      }
    }
    // 하우스별 인생 영역 의미 (리포트 깊이의 핵심 재료)
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

    const houseMap = {};  // 하우스별 행성 모음 (스텔리움 탐지용)
    for (const n of ['태양','달','수성','금성','화성','목성','토성']) {
      if (!planets[n]) continue;
      let houseTxt = '';
      if (asc) {
        const h = ((Math.floor((((planets[n].abs)%360+360)%360)/30) - Math.floor(((asc.abs%360+360)%360)/30)) % 12 + 12) % 12 + 1;
        houseMap[h] = houseMap[h] || [];
        houseMap[h].push(n);
        houseTxt = ` (${h}하우스 = ${HOUSE_MEANING[h]}${h === 7 ? ' ★배우자궁 안! 최우선 근거' : ''})`;
      }
      lines.push(`${n}: ${planets[n].sign} ${planets[n].deg}도${houseTxt}`);
    }

    // 🔬 이 사람만의 '특이 배치' 자동 탐지 → AI가 중심 스토리로 삼을 재료
    const highlights = [];
    for (const [h, ps] of Object.entries(houseMap)) {
      if (ps.length >= 2) {
        highlights.push(`【스텔리움】 ${h}하우스(${HOUSE_MEANING[h]})에 ${ps.join('·')} ${ps.length}개가 몰려 있다 → 이 사람 인생의 최대 화두. 반드시 깊게 다뤄라.`);
      }
    }
    if (houseMap[7]) highlights.push(`【배우자궁의 행성】 7하우스 안에 ${houseMap[7].join('·')}이 있다 → 배우자 해석의 결정적 단서.`);
    if (houseMap[12]) highlights.push(`【숨겨진 상처】 12하우스에 ${houseMap[12].join('·')}이 있다 → 남에게 말 못 한 감정·억눌린 패턴이 있다. 이걸 짚으면 소름 돋는다.`);
    if (houseMap[4]) highlights.push(`【부모·뿌리】 4하우스에 ${houseMap[4].join('·')}이 있다 → 가정환경과 부모와의 관계가 이 사람 성격 형성에 결정적이었다.`);
    if (houseMap[11]) highlights.push(`【인간관계】 11하우스에 ${houseMap[11].join('·')}이 있다 → 인맥·모임·친구 관계가 인생에서 큰 비중을 차지한다.`);
    if (houseMap[8]) highlights.push(`【깊은 상처와 변형】 8하우스에 ${houseMap[8].join('·')}이 있다 → 얕은 관계로는 만족 못 하는 사람. 깊은 결속을 갈망한다. 또한 타인의 돈·투자·중개로 부를 만드는 재능이 있다.`);

    // 💰 재물·직업 축 (CHAPTER 02 전용 재료)
    const moneyLines = [];
    if (houseMap[2]) moneyLines.push(`2하우스(타고난 재능·자산)에 ${houseMap[2].join('·')} → 이 행성들이 '돈 버는 능력'의 원천이다.`);
    if (houseMap[6]) moneyLines.push(`6하우스(일하는 방식·기술)에 ${houseMap[6].join('·')} → 이 사람이 실제로 일하는 스타일과 강점.`);
    if (houseMap[10]) moneyLines.push(`10하우스(커리어·명예)에 ${houseMap[10].join('·')} → 사회적으로 이름을 얻는 분야.`);
    if (planets['목성']) {
      const jh = asc ? ((Math.floor((((planets['목성'].abs)%360+360)%360)/30) - Math.floor(((asc.abs%360+360)%360)/30)) % 12 + 12) % 12 + 1 : 0;
      moneyLines.push(`목성(확장·행운)이 ${planets['목성'].sign} ${jh}하우스 → 부가 불어나는 영역. 여기에 투자하면 커진다.`);
    }
    if (planets['토성']) {
      const sh = asc ? ((Math.floor((((planets['토성'].abs)%360+360)%360)/30) - Math.floor(((asc.abs%360+360)%360)/30)) % 12 + 12) % 12 + 1 : 0;
      moneyLines.push(`토성(축적·인내)이 ${planets['토성'].sign} ${sh}하우스 → 시간을 들여 단단히 쌓아야 하는 영역. 조급하면 무너진다.`);
    }
    if (moneyLines.length) {
      lines.push('\n[💰 재물·직업 분석 재료 - CHAPTER 02에서 반드시 활용하라]');
      moneyLines.forEach(l => lines.push(l));
    }

    // 🔭 행성 간 각도(애스펙트) 자동 탐지 → 해석 깊이의 핵심
    const ASPECTS = [
      { ang: 0,   name: '합',    orb: 7, tone: '융합' },
      { ang: 180, name: '대립',  orb: 6, tone: '긴장' },
      { ang: 120, name: '삼각',  orb: 6, tone: '조화' },
      { ang: 90,  name: '사각',  orb: 6, tone: '긴장' },
      { ang: 60,  name: '육각',  orb: 4, tone: '조화' }
    ];
    const PAIR_MEANING = {
      '태양-달': { 조화: '겉과 속이 일치해 자기 자신과 사이가 좋다', 긴장: '하고 싶은 것과 마음이 원하는 것이 자주 어긋나 스스로 갈등한다', 융합: '자기 감정과 의지가 한 덩어리라 몰입이 강하다' },
      '태양-토성': { 조화: '어릴 때부터 책임감이 몸에 배어 신뢰를 얻는다', 긴장: '늘 부족하다고 느끼며 스스로를 몰아붙인다. 인정받는 데 목마르다', 융합: '일찍 어른이 된 사람. 무겁지만 단단하다' },
      '달-토성': { 조화: '감정을 절제할 줄 아는 어른스러움', 긴장: '감정을 드러내면 안 된다고 배워 혼자 삼킨다. 외로움의 뿌리', 융합: '정서적으로 일찍 독립했지만 그만큼 결핍이 있다' },
      '달-명왕성': { 조화: '사람 속을 꿰뚫는 깊은 감정 통찰', 긴장: '애착이 강해 집착·통제를 사랑으로 착각하기 쉽다', 융합: '감정의 밀도가 극단적으로 깊다' },
      '금성-토성': { 조화: '오래가는 진중한 사랑을 만든다', 긴장: '사랑에 조건을 붙이거나 마음을 늦게 연다. 애정 결핍의 흔적', 융합: '가볍게 사랑하지 못하는 사람. 늦지만 깊다' },
      '금성-천왕성': { 조화: '연애에서 자유롭고 독특한 매력', 긴장: '설렘에 훅 빠졌다 훅 식는다. 구속을 못 견딘다', 융합: '평범한 관계로는 만족 못 한다' },
      '금성-해왕성': { 조화: '낭만적이고 예술적인 사랑의 감각', 긴장: '콩깍지가 두꺼워 상대를 이상화하다 상처받는다', 융합: '사랑을 환상으로 그리는 사람' },
      '화성-토성': { 조화: '끈질기게 밀어붙여 결과를 낸다', 긴장: '하고 싶은데 브레이크가 걸린다. 참다가 한 번에 터진다', 융합: '욕망을 억누르며 사는 사람' },
      '화성-명왕성': { 조화: '한번 정하면 끝을 보는 폭발적 추진력', 긴장: '관계의 온도가 극단적이다. 격렬하게 타오르다 파괴적으로 끝난다', 융합: '집념이 무섭게 강하다' },
      '수성-토성': { 조화: '깊이 있게 사고하고 신중하게 말한다', 긴장: '말하기 전에 재고 또 재느라 표현이 늦다', 융합: '생각이 무겁고 진지하다' },
      '태양-목성': { 조화: '운이 따르고 사람이 모인다', 긴장: '자신감이 과해 일을 크게 벌인다', 융합: '스케일이 큰 사람' },
      '달-금성': { 조화: '정서적으로 따뜻하고 사랑스러운 기질', 긴장: '애정 욕구와 감정 사이에서 흔들린다', 융합: '사랑받고 싶은 마음이 크다' }
    };
    const aspectLines = [];
    const pnames = Object.keys(planets).filter(n => planets[n]);
    for (let i = 0; i < pnames.length; i++) {
      for (let j = i + 1; j < pnames.length; j++) {
        const a = pnames[i], b = pnames[j];
        let diff = Math.abs(planets[a].abs - planets[b].abs) % 360;
        if (diff > 180) diff = 360 - diff;
        for (const asp of ASPECTS) {
          if (Math.abs(diff - asp.ang) <= asp.orb) {
            const key = PAIR_MEANING[`${a}-${b}`] ? `${a}-${b}` : (PAIR_MEANING[`${b}-${a}`] ? `${b}-${a}` : null);
            if (key) {
              const meaning = PAIR_MEANING[key][asp.tone];
              if (meaning) aspectLines.push(`【각도】 ${a}-${b} ${asp.name}(${asp.tone}, 오차 ${Math.abs(diff - asp.ang).toFixed(1)}도) → ${meaning}`);
            }
            break;
          }
        }
      }
    }
    if (aspectLines.length) {
      highlights.push('--- 아래는 행성 간 각도다. 이 사람 성격·연애 패턴의 가장 정밀한 근거이니 반드시 최소 2개는 해석에 녹여라 ---');
      aspectLines.slice(0, 8).forEach(l => highlights.push(l));
    }

    if (highlights.length) {
      lines.push('\n[🔬 이 사람만의 특이 배치 - 중심 스토리로 반드시 활용하라]');
      highlights.forEach(h => lines.push(h));
    }
    // 🔮 전생/영혼의 과제 (달의 교점)
    try {
      const nnLon = calcNorthNode(dateTimeIso);
      const nn = signDeg(nnLon);
      const sn = signDeg(nnLon + 180);
      const meaning = NODE_MEANING[nn.sign];
      lines.push('\n[🔮 전생과 영혼의 과제 - 달의 교점]');
      lines.push(`사우스노드(전생에 통달한 것): ${sn.sign} ${sn.deg}도`);
      lines.push(`노스노드(이번 생의 과제): ${nn.sign} ${nn.deg}도`);
      if (meaning) {
        lines.push(`→ 전생의 익숙한 패턴: ${meaning.south}`);
        lines.push(`→ 이번 생에 반드시 배워야 할 것: ${meaning.north}`);
      }
      if (asc) {
        const nh = ((Math.floor((((nnLon)%360+360)%360)/30) - Math.floor(((asc.abs%360+360)%360)/30)) % 12 + 12) % 12 + 1;
        const sh = ((nh + 5) % 12) + 1;
        lines.push(`노스노드가 ${nh}하우스, 사우스노드가 ${sh}하우스에 있다 → 이번 생의 성장은 ${nh}하우스 영역에서 일어난다.`);
      }
    } catch (e) {}

    return lines.join('\n');
  } catch (e) { return null; }
}


// ===== 🪐 실제 목성 트랜짓 계산 (2026.08 ~ 2034.12, 매달) =====
// 사람마다 배우자궁을 지나는 진짜 시기가 다르도록, 실제 천문 계산값을 표로 저장해두고 조회한다.
// 이렇게 해야 모든 손님의 만남 시기가 2026~2028로 획일화되는 문제가 사라진다.
const JUPITER_TABLE_START = { year: 2026, month: 8 };
const JUPITER_LON_TABLE = [126.96,133.7,139.59,144.32,146.79,146.44,143.35,139.75,137.23,137.49,140.41,145.13,151.2,157.84,164.27,170.28,174.81,177.31,176.9,174.08,170.18,167.79,168.03,170.79,175.57,181.59,187.99,194.6,200.38,204.96,207.28,206.89,203.95,200.22,197.76,197.94,200.73,205.53,211.39,218.07,224.54,230.57,235.17,237.39,237.11,234.33,230.5,228.06,228.19,231.01,235.72,241.9,248.52,255.37,261.56,265.92,268.66,268.61,265.9,262.17,259.5,259.53,262.23,267.17,273.31,280.36,287.44,293.49,298.64,301.6,301.9,299.51,295.63,292.76,292.59,295.31,300.16,306.66,313.91,320.52,327.3,332.71,336.34,337.28,335.32,331.47,328.28,327.59,329.89,334.74,341.23,347.82,355.28,2.1,8.1,12.22,13.94,12.61,9.06,5.35,4.03];

function angleDiff(a, b) {
  let d = Math.abs(a - b) % 360;
  return d > 180 ? 360 - d : d;
}

function findJupiterTransitWindows(targetDeg) {
  // 여러 각도를 모두 수집한 뒤 시간순 정렬 → 가까운 미래부터 제시
  const aspects = [
    { name: '합 · 강력', angle: 0, orb: 6, weight: 3 },
    { name: '삼각 · 우호적', angle: 120, orb: 5, weight: 2 },
    { name: '삼각 · 우호적', angle: 240, orb: 5, weight: 2 },
    { name: '육각 · 기회', angle: 60, orb: 4, weight: 1 },
    { name: '육각 · 기회', angle: 300, orb: 4, weight: 1 }
  ];

  const all = [];
  for (const asp of aspects) {
    let inWindow = false;
    let windowStart = null;
    for (let i = 0; i < JUPITER_LON_TABLE.length; i++) {
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

  // 시간순 정렬 (가까운 미래부터)
  all.sort(function(a, b) { return a.start - b.start; });

  return all.slice(0, 3).map(function(w) {
    const sy = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + w.start) / 12);
    const sm = ((JUPITER_TABLE_START.month - 1 + w.start) % 12) + 1;
    const ey = JUPITER_TABLE_START.year + Math.floor((JUPITER_TABLE_START.month - 1 + w.end) / 12);
    const em = ((JUPITER_TABLE_START.month - 1 + w.end) % 12) + 1;
    const period = (sy === ey)
      ? sy + '년 ' + sm + '월~' + em + '월'
      : sy + '년 ' + sm + '월 ~ ' + ey + '년 ' + em + '월';
    return period + ' (목성 ' + w.name + ')';
  });
}


// ===== 🔮 전생/영혼의 과제: 달의 교점(Lunar Nodes) 계산 =====
// 사우스노드 = 전생에 통달한 것(자꾸 도망치는 익숙한 습관)
// 노스노드 = 이번 생에 배워야 할 것(불편하지만 성장이 있는 방향)
function calcNorthNode(dateTimeIso) {
  const d = new Date(dateTimeIso);
  const jd = (d.getTime() / 86400000) + 2440587.5;
  const T = (jd - 2451545.0) / 36525.0;
  let omega = 125.04452 - 1934.136261 * T + 0.0020708 * T * T + (T * T * T) / 450000;
  return ((omega % 360) + 360) % 360;
}

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

const handler = async (req, res) => {
  // 🚨 [다시보기 기능] GET + orderId → 저장된 VIP 리포트 즉시 조회
  if (req.method === 'GET') {
    const orderId = req.query && req.query.orderId;
    if (!orderId) return res.status(400).json({ error: 'orderId 필요' });
    try {
      const saved = await kv.get(`vip-report:${orderId}`);
      if (saved) return res.status(200).json(saved);
      return res.status(404).json({ error: '저장된 리포트 없음' });
    } catch (e) {
      return res.status(500).json({ error: 'KV 조회 실패: ' + e.message });
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'POST 요청만 받습니다.' });

  console.log("✅ [1] gemini-vip.js 진입 성공");

  try {
    const { name, date, time, city, myGender, targetGender } = req.body;

    if (!name || !date || !time) {
      return res.status(400).json({ error: '필수 입력값 누락' });
    }
    if (!process.env.GEMINI_API_KEY) {
      return res.status(500).json({ error: 'GEMINI_API_KEY 환경변수 없음' });
    }

    let location = cityCoordinates[city];
    if (!location) {
        console.error(`⚠️ 출생지 좌표 없음: "${city}" → 서울로 임시 처리됨. 도시 목록 확인 필요!`);
        location = cityCoordinates["Seoul"];
    }
    const dateTimeIso = `${date.replace(/\./g, '-')}T${time}:00+09:00`;

    let astrologyDataText = "정밀 천체 궤도 역산 데이터 기반.";
    try {
      if (process.env.PROKERALA_CLIENT_ID && process.env.PROKERALA_CLIENT_SECRET) {
        const tokenResponse = await fetch('https://api.prokerala.com/token', {
          method: 'POST',
          headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
          body: new URLSearchParams({ grant_type: 'client_credentials', client_id: process.env.PROKERALA_CLIENT_ID, client_secret: process.env.PROKERALA_CLIENT_SECRET })
        });
        if (tokenResponse.ok) {
          const tokenData = await tokenResponse.json();
          const astroResponse = await fetch(
            `https://api.prokerala.com/v2/astrology/planet-position?datetime=${encodeURIComponent(dateTimeIso)}&coordinates=${location.lat},${location.lon}&ayanamsa=1`,
            { headers: { 'Authorization': `Bearer ${tokenData.access_token}` } }
          );
          if (astroResponse.ok) {
            const astroJson = await astroResponse.json();
            const digest = buildChartDigest(astroJson.data, dateTimeIso);
            astrologyDataText = digest || JSON.stringify(astroJson.data);
            console.log("📊 차트 다이제스트:\n" + astrologyDataText);
          }
        }
      }
    } catch (e) { console.log("⚠️ Prokerala Fallback (VIP):", e.message); }

    console.log("✅ [2] Prokerala 완료, Gemini VIP 호출 시작");

    // 🚨 오늘 날짜를 명시해서 AI가 과거 연도를 쓰는 버그 차단
    const now = new Date();
    const todayStr = `${now.getFullYear()}년 ${now.getMonth() + 1}월 ${now.getDate()}일`;

    const prompt = `
[🚨🚨 절대 금지 - 최우선]
'undefined', 'null', 'NaN', '트랜짓 항목', '데이터에 없음' 같은 개발자/시스템 용어를 리포트 본문에 절대 쓰지 마라.
손님은 일반인이다. 시스템 내부 사정을 손님에게 설명하지 마라. 만약 어떤 정보가 계산되지 않았다면, 그 사실을 언급하지 말고 자연스럽게 다른 근거로 서술하라.

[🚨 시간 기준 - 최우선 규칙]
오늘은 ${todayStr}이다. 너의 학습 데이터 기준 연도가 아니라 이 날짜가 진짜 현재다.
만남/기회/운이 열리는 시기 등 모든 미래 예측 시기는 반드시 오늘(${todayStr}) 이후의 연도와 월로만 써라.
과거 연도(예: 2024년, 2025년 상반기 등 이미 지난 시기)를 미래 시기로 쓰면 치명적인 실패다.

너는 30년간 수많은 사람의 인생을 지켜봐온, 서양 점성술 대가이자 인생 상담가야.
지금 네 앞에는 ${name}님이 앉아있어. 이 사람은 삼십만원짜리 인생 리포트를 받으러 온 소중한 손님이야.
네 임무는, 이 사람이 다 읽고 나서 "누군가 드디어 내 인생을 온전히 이해해줬다"며 울컥하게 만드는 거야.

[가장 중요한 원칙]
이 리포트는 따로 노는 글이 아니라, 하나로 이어지는 '인생 이야기'여야 해.
1편에서 상처를 어루만지고 → 2편에서 그 상처가 실은 재능이었다고 뒤집어주고 → 3편에서 앞으로 나아갈 길과 타이밍을 밝혀주고 → 4편에서 전생부터 이어진 영혼의 과제로 모든 것을 꿰뚫어 납득시키고 → 마지막으로 인생 전체의 흐름을 조망하는,
한 편의 영화처럼 감정이 흐르게 써라. 앞 챕터에서 한 말이 뒷 챕터에서 자연스럽게 이어져야 한다.

[정밀 계산된 네이탈 차트 - 트로피컬(서양식) 기준]\n${astrologyDataText}\n위 좌표는 실제 천체 계산 결과다. 반드시 이 데이터의 별자리/도수/하우스를 그대로 인용하고, 없는 배치를 지어내지 마라.
[손님 정보] 이름: ${name} / 성별: ${myGender} / 출생지: ${city} / 생년월일시: ${date} ${time}


[중심 서사 규칙 - 리포트 품질의 생명]
위 차트에서 이 사람의 인생·상처·재능과 가장 관련 깊은 강력한 배치 1~2개를 골라라 (우선순위: ① 달/토성의 위치 → ② 12하우스나 8하우스의 행성 → ③ 태양의 위치).
그 배치 하나를 리포트 전체를 관통하는 '중심 스토리'로 삼아, 세 챕터가 하나의 인생 이야기로 이어지게 하라.

[🚨 감정 vs 연민 - 이 리포트의 핵심 톤]
${name}님의 감정을 정확히 읽어주는 것(공감)과, 불쌍하게 여기는 것(연민)은 완전히 다르다.
- 공감(O): "당신은 힘들 때 아무에게도 기대지 못하고 혼자 삼켜왔습니다" → 마음을 정확히 읽어 문을 연다.
- 연민(X): "얼마나 힘드셨어요", "안타깝네요", "가여운 당신" → 손님을 약자로 만든다. 절대 금지.
🚨 규칙: 감정을 읽어 마음을 연 뒤(=여기까진 '힘드셨죠' 톤 OK), 반드시 그 상처를 강점·재능으로 뒤집어 끝내라.
"당신은 늘 혼자 감당해왔습니다(공감) → 그건 약함이 아니라 아무나 못 가진 강인함입니다(반전)" 이 구조가 이 리포트의 심장이다.
손님이 다 읽고 나서 '위로받았다'가 아니라 '내가 이렇게 대단한 사람이었구나'라고 느끼게 하라.

[🚨 강점은 확실하게, 특이점은 콕 집어서]
- 이 사람의 강점은 절대 뭉뚱그리지 말고, "남들은 못 하는데 당신은 되는 것"의 형태로 단정하라. "당신은 대단한 사람입니다"를 근거와 함께 확신 있게 선언하라. 🚨강점도 반드시 이 사람의 실제 배치에서 도출하라(뭉뚱그린 칭찬 금지). 배치별로: 태양·화성 1하우스 또는 양자리 강함→'남보다 먼저 움직여 판을 여는 추진력' / 수성 3·9하우스 또는 쌍둥이·처녀 강함→'말과 글로 설명하는 능력, 정보를 빠르게 꿰는 머리' / 금성 강함 또는 천칭·황소→'사람 마음을 편하게 만드는 감각, 미적 안목' / 달·물 원소(게·전갈·물고기) 강함→'말 안 해도 상대 감정을 읽어내는 촉' / 토성 강함 또는 염소·10하우스→'끝까지 버텨 결과를 만드는 지구력, 남들이 포기할 때 남는 힘' / 목성 강함 또는 사수·9하우스→'큰 그림을 보고 사람을 끌어들이는 낙천성' / 8·12하우스 강함→'표면 아래 본질을 꿰뚫어 보는 통찰' / 11하우스·물병 강함→'사람을 모으고 판을 만드는 네트워크 감각' / 스텔리움(한 하우스에 3개 이상)→그 하우스 영역에 '아무나 못 가진 집중된 재능'. 반드시 '남들은 못 하는데 당신은 되는 것' 형태로 근거와 함께 단정하라.
- 차트에서 이 사람만의 특이한 배치(스텔리움, 달의 교점, 특정 하우스 집중, 드문 각)를 반드시 최소 1개 콕 집어, "이건 아무나 가질 수 없는 배치입니다"라고 그 특별함을 강조하라. 평범한 차트처럼 다루면 실패다.

[🚨 성격의 그림자 - 반드시 넣어라 (신뢰도의 핵심)]
칭찬만 있는 리포트는 '누구한테나 하는 말'처럼 느껴져 안 믿긴다. 반대로 뜨끔한 단점을 정확히 짚으면 손님은 '이 사람이 나를 진짜 안다'고 느끼고, 그 순간 앞의 칭찬까지 다 믿게 된다. 그러니 반드시 성격적 단점을 짚어라.
- 화성(추진력·분노·속도), 수성(사고 방식·산만함), 상승점(기질), 양자리/사수/쌍둥이 등 급하고 활동적인 별자리 배치를 근거로, 이 사람의 실제 성격 단점 1~2개를 콕 집어라. 예: 성격이 급함, 욱하는 성마름, 쉽게 싫증내거나 산만함, 하고 싶은 게 많아 집중 분산, 정 때문에 거절을 못 함, 다 듣기 전에 결론 내림, 지나친 완벽주의로 시작을 미룸.
- 🚨 화법: "성격이 급한 편입니다"처럼 부드럽게 단정하는 톤을 기본으로 써라. (단, '급함'은 예시일 뿐이다. 🚨절대 모두에게 '급하다'고 쓰지 마라. 실제 배치에서 도출되는 것만 골라라: 화성 양자리·사자·1하우스 또는 불 원소 상승점→급함·욱함 / 수성 쌍둥이·사수·3하우스→산만함 / 수성·화성 처녀·염소→완벽주의로 미룸·잔소리 / 달·금성 게자리·물고기·12하우스→거절 못 함·혼자 삼킴 / 토성 1·10하우스→자기검열·경직 / 천칭·2하우스→우유부단 / 전갈·8하우스→의심 많음·속을 안 보임.) 이게 자연스러우면서도 확신이 실린 가장 좋은 화법이다. "급한 편입니다", "급하시죠", "급합니다" 모두 좋다. 단, 진짜 발을 빼는 [[발뺌 화법 금지]]: "~한 느낌도 있습니다", "~한 면이 있으신 것 같아요", "~할 수도 있어요", "아마 ~일지도" 처럼 빠져나갈 구멍을 만드는 표현은 소름을 죽이니 절대 쓰지 마라. 두루뭉술한 '가끔 예민할 수 있어요'(X) 금지. 읽는 사람이 '헉, 어떻게 알았지' 하고 뜨끔하게 하라.
- 🚨 균형: 반드시 '강점의 이면'으로 프레임하라. 먼저 그 기질이 준 강점을 인정한 뒤 "다만 그것 때문에 ~할 때가 있죠"로 단점을 짚어라. 기죽이지 말되 정확히 찔러라. (예: "당신은 남보다 빠르게 판단하고 움직입니다. 그게 무기예요. 다만 그 속도 때문에 상대가 말을 다 끝내기도 전에 결론을 내버려서, 가까운 사람이 서운해할 때가 있죠.")

[문체 기준 - 반드시 이 수준으로]
좋은 예: "<b>${name}님의 차트에는 금성·화성·토성 세 별이 전부 12하우스, 숨겨진 방에 몰려 있습니다.</b> 좋아하는 사람이 생겨도 티를 내지 못하고, 힘들어도 괜찮다는 말로 덮어온 것은 성격이 아니라 이 배치가 만든 오래된 습관입니다. <b>그리고 바로 이 배치가, 남의 감정을 누구보다 깊이 읽어내는 당신만의 특별한 재능이 되었습니다.</b>"
나쁜 예(절대 금지): "긍정적으로 생각하세요", "좋은 일이 있을 겁니다" 같은 하나마나한 덕담 / "~일 수 있습니다", "~한 느낌도 있습니다", "~한 면이 있으신 것 같아요" 같은 발뺌 화법(소름을 죽인다, 단정이나 '~편입니다'로 바꿔라) / "가여운", "안타까운" 같은 연민 / 강점을 뭉뚱그리는 것.

[글 쓰는 방식 - 꼭 지켜]
1. 🚨 [차트 근거 필수] 각 챕터마다 최소 1번, 해석을 말하기 전에 반드시 차트상의 근거를 먼저 밝혀라.
   형식: "<b>${name}님의 차트를 보면, 달이 OO자리 OO도에 자리하고 있습니다.</b> 이것이 말해주는 것은..." 처럼
   [차트 근거] → [해석] 순서로 써라. 위의 [실제 데이터]에 담긴 실제 행성 위치를 읽고 인용해라. 지어내지 마라.
   단, 근거는 챕터당 1~2개만 굵고 명확하게. 용어를 줄줄이 나열하며 어렵게 만들지 마라.
2. 근거를 댄 후의 설명은 사람 마음에 닿는 쉬운 말로 풀어라. "${name}님은~" 하고 이름을 직접 부르며, 눈을 마주보고 이야기하듯 따뜻하게.
3. 뭉뚱그리지 마라. "힘드셨을 거예요"(X) → "당신은 정작 당신이 힘들 때 아무에게도 기대지 못하고 혼자 삼켜왔습니다"(O)처럼 콕 집어서 마음을 읽어줘라.
4. 모든 챕터는 반드시 '감정 읽기 → 강점으로 반전 → 구체적 방향'의 흐름으로 끝나라. 상처만 파고 끝내지 마라.
5. 강조할 문장은 <b> 태그로. 마크다운(*) 절대 금지.
6. 🚨 [분량 대폭 확대] vip_card1·3·4는 각 최소 2000자, vip_card2는 최소 2500자. 소제목(<b>【소제목】</b>)으로 3~4개 단락을 나눠 풍성하게 써라. 각 단락은 하나의 완결된 이야기여야 한다. 짧으면 29,900원 값을 못 한다. 길고 깊게, 그러나 지루하지 않게.
7. 결과는 순수 JSON 객체로만 출력. 앞뒤에 아무것도 붙이지 마.

[🚨 연령대별 운세 점수 - 매우 중요]
${name}님의 차트를 근거로 10대/20대/30대/40대/50대/60대/70대/80대 각 시기의 운세를 100점 만점으로 평가하라.
- 점수는 시기마다 뚜렷하게 차이 나게 매겨라 (전부 비슷한 점수 금지. 최저와 최고가 20점 이상 차이 나야 함).
- 각 시기마다 그 점수의 이유를 한두 문장으로: 무엇이 열리고 무엇을 조심해야 하는지.
- 가장 점수 높은 시기가 '인생의 황금기'다. best_age에 그 시기를 적어라.
- 손님의 생년월일(${date})을 보고 이미 지난 시기는 "그 시절 어떤 씨앗이 뿌려졌는지" 관점으로, 앞으로 올 시기는 "무엇이 기다리는지" 관점으로 써라.

[출력 JSON 형식]
{
  "vip_card1": "(최소 1600자, 소제목 3개로 나눠서) [CHAPTER 01. 내 삶을 갉아먹는 무의식의 방해 공작] 🚨 냉정한 진단이되, 마지막엔 반드시 강점으로 뒤집어라. 다음 흐름으로 길고 깊게 써라. <b>【타고난 것】</b> 먼저 달·토성·12하우스 등 이 사람의 특이 배치를 차트 근거로 밝히고, 그것이 준 '아무나 못 가진 능력'을 먼저 인정하라 (예: 감정을 깊이 읽는 힘). <b>【무의식의 그림자】</b> 🚨위 【각도】 항목이 있으면 최소 1개를 반드시 근거로 인용하라(예: '달과 토성이 각을 이루어, 감정을 드러내면 안 된다고 배우셨습니다'). 이게 정밀함의 핵심이다. 그 능력의 이면에 자리잡은 무의식적 불안·결핍의 정체를 콕 집어라 — 잘 살고 싶은 마음과 반대로 자꾸 스스로를 망치는 선택으로 몰아온 패턴을. 감정을 정확히 읽어 마음을 열되('당신은 늘 혼자 삼켜왔습니다') 불쌍하게 만들지 마라. 🚨[성격 단점 필수] 이 단락 안에서 반드시 화성·수성·상승점 배치를 근거로 이 사람의 실제 성격 단점 1~2개를 '~한 편입니다'처럼 부드럽게 단정해서 콕 집어라. 🚨절대 모두에게 '급하다'고 쓰지 마라. 실제 배치에서 도출되는 것만 골라라: 화성 양자리·사자·1하우스 또는 불 원소 상승점→급함·욱함 / 수성 쌍둥이·사수·3하우스→산만함 / 수성·화성 처녀·염소→완벽주의로 미룸·잔소리 / 달·금성 게자리·물고기·12하우스→거절 못 함·혼자 삼킴 / 토성 1·10하우스→자기검열·경직 / 천칭·2하우스→우유부단 / 전갈·8하우스→의심 많음·속을 안 보임. 예시 문장을 그대로 베끼지 말고 이 차트에 맞는 단점을 써라 (급함/성마름/산만함/거절 못 함/완벽주의로 미룸 등). 발뺌('~느낌도 있어요') 말고, 그 기질이 준 강점을 먼저 인정한 뒤 '다만 그것 때문에 ~할 때가 있죠'로 뒤집어, 뜨끔하되 기죽지 않게 하라. <b>【반복된 장면】</b> 그 패턴이 관계·일·돈에서 실제로 어떻게 반복됐는지 구체적 장면으로 보여줘라. <b>【뿌리와 열쇠】</b> 이 패턴이 어디서 시작됐는지(4하우스=가정·부모, 12하우스=숨은 상처) 뿌리를 추적하고, 그것이 결함이 아니라 '너무 일찍 유능해진 대가'였음을, 그리고 그 힘이 앞으로 어떻게 무기가 되는지 방향을 제시하라. 마지막엔 <blockquote> 태그로 가슴을 관통하되 힘을 주는 한 문장을 남겨라 (예: '당신은 강한 게 아니라 유능한 사람입니다'). 연민('가여운', '안타까운') 절대 금지.",
  "vip_card2": "(최소 2000자) [CHAPTER 02. 타고난 재능과, 당신이 두각을 나타낼 자리] 🚨 이 챕터는 ${name}님이 '내일 당장 뭘 해야 할지' 알게 만드는 실전 챕터다. 톤은 '당신은 이런 걸 타고난 대단한 사람'이라는 확신에 찬 선언이어야 한다. 겸손하게 굴리거나 발뺌하지 마라. 반드시 아래 5개 항목을 모두, 순서대로, <b>【소제목】</b>을 달아 각 항목을 충분히 길게(항목당 350자 이상) 써라.\n\n【1. 타고난 재능】 2하우스(타고난 재능·자산), 6하우스(일하는 방식·기술), 10하우스(커리어·사회적 명예)와 그 안의 행성을 차트 근거로 밝혀라. 그로부터 ${name}님이 태어날 때부터 가지고 온 재능 3가지를 콕 집어라. 추상적인 말('창의적입니다') 금지. 반드시 '남들은 못 하는데 당신은 되는 것'의 형태로 구체적으로 (예: 남이 놓치는 미세한 흐름의 변화를 먼저 감지하는 촉 / 처음 만난 사람도 3분 만에 무장해제시키는 언어 / 모두가 포기한 뒤에도 혼자 남아 끝을 보는 집요함).\n\n【2. 두각을 나타낼 직군】 🚨[필수] 위 재능에 정확히 맞는 <b>구체적인 직군·업종 3가지를 실명으로</b> 제시하라 (예: 부동산 경매·수익형 부동산, 심리상담·코칭, 온라인 강의 콘텐츠, 브랜드 컨설팅, 데이터 분석, 세무·회계, 커머스 셀러, 크리에이터 등 — 실제로 검색해서 오늘 당장 알아볼 수 있는 수준으로). 각 직군마다 '이 차트의 어떤 배치 때문에 맞는지' 근거를 한 줄씩 반드시 붙여라. 그리고 그중 <b>가장 강력한 1순위</b>를 못 박아라.\n\n【3. 조직인가 독립인가】 10하우스와 토성 위치를 근거로, ${name}님이 조직 안에서 성장할 사람인지 독립해서 자기 것을 세울 사람인지 단정하라. 애매하게 '둘 다 가능합니다' 금지. 그리고 언제 독립하는 게 좋은지 시점도 짚어라.\n\n【4. 나에게 맞는 돈 버는 방식】 2하우스와 8하우스를 근거로, ${name}님이 돈을 버는 고유한 방식을 밝혀라. 예: 시간을 팔아 버는 사람인가(월급·수임) / 결과물을 팔아 버는 사람인가(제품·콘텐츠) / 남의 돈을 굴려 버는 사람인가(투자·중개) / 신뢰를 자본 삼아 버는 사람인가(브랜드·커뮤니티). 그리고 <b>절대 손대면 안 되는 돈벌이 방식</b>도 경고하라.\n\n【5. 재물이 불어나는 원리】 목성(확장)과 토성(축적)의 위치를 근거로, ${name}님의 재물이 커지는 구조를 밝혀라. 한 방에 크게 버는 사람인지, 시간을 들여 복리로 쌓는 사람인지. 자산을 어떤 형태로 굴려야 하는지(부동산·현물·사업지분·현금흐름 중). 그리고 <b>부(富)의 크기와 그것이 실현되는 시점</b>을 구체적으로 못 박아라. 마지막은 ${name}님이 '나도 할 수 있겠다'는 확신을 갖도록 뜨겁게 마무리하라.",
  "vip_card3": "(최소 1600자, 소제목으로 나눠서) [CHAPTER 03. 이제, 당신의 시간이 옵니다] 막연한 희망이 아니라 하늘에 적힌 일정표를 보여주듯 확신 있게 써라. 진짜 행복해지기 위해 놓아줘야 할 것과, 붙잡아야 할 기회를 알려줘라. 🚨🚨 [연도는 반드시 계산된 값 그대로] 위 [정밀 계산된 네이탈 차트]에 있는 \'실제 계산된 목성 트랜짓\' 항목을 그대로 인용하라. 절대로 임의의 연도(2026~2028 등)로 바꾸지 마라. 트랜짓이 여러 개면 순서대로 언급하고, \'뚜렷한 트랜짓이 없다\'는 결과라면 그 사실을 정직하게 인정하며 시기보다 태도·행동에 집중하라는 방향으로 안내하라. 왜 그 시기인지(목성이 배우자궁과 이루는 각도)를 짧게 설명하라. 시기 생략이나 임의 변경 절대 금지. 곁에 두면 당신을 갉아먹는 사람(레드플래그)은 <span style=\'color:#ff3b30;font-weight:900;\'>빨간 글씨</span>로 분명히 경고하고, 마지막은 ${name}님을 굳게 믿어주는 뜨거운 축복으로 끝내라.",
  "vip_card4": "(최소 1600자, 소제목으로 나눠서) [CHAPTER 04. 전생의 당신, 이번 생의 과제] 🔮 위 [전생과 영혼의 과제 - 달의 교점] 항목을 반드시 근거로 삼아라. 다음 흐름으로 길고 깊게 써라. ① <b>【전생에 통달한 것】</b> 사우스노드를 근거로, ${name}님이 전생에서 이미 완벽히 익혔기에 이번 생에도 너무 익숙하고 편안한 패턴을 짚어라. 이걸 먼저 '대단한 강함'으로 인정하라 (예: '당신은 어떤 위기가 와도 자기 힘으로 일어서는, 근본적으로 강한 영혼입니다'). ② <b>【익숙함의 함정】</b> 그래서 힘들 때마다 자꾸 그 익숙한 자리로 도망쳐 왔다는 것을, 그리고 왜 그 길로 갈수록 안전하지만 공허해지는지 설명하라. ③ <b>【이번 생의 과제】</b> 노스노드를 근거로, 이번 생에 반드시 배워야 할 것이 무엇인지 밝혀라 — 불편하고 어색하지만 바로 거기에 성장과 가장 큰 행복이 있음을. ④ 앞 챕터의 상처·재능과 연결해, 그 모든 게 하나의 인생 이야기로 납득되게 하라. ⑤ 마지막은 <blockquote> 태그로 '${name}님이 이번 생에 풀어야 할 단 하나의 숙제'를, 약해지라는 게 아니라 '이미 강한 당신이 이제 함께 나눌 사람을 만나는 것'이라는 힘 있는 방향으로 못 박아라. 연민 금지, 강함을 전제로.",
  "life_score_10": 점수숫자만,
  "life_desc_10": "(1~2문장) 10대의 흐름과 핵심 조언 (이 시기에 뿌려진 씨앗)",
  "life_score_20": 점수숫자만,
  "life_desc_20": "(1~2문장) 20대의 흐름과 핵심 조언",
  "life_score_30": 점수숫자만,
  "life_desc_30": "(1~2문장) 30대의 흐름과 핵심 조언",
  "life_score_40": 점수숫자만,
  "life_desc_40": "(1~2문장) 40대의 흐름과 핵심 조언",
  "life_score_50": 점수숫자만,
  "life_desc_50": "(1~2문장) 50대의 흐름과 핵심 조언",
  "life_score_60": 점수숫자만,
  "life_desc_60": "(1~2문장) 60대의 흐름과 핵심 조언",
  "life_score_70": 점수숫자만,
  "life_desc_70": "(1~2문장) 70대의 흐름과 핵심 조언",
  "life_score_80": 점수숫자만,
  "life_desc_80": "(1~2문장) 80대의 흐름과 핵심 조언 (인생을 마무리하는 시기)",
  "best_age": "가장 점수 높은 연령대 (예: 40대)",
  "best_age_reason": "(2~3문장) 왜 그 시기가 인생의 황금기인지, 차트 근거와 함께"
}
    `;

    // ✅ Gemini v1beta 직접 호출
    // - thinkingBudget 6144: '생각' 기능 ON → 차트를 깊이 분석해 리포트 품질 대폭 상승
    //   (vercel.json에서 실행시간 300초 확보했으므로 타임아웃 걱정 없음)
    // - responseMimeType JSON: 순수 JSON만 답하도록 강제 (500 파싱에러 해결)
    // - 실패 시 자동 1회 재시도 + 깨진 JSON 복구 파싱
    let parsedData = null;
    let lastErr = "";
    for (let attempt = 1; attempt <= 3; attempt++) {
      try {
        const geminiRes = await fetch(
          `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${process.env.GEMINI_API_KEY}`,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [{ parts: [{ text: prompt }] }],
              generationConfig: {
                maxOutputTokens: 32768,
                temperature: 0.95,
                responseMimeType: "application/json",
                thinkingConfig: { thinkingBudget: 2048 }
              }
            })
          }
        );

        if (!geminiRes.ok) {
          lastErr = `Gemini ${geminiRes.status}: ${await geminiRes.text()}`;
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          // 🚨 503(일시적 과부하)이면 살짝 기다렸다가 재시도 → 구글 서버 회복 시간 확보
          if (geminiRes.status === 503) {
            await new Promise(r => setTimeout(r, 1500 * attempt));
          }
          continue;
        }

        const geminiData = await geminiRes.json();
        console.log(`✅ [3] Gemini 응답 수신 (시도 ${attempt})`);

        const parts = (geminiData.candidates && geminiData.candidates[0] && geminiData.candidates[0].content && geminiData.candidates[0].content.parts) || [];
        const responseText = parts.map(p => p.text || "").join("");
        const s = responseText.indexOf("{");
        const e = responseText.lastIndexOf("}");
        if (s === -1 || e === -1) {
          lastErr = "응답에 JSON 없음: " + responseText.slice(0, 200);
          console.error(`🔥 [시도 ${attempt}]`, lastErr);
          continue;
        }
        parsedData = JSON.parse(responseText.slice(s, e + 1));
        break;
      } catch (err) {
        lastErr = err.message;
        console.error(`🔥 [시도 ${attempt}] 실패:`, err.message);
      }
    }

    if (!parsedData) {
      return res.status(500).json({ error: `[Gemini VIP 실패] ${lastErr}` });
    }

    console.log("✅ [4] JSON 파싱 성공, VIP 응답 전송");

    if (req.body.orderId) {
      try {
        await kv.set(`vip-report:${req.body.orderId}`, parsedData, { ex: 60 * 60 * 24 * 30 });
        console.log("💾 KV 저장 완료: vip-report:" + req.body.orderId);
      } catch (e) {
        console.log("⚠️ KV 저장 실패(리포트 전송은 정상 진행):", e.message);
      }
    }

    res.status(200).json(parsedData);

  } catch (error) {
    console.error("🔥 gemini-vip.js 에러:", error);
    res.status(500).json({ error: `[VIP 서버 에러] ${error.message}` });
  }
};

module.exports = allowCors(handler);
