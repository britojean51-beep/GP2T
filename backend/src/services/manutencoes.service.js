// ============================================================================
// manutencoes.service.js — Leitura da aba Manutenções. Só leitura: o
// cadastro continua manual, direto na planilha (por desenho do projeto), o
// app só mostra a lista.
// ============================================================================
import { getAllRows } from '../lib/sheets.js';
import { TABS } from '../config/schema.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

function mapOut(m) {
  return {
    data: m.Data,
    equipamento: m.Equipamento,
    operadorResponsavel: m['Operador/Responsável'],
    horimetro: m['Horímetro'],
    km: m.KM,
    tipo: m.Tipo,
    servicoRealizado: m['Serviço Realizado'],
    pecasTrocas: m['Peças/Trocas'],
    observacao: m.Observação,
    proximaManutencao: m['Próxima Manutenção'],
  };
}

export async function listManutencoes() {
  const key = 'resumos:manutencoes';
  let rows = cacheGet(key);
  if (!rows) {
    rows = await getAllRows(TABS.MANUTENCOES);
    cacheSet(key, rows);
  }
  return rows
    .map(mapOut)
    .sort((a, b) => (a.data < b.data ? 1 : a.data > b.data ? -1 : 0));
}
