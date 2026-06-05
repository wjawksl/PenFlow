// 네이버 검색광고 API 서명 — Web Crypto HMAC-SHA256(secret, `ts.method.uri`) → base64.
// 검색광고 인증 규약(M2 ② 경로 A 검색량·경쟁도). 서명 실패는 키 오류 또는 PC 시계 오차(R-0.5).
export interface NaverAdSign {
  timestamp: string; // X-Timestamp (epoch ms 문자열) — 서명과 동일 값이어야 함
  signature: string; // X-Signature (base64)
}

/** `${timestamp}.${method}.${uri}` 를 secretKey 로 HMAC-SHA256 서명. uri 는 쿼리 제외 경로. */
export async function signSearchAd(
  secretKey: string,
  method: string,
  uri: string,
  timestamp: string = Date.now().toString(),
): Promise<NaverAdSign> {
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey(
    'raw',
    enc.encode(secretKey),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${timestamp}.${method}.${uri}`));
  return { timestamp, signature: bytesToBase64(new Uint8Array(sig)) };
}

function bytesToBase64(bytes: Uint8Array): string {
  let bin = '';
  for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]!);
  return btoa(bin);
}
