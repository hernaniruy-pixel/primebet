'use client';

import { useState, useTransition } from 'react';
import { listarConfGrupos, listarConfImagens, ignorarImagem } from '../actions';
import type { ConfGrupo, ConfImagem, ConfImagensResp } from './types';

export default function Conferencia({ gruposIni, imagensIni }: { gruposIni: ConfGrupo[]; imagensIni: ConfImagensResp }) {
  const [grupos, setGrupos] = useState<ConfGrupo[]>(gruposIni);
  const [imagens, setImagens] = useState<ConfImagem[]>(imagensIni.rows);
  const [total, setTotal] = useState(imagensIni.total);
  const [grupoSel, setGrupoSel] = useState<string>(''); // '' = todos
  const [pend, setPend] = useState(true);
  const [zoom, setZoom] = useState<ConfImagem | null>(null);
  const [carregando, startTransition] = useTransition();

  function recarregar(grupoId = grupoSel, somentePend = pend) {
    startTransition(async () => {
      const [g, im] = await Promise.all([
        listarConfGrupos(),
        listarConfImagens({ grupoId: grupoId || undefined, pend: somentePend, page: 1 }),
      ]);
      setGrupos(g); setImagens(im.rows); setTotal(im.total);
    });
  }

  function selecionarGrupo(id: string) { setGrupoSel(id); recarregar(id, pend); }
  function alternarPend(v: boolean) { setPend(v); recarregar(grupoSel, v); }

  function ignorar(img: ConfImagem) {
    startTransition(async () => {
      await ignorarImagem(img.id, !img.ignorada);
      recarregar();
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
            <a href="/admin/moderno" className="rounded-lg border border-white/20 px-3 py-1.5 text-xs hover:bg-white/10">← Painel</a>
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

          <div className="max-h-[70vh] space-y-1.5 overflow-y-auto pr-1">
            {grupos.map((g) => (
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
            {grupos.length === 0 && <div className="rounded-lg border border-dashed border-slate-200 p-4 text-center text-sm text-slate-400">Nenhuma imagem recebida ainda.</div>}
          </div>
        </aside>

        {/* grade de imagens */}
        <section>
          <div className="mb-3 flex items-center justify-between">
            <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1">
              {([[true, 'Pendentes'], [false, 'Todas']] as const).map(([k, label]) => (
                <button key={String(k)} onClick={() => alternarPend(k)} className={`rounded-lg px-4 py-1.5 text-sm font-medium ${pend === k ? 'bg-[#13200a] text-[#DAA520]' : 'text-slate-500 hover:text-slate-800'}`}>{label}</button>
              ))}
            </div>
            <span className="text-xs text-slate-400">{carregando ? 'carregando…' : `${total} imagem(ns)`}</span>
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
                    <div className="flex items-center justify-between text-[11px] text-slate-400">
                      <span className="truncate">{img.remetente || '—'}</span>
                      <span>{img.enviadoEm.slice(5)}</span>
                    </div>
                    <div className="flex items-center justify-between pt-1">
                      {img.reagida
                        ? <span className="rounded-full bg-green-100 px-2 py-0.5 text-[10px] font-semibold text-green-700">✅ {img.lancada ? `#${img.apostaId}` : 'transcrita'}</span>
                        : img.ignorada
                          ? <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-500">ignorada</span>
                          : <span className="rounded-full bg-rose-100 px-2 py-0.5 text-[10px] font-semibold text-rose-700">pendente</span>}
                      {!img.reagida && (
                        <button onClick={() => ignorar(img)} className="rounded-md border border-slate-300 px-2 py-0.5 text-[11px] text-slate-600 hover:bg-slate-50">
                          {img.ignorada ? 'Reabrir' : 'Ignorar'}
                        </button>
                      )}
                    </div>
                  </div>
                </div>
              ))}
            </div>
          )}
          <p className="mt-3 text-center text-[11px] text-slate-400">
            Para lançar uma pendente, reaja na imagem dentro do WhatsApp (⚪ ⚫ 🔵 ⚠️) — ela é transcrita e marcada aqui automaticamente.
          </p>
        </section>
      </div>

      {/* zoom */}
      {zoom?.thumbUrl && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 p-4" onClick={() => setZoom(null)}>
          <img src={zoom.thumbUrl} alt="bilhete" className="max-h-[90vh] max-w-[90vw] rounded-lg" />
        </div>
      )}
    </main>
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
