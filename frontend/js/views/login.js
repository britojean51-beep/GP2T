// ============================================================================
// views/login.js — Tela de login.
// ============================================================================
import { login } from '../auth.js';
import { toast } from '../ui.js';
import { ApiError } from '../api.js';

export function render() {
  const html = `
    <div class="login">
      <div class="login__card">
        <div class="login__logo">🚛</div>
        <h1>Gestão de Frota</h1>
        <p class="login__sub">Controle operacional</p>
        <form id="form-login" class="login__form">
          <label>E-mail<input type="email" name="email" required autocomplete="username"></label>
          <label>Senha<input type="password" name="senha" required autocomplete="current-password"></label>
          <button class="btn btn--primary btn--grande" type="submit">Entrar</button>
        </form>
      </div>
    </div>`;
  return { html, montar };
}

function montar(root) {
  const form = root.querySelector('#form-login');
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const btn = form.querySelector('button');
    btn.disabled = true;
    btn.textContent = 'Entrando…';
    try {
      await login(form.email.value.trim(), form.senha.value);
      location.hash = '#/';
      location.reload();
    } catch (err) {
      toast(err instanceof ApiError ? err.message : 'Erro ao entrar. Verifique sua conexão.', 'erro');
      btn.disabled = false;
      btn.textContent = 'Entrar';
    }
  });
}
