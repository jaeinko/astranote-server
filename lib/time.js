// ============================================================================
//  lib/time.js — 아스트라노트 공용 출생시각 → ISO 변환
// ----------------------------------------------------------------------------
//  ★ 이 파일이 유일한 정본입니다. 시간대 관련 수정은 여기만 고치세요.
//    (예전에는 이 로직이 api/gemini.js · gemini-vip.js · gemini-monthly.js ·
//     gemini-couple.js 네 곳에 복사돼 있었고, 한 곳만 고쳐서 나머지 세 곳에
//     버그가 남아 있었습니다. lib/cities.js 와 같은 이유로 여기로 모았습니다)
//
//  ▣ 고쳐진 것 1 — 한국 표준시 이력
//     예전 코드는 목록에 없는 도시(=국내 전부)에 무조건 '+09:00'을 붙였습니다.
//     그런데 한국은 표준시가 여러 번 바뀌었습니다.
//       · 1954~1961  UTC+08:30
//       · 1948~1951 / 1955~1960 / 1987~1988  여름철 서머타임 (+1시간)
//     그 기간 출생자는 상승점이 최대 21도(=별자리 한 칸 이상) 어긋났습니다.
//     이제 국내 도시도 IANA 시간대(Asia/Seoul)로 조회하므로 자동으로 맞습니다.
//
//  ▣ 고쳐진 것 2 — 해외 출생 (궁합에서 특히 심각했음)
//     gemini-couple.js 는 시간대 조회 없이 '+09:00' 을 하드코딩하면서
//     좌표는 뉴욕·런던을 넘겼습니다. 시각은 한국, 장소는 해외가 되어
//     상승점이 최대 157도까지 어긋났습니다.
// ============================================================================

'use strict';

/* 해외 도시의 IANA 시간대. 국내 도시는 아래 buildBirthIso 에서
   기본값 Asia/Seoul 로 처리되므로 여기에 넣지 않아도 됩니다. */
const cityTimezones = {
  NewYork: 'America/New_York',
  LosAngeles: 'America/Los_Angeles',
  Chicago: 'America/Chicago',
  Toronto: 'America/Toronto',
  Vancouver: 'America/Vancouver',
  MexicoCity: 'America/Mexico_City',
  SaoPaulo: 'America/Sao_Paulo',
  London: 'Europe/London',
  Paris: 'Europe/Paris',
  Berlin: 'Europe/Berlin',
  Frankfurt: 'Europe/Berlin',
  Rome: 'Europe/Rome',
  Madrid: 'Europe/Madrid',
  Tokyo: 'Asia/Tokyo',
  Beijing: 'Asia/Shanghai',
  Shanghai: 'Asia/Shanghai',
  HongKong: 'Asia/Hong_Kong',
  Singapore: 'Asia/Singapore',
  Bangkok: 'Asia/Bangkok',
  Manila: 'Asia/Manila',
  Sydney: 'Australia/Sydney',
  Melbourne: 'Australia/Melbourne',
  Auckland: 'Pacific/Auckland'
};

const DEFAULT_TZ = 'Asia/Seoul';

/* 출생지의 시간대 이름. 목록에 없으면 국내로 보고 Asia/Seoul. */
function tzOf(cityKey) {
  return cityTimezones[cityKey] || DEFAULT_TZ;
}

/* 그 날짜·시각 시점의 실제 UTC 오프셋(분).
   IANA 시간대 DB를 쓰므로 과거 표준시 변경과 서머타임이 모두 반영됩니다. */
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
    console.error('[lib/time] 시간대 계산 실패:', tz, e.message);
    return 540; // 최후의 수단으로 +09:00
  }
}

function offsetText(min) {
  const sign = min >= 0 ? '+' : '-';
  const ab = Math.abs(min);
  return sign + String(Math.floor(ab / 60)).padStart(2, '0') + ':' + String(ab % 60).padStart(2, '0');
}

function parseDate(dateStr) {
  const ds = String(dateStr).replace(/\./g, '-').trim();
  const p = ds.split('-').map(Number);
  return { ds: ds, y: p[0], mo: p[1], d: p[2] };
}

/* 출생 정보 → 오프셋이 붙은 ISO 문자열
   예) buildBirthIso('1987-07-20', '09:00', 'Seoul')
        → '1987-07-20T09:00:00+10:00'   (그해 서머타임 반영)
       buildBirthIso('1995-08-15', '14:30', 'NewYork')
        → '1995-08-15T14:30:00-04:00'                                    */
function buildBirthIso(dateStr, timeStr, cityKey, opts) {
  const { ds, y, mo, d } = parseDate(dateStr);
  const t = String(timeStr || '12:00').trim();
  const tp = t.split(':').map(Number);
  const h = tp[0] || 0, mi = tp[1] || 0;
  const tz = tzOf(cityKey);
  const off = getUtcOffsetMinutes(tz, y, mo, d, h, mi);
  const iso = ds + 'T' + String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0') + ':00' + offsetText(off);
  if (!opts || opts.log !== false) {
    console.log('🌍 ' + (cityKey || '국내') + ' → ' + tz + ' (UTC' + offsetText(off) + ')');
  }
  return iso;
}

/* 출생 시각을 모를 때 그 날의 처음/끝 두 시점.
   궁합 리포트가 "시각에 따라 달라지는 항목은 통째로 뺀다"를 판정하는 데 씁니다. */
function dayRangeIso(dateStr, cityKey) {
  return [
    buildBirthIso(dateStr, '00:01', cityKey, { log: false }),
    buildBirthIso(dateStr, '23:59', cityKey, { log: false })
  ];
}

/* 손님에게 보여줄 시간대 표기. 예) 'Asia/Seoul · UTC+09:00' */
function tzLabel(dateStr, timeStr, cityKey) {
  const iso = buildBirthIso(dateStr, timeStr, cityKey, { log: false });
  return tzOf(cityKey) + ' · UTC' + iso.slice(-6);
}

module.exports = {
  cityTimezones: cityTimezones,
  DEFAULT_TZ: DEFAULT_TZ,
  tzOf: tzOf,
  getUtcOffsetMinutes: getUtcOffsetMinutes,
  buildBirthIso: buildBirthIso,
  dayRangeIso: dayRangeIso,
  tzLabel: tzLabel
};
