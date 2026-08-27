// ============================================================================
// db.js — Fila offline (IndexedDB). Guarda lançamentos criados/editados/
// excluídos sem conexão, para o sync.js reenviar quando a internet voltar.
// Cada item da fila tem um opId próprio (id da operação na fila) e um
// lancamentoId (id do lançamento em si, gerado no cliente na criação — é esse
// ID que o backend usa para nunca duplicar um reenvio).
// ============================================================================
const DB_NAME = 'gp2t_offline';
const DB_VERSION = 1;
const STORE = 'filaPendente';

let _dbPromise = null;
function openDB() {
  if (_dbPromise) return _dbPromise;
  _dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE)) {
        const os = db.createObjectStore(STORE, { keyPath: 'opId' });
        os.createIndex('lancamentoId', 'lancamentoId');
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
  return _dbPromise;
}

function p(request) {
  return new Promise((resolve, reject) => {
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

async function store(mode = 'readonly') {
  const db = await openDB();
  return db.transaction(STORE, mode).objectStore(STORE);
}

export async function getAllPendentes() {
  const os = await store();
  return p(os.getAll());
}

// Enfileira uma operação. Se já existir uma pendente para o mesmo
// lançamento (ainda não sincronizada), substitui em vez de duplicar —
// assim editar duas vezes offline não gera dois envios.
export async function enqueue({ tipo, lancamentoId, payload }) {
  const os = await store('readwrite');
  const existentes = await p(os.index('lancamentoId').getAll(lancamentoId));
  const pendente = existentes.find((x) => x.status !== 'Sincronizado');

  if (tipo === 'excluir' && pendente && pendente.tipo === 'criar') {
    // Nunca chegou a ir ao servidor: só remove da fila local.
    await p(os.delete(pendente.opId));
    return null;
  }

  const item = {
    opId: pendente ? pendente.opId : crypto.randomUUID(),
    // Se ainda não sincronizou como criação, continua sendo 'criar' mesmo
    // que o usuário tenha editado de novo antes de sincronizar.
    tipo: pendente && pendente.tipo === 'criar' ? 'criar' : tipo,
    lancamentoId,
    payload,
    status: 'Pendente',
    tentativas: 0,
    criadoEm: new Date().toISOString(),
  };
  await p(os.put(item));
  return item;
}

export async function updateStatus(opId, status, extra = {}) {
  const os = await store('readwrite');
  const item = await p(os.get(opId));
  if (!item) return;
  Object.assign(item, { status, ...extra });
  await p(os.put(item));
}

export async function removeItem(opId) {
  const os = await store('readwrite');
  await p(os.delete(opId));
}
