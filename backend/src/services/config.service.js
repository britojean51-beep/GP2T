import { getAllRows } from '../lib/sheets.js';
import { TABS } from '../config/schema.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

// A aba Config tem duas listas independentes (uma por coluna) que o admin
// edita direto na planilha para adicionar uma função/tipo novo sem redeploy.
async function getConfigRows() {
  const key = 'config:rows';
  let rows = cacheGet(key);
  if (!rows) {
    rows = await getAllRows(TABS.CONFIG);
    cacheSet(key, rows, 30000);
  }
  return rows;
}

export async function getFuncoes() {
  const rows = await getConfigRows();
  return rows.map((r) => r.Funcoes).filter(Boolean);
}

export async function getTiposEquipamento() {
  const rows = await getConfigRows();
  return rows.map((r) => r.TiposEquipamento).filter(Boolean);
}

export async function getConfig() {
  const rows = await getConfigRows();
  return {
    funcoes: rows.map((r) => r.Funcoes).filter(Boolean),
    tiposEquipamento: rows.map((r) => r.TiposEquipamento).filter(Boolean),
  };
}
