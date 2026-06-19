import { createServerClient } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

/**
 * Renova a sessão do Supabase (equipe/admin) a cada request. Sem isto, o token
 * de acesso expira (~1h) e as Server Actions passam a falhar com "Não autenticado"
 * mesmo com o painel aberto. Não redireciona nada — só mantém o cookie fresco.
 * (O login de cliente usa cookie próprio 'pb_cliente' e não é afetado.)
 */
export async function middleware(request: NextRequest) {
  let response = NextResponse.next({ request });

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({ request });
          cookiesToSet.forEach(({ name, value, options }) => response.cookies.set(name, value, options));
        },
      },
    },
  );

  await supabase.auth.getUser(); // dispara o refresh do token quando necessário
  return response;
}

export const config = {
  // Roda em tudo, menos assets estáticos.
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)'],
};
