// ============================================================================
// Resumos.gs — Equivalente ao backend/src/services/resumos.service.js.
// Recalcula tudo a partir dos dados brutos (Lançamento Diário, Equipamentos,
// Manutenções) — nunca lê as células já calculadas da planilha, pra não
// quebrar se o usuário reformatar/editar o painel livremente. Só leitura.
// ============================================================================
function roundR(v, d) {
  d = d || 2;
  var p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
}
function numR(v) {
  var n = Number(v);
  return v === '' || v === null || v === undefined || isNaN(n) ? 0 : n;
}
function div(a, b, d) {
  return b > 0 ? roundR(a / b, d || 2) : 0;
}

function getLancamentosRaw() {
  var rows = cacheGet('resumos:lancamentos');
  if (!rows) {
    rows = getAllRows(TABS.LANCAMENTOS);
    cacheSet('resumos:lancamentos', rows);
  }
  return rows;
}
function getEquipamentosRaw() {
  var rows = cacheGet('resumos:equipamentos');
  if (!rows) {
    rows = getAllRows(TABS.EQUIPAMENTOS);
    cacheSet('resumos:equipamentos', rows);
  }
  return rows;
}
function getManutencoesRaw() {
  var rows = cacheGet('resumos:manutencoes');
  if (!rows) {
    rows = getAllRows(TABS.MANUTENCOES);
    cacheSet('resumos:manutencoes', rows);
  }
  return rows;
}

function hojeISO() {
  return Utilities.formatDate(new Date(), Session.getScriptTimeZone(), 'yyyy-MM-dd');
}

// Aritmética de data em cima da string ISO (evita fuso-horário/DST — os
// valores de "Data" são sempre "YYYY-MM-DD" puro, sem hora).
function addDiasISO(dataISO, n) {
  var partes = dataISO.split('-').map(Number);
  var dt = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2]));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// Segunda=1 ... Domingo=7 (igual ao WEEKDAY(data,2) da planilha).
function diaDaSemanaISO(dataISO) {
  var partes = dataISO.split('-').map(Number);
  var jsDay = new Date(Date.UTC(partes[0], partes[1] - 1, partes[2])).getUTCDay();
  return jsDay === 0 ? 7 : jsDay;
}

var NOMES_DIA = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

function agregaLancamentos(lancamentos) {
  var equipamentos = {}, operadores = {};
  var horas = 0, diesel = 0, producao = 0;
  lancamentos.forEach(function (l) {
    if (l.Equipamento) equipamentos[l.Equipamento] = true;
    if (l.Operador) operadores[l.Operador] = true;
    horas += numR(l.Horas);
    diesel += numR(l.Litros);
    producao += numR(l.Toneladas);
  });
  return {
    equipamentosCount: Object.keys(equipamentos).length,
    operadoresCount: Object.keys(operadores).length,
    horas: roundR(horas),
    diesel: roundR(diesel),
    producao: roundR(producao),
    lhMedio: div(diesel, horas),
    ltonMedio: div(diesel, producao),
  };
}

function getResumoDiario(dataISO) {
  var data = dataISO || hojeISO();
  var lancamentos = getLancamentosRaw();
  var manutencoes = getManutencoesRaw();
  var doDia = lancamentos.filter(function (l) { return l.Data === data; });
  var manutencoesDoDia = manutencoes.filter(function (m) { return m.Data === data; }).length;

  var agregado = agregaLancamentos(doDia);
  var detalhado = doDia.slice()
    .sort(function (a, b) { return (a.CriadoEm || '') < (b.CriadoEm || '') ? -1 : 1; })
    .map(function (l) {
      return {
        data: l.Data, equipamento: l.Equipamento, operador: l.Operador,
        horas: numR(l.Horas), diesel: numR(l.Litros), lh: numR(l['L/h']),
        producao: numR(l.Toneladas), lton: numR(l['L/Ton']),
      };
    });

  return Object.assign({ data: data }, agregado, { manutencoesCount: manutencoesDoDia, detalhado: detalhado });
}

function getResumoSemanal(dataRefISO) {
  var dataRef = dataRefISO || hojeISO();
  var inicioSemana = addDiasISO(dataRef, -(diaDaSemanaISO(dataRef) - 1));
  var fimSemana = addDiasISO(inicioSemana, 6);

  var lancamentos = getLancamentosRaw();
  var manutencoes = getManutencoesRaw();
  var daSemana = lancamentos.filter(function (l) { return l.Data >= inicioSemana && l.Data <= fimSemana; });
  var manutencoesDaSemana = manutencoes.filter(function (m) { return m.Data >= inicioSemana && m.Data <= fimSemana; }).length;

  var agregado = agregaLancamentos(daSemana);
  var diasComOperacao = Object.keys(daSemana.reduce(function (acc, l) { acc[l.Data] = true; return acc; }, {})).length;
  var ltonGeral = div(agregado.diesel, agregado.producao);

  var diasDetalhe = [];
  for (var i = 0; i < 7; i++) {
    var data = addDiasISO(inicioSemana, i);
    var doDia = lancamentos.filter(function (l) { return l.Data === data; });
    var ag = agregaLancamentos(doDia);
    var descricao = ag.equipamentosCount === 0
      ? 'Sem lançamentos no dia.'
      : 'Operaram ' + ag.equipamentosCount + ' equipamento(s), totalizando ' + ag.horas.toFixed(2) + ' h, consumo de ' + ag.diesel.toFixed(2) + ' L de Diesel e produção de ' + ag.producao.toFixed(2) + ' t. Eficiência: ' + ag.lhMedio.toFixed(2) + ' L/h e ' + div(ag.diesel, ag.producao, 3).toFixed(3) + ' L/Ton.';
    diasDetalhe.push({
      dia: NOMES_DIA[i], data: data, equipamentos: ag.equipamentosCount, horas: ag.horas,
      diesel: ag.diesel, producao: ag.producao, lh: ag.lhMedio, lton: div(ag.diesel, ag.producao, 3), descricao: descricao,
    });
  }

  var equipamentosSemanaSet = {};
  daSemana.forEach(function (l) { if (l.Equipamento) equipamentosSemanaSet[l.Equipamento] = true; });
  var equipamentosSemana = Object.keys(equipamentosSemanaSet).sort();
  var consolidadoEquipamentos = equipamentosSemana.map(function (codigo) {
    var doEquip = daSemana.filter(function (l) { return l.Equipamento === codigo; });
    var ag = agregaLancamentos(doEquip);
    var manutencoesEquip = manutencoes.filter(function (m) { return m.Equipamento === codigo; }).length;
    return {
      equipamento: codigo, horas: ag.horas, diesel: ag.diesel, producao: ag.producao,
      lh: ag.lhMedio, lton: ag.ltonMedio, operadores: ag.operadoresCount, manutencoes: manutencoesEquip,
    };
  });

  return {
    dataReferencia: dataRef, inicioSemana: inicioSemana, fimSemana: fimSemana,
    horas: agregado.horas, diesel: agregado.diesel, producao: agregado.producao,
    ltonGeral: ltonGeral, lhMedio: agregado.lhMedio, diasComOperacao: diasComOperacao,
    equipamentosCount: agregado.equipamentosCount, manutencoesCount: manutencoesDaSemana,
    dias: diasDetalhe, consolidadoEquipamentos: consolidadoEquipamentos,
  };
}

function getResumoMensal(anoMes) {
  var mes = anoMes || hojeISO().slice(0, 7);
  var lancamentos = getLancamentosRaw().filter(function (l) { return String(l.Data || '').indexOf(mes) === 0; });

  var equipamentosSet = {};
  lancamentos.forEach(function (l) { if (l.Equipamento) equipamentosSet[l.Equipamento] = true; });
  var equipamentos = Object.keys(equipamentosSet).sort();

  var linhas = equipamentos.map(function (codigo) {
    var doEquip = lancamentos.filter(function (l) { return l.Equipamento === codigo; });
    var ag = agregaLancamentos(doEquip);
    return { equipamento: codigo, consumoTotal: ag.diesel, horasTotal: ag.horas, lhMedio: ag.lhMedio, producaoTotal: ag.producao, ltonMedio: ag.ltonMedio };
  });

  return { mes: mes, linhas: linhas };
}

function getHistOperadores() {
  var lancamentos = getLancamentosRaw();
  var manutencoes = getManutencoesRaw();
  var operadoresSet = {};
  lancamentos.forEach(function (l) { if (l.Operador) operadoresSet[l.Operador] = true; });
  var operadores = Object.keys(operadoresSet).sort();

  return operadores.map(function (nome) {
    var deste = lancamentos.filter(function (l) { return l.Operador === nome; });
    var ag = agregaLancamentos(deste);
    var equipUsadosSet = {};
    deste.forEach(function (l) { if (l.Equipamento) equipUsadosSet[l.Equipamento] = true; });
    var equipamentosUtilizados = Object.keys(equipUsadosSet).join(', ');
    var diasSet = {};
    deste.forEach(function (l) { diasSet[l.Data] = true; });
    var dias = Object.keys(diasSet).length;
    var manutencoesCount = manutencoes.filter(function (m) { return m['Operador/Responsável'] === nome; }).length;
    var ultimaAtividade = deste.reduce(function (max, l) { return l.Data > max ? l.Data : max; }, '');
    return {
      operador: nome, equipamentosUtilizados: equipamentosUtilizados, dias: dias,
      horas: ag.horas, diesel: ag.diesel, toneladas: ag.producao, lh: ag.lhMedio, lton: ag.ltonMedio,
      manutencoes: manutencoesCount, ultimaAtividade: ultimaAtividade || null,
    };
  });
}

function getHistEquipamentos() {
  var equipamentosRaw = getEquipamentosRaw();
  var lancamentos = getLancamentosRaw();
  var manutencoes = getManutencoesRaw();
  var equipamentos = equipamentosRaw
    .filter(function (e) { return e['Código']; })
    .slice()
    .sort(function (a, b) { return a['Código'] < b['Código'] ? -1 : 1; });

  return equipamentos.map(function (e) {
    var codigo = e['Código'];
    var deste = lancamentos.filter(function (l) { return l.Equipamento === codigo; });
    var ag = agregaLancamentos(deste);
    var operUsadosSet = {};
    deste.forEach(function (l) { if (l.Operador) operUsadosSet[l.Operador] = true; });
    var operadoresUtilizados = Object.keys(operUsadosSet).join(', ');
    var manutencoesCount = manutencoes.filter(function (m) { return m.Equipamento === codigo; }).length;
    return {
      equipamento: codigo, tipo: e.Tipo, modelo: e.Modelo, status: e.Status,
      horas: ag.horas, diesel: ag.diesel, toneladas: ag.producao, lh: ag.lhMedio, lton: ag.ltonMedio,
      operadoresUtilizados: operadoresUtilizados, manutencoes: manutencoesCount,
    };
  });
}
