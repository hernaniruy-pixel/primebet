import { redirect } from 'next/navigation';

// Versão clássica aposentada: /admin sempre leva para a versão moderna.
export default function AdminPage() {
  redirect('/admin/moderno');
}
