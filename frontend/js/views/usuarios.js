// ============================================================================
// views/usuarios.js — Gestão de logins da equipe. Só ADMINISTRADOR vê esta tela.
// ============================================================================
import { api, ApiError } from '../api.js';
import { getUsuario } from '../auth.js';
import { esc, toast, confirmar, badgeStatus, modal, lerForm } from '../ui.js';

const PERFIS = ['ADMINISTRADOR', 'OPERACIONAL', 'VISUALIZACAO'];

export async function render() {
  const meuUsuario = getUsuario();
  if (meuUsuario?.perfil !== 'ADMINISTRADOR') {
    return '<div class="aviso aviso--erro">Esta tela é restrita ao perfil Administrador.</div>';
  }

  const usuarios = await api.get('/usuarios');
  const html = `
    <div class="page-head">
      <h1>👤 Usuários</h1>
      <button class="btn btn--primary" id="btn-novo">➕ Novo usuário</button>
    </div>
    <div class="card"><div id="lista-usuarios"></div></div>
  `;
  return { html, montar: (root) => montar(root, usuarios, meuUsuario) };
}

function listaHTML(usuarios, meuId) {
  return usuarios.map((u) => `
    <div class="reg-item">
      <div class="reg-item__info">
        <strong>${esc(u.nome)}</strong>
        <span class="muted">${esc(u.email)} · ${esc(u.perfil)}</span>
      </div>
      ${badgeStatus(u.status)}
      <div class="reg-item__acoes">
        <button class="btn-icon" data-editar="${u.id}">✏️ Editar</button>
        ${u.status === 'Ativo' && u.id !== meuId ? `<button class="btn-icon" data-inativar="${u.id}">⛔ Inativar</button>` : ''}
      </div>
    </div>`).join('');
}

function montar(root, usuariosIniciais, meuUsuario) {
  let usuarios = usuariosIniciais;
  const alvo = root.querySelector('#lista-usuarios');
  alvo.innerHTML = listaHTML(usuarios, meuUsuario.id);
  ligarBotoes();

  async function recarregar() {
    usuarios = await api.get('/usuarios');
    alvo.innerHTML = listaHTML(usuarios, meuUsuario.id);
    ligarBotoes();
  }

  function ligarBotoes() {
    alvo.querySelectorAll('[data-editar]').forEach((b) => {
      b.onclick = () => abrirForm(usuarios.find((u) => u.id === b.dataset.editar), recarregar);
    });
    alvo.querySelectorAll('[data-inativar]').forEach((b) => {
      b.onclick = () => inativar(b.dataset.inativar, recarregar);
    });
  }

  root.querySelector('#btn-novo').onclick = () => abrirForm(null, recarregar);
}

async function abrirForm(usuario, recarregar) {
  const ok = await modal({
    titulo: usuario ? `Editar ${usuario.nome}` : 'Novo usuário',
    corpoHTML: `
      <form class="form-grid">
        <label class="col-full">Nome *<input name="nome" required value="${esc(usuario?.nome || '')}"></label>
        <label class="col-full">E-mail *<input name="email" type="email" required value="${esc(usuario?.email || '')}" ${usuario ? 'readonly' : ''}></label>
        <label>Perfil *<select name="perfil" required>${PERFIS.map((p) => `<option value="${p}" ${p === usuario?.perfil ? 'selected' : ''}>${p}</option>`).join('')}</select></label>
        <label>Status *<select name="status" required>
          <option value="Ativo" ${(!usuario || usuario.status === 'Ativo') ? 'selected' : ''}>Ativo</option>
          <option value="Inativo" ${usuario?.status === 'Inativo' ? 'selected' : ''}>Inativo</option>
        </select></label>
        <label class="col-full">${usuario ? 'Nova senha (deixe em branco para manter)' : 'Senha *'}<input name="senha" type="password" ${usuario ? '' : 'required'} minlength="6"></label>
      </form>`,
    onMount: (overlay) => setTimeout(() => overlay.querySelector('[name=nome]')?.focus(), 50),
  });
  if (!ok) return;

  const form = document.querySelector('.modal form');
  const dados = lerForm(form);
  try {
    if (usuario) {
      const payload = { nome: dados.nome.trim(), perfil: dados.perfil, status: dados.status };
      if (dados.senha) payload.senha = dados.senha;
      await api.put(`/usuarios/${usuario.id}`, payload);
    } else {
      await api.post('/usuarios', { nome: dados.nome.trim(), email: dados.email.trim(), senha: dados.senha, perfil: dados.perfil });
    }
    toast('Usuário salvo.', 'ok');
    recarregar();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Erro ao salvar usuário.', 'erro');
  }
}

async function inativar(id, recarregar) {
  const ok = await confirmar('Inativar usuário', 'Este login deixa de conseguir entrar no app. Confirma?', 'Inativar');
  if (!ok) return;
  try {
    await api.patch(`/usuarios/${id}/inativar`);
    toast('Usuário inativado.', 'ok');
    recarregar();
  } catch (e) {
    toast(e instanceof ApiError ? e.message : 'Erro ao inativar.', 'erro');
  }
}
