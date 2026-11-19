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

/* Datas e dias úteis (usados pelo Acompanhamento) */
const pad2 = n => String(n).padStart(2, '0');
const isoD = d => `${d.getUTCFullYear()}-${pad2(d.getUTCMonth() + 1)}-${pad2(d.getUTCDate())}`;
const addD = (iso, n) => { const d = new Date(iso + 'T12:00:00Z'); d.setUTCDate(d.getUTCDate() + n); return isoD(d); };
const difD = (a, b) => Math.round((new Date(b + 'T12:00:00Z') - new Date(a + 'T12:00:00Z')) / 864e5);
const ehUtil = (iso, fer) => { const w = new Date(iso + 'T12:00:00Z').getUTCDay(); return w > 0 && w < 6 && !fer.has(iso); };
const somaDU = (ini, n, fer) => { let d = ini, k = 0; while (k < n) { d = addD(d, 1); if (ehUtil(d, fer)) k++; } return d; };
const ETAPAS = [['demanda', 'Demanda recebida'], ['definicao', 'Definição do produto'], ['elaboracao', 'Elaboração'], ['revisao', 'Revisão'], ['conferencia', 'Conferência'], ['aprovacao', 'Aprovação'], ['disponibilizada', 'Disponibilizada']];
const ETN = Object.fromEntries(ETAPAS);
const ELAB = { '2.5.1': 'Relação de serviços', '2.5.2': 'Quantitativos', '2.5.3': 'Estrutura analítica (EAP)', '2.5.4': 'Bases referenciais de preço', '2.5.5': 'Pesquisa de preço de mercado', '2.5.6': 'Mobilização e desmobilização', '2.5.7': 'Compatibilização das bases', '2.5.8': 'Administração local', '2.5.9': 'Cálculo do BDI', '2.5.10': 'Relatório Técnico de Orçamento' };
const PRODUTOS = { etp: 'Estudo Técnico Preliminar', anteprojeto: 'Anteprojeto', pbpe_direta: 'Projeto Básico/Executivo (execução direta)', pbpe_indireta: 'Projeto Básico/Executivo (execução indireta)', pregao: 'Pregão (aquisição)', reajuste: 'Reajuste contratual', repactuacao: 'Repactuação contratual' };
const NIVEIS = ['Projeto Básico', 'Estudo Técnico Preliminar', 'Anteprojeto', 'Projeto Executivo'];
const FINS = ['Projeto para licitação', 'Análise de viabilidade', 'Projeto para execução', 'Análise de reajuste contratual', 'Análise de repactuação contratual'];
const OBJETOS = ['Obra ou serviço de engenharia', 'Aquisição (pregão)'];
const REGIMES = ['Preço global (EPG)', 'Preço unitário (EPU)', 'Integral (EI)', 'Por tarefa (ET)', 'Contratação integrada (CI)', 'Semi-integrada (CSI)'];
const PRIOS = ['a definir', 'Alta', 'Média', 'Baixa'];
const PECA_ST = { pendente: 'Pendente', conferida: 'Conferida', nao_se_aplica: 'Não se aplica' };
const produtoDe = (nivel, fim, exec, obj) => /reajuste/i.test(fim || '') ? 'reajuste' : /repactua/i.test(fim || '') ? 'repactuacao'
  : nivel === 'Estudo Técnico Preliminar' ? 'etp' : nivel === 'Anteprojeto' ? 'anteprojeto' : /Aquisi/.test(obj || '') ? 'pregao'
  : exec === 'Indireta' ? 'pbpe_indireta' : exec === 'Direta' ? 'pbpe_direta' : '';

const ICON = {
  painel: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="7" height="9" rx="1"/><rect x="14" y="3" width="7" height="5" rx="1"/><rect x="14" y="12" width="7" height="9" rx="1"/><rect x="3" y="16" width="7" height="5" rx="1"/></svg>',
  consultar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><circle cx="11" cy="11" r="7"/><path d="m20 20-3.5-3.5"/></svg>',
  cadastrar: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M12 5v14M5 12h14"/></svg>',
  historico: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></svg>',
  acompanhamento: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="4" width="5" height="16" rx="1"/><rect x="10" y="4" width="5" height="10" rx="1"/><rect x="17" y="4" width="4" height="13" rx="1"/></svg>',
  administracao: '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/></svg>'
};
const NAV = [
  { id: 'painel', label: 'Painel inicial', short: 'Painel' },
  { id: 'consultar', label: 'Consultar orçamentos', short: 'Consultar' },
  { id: 'cadastrar', label: 'Cadastrar orçamento', short: 'Cadastrar', admin: true },
  { id: 'acompanhamento', label: 'Acompanhamento', short: 'Acomp.', ac: true },
  { id: 'historico', label: 'Histórico de revisões', short: 'Revisões' },
  { id: 'administracao', label: 'Administração', short: 'Admin', admin: true }
].filter(n => !(n.ac && (window.APP_MODE === 'claude' || window.APP_MODE === 'page')));   // o acompanhamento só existe com banco (Supabase) ou demonstração

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
    acompanhamento: async () => { const d = await http('/rest/v1/rpc/consulta_acompanhamento', { p_senha: S.cs || '' }); if (d === null) throw erro('consulta_invalida: senha de consulta incorreta'); return d; },
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
  /* ---- Acompanhamento: espelha supabase/acompanhamento.sql ---- */
  const T5 = 'pbpe_direta pbpe_indireta pregao reajuste repactuacao', T4 = 'pbpe_direta pbpe_indireta pregao repactuacao', C3 = 'pregao repactuacao', C4 = 'pregao reajuste repactuacao';
  const CAT = [[1, 'Estudo de Viabilidade Técnico-Econômica', 'etp', ''], [2, 'Estimativa de Custos', 'anteprojeto', ''], [3, 'Relatório Técnico de Orçamento', T5, ''],
    [4, 'Planilha Orçamentária Resumida', T5, ''], [5, 'Planilha Orçamentária Sintética', T5, ''], [6, 'Planilha Orçamentária Analítica', T5, ''],
    [7, 'Memória de Cálculo da Mobilização e Desmobilização', T4, C3], [8, 'Memória de Cálculo da Administração Local', T4, C3], [9, 'Detalhamento de Orçamento do Canteiro de Obras', T4, C3],
    [10, 'Cálculo da Aquisição de Insumos (Cotação)', T5, C4], [11, 'Tabela de Composição do BDI', T4, C3], [12, 'Tabela de Encargos Sociais', T4, C3],
    [13, 'Curva ABC de Insumos', T5, C4], [14, 'Curva ABC de Serviços', T5, C4], [15, 'Tabela de Parâmetros de Equipamentos', T4, C3], [16, 'Tabela de Equipamentos Consolidada', T4, C3],
    [17, 'Tabela de Mão de Obra COMARA sem encargos', 'pbpe_direta', ''], [18, 'Tabela de Mão de Obra COMARA com encargos', 'pbpe_direta', ''], [19, 'Tabela de Equivalência de Mão de Obra', 'pbpe_direta', ''],
    [20, 'Caderno de Critérios de Medição', 'pbpe_direta pbpe_indireta', ''], [21, 'ART/RRT', 'etp anteprojeto pbpe_direta pbpe_indireta', '']];
  let dem = [], movs = [], pec = [], feri = [], mqd = [];
  const fer = () => new Set(feri.map(f => f.data));
  const mv = (d, acao, de, para, por, motivo, em) => movs.push({ id: movs.length + 1, demanda_id: d.id, acao, de: de || null, para: para || null, por, motivo: (motivo || '').trim() || null, em: em || new Date().toISOString() });
  const ro = (n, m) => (n || '').trim() ? rv(n, m) : null;
  const gd = id => { const d = dem.find(x => x.id === id && !x.arquivada_em); if (!d) throw erro('nao_encontrado: demanda não encontrada'); return d; };
  const nv = s => (s || '').trim() || null;
  const mkPecas = d => { if (pec.some(p => p.demanda_id === d.id)) return; CAT.filter(c => c[2].split(' ').includes(d.produto)).forEach(c => pec.push({ id: uid(), demanda_id: d.id, ordem: c[0], nome: c[1], condicional: c[3].split(' ').includes(d.produto), status: 'pendente', conferido_por: null, conferido_em: null })); };
  const rc = d => { const l = mqd.filter(q => q.demanda_id === d.id), pend = l.filter(q => !q.recebido_em);
    d.prazo_mq = l.length ? l.map(q => q.prazo).sort().pop() : null; d.mq_recebido_em = l.length && !pend.length ? l.map(q => q.recebido_em).sort().pop() : null;
    d.prazo_orcamento = l.length && d.dias_elaboracao ? somaDU(l.map(q => q.recebido_em || q.prazo).sort().pop(), d.dias_elaboracao + 10, fer()) : null; };
  const nd = (o, por, dias) => { const ts = new Date(Date.now() - dias * 864e5).toISOString(); const mq0 = o.mq || []; o = Object.assign({}, o); delete o.mq; const d = Object.assign({ id: uid(), escopo: '', origem: 'Interna', demandante: '', prioridade: 'a definir', produto: null, nivel: null, fim: null, execucao: null, tipo_objeto: null, regime: null, autor: null, supervisor: null,
    condicionantes: null, prazo_mq: null, prazo_orcamento: null, mq_recebido_em: null, dias_elaboracao: null, etapa: 'demanda', etapa_elab: null, etapa_prazo: null, etapa_desde: ts, orcamento_id: null, atualizacao_de: null, criado_em: ts, criado_por: por, atualizado_em: null, arquivada_em: null, arquivada_motivo: null }, o);
    dem.push(d); mq0.forEach(m => mqd.push({ id: uid(), demanda_id: d.id, disciplina: m[0], prazo: m[1], recebido_em: m[2] || null, criado_em: ts })); rc(d); mv(d, 'cadastro', null, 'demanda', por, null, ts); return d; };
  const H = hoje();
  nd({ escopo: 'Recuperação do pavimento do pátio de manobras', origem: 'Externa', demandante: 'Seção de Infraestrutura — Base Aérea', dias_elaboracao: 8, mq: [['Pavimentação', addD(H, 5)], ['Drenagem', addD(H, 8)]] }, 'Ana Ribeiro', 1);
  nd({ escopo: 'Reforma da cobertura do hangar 2', demandante: 'Divisão de Manutenção', prioridade: 'Média', produto: 'pbpe_direta', nivel: 'Projeto Básico', fim: 'Projeto para licitação', execucao: 'Direta', tipo_objeto: OBJETOS[0], regime: REGIMES[0], etapa: 'definicao', dias_elaboracao: 6, mq: [['Estrutura', addD(H, -1)], ['Cobertura', addD(H, 4)]] }, 'Bruno Teixeira', 4);
  nd({ escopo: 'Terminal de passageiros — climatização', origem: 'Externa', demandante: 'Administração do Aeródromo', prioridade: 'Alta', produto: 'pbpe_indireta', nivel: 'Projeto Básico', fim: 'Projeto para licitação', execucao: 'Indireta', tipo_objeto: OBJETOS[0], regime: REGIMES[1],
    autor: 'Carla Mendes', supervisor: 'Diego Farias', etapa: 'elaboracao', etapa_elab: '2.5.5', dias_elaboracao: 10, mq: [['Arquitetura', addD(H, -8), addD(H, -9)], ['Climatização', addD(H, -8), addD(H, -8)]], condicionantes: 'Considerar interferência com a operação do terminal durante a obra.' }, 'Ana Ribeiro', 12);
  const dRev = nd({ escopo: 'Drenagem superficial da pista de táxi', demandante: 'Seção de Engenharia', prioridade: 'Alta', produto: 'pbpe_indireta', nivel: 'Projeto Básico', fim: 'Projeto para licitação', execucao: 'Indireta', tipo_objeto: OBJETOS[0], regime: REGIMES[0],
    autor: 'Bruno Teixeira', supervisor: 'Eva Lima', etapa: 'revisao', dias_elaboracao: 5, mq: [['Drenagem', addD(H, -18), addD(H, -20)]], etapa_prazo: addD(H, 3) }, 'Bruno Teixeira', 25);
  mkPecas(dRev); pec.filter(p => p.demanda_id === dRev.id).slice(0, 7).forEach(p => { p.status = 'conferida'; p.conferido_por = 'Eva Lima'; p.conferido_em = new Date().toISOString(); });
  nd({ escopo: 'Estudo de viabilidade — nova subestação', origem: 'Externa', demandante: 'Comando da Unidade', prioridade: 'Baixa', produto: 'etp', nivel: 'Estudo Técnico Preliminar', fim: 'Análise de viabilidade', execucao: 'Indireta', tipo_objeto: OBJETOS[0],
    autor: 'Diego Farias', supervisor: 'Ana Ribeiro', etapa: 'aprovacao', dias_elaboracao: 12, mq: [['Elétrica', addD(H, -28), addD(H, -30)]] }, 'Diego Farias', 35);
  nd({ escopo: 'Reforma da Escola Municipal Santa Luzia', demandante: 'Prefeitura', prioridade: 'Média', produto: 'pbpe_direta', nivel: 'Projeto Básico', fim: 'Projeto para licitação', execucao: 'Direta', tipo_objeto: OBJETOS[0], regime: REGIMES[0],
    autor: 'Ana Ribeiro', supervisor: 'Bruno Teixeira', etapa: 'disponibilizada', orcamento_id: a, dias_elaboracao: 5, mq: [['Arquitetura', addD(H, -48), addD(H, -50)]] }, 'Ana Ribeiro', 60);
  Object.assign(fns, {
    admin_criar_demanda: p => { need(p.p_token); const por = rv(p.p_por); const au = ro(p.p_autor), su = ro(p.p_supervisor);
      const ms = p.p_mqs || []; if (ms.some(m => (m.disciplina || '').trim().length < 2 || !m.prazo)) throw erro('mq_invalido: informe a disciplina e o prazo de cada MQ');
      if (new Set(ms.map(m => m.disciplina.trim().toLowerCase())).size < ms.length) throw erro('mq_duplicado: há disciplinas repetidas');
      if (p.p_atualizacao_de && !db.some(x => x.id === p.p_atualizacao_de)) throw erro('nao_encontrado: orçamento de origem não encontrado');
      if ((p.p_escopo || '').trim().length < 3) throw erro('dados_invalidos: descreva o escopo da demanda');
      if ((p.p_demandante || '').trim().length < 2) throw erro('dados_invalidos: informe o demandante');
      const d = nd({ escopo: p.p_escopo.trim(), origem: p.p_origem, demandante: p.p_demandante.trim(), prioridade: nv(p.p_prioridade) || 'a definir', produto: nv(p.p_produto), nivel: nv(p.p_nivel), fim: nv(p.p_fim), execucao: nv(p.p_execucao),
        tipo_objeto: nv(p.p_tipo_objeto), regime: nv(p.p_regime), autor: au, supervisor: su, condicionantes: nv(p.p_condicionantes), dias_elaboracao: p.p_dias_elaboracao || null, atualizacao_de: p.p_atualizacao_de || null, mq: ms.map(m => [m.disciplina.trim(), m.prazo]) }, por, 0);
      return d; },
    admin_editar_demanda: p => { need(p.p_token); const por = rv(p.p_por); const d = gd(p.p_id);
      if (d.etapa === 'disponibilizada') throw erro('ja_disponibilizada: demanda concluída; uma atualização deve ser registrada como nova demanda');
      const au = ro(p.p_autor, d.autor), su = ro(p.p_supervisor, d.supervisor);
      if (['revisao', 'conferencia', 'aprovacao'].includes(d.etapa) && nv(p.p_produto) !== d.produto) throw erro('produto_travado: o produto não pode mudar depois de iniciada a revisão (as peças já foram definidas)');
      Object.assign(d, { escopo: p.p_escopo.trim(), origem: p.p_origem, demandante: p.p_demandante.trim(), prioridade: nv(p.p_prioridade) || 'a definir', produto: nv(p.p_produto), nivel: nv(p.p_nivel), fim: nv(p.p_fim), execucao: nv(p.p_execucao), tipo_objeto: nv(p.p_tipo_objeto),
        regime: nv(p.p_regime), autor: au, supervisor: su, condicionantes: nv(p.p_condicionantes), dias_elaboracao: p.p_dias_elaboracao || null, atualizado_em: new Date().toISOString() }); rc(d);
      mv(d, 'edicao', null, null, por, p.p_motivo); return d; },
    admin_mover_demanda: p => { need(p.p_token); const por = rv(p.p_por); const d = gd(p.p_id); const E = ETAPAS.map(e => e[0]);
      const ia = E.indexOf(d.etapa), inv = E.indexOf(p.p_para);
      if (inv < 0) throw erro('etapa_invalida: etapa desconhecida');
      if (d.etapa === 'disponibilizada') throw erro('ja_disponibilizada: demanda concluída; uma atualização deve ser registrada como nova demanda');
      if (inv === ia) throw erro('mesma_etapa: a demanda já está nesta etapa');
      if (inv < ia && (p.p_motivo || '').trim().length < 3) throw erro('motivo_obrigatorio: informe o motivo para devolver a demanda a uma etapa anterior');
      if (inv > ia + 1) throw erro('etapa_pulada: avance uma etapa de cada vez');
      let prazo = null;
      if (inv > ia) {
        if (p.p_para === 'definicao' && d.prioridade === 'a definir') throw erro('prioridade_pendente: classifique a prioridade antes de autorizar a demanda');
        if (p.p_para === 'elaboracao' && !(d.autor && d.supervisor && d.prazo_mq && d.prazo_orcamento && d.produto)) throw erro('dados_incompletos: informe o produto, o Autor, o Supervisor, os dias de elaboração e ao menos um MQ com prazo');
        if (p.p_para === 'conferencia') { const n = pec.filter(x => x.demanda_id === d.id && x.status === 'pendente').length; if (n) throw erro(`pecas_pendentes: ainda há ${n} peça(s) pendente(s) na revisão`); }
        if (p.p_para === 'disponibilizada' && !db.some(x => x.id === p.p_orcamento_id && !x.arquivado_em)) throw erro('orcamento_obrigatorio: informe o orçamento registrado no controle de versões');
      }
      const ja = e => movs.some(m => m.demanda_id === d.id && m.acao === 'mover' && m.para === e);
      if (p.p_para === 'revisao') { mkPecas(d); prazo = somaDU(H2(), ja('revisao') ? 3 : 5, fer()); }
      else if (p.p_para === 'conferencia') prazo = somaDU(H2(), ja('conferencia') ? 3 : 5, fer());
      const de = d.etapa;
      Object.assign(d, { etapa: p.p_para, etapa_desde: new Date().toISOString(), etapa_prazo: prazo, atualizado_em: new Date().toISOString() });
      if (p.p_para === 'elaboracao') d.etapa_elab = d.etapa_elab || '2.5.1';
      if (p.p_para === 'disponibilizada') d.orcamento_id = p.p_orcamento_id;
      mv(d, 'mover', de, p.p_para, por, p.p_motivo); return d; },
    admin_demanda_etapa_elab: p => { need(p.p_token); const por = rv(p.p_por); const d = gd(p.p_id);
      if (d.etapa !== 'elaboracao') throw erro('fora_da_elaboracao: a etapa de elaboração só pode ser marcada durante a Elaboração');
      if (!ELAB[p.p_etapa]) throw erro('etapa_invalida: etapa desconhecida'); const antes = d.etapa_elab; d.etapa_elab = p.p_etapa; d.atualizado_em = new Date().toISOString(); mv(d, 'etapa_elab', antes, p.p_etapa, por); return d; },
    admin_mq_salvar: p => { need(p.p_token); const por = rv(p.p_por); const d = gd(p.p_demanda_id);
      if (d.etapa === 'disponibilizada') throw erro('ja_disponibilizada: demanda concluída');
      const disc = (p.p_disciplina || '').trim(); if (disc.length < 2) throw erro('mq_invalido: informe a disciplina'); if (!p.p_prazo) throw erro('mq_invalido: informe o prazo do MQ');
      if (p.p_recebido_em && p.p_recebido_em > hoje()) throw erro('data_futura: a data de recebimento não pode ser futura');
      if (mqd.some(q => q.demanda_id === d.id && q.id !== p.p_mq_id && q.disciplina.toLowerCase() === disc.toLowerCase())) throw erro('mq_duplicado: já existe um MQ da disciplina ' + disc);
      let q = p.p_mq_id && mqd.find(x => x.id === p.p_mq_id && x.demanda_id === d.id);
      if (p.p_mq_id && !q) throw erro('nao_encontrado: MQ não encontrado');
      if (!q) { q = { id: uid(), demanda_id: d.id, disciplina: disc, prazo: p.p_prazo, recebido_em: p.p_recebido_em || null, criado_em: new Date().toISOString() }; mqd.push(q); mv(d, 'mq_prazo', disc, p.p_prazo, por); if (q.recebido_em) mv(d, 'mq', disc, q.recebido_em, por); }
      else { if (q.prazo !== p.p_prazo || q.disciplina !== disc) mv(d, 'mq_prazo', disc, p.p_prazo, por); if ((q.recebido_em || null) !== (p.p_recebido_em || null)) mv(d, 'mq', disc, p.p_recebido_em || 'removido', por); Object.assign(q, { disciplina: disc, prazo: p.p_prazo, recebido_em: p.p_recebido_em || null }); }
      rc(d); d.atualizado_em = new Date().toISOString(); return d; },
    admin_mq_remover: p => { need(p.p_token); const por = rv(p.p_por); const q = mqd.find(x => x.id === p.p_mq_id); if (!q) throw erro('nao_encontrado: MQ não encontrado'); const d = gd(q.demanda_id);
      if (d.etapa === 'disponibilizada') throw erro('ja_disponibilizada: demanda concluída'); mqd = mqd.filter(x => x.id !== q.id); mv(d, 'mq_prazo', q.disciplina, 'removido', por); rc(d); return d; },
    admin_peca_status: p => { need(p.p_token); const por = rv(p.p_por); const x = pec.find(q => q.id === p.p_peca_id); if (!x) throw erro('nao_encontrado: peça não encontrada');
      if (!PECA_ST[p.p_status]) throw erro('status_invalido: status desconhecido'); const d = dem.find(q => q.id === x.demanda_id);
      if (d.etapa !== 'revisao') throw erro('fora_da_revisao: as peças são conferidas na etapa de Revisão');
      if (p.p_status === 'nao_se_aplica' && !x.condicional) throw erro('peca_obrigatoria: esta peça é obrigatória para o produto e não pode ser marcada como não se aplica');
      x.status = p.p_status; x.conferido_por = p.p_status === 'pendente' ? null : por; x.conferido_em = p.p_status === 'pendente' ? null : new Date().toISOString(); mv(d, 'peca', x.nome, p.p_status, por); return x; },
    admin_arquivar_demanda: p => { need(p.p_token); const por = rv(p.p_por); if ((p.p_motivo || '').trim().length < 3) throw erro('motivo_obrigatorio: informe o motivo'); const d = gd(p.p_id);
      d.arquivada_em = new Date().toISOString(); d.arquivada_motivo = p.p_motivo.trim(); mv(d, 'arquivamento', d.etapa, null, por, p.p_motivo); return null; },
    admin_feriado_salvar: p => { need(p.p_token); if (!p.p_data) throw erro('data_invalida: informe a data'); if ((p.p_nome || '').trim().length < 2) throw erro('nome_invalido: informe o nome do feriado');
      feri = feri.filter(f => f.data !== p.p_data); feri.push({ data: p.p_data, nome: p.p_nome.trim() }); dem.filter(x => x.etapa !== 'disponibilizada').forEach(rc); return null; },
    admin_feriado_remover: p => { need(p.p_token); feri = feri.filter(f => f.data !== p.p_data); dem.filter(x => x.etapa !== 'disponibilizada').forEach(rc); return null; }
  });
  const H2 = () => hoje();
  const clone = x => JSON.parse(JSON.stringify(x));
  return {
    acompanhamento: async () => { const ativas = dem.filter(x => !x.arquivada_em), ids = new Set(ativas.map(x => x.id));
      return clone({ demandas: [...ativas].sort((x, y) => y.criado_em.localeCompare(x.criado_em)), movimentos: [...movs].sort((x, y) => y.em.localeCompare(x.em)).slice(0, 300), pecas: pec.filter(p => ids.has(p.demanda_id)).sort((x, y) => x.ordem - y.ordem), mqs: mqd.filter(q => ids.has(q.demanda_id)).sort((x, y) => x.prazo.localeCompare(y.prazo)), feriados: [...feri].sort((x, y) => x.data.localeCompare(y.data)) }); },
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
  h: { q: '', soRev: true }, open: new Set(), sig: '',
  ac: { d: [], m: [], p: [], q: [], f: [], sig: '', ok: false, erro: '' }, acv: 'quadro', acf: { autor: '', nivel: '', prio: '', prazo: '' }
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
    const [items, resp] = await Promise.all([api.listar(), api.responsaveis(), carregarAc()]);
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
function respSelect(id, atual, legado, opc) {
  const nomes = ativos().map(r => r.nome);
  const fora = legado && atual && !nomes.some(n => norm(n) === norm(atual));
  const lista = fora ? [atual, ...nomes] : nomes;
  const sel = atual ? lista.find(n => norm(n) === norm(atual)) : '';
  return `<select id="${id}" ${opc ? '' : 'required'}><option value="">${opc ? '—' : 'Selecione…'}</option>${lista.map(n => `<option ${n === sel ? 'selected' : ''}>${esc(n)}${fora && n === atual ? ' (fora da lista)' : ''}</option>`).join('')}</select>`;
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
  ({ painel: viewPainel, consultar: viewConsultar, cadastrar: viewCadastrar, historico: viewHistorico, administracao: viewAdmin, acompanhamento: viewAcompanhamento })[S.view](v);
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
function alertasAc() {
  const H = hoje(), out = [];
  for (const d of S.ac.d) {
    if (d.etapa === 'disponibilizada') continue;
    const p = [], add = (rot, prazo) => { const n = difD(H, prazo); if (n > 3) return; p.push({ n, cls: n < 0 ? 'late' : 'warn', txt: n < 0 ? `${rot} atrasado ${-n} dia${-n > 1 ? 's' : ''}` : n === 0 ? `${rot} vence hoje` : `${rot} vence em ${n} dia${n > 1 ? 's' : ''}` }); };
    const mr = mqRes(d); if (mr.prox) add('MQ ' + mr.prox.disciplina, mr.prox.prazo);
    if (d.prazo_orcamento) add('Orçamento', d.prazo_orcamento);
    if ((d.etapa === 'revisao' || d.etapa === 'conferencia') && d.etapa_prazo) add(ETN[d.etapa], d.etapa_prazo);
    if (d.etapa === 'demanda' && d.prioridade === 'a definir') p.push({ n: 0, cls: 'ant', txt: 'Prioridade a definir' });
    if (p.length) out.push({ d, p, n: Math.min(...p.map(x => x.n)) });
  }
  return out.sort((a, b) => a.n - b.n);
}
function atencaoHTML() {
  if (CLOUD || !S.ac.ok || S.ac.erro || !S.ac.d.length) return '';
  const l = alertasAc();
  return `<section class="card" aria-label="Atenção hoje"><div class="page-head"><h2>Atenção hoje</h2><a class="btn" href="#acompanhamento">Abrir acompanhamento</a></div>
    ${l.length ? `<div class="list" style="margin-top:12px">${l.slice(0, 8).map(x => `<button class="row alerta" data-act="demanda" data-id="${x.d.id}"><span class="main"><b>${esc(x.d.escopo)}</b><small>${ETN[x.d.etapa]}${x.d.autor ? ' · Autor ' + esc(x.d.autor) : ''}</small></span><span class="tags">${x.p.map(q => `<span class="pill ${q.cls}">${esc(q.txt)}</span>`).join('')}</span></button>`).join('')}</div>${l.length > 8 ? `<p class="muted" style="margin-top:8px;font-size:.84rem">E mais ${l.length - 8} no acompanhamento.</p>` : ''}`
      : '<p class="muted" style="margin-top:8px">Nenhum prazo vencido ou vencendo nos próximos 3 dias.</p>'}</section>`;
}
function viewPainel(v) {
  const it = S.items;
  const revs = it.filter(o => o.num_revisao > 0).length;
  const k = (label, val, sub) => `<div class="kpi"><small>${label}</small><strong>${val}</strong>${sub ? `<em>${sub}</em>` : ''}</div>`;
  v.innerHTML = head('Painel inicial', 'Visão geral dos orçamentos cadastrados.') + estadoLista() + (S.loaded && !S.loadError ? `
    <section class="kpis" aria-label="Indicadores">
      ${k('Orçamentos cadastrados', it.length, 'originais e revisões')}${k('Orçamentos originais', it.length - revs)}${k('Revisões', revs, 'contam como orçamento')}${k('Versões vigentes', S.maxRev.size, 'a mais recente de cada série')}
    </section>
    ${atencaoHTML()}
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
  ${CLOUD ? '' : '<section class="card" id="fer-card"></section>'}
  <section class="card"><h2>Backup</h2>
    <p class="muted" style="font-size:.88rem;margin-top:6px">Baixe uma cópia dos dados em CSV (abre no Excel). Faça isso de tempos em tempos, principalmente no plano gratuito do Supabase, que não tem backup automático.</p>
    <div class="actions" style="margin-top:12px"><button class="btn" data-act="exp-orc">Exportar orçamentos (CSV)</button><button class="btn" data-act="exp-aud">Exportar registro de alterações (CSV)</button></div></section>
  <section class="card"><h2>Registros arquivados</h2><div id="arquivados" class="muted">Carregando…</div></section>
  <section class="card"><h2>Registro geral de alterações</h2><div id="auditoria" class="muted">Carregando…</div></section>`;
  renderResp(); renderFeriados();
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


/* ------------------------------------------------------------------ acompanhamento (elaboração, NPA 2/DE-SDPO/2023) */
const ferSet = () => new Set(S.ac.f.map(x => x.data));
const autoresAc = () => [...new Set([...S.ac.d.map(d => d.autor), ...S.ac.d.map(d => d.supervisor)].filter(Boolean))].sort((a, b) => a.localeCompare(b));
function sit(prazo, ok) {
  const dif = difD(hoje(), prazo);
  if (dif < 0) return { txt: `Atrasado ${-dif} dia${-dif > 1 ? 's' : ''}`, cls: 'late' };
  if (dif === 0) return { txt: 'Vence hoje', cls: 'warn' };
  if (dif <= 3) return { txt: `Vence em ${dif} dia${dif > 1 ? 's' : ''}`, cls: 'warn' };
  return { txt: ok, cls: 'ant' };
}
const mqsDe = id => S.ac.q.filter(q => q.demanda_id === id);
function mqRes(d) { const l = mqsDe(d.id), pend = l.filter(q => !q.recebido_em).sort((a, b) => a.prazo.localeCompare(b.prazo)); return { l, n: l.length, rec: l.length - pend.length, pend, prox: pend[0] }; }
function sitMQ(d) {
  const r = mqRes(d);
  if (!r.n) return { txt: 'Sem MQ cadastrado', cls: 'ant', r };
  if (!r.pend.length) return { txt: 'Todos recebidos', cls: 'ok', r };
  return { ...sit(r.prox.prazo, 'Próximo ' + fmtD(r.prox.prazo)), r };
}
function sitOrc(d) {
  if (d.etapa === 'disponibilizada') return { txt: 'Entregue', cls: 'ok' };
  if (!d.prazo_orcamento) return { txt: 'Informe MQs e dias', cls: 'ant' };
  return sit(d.prazo_orcamento, 'No prazo');
}
const pecasDe = id => S.ac.p.filter(p => p.demanda_id === id);
function etapaInfo(d) {
  if (d.etapa === 'elaboracao') return { txt: `${d.etapa_elab || '2.5.1'} ${ELAB[d.etapa_elab || '2.5.1']}`, cls: '' };
  if (d.etapa === 'revisao' || d.etapa === 'conferencia') {
    const ps = pecasDe(d.id), ok = ps.filter(p => p.status !== 'pendente').length;
    const atraso = d.etapa_prazo && d.etapa_prazo < hoje();
    return { txt: `${ETN[d.etapa]}: prazo ${fmtD(d.etapa_prazo)}${atraso ? ' (vencido)' : ''}${d.etapa === 'revisao' && ps.length ? ` · peças ${ok}/${ps.length}` : ''}`, cls: atraso ? 'late' : '' };
  }
  if (d.etapa === 'aprovacao') return { txt: 'Aguardando aprovação', cls: '' };
  return null;
}
const prioChip = d => `<span class="chip prio-${d.prioridade === 'a definir' ? 'nd' : norm(d.prioridade)}">${d.prioridade === 'a definir' ? 'Prioridade a definir' : 'Prioridade ' + esc(d.prioridade)}</span>`;
function filtraAc() {
  const f = S.acf;
  return S.ac.d.filter(d => (!f.autor || d.autor === f.autor || d.supervisor === f.autor) && (!f.nivel || d.nivel === f.nivel) && (!f.prio || d.prioridade === f.prio)
    && (!f.prazo || (d.etapa !== 'disponibilizada' && ((d.prazo_orcamento && d.prazo_orcamento < hoje()) || mqRes(d).pend.some(q => q.prazo < hoje())))));
}
function cardAc(d, mostraEtapa) {
  const mq = sitMQ(d), oc = sitOrc(d), ei = etapaInfo(d);
  return `<button class="ac-card" data-act="demanda" data-id="${d.id}">
    <b>${esc(d.escopo)}</b>
    <span class="ac-tags">${mostraEtapa ? `<span class="chip vig">${ETN[d.etapa]}</span>` : ''}${d.nivel ? `<span class="chip">${esc(d.nivel)}</span>` : ''}${d.execucao ? `<span class="chip">${esc(d.execucao)}</span>` : ''}${prioChip(d)}</span>
    <small>${d.autor ? 'Autor ' + esc(d.autor) : 'Autor a definir'}${d.supervisor ? ' · Sup. ' + esc(d.supervisor) : ''}</small>
    ${ei ? `<small class="ac-et ${ei.cls}">${esc(ei.txt)}</small>` : ''}
    <span class="ac-dates"><span>MQs <b class="mono">${mq.r.rec}/${mq.r.n}</b> <i class="pill ${mq.cls}">${esc(mq.txt)}</i></span><span>Orçamento${mq.r.pend.length && d.etapa !== 'disponibilizada' ? ' (previsto)' : ''} <b class="mono">${fmtD(d.prazo_orcamento)}</b> <i class="pill ${oc.cls}">${esc(oc.txt)}</i></span></span>
  </button>`;
}
function viewAcompanhamento(v) {
  const f = S.acf, opt = (arr, cur) => '<option value="">Todos</option>' + arr.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('');
  v.innerHTML = head('Acompanhamento', 'Demandas em elaboração, prazos de MQ e de entrega e checklist de peças (NPA 2/DE-SDPO/2023).', S.token ? '<button class="btn primary" data-act="nova-dem">Nova demanda</button>' : '') + `
  <form class="card filters ac-filters" onsubmit="return false">
    <div class="field"><span>Visualização</span><div class="seg"><label><input type="radio" name="acv" value="quadro" data-act="ac-view" ${S.acv === 'quadro' ? 'checked' : ''}><span>Quadro</span></label><label><input type="radio" name="acv" value="lista" data-act="ac-view" ${S.acv === 'lista' ? 'checked' : ''}><span>Lista</span></label></div></div>
    <label class="field"><span>Autor ou supervisor</span><select id="acf-autor">${opt(autoresAc(), f.autor)}</select></label>
    <label class="field"><span>Nível</span><select id="acf-nivel">${opt(NIVEIS, f.nivel)}</select></label>
    <label class="field"><span>Prioridade</span><select id="acf-prio">${opt(PRIOS.slice(1), f.prio)}</select></label>
    <label class="field"><span>Prazo</span><select id="acf-prazo"><option value="">Todos</option><option value="atrasado" ${f.prazo ? 'selected' : ''}>Com prazo vencido</option></select></label>
  </form><div id="ac-res"></div>`;
  renderAc();
}
function renderAc() {
  const box = $('#ac-res'); if (!box) return;
  if (!S.ac.ok) { box.innerHTML = '<div class="list"><div class="skeleton"></div><div class="skeleton"></div></div>'; return; }
  if (S.ac.erro) { box.innerHTML = `<div class="msg err">${esc(S.ac.erro)}</div>`; return; }
  const todas = S.ac.d, H = hoje(), ativas = todas.filter(d => d.etapa !== 'disponibilizada');
  const k = (l, n, s) => `<div class="kpi"><small>${l}</small><strong>${n}</strong>${s ? `<em>${s}</em>` : ''}</div>`;
  const atras = ativas.filter(d => d.prazo_orcamento && d.prazo_orcamento < H).length;
  const mqEsp = ativas.filter(d => mqRes(d).pend.length).length;
  const mes = todas.filter(d => d.etapa === 'disponibilizada' && (d.etapa_desde || '').slice(0, 7) === H.slice(0, 7)).length;
  const lista = filtraAc();
  let corpo;
  if (!todas.length) corpo = `<div class="empty"><b>Nenhuma demanda cadastrada</b>${S.token ? 'Use o botão Nova demanda para registrar a primeira.' : 'Os administradores registram as demandas por aqui.'}</div>`;
  else if (S.acv === 'lista') {
    const ord = [...lista].sort((a, b) => (a.etapa === 'disponibilizada') - (b.etapa === 'disponibilizada') || (a.prazo_orcamento || '9').localeCompare(b.prazo_orcamento || '9'));
    corpo = ord.length ? `<div class="ac-list">${ord.map(d => cardAc(d, true)).join('')}</div>` : '<div class="empty"><b>Nenhuma demanda com esses filtros</b></div>';
  } else {
    const cols = ETAPAS.slice(0, 6).map(([id, nome]) => { const l = lista.filter(d => d.etapa === id);
      return `<section class="ac-col" aria-label="${nome}"><h3>${nome} <span class="count">${l.length}</span></h3>${l.length ? l.map(d => cardAc(d)).join('') : '<p class="muted ac-vazio">Nenhuma demanda</p>'}</section>`; }).join('');
    const ok = lista.filter(d => d.etapa === 'disponibilizada');
    corpo = `<div class="ac-board">${cols}</div>${ok.length ? `<section><h3 style="margin:6px 0 10px">Disponibilizadas <span class="count">${ok.length}</span></h3><div class="ac-list">${ok.map(d => cardAc(d)).join('')}</div></section>` : ''}`;
  }
  box.innerHTML = `<section class="kpis" aria-label="Indicadores">${k('Em andamento', ativas.length, 'demandas abertas')}${k('Orçamentos atrasados', atras, 'prazo de entrega vencido')}${k('MQ aguardando demandante', mqEsp, 'demandas com disciplina pendente')}${k('Disponibilizadas no mês', mes)}</section>${corpo}`;
}
async function acRefresh() { try { await carregarAc(); } catch { /* a senha de consulta é tratada em carregar() */ } if (S.view === 'acompanhamento') renderAc(); if (S.view === 'administracao') renderFeriados(); }
async function carregarAc() {
  if (CLOUD) return;
  try {
    const r = await api.acompanhamento(), sig = JSON.stringify(r);
    if (sig !== S.ac.sig || !S.ac.ok || S.ac.erro) { S.ac = { d: r.demandas, m: r.movimentos, p: r.pecas, q: r.mqs || [], f: r.feriados, sig, ok: true, erro: '' }; if (S.view === 'acompanhamento') renderAc(); if (S.view === 'administracao') renderFeriados(); if (S.view === 'painel' && S.loaded) viewPainel($('#view')); }
  } catch (e) {
    if (e.code === 'consulta_invalida') throw e;
    S.ac.ok = true; S.ac.erro = /consulta_acompanhamento|schema cache|Could not find/i.test(e.message) ? 'O Acompanhamento ainda não foi instalado no banco. Rode o arquivo supabase/acompanhamento.sql no Supabase (veja o README).' : e.message;
    if (S.view === 'acompanhamento') renderAc();
  }
}
const movTxt = m => ({ cadastro: () => 'Demanda cadastrada', mover: () => `${ETN[m.de] || m.de} → ${ETN[m.para] || m.para}`, edicao: () => 'Dados editados',
  etapa_elab: () => `Elaboração: ${m.para} ${ELAB[m.para] || ''}`, mq: () => m.para === 'removido' ? `MQ ${m.de}: recebimento removido` : `MQ ${m.de}: recebido em ${fmtD(m.para)}`, mq_prazo: () => m.para === 'removido' ? `MQ ${m.de}: removido` : `MQ ${m.de}: prazo ${fmtD(m.para)}`,
  peca: () => `${m.de}: ${(PECA_ST[m.para] || m.para).toLowerCase()}`, arquivamento: () => 'Demanda arquivada' }[m.acao] || (() => m.acao))();
function openDemanda(id) {
  const d = S.ac.d.find(x => x.id === id); if (!d) { toast('Demanda não encontrada. Atualize a página.'); return; }
  const dd = (t, x, full) => `<div ${full ? 'class="full"' : ''}><dt>${t}</dt><dd>${x}</dd></div>`, mq = sitMQ(d), oc = sitOrc(d), ei = etapaInfo(d);
  const ps = pecasDe(d.id), idx = ETAPAS.findIndex(e => e[0] === d.etapa), prox = ETAPAS[idx + 1], ant = ETAPAS[idx - 1];
  const orc = d.orcamento_id && byId(d.orcamento_id), podeMq = S.token && d.etapa !== 'disponibilizada';
  const mqSec = `<section><h3 style="margin-bottom:6px">Memoriais de Quantidades (MQ) por disciplina · ${mq.r.rec}/${mq.r.n}</h3>
    <p class="muted" style="font-size:.84rem;margin-bottom:10px">O prazo do orçamento conta a partir do <b>último MQ recebido</b>: ${d.dias_elaboracao || 'N'} dias úteis de elaboração + 5 de Revisão + 5 de Conferência (NPA 2/DE-SDPO/2023), sem fins de semana e feriados cadastrados.${mq.r.pend.length ? ' Enquanto faltar MQ, o prazo é uma previsão.' : ''}</p>
    ${mq.r.n ? `<ul class="pecas">${mq.r.l.map(q => { const s2 = q.recebido_em ? { cls: 'ok', txt: 'Recebido ' + fmtD(q.recebido_em) } : sit(q.prazo, 'No prazo');
      return `<li><span>${esc(q.disciplina)} <small class="muted">prazo ${fmtD(q.prazo)}</small></span><span style="display:flex;gap:6px;align-items:center;flex-wrap:wrap;justify-content:flex-end"><span class="pill ${s2.cls}">${esc(s2.txt)}</span>${podeMq ? `${q.recebido_em ? '' : `<button class="btn" data-act="mq" data-id="${d.id}" data-mq="${q.id}" data-rec="1">Receber</button>`}<button class="btn" data-act="mq" data-id="${d.id}" data-mq="${q.id}">Editar</button>` : ''}</span></li>`; }).join('')}</ul>` : '<p class="muted">Nenhum MQ cadastrado.</p>'}
    ${podeMq ? `<div class="actions" style="margin-top:10px"><button class="btn" data-act="mq" data-id="${d.id}">Adicionar disciplina</button></div>` : ''}</section>`;
  const pecas = ps.length ? `<section><h3 style="margin-bottom:10px">Checklist de peças (Anexo A) · ${ps.filter(p => p.status !== 'pendente').length}/${ps.length}</h3><ul class="pecas">${ps.map(p => `<li class="${p.status}"><span>${esc(p.nome)}${p.condicional ? ' <small class="muted">(no que couber)</small>' : ''}</span>
      ${S.token && d.etapa === 'revisao' ? `<select class="pc-sel" data-id="${p.id}" aria-label="Situação da peça ${esc(p.nome)}">${Object.entries(PECA_ST).map(([v, t]) => `<option value="${v}" ${v === p.status ? 'selected' : ''} ${v === 'nao_se_aplica' && !p.condicional ? 'disabled' : ''}>${t}</option>`).join('')}</select>`
        : `<span class="pill ${p.status === 'conferida' ? 'ok' : 'ant'}">${PECA_ST[p.status]}${p.conferido_por ? ' · ' + esc(p.conferido_por) : ''}</span>`}</li>`).join('')}</ul></section>` : '';
  const movs = S.ac.m.filter(m => m.demanda_id === d.id).filter(m => m.acao !== 'peca').slice(0, 30);
  const acoes = S.token && d.etapa !== 'disponibilizada' ? `<section class="card" style="box-shadow:none"><h3 style="margin-bottom:10px">Ações</h3>
      <label class="field" style="max-width:340px;margin-bottom:12px"><span>Quem está registrando</span>${respSelect('ac-por', porPadrao())}</label>
      ${d.etapa === 'elaboracao' ? `<label class="field" style="max-width:420px;margin-bottom:12px"><span>Etapa de elaboração (item da NPA)</span><select class="el-sel" data-id="${d.id}">${Object.entries(ELAB).map(([k2, t]) => `<option value="${k2}" ${k2 === (d.etapa_elab || '2.5.1') ? 'selected' : ''}>${k2} ${t}</option>`).join('')}</select></label>` : ''}
      <div class="actions">${prox ? `<button class="btn primary" data-act="mover" data-id="${d.id}" data-para="${prox[0]}">Avançar para ${prox[1]}</button>` : ''}${ant ? `<button class="btn" data-act="mover" data-id="${d.id}" data-para="${ant[0]}" data-volta="1">Devolver para ${ant[1]}</button>` : ''}
      <button class="btn" data-act="editar-dem" data-id="${d.id}">Editar dados</button><button class="btn ghost-danger" data-act="arq-dem" data-id="${d.id}">Arquivar</button></div></section>` : '';
  dlgShell(esc(d.escopo), `<div class="muted mono" style="font-size:.82rem;margin-bottom:4px">Demanda · ${esc(d.origem)}</div>`, `
    <div style="display:flex;gap:8px;flex-wrap:wrap;align-items:center"><span class="pill ${d.etapa === 'disponibilizada' ? 'ok' : 'rev'}">${ETN[d.etapa]}</span>${prioChip(d)}${ei ? `<span class="pill ${ei.cls || 'ant'}">${esc(ei.txt)}</span>` : ''}</div>
    <dl class="dl">
      ${dd('Demandante', esc(d.demandante))}${dd('Produto', d.produto ? esc(PRODUTOS[d.produto]) : '—')}
      ${dd('Autor', esc(d.autor || '—'))}${dd('Supervisor técnico', esc(d.supervisor || '—'))}
      ${dd('Dias úteis de elaboração', d.dias_elaboracao ? d.dias_elaboracao + ' (definidos pelos chefes da DE e da SDPO)' : '—')}${dd(mq.r.pend.length && d.etapa !== 'disponibilizada' ? 'Prazo do orçamento (previsto)' : 'Prazo do orçamento', `<b class="mono">${fmtD(d.prazo_orcamento)}</b> <span class="pill ${oc.cls}">${esc(oc.txt)}</span>`)}
      ${dd('Nível', esc(d.nivel || '—'))}${dd('Fim a que se destina', esc(d.fim || '—'))}${dd('Forma de execução', esc(d.execucao || '—'))}${dd('Regime', esc(d.regime || '—'))}${dd('Objeto', esc(d.tipo_objeto || '—'))}
      ${dd('Cadastrada em', fmtDT(d.criado_em) + ' por ' + esc(d.criado_por))}
      ${orc ? dd('Orçamento no controle de versões', `<button class="btn" data-act="detalhe" data-id="${orc.id}">${esc(orc.numero)} · ${ord(orc.num_revisao)}</button>`, true) : ''}
      ${d.atualizacao_de ? dd('Atualização do orçamento', byId(d.atualizacao_de) ? esc(byId(d.atualizacao_de).numero + ' · ' + byId(d.atualizacao_de).obra) : '—', true) : ''}
      ${dd('Condicionantes e limitantes', d.condicionantes ? esc(d.condicionantes).replace(/\n/g, '<br>') : '—', true)}
    </dl>${mqSec}${acoes}${pecas}
    <section><h3 style="margin-bottom:10px">Movimentações</h3>${movs.length ? `<ul class="logs">${movs.map(m => `<li><span><b>${esc(movTxt(m))}</b> · ${esc(m.por)}</span><time>${fmtDT(m.em)}</time>${m.motivo ? `<span>${esc(m.motivo)}</span>` : ''}</li>`).join('')}</ul>` : '<p class="muted">Sem movimentações.</p>'}</section>`);
}
const voltaDem = id => `<div><button class="btn" data-act="demanda" data-id="${id}">Voltar à demanda</button></div>`;
function openMover(id, para, volta) {
  const d = S.ac.d.find(x => x.id === id); if (!d) return;
  const orcs = S.items.filter(o => vigente(o));
  dlgShell(`${volta ? 'Devolver' : 'Avançar'} para ${ETN[para]}`, `<div class="muted" style="font-size:.82rem;margin-bottom:4px">${esc(d.escopo)}</div>`, `
    ${para === 'disponibilizada' ? '<div class="msg info">Antes de disponibilizar, registre o orçamento no controle de versões (menu Cadastrar ou revisão) e escolha-o abaixo.</div>' : ''}
    <form id="mover" data-id="${id}" data-para="${para}" class="form-grid" novalidate>
      ${para === 'disponibilizada' ? `<label class="field full"><span>Orçamento registrado</span><select id="m-orc" required><option value="">Selecione…</option>${orcs.map(o => `<option value="${o.id}">${esc(o.numero)} · ${esc(o.obra)} · ${ord(o.num_revisao)}</option>`).join('')}</select></label>` : ''}
      <label class="field full"><span>Motivo${volta ? '' : ' (opcional)'}</span><input id="m-motivo" maxlength="300" ${volta ? 'required' : ''} placeholder="${volta ? 'Ex.: correção de quantitativos apontada na revisão' : ''}"></label>
      <label class="field"><span>Quem está registrando</span>${respSelect('m-por', porPadrao())}</label>
      <div class="field"><span>&nbsp;</span><div class="actions"><button class="btn primary" type="submit">Confirmar</button><button class="btn" type="button" data-act="demanda" data-id="${id}">Cancelar</button></div></div><div class="full" id="m-msg"></div></form>`);
}
function openMqForm(id, mqId, receber) {
  const d = S.ac.d.find(x => x.id === id); if (!d) return;
  const q = mqId ? S.ac.q.find(x => x.id === mqId) : null;
  dlgShell(q ? (receber ? 'Registrar recebimento do MQ' : 'Editar MQ') : 'Adicionar MQ', `<div class="muted" style="font-size:.82rem;margin-bottom:4px">${esc(d.escopo)}</div>`, `<form id="mqf" data-id="${id}" data-mq="${mqId || ''}" class="form-grid" novalidate>
    <label class="field"><span>Disciplina</span><input id="q-disc" required maxlength="80" value="${esc(q ? q.disciplina : '')}" placeholder="Ex.: Arquitetura, Elétrica, Hidrossanitário"></label>
    <label class="field"><span>Prazo para o demandante entregar</span><input id="q-prazo" type="date" required value="${q ? q.prazo : ''}"></label>
    <label class="field"><span>Data em que o MQ foi recebido</span><input id="q-rec" type="date" max="${hoje()}" value="${q ? (q.recebido_em || (receber ? hoje() : '')) : ''}"><small>Deixe vazio enquanto não chegar.</small></label>
    <label class="field"><span>Quem está registrando</span>${respSelect('q-por', porPadrao())}</label>
    <div class="full actions"><button class="btn primary" type="submit">Salvar</button>${q ? `<button class="btn ghost-danger" type="button" data-act="mq-del" data-id="${id}" data-mq="${mqId}">Remover MQ</button>` : ''}<button class="btn" type="button" data-act="demanda" data-id="${id}">Cancelar</button></div><div class="full" id="q-msg"></div></form>`);
}
function openArqDem(id) {
  const d = S.ac.d.find(x => x.id === id); if (!d) return;
  dlgShell('Arquivar demanda', `<div class="muted" style="font-size:.82rem;margin-bottom:4px">${esc(d.escopo)}</div>`, `<div class="msg info">A demanda sai do acompanhamento, mas o histórico fica guardado no banco.</div>
    <form id="arqd" data-id="${id}" class="form-grid" novalidate><label class="field full"><span>Motivo</span><input id="ad-motivo" required maxlength="300"></label>
    <label class="field"><span>Quem está arquivando</span>${respSelect('ad-por', porPadrao())}</label>
    <div class="field"><span>&nbsp;</span><div class="actions"><button class="btn danger" type="submit">Arquivar</button><button class="btn" type="button" data-act="demanda" data-id="${id}">Cancelar</button></div></div><div class="full" id="ad-msg"></div></form>`);
}
const opcSel = (id, arr, cur, vazio = '—') => `<select id="${id}"><option value="">${vazio}</option>${arr.map(x => `<option ${x === cur ? 'selected' : ''}>${esc(x)}</option>`).join('')}</select>`;
function openDemForm(id) {
  const d = id ? S.ac.d.find(x => x.id === id) : null; if (id && !d) return;
  const x = d || { origem: 'Interna', prioridade: 'a definir', execucao: '' };
  const travado = d && ['revisao', 'conferencia', 'aprovacao'].includes(d.etapa);
  setTimeout(atualizaPrev, 0);
  dlgShell(d ? 'Editar demanda' : 'Nova demanda', '', `${ativos().length ? '' : '<div class="msg err">Cadastre os responsáveis em Administração antes de registrar demandas.</div>'}
    <form id="demf" data-dem="${id || ''}" class="form-grid" novalidate>
      <fieldset class="full prazos"><legend>Prazos</legend><div class="form-grid">
        <label class="field"><span>Dias úteis de elaboração do orçamento</span><input id="d-dias" type="number" min="1" max="365" inputmode="numeric" value="${x.dias_elaboracao || ''}" placeholder="Definido pelos chefes da DE e da SDPO"><small>A Revisão (5) e a Conferência (5) já são somadas pela NPA.</small></label>
        <div class="field"><span>Prazo do orçamento (calculado)</span><output id="d-prev" class="prev">—</output></div>
        ${d ? `<p class="muted full" style="font-size:.84rem">Os MQs (disciplinas, prazos e recebimentos) são gerenciados na própria demanda. ${mqsDe(d.id).length} cadastrado(s).</p>` : `<div class="full"><span class="lbl">Memoriais de Quantidades por disciplina (opcional agora; podem ser adicionados depois)</span><div id="mq-rows"></div><button type="button" class="btn" data-act="mq-row-add" style="margin-top:8px">+ Adicionar disciplina</button></div>`}</div></fieldset>
      <label class="field full"><span>Escopo da demanda</span><input id="d-escopo" required maxlength="200" value="${esc(x.escopo || '')}" placeholder="Ex.: Reforma da cobertura do hangar 2"></label>
      <div class="field"><span>Origem</span>${seg('origem', ['Interna', 'Externa'], x.origem)}</div>
      <label class="field"><span>Demandante</span><input id="d-dem" required maxlength="120" value="${esc(x.demandante || '')}"></label>
      <label class="field"><span>Prioridade</span><select id="d-prio">${PRIOS.map(p => `<option value="${p}" ${p === x.prioridade ? 'selected' : ''}>${p === 'a definir' ? 'A definir (Coordenador classifica)' : p}</option>`).join('')}</select><small>Considere urgência, importância, interferência na atividade fim ou meio, interesse externo e prazo.</small></label>
      ${d ? '<span></span>' : `<label class="field"><span>Atualização de orçamento já entregue?</span><select id="d-atu"><option value="">Não, demanda nova</option>${S.items.filter(o => vigente(o)).map(o => `<option value="${o.id}">Sim, atualiza o orçamento ${esc(o.numero)} · ${esc(o.obra)}</option>`).join('')}</select></label>`}
      <label class="field"><span>Nível do produto</span>${opcSel('d-nivel', NIVEIS, x.nivel)}</label>
      <label class="field"><span>Fim a que se destina</span>${opcSel('d-fim', FINS, x.fim)}</label>
      <div class="field"><span>Forma de execução</span>${seg('dexec', ['Direta', 'Indireta'], x.execucao || '')}</div>
      <label class="field"><span>Objeto</span>${opcSel('d-obj', OBJETOS, x.tipo_objeto)}</label>
      <label class="field"><span>Regime da empreitada</span>${opcSel('d-reg', REGIMES, x.regime)}</label>
      <label class="field"><span>Produto (define as peças do checklist)</span><select id="d-prod" ${travado ? 'disabled' : ''}><option value="">A definir</option>${Object.entries(PRODUTOS).map(([k2, t]) => `<option value="${k2}" ${k2 === x.produto ? 'selected' : ''}>${t}</option>`).join('')}</select><small>${travado ? 'Travado: as peças já foram definidas na revisão.' : 'Sugerido pelos campos acima; pode ser ajustado.'}</small></label>
      <label class="field"><span>Autor</span>${respSelect('d-autor', x.autor, true, true)}</label>
      <label class="field"><span>Supervisor técnico</span>${respSelect('d-sup', x.supervisor, true, true)}</label>
      <label class="field full"><span>Condicionantes e limitantes</span><textarea id="d-cond" maxlength="2000" placeholder="Premissas que impactam os parâmetros do orçamento">${esc(x.condicionantes || '')}</textarea></label>
      ${d ? '<label class="field full"><span>Motivo da alteração</span><input id="d-motivo" maxlength="300"></label>' : ''}
      <label class="field"><span>Quem está registrando</span>${respSelect('d-por-resp', porPadrao())}</label>
      <div class="field"><span>&nbsp;</span><div class="actions"><button class="btn primary" type="submit">${d ? 'Salvar alterações' : 'Salvar demanda'}</button><button class="btn" type="button" data-act="${d ? 'demanda' : 'fechar'}" data-id="${id || ''}">Cancelar</button></div></div><div class="full" id="d-msg"></div>
    </form>`);
}
const mqRowHTML = () => `<div class="mq-row"><input class="mq-d" maxlength="80" placeholder="Disciplina (ex.: Arquitetura)" aria-label="Disciplina"><input class="mq-p" type="date" aria-label="Prazo do MQ"><button type="button" class="btn ghost-danger" data-act="mq-row-del" aria-label="Remover disciplina">Remover</button></div>`;
function atualizaPrev() {
  const f = $('#demf'), o = $('#d-prev'); if (!f || !o) return;
  const id = f.dataset.dem, dias = Number($('#d-dias').value) || 0; let datas;
  if (id) datas = mqsDe(id).map(q => q.recebido_em || q.prazo); else datas = [...f.querySelectorAll('.mq-p')].map(i => i.value).filter(Boolean);
  if (!dias || !datas.length) { o.textContent = datas.length ? 'Informe os dias de elaboração' : id ? 'Cadastre os MQs na demanda' : 'Informe os dias e ao menos um MQ'; return; }
  const base = datas.sort().pop(); o.textContent = fmtD(somaDU(base, dias + 10, ferSet())) + ' (previsto)';
}
async function enviarDem(f) {
  const v = i => ($('#' + i, f)?.value ?? '').trim(), id = f.dataset.dem, msg = $('#d-msg', f);
  const err = [];
  if (v('d-escopo').length < 3) err.push('Descreva o escopo da demanda.');
  if (v('d-dem').length < 2) err.push('Informe o demandante.');
  const dias = v('d-dias') ? Number(v('d-dias')) : null; if (dias !== null && (!Number.isInteger(dias) || dias < 1 || dias > 365)) err.push('Dias de elaboração: informe um número inteiro entre 1 e 365.');
  const mqs = [...f.querySelectorAll('.mq-row')].map(r => ({ disciplina: $('.mq-d', r).value.trim(), prazo: $('.mq-p', r).value })).filter(m => m.disciplina || m.prazo);
  if (mqs.some(m => m.disciplina.length < 2 || !m.prazo)) err.push('Cada MQ precisa de disciplina e prazo.');
  if (new Set(mqs.map(m => m.disciplina.toLowerCase())).size < mqs.length) err.push('Há disciplinas repetidas nos MQs.');
  if (!v('d-por-resp')) err.push('Escolha quem está registrando.');
  if (err.length) { msg.innerHTML = `<div class="msg err">${esc(err.join(' '))}</div>`; return; }
  msg.innerHTML = ''; const btn = $('button[type=submit]', f); btn.disabled = true; loc.set('nomeAdmin', v('d-por-resp'));
  const base = { p_token: S.token, p_escopo: v('d-escopo'), p_origem: (f.querySelector('input[name="origem"]:checked') || {}).value, p_demandante: v('d-dem'), p_prioridade: v('d-prio'),
    p_produto: $('#d-prod', f).disabled ? (S.ac.d.find(x => x.id === id) || {}).produto || '' : v('d-prod'), p_nivel: v('d-nivel'), p_fim: v('d-fim'), p_execucao: (f.querySelector('input[name="dexec"]:checked') || {}).value || '',
    p_tipo_objeto: v('d-obj'), p_regime: v('d-reg'), p_autor: v('d-autor'), p_supervisor: v('d-sup'), p_condicionantes: v('d-cond'), p_dias_elaboracao: dias, p_por: v('d-por-resp') };
  try {
    let d;
    if (id) d = await rpc('admin_editar_demanda', { ...base, p_id: id, p_motivo: v('d-motivo') });
    else d = await rpc('admin_criar_demanda', { ...base, p_mqs: mqs, p_atualizacao_de: v('d-atu') || null });
    await acRefresh(); toast(id ? 'Demanda atualizada.' : 'Demanda cadastrada.'); openDemanda(d.id);
  } catch (e) {
    if (e.code === 'nao_autorizado') { setToken(null); dlg().close(); render(); toast('Sessão expirada. Entre novamente com a senha.'); }
    else msg.innerHTML = `<div class="msg err">${esc(e.message)}</div>`;
  } finally { btn.disabled = false; }
}
/* ação rápida dentro do detalhe (peça, etapa de elaboração, avanço) — usa o campo "Quem está registrando" */
function acaoRapida(id, nome, args, ok) {
  const por = ($('#ac-por') || {}).value; if (!por) { toast('Escolha, em Ações, quem está registrando.'); return false; }
  loc.set('nomeAdmin', por);
  guard(async () => { try { await rpc(nome, { p_token: S.token, ...args, p_por: por }); await acRefresh(); if (ok) toast(ok); } catch (e) { if (e.code === 'nao_autorizado') throw e; toast(e.message); await acRefresh(); } openDemanda(id); });
  return true;
}
function diaSemana(iso) { return ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'][new Date(iso + 'T12:00:00Z').getUTCDay()]; }
function renderFeriados() {
  const box = $('#fer-card'); if (!box) return;
  const fs = S.ac.f, ano = hoje().slice(0, 4);
  box.innerHTML = `<h2>Feriados e pontos facultativos</h2>
    <p class="muted" style="font-size:.88rem;margin-top:6px">Os prazos de Revisão e Conferência (5 ou 3 dias úteis) não contam sábados, domingos nem as datas abaixo.</p>
    ${S.ac.erro ? `<div class="msg err" style="margin-top:12px">${esc(S.ac.erro)}</div>` : `
    <form id="addfer" class="actions" novalidate style="margin-top:12px"><label class="sr" for="fer-data">Data</label><input id="fer-data" type="date" required style="width:auto"><label class="sr" for="fer-nome">Nome</label><input id="fer-nome" placeholder="Nome do feriado" maxlength="100" required style="flex:1;min-width:180px;width:auto"><button class="btn primary" type="submit">Adicionar</button></form>
    <div class="actions" style="margin-top:10px"><button class="btn" data-act="fer-nac" data-ano="${ano}">Adicionar feriados nacionais de ${ano}</button><button class="btn" data-act="fer-nac" data-ano="${Number(ano) + 1}">Adicionar feriados nacionais de ${Number(ano) + 1}</button></div>
    <div id="fer-msg" style="margin-top:10px"></div>
    <div class="list" style="margin-top:12px">${fs.length ? fs.map(f => `<div class="fer-row"><span><b class="mono">${fmtD(f.data)}</b> <small class="muted">${diaSemana(f.data)}</small> · ${esc(f.nome)}</span><button class="btn ghost-danger" data-act="del-fer" data-id="${f.data}">Remover</button></div>`).join('') : '<div class="empty"><b>Nenhum feriado cadastrado</b>Sem eles, só sábados e domingos ficam de fora da contagem.</div>'}</div>`}`;
}
function feriadosNacionais(ano) {
  const a = ano % 19, b = Math.floor(ano / 100), c = ano % 100, d = Math.floor(b / 4), e = b % 4, g = Math.floor((8 * b + 13) / 25), h = (19 * a + b - d - g + 15) % 30, i = Math.floor(c / 4), k = c % 4;
  const l = (32 + 2 * e + 2 * i - h - k) % 7, m = Math.floor((a + 11 * h + 22 * l) / 451), mes = Math.floor((h + l - 7 * m + 114) / 31), dia = ((h + l - 7 * m + 114) % 31) + 1;
  const pascoa = `${ano}-${pad2(mes)}-${pad2(dia)}`, f = (md, nome) => [`${ano}-${md}`, nome];
  return [f('01-01', 'Confraternização Universal'), [addD(pascoa, -48), 'Carnaval (segunda-feira)'], [addD(pascoa, -47), 'Carnaval (terça-feira)'], [addD(pascoa, -2), 'Sexta-feira Santa'], f('04-21', 'Tiradentes'), f('05-01', 'Dia do Trabalho'),
    [addD(pascoa, 60), 'Corpus Christi'], f('09-07', 'Independência do Brasil'), f('10-12', 'Nossa Senhora Aparecida'), f('11-02', 'Finados'), f('11-15', 'Proclamação da República'), f('11-20', 'Consciência Negra'), f('12-25', 'Natal')];
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
  else if (act === 'demanda') openDemanda(id);
  else if (act === 'ac-view') { S.acv = b.value; renderAc(); }
  else if (act === 'nova-dem') openDemForm();
  else if (act === 'editar-dem') openDemForm(id);
  else if (act === 'mq') openMqForm(id, b.dataset.mq, !!b.dataset.rec);
  else if (act === 'mq-row-add') { $('#mq-rows').insertAdjacentHTML('beforeend', mqRowHTML()); $('#mq-rows .mq-row:last-child .mq-d').focus(); atualizaPrev(); }
  else if (act === 'mq-row-del') { b.closest('.mq-row').remove(); atualizaPrev(); }
  else if (act === 'arq-dem') openArqDem(id);
  else if (act === 'mover') { const para = b.dataset.para; if (b.dataset.volta || para === 'disponibilizada') openMover(id, para, !!b.dataset.volta); else acaoRapida(id, 'admin_mover_demanda', { p_id: id, p_para: para }, 'Demanda movida para ' + ETN[para] + '.'); }
  else if (act === 'mq-del') { const por = ($('#q-por') || {}).value; if (!por) { toast('Escolha quem está registrando.'); return; } guard(async () => { try { await rpc('admin_mq_remover', { p_token: S.token, p_mq_id: b.dataset.mq, p_por: por }); await acRefresh(); toast('MQ removido.'); openDemanda(id); } catch (er) { if (er.code === 'nao_autorizado') throw er; toast(er.message); } }); }
  else if (act === 'del-fer') guard(async () => { await rpc('admin_feriado_remover', { p_token: S.token, p_data: id }); await acRefresh(); toast('Feriado removido.'); });
  else if (act === 'fer-nac') guard(async () => { for (const [dt, n] of feriadosNacionais(Number(b.dataset.ano))) if (!S.ac.f.some(x => x.data === dt)) await rpc('admin_feriado_salvar', { p_token: S.token, p_data: dt, p_nome: n }); await acRefresh(); toast('Feriados nacionais adicionados.'); });
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
  else if (id.startsWith('acf-')) { S.acf[id.slice(4)] = t.value; renderAc(); }
  else if (t.closest && t.closest('#demf')) atualizaPrev();
  else if (id === 'hq') { S.h.q = t.value; renderHist(); }
  else if (id === 'hrev') { S.h.soRev = t.checked; renderHist(); }
});
document.addEventListener('change', e => {
  const t = e.target;
  if (t.classList.contains('pc-sel')) { const p = S.ac.p.find(x => x.id === t.dataset.id); if (p && !acaoRapida(p.demanda_id, 'admin_peca_status', { p_peca_id: p.id, p_status: t.value })) openDemanda(p.demanda_id); }
  else if (t.classList.contains('el-sel')) { if (!acaoRapida(t.dataset.id, 'admin_demanda_etapa_elab', { p_id: t.dataset.id, p_etapa: t.value })) openDemanda(t.dataset.id); }
  else if (t.closest && t.closest('#demf') && (['d-nivel', 'd-fim', 'd-obj'].includes(t.id) || t.name === 'dexec')) {
    const f = t.closest('#demf'), pr = $('#d-prod', f); if (pr.disabled) return;
    const x = produtoDe($('#d-nivel', f).value, $('#d-fim', f).value, (f.querySelector('input[name="dexec"]:checked') || {}).value, $('#d-obj', f).value); if (x) pr.value = x;
  }
});
document.addEventListener('focusout', e => { if (e.target.id === 'f-valor') { const n = parseBRL(e.target.value); if (!Number.isNaN(n) && e.target.value.trim()) e.target.value = money2(n); } });
document.addEventListener('toggle', e => {
  const d = e.target; if (!d.classList || !d.classList.contains('chain')) return;
  d.open ? S.open.add(d.dataset.raiz) : S.open.delete(d.dataset.raiz);
}, true);
document.addEventListener('submit', async e => {
  const f = e.target; e.preventDefault();
  if (f.id === 'demf') enviarDem(f);
  else if (f.id === 'mover') {
    const msg = $('#m-msg'), por = $('#m-por').value, motivo = $('#m-motivo').value.trim(), orc = ($('#m-orc') || {}).value || null, para = f.dataset.para;
    if (!por) { msg.innerHTML = '<div class="msg err">Escolha quem está registrando.</div>'; return; }
    if ($('#m-motivo').required && motivo.length < 3) { msg.innerHTML = '<div class="msg err">Informe o motivo da devolução.</div>'; return; }
    if (para === 'disponibilizada' && !orc) { msg.innerHTML = '<div class="msg err">Escolha o orçamento registrado.</div>'; return; }
    loc.set('nomeAdmin', por);
    guard(async () => { try { await rpc('admin_mover_demanda', { p_token: S.token, p_id: f.dataset.id, p_para: para, p_por: por, p_motivo: motivo || null, p_orcamento_id: orc }); await acRefresh(); toast('Demanda movida para ' + ETN[para] + '.'); openDemanda(f.dataset.id); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; } });
  } else if (f.id === 'mqf') {
    const msg = $('#q-msg'), por = $('#q-por').value, disc = $('#q-disc').value.trim(), prazo = $('#q-prazo').value;
    if (disc.length < 2 || !prazo) { msg.innerHTML = '<div class="msg err">Informe a disciplina e o prazo.</div>'; return; } if (!por) { msg.innerHTML = '<div class="msg err">Escolha quem está registrando.</div>'; return; } loc.set('nomeAdmin', por);
    guard(async () => { try { await rpc('admin_mq_salvar', { p_token: S.token, p_demanda_id: f.dataset.id, p_mq_id: f.dataset.mq || null, p_disciplina: disc, p_prazo: prazo, p_recebido_em: $('#q-rec').value || null, p_por: por }); await acRefresh(); toast('MQ salvo.'); openDemanda(f.dataset.id); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; } });
  } else if (f.id === 'arqd') {
    const msg = $('#ad-msg'), por = $('#ad-por').value, motivo = $('#ad-motivo').value.trim(); if (!por || motivo.length < 3) { msg.innerHTML = '<div class="msg err">Informe o motivo e quem está arquivando.</div>'; return; } loc.set('nomeAdmin', por);
    guard(async () => { try { await rpc('admin_arquivar_demanda', { p_token: S.token, p_id: f.dataset.id, p_motivo: motivo, p_por: por }); await acRefresh(); dlg().close(); toast('Demanda arquivada.'); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; } });
  } else if (f.id === 'addfer') {
    const msg = $('#fer-msg');
    guard(async () => { try { await rpc('admin_feriado_salvar', { p_token: S.token, p_data: $('#fer-data').value, p_nome: $('#fer-nome').value }); f.reset(); await acRefresh(); toast('Feriado salvo.'); }
      catch (er) { if (er.code === 'nao_autorizado') throw er; msg.innerHTML = `<div class="msg err">${esc(er.message)}</div>`; } });
  } else if (f.dataset.mode) enviarForm(f);
  else if (f.id === 'gate') {
    const msg = $('#gate-msg'), btn = $('button', f), senha = $('#csenha').value; btn.disabled = true; msg.innerHTML = '';
    try {
      const d = await Remote.entrar(senha);
      if (d === null) msg.innerHTML = '<div class="msg err">Senha de consulta incorreta.</div>';
      else { S.cs = senha; ses.set('cs', senha); S.sig = ''; S.resp = d.responsaveis; aplicar(d.orcamentos); S.loaded = true; S.loadError = ''; route(); carregarAc().catch(() => {}); }
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
