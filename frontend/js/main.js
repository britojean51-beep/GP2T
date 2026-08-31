// ============================================================================
// main.js — Bootstrap: roteador por hash, shell (topo + menu inferior),
// sessão e fila offline.
// ============================================================================
import { estaLogado, getUsuario, logout, isAdmin } from './auth.js';
import { iniciarSync, aoMudarSync, estaSincronizando } from './sync.js';
import { getAllPendentes } from './db.js';
import { esc } from './ui.js';

import * as Login from './views/login.js';
import * as Lancamentos from './views/lancamentos.js';
import * as Operadores from './views/operadores.js';
import * as Equipamentos from './views/equipamentos.js';
import * as Resumos from './views/resumos.js';
import * as Usuarios from './views/usuarios.js';

const NAV = [
  { rota: '#/', label: 'Lançamentos', icon: '📝' },
  { rota: '#/operadores', label: 'Operadores', icon: '👷' },
  { rota: '#/equipamentos', label: 'Equipamentos', icon: '🚛' },
  { rota: '#/resumos', label: 'Resumos', icon: '📊' },
  { rota: '#/usuarios', label: 'Usuários', icon: '👤', admin: true },
];

const ROTAS = {
  '#/': Lancamentos.render,
  '#/operadores': Operadores.render,
  '#/equipamentos': Equipamentos.render,
  '#/resumos': Resumos.render,
  '#/usuarios': Usuarios.render,
};

async function boot() {
  if (!estaLogado()) return montarLogin();
  montarApp();
}

function montarLogin() {
  const app = document.getElementById('app');
  const { html, montar } = Login.render();
  app.innerHTML = html;
  montar(app);
}

function montarApp() {
  const usuario = getUsuario();
  const app = document.getElementById('app');
  const itens = NAV.filter((n) => !n.admin || isAdmin());

  app.innerHTML = `
    <div class="shell">
      <header class="topbar">
        <div class="topbar__brand">🚛 <strong>Gestão de Frota</strong></div>
        <div class="topbar__right">
          <span id="sync-indicator" class="sync-indicator" title="Status de sincronização"></span>
          <span class="topbar__user">${esc(usuario.nome)}</span>
          <button class="btn-icon" id="btn-sair" title="Sair">⎋</button>
        </div>
      </header>
      <main id="outlet" class="outlet"></main>
      <nav class="tabbar">
        ${itens.map((n) => `<a href="${n.rota}" data-rota="${n.rota}" class="tab-item"><span class="tab-ic">${n.icon}</span><span>${esc(n.label)}</span></a>`).join('')}
      </nav>
    </div>`;

  document.getElementById('btn-sair').onclick = () => { logout(); location.hash = '#/'; location.reload(); };

  iniciarSync();
  aoMudarSync(atualizarIndicadorSync);
  atualizarIndicadorSync();

  window.addEventListener('hashchange', resolverRota);
  resolverRota();
}

async function atualizarIndicadorSync() {
  const el = document.getElementById('sync-indicator');
  if (!el) return;
  const pendentes = await getAllPendentes();
  const qtd = pendentes.filter((p) => p.status !== 'Sincronizado').length;
  if (estaSincronizando()) {
    el.textContent = '🔄';
    el.title = 'Sincronizando…';
  } else if (qtd > 0) {
    el.textContent = `🕓 ${qtd}`;
    el.title = `${qtd} lançamento(s) aguardando sincronização`;
  } else if (!navigator.onLine) {
    el.textContent = '📴';
    el.title = 'Sem conexão';
  } else {
    el.textContent = '✅';
    el.title = 'Tudo sincronizado';
  }
}

// Se o usuário troca de rota antes da anterior terminar de carregar (comum
// com o backend "dormindo" no Render, ou só clicando rápido demais), as duas
// chamadas ficam pendentes ao mesmo tempo — sem essa trava, a que demorar
// mais pode resolver por último e sobrescrever o outlet com a tela ERRADA
// (a antiga, não a que o usuário está vendo/esperando). `minhaNavegacao`
// garante que só a navegação mais recente tem permissão de escrever no DOM.
let ultimaNavegacao = 0;

async function resolverRota() {
  const minhaNavegacao = ++ultimaNavegacao;
  const hash = location.hash || '#/';
  const outlet = document.getElementById('outlet');
  const handler = ROTAS[hash];

  document.querySelectorAll('[data-rota]').forEach((a) => a.classList.toggle('ativo', a.dataset.rota === hash));

  if (!handler) {
    outlet.innerHTML = '<div class="aviso aviso--erro">Página não encontrada. <a href="#/">Voltar</a></div>';
    return;
  }
  outlet.innerHTML = '<div class="loading">Carregando…</div>';
  try {
    const saida = await handler();
    if (minhaNavegacao !== ultimaNavegacao) return;
    const html = typeof saida === 'string' ? saida : saida.html;
    outlet.innerHTML = html;
    if (saida && typeof saida.montar === 'function') saida.montar(outlet);
  } catch (e) {
    if (minhaNavegacao !== ultimaNavegacao) return;
    console.error(e);
    outlet.innerHTML = `<div class="aviso aviso--erro">Erro ao carregar: ${esc(e.message)}</div>`;
  }
}

if ('serviceWorker' in navigator) {
  window.addEventListener('load', () => navigator.serviceWorker.register('./sw.js').catch(() => {}));
}

boot();
