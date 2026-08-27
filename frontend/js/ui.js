// ============================================================================
// ui.js — Helpers de DOM: criação de elementos, escape, toast, modal, badge.
// ============================================================================
export function el(html) {
  const t = document.createElement('template');
  t.innerHTML = html.trim();
  return t.content.firstElementChild;
}

export function esc(s) {
  return String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

let toastTimer;
export function toast(msg, tipo = 'ok') {
  let box = document.getElementById('toast');
  if (!box) {
    box = el('<div id="toast" class="toast"></div>');
    document.body.appendChild(box);
  }
  box.className = `toast toast--${tipo} toast--show`;
  box.textContent = msg;
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => box.classList.remove('toast--show'), 4200);
}

export function modal({ titulo, corpoHTML, okLabel = 'Confirmar', cancelLabel = 'Cancelar', semOk = false, largo = false, onMount }) {
  return new Promise((resolve) => {
    const overlay = el(`
      <div class="modal-overlay">
        <div class="modal ${largo ? 'modal--largo' : ''}" role="dialog" aria-modal="true">
          <div class="modal__head"><h3>${esc(titulo)}</h3><button class="modal__x" aria-label="Fechar">✕</button></div>
          <div class="modal__body">${corpoHTML}</div>
          <div class="modal__foot">
            <button class="btn btn--ghost" data-act="cancel">${esc(cancelLabel)}</button>
            ${semOk ? '' : `<button class="btn btn--primary" data-act="ok">${esc(okLabel)}</button>`}
          </div>
        </div>
      </div>`);
    document.body.appendChild(overlay);
    document.body.classList.add('no-scroll');
    // Importante: NÃO remover o overlay antes de resolve(val). Vários chamadores
    // fazem `document.querySelector('.modal form')` logo após o `await modal(...)`
    // (ex.: abrirForm de equipamentos/operadores/usuários, edição de lançamento);
    // essa leitura roda na continuação (microtask) da Promise, então o overlay
    // precisa continuar no DOM até esse ponto. Removemos só depois, num
    // macrotask (setTimeout 0), que sempre roda depois de todas as microtasks.
    const fechar = (val) => {
      document.body.classList.remove('no-scroll');
      resolve(val);
      setTimeout(() => overlay.remove(), 0);
    };
    overlay.querySelector('.modal__x').onclick = () => fechar(false);
    overlay.querySelector('[data-act="cancel"]').onclick = () => fechar(false);
    const okBtn = overlay.querySelector('[data-act="ok"]');
    if (okBtn) okBtn.onclick = () => {
      const form = overlay.querySelector('form');
      if (form && !form.reportValidity()) return;
      fechar(true);
    };
    overlay.addEventListener('click', (e) => { if (e.target === overlay) fechar(false); });
    if (onMount) onMount(overlay, fechar);
  });
}

export async function confirmar(titulo, mensagem, okLabel = 'Confirmar') {
  return modal({ titulo, corpoHTML: `<p class="confirm-msg">${esc(mensagem)}</p>`, okLabel });
}

export function lerForm(form) {
  const dados = {};
  new FormData(form).forEach((v, k) => { dados[k] = v; });
  return dados;
}

export function options(itens, valorAtual, mapa = (i) => ({ v: i.id, t: i.nome })) {
  return itens.map((i) => {
    const { v, t } = mapa(i);
    return `<option value="${esc(v)}" ${String(v) === String(valorAtual) ? 'selected' : ''}>${esc(t)}</option>`;
  }).join('');
}

export function badgeStatus(status) {
  const classe = {
    Operando: 'badge badge-ok', Ativo: 'badge badge-ok',
    Manutenção: 'badge badge-warn',
    Parado: 'badge badge-muted',
    Inativo: 'badge badge-danger',
  }[status] || 'badge';
  return `<span class="${classe}">${esc(status)}</span>`;
}

export function badgeSync(status) {
  const map = {
    Pendente: { c: 'sync-pendente', t: '🕓 Pendente' },
    Sincronizando: { c: 'sync-sincronizando', t: '🔄 Sincronizando' },
    Sincronizado: { c: 'sync-ok', t: '✅ Sincronizado' },
    Erro: { c: 'sync-erro', t: '⚠️ Erro ao sincronizar' },
  }[status] || { c: '', t: status };
  return `<span class="sync-badge ${map.c}">${map.t}</span>`;
}
