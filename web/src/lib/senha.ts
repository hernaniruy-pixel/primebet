import 'server-only';
import crypto from 'node:crypto';

/**
 * Hash de senha da EQUIPE (gestor/operador) com scrypt — nativo do Node, sem lib nova.
 * Formato guardado no banco: "scrypt$<salt_base64url>$<hash_base64url>".
 * (As senhas de CLIENTE ainda são texto puro por ora — migração à parte.)
 */
const N = 64; // bytes do hash derivado

export function hashSenha(senha: string): string {
  const salt = crypto.randomBytes(16);
  const dk = crypto.scryptSync(String(senha), salt, N);
  return `scrypt$${salt.toString('base64url')}$${dk.toString('base64url')}`;
}

export function conferirSenha(senha: string, armazenado: string): boolean {
  const p = String(armazenado || '').split('$');
  if (p.length !== 3 || p[0] !== 'scrypt') return false;
  try {
    const salt = Buffer.from(p[1], 'base64url');
    const esperado = Buffer.from(p[2], 'base64url');
    const dk = crypto.scryptSync(String(senha), salt, esperado.length);
    // timingSafeEqual exige mesmo tamanho — o length é fixo (N), mas confere por segurança.
    return dk.length === esperado.length && crypto.timingSafeEqual(dk, esperado);
  } catch {
    return false;
  }
}
