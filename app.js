/* Controle de Orçamentos — interface.
   Toda a autoridade (senha, permissões, revisões, auditoria) está no banco; aqui só se exibe e se envia. */
(() => {
'use strict';

const cfg = window.APP_CONFIG || {};
const DEMO = !cfg.SUPABASE_URL || !cfg.SUPABASE_ANON_KEY;

/* ------------------------------------------------------------------ utilidades */
const $ = (s, r = document) => r.querySelector(s);
const $$ = (s, r = document) => [...r.querySelectorAll(s)];
const esc = s => String(s ?? '').replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const norm = s => String(s ?? '').normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
const safe = (fn, fallback = null) => { try { return fn(); } catch { return fallback; } };
const ses = { get: k => safe(() => sessionStorage.getItem(k)), set: (k, v) => safe(() => v == null ? sessionStorage.removeItem(k) : sessionStorage.setItem(k, v)) };
const loc = { get: k => safe(() => localStorage.getItem(k)), set: (k, v) => safe(() => localStorage.setItem(k, v)) };
const brl = new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' });
const fmtV = n => brl.format(Number(n) || 0);
const fmtD = iso => iso ? `${iso.slice(8, 10)}/${iso.slice(5, 7)}/${iso.slice(0, 4)}` : '—';
const fmtDT = ts => ts ? new Date(ts).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) : '—';
const hoje = () => new Date(Date.now() - new Date().getTimezoneOffset() * 60000).toISOString().slice(0, 10);
const verPill = o => vigente(o) ? '<span class="pill ent">Vigente</span>' : '<span class="pill ant">Versão anterior</span>';
const ord = n => n === 0 ? 'Original' : `${n}ª Revisão`;
function parseBRL(t) {
  let s = String(t).replace(/[R$\s]/g, '');
  if (s.includes(',')) s = s.replace(/\./g, '').replace(',', '.');
  else if (!/^\d+\.\d{1,2}$/.test(s)) s = s.replace(/\./g, '');
  const n = Number(s);
  return Number.isFinite(n) && n >= 0 ? Math.round(n * 100) / 100 : NaN;
}
const money2 = n => Number(n).toFixed(2).replace('.', ',');

const ICON = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  consultar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  cadastrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  historico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  administracao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};
const NAV = [
  { id: 'painel', label: 'Painel inicial', short: 'Painel' },
  { id: 'consultar', label: 'Consultar orçamentos', short: 'Consultar' },
  { id: 'cadastrar', label: 'Cadastrar orçamento', short: 'Cadastrar', admin: true },
  { id: 'historico', label: 'Histórico de revisões', short: 'Revisões' },
  { id: 'administracao', label: 'Administração', short: 'Admin', admin: true }
];

/* ------------------------------------------------------------------ acesso ao banco */
function erro(msg) {
  const m = /^([a-z_]+): ([\s\S]*)$/.exec(msg || '');
  const e = new Error(m ? m[2] : (msg || 'Falha de comunicação com o banco de dados.'));
  e.code = m ? m[1] : 'erro';
  return e;
}
async function http(path, body) {
  const h = { apikey: cfg.SUPABASE_ANON_KEY, 'Content-Type': 'application/json' };
  if (cfg.SUPABASE_ANON_KEY.startsWith('eyJ')) h.Authorization = 'Bearer ' + cfg.SUPABASE_ANON_KEY;
  let r;
  try { r = await fetch(cfg.SUPABASE_URL.replace(/\/$/, '') + path, { method: body ? 'POST' : 'GET', headers: h, body: body ? JSON.stringify(body) : undefined }); }
  catch { throw erro('Sem conexão com o servidor. Verifique a internet e tente novamente.'); }
  const txt = await r.text();
  const data = txt ? safe(() => JSON.parse(txt), txt) : null;
  if (!r.ok) throw erro(data && data.message ? data.message : `Erro ${r.status}`);
  return data;
}
/* Toda leitura passa por consulta_dados(), que exige a senha de consulta (guardada só na aba, em sessionStorage). */
const Remote = (() => {
  const consulta = async (senha, ids) => http('/rest/v1/rpc/consulta_dados', { p_senha: senha || '', p_ids: ids });
  const certa = async ids => { const d = await consulta(S.cs, ids); if (d === null) throw erro('consulta_invalida: senha de consulta incorreta'); return d; };
  let pend = null;
  const dados = () => pend || (pend = certa(null).finally(() => { pend = null; }));
  return {
    entrar: senha => consulta(senha, null),
    listar: async () => (await dados()).orcamentos,
    responsaveis: async () => (await dados()).responsaveis,
    auditoria: async ids => (await certa(ids && ids.length ? ids : [])).auditoria,
    rpc: (nome, args) => http('/rest/v1/rpc/' + nome, args || {})
  };
})();

/* Modo demonstração: mesma interface, dados só na memória (senha: demo1234). */
const Demo = (() => {
  const resp = ['Ana Ribeiro', 'Bruno Teixeira', 'Carla Mendes', 'Diego Farias', 'Eva Lima'].map((nome, i) => ({ id: 'r' + i, nome, ativo: true, criado_em: '2026-07-01T12:00:00Z' }));
  const rv = (n, manter) => { const k = x => (x || '').trim().toLowerCase(); if (manter && k(n) === k(manter)) return manter.trim(); const r = resp.find(x => x.ativo && k(x.nome) === k(n)); if (!r) throw erro(resp.some(x => x.ativo) ? 'responsavel_invalido: escolha um nome da lista de responsáveis' : 'responsavel_invalido: cadastre os responsáveis em Administração antes de registrar orçamentos'); return r.nome; };
  let db = [], aud = [], senha = 'demo1234'; const tokens = new Set(); let seq = 0;
  const uid = () => 'd' + (++seq);
  const add = (numero, obra, resp, entrega, valor, ex, rg, raiz, de, rev, por, motivo, ts) => {
    const id = uid(); db.push({ id, numero, obra, responsavel: resp, data_entrega: entrega, valor, tipo_execucao: ex, regime: rg, observacoes: null,
      raiz_id: raiz || id, revisao_de_id: de || null, num_revisao: rev || 0, revisao_motivo: motivo || null, criado_em: ts, criado_por: por, atualizado_em: null, arquivado_em: null });
    aud.push({ id: aud.length + 1, orcamento_id: id, numero, acao: rev ? 'revisao' : 'cadastro', por, motivo: motivo || null, em: ts, antes: null, depois: null });
    return id;
  };
  const a = add('001', 'Reforma da Escola Municipal Santa Luzia', 'Ana Ribeiro', '2026-09-18', 482350, 'Direta', 'Desonerado', null, null, 0, 'Ana Ribeiro', null, '2026-08-20T13:10:00Z');
  add('002', 'Reforma da Escola Municipal Santa Luzia', 'Bruno Teixeira', '2026-10-05', 497120.4, 'Direta', 'Desonerado', a, a, 1, 'Bruno Teixeira', 'Atualização da tabela de preços de insumos', '2026-09-30T17:40:00Z');
  add('003', 'Pavimentação da Rua das Acácias', 'Carla Mendes', '2026-11-28', 1236900, 'Indireta', 'Não Desonerado', null, null, 0, 'Carla Mendes', null, '2026-10-02T12:00:00Z');
  const d = add('004', 'Ampliação da UBS Centro', 'Diego Farias', '2026-08-30', 2870500, 'Indireta', 'Desonerado', null, null, 0, 'Diego Farias', null, '2026-07-28T15:30:00Z');
  const d1 = add('005', 'Ampliação da UBS Centro', 'Ana Ribeiro', '2026-09-22', 2931775.1, 'Indireta', 'Desonerado', d, d, 1, 'Ana Ribeiro', 'Inclusão de sistema de climatização', '2026-09-12T14:05:00Z');
  add('006', 'Ampliação da UBS Centro', 'Bruno Teixeira', '2026-10-14', 2918340, 'Indireta', 'Desonerado', d, d1, 2, 'Bruno Teixeira', 'Ajuste de BDI conforme parecer', '2026-10-08T19:20:00Z');
  add('007', 'Praça do Mercado Municipal', 'Carla Mendes', '2026-12-10', 318450, 'Direta', 'Não Desonerado', null, null, 0, 'Carla Mendes', null, '2026-10-29T11:45:00Z');

  const need = t => { if (!tokens.has(t)) throw erro('nao_autorizado: sessão administrativa inválida ou expirada'); };
  const get = (id, arq) => { const o = db.find(x => x.id === id && !!x.arquivado_em === !!arq); if (!o) throw erro('nao_encontrado: registro não encontrado'); return o; };
  const log = (o, acao, por, motivo) => aud.push({ id: aud.length + 1, orcamento_id: o.id, numero: o.numero, acao, por, motivo: motivo || null, em: new Date().toISOString(), antes: null, depois: null });
  const prox = () => String(Math.max(0, ...db.map(x => parseInt(x.numero, 10) || 0)) + 1).padStart(3, '0');
  const campos = (o, p) => Object.assign(o, { responsavel: p.p_responsavel.trim(), data_entrega: p.p_data_entrega, valor: p.p_valor, tipo_execucao: p.p_execucao, regime: p.p_regime, observacoes: (p.p_obs || '').trim() || null });
  const fns = {
    admin_adicionar_responsavel: p => { need(p.p_token); const n = (p.p_nome || '').trim().replace(/\s+/g, ' '); if (n.length < 2) throw erro('nome_invalido: informe o nome completo');
      const ex = resp.find(x => x.nome.toLowerCase() === n.toLowerCase()); if (ex) { if (ex.ativo) throw erro('nome_duplicado: este nome já está na lista'); ex.ativo = true; return ex; }
      const r = { id: uid(), nome: n, ativo: true, criado_em: new Date().toISOString() }; resp.push(r); return r; },
    admin_alterar_responsavel: p => { need(p.p_token); const n = (p.p_nome || '').trim().replace(/\s+/g, ' '); if (n.length < 2) throw erro('nome_invalido: informe o nome completo');
      const r = resp.find(x => x.id === p.p_id); if (!r) throw erro('nao_encontrado: responsável não encontrado');
      if (resp.some(x => x !== r && x.nome.toLowerCase() === n.toLowerCase())) throw erro('nome_duplicado: já existe um responsável com este nome');
      r.nome = n; if (p.p_ativo != null) r.ativo = p.p_ativo; return r; },
    admin_definir_senha_consulta: p => { need(p.p_token); if ((p.p_nova || '').length < 6) throw erro('senha_fraca: a senha de consulta deve ter pelo menos 6 caracteres'); return null; },
    admin_login: p => { if (p.p_senha !== senha) return null; const t = 'tk' + Math.random().toString(36).slice(2); tokens.add(t); return t; },
    admin_validar_sessao: p => tokens.has(p.p_token),
    admin_logout: p => { tokens.delete(p.p_token); return null; },
    admin_alterar_senha: p => { need(p.p_token); if (p.p_atual !== senha) throw erro('senha_incorreta: a senha atual não confere'); if ((p.p_nova || '').length < 8) throw erro('senha_fraca: a nova senha deve ter pelo menos 8 caracteres'); senha = p.p_nova; tokens.clear(); const t = 'tk' + Math.random().toString(36).slice(2); tokens.add(t); return t; },
    admin_criar_orcamento: p => { need(p.p_token); p.p_responsavel = rv(p.p_responsavel); p.p_por = rv(p.p_por); const n = (p.p_numero || '').trim() || prox(); if (db.some(x => x.numero === n)) throw erro(`numero_duplicado: já existe um orçamento com o número ${n}`);
      const id = uid(); const o = { id, numero: n, obra: p.p_obra.trim(), observacoes: null, raiz_id: id, revisao_de_id: null, num_revisao: 0, revisao_motivo: null, criado_em: new Date().toISOString(), criado_por: p.p_por.trim(), atualizado_em: null, arquivado_em: null };
      campos(o, p); db.push(o); log(o, 'cadastro', o.criado_por); return o; },
    admin_criar_revisao: p => { need(p.p_token); p.p_responsavel = rv(p.p_responsavel); p.p_por = rv(p.p_por); const b = get(p.p_base_id); const id = uid(); const rev = Math.max(...db.filter(x => x.raiz_id === b.raiz_id).map(x => x.num_revisao)) + 1;
      const o = { id, numero: prox(), obra: b.obra, observacoes: null, raiz_id: b.raiz_id, revisao_de_id: b.id, num_revisao: rev, revisao_motivo: (p.p_motivo || '').trim() || null, criado_em: new Date().toISOString(), criado_por: p.p_por.trim(), atualizado_em: null, arquivado_em: null };
      campos(o, p); db.push(o); log(o, 'revisao', o.criado_por, o.revisao_motivo); return o; },
    admin_editar: p => { need(p.p_token); const o = get(p.p_id); p.p_responsavel = rv(p.p_responsavel, o.responsavel); p.p_por = rv(p.p_por); o.obra = p.p_obra.trim(); campos(o, p); o.atualizado_em = new Date().toISOString(); log(o, 'edicao', p.p_por, p.p_motivo); return o; },
    admin_arquivar: p => { need(p.p_token); if ((p.p_motivo || '').trim().length < 3) throw erro('motivo_obrigatorio: informe o motivo'); p.p_por = rv(p.p_por); const o = get(p.p_id); o.arquivado_em = new Date().toISOString(); o.arquivado_motivo = p.p_motivo; log(o, 'arquivamento', p.p_por, p.p_motivo); return null; },
    admin_restaurar: p => { need(p.p_token); p.p_por = rv(p.p_por); const o = get(p.p_id, true); o.arquivado_em = null; log(o, 'restauracao', p.p_por); return null; },
    admin_listar_arquivados: p => { need(p.p_token); return db.filter(x => x.arquivado_em); },
    admin_excluir_definitivo: p => { need(p.p_token); p.p_por = rv(p.p_por); if (p.p_senha !== senha) throw erro('senha_incorreta: senha incorreta'); const o = get(p.p_id, true);
      if ((p.p_confirmacao || '').trim() !== o.numero) throw erro('confirmacao_invalida: digite o número do orçamento para confirmar');
      if (db.some(x => x.id !== o.id && (x.revisao_de_id === o.id || x.raiz_id === o.id))) throw erro('possui_revisoes: existem revisões vinculadas; arquive-as e exclua-as antes');
      log(o, 'exclusao_definitiva', p.p_por); db = db.filter(x => x !== o); return null; }
  };
  const clone = x => JSON.parse(JSON.stringify(x));
  return {
    listar: async () => clone(db.filter(x => !x.arquivado_em)).sort((x, y) => y.criado_em.localeCompare(x.criado_em)),
    responsaveis: async () => clone(resp).sort((x, y) => x.nome.localeCompare(y.nome)),
    auditoria: async ids => clone(aud).filter(x => !ids || ids.includes(x.orcamento_id)).sort((x, y) => y.em.localeCompare(x.em)).slice(0, 200),
    rpc: async (n, args) => clone(fns[n](args))
  };
})();


/* Modo página: os dados ficam num bloco JSON dentro do próprio HTML; cada alteração republica a página inteira. */
const PageStore = (() => {
  const COLS = ['orcamentos', 'responsaveis', 'auditoria', 'arquivados'];
  const el = document.getElementById('dados');
  let st = {}; try { st = JSON.parse(el ? el.textContent : '{}') || {}; } catch { st = {}; }
  for (const c of COLS) if (!Array.isArray(st[c])) st[c] = [];
  const subs = [];
  const clone = x => JSON.parse(JSON.stringify(x));
  const notify = () => subs.forEach(f => f());
  const snap = (col, ord, lim) => { let a = clone(st[col]); if (ord) a.sort((x, y) => { const p = x[ord[0]] || '', q = y[ord[0]] || ''; return (p < q ? -1 : p > q ? 1 : 0) * (ord[1] === 'desc' ? -1 : 1); }); if (lim) a = a.slice(0, lim); return { docs: a.map(d => ({ id: d.id, data: () => d })) }; };
  const query = (col, ord, lim) => ({
    orderBy: (f, d = 'asc') => query(col, [f, d], lim), limit: n => query(col, ord, n),
    onSnapshot(next) { const f = () => next(snap(col, ord, lim)); subs.push(f); f(); return () => {}; } });
  const db = {
    collection: c => query(c),
    doc: path => { const [col, id] = path.split('/'); return {
      set: async d => { if (!st[col]) return; st[col] = [...st[col].filter(x => x.id !== id), clone(d)]; notify(); },
      delete: async () => { if (!st[col]) return; st[col] = st[col].filter(x => x.id !== id); notify(); },
      acquire: async () => ({ acquired: true }) }; }
  };
  const gerar = () => {
    const t = id => { const e = document.getElementById(id); return e ? e.textContent : ''; };
    const json = JSON.stringify(st).replace(/</g, '\\u003c');
    return '<!doctype html><html><head><meta charset=utf8><meta name=viewport content="width=device-width,initial-scale=1,viewport-fit=cover"><style>:root{color-scheme:light;box-sizing:border-box;padding-top:env(safe-area-inset-top,0px);padding-bottom:env(safe-area-inset-bottom,0px)}html{scroll-padding-top:env(safe-area-inset-top,0px)}body{margin:0;padding:0;font:14px -apple-system,BlinkMacSystemFont,sans-serif;background:#fff;color:#000}img{max-width:100%}[hidden]:not([hidden=until-found i]){display:none!important}</style></head><body>'
      + t('head-src') + '\n<style id="app-css">' + t('app-css') + '</style>\n' + t('shell-src') + '\n'
      + '<script type="application/json" id="dados">' + json + '<\/script>\n'
      + '<script type="text/plain" id="head-src">' + t('head-src') + '<\/script>\n'
      + '<script type="text/plain" id="shell-src">' + t('shell-src') + '<\/script>\n'
      + '<script>window.APP_MODE="page";window.APP_CONFIG={};<\/script>\n'
      + '<script id="app-js">' + t('app-js') + '<\/script>\n</body></html>';
  };
  const commit = async () => {
    let art = null;
    try { art = window.claude && window.claude.use ? await window.claude.use('artifact') : null; } catch { art = null; }
    if (!art) throw erro('nao_autorizado: não foi possível salvar. Entre na sua conta do Claude com acesso de edição a esta página.');
    ses.set('apos', '1');
    try { await art.publish(gerar()); }
    catch (e) {
      ses.set('apos', null);
      const c = e && e.code;
      if (c === 'conflict') throw erro('conflito: outra pessoa salvou antes de você. A página vai recarregar com os dados mais recentes; refaça a ação.');
      if (['not_writer', 'not_granted', 'not_declared', 'capability_disabled', 'capability_removed', 'consent_required'].includes(c)) throw erro('nao_autorizado: só quem tem acesso de edição pode alterar os dados. Peça ao dono da página.');
      throw erro('falha_ao_salvar: não foi possível salvar agora. Tente de novo em instantes.');
    }
  };
  return { db, commit, snapshot: () => clone(st), restore: x => { st = x; notify(); } };
})();

/* Modo Claude: dados na capacidade "db" da própria página; quem edita é definido pelo menu Compartilhar. */
const Cloud = (() => {
  let db = null, admin = false, inicio = null, primeiros = null;
  const cache = { orcamentos: [], responsaveis: [], auditoria: [], arquivados: [] };
  const clone = x => JSON.parse(JSON.stringify(x));
  const k = x => (x || '').trim().toLowerCase();
  const agora = () => new Date().toISOString();
  const rid = () => Math.random().toString(36).slice(2, 10);
  const need = () => { if (!admin) throw erro('nao_autorizado: só quem tem acesso de edição pode alterar os dados. Peça ao dono da página.'); };
  function iniciar() {
    return inicio || (inicio = (async () => {
      const c = window.claude;
      db = PAGE ? PageStore.db : (c && c.use ? await c.use('db') : null);
      if (!db) throw erro('sem_acesso: não foi possível abrir os dados. Entre na sua conta do Claude e peça acesso ao dono da página.');
      let u = null; try { u = c && c.use ? await c.use('user') : null; } catch { u = null; }
      try { admin = !!(u && await u.canEdit()); } catch { admin = false; }
      primeiros = new Promise((ok, falha) => {
        const t = setTimeout(() => falha(erro('sem_conexao: os dados não responderam. Verifique a conexão e abra a página de novo.')), 12000);
        let n = 0;
        const sub = (nome, q, essencial) => {
          let primeiro = true;
          q.onSnapshot(snap => {
            cache[nome] = snap.docs.map(d => d.data());
            if (primeiro) { primeiro = false; if (essencial && ++n === 2) { clearTimeout(t); ok(); } }
            if (window.__dadosMudaram) window.__dadosMudaram();
          }, e => { if (primeiro) { clearTimeout(t); falha(erro('sem_acesso: ' + e.message)); } });
        };
        sub('orcamentos', db.collection('orcamentos'), true);
        sub('responsaveis', db.collection('responsaveis'), true);
        sub('auditoria', db.collection('auditoria').orderBy('em', 'desc').limit(500), false);
        if (admin) sub('arquivados', db.collection('arquivados'), false);
      });
      primeiros.catch(() => {});
      return admin;
    })());
  }
  const pronto = async () => { await iniciar(); await primeiros; };
  async function comLock(fn) {
    const ref = db.doc('locks/numeracao');
    for (let i = 0; i < 8; i++) {
      const r = await ref.acquire({ holder: 'ed' + rid(), ttlMs: 8000 });
      if (r.acquired) return fn();
      await new Promise(ok => setTimeout(ok, 500));
    }
    throw erro('ocupado: outro editor está registrando agora. Tente de novo em alguns segundos.');
  }
  const todos = () => [...cache.orcamentos, ...cache.arquivados];
  const prox = () => String(Math.max(0, ...todos().map(x => /^\d{1,15}$/.test(x.numero) ? parseInt(x.numero, 10) : 0)) + 1).padStart(3, '0');
  const rv = (n, manter) => {
    if (manter && k(n) === k(manter)) return manter.trim();
    const ativos = cache.responsaveis.filter(x => x.ativo), r = ativos.find(x => k(x.nome) === k(n));
    if (!r) throw erro(ativos.length ? 'responsavel_invalido: escolha um nome da lista de responsáveis' : 'responsavel_invalido: cadastre os responsáveis em Administração antes de registrar orçamentos');
    return r.nome;
  };
  // Grava no banco e já atualiza a cópia local, para a tela refletir a ação sem esperar o retorno em tempo real.
  const put = (nome, o) => { cache[nome] = [...cache[nome].filter(x => x.id !== o.id), clone(o)]; return db.doc(nome + '/' + o.id).set(o); };
  const rem = (nome, id) => { cache[nome] = cache[nome].filter(x => x.id !== id); return db.doc(nome + '/' + id).delete(); };
  const log = (o, acao, por, motivo, antes) => put('auditoria', { id: 'a' + Date.now().toString(36) + rid(), orcamento_id: o.id, numero: o.numero, acao, por: por || null, motivo: motivo || null, em: agora(), antes: antes || null, depois: null });
  const achar = (lista, id) => { const o = lista.find(x => x.id === id); if (!o) throw erro('nao_encontrado: registro não encontrado'); return clone(o); };
  const campos = (o, p) => Object.assign(o, { responsavel: p.p_responsavel.trim(), data_entrega: p.p_data_entrega, valor: p.p_valor, tipo_execucao: p.p_execucao, regime: p.p_regime, observacoes: (p.p_obs || '').trim() || null });
  const nomeOk = p => { const n = (p || '').trim().replace(/\s+/g, ' '); if (n.length < 2) throw erro('nome_invalido: informe o nome completo'); return n; };

  const fns = {
    admin_criar_orcamento: async p => { need(); p.p_responsavel = rv(p.p_responsavel); p.p_por = rv(p.p_por);
      return comLock(async () => {
        const n = (p.p_numero || '').trim() || prox();
        if (!/^[A-Za-z0-9_-]{1,20}$/.test(n)) throw erro('numero_invalido: use só letras, números e hífen');
        if (todos().some(x => k(x.numero) === k(n))) throw erro(`numero_duplicado: já existe um orçamento com o número ${n}`);
        const id = 'o-' + n.toLowerCase();
        const o = { id, numero: n, obra: p.p_obra.trim(), observacoes: null, raiz_id: id, revisao_de_id: null, num_revisao: 0, revisao_motivo: null, criado_em: agora(), criado_por: p.p_por.trim(), atualizado_em: null, arquivado_em: null };
        campos(o, p); await put('orcamentos', o); await log(o, 'cadastro', o.criado_por); return o;
      }); },
    admin_criar_revisao: async p => { need(); p.p_responsavel = rv(p.p_responsavel); p.p_por = rv(p.p_por);
      return comLock(async () => {
        const b = achar(cache.orcamentos, p.p_base_id), n = prox(), id = 'o-' + n;
        const rev = Math.max(...todos().filter(x => x.raiz_id === b.raiz_id).map(x => x.num_revisao)) + 1;
        const o = { id, numero: n, obra: b.obra, observacoes: null, raiz_id: b.raiz_id, revisao_de_id: b.id, num_revisao: rev, revisao_motivo: (p.p_motivo || '').trim() || null, criado_em: agora(), criado_por: p.p_por.trim(), atualizado_em: null, arquivado_em: null };
        campos(o, p); await put('orcamentos', o); await log(o, 'revisao', o.criado_por, o.revisao_motivo); return o;
      }); },
    admin_editar: async p => { need(); const antes = achar(cache.orcamentos, p.p_id), o = clone(antes);
      p.p_responsavel = rv(p.p_responsavel, o.responsavel); p.p_por = rv(p.p_por);
      o.obra = p.p_obra.trim(); campos(o, p); o.atualizado_em = agora();
      await put('orcamentos', o); await log(o, 'edicao', p.p_por, p.p_motivo, antes); return o; },
    admin_arquivar: async p => { need(); if ((p.p_motivo || '').trim().length < 3) throw erro('motivo_obrigatorio: informe o motivo'); p.p_por = rv(p.p_por);
      const o = achar(cache.orcamentos, p.p_id), arq = { ...o, arquivado_em: agora(), arquivado_por: p.p_por, arquivado_motivo: p.p_motivo.trim() };
      await put('arquivados', arq); await rem('orcamentos', o.id); await log(o, 'arquivamento', p.p_por, p.p_motivo, o); return null; },
    admin_restaurar: async p => { need(); p.p_por = rv(p.p_por);
      const o = achar(cache.arquivados, p.p_id); o.arquivado_em = null; delete o.arquivado_por; delete o.arquivado_motivo;
      await put('orcamentos', o); await rem('arquivados', o.id); await log(o, 'restauracao', p.p_por); return null; },
    admin_listar_arquivados: async () => { need(); return clone(cache.arquivados).sort((a, b) => (b.arquivado_em || '').localeCompare(a.arquivado_em || '')); },
    admin_excluir_definitivo: async p => { need(); p.p_por = rv(p.p_por); const o = achar(cache.arquivados, p.p_id);
      if ((p.p_confirmacao || '').trim() !== o.numero) throw erro('confirmacao_invalida: digite o número do orçamento para confirmar');
      if (todos().some(x => x.id !== o.id && (x.revisao_de_id === o.id || x.raiz_id === o.id))) throw erro('possui_revisoes: existem revisões vinculadas; arquive-as e exclua-as antes');
      await log(o, 'exclusao_definitiva', p.p_por, null, o); await rem('arquivados', o.id); return null; },
    admin_adicionar_responsavel: async p => { need(); const n = nomeOk(p.p_nome), ex = cache.responsaveis.find(x => k(x.nome) === k(n));
      if (ex) { if (ex.ativo) throw erro('nome_duplicado: este nome já está na lista'); const r = { ...clone(ex), ativo: true }; await put('responsaveis', r); return r; }
      const r = { id: 'r-' + rid(), nome: n, ativo: true, criado_em: agora() }; await put('responsaveis', r); return r; },
    admin_alterar_responsavel: async p => { need(); const n = nomeOk(p.p_nome), r = achar(cache.responsaveis, p.p_id);
      if (cache.responsaveis.some(x => x.id !== r.id && k(x.nome) === k(n))) throw erro('nome_duplicado: já existe um responsável com este nome');
      r.nome = n; if (p.p_ativo != null) r.ativo = p.p_ativo; await put('responsaveis', r); return r; }
  };
  return {
    iniciar,
    listar: async () => { await pronto(); return clone(cache.orcamentos).sort((x, y) => y.criado_em.localeCompare(x.criado_em)); },
    responsaveis: async () => { await pronto(); return clone(cache.responsaveis).sort((x, y) => x.nome.localeCompare(y.nome)); },
    auditoria: async ids => { await pronto(); return clone(cache.auditoria).filter(x => !ids || ids.includes(x.orcamento_id)).slice(0, 200); },
    rpc: async (n, a) => { await iniciar(); if (!fns[n]) throw erro('nao_suportado: ação indisponível');
      if (!PAGE) return clone(await fns[n](a));
      const ant = PageStore.snapshot();
      try { const r = clone(await fns[n](a)); if (n !== 'admin_listar_arquivados') await PageStore.commit(); return r; }
      catch (e) { PageStore.restore(ant); throw e; } }
  };
})();
const MODE = window.APP_MODE || (DEMO ? 'demo' : 'supabase');
const PAGE = MODE === 'page';
const CLOUD = MODE === 'claude' || PAGE;
const GATE = MODE === 'supabase';           // só o banco online exige a senha de consulta
const api = CLOUD ? Cloud : (DEMO ? Demo : Remote);

/* ------------------------------------------------------------------ estado */
const S = {
  items: [], resp: [], maxRev: new Map(), loaded: false, loadError: '',
  token: ses.get('token'), cs: ses.get('cs'), gateMsg: '', view: 'painel',
  f: { q: '', de: '', ate: '', exec: '', reg: '', versao: '' },
  h: { q: '', soRev: true }, open: new Set(), sig: ''
};
const vigente = o => o.num_revisao === S.maxRev.get(o.raiz_id);
const raizDe = o => S.items.find(x => x.id === o.raiz_id);
const byId = id => S.items.find(x => x.id === id);

function aplicar(items) {
  S.items = items;
  S.maxRev = new Map();
  for (const o of items) S.maxRev.set(o.raiz_id, Math.max(S.maxRev.get(o.raiz_id) ?? 0, o.num_revisao));
}
async function carregar(silencioso) {
  if (GATE && !S.cs) return;     // sem senha de consulta não se consulta o banco (evita contar tentativas erradas)
  try {
    const [items, resp] = await Promise.all([api.listar(), api.responsaveis()]);
    const sig = JSON.stringify([items, resp]);
    S.loadError = '';
    if (sig !== S.sig || !S.loaded) { S.sig = sig; S.resp = resp; aplicar(items); S.loaded = true; renderDados(); }
  } catch (e) {
    if (e.code === 'consulta_invalida') { S.cs = null; ses.set('cs', null); S.loaded = false; S.gateMsg = 'A senha de consulta mudou ou expirou. Informe a senha novamente.'; render(); return; }
    if (!silencioso || !S.loaded) { S.loadError = e.message; S.loaded = true; renderDados(); }
  }
}

/* ------------------------------------------------------------------ mensagens */
let toastT;
function toast(msg) {
  const t = $('#toast'); t.textContent = msg; t.hidden = false;
  clearTimeout(toastT); toastT = setTimeout(() => { t.hidden = true; }, 4200);
}
async function guard(fn) {
  try { return await fn(); }
  catch (e) {
    if (e.code === 'nao_autorizado') { setToken(null); toast(CLOUD ? e.message : 'Sessão expirada. Entre novamente com a senha.'); render(); }
    else toast(e.message);
    return undefined;
  }
}
function setToken(t) {
  S.token = t; ses.set('token', t);
  const on = !!t;
  $('#lock').className = 'lock' + (on ? ' on' : '');
  $('#lock span').textContent = CLOUD ? (on ? 'Editor' : 'Somente consulta') : (on ? 'Administrador' : 'Consulta');
}
const rpc = (n, a) => api.rpc(n, a);
const ativos = () => S.resp.filter(r => r.ativo);
const porPadrao = () => { const n = norm(loc.get('nomeAdmin') || ''); const r = ativos().find(x => norm(x.nome) === n); return r ? r.nome : ''; };
function respSelect(id, atual, legado) {
  const nomes = ativos().map(r => r.nome);
  const fora = legado && atual && !nomes.some(n => norm(n) === norm(atual));
  const lista = fora ? [atual, ...nomes] : nomes;
  const sel = atual ? lista.find(n => norm(n) === norm(atual)) : '';
  return `<select id="${id}" required><option value="">Selecione…</option>${lista.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}${fora && n === atual ? ' (fora da lista)' : ''}</option>`).join('')}</select>`;
}

/* ------------------------------------------------------------------ navegação */
function renderGate() {
  $('#nav-desktop').style.display = 'none'; $('#nav-mobile').style.display = 'none';
  $('#view').innerHTML = `<form class="card login" id="gate" novalidate><h1 style="font-size:1.25rem">Consulta de orçamentos</h1>
    <p class="muted">Informe a senha de consulta para ver os orçamentos.</p>
    <label class="field"><span>Senha de consulta</span><input id="csenha" type="password" autocomplete="current-password" required></label>
    <div id="gate-msg">${S.gateMsg ? `<div class="msg err">${esc(S.gateMsg)}</div>` : ''}</div><button class="btn primary" type="submit">Entrar</button></form>`;
  S.gateMsg = '';
}
function renderNav() {
  $('#nav-desktop').style.display = ''; $('#nav-mobile').style.display = '';
  const mk = (cls, short) => NAV.map(n => `<a class="tab" href="#${n.id}" ${S.view === n.id ? 'aria-current="page"' : ''}>${ICON[n.id]}<span>${short ? n.short : n.label}</span></a>`).join('');
  $('#nav-desktop').innerHTML = mk('', false);
  $('#nav-mobile').innerHTML = mk('', true);
}
function route() {
  const id = location.hash.slice(1);
  S.view = NAV.some(n => n.id === id) ? id : 'painel';
  render();
  window.scrollTo(0, 0);
}
function render() {
  if (GATE && !S.cs) { renderGate(); return; }
  renderNav();
  const nav = NAV.find(n => n.id === S.view);
  document.title = `${nav.label} · Controle de Orçamentos`;
  const v = $('#view');
  if (nav.admin && !S.token) { v.innerHTML = CLOUD ? semAcessoHTML(nav) : loginHTML(nav); return; }
  ({ painel: viewPainel, consultar: viewConsultar, cadastrar: viewCadastrar, historico: viewHistorico, administracao: viewAdmin })[S.view](v);
}
function renderDados() {           // chamado quando a lista muda no banco
  if (GATE && !S.cs) return;
  if (S.view === 'painel') viewPainel($('#view'));
  else if (S.view === 'consultar') renderRes();
  else if (S.view === 'historico') renderHist();
  else if (S.view === 'administracao') renderResp();
  else if (S.view === 'cadastrar') { const s = $('#sugestao'); if (s) s.textContent = proximoNumero(); }
}
function estadoLista() {
  if (!S.loaded) return '<div class="list"><div class="skeleton"></div><div class="skeleton"></div><div class="skeleton"></div></div>';
  if (S.loadError) return `<div class="msg err">Não foi possível carregar os dados: ${esc(S.loadError)}</div>`;
  return '';
}
const head = (t, p, extra = '') => `<div class="page-head"><div><h1>${t}</h1><p>${p}</p></div>${extra}</div>`;

/* ------------------------------------------------------------------ painel */
function rowHTML(o) {
  return `<button class="row" data-act="detalhe" data-id="${o.id}">
    <span class="num">${esc(o.numero)}</span>
    <span class="main"><b>${esc(o.obra)}</b><small>${esc(o.responsavel)} · entrega ${fmtD(o.data_entrega)}</small></span>
    <span class="tags"><span class="chip">${esc(o.tipo_execucao)}</span><span class="chip">${esc(o.regime)}</span><span class="chip ver">${ord(o.num_revisao)}</span></span>
    <span class="val">${fmtV(o.valor)}</span>
    <span class="st">${verPill(o)}</span></button>`;
}
function viewPainel(v) {
  const it = S.items;
  const revs = it.filter(o => o.num_revisao > 0).length;
  const k = (label, val, sub) => `<div class="kpi"><small>${label}</small><strong>${val}</strong>${sub ? `<em>${sub}</em>` : ''}</div>`;
  v.innerHTML = head('Painel inicial', 'Visão geral dos orçamentos cadastrados.') + estadoLista() + (S.loaded && !S.loadError ? `
    <section class="kpis" aria-label="Indicadores">
      ${k('Orçamentos cadastrados', it.length, 'originais e revisões')}${k('Orçamentos originais', it.length - revs)}${k('Revisões', revs, 'contam como orçamento')}${k('Versões vigentes', S.maxRev.size, 'a mais recente de cada série')}
    </section>
    <section><div class="page-head"><h2>Últimos registros</h2><a class="btn" href="#consultar">Ver todos</a></div>
      <div class="list" style="margin-top:10px">${it.length ? it.slice(0, 8).map(rowHTML).join('') : emptyHTML()}</div></section>` : '');
}
const emptyHTML = () => `<div class="empty"><b>Nenhum orçamento cadastrado ainda</b>${S.token ? 'Use o menu Cadastrar orçamento para registrar o primeiro.' : 'Os administradores podem cadastrar orçamentos pelo menu Cadastrar.'}</div>`;

/* ------------------------------------------------------------------ consulta */
function viewConsultar(v) {
  const f = S.f;
  const opt = (arr, cur) => `<option value="">Todos</option>` + arr.map(x => `<option ${x === cur ? 'selected' : ''}>${x}</option>`).join('');
  v.innerHTML = head('Consultar orçamentos', 'Pesquise por nome do orçamento, número ou responsável e filtre por período, execução, regime e versão.') + `
  <form class="card filters" id="filtros" onsubmit="return false" role="search">
    <label class="field wide"><span>Pesquisar</span><div class="search">${ICON.consultar}<input id="q" type="search" placeholder="Nome, número ou responsável" value="${esc(f.q)}" autocomplete="off"></div></label>
    <label class="field"><span>Entrega a partir de</span><input id="de" type="date" value="${f.de}"></label>
    <label class="field"><span>Entrega até</span><input id="ate" type="date" value="${f.ate}"></label>
    <label class="field"><span>Execução</span><select id="fexec">${opt(['Direta', 'Indireta'], f.exec)}</select></label>
    <label class="field"><span>Regime</span><select id="freg">${opt(['Desonerado', 'Não Desonerado'], f.reg)}</select></label>
    <label class="field"><span>Versão</span><select id="fver"><option value="">Todas</option><option value="vigentes" ${f.versao === 'vigentes' ? 'selected' : ''}>Só vigentes</option><option value="originais" ${f.versao === 'originais' ? 'selected' : ''}>Só originais</option><option value="revisoes" ${f.versao === 'revisoes' ? 'selected' : ''}>Só revisões</option></select></label>
    <div class="field"><span>&nbsp;</span><button class="btn" type="button" data-act="limpar">Limpar filtros</button></div>
  </form><div id="res"></div>`;
  renderRes();
}
function renderRes() {
  const box = $('#res'); if (!box) return;
  const e = estadoLista(); if (e) { box.innerHTML = e; return; }
  const f = S.f, q = norm(f.q).trim();
  const r = S.items.filter(o =>
    (!q || norm(`${o.numero} ${o.obra} ${o.responsavel}`).includes(q)) &&
    (!f.de || o.data_entrega >= f.de) && (!f.ate || o.data_entrega <= f.ate) &&
    (!f.exec || o.tipo_execucao === f.exec) && (!f.reg || o.regime === f.reg) && (!f.versao || (f.versao === 'vigentes' ? vigente(o) : f.versao === 'originais' ? o.num_revisao === 0 : o.num_revisao > 0)));
  box.innerHTML = `<p class="count" style="margin-bottom:8px">${r.length} de ${S.items.length} orçamento(s)</p>` +
    (r.length ? `<div class="list">${r.map(rowHTML).join('')}</div>` : (S.items.length ? '<div class="empty"><b>Nada encontrado</b>Ajuste a pesquisa ou limpe os filtros.</div>' : emptyHTML()));
}

/* ------------------------------------------------------------------ histórico de revisões */
function viewHistorico(v) {
  v.innerHTML = head('Histórico de revisões', 'Cada orçamento com a sequência de suas versões. Nenhuma revisão apaga a anterior.') + `
  <form class="card filters" onsubmit="return false" role="search">
    <label class="field wide"><span>Pesquisar</span><div class="search">${ICON.consultar}<input id="hq" type="search" placeholder="Nome, número ou responsável" value="${esc(S.h.q)}" autocomplete="off"></div></label>
    <label class="check wide"><input id="hrev" type="checkbox" ${S.h.soRev ? 'checked' : ''}><span>Mostrar só orçamentos com revisões</span></label>
  </form><div id="hres"></div>`;
  renderHist();
}
function renderHist() {
  const box = $('#hres'); if (!box) return;
  const e = estadoLista(); if (e) { box.innerHTML = e; return; }
  const q = norm(S.h.q).trim(), grupos = new Map();
  for (const o of S.items) (grupos.get(o.raiz_id) || grupos.set(o.raiz_id, []).get(o.raiz_id)).push(o);
  const lista = [...grupos.values()].map(g => g.sort((a, b) => a.num_revisao - b.num_revisao))
    .filter(g => (!S.h.soRev || g.length > 1) && (!q || g.some(o => norm(`${o.numero} ${o.obra} ${o.responsavel}`).includes(q))))
    .sort((a, b) => b[b.length - 1].criado_em.localeCompare(a[a.length - 1].criado_em));
  box.innerHTML = lista.length ? `<div class="chain-list">${lista.map(chainHTML).join('')}</div>` :
    `<div class="empty"><b>${S.items.length ? 'Nenhum orçamento encontrado' : 'Nenhum orçamento cadastrado ainda'}</b>${S.h.soRev && S.items.length ? 'Desmarque “só orçamentos com revisões” para ver todos.' : ''}</div>`;
}
function timelineHTML(g, destaque) {
  const raiz = g[0];
  return `<ol class="timeline">${g.map((o, i) => {
    const ant = g[i - 1], d = ant ? o.valor - ant.valor : 0, pct = ant && ant.valor ? d / ant.valor * 100 : 0;
    const delta = ant && d !== 0 ? `<span class="delta ${d > 0 ? 'up' : 'down'}">${d > 0 ? '+' : '−'}${fmtV(Math.abs(d))} (${pct > 0 ? '+' : '−'}${Math.abs(pct).toFixed(1).replace('.', ',')}%)</span>` : '';
    const titulo = o.num_revisao === 0 ? `Orçamento ${esc(o.numero)} – Original` : `Orçamento ${esc(o.numero)} – ${ord(o.num_revisao)} do orçamento ${esc(raiz.numero)}`;
    return `<li class="tl ${i === g.length - 1 ? 'last' : ''}"><div class="rail"><i></i></div><div class="body">
      ${o.id === destaque ? `<b>${titulo}</b> <span class="chip">este registro</span>` : `<button data-act="detalhe" data-id="${o.id}">${titulo}</button>`}
      <div class="meta"><span>${fmtV(o.valor)}</span>${delta}<span>${verPill(o)}</span></div>
      <div class="meta"><span>${o.num_revisao ? 'Revisão' : 'Cadastro'} em ${fmtDT(o.criado_em)}</span><span>por ${esc(o.criado_por)}</span><span>Entrega ${fmtD(o.data_entrega)}</span></div>
      ${o.revisao_motivo ? `<div class="meta"><span>Motivo: ${esc(o.revisao_motivo)}</span></div>` : ''}</div></li>`;
  }).join('')}</ol>`;
}
function chainHTML(g) {
  const ult = g[g.length - 1], raiz = g[0], aberto = S.open.has(raiz.id);
  return `<details class="card chain" data-raiz="${raiz.id}" ${aberto ? 'open' : ''}><summary>
    <div><b>${esc(raiz.obra)}</b><div class="muted" style="font-size:.85rem">${g.length === 1 ? 'Somente a versão original' : `${g.length} versões · vigente: orçamento ${esc(ult.numero)} (${fmtV(ult.valor)})`}</div></div>
    <span class="chip">${g.length === 1 ? 'Só original' : (g.length - 1) + (g.length === 2 ? ' revisão' : ' revisões')}</span></summary>${timelineHTML(g)}</details>`;
}

/* ------------------------------------------------------------------ formulário de orçamento */
function proximoNumero() {
  const m = Math.max(0, ...S.items.map(o => /^\d{1,15}$/.test(o.numero) ? parseInt(o.numero, 10) : 0));
  return String(m + 1).padStart(3, '0');
}
const seg = (name, vals, cur) => `<div class="seg" role="radiogroup">${vals.map((x, i) => `<label><input type="radio" name="${name}" value="${x}" ${x === cur ? 'checked' : ''} required><span>${x}</span></label>`).join('')}</div>`;
function formHTML(mode, o = {}) {
  const lblPor = { novo: 'Responsável pelo cadastro', revisao: 'Responsável pela revisão', editar: 'Quem está editando' }[mode];
  return `<form data-mode="${mode}" data-id="${esc(o.id || '')}" novalidate class="form-grid">
    ${ativos().length ? '' : '<div class="msg err full">Nenhum responsável cadastrado. <a href="#administracao" data-act="fechar">Cadastre os responsáveis</a> antes de registrar orçamentos.</div>'}
    ${mode === 'novo' ? `<label class="field"><span>Número do orçamento</span><input id="f-numero" inputmode="numeric" maxlength="20" placeholder="Automático"><small>Deixe em branco para usar <b class="mono" id="sugestao">${proximoNumero()}</b>.</small></label>` :
      mode === 'revisao' ? `<label class="field"><span>Número da revisão</span><input value="Gerado automaticamente (próximo da sequência)" readonly></label>` :
      `<label class="field"><span>Número do orçamento</span><input value="${esc(o.numero)}" readonly></label>`}
    <label class="field"><span>Nome do orçamento</span><input id="f-obra" required maxlength="200" value="${esc(o.obra || '')}" ${mode === 'revisao' ? 'readonly' : ''}></label>
    <label class="field"><span>Responsável pelo orçamento</span>${respSelect('f-resp', o.responsavel, mode === 'editar')}</label>
    <label class="field"><span>Data de entrega</span><input id="f-data" type="date" required value="${o.data_entrega || hoje()}"></label>
    <label class="field"><span>Valor total (R$)</span><input id="f-valor" inputmode="decimal" required placeholder="0,00" value="${o.valor != null ? money2(o.valor) : ''}"></label>
    <div class="field"><span>Tipo de execução</span>${seg('exec', ['Direta', 'Indireta'], o.tipo_execucao || 'Direta')}</div>
    <div class="field"><span>Regime</span>${seg('reg', ['Desonerado', 'Não Desonerado'], o.regime || 'Desonerado')}</div>
    <label class="field full"><span>Observações</span><textarea id="f-obs" maxlength="2000">${esc(o.observacoes || '')}</textarea></label>
    ${mode !== 'novo' ? `<label class="field full"><span>${mode === 'revisao' ? 'Motivo da revisão' : 'Motivo da correção'}</span><input id="f-motivo" ${mode === 'revisao' ? 'required' : ''} maxlength="300" placeholder="${mode === 'revisao' ? 'Ex.: atualização de preços, mudança de escopo' : 'Ex.: erro de digitação no valor'}"></label>` : ''}
    <label class="field"><span>${lblPor}</span>${respSelect('f-por', porPadrao())}</label>
    <div class="field"><span>&nbsp;</span><div class="actions"><button class="btn primary" type="submit">${mode === 'novo' ? 'Cadastrar orçamento' : mode === 'revisao' ? 'Registrar revisão' : 'Salvar correção'}</button>${mode === 'novo' ? '<button class="btn" type="reset">Limpar</button>' : ''}</div></div>
    <div class="full frm-msg"></div>
  </form>`;
}
function lerForm(f) {
  const v = id => ($('#' + id, f)?.value ?? '').trim();
  const r = n => (f.querySelector(`input[name="${n}"]:checked`) || {}).value;
  const valor = parseBRL(v('f-valor'));
  const msg = [];
  if (!v('f-obra')) msg.push('Informe o nome do orçamento.');
  if (!v('f-resp')) msg.push('Escolha o responsável pelo orçamento.');
  if (!v('f-data')) msg.push('Informe a data de entrega.');
  if (Number.isNaN(valor)) msg.push('Informe um valor válido, por exemplo 125.400,50.');
  if (!v('f-por')) msg.push('Escolha quem está fazendo o registro.');
  if (f.dataset.mode === 'revisao' && !v('f-motivo')) msg.push('Informe o motivo da revisão.');
  if (msg.length) return { erro: msg.join(' ') };
  return { numero: v('f-numero'), obra: v('f-obra'), resp: v('f-resp'), data: v('f-data'), valor, exec: r('exec'), reg: r('reg'), obs: v('f-obs'), por: v('f-por'), motivo: v('f-motivo') };
}
async function enviarForm(f) {
  const d = lerForm(f), msg = $('.frm-msg', f), mode = f.dataset.mode, id = f.dataset.id;
  if (d.erro) { msg.innerHTML = `<div class="msg err">${esc(d.erro)}</div>`; return; }
  msg.innerHTML = '';
  const btn = $('button[type=submit]', f); btn.disabled = true;
  loc.set('nomeAdmin', d.por);
  const base = { p_token: S.token, p_responsavel: d.resp, p_data_entrega: d.data, p_valor: d.valor, p_execucao: d.exec, p_regime: d.reg, p_obs: d.obs, p_por: d.por };
  try {
    let o;
    if (mode === 'novo') o = await rpc('admin_criar_orcamento', { ...base, p_numero: d.numero, p_obra: d.obra });
    else if (mode === 'revisao') o = await rpc('admin_criar_revisao', { ...base, p_base_id: id, p_motivo: d.motivo });
    else o = await rpc('admin_editar', { ...base, p_id: id, p_obra: d.obra, p_motivo: d.motivo });
    await carregar();
    toast(mode === 'novo' ? `Orçamento ${o.numero} cadastrado.` : mode === 'revisao' ? `Revisão registrada como orçamento ${o.numero}.` : `Orçamento ${o.numero} atualizado.`);
    if (mode === 'novo') { f.reset(); $('#sugestao') && ($('#sugestao').textContent = proximoNumero()); }
    openDetail(o.id);
  } catch (e) {
    if (e.code === 'nao_autorizado') { setToken(null); $('#dlg').open && $('#dlg').close(); render(); toast('Sessão expirada. Entre novamente com a senha.'); }
    else msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  } finally { btn.disabled = false; }
}
function viewCadastrar(v) {
  v.innerHTML = head('Cadastrar orçamento', 'Registre um novo orçamento. Para alterar valores de um orçamento já entregue, registre uma revisão pela tela de detalhes.') + `<section class="card">${formHTML('novo')}</section>`;
}

/* ------------------------------------------------------------------ detalhe */
const dlg = () => $('#dlg');
function dlgShell(titulo, sub, corpo) {
  dlg().innerHTML = `<div class="dlg"><div class="dlg-head"><div>${sub}<h2 id="dlg-title">${titulo}</h2></div><button class="x" data-act="fechar" aria-label="Fechar">×</button></div><div class="dlg-body">${corpo}</div></div>`;
  if (!dlg().open) dlg().showModal();
}
function openDetail(id) {
  const o = byId(id); if (!o) { toast('Orçamento não encontrado. Atualize a página.'); return; }
  const g = S.items.filter(x => x.raiz_id === o.raiz_id).sort((a, b) => a.num_revisao - b.num_revisao);
  const sub = `<div class="muted mono" style="font-size:.82rem;margin-bottom:4px">Orçamento ${esc(o.numero)} · ${o.num_revisao ? ord(o.num_revisao) + ' do orçamento ' + esc(raizDe(o)?.numero || '') : 'Original'}</div>`;
  const dd = (t, x, full) => `<div ${full ? 'class="full"' : ''}><dt>${t}</dt><dd>${x}</dd></div>`;
  dlgShell(esc(o.obra), sub, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="chip ver">${ord(o.num_revisao)}</span>${verPill(o)}</div>
    <dl class="dl">
      ${dd('Valor total', `<b class="mono">${fmtV(o.valor)}</b>`)}${dd('Data de entrega', fmtD(o.data_entrega))}
      ${dd('Responsável pelo orçamento', esc(o.responsavel))}${dd(o.num_revisao ? 'Responsável pela revisão' : 'Responsável pelo cadastro', esc(o.criado_por))}
      ${dd('Tipo de execução', esc(o.tipo_execucao))}${dd('Regime', esc(o.regime))}
      ${dd(o.num_revisao ? 'Data da revisão' : 'Cadastrado em', fmtDT(o.criado_em))}${dd('Última correção', o.atualizado_em ? fmtDT(o.atualizado_em) : '—')}
      ${o.revisao_motivo ? dd('Motivo da revisão', esc(o.revisao_motivo), true) : ''}
      ${dd('Observações', o.observacoes ? esc(o.observacoes).replace(/\n/g, '<br>') : '—', true)}
    </dl>
    ${S.token ? `<div class="actions"><button class="btn primary" data-act="revisar" data-id="${o.id}">Registrar revisão</button><button class="btn" data-act="editar" data-id="${o.id}">Corrigir dados</button><button class="btn ghost-danger" data-act="arquivar" data-id="${o.id}">Arquivar</button></div>` : ''}
    ${g.length > 1 ? `<section><h3 style="margin-bottom:10px">Histórico de revisões</h3>${timelineHTML(g, o.id)}</section>` : ''}
    <section><h3 style="margin-bottom:10px">Registro de alterações</h3><div id="audit-slot" class="muted">Carregando…</div></section>`);
  api.auditoria(g.map(x => x.id)).then(a => {
    const slot = $('#audit-slot'); if (!slot) return;
    const rot = { cadastro: 'Cadastro', revisao: 'Revisão registrada', edicao: 'Correção de dados', arquivamento: 'Arquivado', restauracao: 'Restaurado', exclusao_definitiva: 'Excluído' };
    slot.innerHTML = a.length ? `<ul class="logs">${a.map(l => `<li><span><b>${rot[l.acao] || esc(l.acao)}</b> · orçamento ${esc(l.numero)} · ${esc(l.por || '—')}</span><time>${fmtDT(l.em)}</time>${l.motivo ? `<span>${esc(l.motivo)}</span>` : ''}</li>`).join('')}</ul>` : 'Sem registros.';
  }).catch(() => { const s = $('#audit-slot'); if (s) s.textContent = 'Não foi possível carregar o registro.'; });
}
function openForm(mode, id) {
  const o = byId(id); if (!o) return;
  const t = mode === 'revisao' ? 'Registrar revisão' : 'Corrigir dados';
  const aviso = mode === 'revisao'
    ? `A revisão cria um novo orçamento vinculado ao ${esc(o.numero)}. O registro anterior permanece intacto.`
    : 'Use apenas para corrigir erros. Para mudanças de valor ou escopo, registre uma revisão. A correção fica no registro de alterações.';
  dlgShell(t, `<div class="muted mono" style="font-size:.82rem;margin-bottom:4px">Orçamento ${esc(o.numero)}</div>`, `<div class="msg info">${aviso}</div>${formHTML(mode, o)}<div><button class="btn" data-act="detalhe" data-id="${o.id}">Voltar aos detalhes</button></div>`);
}
function openArquivar(id) {
  const o = byId(id); if (!o) return;
  dlgShell('Arquivar orçamento', `<div class="muted mono" style="font-size:.82rem;margin-bottom:4px">Orçamento ${esc(o.numero)}</div>`, `
    <div class="msg info">O orçamento deixa de aparecer na consulta pública, mas continua guardado e pode ser restaurado pela Administração.</div>
    <form id="arq" data-id="${o.id}" class="form-grid" novalidate>
      <label class="field full"><span>Motivo</span><input id="a-motivo" required maxlength="300"></label>
      <label class="field"><span>Quem está arquivando</span>${respSelect('a-por', porPadrao())}</label>
      <div class="field"><span>&nbsp;</span><div class="actions"><button class="btn danger" type="submit">Arquivar</button><button class="btn" type="button" data-act="detalhe" data-id="${o.id}">Cancelar</button></div></div>
      <div class="full" id="arq-msg"></div></form>`);
}

/* ------------------------------------------------------------------ administração */
function semAcessoHTML(nav) {
  return head(nav.label, 'Área para quem edita os orçamentos.') + `<div class="card login"><b>Acesso de edição necessário</b><p class="muted">Você está no modo de consulta. Para cadastrar ou revisar orçamentos, peça ao dono desta página que dê a você acesso de <b>Editor</b> no menu Compartilhar e entre na sua conta do Claude.</p></div>`;
}
function loginHTML(nav) {
  return head(nav.label, 'Área restrita aos administradores.') + `<form class="card login" id="login" novalidate>
    <label class="field"><span>Senha administrativa</span><input id="senha" type="password" autocomplete="current-password" required></label>
    <div id="login-msg"></div><button class="btn primary" type="submit">Entrar</button>
    <p class="muted" style="font-size:.82rem">A senha é conferida no servidor.</p></form>`;
}
function renderResp() {
  const box = $('#resp-card'); if (!box) return;
  box.innerHTML = `<h2>Responsáveis</h2>
    <p class="muted" style="font-size:.88rem;margin-top:6px">Lista padrão usada nos campos de responsável. Renomear ou desativar um nome não altera os registros antigos.</p>
    <form id="addresp" class="actions" novalidate style="margin-top:12px"><label class="sr" for="novo-resp">Nome do responsável</label><input id="novo-resp" placeholder="Nome completo" maxlength="120" autocomplete="off" style="flex:1;min-width:200px;width:auto"><button class="btn primary" type="submit">Adicionar</button></form>
    <div id="resp-msg" style="margin-top:10px"></div>
    <div class="list" style="margin-top:12px">${S.resp.length ? S.resp.map(r => `<form class="resp-row" data-id="${r.id}" data-ativo="${r.ativo}" novalidate style="display:flex;gap:8px;flex-wrap:wrap;align-items:center">
      <input class="r-nome" value="${esc(r.nome)}" maxlength="120" aria-label="Nome" style="flex:1;min-width:180px;width:auto"><span class="chip">${r.ativo ? 'Ativo' : 'Inativo'}</span>
      <button class="btn" type="submit">Salvar nome</button><button class="btn ${r.ativo ? 'ghost-danger' : ''}" type="button" data-act="toggle-resp" data-id="${r.id}">${r.ativo ? 'Desativar' : 'Reativar'}</button></form>`).join('')
      : '<div class="empty"><b>Nenhum responsável cadastrado</b>Adicione os nomes de quem vai cadastrar e revisar orçamentos.</div>'}</div>`;
}
async function viewAdmin(v) {
  v.innerHTML = head('Administração', 'Senha, registros arquivados e histórico de alterações.', CLOUD ? '' : '<button class="btn" data-act="sair">Sair</button>') + `
  <section class="card" id="resp-card"></section>
  <section class="card"><h2>Alterar senha administrativa</h2>
    <form id="trocasenha" class="form-grid" novalidate>
      <label class="field"><span>Senha atual</span><input id="s-atual" type="password" autocomplete="current-password" required></label><span></span>
      <label class="field"><span>Nova senha (mínimo 8 caracteres)</span><input id="s-nova" type="password" autocomplete="new-password" minlength="8" required></label>
      <label class="field"><span>Repita a nova senha</span><input id="s-rep" type="password" autocomplete="new-password" required></label>
      <div class="full" id="s-msg"></div><div><button class="btn primary" type="submit">Alterar senha</button></div></form></section>
  <section class="card" id="consulta-card"><h2>Senha de consulta</h2>
    <p class="muted" style="font-size:.88rem;margin-top:6px">Quem tiver esta senha consegue consultar os orçamentos. Ao trocar, avise o grupo.</p>
    <form id="trocaconsulta" class="actions" novalidate style="margin-top:12px"><label class="sr" for="c-nova">Nova senha de consulta</label><input id="c-nova" type="password" autocomplete="new-password" minlength="6" placeholder="Nova senha (mínimo 6 caracteres)" style="flex:1;min-width:220px;width:auto"><button class="btn primary" type="submit">Definir senha de consulta</button></form>
    <div id="c-msg" style="margin-top:10px"></div></section>
  <section class="card"><h2>Backup</h2>
    <p class="muted" style="font-size:.88rem;margin-top:6px">Baixe uma cópia dos dados em CSV (abre no Excel). Faça isso de tempos em tempos, principalmente no plano gratuito do Supabase, que não tem backup automático.</p>
    <div class="actions" style="margin-top:12px"><button class="btn" data-act="exp-orc">Exportar orçamentos (CSV)</button><button class="btn" data-act="exp-aud">Exportar registro de alterações (CSV)</button></div></section>
  <section class="card"><h2>Registros arquivados</h2><div id="arquivados" class="muted">Carregando…</div></section>
  <section class="card"><h2>Registro geral de alterações</h2><div id="auditoria" class="muted">Carregando…</div></section>`;
  renderResp();
  if (CLOUD) { const t = $('#trocasenha'); if (t) t.closest('section').remove(); const c = $('#consulta-card'); if (c) c.remove(); }
  guard(async () => {
    const arq = await rpc('admin_listar_arquivados', { p_token: S.token });
    const box = $('#arquivados'); if (!box) return;
    box.className = '';
    box.innerHTML = arq.length ? `<label class="field" style="max-width:340px;margin-bottom:12px"><span>Quem está executando as ações abaixo</span>${respSelect('adm-por', porPadrao())}</label>` + `<div class="list">${arq.map(o => `<div class="card" style="box-shadow:none" data-box="${o.id}">
      <div style="display:flex;justify-content:space-between;gap:10px;flex-wrap:wrap;align-items:start"><div style="min-width:0"><b class="mono">${esc(o.numero)}</b> · <b>${esc(o.obra)}</b><div class="muted" style="font-size:.82rem">Arquivado em ${fmtDT(o.arquivado_em)} por ${esc(o.arquivado_por || '—')} — ${esc(o.arquivado_motivo || '')}</div></div>
      <div class="actions"><button class="btn" data-act="restaurar" data-id="${o.id}">Restaurar</button><button class="btn ghost-danger" data-act="excluir" data-id="${o.id}">Excluir definitivamente</button></div></div>
      <form class="form-grid exc" data-id="${o.id}" data-num="${esc(o.numero)}" hidden novalidate style="margin-top:12px">
        <div class="msg err full">Ação irreversível. O registro será apagado; um instantâneo permanece no registro de alterações.</div>
        <label class="field"><span>Digite o número (${esc(o.numero)}) para confirmar</span><input class="e-conf" required></label>
        <label class="field"><span>Senha administrativa</span><input class="e-senha" type="password" autocomplete="current-password" required></label>
        <div class="field"><span>&nbsp;</span><div class="actions"><button class="btn danger" type="submit">Excluir para sempre</button></div></div><div class="full e-msg"></div></form></div>`).join('')}</div>` : 'Nenhum registro arquivado.';
    if (CLOUD) $$('.e-senha').forEach(i => i.closest('label').remove());
  });
  api.auditoria().then(a => {
    const box = $('#auditoria'); if (!box) return; box.className = '';
    box.innerHTML = a.length ? `<ul class="logs">${a.slice(0, 40).map(l => `<li><span><b>${esc(({ cadastro: 'cadastro', revisao: 'revisão', edicao: 'correção', arquivamento: 'arquivamento', restauracao: 'restauração', exclusao_definitiva: 'exclusão definitiva', troca_senha: 'troca de senha', troca_senha_consulta: 'troca da senha de consulta' })[l.acao] || l.acao)}</b> · orçamento ${esc(l.numero)} · ${esc(l.por || '—')}</span><time>${fmtDT(l.em)}</time>${l.motivo ? `<span>${esc(l.motivo)}</span>` : ''}</li>`).join('')}</ul>` : 'Sem registros.';
  }).catch(() => {});
}

/* ------------------------------------------------------------------ exportação */
const csvCell = v => { let t = v == null ? '' : String(v); if (/^[=+\-@\t\r]/.test(t)) t = "'" + t; return /[";\n\r]/.test(t) ? '"' + t.replace(/"/g, '""') + '"' : t; };
function baixarCSV(nome, cab, linhas) {
  const txt = '\ufeff' + [cab, ...linhas].map(l => l.map(csvCell).join(';')).join('\r\n');
  const a = document.createElement('a'); a.href = URL.createObjectURL(new Blob([txt], { type: 'text/csv;charset=utf-8' })); a.download = `${nome}-${hoje()}.csv`;
  document.body.appendChild(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 4000);
}
async function exportar(que) {
  if (que === 'orc') {
    const arq = await rpc('admin_listar_arquivados', { p_token: S.token });
    const linha = (o, sit) => [o.numero, o.obra, o.responsavel, o.data_entrega, money2(o.valor), o.tipo_execucao, o.regime, o.observacoes, o.num_revisao === 0 ? 'Original' : ord(o.num_revisao), sit, o.revisao_motivo, o.criado_em, o.criado_por];
    baixarCSV('orcamentos', ['Número', 'Orçamento', 'Responsável', 'Data de entrega', 'Valor (R$)', 'Execução', 'Regime', 'Observações', 'Versão', 'Situação', 'Motivo da revisão', 'Cadastrado em', 'Cadastrado por'],
      [...S.items.map(o => linha(o, vigente(o) ? 'Vigente' : 'Versão anterior')), ...arq.map(o => linha(o, 'Arquivado'))]);
  } else {
    const a = await api.auditoria();
    baixarCSV('registro-de-alteracoes', ['Data e hora', 'Ação', 'Orçamento', 'Por', 'Motivo'], a.map(l => [l.em, l.acao, l.numero, l.por, l.motivo]));
  }
  toast('Arquivo gerado. Veja a pasta de downloads.');
}

/* ------------------------------------------------------------------ eventos */
document.addEventListener('click', e => {
  const b = e.target.closest('[data-act]');
  if (e.target === dlg()) { dlg().close(); return; }
  if (!b) return;
  const { act, id } = b.dataset;
  if (act === 'detalhe') openDetail(id);
  else if (act === 'fechar') dlg().close();
  else if (act === 'revisar') openForm('revisao', id);
  else if (act === 'editar') openForm('editar', id);
  else if (act === 'arquivar') openArquivar(id);
  else if (act === 'limpar') { S.f = { q: '', de: '', ate: '', exec: '', reg: '', versao: '' }; viewConsultar($('#view')); }
  else if (act === 'sair') { const t = S.token; setToken(null); rpc('admin_logout', { p_token: t }).catch(() => {}); render(); toast('Sessão encerrada.'); }
  else if (act === 'exp-orc' || act === 'exp-aud') guard(() => exportar(act === 'exp-orc' ? 'orc' : 'aud'));
  else if (act === 'toggle-resp') { const f = b.closest('form'); salvarResp(f, f.dataset.ativo !== 'true'); }
  else if (act === 'restaurar') { const por = ($('#adm-por') || {}).value; if (!por) { toast('Escolha quem está executando a ação.'); return; } guard(async () => { await rpc('admin_restaurar', { p_token: S.token, p_id: id, p_por: por }); await carregar(); toast('Orçamento restaurado.'); viewAdmin($('#view')); }); }
  else if (act === 'excluir') { const f = $(`.exc[data-id="${id}"]`); if (f) { f.hidden = !f.hidden; if (!f.hidden) $('.e-conf', f).focus(); } }
});
document.addEventListener('input', e => {
  const t = e.target, id = t.id;
  if (id === 'q') { S.f.q = t.value; renderRes(); }
  else if (id === 'de') { S.f.de = t.value; renderRes(); }
  else if (id === 'ate') { S.f.ate = t.value; renderRes(); }
  else if (id === 'fexec') { S.f.exec = t.value; renderRes(); }
  else if (id === 'freg') { S.f.reg = t.value; renderRes(); }
  else if (id === 'fver') { S.f.versao = t.value; renderRes(); }
  else if (id === 'hq') { S.h.q = t.value; renderHist(); }
  else if (id === 'hrev') { S.h.soRev = t.checked; renderHist(); }
});
document.addEventListener('focusout', e => { if (e.target.id === 'f-valor') { const n = parseBRL(e.target.value); if (!Number.isNaN(n) && e.target.value.trim()) e.target.value = money2(n); } });
document.addEventListener('toggle', e => {
  const d = e.target; if (!d.classList || !d.classList.contains('chain')) return;
  d.open ? S.open.add(d.dataset.raiz) : S.open.delete(d.dataset.raiz);
}, true);
document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  if (f.dataset.mode) enviarForm(f);
  else if (f.id === 'gate') {
    const msg = $('#gate-msg'), btn = $('button', f), senha = $('#csenha').value; btn.disabled = true; msg.innerHTML = '';
    try {
      const d = await Remote.entrar(senha);
      if (d === null) msg.innerHTML = '<div class="msg err">Senha de consulta incorreta.</div>';
      else { S.cs = senha; ses.set('cs', senha); S.sig = ''; S.resp = d.responsaveis; aplicar(d.orcamentos); S.loaded = true; S.loadError = ''; route(); }
    } catch (er) { msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    btn.disabled = false;
  } else if (f.id === 'trocaconsulta') {
    const msg = $('#c-msg'), n = $('#c-nova').value;
    guard(async () => {
      try { await rpc('admin_definir_senha_consulta', { p_token: S.token, p_nova: n }); if (GATE) { S.cs = n; ses.set('cs', n); } f.reset(); msg.innerHTML = '<div class="msg ok">Senha de consulta definida. Informe a nova senha ao grupo.</div>'; }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    });
  } else if (f.id === 'login') {
    const msg = $('#login-msg'), btn = $('button', f); btn.disabled = true; msg.innerHTML = '';
    try {
      const t = await rpc('admin_login', { p_senha: $('#senha').value });
      if (!t) msg.innerHTML = '<div class="msg err">Senha incorreta.</div>';
      else { setToken(t); render(); toast('Acesso administrativo liberado.'); }
    } catch (er) { msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    btn.disabled = false;
  } else if (f.id === 'trocasenha') {
    const msg = $('#s-msg'), n = $('#s-nova').value;
    if (n !== $('#s-rep').value) { msg.innerHTML = '<div class="msg err">As senhas novas não são iguais.</div>'; return; }
    guard(async () => {
      try {
        const t = await rpc('admin_alterar_senha', { p_token: S.token, p_atual: $('#s-atual').value, p_nova: n });
        setToken(t); f.reset(); msg.innerHTML = '<div class="msg ok">Senha alterada. Informe a nova senha aos demais administradores.</div>';
      } catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    });
  } else if (f.id === 'addresp') {
    const inp = $('#novo-resp'), msg = $('#resp-msg');
    guard(async () => {
      try { const r = await rpc('admin_adicionar_responsavel', { p_token: S.token, p_nome: inp.value }); await carregar(); renderResp(); toast(`${r.nome} adicionado à lista.`); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    });
  } else if (f.classList.contains('resp-row')) {
    salvarResp(f, f.dataset.ativo === 'true');
  } else if (f.id === 'arq') {
    const msg = $('#arq-msg'), por = $('#a-por').value.trim(), motivo = $('#a-motivo').value.trim();
    if (!por || motivo.length < 3) { msg.innerHTML = '<div class="msg err">Informe o motivo e quem está arquivando.</div>'; return; }
    loc.set('nomeAdmin', por);
    guard(async () => {
      try { await rpc('admin_arquivar', { p_token: S.token, p_id: f.dataset.id, p_por: por, p_motivo: motivo }); await carregar(); dlg().close(); toast('Orçamento arquivado.'); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    });
  } else if (f.classList.contains('exc')) {
    const msg = $('.e-msg', f), por = ($('#adm-por') || {}).value || '';
    if (!por) { msg.innerHTML = '<div class="msg err">Escolha, acima da lista, quem está executando a ação.</div>'; return; }
    loc.set('nomeAdmin', por);
    guard(async () => {
      try { await rpc('admin_excluir_definitivo', { p_token: S.token, p_senha: ($('.e-senha', f) || {}).value, p_id: f.dataset.id, p_confirmacao: $('.e-conf', f).value, p_por: por });
        await carregar(); toast('Registro excluído definitivamente.'); viewAdmin($('#view')); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
    });
  }
});

function salvarResp(f, ativo) {
  const msg = $('#resp-msg');
  guard(async () => {
    try { await rpc('admin_alterar_responsavel', { p_token: S.token, p_id: f.dataset.id, p_nome: $('.r-nome', f).value, p_ativo: ativo }); await carregar(); renderResp(); toast('Lista de responsáveis atualizada.'); }
    catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; }
  });
}

/* ------------------------------------------------------------------ início */
async function init() {
  if (MODE === 'demo') $('#banner').innerHTML = '<div class="banner"><b>Modo demonstração.</b> Os dados abaixo são exemplos guardados só nesta aba. Senha administrativa de teste: <b class="mono">demo1234</b>. Para usar o banco online, preencha o arquivo config.js.</div>';
  if (CLOUD) { S.token = null; try { S.token = (await Cloud.iniciar()) ? 'claude' : null; } catch { /* a carga mostra o erro */ } window.__dadosMudaram = () => carregar(true); }
  else if (S.token) { try { if (!(await rpc('admin_validar_sessao', { p_token: S.token }))) S.token = null; } catch { /* mantém; a primeira ação revalida */ } }
  setToken(S.token);
  if (ses.get('apos')) { ses.set('apos', null); toast('Salvo. A página foi atualizada com a sua alteração.'); }
  window.addEventListener('hashchange', route);
  route();
  if (!GATE || S.cs) carregar();
  setInterval(() => { if (!document.hidden) carregar(true); }, 30000);
  document.addEventListener('visibilitychange', () => { if (!document.hidden) carregar(true); });
}
init();
})();
