import { redirect } from 'next/navigation';

// URL antiga: o painel moderno agora vive direto em /admin.
export default function AdminModernoPage() {
  redirect('/admin');
}
