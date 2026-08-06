import 'server-only';
import crypto from 'node:crypto';

/**
 * TOTP (RFC 6238) implementado no próprio servidor — sem lib nova, sem serviço
 * externo. Compatível com Google Authenticator / Authy / 1Password:
 *   SHA1, 6 dígitos, passo de 30s, janela de tolerância ±1 (aceita o código
 *   anterior/próximo para cobrir relógio ligeiramente fora de hora).
 */

const ALFABETO = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ234567'; // base32 (RFC 4648)

/** Gera um segredo base32 aleatório (20 bytes = 160 bits, padrão dos apps). */
export function gerarSegredoBase32(bytes = 20): string {
  return base32Encode(crypto.randomBytes(bytes));
}

function base32Encode(buf: Buffer): string {
  let bits = 0, value = 0, out = '';
  for (const b of buf) {
    value = (value << 8) | b; bits += 8;
    while (bits >= 5) { out += ALFABETO[(value >>> (bits - 5)) & 31]; bits -= 5; }
  }
  if (bits > 0) out += ALFABETO[(value << (5 - bits)) & 31];
  return out;
}

function base32Decode(s: string): Buffer {
  const limpo = String(s || '').replace(/[^A-Z2-7]/gi, '').toUpperCase();
  let bits = 0, value = 0;
  const out: number[] = [];
  for (const ch of limpo) {
    const idx = ALFABETO.indexOf(ch);
    if (idx === -1) continue;
    value = (value << 5) | idx; bits += 5;
    if (bits >= 8) { out.push((value >>> (bits - 8)) & 0xff); bits -= 8; }
  }
  return Buffer.from(out);
}

/** HOTP de um contador (RFC 4226) → 6 dígitos. */
function hotp(secret: Buffer, counter: number): string {
  const buf = Buffer.alloc(8);
  buf.writeUInt32BE(Math.floor(counter / 2 ** 32), 0);
  buf.writeUInt32BE(counter >>> 0, 4);
  const hmac = crypto.createHmac('sha1', secret).update(buf).digest();
  const offset = hmac[hmac.length - 1] & 0xf;
  const bin =
    ((hmac[offset] & 0x7f) << 24) |
    (hmac[offset + 1] << 16) |
    (hmac[offset + 2] << 8) |
    hmac[offset + 3];
  return String(bin % 1_000_000).padStart(6, '0');
}

/** Confere um código de 6 dígitos contra o segredo, com janela ±`janela`. */
export function verificarTotp(segredoB32: string, codigo: string, janela = 1): boolean {
  const code = String(codigo || '').replace(/\D/g, '');
  if (code.length !== 6) return false;
  const secret = base32Decode(segredoB32);
  if (secret.length === 0) return false;
  const contador = Math.floor(Date.now() / 1000 / 30);
  const alvo = Buffer.from(code);
  for (let w = -janela; w <= janela; w++) {
    const esperado = Buffer.from(hotp(secret, contador + w));
    if (esperado.length === alvo.length && crypto.timingSafeEqual(esperado, alvo)) return true;
  }
  return false;
}

/** URI otpauth:// para o QR de cadastro no app autenticador. */
export function otpauthUri(segredoB32: string, conta: string, emissor: string): string {
  const label = encodeURIComponent(`${emissor}:${conta}`);
  const params = new URLSearchParams({
    secret: segredoB32,
    issuer: emissor,
    algorithm: 'SHA1',
    digits: '6',
    period: '30',
  });
  return `otpauth://totp/${label}?${params.toString()}`;
}
