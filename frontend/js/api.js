// ============================================================================
// api.js — Cliente HTTP para o backend em Google Apps Script. Traduz as
// mesmas chamadas api.get/post/put/patch/del (com os mesmos paths que o
// backend Node usava) para o roteador por "action" do Web App — nenhuma
// tela (views/*.js, auth.js, sync.js) precisou mudar.
//
// Duas regras existem só pra nunca disparar um preflight CORS (o Apps
// Script Web App não sabe responder OPTIONS):
//   - GET: token sempre na URL (?token=...), nunca em header.
//   - POST/PUT/PATCH/DELETE: tudo vira uma requisição POST de verdade com
//     Content-Type: text/plain (não application/json — isso também
//     dispara preflight) e um corpo JSON que o doPost do Apps Script lê
//     manualmente. O "método" original vira parte da action escolhida
//     abaixo, não um header HTTP de verdade.
//
// Como o Apps Script sempre responde HTTP 200 pro navegador (não dá pra
// escolher status code), o "status real" vem dentro do corpo:
// {ok:true, dados} ou {ok:false, erro, mensagem, status}.
// ============================================================================
import { APPS_SCRIPT_URL } from './config.js';

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

// Cada rota antiga (Express) vira uma "action" no Apps Script. `params`
// nomeados por regex (ex. :id) entram junto com a querystring.
const ROTAS = [
  { metodo: 'POST', re: /^\/auth\/login$/, action: 'auth.login' },
  { metodo: 'GET', re: /^\/auth\/me$/, action: 'auth.me' },

  { metodo: 'PATCH', re: /^\/equipamentos\/([^/]+)\/inativar$/, action: 'equipamentos.inativar', nomes: ['id'] },
  { metodo: 'PUT', re: /^\/equipamentos\/([^/]+)$/, action: 'equipamentos.update', nomes: ['id'] },
  { metodo: 'GET', re: /^\/equipamentos$/, action: 'equipamentos.list' },
  { metodo: 'POST', re: /^\/equipamentos$/, action: 'equipamentos.create' },

  { metodo: 'PATCH', re: /^\/operadores\/([^/]+)\/inativar$/, action: 'operadores.inativar', nomes: ['id'] },
  { metodo: 'PUT', re: /^\/operadores\/([^/]+)$/, action: 'operadores.update', nomes: ['id'] },
  { metodo: 'GET', re: /^\/operadores$/, action: 'operadores.list' },
  { metodo: 'POST', re: /^\/operadores$/, action: 'operadores.create' },

  { metodo: 'PATCH', re: /^\/usuarios\/([^/]+)\/inativar$/, action: 'usuarios.inativar', nomes: ['id'] },
  { metodo: 'PUT', re: /^\/usuarios\/([^/]+)$/, action: 'usuarios.update', nomes: ['id'] },
  { metodo: 'GET', re: /^\/usuarios$/, action: 'usuarios.list' },
  { metodo: 'POST', re: /^\/usuarios$/, action: 'usuarios.create' },

  { metodo: 'PUT', re: /^\/lancamentos\/([^/]+)$/, action: 'lancamentos.update', nomes: ['id'] },
  { metodo: 'DELETE', re: /^\/lancamentos\/([^/]+)$/, action: 'lancamentos.delete', nomes: ['id'] },
  { metodo: 'GET', re: /^\/lancamentos$/, action: 'lancamentos.list' },
  { metodo: 'POST', re: /^\/lancamentos$/, action: 'lancamentos.create' },

  { metodo: 'GET', re: /^\/config$/, action: 'config.get' },

  { metodo: 'GET', re: /^\/resumos\/diario$/, action: 'resumos.diario' },
  { metodo: 'GET', re: /^\/resumos\/semanal$/, action: 'resumos.semanal' },
  { metodo: 'GET', re: /^\/resumos\/mensal$/, action: 'resumos.mensal' },
  { metodo: 'GET', re: /^\/resumos\/operadores$/, action: 'resumos.operadores' },
  { metodo: 'GET', re: /^\/resumos\/equipamentos$/, action: 'resumos.equipamentos' },

  { metodo: 'GET', re: /^\/manutencoes$/, action: 'manutencoes.list' },
];

function resolverRota(metodo, path) {
  const [pathname, querystring] = path.split('?');
  for (const rota of ROTAS) {
    if (rota.metodo !== metodo) continue;
    const m = pathname.match(rota.re);
    if (!m) continue;
    const params = new URLSearchParams(querystring || '');
    if (rota.nomes) rota.nomes.forEach((nome, i) => params.set(nome, m[i + 1]));
    return { action: rota.action, params };
  }
  throw new Error(`Rota não mapeada para o Apps Script: ${metodo} ${path}`);
}

async function request(method, path, body) {
  const { action, params } = resolverRota(method, path);
  const token = getToken();

  let res;
  try {
    if (method === 'GET') {
      params.set('action', action);
      if (token) params.set('token', token);
      res = await fetch(`${APPS_SCRIPT_URL}?${params.toString()}`, { method: 'GET' });
    } else {
      const data = { ...Object.fromEntries(params), ...(body || {}) };
      res = await fetch(APPS_SCRIPT_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'text/plain;charset=utf-8' },
        body: JSON.stringify({ action, token, data }),
      });
    }
  } catch {
    throw new ApiError(0, 'OFFLINE', 'Sem conexão com o servidor.');
  }

  let corpo = null;
  try { corpo = await res.json(); } catch { /* corpo vazio ou não-JSON */ }

  if (!corpo || corpo.ok !== true) {
    const status = corpo?.status || 500;
    const erro = corpo?.erro || 'ERRO';
    const mensagem = corpo?.mensagem || 'Erro inesperado no servidor.';
    if (status === 401) {
      localStorage.removeItem('gp2t_token');
      localStorage.removeItem('gp2t_usuario');
      if (location.hash !== '#/login') location.hash = '#/login';
    }
    throw new ApiError(status, erro, mensagem);
  }
  return corpo.dados ?? null;
}

export const api = {
  get: (path) => request('GET', path),
  post: (path, body) => request('POST', path, body),
  put: (path, body) => request('PUT', path, body),
  patch: (path, body) => request('PATCH', path, body),
  del: (path) => request('DELETE', path),
};
