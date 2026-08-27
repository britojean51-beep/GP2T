// ============================================================================
// auth.js — Sessão do usuário logado (token + dados básicos em localStorage).
// ============================================================================
import { api } from './api.js';

const TOKEN_KEY = 'gp2t_token';
const USER_KEY = 'gp2t_usuario';

export function getToken() {
  return localStorage.getItem(TOKEN_KEY);
}

export function getUsuario() {
  try { return JSON.parse(localStorage.getItem(USER_KEY) || 'null'); } catch { return null; }
}

export function isAdmin() {
  return getUsuario()?.perfil === 'ADMINISTRADOR';
}

export function estaLogado() {
  return !!getToken();
}

export async function login(email, senha) {
  const { token, usuario } = await api.post('/auth/login', { email, senha });
  localStorage.setItem(TOKEN_KEY, token);
  localStorage.setItem(USER_KEY, JSON.stringify(usuario));
  return usuario;
}

export function logout() {
  localStorage.removeItem(TOKEN_KEY);
  localStorage.removeItem(USER_KEY);
}
