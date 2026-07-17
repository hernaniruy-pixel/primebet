'use client';

import { useState, useTransition } from 'react';
import { listarConfGrupos, listarConfImagens, ignorarImagem, lancarImagem } from '../actions';
import type { ConfGrupo, ConfImagem, ConfImagensResp } from './types';

// enviadoEm vem como 'HH:mm DD/MM/AA' (fmtTs). No cartão o ano só ocupa espaço:
// mostramos 'DD/MM às HH:mm' — a HORA é o que o operador precisa para achar o print.
function dataHoraCurta(s: string): string {
  const m = /^(\d{2}):(\d{2})\s+(\d{2})[/-](\d{2})[/-](\d{2}|\d{4})$/.exec(s || '');
  return m ? `${m[3]}/${m[4]} ${m[1]}:${m[2]}` : s;
}

const EMOJIS: { e: string; label: string; campos: ('odd' | 'valor')[] }[] = [
  { e: '⚪', label: 'Completo (aposta + valor + odd)', campos: [] },
  { e: '⚫', label: 'Odd em aberto', campos: ['odd'] },
  { e: '🔵', label: 'Valor em aberto', campos: ['valor'] },
  { e: '⚠️', label: 'Odd e valor em aberto', campos: ['odd', 'valor'] },
];

export default function Conferencia({ gruposIni, imagensIni }: { gruposIni: ConfGrupo[]; imagensIni: ConfImagensResp }) {
  const [grupos, setGrupos] = useState<ConfGrupo[]>(gruposIni);
  const [imagens, setImagens] = useState<ConfImagem[]>(imagensIni.rows);
  const [total, setTotal] = useState(imagensIni.total);
  const [page, setPage] = useState(1);            // quantas páginas (de 48) já carregadas
  const [grupoSel, setGrupoSel] = useState<string>(''); // '' = todos
  const [buscaGrupo, setBuscaGrupo] = useState(''); // filtro da lista de grupos (são ~50)
  const [pend, setPend] = useState(true);
  const [zoom, setZoom] = useState<ConfImagem | null>(null);
  const [lancar, setLancar] = useState<ConfImagem | null>(null);
  const [emojiSel, setEmojiSel] = useState('⚪');
  const [oddSel, setOddSel] = useState('');
  const [valorSel, setValorSel] = useState('');
  const [msgErro, setMsgErro] = useState('');
  const [carregando, startTransition] = useTransition();

  const PER = 48;
  const totalPages = Math.max(1, Math.ceil(total / PER));

  // Carrega UMA página por vez (48). Assim ignorar/lançar não precisam refazer a
  // lista inteira nem reassinar centenas de miniaturas — o que estava deixando o
  // clique lento.
  function carregar(grupoId: string, somentePend: boolean, p: number) {
    startTransition(async () => {
      const [g, im] = await Promise.all([
        listarConfGrupos(),
        listarConfImagens({ grupoId: grupoId || undefined, pend: somentePend, page: p }),
      ]);
      setGrupos(g); setImagens(im.rows); setTotal(im.total); setPage(p);
    });
  }

  function recarregar(grupoId = grupoSel, somentePend = pend) { carregar(grupoId, somentePend, page); }
  // Trocar de grupo ou de aba recomeça na página 1.
  function selecionarGrupo(id: string) { setGrupoSel(id); carregar(id, pend, 1); }
  function alternarPend(v: boolean) { setPend(v); carregar(grupoSel, v, 1); }
  function irPara(p: number) { if (p >= 1 && p <= totalPages && p !== page) carregar(grupoSel, pend, p); }

  const gruposFiltrados = buscaGrupo.trim()
    ? grupos.filter((g) => (g.grupo_nome || g.grupo_id).toLowerCase().includes(buscaGrupo.trim().toLowerCase()))
    : grupos;

  function ignorar(img: ConfImagem) {
    const marcar = !img.ignorada;
    // Otimista: some da fila na hora (na aba Pendentes) ou alterna o rótulo (Todas),
    // sem esperar o servidor nem recarregar a página — o clique fica instantâneo.
    if (pend && marcar) { setImagens((cur) => cur.filter((x) => x.id !== img.id)); setTotal((t) => Math.max(0, t - 1)); }
    else setImagens((cur) => cur.map((x) => (x.id === img.id ? { ...x, ignorada: marcar } : x)));
    startTransition(async () => {
      try {
        await ignorarImagem(img.id, marcar);
        setGrupos(await listarConfGrupos()); // só os contadores da barra lateral
      } catch {
        recarregar(); // deu errado: ressincroniza a página
      }
    });
  }

  function abrirLancar(img: ConfImagem) { setLancar(img); setEmojiSel('⚪'); setOddSel(''); setValorSel(''); setMsgErro(''); }

  // Após lançar, o bot processa em ~5s. Recarrega algumas vezes até virar "transcrita".
  function agendarRefresh() {
    [4000, 8000, 13000, 20000].forEach((ms) => setTimeout(() => recarregar(), ms));
  }

  function confirmarLancar() {
    if (!lancar) return;
    const campos = EMOJIS.find((o) => o.e === emojiSel)?.campos ?? [];
    const odd = campos.includes('odd') ? oddSel.trim() || undefined : undefined;
    const valor = campos.includes('valor') ? valorSel.trim() || undefined : undefined;
    startTransition(async () => {
      const r = await lancarImagem(lancar.id, emojiSel, odd, valor);
      if (r.ok) { setLancar(null); recarregar(); agendarRefresh(); }
      else setMsgErro(r.erro || 'Erro.');
    });
  }

  const totRecebidas = grupos.reduce((s, g) => s + g.recebidas, 0);
  const totPendentes = grupos.reduce((s, g) => s + g.pendentes, 0);
  const totTranscritas = grupos.reduce((s, g) => s + g.transcritas, 0);

  return (
    <main className="min-h-screen bg-slate-50 text-slate-800">
      {/* topo */}
      <header className="bg-gradient-to-r from-[#13200a] to-[#1e2f10] text-white">
        <div className="mx-auto flex max-w-7xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <a href="/admin" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">← Painel</a>
            <div>
              <div className="text-sm font-semibold text-[#DAA520]">Conferência de grupos</div>
              <div className="text-[11px] text-slate-300">Imagens recebidas × transcritas</div>
            </div>
          </div>
          <button onClick={() => recarregar()} className="rounded-lg border border-amber-400/40 bg-amber-500/10 px-3 py-1.5 text-xs text-amber-200 hover:bg-amber-500/20">🔄 Atualizar</button>
        </div>
      </header>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-4 px-4 py-5 md:grid-cols-[280px_1fr]">
        {/* coluna grupos */}
        <aside className="space-y-2">
          <div className="grid grid-cols-3 gap-2 text-center">
            <Mini titulo="Recebidas" v={totRecebidas} cor="text-slate-700" />
            <Mini titulo="Transcritas" v={totTranscritas} cor="text-green-600" />
            <Mini titulo="Pendentes" v={totPendentes} cor="text-rose-600" />
          </div>

          <button
            onClick={() => selecionarGrupo('')}
            className={`w-full rounded-lg border px-3 py-2 text-left text-sm ${grupoSel === '' ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
          >
            <b>Todos os grupos</b>
          </button>

          {/* Busca de grupo: são ~50, rolar para achar era inviável. */}
          <div className="relative">
            <input
              value={buscaGrupo}
              onChange={(e) => setBuscaGrupo(e.target.value)}
              placeholder="🔍 Buscar grupo…"
              className="w-full rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm outline-none focus:border-amber-500 focus:ring-2 focus:ring-amber-500/20"
            />
            {buscaGrupo && (
              <button onClick={() => setBuscaGrupo('')} title="Limpar" className="absolute right-2 top-1/2 -translate-y-1/2 rounded px-1 text-slate-400 hover:text-slate-700">✕</button>
            )}
          </div>

          {/* No celular o layout empilha e esta lista vem ANTES das imagens: com 70vh de
              altura, os prints ficavam fora de vista e pareciam não existir. */}
          <div className="max-h-[28vh] space-y-1.5 overflow-y-auto pr-1 md:max-h-[70vh]">
            {gruposFiltrados.map((g) => (
              <button
                key={g.grupo_id}
                onClick={() => selecionarGrupo(g.grupo_id)}
                className={`w-full rounded-lg border px-3 py-2 text-left ${grupoSel === g.grupo_id ? 'border-amber-400 bg-amber-50' : 'border-slate-200 bg-white hover:bg-slate-50'}`}
              >
                <div className="flex items-center justify-between gap-2">
                  <span className="truncate text-sm font-medium">{g.grupo_nome || g.grupo_id}</span>
                  {g.pendentes > 0 && <span className="shrink-0 rounded-full bg-rose-100 px-2 py-0.5 text-[11px] font-semibold text-rose-700">{g.pendentes}</span>}
                </div>
                <div className="mt-0.5 flex items-center gap-2 text-[11px] text-slate-400">
                  <span>{g.transcritas}/{g.recebidas} transcritas</span>
                  {!g.tem_cliente && <span className="rounded bg-amber-100 px-1.5 font-semibold text-amber-700">⚠️ sem cliente</span>}
                </div>
              </button>
            ))}
            {gruposFiltrados.length === 0 && (
              <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">
                {grupos.length === 0 ? 'Nenhuma imagem recebida ainda.' : 'Nenhum grupo encontrado.'}
              </div>
            )}
          </div>
        </aside>

        {/* grade de imagens */}
        <section>
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {([[true, 'Pendentes'], [false, 'Todas']] as const).map(([k, label]) => (
                <button key={String(k)} onClick={() => alternarPend(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${pend === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
              ))}
            </div>
            <div className="flex items-center gap-3">
              <span className="text-xs text-slate-400">{carregando ? 'carregando…' : `${total} imagem(ns)`}</span>
              <Pager page={page} totalPages={totalPages} onIr={irPara} carregando={carregando} />
            </div>
          </div>

          {imagens.length === 0 ? (
            <div className="rounded-xl border border-dashed border-slate-200 bg-white p-12 text-center text-slate-400">
              {pend ? '✅ Nenhuma imagem pendente. Tudo conferido!' : 'Nenhuma imagem neste filtro.'}
            </div>
          ) : (
            <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4">
              {imagens.map((img) => (
                <div key={img.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                  <button onClick={() => img.thumbUrl && setZoom(img)} className="flex w-full items-center justify-center bg-slate-100" style={{ aspectRatio: '3/4' }} title="Clique para ampliar">
                    {img.thumbUrl
                      ? <img src={img.thumbUrl} alt="bilhete" className="max-h-full max-w-full object-contain" />
                      : <span className="text-xs text-slate-400">sem miniatura</span>}
                  </button>
                  <div className="space-y-1 p-2">
                    <div className="truncate text-xs font-medium" title={img.grupoNome || ''}>{img.grupoNome || img.grupoId}</div>
                    <div className="flex items-center justify-between gap-1 text-[11px] text-slate-400">
                      <span className="truncate">{img.remetente || '—'}</span>
                      <span className="shrink-0 tabular-nums" title={img.enviadoEm}>{dataHoraCurta(img.enviadoEm)}</span>
                    </div>
                    {img.legenda && (
                      <div className="truncate rounded bg-emerald-50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-700" title={`Valor escrito na mensagem: ${img.legenda}`}>
                        💬 {img.legenda}
                      </div>
                    )}
                    <div className="flex items-center justify-between pt-1">
                      {img.reagida
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">✅ {img.lancada ? `#${img.apostaId}` : 'transcrita'}</span>
                        : img.pedidoStatus === 'pendente'
                          ? <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-semibold text-amber-700">⏳ lançando…</span>
                          : img.pedidoStatus === 'erro'
                            ? <span title={img.pedidoErro || ''} className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">erro ⚠</span>
                            : img.ignorada
                              ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">ignorada</span>
                              : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">pendente</span>}
                      {!img.reagida && img.pedidoStatus !== 'pendente' && (
                        <div className="flex items-center gap-1">
                          <button onClick={() => abrirLancar(img)} className="rounded-md bg-emerald-600 px-2 py-0.5 text-[11px] font-medium text-white hover:bg-emerald-700">Lançar</button>
                          <button onClick={() => ignorar(img)} className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">
                            {img.ignorada ? 'Reabrir' : 'Ignorar'}
                          </button>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}

          {totalPages > 1 && (
            <div className="mt-4 flex justify-center">
              <Pager page={page} totalPages={totalPages} onIr={irPara} carregando={carregando} />
            </div>
          )}

          <p className="mt-3 text-center text-[11px] text-slate-400">
            Para lançar uma pendente, reaja na imagem dentro do WhatsApp (⚪ ⚫ 🔵 ⚠️) — ela é transcrita e marcada aqui automaticamente.
          </p>
        </section>
      </div>

      {/* modal lançar */}
      {lancar && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={() => setLancar(null)}>
          <div className="max-h-[90vh] w-full max-w-md overflow-y-auto rounded-2xl bg-white p-5 shadow-xl" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-semibold text-slate-800">Lançar bilhete — {lancar.grupoNome || lancar.grupoId}</h3>
            {lancar.thumbUrl && (
              <img src={lancar.thumbUrl} alt="bilhete" className="mx-auto mb-4 max-h-60 rounded-lg border border-slate-200 object-contain" />
            )}
            <label className="mb-1 block text-[11px] font-medium text-slate-500">Tipo de reação</label>
            <div className="space-y-1.5">
              {EMOJIS.map((o) => (
                <div key={o.e} className={`rounded-lg border ${emojiSel === o.e ? 'border-emerald-400 bg-emerald-50' : 'border-slate-200'}`}>
                  <label className="flex cursor-pointer items-center gap-2 px-3 py-2 text-sm">
                    <input type="radio" name="emoji" checked={emojiSel === o.e} onChange={() => setEmojiSel(o.e)} className="accent-emerald-600" />
                    <span className="text-base">{o.e}</span><span className="text-slate-700">{o.label}</span>
                  </label>
                  {emojiSel === o.e && o.campos.length > 0 && (
                    <div className="flex gap-3 border-t border-emerald-200 px-3 py-2">
                      {o.campos.includes('odd') && (
                        <div className="flex-1">
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Odd</label>
                          <input value={oddSel} onChange={(e) => setOddSel(e.target.value)} placeholder="ex.: 1.85" className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500" />
                        </div>
                      )}
                      {o.campos.includes('valor') && (
                        <div className="flex-1">
                          <label className="mb-0.5 block text-[10px] font-medium text-slate-500">Valor</label>
                          <input value={valorSel} onChange={(e) => setValorSel(e.target.value)} placeholder="ex.: 500, 1k, 2,5k" className="w-full rounded-md border border-slate-300 px-2 py-1 text-sm outline-none focus:border-emerald-500" />
                        </div>
                      )}
                    </div>
                  )}
                </div>
              ))}
            </div>
            {msgErro && <div className="mt-2 text-xs text-rose-600">{msgErro}</div>}
            <div className="mt-4 flex justify-end gap-2">
              <button onClick={() => setLancar(null)} className="rounded-lg px-3 py-1.5 text-sm text-slate-500 hover:bg-slate-100">Cancelar</button>
              <button onClick={confirmarLancar} disabled={carregando} className="rounded-lg bg-emerald-600 px-4 py-1.5 text-sm font-medium text-white hover:bg-emerald-700 disabled:opacity-50">
                {carregando ? 'Enviando…' : 'Lançar agora'}
              </button>
            </div>
            <p className="mt-2 text-center text-[11px] text-slate-400">O bot transcreve e a aposta entra como EM ABERTO. Atualize em alguns segundos.</p>
          </div>
        </div>
      )}

      {/* zoom */}
      {zoom?.thumbUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setZoom(null)}>
          <img src={zoom.thumbUrl} alt="bilhete" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
        </div>
      )}
    </main>
  );
}

function Pager({ page, totalPages, onIr, carregando }: { page: number; totalPages: number; onIr: (p: number) => void; carregando: boolean }) {
  if (totalPages <= 1) return null;
  const btn = 'rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-sm font-medium text-slate-600 transition enabled:hover:bg-slate-50 disabled:opacity-40';
  return (
    <div className="flex items-center gap-1">
      <button disabled={carregando || page <= 1} onClick={() => onIr(page - 1)} className={btn} title="Página anterior">‹ Anterior</button>
      <span className="px-2 text-xs tabular-nums text-slate-500">{page}/{totalPages}</span>
      <button disabled={carregando || page >= totalPages} onClick={() => onIr(page + 1)} className={btn} title="Próxima página">Próxima ›</button>
    </div>
  );
}

function Mini({ titulo, v, cor }: { titulo: string; v: number; cor: string }) {
  return (
    <div className="rounded-lg border border-slate-200 bg-white p-2">
      <div className="text-[10px] uppercase tracking-wide text-slate-400">{titulo}</div>
      <div className={`text-lg font-semibold tabular-nums ${cor}`}>{v}</div>
    </div>
  );
}
