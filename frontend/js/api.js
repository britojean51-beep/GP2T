// ============================================================================
// api.js — Cliente HTTP para o backend: injeta o token, trata 401 (sessão
// expirada) e erros de rede (offline) de forma padronizada.
// ============================================================================
import { API_BASE_URL } from './config.js';

export class ApiError extends Error {
  constructor(status, code, message) {
    super(message);
    this.status = status;
    this.code = code;
    this.offline = status === 0;
  }
}

function getToken() {
  return localStorage.getItem('gp2t_token');
}

async function request(method, path, body) {
  const headers = { 'Content-Type': 'application/json' };
  const token = getToken();
  if (token) headers.Authorization = `Bearer ${token}`;

  let res;
  try {
    res = await fetch(`${API_BASE_URL}${path}`, {
      method,
      headers,
      body: body != null ? JSON.stringify(body) : undefined,
    });
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Sem conexão com o servidor.');
  }

  if (res.status === 204) return null;

  let data = null;
  try { data = await res.json(); } catch { /* corpo vazio ou não-JSON */ }

  if (!res.ok) {
    if (res.status === 401) {
      localStorage.removeItem('gp2t_token');
      localStorage.removeItem('gp2t_usuario');
      if (location.hash !== '#/login') location.hash = '#/login';
    }
    throw new ApiError(res.status, data?.erro || 'ERRO', data?.mensagem || 'Erro inesperado no servidor.');
  }
  return data;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
