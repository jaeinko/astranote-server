// ============================================================================
//  lib/gemini-run.js — Gemini 호출 + 반려·재시도 루프 (재회운 16 · 신년운세 18 공용)
// ----------------------------------------------------------------------------
//  api/gemini-child.js 에서 실제 사고를 겪으며 다듬은 규칙을 그대로 옮겼습니다.
//  (기존 상품 파일은 건드리지 않습니다)
//
//   · 한 번의 호출 상한 100초  — 시작한 시도가 끝나지 않아 함수가 통째로 죽는 것 방지
//   · 전체 예산 240초          — Vercel 300초 제한 안에서 저장·응답 몫 60초 확보
//   · 다음 시도 예상시간을 직전 실측 × 1.2 로 갱신
//   · 503·429 는 20초·45초 대기 (단, 남은 예산 안에서만)
//   · 반려 사유를 다음 프롬프트에 되먹임
//   · 전부 반려돼도 '안전 기준'을 통과한 가장 긴 원고는 차선책으로 내보냄
//     → 완벽한 리포트를 못 주는 것보다 아무것도 못 주는 것이 훨씬 나쁘다
//   · 단, unsafe 로 표시된 반려(안전 위반)는 절대 차선책으로 쓰지 않음
// ============================================================================

'use strict';

const RETRY_WAIT_MS = [20000, 45000, 0];
const CALL_TIMEOUT_MS = 100000;
const BUDGET_MS = 240000;

const GEMINI_URL = 'https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent';

function extractJson(text) {
  const s = text.indexOf('{'), e = text.lastIndexOf('}');
  if (s === -1 || e <= s) return null;
  const raw = text.slice(s, e + 1);
  try { return JSON.parse(raw); }
  catch (err) {
    /* 흔한 실수 두 가지만 고쳐 본다: 끝 쉼표, 문자열 안의 생 줄바꿈 */
    try {
      return JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')
        .replace(/"((?:[^"\\]|\\.)*)"/g, (m, g) => '"' + g.replace(/\n/g, '\\n') + '"'));
    } catch (e2) { return null; }
  }
}

async function callGemini(prompt, opt) {
  opt = opt || {};
  const ac = new AbortController();
  const timer = setTimeout(() => ac.abort(), opt.timeoutMs || CALL_TIMEOUT_MS);
  try {
    const r = await fetch(GEMINI_URL + '?key=' + process.env.GEMINI_API_KEY, {
      signal: ac.signal,
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          maxOutputTokens: opt.maxOutputTokens || 65536,
          temperature: opt.temperature != null ? opt.temperature : 0.9,
          responseMimeType: 'application/json',
          thinkingConfig: { thinkingBudget: opt.thinkingBudget || 5120 }
        }
      })
    });
    if (!r.ok) {
      const t = await r.text();
      const err = new Error('Gemini ' + r.status + ': ' + t.slice(0, 200));
      err.status = r.status;
      throw err;
    }
    const j = await r.json();
    const cand = j.candidates && j.candidates[0];
    if (cand && cand.finishReason && cand.finishReason !== 'STOP') {
      console.warn('⚠️ Gemini finishReason=' + cand.finishReason);
    }
    const text = ((cand && cand.content && cand.content.parts) || []).map(p => p.text || '').join('');
    const parsed = extractJson(text);
    if (!parsed) throw new Error('응답에 JSON 없음: ' + text.slice(0, 150));
    return parsed;
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error('Gemini 응답 ' + Math.round((opt.timeoutMs || CALL_TIMEOUT_MS) / 1000) + '초 초과로 중단');
    }
    throw err;
  } finally {
    clearTimeout(timer);
  }
}

/* 브랜드 밖 색상·마크다운 정리 — 재생성 없이 결정론적으로 고친다 */
function sanitize(data) {
  const fix = s => s
    .replace(/color:\s*#(?!ff3b30\b)[0-9a-fA-F]{3,8}/gi, 'color:#d4af37')
    .replace(/\*\*\*(.+?)\*\*\*/g, '<b>$1</b>')
    .replace(/\*\*(.+?)\*\*/g, '<b>$1</b>')
    .replace(/(^|[^*])\*([^*\n]+?)\*(?!\*)/g, '$1<b>$2</b>')
    .replace(/^#{1,6}\s+/gm, '')
    .replace(/ /g, ' ')
    .replace(/\\n/g, '<br>')
    .replace(/\n/g, '<br>')
    .trim();
  (function walk(o) {
    for (const k of Object.keys(o)) {
      if (typeof o[k] === 'string') o[k] = fix(o[k]);
      else if (o[k] && typeof o[k] === 'object') walk(o[k]);
    }
  })(data);
  return data;
}

/**
 * @param o.buildPrompt (correction:string) => string
 * @param o.validate    (candidate, isLast:boolean) => null | { msg, unsafe?:boolean }
 * @param o.lengthOf    (candidate) => number   — 차선책 고르기용
 * @param o.repair      (candidate, msg) => candidate|null  — 안전 위반 문장만 도려내는 최후 수단
 * @param o.gemini      callGemini 옵션
 * @param o.tag         로그 머리말
 * @returns { data, lastErr, attempts, usedFallback }
 */
async function runWithBudget(o) {
  const T0 = Date.now();
  let needMs = 70000;
  let data = null, lastErr = '', correction = '';
  let best = null, bestLen = 0, lastUnsafe = null;
  let attempts = 0;

  for (let attempt = 1; attempt <= 3; attempt++) {
    const spent = Date.now() - T0;
    if (attempt > 1 && spent + needMs > BUDGET_MS) {
      console.error(o.tag + ' ⏱️ 시간 부족으로 ' + attempt + '차 생략 (경과 ' + Math.round(spent / 1000) + '초)');
      break;
    }
    const isLast = (attempt === 3) || (spent + needMs * 2 > BUDGET_MS);
    const tryStart = Date.now();
    attempts = attempt;
    try {
      const cand = sanitize(await callGemini(o.buildPrompt(correction), o.gemini));
      needMs = Math.max(needMs, Math.round((Date.now() - tryStart) * 1.2));
      const bad = o.validate(cand, isLast);
      if (bad) {
        lastErr = bad.msg; correction = bad.msg;
        if (bad.unsafe) lastUnsafe = cand;
        else {
          const len = o.lengthOf(cand);
          if (len > bestLen) { best = cand; bestLen = len; }
        }
        console.error(o.tag + ' 🔥 [시도 ' + attempt + '] 반려: ' + bad.msg);
        continue;
      }
      data = cand;
      console.log(o.tag + ' ✅ 통과 (' + attempt + '회, ' + Math.round((Date.now() - T0) / 1000) + '초)');
      break;
    } catch (err) {
      lastErr = err.message;
      console.error(o.tag + ' 🔥 [시도 ' + attempt + ']', err.message);
      if (err.status === 503 || err.status === 429) {
        const want = RETRY_WAIT_MS[attempt - 1] || 0;
        const room = Math.max(0, BUDGET_MS - (Date.now() - T0) - needMs);
        const wait = Math.min(want, room);
        if (wait > 0) {
          console.warn(o.tag + ' ⏳ Gemini ' + err.status + ' — ' + Math.round(wait / 1000) + '초 대기');
          await new Promise(r => setTimeout(r, wait));
        }
      }
    }
  }

  let usedFallback = false;
  if (!data && best) {
    console.error(o.tag + ' ⚠️ 전 시도 반려. 차선 원고 사용 (' + bestLen + '자, 사유: ' + lastErr + ')');
    data = best; usedFallback = true;
  }
  /* 안전 위반만 있었다면, 문제 문장을 도려낸 판을 한 번 더 검사해 통과할 때만 쓴다 */
  if (!data && lastUnsafe && typeof o.repair === 'function') {
    const fixed = o.repair(lastUnsafe);
    if (fixed && !o.validate(fixed, true)) {
      console.error(o.tag + ' ⚠️ 안전 위반 문장을 도려내고 전달');
      data = fixed; usedFallback = true;
    }
  }
  return { data, lastErr, attempts, usedFallback };
}

/* 한국어 날짜: 2027-03-04 → '3월 4일' (같은 해) / '2028년 1월 3일' */
function krDate(ymd, refYear) {
  const [y, m, d] = String(ymd).split('-').map(Number);
  return (refYear && y === refYear ? '' : y + '년 ') + m + '월 ' + d + '일';
}

/* 서울 기준 '오늘' YYYY-MM-DD (Vercel 서버는 UTC 라 new Date() 의 날짜가 9시간 어긋난다) */
function seoulToday(now) {
  const t = new Date((now || Date.now()) + 9 * 3600 * 1000);
  return t.toISOString().slice(0, 10);
}

module.exports = { callGemini, sanitize, runWithBudget, extractJson, krDate, seoulToday,
                   BUDGET_MS, CALL_TIMEOUT_MS };
