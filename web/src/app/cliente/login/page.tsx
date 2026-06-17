import { redirect } from 'next/navigation';

// Login unificado: clientes e equipe usam a mesma tela (/login).
export default function ClienteLoginRedirect() {
  redirect('/login');
}
