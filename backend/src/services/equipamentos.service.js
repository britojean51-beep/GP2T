import { randomUUID } from 'crypto';
import { getAllRows, appendRow, findRowNumberById, updateRow } from '../lib/sheets.js';
import { TABS, STATUS_EQUIPAMENTO } from '../config/schema.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './auditoria.service.js';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache.js';

const numOrZero = (v) => (v === '' || v == null || isNaN(Number(v)) ? 0 : Number(v));

function mapOut(e) {
  return {
    id: e.ID,
    codigo: e['Código'],
    tipo: e.Tipo,
    marca: e.Marca,
    modelo: e.Modelo,
    status: e.Status,
    horimetroAtual: numOrZero(e['Horímetro Atual']),
    kmAtual: numOrZero(e['KM Atual']),
    criadoEm: e.CriadoEm,
    atualizadoEm: e.AtualizadoEm,
  };
}

export async function listEquipamentos({ status } = {}) {
  const cacheKey = 'equipamentos:all';
  let rows = cacheGet(cacheKey);
  if (!rows) {
    rows = await getAllRows(TABS.EQUIPAMENTOS);
    cacheSet(cacheKey, rows);
  }
  let list = rows.map(mapOut);
  if (status) list = list.filter((e) => e.status === status);
  return list;
}

export async function createEquipamento(data, actor) {
  const { codigo, tipo, marca, modelo, status, horimetroAtual, kmAtual } = data;
  if (!codigo || !tipo || !status) {
    throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe código, tipo e status.');
  }
  if (!STATUS_EQUIPAMENTO.includes(status)) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');
  if (horimetroAtual != null && Number(horimetroAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'Horímetro não pode ser negativo.');
  if (kmAtual != null && Number(kmAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'KM não pode ser negativo.');

  const existentes = await getAllRows(TABS.EQUIPAMENTOS);
  if (existentes.some((e) => (e['Código'] || '').trim().toLowerCase() === codigo.trim().toLowerCase())) {
    throw new AppError(409, 'CODIGO_DUPLICADO', 'Já existe um equipamento com este código.');
  }

  const id = randomUUID();
  const now = new Date().toISOString();
  await appendRow(TABS.EQUIPAMENTOS, {
    'Código': codigo,
    Tipo: tipo,
    Marca: marca || '',
    Modelo: modelo || '',
    Status: status,
    'Horímetro Atual': numOrZero(horimetroAtual),
    'KM Atual': numOrZero(kmAtual),
    ID: id,
    CriadoEm: now,
    CriadoPor: actor.nome,
    AtualizadoEm: now,
    AtualizadoPor: actor.nome,
  });
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'criar', entidade: 'equipamentos', entidadeId: id, detalhes: `Criou equipamento ${codigo}` });
  cacheClear('equipamentos');
  return { id, codigo, tipo, marca, modelo, status, horimetroAtual: numOrZero(horimetroAtual), kmAtual: numOrZero(kmAtual) };
}

export async function updateEquipamento(id, data, actor) {
  const rowNumber = await findRowNumberById(TABS.EQUIPAMENTOS, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Equipamento não encontrado.');
  if (data.status && !STATUS_EQUIPAMENTO.includes(data.status)) throw new AppError(400, 'STATUS_INVALIDO', 'Status inválido.');
  if (data.horimetroAtual != null && Number(data.horimetroAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'Horímetro não pode ser negativo.');
  if (data.kmAtual != null && Number(data.kmAtual) < 0) throw new AppError(400, 'VALOR_NEGATIVO', 'KM não pode ser negativo.');

  const patch = { AtualizadoEm: new Date().toISOString(), AtualizadoPor: actor.nome };
  if (data.codigo) patch['Código'] = data.codigo;
  if (data.tipo) patch.Tipo = data.tipo;
  if (data.marca != null) patch.Marca = data.marca;
  if (data.modelo != null) patch.Modelo = data.modelo;
  if (data.status) patch.Status = data.status;
  if (data.horimetroAtual != null) patch['Horímetro Atual'] = numOrZero(data.horimetroAtual);
  if (data.kmAtual != null) patch['KM Atual'] = numOrZero(data.kmAtual);

  await updateRow(TABS.EQUIPAMENTOS, rowNumber, patch);
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'editar', entidade: 'equipamentos', entidadeId: id, detalhes: `Editou equipamento ${id}` });
  cacheClear('equipamentos');
  return { id, ...data };
}

export async function inativarEquipamento(id, actor) {
  const rowNumber = await findRowNumberById(TABS.EQUIPAMENTOS, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Equipamento não encontrado.');
  await updateRow(TABS.EQUIPAMENTOS, rowNumber, { Status: 'Inativo', AtualizadoEm: new Date().toISOString(), AtualizadoPor: actor.nome });
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'inativar', entidade: 'equipamentos', entidadeId: id, detalhes: `Inativou equipamento ${id}` });
  cacheClear('equipamentos');
}
