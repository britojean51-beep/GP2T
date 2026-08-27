// ============================================================================
// views/lancamentos.js — Tela principal: Lançamento Diário.
// Cálculo automático de Horas/L-h/L-Ton em tempo real (preview local — o
// backend recalcula e é sempre a fonte da verdade). Funciona offline: se não
// há conexão, o lançamento entra na fila local e sincroniza sozinho depois.
// ============================================================================
import { api, ApiError } from '../api.js';
import { getUsuario } from '../auth.js';
import * as db from '../db.js';
import { processarFila, aoMudarSync } from '../sync.js';
import { esc, options, toast, confirmar, badgeSync } from '../ui.js';
import { fmt, hoje, dataBR, num } from '../format.js';

function cacheGetList(key) {
  try { return JSON.parse(localStorage.getItem(`gp2t_cache_${key}`) || '[]'); } catch { return []; }
}
function cacheSetList(key, list) {
  localStorage.setItem(`gp2t_cache_${key}`, JSON.stringify(list));
}

export async function render() {
  const usuario = getUsuario();

  let equipamentos = [];
  let operadores = [];
  try {
    equipamentos = await api.get('/equipamentos?status=Operando');
    cacheSetList('equipamentos', equipamentos);
  } catch {
    equipamentos = cacheGetList('equipamentos');
  }
  try {
    operadores = await api.get('/operadores?status=Ativo');
    cacheSetList('operadores', operadores);
  } catch {
    operadores = cacheGetList('operadores');
  }

  const optEquip = '<option value="">Selecione…</option>' + options(equipamentos, '', (e) => ({ v: e.id, t: `${e.codigo} — ${e.tipo}` }));
  const optOper = '<option value="">Selecione…</option>' + options(operadores, '', (o) => ({ v: o.id, t: o.nome }));

  const html = `
    <div class="page-head">
      <h1>📝 Lançamento Diário</h1>
      <p class="sub">Data já preenchida — selecione, informe os números e confirme.</p>
    </div>

    <form id="form-lanc" class="card form-lanc">
      <label>Data *<input type="date" name="data" required value="${hoje()}"></label>
      <label>Equipamento *<select name="equipamentoId" required>${optEquip}</select></label>
      <label>Operador *<select name="operadorId" required>${optOper}</select></label>

      <label>Horímetro inicial *<input type="number" step="0.1" min="0" name="horimetroInicial" required inputmode="decimal"></label>
      <label>Horímetro final *<input type="number" step="0.1" min="0" name="horimetroFinal" required inputmode="decimal"></label>
      <label class="campo-auto">Horas<input type="text" name="horasPreview" readonly tabindex="-1" value="0,00"></label>

      <label>Diesel — Litros *<input type="number" step="0.1" min="0" name="litros" required inputmode="decimal"></label>
      <label>Produção — Toneladas *<input type="number" step="0.1" min="0" name="toneladas" required inputmode="decimal"></label>

      <label class="campo-auto">L/h<input type="text" name="lhPreview" readonly tabindex="-1" value="0,00"></label>
      <label class="campo-auto">L/Ton<input type="text" name="ltonPreview" readonly tabindex="-1" value="0,000"></label>

      <div id="lanc-avisos"></div>
      <button type="submit" class="btn btn--primary btn--grande">💾 SALVAR LANÇAMENTO</button>
    </form>

    ${equipamentos.length === 0 ? '<p class="aviso aviso--warn">Nenhum equipamento "Operando" disponível — cadastre ou verifique o status em 🚛 Equipamentos.</p>' : ''}
    ${operadores.length === 0 ? '<p class="aviso aviso--warn">Nenhum operador "Ativo" disponível — cadastre ou verifique o status em 👷 Operadores.</p>' : ''}

    <div class="card">
      <div class="card__head">
        <h2>Lançamentos recentes</h2>
      </div>
      <div class="filtros">
        <label>Data <input type="date" id="f-data" value="${hoje()}"></label>
        <label>Equipamento <select id="f-equip"><option value="">Todos</option>${options(equipamentos, '', (e) => ({ v: e.id, t: e.codigo }))}</select></label>
        <label>Operador <select id="f-oper"><option value="">Todos</option>${options(operadores, '', (o) => ({ v: o.id, t: o.nome }))}</select></label>
        <button class="btn btn--ghost" id="f-limpar">Limpar filtro</button>
      </div>
      <div id="lista-lancamentos" class="lista-lancamentos"></div>
    </div>
  `;

  return { html, montar: (root) => montar(root, { equipamentos, operadores, usuario }) };
}

async function carregarLista(root, ctx, filtros = {}) {
  const alvo = root.querySelector('#lista-lancamentos');
  alvo.innerHTML = '<p class="muted">Carregando…</p>';

  const mapaEq = Object.fromEntries(ctx.equipamentos.map((e) => [e.id, e]));
  const mapaOp = Object.fromEntries(ctx.operadores.map((o) => [o.id, o]));

  let servidor = [];
  let offlineAgora = false;
  try {
    const qs = new URLSearchParams();
    if (filtros.data) qs.set('data', filtros.data);
    if (filtros.equipamentoId) qs.set('equipamentoId', filtros.equipamentoId);
    if (filtros.operadorId) qs.set('operadorId', filtros.operadorId);
    qs.set('limit', '100');
    servidor = await api.get(`/lancamentos?${qs.toString()}`);
  } catch (e) {
    offlineAgora = true;
  }

  const pendentes = await db.getAllPendentes();
  const pendentesRelevantes = pendentes.filter((p) => {
    if (filtros.data && p.payload.data !== filtros.data) return false;
    if (filtros.equipamentoId && p.payload.equipamentoId !== filtros.equipamentoId) return false;
    if (filtros.operadorId && p.payload.operadorId !== filtros.operadorId) return false;
    return true;
  });

  const idsExcluidos = new Set(pendentesRelevantes.filter((p) => p.tipo === 'excluir').map((p) => p.lancamentoId));
  const idsSobrescritos = new Set(pendentesRelevantes.filter((p) => p.tipo !== 'excluir').map((p) => p.lancamentoId));

  const linhasServidor = servidor.filter((l) => !idsExcluidos.has(l.id) && !idsSobrescritos.has(l.id));
  const linhasPendentes = pendentesRelevantes
    .filter((p) => p.tipo !== 'excluir')
    .map((p) => ({
      id: p.lancamentoId,
      data: p.payload.data,
      equipamentoId: p.payload.equipamentoId,
      operadorId: p.payload.operadorId,
      horimetroInicial: num(p.payload.horimetroInicial),
      horimetroFinal: num(p.payload.horimetroFinal),
      horas: num(p.payload.horimetroFinal) - num(p.payload.horimetroInicial),
      litros: num(p.payload.litros),
      toneladas: num(p.payload.toneladas),
      lh: (num(p.payload.horimetroFinal) - num(p.payload.horimetroInicial)) > 0 ? num(p.payload.litros) / (num(p.payload.horimetroFinal) - num(p.payload.horimetroInicial)) : 0,
      lton: num(p.payload.toneladas) > 0 ? num(p.payload.litros) / num(p.payload.toneladas) : 0,
      _pendente: p,
    }));

  const todas = [...linhasPendentes, ...linhasServidor].sort((a, b) => (a.data < b.data ? 1 : -1));

  if (offlineAgora && !todas.length) {
    alvo.innerHTML = '<p class="aviso aviso--warn">Sem conexão e nada em cache para este filtro ainda.</p>';
    return;
  }
  if (!todas.length) {
    alvo.innerHTML = '<p class="muted">Nenhum lançamento encontrado.</p>';
    return;
  }

  alvo.innerHTML = todas.map((l) => {
    const eq = mapaEq[l.equipamentoId];
    const op = mapaOp[l.operadorId];
    const statusChip = l._pendente ? badgeSync(l._pendente.status) : '';
    const podeEditar = ctx.usuario.perfil === 'ADMINISTRADOR' || ctx.usuario.perfil === 'OPERACIONAL';
    return `
      <div class="lanc-item">
        <div class="lanc-item__topo">
          <strong>${esc(eq?.codigo || l.equipamentoId)}</strong> — ${esc(op?.nome || l.operadorId)}
          ${statusChip}
        </div>
        <div class="lanc-item__meta">${dataBR(l.data)}</div>
        <div class="lanc-item__nums">
          ${fmt.n1(l.horas)} h · ${fmt.n1(l.litros)} L · ${fmt.n1(l.toneladas)} t · ${fmt.n2(l.lh)} L/h · ${fmt.n3(l.lton)} L/Ton
        </div>
        ${podeEditar ? `
        <div class="lanc-item__acoes">
          <button class="btn-icon" data-editar="${l.id}" title="Editar">✏️ Editar</button>
          <button class="btn-icon" data-excluir="${l.id}" title="Excluir">🗑️ Excluir</button>
        </div>` : ''}
      </div>`;
  }).join('');

  root.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => {
      const item = todas.find((x) => x.id === b.dataset.editar);
      abrirEdicao(root, ctx, item);
    };
  });
  root.querySelectorAll('[data-excluir]').forEach((b) => {
    b.onclick = () => excluirLancamento(root, ctx, b.dataset.excluir, filtros);
  });
}

function calcularPreview(form) {
  const hi = num(form.horimetroInicial.value);
  const hf = num(form.horimetroFinal.value);
  const lt = num(form.litros.value);
  const tn = num(form.toneladas.value);
  const horas = !isNaN(hi) && !isNaN(hf) ? Math.max(hf - hi, 0) : 0;
  form.horasPreview.value = fmt.n2(horas) + (hf < hi && !isNaN(hf) && !isNaN(hi) ? ' ⚠️' : '');
  form.lhPreview.value = horas > 0 && !isNaN(lt) ? fmt.n2(lt / horas) : '0,00';
  form.ltonPreview.value = tn > 0 && !isNaN(lt) ? fmt.n3(lt / tn) : '0,000';
}

function montar(root, ctx) {
  const form = root.querySelector('#form-lanc');
  const avisos = root.querySelector('#lanc-avisos');

  ['horimetroInicial', 'horimetroFinal', 'litros', 'toneladas'].forEach((n) =>
    form[n].addEventListener('input', () => calcularPreview(form))
  );

  form.addEventListener('submit', (e) => {
    e.preventDefault();
    submeterNovo(root, ctx, form, avisos);
  });

  const filtrar = () => carregarLista(root, ctx, {
    data: root.querySelector('#f-data').value,
    equipamentoId: root.querySelector('#f-equip').value,
    operadorId: root.querySelector('#f-oper').value,
  });
  root.querySelector('#f-data').addEventListener('change', filtrar);
  root.querySelector('#f-equip').addEventListener('change', filtrar);
  root.querySelector('#f-oper').addEventListener('change', filtrar);
  root.querySelector('#f-limpar').addEventListener('click', () => {
    root.querySelector('#f-data').value = '';
    root.querySelector('#f-equip').value = '';
    root.querySelector('#f-oper').value = '';
    filtrar();
  });

  aoMudarSync(() => filtrar());
  filtrar();
}

function validarLocal(dados) {
  const erros = [];
  if (!dados.data) erros.push('Informe a data.');
  if (!dados.equipamentoId) erros.push('Selecione o equipamento.');
  if (!dados.operadorId) erros.push('Selecione o operador.');
  const hi = num(dados.horimetroInicial), hf = num(dados.horimetroFinal), lt = num(dados.litros), tn = num(dados.toneladas);
  if (isNaN(hi)) erros.push('Informe o horímetro inicial.');
  if (isNaN(hf)) erros.push('Informe o horímetro final.');
  if (isNaN(lt)) erros.push('Informe o diesel (litros).');
  if (isNaN(tn)) erros.push('Informe a produção (toneladas).');
  if (!erros.length) {
    if (hf < hi) erros.push('⚠️ Horímetro final deve ser maior que o inicial.');
    if (lt < 0) erros.push('Litros não podem ser negativos.');
    if (tn < 0) erros.push('Toneladas não podem ser negativas.');
    if (hf - hi <= 0) erros.push('Horas devem ser maiores que zero.');
  }
  return erros;
}

async function submeterNovo(root, ctx, form, avisos, idExistente, autorizacaoAdmin) {
  const dados = {
    data: form.data.value,
    equipamentoId: form.equipamentoId.value,
    operadorId: form.operadorId.value,
    horimetroInicial: form.horimetroInicial.value,
    horimetroFinal: form.horimetroFinal.value,
    litros: form.litros.value,
    toneladas: form.toneladas.value,
  };
  const erros = validarLocal(dados);
  if (erros.length) {
    avisos.innerHTML = `<div class="aviso aviso--erro"><ul>${erros.map((e) => `<li>${esc(e)}</li>`).join('')}</ul></div>`;
    toast('Corrija os campos destacados.', 'erro');
    return;
  }
  avisos.innerHTML = '';

  const id = idExistente || crypto.randomUUID();
  const payload = { ...dados, autorizacaoAdmin: !!autorizacaoAdmin };

  if (!navigator.onLine) {
    await db.enqueue({ tipo: idExistente ? 'editar' : 'criar', lancamentoId: id, payload });
    toast('Sem conexão — lançamento salvo localmente e será sincronizado automaticamente.', 'ok');
    resetForm(form);
    return carregarLista(root, ctx, filtrosAtuais(root));
  }

  try {
    if (idExistente) {
      await api.put(`/lancamentos/${id}`, payload);
    } else {
      await api.post('/lancamentos', { ...payload, id });
    }
    toast('✅ Lançamento salvo com sucesso!', 'ok');
    resetForm(form);
    processarFila();
    return carregarLista(root, ctx, filtrosAtuais(root));
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      await db.enqueue({ tipo: idExistente ? 'editar' : 'criar', lancamentoId: id, payload });
      toast('Sem conexão — lançamento salvo localmente e será sincronizado automaticamente.', 'ok');
      resetForm(form);
      return carregarLista(root, ctx, filtrosAtuais(root));
    }
    if (e instanceof ApiError && e.code === 'HORIMETRO_INFERIOR') {
      if (ctx.usuario.perfil === 'ADMINISTRADOR') {
        const ok = await confirmar('⚠️ Atenção — horímetro menor que o último registro', `${e.message}\n\nComo Administrador, você pode autorizar este lançamento mesmo assim. Confirmar?`, 'Autorizar e salvar');
        if (ok) return submeterNovo(root, ctx, form, avisos, idExistente, true);
        return;
      }
      avisos.innerHTML = `<div class="aviso aviso--erro">${esc(e.message)} Peça a um Administrador para autorizar este lançamento.</div>`;
      toast('Horímetro menor que o último registro — requer autorização.', 'erro');
      return;
    }
    avisos.innerHTML = `<div class="aviso aviso--erro">${esc(e.message)}</div>`;
    toast(e.message || 'Erro ao salvar.', 'erro');
  }
}

function filtrosAtuais(root) {
  return {
    data: root.querySelector('#f-data').value,
    equipamentoId: root.querySelector('#f-equip').value,
    operadorId: root.querySelector('#f-oper').value,
  };
}

function resetForm(form) {
  const dataAtual = form.data.value;
  form.reset();
  form.data.value = dataAtual;
  calcularPreview(form);
}

async function abrirEdicao(root, ctx, item) {
  const equipOpts = options(ctx.equipamentos, item.equipamentoId, (e) => ({ v: e.id, t: e.codigo }));
  const operOpts = options(ctx.operadores, item.operadorId, (o) => ({ v: o.id, t: o.nome }));
  const { modal, lerForm } = await import('../ui.js');
  const ok = await modal({
    titulo: 'Editar lançamento',
    corpoHTML: `
      <form class="form-grid">
        <label>Data *<input type="date" name="data" required value="${item.data}"></label>
        <label>Equipamento *<select name="equipamentoId" required>${equipOpts}</select></label>
        <label>Operador *<select name="operadorId" required>${operOpts}</select></label>
        <label>Horímetro inicial *<input type="number" step="0.1" min="0" name="horimetroInicial" required value="${item.horimetroInicial}"></label>
        <label>Horímetro final *<input type="number" step="0.1" min="0" name="horimetroFinal" required value="${item.horimetroFinal}"></label>
        <label>Diesel — Litros *<input type="number" step="0.1" min="0" name="litros" required value="${item.litros}"></label>
        <label>Produção — Toneladas *<input type="number" step="0.1" min="0" name="toneladas" required value="${item.toneladas}"></label>
      </form>`,
    okLabel: 'Salvar edição',
  });
  if (!ok) return;
  const form = document.querySelector('.modal form');
  const dados = lerForm(form);
  const erros = validarLocal(dados);
  if (erros.length) { toast(erros[0], 'erro'); return; }

  const payload = { ...dados, autorizacaoAdmin: false };
  if (!navigator.onLine) {
    await db.enqueue({ tipo: 'editar', lancamentoId: item.id, payload });
    toast('Sem conexão — edição salva localmente.', 'ok');
    return carregarLista(root, ctx, filtrosAtuais(root));
  }
  try {
    await api.put(`/lancamentos/${item.id}`, payload);
    toast('Lançamento atualizado.', 'ok');
    return carregarLista(root, ctx, filtrosAtuais(root));
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      await db.enqueue({ tipo: 'editar', lancamentoId: item.id, payload });
      toast('Sem conexão — edição salva localmente.', 'ok');
      return carregarLista(root, ctx, filtrosAtuais(root));
    }
    if (e instanceof ApiError && e.code === 'HORIMETRO_INFERIOR' && ctx.usuario.perfil === 'ADMINISTRADOR') {
      const confirmarOverride = await confirmar('⚠️ Horímetro menor que o último registro', `${e.message}\n\nAutorizar mesmo assim?`, 'Autorizar e salvar');
      if (confirmarOverride) {
        await api.put(`/lancamentos/${item.id}`, { ...payload, autorizacaoAdmin: true });
        toast('Lançamento atualizado.', 'ok');
        return carregarLista(root, ctx, filtrosAtuais(root));
      }
      return;
    }
    toast(e.message || 'Erro ao editar.', 'erro');
  }
}

async function excluirLancamento(root, ctx, id, filtros) {
  const ok = await confirmar(
    '⚠️ EXCLUIR LANÇAMENTO?',
    'Esta ação também removerá o registro da planilha e fará com que ele deixe de ser considerado nos resumos e históricos.',
    'Excluir'
  );
  if (!ok) return;

  if (!navigator.onLine) {
    await db.enqueue({ tipo: 'excluir', lancamentoId: id, payload: {} });
    toast('Sem conexão — exclusão será sincronizada automaticamente.', 'ok');
    return carregarLista(root, ctx, filtros);
  }
  try {
    await api.del(`/lancamentos/${id}`);
    toast('Lançamento excluído.', 'ok');
  } catch (e) {
    if (e instanceof ApiError && e.offline) {
      await db.enqueue({ tipo: 'excluir', lancamentoId: id, payload: {} });
      toast('Sem conexão — exclusão será sincronizada automaticamente.', 'ok');
    } else {
      toast(e.message || 'Erro ao excluir.', 'erro');
    }
  }
  carregarLista(root, ctx, filtros);
}
