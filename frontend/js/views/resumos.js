// ============================================================================
// views/resumos.js — Painéis "Resumo Diário/Semanal/Mensal" e "Histórico de
// Operadores/Equipamentos/Manutenções", trazidos do que antes só existia na
// planilha. Uma tela só, com sub-abas internas (não trocam a rota #/).
// ============================================================================
import { api, ApiError } from '../api.js';
import { esc } from '../ui.js';
import { fmt, hoje, dataBR } from '../format.js';

const SUBABAS = [
  { id: 'diario', label: 'Diário' },
  { id: 'semanal', label: 'Semanal' },
  { id: 'mensal', label: 'Mensal' },
  { id: 'operadores', label: 'Operadores' },
  { id: 'equipamentos', label: 'Equipamentos' },
  { id: 'manutencoes', label: 'Manutenções' },
];

export async function render() {
  const html = `
    <div class="page-head">
      <h1>📊 Resumos</h1>
    </div>
    <div class="subtabs" id="resumos-subtabs">
      ${SUBABAS.map((s, i) => `<button type="button" class="subtab-item ${i === 0 ? 'ativo' : ''}" data-sub="${s.id}">${esc(s.label)}</button>`).join('')}
    </div>
    <div id="resumos-conteudo" class="loading">Carregando…</div>
  `;
  return { html, montar };
}

function montar(root) {
  const conteudo = root.querySelector('#resumos-conteudo');
  root.querySelectorAll('[data-sub]').forEach((btn) => {
    btn.onclick = () => {
      root.querySelectorAll('[data-sub]').forEach((b) => b.classList.toggle('ativo', b === btn));
      carregar(btn.dataset.sub, conteudo);
    };
  });
  carregar('diario', conteudo);
}

const RENDERERS = {
  diario: renderDiario,
  semanal: renderSemanal,
  mensal: renderMensal,
  operadores: renderHistOperadores,
  equipamentos: renderHistEquipamentos,
  manutencoes: renderManutencoes,
};

// Contador de requisição: se o usuário troca de sub-aba (ou muda o filtro de
// data/mês) antes da resposta anterior voltar, a resposta antiga — que pode
// chegar DEPOIS da mais nova, já que são fetches independentes — é
// descartada em vez de sobrescrever o conteúdo já atualizado na tela.
let ultimaRequisicao = 0;

async function carregar(aba, conteudo, valor) {
  const minha = ++ultimaRequisicao;
  conteudo.className = 'loading';
  conteudo.innerHTML = 'Carregando…';
  try {
    const html = await RENDERERS[aba](valor);
    if (minha !== ultimaRequisicao) return;
    conteudo.className = '';
    conteudo.innerHTML = html;
    ligarFiltros(aba, conteudo);
  } catch (e) {
    if (minha !== ultimaRequisicao) return;
    conteudo.innerHTML = `<div class="aviso aviso--erro">Erro ao carregar: ${esc(e instanceof ApiError ? e.message : e.message)}</div>`;
  }
}

function ligarFiltros(aba, conteudo) {
  const dataInput = conteudo.querySelector('[data-filtro-data]');
  if (dataInput) dataInput.onchange = () => carregar(aba, conteudo, dataInput.value);
  const mesInput = conteudo.querySelector('[data-filtro-mes]');
  if (mesInput) mesInput.onchange = () => carregar(aba, conteudo, mesInput.value);
}

function kpiCard(label, valor) {
  return `<div class="kpi-card"><span class="kpi-label">${esc(label)}</span><span class="kpi-valor">${esc(valor)}</span></div>`;
}

function tabelaWrap(theadHTML, tbodyHTML, vazio) {
  if (!tbodyHTML) return `<p class="muted">${esc(vazio)}</p>`;
  return `<div class="tabela-wrap"><table class="tabela"><thead><tr>${theadHTML}</tr></thead><tbody>${tbodyHTML}</tbody></table></div>`;
}

// ---------- Diário ----------------------------------------------------------
async function renderDiario(data) {
  const dataAtual = data || hoje();
  const r = await api.get(`/resumos/diario?data=${dataAtual}`);
  const linhas = r.detalhado.map((d) => `
    <tr>
      <td>${esc(d.equipamento)}</td>
      <td>${esc(d.operador)}</td>
      <td>${fmt.n2(d.horas)}</td>
      <td>${fmt.n2(d.diesel)}</td>
      <td>${fmt.n2(d.lh)}</td>
      <td>${fmt.n2(d.producao)}</td>
      <td>${fmt.n3(d.lton)}</td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="filtros"><label>Data<input type="date" data-filtro-data value="${esc(dataAtual)}"></label></div>
      <div class="kpi-grid">
        ${kpiCard('Equipamentos', r.equipamentosCount)}
        ${kpiCard('Horas', fmt.n2(r.horas))}
        ${kpiCard('Diesel (L)', fmt.n2(r.diesel))}
        ${kpiCard('Produção (t)', fmt.n2(r.producao))}
        ${kpiCard('L/h médio', fmt.n2(r.lhMedio))}
        ${kpiCard('L/Ton médio', fmt.n3(r.ltonMedio))}
        ${kpiCard('Operadores', r.operadoresCount)}
        ${kpiCard('Manutenções', r.manutencoesCount)}
      </div>
    </div>
    <div class="card">
      <h2>Detalhamento por equipamento — ${esc(dataBR(dataAtual))}</h2>
      ${tabelaWrap('<th>Equipamento</th><th>Operador</th><th>Horas</th><th>Diesel</th><th>L/h</th><th>Produção</th><th>L/Ton</th>', linhas, 'Sem lançamentos nesta data.')}
    </div>
  `;
}

// ---------- Semanal ----------------------------------------------------------
async function renderSemanal(data) {
  const dataAtual = data || hoje();
  const r = await api.get(`/resumos/semanal?data=${dataAtual}`);
  const diasLinhas = r.dias.map((d) => `
    <tr>
      <td>${esc(d.dia)}</td>
      <td>${esc(dataBR(d.data))}</td>
      <td>${d.equipamentos}</td>
      <td>${fmt.n2(d.horas)}</td>
      <td>${fmt.n2(d.diesel)}</td>
      <td>${fmt.n2(d.producao)}</td>
      <td>${fmt.n2(d.lh)}</td>
      <td>${fmt.n3(d.lton)}</td>
    </tr>`).join('');
  const equipLinhas = r.consolidadoEquipamentos.map((e) => `
    <tr>
      <td>${esc(e.equipamento)}</td>
      <td>${fmt.n2(e.horas)}</td>
      <td>${fmt.n2(e.diesel)}</td>
      <td>${fmt.n2(e.producao)}</td>
      <td>${fmt.n2(e.lh)}</td>
      <td>${fmt.n3(e.lton)}</td>
      <td>${e.operadores}</td>
      <td>${e.manutencoes}</td>
    </tr>`).join('');
  const descricoes = r.dias.map((d) => `<p><strong>${esc(d.dia)} (${esc(dataBR(d.data))}):</strong> ${esc(d.descricao)}</p>`).join('');

  return `
    <div class="card">
      <div class="filtros"><label>Data de referência<input type="date" data-filtro-data value="${esc(dataAtual)}"></label></div>
      <p class="muted">Semana de ${esc(dataBR(r.inicioSemana))} a ${esc(dataBR(r.fimSemana))}</p>
      <div class="kpi-grid">
        ${kpiCard('Horas totais', fmt.n2(r.horas))}
        ${kpiCard('Diesel total (L)', fmt.n2(r.diesel))}
        ${kpiCard('Produção total (t)', fmt.n2(r.producao))}
        ${kpiCard('L/Ton geral', fmt.n3(r.ltonGeral))}
        ${kpiCard('L/h médio', fmt.n2(r.lhMedio))}
        ${kpiCard('Dias com operação', r.diasComOperacao)}
        ${kpiCard('Equipamentos', r.equipamentosCount)}
        ${kpiCard('Manutenções', r.manutencoesCount)}
      </div>
    </div>
    <div class="card">
      <h2>Detalhamento por dia</h2>
      ${tabelaWrap('<th>Dia</th><th>Data</th><th>Equip.</th><th>Horas</th><th>Diesel</th><th>Produção</th><th>L/h</th><th>L/Ton</th>', diasLinhas, 'Sem dados nesta semana.')}
      <div style="margin-top:14px">${descricoes}</div>
    </div>
    <div class="card">
      <h2>Consolidado por equipamento</h2>
      ${tabelaWrap('<th>Equipamento</th><th>Horas</th><th>Diesel</th><th>Produção</th><th>L/h</th><th>L/Ton</th><th>Operadores</th><th>Manutenções</th>', equipLinhas, 'Sem equipamentos nesta semana.')}
    </div>
  `;
}

// ---------- Mensal ----------------------------------------------------------
async function renderMensal(mes) {
  const mesAtual = mes || hoje().slice(0, 7);
  const r = await api.get(`/resumos/mensal?mes=${mesAtual}`);
  const linhas = r.linhas.map((l) => `
    <tr>
      <td>${esc(l.equipamento)}</td>
      <td>${fmt.n2(l.consumoTotal)}</td>
      <td>${fmt.n2(l.horasTotal)}</td>
      <td>${fmt.n2(l.lhMedio)}</td>
      <td>${fmt.n2(l.producaoTotal)}</td>
      <td>${fmt.n3(l.ltonMedio)}</td>
    </tr>`).join('');

  return `
    <div class="card">
      <div class="filtros"><label>Mês<input type="month" data-filtro-mes value="${esc(mesAtual)}"></label></div>
    </div>
    <div class="card">
      <h2>Desempenho da frota — ${esc(mesAtual)}</h2>
      ${tabelaWrap('<th>Equipamento</th><th>Consumo (L)</th><th>Horas</th><th>L/h médio</th><th>Produção (t)</th><th>L/Ton médio</th>', linhas, 'Sem lançamentos neste mês.')}
    </div>
  `;
}

// ---------- Histórico de Operadores ------------------------------------------
async function renderHistOperadores() {
  const lista = await api.get('/resumos/operadores');
  const linhas = lista.map((o) => `
    <tr>
      <td>${esc(o.operador)}</td>
      <td>${esc(o.equipamentosUtilizados)}</td>
      <td>${o.dias}</td>
      <td>${fmt.n2(o.horas)}</td>
      <td>${fmt.n2(o.diesel)}</td>
      <td>${fmt.n2(o.toneladas)}</td>
      <td>${fmt.n2(o.lh)}</td>
      <td>${fmt.n3(o.lton)}</td>
      <td>${o.manutencoes}</td>
      <td>${esc(dataBR(o.ultimaAtividade))}</td>
    </tr>`).join('');
  return `
    <div class="card">
      <h2>Histórico dos operadores</h2>
      ${tabelaWrap('<th>Operador</th><th>Equipamentos</th><th>Dias</th><th>Horas</th><th>Diesel</th><th>Toneladas</th><th>L/h</th><th>L/Ton</th><th>Manut.</th><th>Última atividade</th>', linhas, 'Nenhum lançamento registrado ainda.')}
    </div>
  `;
}

// ---------- Histórico de Equipamentos ----------------------------------------
async function renderHistEquipamentos() {
  const lista = await api.get('/resumos/equipamentos');
  const linhas = lista.map((e) => `
    <tr>
      <td>${esc(e.equipamento)}</td>
      <td>${esc(e.tipo)}</td>
      <td>${esc(e.modelo)}</td>
      <td>${esc(e.status)}</td>
      <td>${fmt.n2(e.horas)}</td>
      <td>${fmt.n2(e.diesel)}</td>
      <td>${fmt.n2(e.toneladas)}</td>
      <td>${fmt.n2(e.lh)}</td>
      <td>${fmt.n3(e.lton)}</td>
      <td>${esc(e.operadoresUtilizados)}</td>
      <td>${e.manutencoes}</td>
    </tr>`).join('');
  return `
    <div class="card">
      <h2>Histórico dos equipamentos</h2>
      ${tabelaWrap('<th>Equipamento</th><th>Tipo</th><th>Modelo</th><th>Status</th><th>Horas</th><th>Diesel</th><th>Toneladas</th><th>L/h</th><th>L/Ton</th><th>Operadores</th><th>Manut.</th>', linhas, 'Nenhum equipamento cadastrado ainda.')}
    </div>
  `;
}

// ---------- Manutenções (só leitura) -----------------------------------------
async function renderManutencoes() {
  const lista = await api.get('/manutencoes');
  const linhas = lista.map((m) => `
    <tr>
      <td>${esc(dataBR(m.data))}</td>
      <td>${esc(m.equipamento)}</td>
      <td>${esc(m.operadorResponsavel)}</td>
      <td>${esc(m.tipo)}</td>
      <td>${esc(m.servicoRealizado)}</td>
      <td>${esc(m.pecasTrocas)}</td>
      <td>${esc(m.observacao)}</td>
      <td>${m.proximaManutencao ? esc(dataBR(m.proximaManutencao)) : '—'}</td>
    </tr>`).join('');
  return `
    <div class="card">
      <div class="page-head"><h2>Manutenções</h2></div>
      <p class="muted">Cadastro continua manual, direto na planilha oficial — aqui é só leitura.</p>
      ${tabelaWrap('<th>Data</th><th>Equipamento</th><th>Responsável</th><th>Tipo</th><th>Serviço</th><th>Peças</th><th>Observação</th><th>Próxima</th>', linhas, 'Nenhuma manutenção registrada ainda.')}
    </div>
  `;
}
