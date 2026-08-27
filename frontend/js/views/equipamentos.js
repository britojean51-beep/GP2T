// ============================================================================
// views/equipamentos.js — Cadastro de equipamentos.
// ============================================================================
import { api, ApiError } from '../api.js';
import { esc, toast, confirmar, badgeStatus, modal, lerForm } from '../ui.js';
import { fmt } from '../format.js';

const STATUS_LIST = ['Operando', 'Manutenção', 'Parado', 'Inativo'];

export async function render() {
  const [equipamentos, config] = await Promise.all([
    api.get('/equipamentos'),
    api.get('/config').catch(() => ({ tiposEquipamento: [] })),
  ]);

  const html = `
    <div class="page-head">
      <h1>🚛 Equipamentos</h1>
      <button class="btn btn--primary" id="btn-novo">➕ Novo equipamento</button>
    </div>
    <div class="card">
      <div id="lista-equipamentos"></div>
    </div>
  `;

  return { html, montar: (root) => montar(root, equipamentos, config.tiposEquipamento || []) };
}

function listaHTML(equipamentos) {
  if (!equipamentos.length) return '<p class="muted">Nenhum equipamento cadastrado ainda.</p>';
  return equipamentos.map((e) => `
    <div class="reg-item">
      <div class="reg-item__info">
        <strong>${esc(e.codigo)}</strong>
        <span class="muted">${esc(e.tipo)}${e.marca ? ' · ' + esc(e.marca) : ''}${e.modelo ? ' ' + esc(e.modelo) : ''}</span>
        <span class="muted">Horímetro: ${fmt.n1(e.horimetroAtual)} h${e.kmAtual ? ' · KM: ' + fmt.n1(e.kmAtual) : ''}</span>
      </div>
      ${badgeStatus(e.status)}
      <div class="reg-item__acoes">
        <button class="btn-icon" data-editar="${e.id}">✏️ Editar</button>
        ${e.status !== 'Inativo' ? `<button class="btn-icon" data-inativar="${e.id}">⛔ Inativar</button>` : ''}
      </div>
    </div>`).join('');
}

function montar(root, equipamentosIniciais, tipos) {
  let equipamentos = equipamentosIniciais;
  const alvo = root.querySelector('#lista-equipamentos');
  alvo.innerHTML = listaHTML(equipamentos);
  ligarBotoes();

  async function recarregar() {
    equipamentos = await api.get('/equipamentos');
    alvo.innerHTML = listaHTML(equipamentos);
    ligarBotoes();
  }

  function ligarBotoes() {
    alvo.querySelectorAll('[data-editar]').forEach((b) => {
      b.onclick = () => abrirForm(equipamentos.find((e) => e.id === b.dataset.editar), tipos, recarregar);
    });
    alvo.querySelectorAll('[data-inativar]').forEach((b) => {
      b.onclick = () => inativar(b.dataset.inativar, recarregar);
    });
  }

  root.querySelector('#btn-novo').onclick = () => abrirForm(null, tipos, recarregar);
}

function selectTipo(tipos, atual) {
  const opts = tipos.map((t) => `<option value="${esc(t)}" ${t === atual ? 'selected' : ''}>${esc(t)}</option>`).join('');
  return `<select name="tipo" required>
    <option value="">Selecione…</option>
    ${opts}
    <option value="Outros" ${atual && !tipos.includes(atual) ? 'selected' : ''}>Outros…</option>
  </select>
  <input name="tipoOutros" placeholder="Digite o tipo" style="margin-top:8px;display:${atual && !tipos.includes(atual) ? 'block' : 'none'}" value="${atual && !tipos.includes(atual) ? esc(atual) : ''}">`;
}

async function abrirForm(equipamento, tipos, recarregar) {
  const ok = await modal({
    titulo: equipamento ? `Editar ${equipamento.codigo}` : 'Novo equipamento',
    largo: true,
    corpoHTML: `
      <form class="form-grid">
        <label>Código *<input name="codigo" required value="${esc(equipamento?.codigo || '')}" placeholder="CB-14"></label>
        <label class="col-full">Tipo *${selectTipo(tipos, equipamento?.tipo)}</label>
        <label>Marca<input name="marca" value="${esc(equipamento?.marca || '')}"></label>
        <label>Modelo<input name="modelo" value="${esc(equipamento?.modelo || '')}"></label>
        <label>Status *<select name="status" required>${STATUS_LIST.map((s) => `<option value="${s}" ${s === (equipamento?.status || 'Operando') ? 'selected' : ''}>${s}</option>`).join('')}</select></label>
        <label>Horímetro atual<input type="number" step="0.1" min="0" name="horimetroAtual" value="${equipamento?.horimetroAtual ?? 0}"></label>
        <label>KM atual<input type="number" step="1" min="0" name="kmAtual" value="${equipamento?.kmAtual ?? 0}"></label>
      </form>`,
    onMount: (overlay) => {
      const sel = overlay.querySelector('[name=tipo]');
      const outros = overlay.querySelector('[name=tipoOutros]');
      sel.addEventListener('change', () => { outros.style.display = sel.value === 'Outros' ? 'block' : 'none'; });
      setTimeout(() => overlay.querySelector('[name=codigo]')?.focus(), 50);
    },
  });
  if (!ok) return;

  const form = document.querySelector('.modal form');
  const dados = lerForm(form);
  const tipoFinal = dados.tipo === 'Outros' ? (dados.tipoOutros || '').trim() : dados.tipo;
  if (!tipoFinal) return toast('Informe o tipo.', 'erro');

  const payload = {
    codigo: dados.codigo.trim(), tipo: tipoFinal, marca: dados.marca.trim(), modelo: dados.modelo.trim(),
    status: dados.status, horimetroAtual: Number(dados.horimetroAtual) || 0, kmAtual: Number(dados.kmAtual) || 0,
  };
  try {
    if (equipamento) await api.put(`/equipamentos/${equipamento.id}`, payload);
    else await api.post('/equipamentos', payload);
    toast('Equipamento salvo.', 'ok');
    recarregar();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Erro ao salvar equipamento.', 'erro');
  }
}

async function inativar(id, recarregar) {
  const ok = await confirmar('Inativar equipamento', 'O equipamento deixa de aparecer no Lançamento Diário, mas o histórico dele é mantido. Confirma?', 'Inativar');
  if (!ok) return;
  try {
    await api.patch(`/equipamentos/${id}/inativar`);
    toast('Equipamento inativado.', 'ok');
    recarregar();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Erro ao inativar.', 'erro');
  }
}
