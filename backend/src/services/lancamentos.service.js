import { randomUUID } from 'crypto';
import { getAllRows, appendRow, findRowNumberById, updateRow, deleteRow } from '../lib/sheets.js';
import { TABS } from '../config/schema.js';
import { AppError } from '../utils/AppError.js';
import { logAudit } from './auditoria.service.js';
import { cacheGet, cacheSet, cacheClear } from '../lib/cache.js';

function round(v, d = 2) {
  const p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
}
function num(v) {
  return v === '' || v == null || isNaN(Number(v)) ? NaN : Number(v);
}

function mapOut(l) {
  return {
    id: l.ID,
    data: l.Data,
    equipamento: l.Equipamento,
    operador: l.Operador,
    equipamentoId: l.EquipamentoId,
    operadorId: l.OperadorId,
    horimetroInicial: num(l['Horímetro Inicial']),
    horimetroFinal: num(l['Horímetro Final']),
    horas: num(l.Horas),
    litros: num(l.Litros),
    toneladas: num(l.Toneladas),
    lh: num(l['L/h']),
    lton: num(l['L/Ton']),
    criadoEm: l.CriadoEm,
    criadoPor: l.CriadoPor,
    atualizadoEm: l.AtualizadoEm,
  };
}

async function getAllLancamentosRaw() {
  const key = 'lancamentos:all';
  let rows = cacheGet(key);
  if (!rows) {
    rows = await getAllRows(TABS.LANCAMENTOS);
    cacheSet(key, rows);
  }
  return rows;
}

export async function listLancamentos({ data, equipamentoId, operadorId, limit } = {}) {
  const rows = (await getAllLancamentosRaw()).map(mapOut);
  let list = rows;
  if (data) list = list.filter((l) => l.data === data);
  if (equipamentoId) list = list.filter((l) => l.equipamentoId === equipamentoId);
  if (operadorId) list = list.filter((l) => l.operadorId === operadorId);
  list.sort((a, b) => {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (a.criadoEm || '') < (b.criadoEm || '') ? 1 : -1;
  });
  if (limit) list = list.slice(0, Number(limit));
  return list;
}

// Validações bloqueantes descritas no brief: campos obrigatórios, horímetro
// final < inicial, litros/toneladas negativos, horas <= 0.
function validarCampos({ data, equipamentoId, operadorId, horimetroInicial, horimetroFinal, litros, toneladas }) {
  const erros = [];
  if (!data) erros.push('Informe a data.');
  if (!equipamentoId) erros.push('Selecione o equipamento.');
  if (!operadorId) erros.push('Selecione o operador.');

  const hi = num(horimetroInicial);
  const hf = num(horimetroFinal);
  const lt = num(litros);
  const tn = num(toneladas);

  if (isNaN(hi)) erros.push('Informe o horímetro inicial.');
  if (isNaN(hf)) erros.push('Informe o horímetro final.');
  if (isNaN(lt)) erros.push('Informe o diesel (litros).');
  if (isNaN(tn)) erros.push('Informe a produção (toneladas).');

  if (!erros.length) {
    if (hf < hi) erros.push('⚠️ Horímetro final deve ser maior que o inicial.');
    if (lt < 0) erros.push('Litros não podem ser negativos.');
    if (tn < 0) erros.push('Toneladas não podem ser negativas.');
    if (hf - hi <= 0) erros.push('Horas devem ser maiores que zero.');
  }

  if (erros.length) throw new AppError(400, 'VALIDACAO', erros.join(' '));
  return { hi, hf, lt, tn };
}

async function ultimoLancamentoDoEquipamento(equipamentoId, excluirId) {
  const rows = (await getAllLancamentosRaw()).map(mapOut).filter((l) => l.equipamentoId === equipamentoId && l.id !== excluirId);
  if (!rows.length) return null;
  rows.sort((a, b) => {
    const ca = `${a.data}T${a.criadoEm || ''}`;
    const cb = `${b.data}T${b.criadoEm || ''}`;
    return ca < cb ? 1 : -1;
  });
  return rows[0];
}

async function resolverEquipamentoOperador(equipamentoId, operadorId) {
  const equipamentos = await getAllRows(TABS.EQUIPAMENTOS);
  const equip = equipamentos.find((e) => e.ID === equipamentoId);
  if (!equip) throw new AppError(400, 'EQUIPAMENTO_INVALIDO', 'Equipamento não encontrado.');

  const operadores = await getAllRows(TABS.OPERADORES);
  const oper = operadores.find((o) => o.ID === operadorId);
  if (!oper) throw new AppError(400, 'OPERADOR_INVALIDO', 'Operador não encontrado.');

  return { equip, oper };
}

export async function createLancamento(input, actor) {
  const clientId = input.id;

  // Idempotência: reenvio offline com o mesmo ID vira update, nunca duplica.
  if (clientId) {
    const existente = await findRowNumberById(TABS.LANCAMENTOS, 'ID', clientId);
    if (existente) return updateLancamento(clientId, input, actor, { viaUpsert: true });
  }

  const { hi, hf, lt, tn } = validarCampos(input);
  const { equip, oper } = await resolverEquipamentoOperador(input.equipamentoId, input.operadorId);

  const ultimo = await ultimoLancamentoDoEquipamento(input.equipamentoId, null);
  if (ultimo && hi < ultimo.horimetroFinal) {
    const autorizado = input.autorizacaoAdmin === true && actor.perfil === 'ADMINISTRADOR';
    if (!autorizado) {
      throw new AppError(
        409,
        'HORIMETRO_INFERIOR',
        `⚠️ O horímetro informado (${hi}) é menor que o último registro de ${equip['Código']} (${ultimo.horimetroFinal}). Requer autorização de administrador.`
      );
    }
  }

  const horas = round(hf - hi, 2);
  const lh = round(lt / horas, 2);
  const lton = tn > 0 ? round(lt / tn, 3) : 0;
  const id = clientId || randomUUID();
  const now = new Date().toISOString();

  await appendRow(TABS.LANCAMENTOS, {
    Data: input.data,
    Equipamento: equip['Código'],
    Operador: oper.Nome,
    'Horímetro Inicial': hi,
    'Horímetro Final': hf,
    Horas: horas,
    Litros: lt,
    Toneladas: tn,
    'L/h': lh,
    'L/Ton': lton,
    ID: id,
    EquipamentoId: equip.ID,
    OperadorId: oper.ID,
    CriadoEm: now,
    CriadoPor: actor.nome,
    AtualizadoEm: now,
    AtualizadoPor: actor.nome,
  });

  // Atualiza o horímetro/KM "atual" do equipamento se o novo final for maior.
  if (hf >= num(equip['Horímetro Atual'] || 0)) {
    const eqRow = await findRowNumberById(TABS.EQUIPAMENTOS, 'ID', equip.ID);
    if (eqRow) {
      await updateRow(TABS.EQUIPAMENTOS, eqRow, { 'Horímetro Atual': hf, AtualizadoEm: now, AtualizadoPor: actor.nome });
      cacheClear('equipamentos');
    }
  }

  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'criar', entidade: 'lancamentos', entidadeId: id, detalhes: `Lançamento ${equip['Código']} em ${input.data}` });
  cacheClear('lancamentos');

  return { id, data: input.data, equipamentoId: equip.ID, operadorId: oper.ID, horimetroInicial: hi, horimetroFinal: hf, horas, litros: lt, toneladas: tn, lh, lton };
}

export async function updateLancamento(id, input, actor, opts = {}) {
  const rowNumber = await findRowNumberById(TABS.LANCAMENTOS, 'ID', id);
  if (!rowNumber) {
    if (opts.viaUpsert) throw new AppError(500, 'ERRO_INTERNO', 'Falha ao localizar lançamento para sincronizar.');
    throw new AppError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  }

  const { hi, hf, lt, tn } = validarCampos(input);
  const { equip, oper } = await resolverEquipamentoOperador(input.equipamentoId, input.operadorId);

  const ultimo = await ultimoLancamentoDoEquipamento(input.equipamentoId, id);
  if (ultimo && hi < ultimo.horimetroFinal) {
    const autorizado = input.autorizacaoAdmin === true && actor.perfil === 'ADMINISTRADOR';
    if (!autorizado) {
      throw new AppError(
        409,
        'HORIMETRO_INFERIOR',
        `⚠️ O horímetro informado (${hi}) é menor que o último registro de ${equip['Código']} (${ultimo.horimetroFinal}). Requer autorização de administrador.`
      );
    }
  }

  const horas = round(hf - hi, 2);
  const lh = round(lt / horas, 2);
  const lton = tn > 0 ? round(lt / tn, 3) : 0;
  const now = new Date().toISOString();

  await updateRow(TABS.LANCAMENTOS, rowNumber, {
    Data: input.data,
    Equipamento: equip['Código'],
    Operador: oper.Nome,
    'Horímetro Inicial': hi,
    'Horímetro Final': hf,
    Horas: horas,
    Litros: lt,
    Toneladas: tn,
    'L/h': lh,
    'L/Ton': lton,
    EquipamentoId: equip.ID,
    OperadorId: oper.ID,
    AtualizadoEm: now,
    AtualizadoPor: actor.nome,
  });

  await logAudit({
    usuarioId: actor.id,
    usuarioNome: actor.nome,
    acao: opts.viaUpsert ? 'sincronizar' : 'editar',
    entidade: 'lancamentos',
    entidadeId: id,
    detalhes: `Atualizou lançamento ${id}`,
  });
  cacheClear('lancamentos');

  return { id, data: input.data, equipamentoId: equip.ID, operadorId: oper.ID, horimetroInicial: hi, horimetroFinal: hf, horas, litros: lt, toneladas: tn, lh, lton };
}

export async function deleteLancamento(id, actor) {
  const rowNumber = await findRowNumberById(TABS.LANCAMENTOS, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  await deleteRow(TABS.LANCAMENTOS, rowNumber);
  await logAudit({ usuarioId: actor.id, usuarioNome: actor.nome, acao: 'excluir', entidade: 'lancamentos', entidadeId: id, detalhes: `Excluiu lançamento ${id}` });
  cacheClear('lancamentos');
}
