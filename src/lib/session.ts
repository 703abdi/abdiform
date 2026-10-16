// Signed-cookie admin session using Web Crypto (works in proxy and server code).
// Cookie value: "<expiryMs>.<hmac>". No database, no third-party auth.

export const COOKIE = "tf_session";
const MAX_AGE_S = 60 * 60 * 24 * 30;

function secret(): string | null {
  return process.env.SESSION_SECRET || process.env.ADMIN_PASSWORD || null;
}

export function authConfigured(): boolean {
  return !!process.env.ADMIN_PASSWORD;
}

/** In development with no password set the dashboard is open, so setup is zero-friction. */
export function authBypassed(): boolean {
  return !authConfigured() && process.env.NODE_ENV !== "production";
}

const enc = new TextEncoder();

async function hmac(msg: string, key: string): Promise<string> {
  const k = await crypto.subtle.importKey("raw", enc.encode(key), { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  const sig = await crypto.subtle.sign("HMAC", k, enc.encode(msg));
  return Array.from(new Uint8Array(sig), (b) => b.toString(16).padStart(2, "0")).join("");
}

function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

export async function createToken(): Promise<string> {
  const key = secret();
  if (!key) throw new Error("ADMIN_PASSWORD is not set.");
  const exp = String(Date.now() + MAX_AGE_S * 1000);
  return `${exp}.${await hmac(exp, key)}`;
}

export async function verifyToken(token: string | undefined): Promise<boolean> {
  const key = secret();
  if (!token || !key) return false;
  const [exp, sig] = token.split(".");
  if (!exp || !sig || Number(exp) < Date.now()) return false;
  return safeEqual(sig, await hmac(exp, key));
}

export async function passwordMatches(input: string): Promise<boolean> {
  const real = process.env.ADMIN_PASSWORD;
  if (!real) return false;
  // Compare HMACs so length/timing don't leak the password.
  const a = await hmac(input, "pw-compare");
  const b = await hmac(real, "pw-compare");
  return safeEqual(a, b);
}

export const SESSION_MAX_AGE = MAX_AGE_S;

/** Short HMAC for public links (e.g. unsubscribe). Null when no secret is configured. */
export async function signValue(value: string): Promise<string | null> {
  const key = secret();
  return key ? (await hmac(`v:${value}`, key)).slice(0, 32) : null;
}

export async function verifySignedValue(value: string, sig: string): Promise<boolean> {
  const want = await signValue(value);
  return !!want && safeEqual(want, sig);
}
