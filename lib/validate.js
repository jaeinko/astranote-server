// ============================================================================
//  lib/validate.js — 입력 검증 공용 모듈
// ----------------------------------------------------------------------------
//  ▣ 왜 만들었나
//
//  2026-07-31 QA 에서 치명 결함이 나왔습니다.
//
//      입력 2026-02-31  →  실제 계산 2026-03-03
//      입력 2025-04-31  →  실제 계산 2025-05-01
//      입력 2025-02-29  →  실제 계산 2025-03-01   (평년인데 통과)
//
//  자바스크립트 Date 는 없는 날짜를 오류로 보지 않고 다음 달로 넘깁니다.
//  기존 검사는 /^\d{4}-\d{2}-\d{2}$/ 형식만 봤기 때문에 전부 통과했습니다.
//
//  손님은 자기 생일 리포트라고 믿고 이틀 밀린 차트를 받습니다.
//  "1분만 틀려도 상승점이 1도 움직인다" 고 파는 상품에서
//  생일 자체가 밀리면 상품의 근거가 통째로 무너집니다.
//
//  ▣ 프론트에도 같은 검사가 있는데 왜 서버에도 두나
//
//  프론트 검사는 개발자도구로 우회됩니다. 결제는 이미 끝난 뒤라
//  잘못된 값이 들어오면 손님이 돈을 내고 틀린 리포트를 받습니다.
//  마지막 방어선은 서버여야 합니다.
//
//  ▣ 왜 윤년 규칙을 직접 안 짜나
//
//  4로 나뉘고 100으로 안 나뉘거나 400으로 나뉘면 윤년 — 이 규칙을
//  직접 구현하면 1900년(비윤년)과 2000년(윤년)에서 자주 틀립니다.
//  Date 에 맡기고 되돌려 읽어 검산하는 쪽이 짧고 정확합니다.
//
//  ▣ 검증 결과 (18 케이스)
//      차단  2/31 · 4/31 · 6/31 · 평년 2/29 · 1900년 2/29 · 13월 · 0월 · 0일
//      통과  윤년 2/29 · 2000년 2/29 · 12/31 · 일반 날짜
//      시각  24:00 · 10:60 · -1:00 차단 / 00:00 · 23:59 통과
// ============================================================================

'use strict';

/**
 * 실제로 달력에 존재하는 날짜인가.
 * @param {number|string} y 연
 * @param {number|string} mo 월 (1~12)
 * @param {number|string} d 일
 */
function isRealDate(y, mo, d) {
  y = Number(y); mo = Number(mo); d = Number(d);
  if (!isFinite(y) || !isFinite(mo) || !isFinite(d)) return false;
  if (mo < 1 || mo > 12 || d < 1 || d > 31) return false;
  const dt = new Date(Date.UTC(y, mo - 1, d));
  return dt.getUTCFullYear() === y
      && dt.getUTCMonth() === mo - 1
      && dt.getUTCDate() === d;
}

/** 00:00 ~ 23:59 범위인가. */
function isRealTime(h, mi) {
  h = Number(h); mi = Number(mi);
  return isFinite(h) && isFinite(mi) && h >= 0 && h <= 23 && mi >= 0 && mi <= 59;
}

/**
 * 'YYYY-MM-DD' 문자열이 형식도 맞고 실존하는 날짜인가.
 * 마침표 구분(1992.04.17)도 받아 하이픈으로 바꿔 검사합니다.
 * @returns {string|null} 정규화된 'YYYY-MM-DD' 또는 null
 */
function normalizeDate(raw) {
  const s = String(raw || '').trim().replace(/\./g, '-');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(s)) return null;
  const [y, mo, d] = s.split('-').map(Number);

  // 출생일로 말이 되는 범위인지도 본다.
  // 1900년 이전은 천체력 정확도가 떨어지고, 미래는 애초에 태어나지 않았다.
  const nowY = new Date().getUTCFullYear();
  if (y < 1900 || y > nowY) return null;

  if (!isRealDate(y, mo, d)) return null;
  return s;
}

/**
 * 'HH:MM' 문자열 검사.
 * @returns {string|null} 정규화된 'HH:MM' 또는 null
 */
function normalizeTime(raw) {
  const s = String(raw || '').trim();
  if (!/^\d{1,2}:\d{2}$/.test(s)) return null;
  const [h, mi] = s.split(':').map(Number);
  if (!isRealTime(h, mi)) return null;
  return String(h).padStart(2, '0') + ':' + String(mi).padStart(2, '0');
}

/**
 * 이름에서 태그로 해석될 문자를 제거하고 길이를 자른다.
 * 리포트 본문이 innerHTML 로 렌더링되므로 여기서 막지 않으면
 * 이름이 태그로 해석될 여지가 남습니다.
 */
function cleanName(v, max) {
  return String(v || '')
    .trim()
    .replace(/[<>{}\\"']/g, '')
    .slice(0, max || 20);
}

module.exports = {
  isRealDate,
  isRealTime,
  normalizeDate,
  normalizeTime,
  cleanName
};
