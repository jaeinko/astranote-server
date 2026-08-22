/* ============================================================================
   ASTRANOTE — lib/security.js   (2026-08-21 신설)
   ----------------------------------------------------------------------------
   ▣ 왜 필요한가

   주문번호가 이렇게 생겼습니다.

        20260802-0000059
        └날짜──┘ └연번─┘

   연번은 순서대로 올라갑니다. 즉 하나만 알면 앞뒤를 전부 찍어볼 수 있습니다.
   지금 /api/gemini?orderId=... 는 주문번호만 맞으면 리포트를 그대로 내줍니다.
   손님 입장에서는 "주문번호만 있으면 어느 기기에서든 다시 본다"는 편의지만,
   반대로 보면 누군가 연번을 훑어 남의 리포트를 모아갈 수 있다는 뜻입니다.

   완전한 해법은 주문번호에 서명(HMAC 뷰 토큰)을 붙여 본인만 열게 하는 것이고,
   그건 카페24 쪽 링크 생성까지 같이 손봐야 합니다.
   이 파일은 그 전까지의 현실적인 방어선입니다 —
   "정상 손님은 아무 불편이 없고, 훑는 행위만 막히는" 선에서 횟수를 제한합니다.

   ▣ 정상 손님이 걸리지 않는 이유
   손님 한 명이 리포트를 여는 데 필요한 조회는 폴링을 포함해도 수십 번입니다.
   반면 훑는 쪽은 분당 수백~수천 번을 때립니다. 그 사이에 선을 긋습니다.

   ▣ Vercel KV(Upstash) 를 씁니다. 서버리스라 메모리 카운터는 인스턴스마다
     따로 놀아서 의미가 없습니다.
   ▣ KV 가 죽어도 서비스는 계속돼야 하므로, 실패하면 통과시킵니다(fail-open).
     레이트 리미팅 때문에 리포트가 안 열리는 것이 더 큰 사고입니다.
   ============================================================================ */

'use strict';

const { kv } = require('@vercel/kv');

/**
 * 요청자의 IP를 최대한 정확히 뽑는다.
 * Vercel 은 x-forwarded-for 에 "실제IP, 프록시IP, ..." 순으로 넣는다.
 */
function clientIp(req) {
  const h = (req && req.headers) || {};
  const xff = h['x-forwarded-for'] || h['X-Forwarded-For'];
  if (xff) return String(xff).split(',')[0].trim().slice(0, 45);
  return String(h['x-real-ip'] || (req.socket && req.socket.remoteAddress) || 'unknown').slice(0, 45);
}

/**
 * 고정 창(fixed window) 방식 횟수 제한.
 *
 * @param {object}  req
 * @param {object}  opt
 * @param {string}  opt.bucket    카운터 이름 (엔드포인트별로 다르게)
 * @param {number}  opt.limit     창 안에서 허용할 횟수
 * @param {number}  opt.windowSec 창 길이(초)
 * @returns {Promise<{ok:boolean, count:number, retryAfter:number}>}
 */
async function rateLimit(req, opt) {
  const bucket    = (opt && opt.bucket)    || 'default';
  const limit     = (opt && opt.limit)     || 60;
  const windowSec = (opt && opt.windowSec) || 60;

  const ip   = clientIp(req);
  const slot = Math.floor(Date.now() / 1000 / windowSec);
  const key  = `rl:${bucket}:${ip}:${slot}`;

  try {
    /* incr 후 만료를 건다. incr 이 1을 돌려줬을 때만 expire 를 걸면
       창마다 정확히 한 번씩만 TTL 을 설정하게 된다. */
    const n = await kv.incr(key);
    if (n === 1) { try { await kv.expire(key, windowSec + 5); } catch (e) {} }

    if (n > limit) {
      const retryAfter = windowSec - (Math.floor(Date.now() / 1000) % windowSec);
      return { ok: false, count: n, retryAfter: retryAfter };
    }
    return { ok: true, count: n, retryAfter: 0 };
  } catch (e) {
    /* KV 장애 시 통과. 손님이 리포트를 못 보는 쪽이 더 나쁘다. */
    console.log('⚠️ rateLimit 우회(KV 오류):', e.message);
    return { ok: true, count: 0, retryAfter: 0 };
  }
}

/**
 * 걸리면 429 를 내보내고 true 를 돌려준다.
 * 호출부는 true 면 즉시 return 하면 된다.
 */
async function enforceRateLimit(req, res, opt) {
  const r = await rateLimit(req, opt);
  if (r.ok) return false;
  console.log(`🚫 레이트리밋 ${opt && opt.bucket} ip=${clientIp(req)} count=${r.count}`);
  res.setHeader('Retry-After', String(r.retryAfter));
  res.status(429).json({
    error: '잠시 후 다시 시도해 주세요.',
    retryAfter: r.retryAfter
  });
  return true;
}

module.exports = { clientIp, rateLimit, enforceRateLimit };
