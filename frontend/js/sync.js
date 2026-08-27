// ============================================================================
// sync.js — Processa a fila offline: reenvia para o backend assim que há
// conexão. Reenvio é idempotente (mesmo lancamentoId), então nunca duplica
// na planilha mesmo se o mesmo item for reenviado mais de uma vez.
// ============================================================================
import { api, ApiError } from './api.js';
import * as db from './db.js';

let sincronizando = false;
const ouvintes = [];
export function aoMudarSync(fn) { ouvintes.push(fn); }
function notificar() { ouvintes.forEach((fn) => fn()); }

export async function processarFila() {
  if (sincronizando || !navigator.onLine) return;
  sincronizando = true;
  notificar();
  try {
    const itens = await db.getAllPendentes();
    for (const item of itens.filter((i) => i.status === 'Pendente' || i.status === 'Erro')) {
      await db.updateStatus(item.opId, 'Sincronizando');
      notificar();
      try {
        if (item.tipo === 'criar' || item.tipo === 'editar') {
          await api.post('/lancamentos', { ...item.payload, id: item.lancamentoId });
        } else if (item.tipo === 'excluir') {
          await api.del(`/lancamentos/${item.lancamentoId}`);
        }
        await db.removeItem(item.opId);
      } catch (e) {
        if (e instanceof ApiError && !e.offline) {
          // Erro definitivo do servidor (validação, permissão, horímetro) —
          // marca Erro e segue para o próximo item, não trava a fila inteira.
          await db.updateStatus(item.opId, 'Erro', { tentativas: (item.tentativas || 0) + 1, erroMsg: e.message });
        } else {
          // Sem conexão de novo — para por aqui, tenta tudo de novo depois.
          await db.updateStatus(item.opId, 'Pendente');
          notificar();
          break;
        }
      }
      notificar();
    }
  } finally {
    sincronizando = false;
    notificar();
  }
}

export function iniciarSync() {
  window.addEventListener('online', processarFila);
  processarFila();
  setInterval(processarFila, 20000);
}

export function estaSincronizando() {
  return sincronizando;
}
