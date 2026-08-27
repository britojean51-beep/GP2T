// ============================================================================
// views/operadores.js — Cadastro de operadores (Nome, Função, Status).
// ============================================================================
import { api, ApiError } from '../api.js';
import { esc, options, toast, confirmar, badgeStatus, modal, lerForm } from '../ui.js';

export async function render() {
  const [operadores, config] = await Promise.all([
    api.get('/operadores'),
    api.get('/config').catch(() => ({ funcoes: [] })),
  ]);

  const html = `
    <div class="page-head">
      <h1>👷 Operadores</h1>
      <button class="btn btn--primary" id="btn-novo">➕ Novo operador</button>
    </div>
    <div class="card">
      <div id="lista-operadores"></div>
    </div>
  `;

  return { html, montar: (root) => montar(root, operadores, config.funcoes || []) };
}

function listaHTML(operadores) {
  if (!operadores.length) return '<p class="muted">Nenhum operador cadastrado ainda.</p>';
  return operadores.map((o) => `
    <div class="reg-item">
      <div class="reg-item__info">
        <strong>${esc(o.nome)}</strong>
        <span class="muted">${esc(o.funcao)}</span>
      </div>
      ${badgeStatus(o.status)}
      <div class="reg-item__acoes">
        <button class="btn-icon" data-editar="${o.id}">✏️ Editar</button>
        ${o.status === 'Ativo' ? `<button class="btn-icon" data-inativar="${o.id}">⛔ Inativar</button>` : ''}
      </div>
    </div>`).join('');
}

function montar(root, operadoresIniciais, funcoes) {
  let operadores = operadoresIniciais;
  const alvo = root.querySelector('#lista-operadores');
  alvo.innerHTML = listaHTML(operadores);
  ligarBotoes(root, alvo, operadores, funcoes, recarregar);

  async function recarregar() {
    operadores = await api.get('/operadores');
    alvo.innerHTML = listaHTML(operadores);
    ligarBotoes(root, alvo, operadores, funcoes, recarregar);
  }

  root.querySelector('#btn-novo').onclick = () => abrirForm(null, operadores, funcoes, recarregar);
}

function ligarBotoes(root, alvo, operadores, funcoes, recarregar) {
  alvo.querySelectorAll('[data-editar]').forEach((b) => {
    b.onclick = () => abrirForm(operadores.find((o) => o.id === b.dataset.editar), operadores, funcoes, recarregar);
  });
  alvo.querySelectorAll('[data-inativar]').forEach((b) => {
    b.onclick = () => inativar(b.dataset.inativar, recarregar);
  });
}

function selectFuncao(funcoes, atual) {
  const opts = funcoes.map((f) => `<option value="${esc(f)}" ${f === atual ? 'selected' : ''}>${esc(f)}</option>`).join('');
  return `<select name="funcao" required>
    <option value="">Selecione…</option>
    ${opts}
    <option value="Outros" ${atual && !funcoes.includes(atual) ? 'selected' : ''}>Outros…</option>
  </select>
  <input name="funcaoOutros" placeholder="Digite a função" style="margin-top:8px;display:${atual && !funcoes.includes(atual) ? 'block' : 'none'}" value="${atual && !funcoes.includes(atual) ? esc(atual) : ''}">`;
}

async function abrirForm(operador, operadores, funcoes, recarregar) {
  const ok = await modal({
    titulo: operador ? `Editar ${operador.nome}` : 'Novo operador',
    corpoHTML: `
      <form class="form-grid">
        <label class="col-full">Nome *<input name="nome" required value="${esc(operador?.nome || '')}"></label>
        <label class="col-full">Função *
          ${selectFuncao(funcoes, operador?.funcao)}
        </label>
        <label>Status *<select name="status" required>
          <option value="Ativo" ${(!operador || operador.status === 'Ativo') ? 'selected' : ''}>Ativo</option>
          <option value="Inativo" ${operador?.status === 'Inativo' ? 'selected' : ''}>Inativo</option>
        </select></label>
      </form>`,
    onMount: (overlay) => {
      const sel = overlay.querySelector('[name=funcao]');
      const outros = overlay.querySelector('[name=funcaoOutros]');
      sel.addEventListener('change', () => { outros.style.display = sel.value === 'Outros' ? 'block' : 'none'; });
      setTimeout(() => overlay.querySelector('[name=nome]')?.focus(), 50);
    },
  });
  if (!ok) return;

  const form = document.querySelector('.modal form');
  const dados = lerForm(form);
  const funcaoFinal = dados.funcao === 'Outros' ? (dados.funcaoOutros || '').trim() : dados.funcao;
  if (!funcaoFinal) return toast('Informe a função.', 'erro');

  const payload = { nome: dados.nome.trim(), funcao: funcaoFinal, status: dados.status };
  try {
    if (operador) await api.put(`/operadores/${operador.id}`, payload);
    else await api.post('/operadores', payload);
    toast('Operador salvo.', 'ok');
    recarregar();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Erro ao salvar operador.', 'erro');
  }
}

async function inativar(id, recarregar) {
  const ok = await confirmar('Inativar operador', 'O operador deixa de aparecer no Lançamento Diário, mas o histórico dele é mantido. Confirma?', 'Inativar');
  if (!ok) return;
  try {
    await api.patch(`/operadores/${id}/inativar`);
    toast('Operador inativado.', 'ok');
    recarregar();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Erro ao inativar.', 'erro');
  }
}
