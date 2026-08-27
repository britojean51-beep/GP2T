import { randomUUID } from 'crypto';
import { getAllRows, appendRow, findRowNumberById, updateRow } from '../lib/sheets.js';
import { TABS, STATUS_OPERADOR } from '../config/schema.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './auditoria.service.js';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache.js';

function mapOut(o) {
  return {
    id: o.ID,
    nome: o.Nome,
    funcao: o['Função'],
    status: o.Status,
    criadoEm: o.CriadoEm,
    atualizadoEm: o.AtualizadoEm,
  };
}

export async function listOperadores({ status } = {}) {
  const cacheKey = 'operadores:all';
  let rows = cacheGet(cacheKey);
  if (!rows) {
    rows = await getAllRows(TABS.OPERADORES);
    cacheSet(cacheKey, rows);
  }
  let list = rows.map(mapOut);
  if (status) list = list.filter((o) => o.status === status);
  return list;
}

export async function createOperador({ nome, funcao, status }, actor) {
  if (!nome || !funcao || !status) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe nome, função e status.');
  }
  if (!STATUS_OPERADOR.includes(status)) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');

  const id = randomUUID();
  const now = new Date().toISOString();
  await appendRow(TABS.OPERADORES, {
    Nome: nome,
    'Função': funcao,
    Status: status,
    ID: id,
    CriadoEm: now,
    CriadoPor: actor.nome,
    AtualizadoEm: now,
    AtualizadoPor: actor.nome,
  });
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'criar', entidade: 'operadores', entidadeId: id, detalhes: `Criou operador ${nome}` });
  cacheClear('operadores');
  return { id, nome, funcao, status };
}

export async function updateOperador(id, data, actor) {
  const rowNumber = await findRowNumberById(TABS.OPERADORES, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Operador não encontrado.');
  if (data.status && !STATUS_OPERADOR.includes(data.status)) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');

  const patch = { AtualizadoEm: new Date().toISOString(), AtualizadoPor: actor.nome };
  if (data.nome) patch.Nome = data.nome;
  if (data.funcao) patch['Função'] = data.funcao;
  if (data.status) patch.Status = data.status;

  await updateRow(TABS.OPERADORES, rowNumber, patch);
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'editar', entidade: 'operadores', entidadeId: id, detalhes: `Editou operador ${id}` });
  cacheClear('operadores');
  return { id, ...data };
}

export async function inativarOperador(id, actor) {
  const rowNumber = await findRowNumberById(TABS.OPERADORES, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Operador não encontrado.');
  await updateRow(TABS.OPERADORES, rowNumber, { Status: 'Inativo', AtualizadoEm: new Date().toISOString(), AtualizadoPor: actor.nome });
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'inativar', entidade: 'operadores', entidadeId: id, detalhes: `Inativou operador ${id}` });
  cacheClear('operadores');
}
