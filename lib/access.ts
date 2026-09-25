import { env } from 'cloudflare:workers';
import { assert, type Pool } from './domain';
const encoder = new TextEncoder();
function secret() {
  const config = env as unknown as {
    SESSION_SECRET?: string;
    COMMISSIONER_KEY?: string;
  };
  const value = config.SESSION_SECRET ?? config.COMMISSIONER_KEY;
  assert(
    value && value.length >= 24,
    'A server session secret must be configured before participants can sign in.',
    503,
  );
  return value;
}
async function key() {
  return crypto.subtle.importKey(
    'raw',
    encoder.encode(secret()),
    { name: 'HMAC', hash: 'SHA-256' },
    false,
    ['sign', 'verify'],
  );
}
function hex(data: ArrayBuffer) {
  return Array.from(new Uint8Array(data), (b) =>
    b.toString(16).padStart(2, '0'),
  ).join('');
}
export async function hash(value: string) {
  return hex(
    await crypto.subtle.digest(
      'SHA-256',
      encoder.encode(value.trim().toUpperCase()),
    ),
  );
}

export function newCode() {
  return Array.from(
    crypto.getRandomValues(new Uint8Array(8)),
    (b) => 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'[b % 32],
  ).join('');
}
type Session = {
  role: 'admin' | 'member';
  id?: string;
  fingerprint?: string;
  exp: number;
};
async function sign(payload: string) {
  return hex(
    await crypto.subtle.sign('HMAC', await key(), encoder.encode(payload)),
  );
}
export async function sessionCookie(
  request: Request,
  role: 'admin' | 'member',
  member?: { id: string; codeHash?: string },
) {
  const data: Session = {
    role,
    exp: Date.now() + 7 * 24 * 60 * 60 * 1000,
    ...(member ? { id: member.id, fingerprint: member.codeHash } : {}),
  };
  const payload = btoa(JSON.stringify(data)),
    token = payload + '.' + (await sign(payload));
  return (
    'pool_' +
    role +
    '=' +
    token +
    '; HttpOnly; SameSite=Lax; Path=/; Max-Age=604800' +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '')
  );
}
export function clearCookie(request: Request, role: string) {
  return (
    'pool_' +
    role +
    '=; HttpOnly; SameSite=Lax; Path=/; Max-Age=0' +
    (new URL(request.url).protocol === 'https:' ? '; Secure' : '')
  );
}
async function session(
  request: Request,
  role: string,
): Promise<Session | null> {
  try {
    const token = (request.headers.get('cookie') ?? '')
      .split(';')
      .map((v) => v.trim())
      .find((v) => v.startsWith('pool_' + role + '='))
      ?.split('=')
      .slice(1)
      .join('=');
    if (!token) return null;
    const [payload, sig] = token.split('.');
    if (!sig || !/^[a-f0-9]{64}$/.test(sig)) return null;
    const bytes = Uint8Array.from(sig.match(/../g)!, (n) => parseInt(n, 16));
    if (
      !(await crypto.subtle.verify(
        'HMAC',
        await key(),
        bytes,
        encoder.encode(payload),
      ))
    )
      return null;
    const data = JSON.parse(atob(payload));
    return data.role === role && data.exp > Date.now() ? data : null;
  } catch {
    return null;
  }
}
export async function access(request: Request, pool: Pool) {
  const member = await session(request, 'member');
  return {
    // Commissioner controls are intentionally public at the pool owner's request.
    admin: true,
    memberId:
      pool.members.find(
        (m) => m.id === member?.id && m.codeHash === member?.fingerprint,
      )?.id ?? null,
  };
}
export function sameOrigin(request: Request) {
  const origin = request.headers.get('origin');
  assert(
    !origin || origin === new URL(request.url).origin,
    'This request must come from the pool website.',
    403,
  );
  assert(
    request.headers.get('content-type')?.includes('application/json'),
    'Use a JSON request.',
    415,
  );
}
