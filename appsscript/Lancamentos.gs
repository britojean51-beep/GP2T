// ============================================================================
// Lancamentos.gs — Equivalente ao backend/src/services/lancamentos.service.js.
// Ponto mais sensível do sistema: cálculo de Horas/L-h/L-Ton no servidor
// (nunca confia no cliente), validação de horímetro retroativo, upsert
// idempotente por ID (reenvio offline nunca duplica), e atualização do
// horímetro "atual" do equipamento.
// ============================================================================
function round(v, d) {
  d = d || 2;
  var p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
}
function num(v) {
  var n = Number(v);
  return v === '' || v === null || v === undefined || isNaN(n) ? NaN : n;
}

function mapOutLancamento(l) {
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

function getAllLancamentosRaw() {
  var rows = cacheGet('lancamentos:all');
  if (!rows) {
    rows = getAllRows(TABS.LANCAMENTOS);
    cacheSet('lancamentos:all', rows);
  }
  return rows;
}

function lancamentosList(params) {
  var list = getAllLancamentosRaw().map(mapOutLancamento);
  if (params.data) list = list.filter(function (l) { return l.data === params.data; });
  if (params.equipamentoId) list = list.filter(function (l) { return l.equipamentoId === params.equipamentoId; });
  if (params.operadorId) list = list.filter(function (l) { return l.operadorId === params.operadorId; });
  list.sort(function (a, b) {
    if (a.data !== b.data) return a.data < b.data ? 1 : -1;
    return (a.criadoEm || '') < (b.criadoEm || '') ? 1 : -1;
  });
  if (params.limit) list = list.slice(0, Number(params.limit));
  return list;
}

// Validações bloqueantes: campos obrigatórios, horímetro final < inicial,
// litros/toneladas negativos, horas <= 0.
function validarCamposLancamento(input) {
  var erros = [];
  if (!input.data) erros.push('Informe a data.');
  if (!input.equipamentoId) erros.push('Selecione o equipamento.');
  if (!input.operadorId) erros.push('Selecione o operador.');

  var hi = num(input.horimetroInicial);
  var hf = num(input.horimetroFinal);
  var lt = num(input.litros);
  var tn = num(input.toneladas);

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
  return { hi: hi, hf: hf, lt: lt, tn: tn };
}

function ultimoLancamentoDoEquipamento(equipamentoId, excluirId) {
  var rows = getAllLancamentosRaw().map(mapOutLancamento).filter(function (l) {
    return l.equipamentoId === equipamentoId && l.id !== excluirId;
  });
  if (!rows.length) return null;
  rows.sort(function (a, b) {
    var ca = a.data + 'T' + (a.criadoEm || '');
    var cb = b.data + 'T' + (b.criadoEm || '');
    return ca < cb ? 1 : -1;
  });
  return rows[0];
}

function resolverEquipamentoOperador(equipamentoId, operadorId) {
  var equip = getAllRows(TABS.EQUIPAMENTOS).filter(function (e) { return e.ID === equipamentoId; })[0];
  if (!equip) throw new AppError(400, 'EQUIPAMENTO_INVALIDO', 'Equipamento não encontrado.');
  var oper = getAllRows(TABS.OPERADORES).filter(function (o) { return o.ID === operadorId; })[0];
  if (!oper) throw new AppError(400, 'OPERADOR_INVALIDO', 'Operador não encontrado.');
  return { equip: equip, oper: oper };
}

function lancamentosCreate(input, ctx) {
  var clientId = input.id;

  // Idempotência: reenvio offline com o mesmo ID vira update, nunca duplica.
  if (clientId) {
    var existente = findRowNumberById(TABS.LANCAMENTOS, 'ID', clientId);
    if (existente) return lancamentosUpdate(clientId, input, ctx, { viaUpsert: true });
  }

  var v = validarCamposLancamento(input);
  var eo = resolverEquipamentoOperador(input.equipamentoId, input.operadorId);
  var equip = eo.equip, oper = eo.oper;

  var ultimo = ultimoLancamentoDoEquipamento(input.equipamentoId, null);
  if (ultimo && v.hi < ultimo.horimetroFinal) {
    var autorizado = input.autorizacaoAdmin === true && ctx.user.perfil === 'ADMINISTRADOR';
    if (!autorizado) {
      throw new AppError(409, 'HORIMETRO_INFERIOR',
        '⚠️ O horímetro informado (' + v.hi + ') é menor que o último registro de ' + equip['Código'] + ' (' + ultimo.horimetroFinal + '). Requer autorização de administrador.');
    }
  }

  var horas = round(v.hf - v.hi, 2);
  var lh = round(v.lt / horas, 2);
  var lton = v.tn > 0 ? round(v.lt / v.tn, 3) : 0;
  var id = clientId || Utilities.getUuid();
  var now = new Date().toISOString();

  appendRow(TABS.LANCAMENTOS, {
    Data: input.data, Equipamento: equip['Código'], Operador: oper.Nome,
    'Horímetro Inicial': v.hi, 'Horímetro Final': v.hf, Horas: horas, Litros: v.lt, Toneladas: v.tn,
    'L/h': lh, 'L/Ton': lton, ID: id, EquipamentoId: equip.ID, OperadorId: oper.ID,
    CriadoEm: now, CriadoPor: ctx.user.nome, AtualizadoEm: now, AtualizadoPor: ctx.user.nome,
  });

  if (v.hf >= num(equip['Horímetro Atual'] || 0)) {
    var eqRow = findRowNumberById(TABS.EQUIPAMENTOS, 'ID', equip.ID);
    if (eqRow) {
      updateRow(TABS.EQUIPAMENTOS, eqRow, { 'Horímetro Atual': v.hf, AtualizadoEm: now, AtualizadoPor: ctx.user.nome });
      cacheClear('equipamentos');
    }
  }

  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'criar', entidade: 'lancamentos', entidadeId: id, detalhes: 'Lançamento ' + equip['Código'] + ' em ' + input.data });
  cacheClear('lancamentos');

  return { id: id, data: input.data, equipamentoId: equip.ID, operadorId: oper.ID, horimetroInicial: v.hi, horimetroFinal: v.hf, horas: horas, litros: v.lt, toneladas: v.tn, lh: lh, lton: lton };
}

function lancamentosUpdate(id, input, ctx, opts) {
  opts = opts || {};
  var rowNumber = findRowNumberById(TABS.LANCAMENTOS, 'ID', id);
  if (!rowNumber) {
    if (opts.viaUpsert) throw new AppError(500, 'ERRO_INTERNO', 'Falha ao localizar lançamento para sincronizar.');
    throw new AppError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  }

  var v = validarCamposLancamento(input);
  var eo = resolverEquipamentoOperador(input.equipamentoId, input.operadorId);
  var equip = eo.equip, oper = eo.oper;

  var ultimo = ultimoLancamentoDoEquipamento(input.equipamentoId, id);
  if (ultimo && v.hi < ultimo.horimetroFinal) {
    var autorizado = input.autorizacaoAdmin === true && ctx.user.perfil === 'ADMINISTRADOR';
    if (!autorizado) {
      throw new AppError(409, 'HORIMETRO_INFERIOR',
        '⚠️ O horímetro informado (' + v.hi + ') é menor que o último registro de ' + equip['Código'] + ' (' + ultimo.horimetroFinal + '). Requer autorização de administrador.');
    }
  }

  var horas = round(v.hf - v.hi, 2);
  var lh = round(v.lt / horas, 2);
  var lton = v.tn > 0 ? round(v.lt / v.tn, 3) : 0;
  var now = new Date().toISOString();

  updateRow(TABS.LANCAMENTOS, rowNumber, {
    Data: input.data, Equipamento: equip['Código'], Operador: oper.Nome,
    'Horímetro Inicial': v.hi, 'Horímetro Final': v.hf, Horas: horas, Litros: v.lt, Toneladas: v.tn,
    'L/h': lh, 'L/Ton': lton, EquipamentoId: equip.ID, OperadorId: oper.ID,
    AtualizadoEm: now, AtualizadoPor: ctx.user.nome,
  });

  logAudit({
    usuarioId: ctx.user.id, usuarioNome: ctx.user.nome,
    acao: opts.viaUpsert ? 'sincronizar' : 'editar',
    entidade: 'lancamentos', entidadeId: id, detalhes: 'Atualizou lançamento ' + id,
  });
  cacheClear('lancamentos');

  return { id: id, data: input.data, equipamentoId: equip.ID, operadorId: oper.ID, horimetroInicial: v.hi, horimetroFinal: v.hf, horas: horas, litros: v.lt, toneladas: v.tn, lh: lh, lton: lton };
}

function lancamentosDelete(id, ctx) {
  var rowNumber = findRowNumberById(TABS.LANCAMENTOS, 'ID', id);
  if (!rowNumber) throw new AppError(404, 'NAO_ENCONTRADO', 'Lançamento não encontrado.');
  deleteRow(TABS.LANCAMENTOS, rowNumber);
  logAudit({ usuarioId: ctx.user.id, usuarioNome: ctx.user.nome, acao: 'excluir', entidade: 'lancamentos', entidadeId: id, detalhes: 'Excluiu lançamento ' + id });
  cacheClear('lancamentos');
  return null;
}
