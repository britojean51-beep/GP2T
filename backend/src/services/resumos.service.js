// ============================================================================
// resumos.service.js — Painéis "Resumo Diário/Semanal/Mensal" e "Histórico
// de Operadores/Equipamentos", trazidos do que antes só existia como fórmula
// nativa do Sheets nas abas de mesmo nome. Recalcula tudo em JS a partir dos
// dados brutos (Lançamento Diário, Equipamentos, Operadores, Manutenções) —
// nunca lê as células já calculadas da planilha, pelo mesmo motivo de sempre
// neste projeto: o usuário pode reformatar/editar o painel na planilha
// livremente, sem que isso quebre o app.
//
// Tudo aqui é somente leitura — nenhuma função desta aba escreve na planilha.
// ============================================================================
import { getAllRows } from '../lib/sheets.js';
import { TABS } from '../config/schema.js';
import { cacheGet, cacheSet } from '../lib/cache.js';

function round(v, d = 2) {
  const p = Math.pow(10, d);
  return Math.round((Number(v) + Number.EPSILON) * p) / p;
}
function num(v) {
  const n = Number(v);
  return v === '' || v == null || isNaN(n) ? 0 : n;
}
function div(a, b, d = 2) {
  return b > 0 ? round(a / b, d) : 0;
}

async function getLancamentosRaw() {
  const key = 'resumos:lancamentos';
  let rows = cacheGet(key);
  if (!rows) {
    rows = await getAllRows(TABS.LANCAMENTOS);
    cacheSet(key, rows);
  }
  return rows;
}
async function getEquipamentosRaw() {
  const key = 'resumos:equipamentos';
  let rows = cacheGet(key);
  if (!rows) {
    rows = await getAllRows(TABS.EQUIPAMENTOS);
    cacheSet(key, rows);
  }
  return rows;
}
async function getManutencoesRaw() {
  const key = 'resumos:manutencoes';
  let rows = cacheGet(key);
  if (!rows) {
    rows = await getAllRows(TABS.MANUTENCOES);
    cacheSet(key, rows);
  }
  return rows;
}

function hoje() {
  return new Date().toISOString().slice(0, 10);
}

// Aritmética de data em cima da string ISO (evita fuso-horário/DST — os
// valores de "Data" salvos são sempre "YYYY-MM-DD" puro, sem hora).
function addDiasISO(dataISO, n) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const dt = new Date(Date.UTC(a, m - 1, d));
  dt.setUTCDate(dt.getUTCDate() + n);
  return dt.toISOString().slice(0, 10);
}
// Segunda=1 ... Domingo=7 (igual ao WEEKDAY(data,2) da planilha).
function diaDaSemanaISO(dataISO) {
  const [a, m, d] = dataISO.split('-').map(Number);
  const jsDay = new Date(Date.UTC(a, m - 1, d)).getUTCDay(); // 0=domingo..6=sábado
  return jsDay === 0 ? 7 : jsDay;
}

const NOMES_DIA = ['Segunda-feira', 'Terça-feira', 'Quarta-feira', 'Quinta-feira', 'Sexta-feira', 'Sábado', 'Domingo'];

function agregaLancamentos(lancamentos) {
  const equipamentos = new Set();
  const operadores = new Set();
  let horas = 0, diesel = 0, producao = 0;
  for (const l of lancamentos) {
    if (l.Equipamento) equipamentos.add(l.Equipamento);
    if (l.Operador) operadores.add(l.Operador);
    horas += num(l.Horas);
    diesel += num(l.Litros);
    producao += num(l.Toneladas);
  }
  return {
    equipamentosCount: equipamentos.size,
    operadoresCount: operadores.size,
    horas: round(horas),
    diesel: round(diesel),
    producao: round(producao),
    lhMedio: div(diesel, horas),
    ltonMedio: div(diesel, producao),
  };
}

export async function getResumoDiario(dataISO) {
  const data = dataISO || hoje();
  const [lancamentos, manutencoes] = await Promise.all([getLancamentosRaw(), getManutencoesRaw()]);
  const doDia = lancamentos.filter((l) => l.Data === data);
  const manutencoesDoDia = manutencoes.filter((m) => m.Data === data).length;

  const agregado = agregaLancamentos(doDia);
  const detalhado = doDia
    .slice()
    .sort((a, b) => (a.CriadoEm || '') < (b.CriadoEm || '') ? -1 : 1)
    .map((l) => ({
      data: l.Data,
      equipamento: l.Equipamento,
      operador: l.Operador,
      horas: num(l.Horas),
      diesel: num(l.Litros),
      lh: num(l['L/h']),
      producao: num(l.Toneladas),
      lton: num(l['L/Ton']),
    }));

  return { data, ...agregado, manutencoesCount: manutencoesDoDia, detalhado };
}

export async function getResumoSemanal(dataRefISO) {
  const dataRef = dataRefISO || hoje();
  const inicioSemana = addDiasISO(dataRef, -(diaDaSemanaISO(dataRef) - 1));
  const fimSemana = addDiasISO(inicioSemana, 6);

  const [lancamentos, manutencoes] = await Promise.all([getLancamentosRaw(), getManutencoesRaw()]);
  const daSemana = lancamentos.filter((l) => l.Data >= inicioSemana && l.Data <= fimSemana);
  const manutencoesDaSemana = manutencoes.filter((m) => m.Data >= inicioSemana && m.Data <= fimSemana).length;

  const agregado = agregaLancamentos(daSemana);
  const diasComOperacao = new Set(daSemana.map((l) => l.Data)).size;
  const ltonGeral = div(agregado.diesel, agregado.producao);

  const diasDetalhe = [];
  for (let i = 0; i < 7; i++) {
    const data = addDiasISO(inicioSemana, i);
    const doDia = lancamentos.filter((l) => l.Data === data);
    const ag = agregaLancamentos(doDia);
    const descricao = ag.equipamentosCount === 0
      ? 'Sem lançamentos no dia.'
      : `Operaram ${ag.equipamentosCount} equipamento(s), totalizando ${ag.horas.toFixed(2)} h, consumo de ${ag.diesel.toFixed(2)} L de Diesel e produção de ${ag.producao.toFixed(2)} t. Eficiência: ${ag.lhMedio.toFixed(2)} L/h e ${div(ag.diesel, ag.producao, 3).toFixed(3)} L/Ton.`;
    diasDetalhe.push({
      dia: NOMES_DIA[i],
      data,
      equipamentos: ag.equipamentosCount,
      horas: ag.horas,
      diesel: ag.diesel,
      producao: ag.producao,
      lh: ag.lhMedio,
      lton: div(ag.diesel, ag.producao, 3),
      descricao,
    });
  }

  const equipamentosSemana = [...new Set(daSemana.map((l) => l.Equipamento).filter(Boolean))].sort();
  const consolidadoEquipamentos = equipamentosSemana.map((codigo) => {
    const doEquip = daSemana.filter((l) => l.Equipamento === codigo);
    const ag = agregaLancamentos(doEquip);
    const manutencoesEquip = manutencoes.filter((m) => m.Equipamento === codigo).length;
    return {
      equipamento: codigo,
      horas: ag.horas,
      diesel: ag.diesel,
      producao: ag.producao,
      lh: ag.lhMedio,
      lton: ag.ltonMedio,
      operadores: ag.operadoresCount,
      manutencoes: manutencoesEquip,
    };
  });

  return {
    dataReferencia: dataRef,
    inicioSemana,
    fimSemana,
    horas: agregado.horas,
    diesel: agregado.diesel,
    producao: agregado.producao,
    ltonGeral,
    lhMedio: agregado.lhMedio,
    diasComOperacao,
    equipamentosCount: agregado.equipamentosCount,
    manutencoesCount: manutencoesDaSemana,
    dias: diasDetalhe,
    consolidadoEquipamentos,
  };
}

export async function getResumoMensal(anoMes) {
  const mes = anoMes || hoje().slice(0, 7);
  const lancamentos = (await getLancamentosRaw()).filter((l) => (l.Data || '').startsWith(mes));

  const equipamentos = [...new Set(lancamentos.map((l) => l.Equipamento).filter(Boolean))].sort();
  const linhas = equipamentos.map((codigo) => {
    const doEquip = lancamentos.filter((l) => l.Equipamento === codigo);
    const ag = agregaLancamentos(doEquip);
    return {
      equipamento: codigo,
      consumoTotal: ag.diesel,
      horasTotal: ag.horas,
      lhMedio: ag.lhMedio,
      producaoTotal: ag.producao,
      ltonMedio: ag.ltonMedio,
    };
  });

  return { mes, linhas };
}

export async function getHistOperadores() {
  const [lancamentos, manutencoes] = await Promise.all([getLancamentosRaw(), getManutencoesRaw()]);
  const operadores = [...new Set(lancamentos.map((l) => l.Operador).filter(Boolean))].sort();

  return operadores.map((nome) => {
    const deste = lancamentos.filter((l) => l.Operador === nome);
    const ag = agregaLancamentos(deste);
    const equipamentosUtilizados = [...new Set(deste.map((l) => l.Equipamento).filter(Boolean))].join(', ');
    const dias = new Set(deste.map((l) => l.Data)).size;
    const manutencoesCount = manutencoes.filter((m) => m['Operador/Responsável'] === nome).length;
    const ultimaAtividade = deste.reduce((max, l) => (l.Data > max ? l.Data : max), '');
    return {
      operador: nome,
      equipamentosUtilizados,
      dias,
      horas: ag.horas,
      diesel: ag.diesel,
      toneladas: ag.producao,
      lh: ag.lhMedio,
      lton: ag.ltonMedio,
      manutencoes: manutencoesCount,
      ultimaAtividade: ultimaAtividade || null,
    };
  });
}

export async function getHistEquipamentos() {
  const [equipamentosRaw, lancamentos, manutencoes] = await Promise.all([
    getEquipamentosRaw(),
    getLancamentosRaw(),
    getManutencoesRaw(),
  ]);
  const equipamentos = equipamentosRaw
    .filter((e) => e['Código'])
    .slice()
    .sort((a, b) => (a['Código'] < b['Código'] ? -1 : 1));

  return equipamentos.map((e) => {
    const codigo = e['Código'];
    const deste = lancamentos.filter((l) => l.Equipamento === codigo);
    const ag = agregaLancamentos(deste);
    const operadoresUtilizados = [...new Set(deste.map((l) => l.Operador).filter(Boolean))].join(', ');
    const manutencoesCount = manutencoes.filter((m) => m.Equipamento === codigo).length;
    return {
      equipamento: codigo,
      tipo: e.Tipo,
      modelo: e.Modelo,
      status: e.Status,
      horas: ag.horas,
      diesel: ag.diesel,
      toneladas: ag.producao,
      lh: ag.lhMedio,
      lton: ag.ltonMedio,
      operadoresUtilizados,
      manutencoes: manutencoesCount,
    };
  });
}
