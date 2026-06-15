import { createClient } from '@supabase/supabase-js';

/**
 * Cliente Supabase privilegiado (service_role) — SÓ no servidor.
 * Ignora RLS; use em Route Handlers/Server Actions para ler/gravar dados
 * da banca. NUNCA importe isto em código 'use client'.
 */
export function createAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
}
