// ============================================================================
// setup-sheet.js — Prepara a planilha para o app: cria as abas novas
// (Usuários, Auditoria, Config) e acrescenta as colunas técnicas nas abas
// existentes (Equipamentos, Operadores, Lançamento Diário), SEM alterar nem
// apagar nada que já existe. Seguro de rodar mais de uma vez (idempotente):
// só cria/adiciona o que ainda está faltando.
//
// Uso: npm run setup:sheet   (precisa do .env configurado)
// ============================================================================
import 'dotenv/config';
import { google } from 'googleapis';
import { getAuthClient } from '../src/config/googleAuth.js';
import { SPREADSHEET_ID } from '../src/config/env.js';
import { TABS } from '../src/config/schema.js';
import { headerRowOf } from '../src/lib/sheets.js';

// Abas base do controle operacional (a estrutura original do brief). Numa
// planilha nova/em branco elas ainda não existem — este script cria com
// exatamente essas colunas. Numa planilha que já tinha essas abas, elas são
// preservadas como estão (nada aqui sobrescreve dado existente).
const BASE_TABS = {
  [TABS.EQUIPAMENTOS]: ['Código', 'Tipo', 'Modelo', 'Status', 'Horímetro Atual', 'KM Atual'],
  [TABS.OPERADORES]: ['Nome', 'Função', 'Status'],
  [TABS.LANCAMENTOS]: ['Data', 'Equipamento', 'Operador', 'Horímetro Inicial', 'Horímetro Final', 'Horas', 'Litros', 'Toneladas', 'L/h', 'L/Ton'],
};

const NEW_TABS = {
  [TABS.USUARIOS]: ['Id', 'Nome', 'Email', 'SenhaHash', 'Perfil', 'Status', 'CriadoEm'],
  [TABS.AUDITORIA]: ['Id', 'Timestamp', 'UsuarioId', 'UsuarioNome', 'Acao', 'Entidade', 'EntidadeId', 'Detalhes'],
  [TABS.CONFIG]: ['Funcoes', 'TiposEquipamento'],
};

const EXTRA_COLUMNS = {
  [TABS.EQUIPAMENTOS]: ['ID', 'Marca', 'CriadoEm', 'CriadoPor', 'AtualizadoEm', 'AtualizadoPor'],
  [TABS.OPERADORES]: ['ID', 'CriadoEm', 'CriadoPor', 'AtualizadoEm', 'AtualizadoPor'],
  [TABS.LANCAMENTOS]: ['ID', 'EquipamentoId', 'OperadorId', 'CriadoEm', 'CriadoPor', 'AtualizadoEm', 'AtualizadoPor'],
};

const CONFIG_SEED = {
  Funcoes: ['Motorista', 'Operador de Pá Carregadeira', 'Operador de Escavadeira', 'Operador de Motoniveladora', 'Operador de Trator'],
  TiposEquipamento: ['Caminhão Basculante', 'Caminhão Pipa', 'Pá Carregadeira', 'Motoniveladora', 'Escavadeira Hidráulica', 'Trator', 'Comboio'],
};

function colLetter(idx) {
  let s = '';
  idx += 1;
  while (idx > 0) {
    const rem = (idx - 1) % 26;
    s = String.fromCharCode(65 + rem) + s;
    idx = Math.floor((idx - 1) / 26);
  }
  return s;
}

async function main() {
  const auth = await getAuthClient();
  const sheets = google.sheets({ version: 'v4', auth });

  const meta = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
  const existingTitles = meta.data.sheets.map((s) => s.properties.title);
  console.log('Abas existentes na planilha:', existingTitles.join(', '));

  // 1. Cria as abas base + novas que ainda não existem.
  const todasAsAbas = { ...BASE_TABS, ...NEW_TABS };
  const addRequests = Object.keys(todasAsAbas)
    .filter((tab) => !existingTitles.includes(tab))
    .map((tab) => ({ addSheet: { properties: { title: tab } } }));
  if (addRequests.length) {
    await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: addRequests } });
    console.log('Abas criadas:', addRequests.map((r) => r.addSheet.properties.title).join(', '));
  }

  // 1b. Planilha nova do Google vem com uma aba padrão vazia (nome varia
  // conforme o idioma da conta: "Sheet1", "Página1" etc.) — remove só se não
  // for nenhuma das abas que este script gerencia e estiver realmente vazia
  // (nunca remove algo com dado dentro, nem uma aba criada pelo usuário).
  const abasGerenciadas = Object.keys(todasAsAbas);
  const candidatasSobra = existingTitles.filter((t) => !abasGerenciadas.includes(t));
  for (const tab of candidatasSobra) {
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `'${tab}'!A1:Z1` });
    const vazia = !cur.data.values || cur.data.values.length === 0;
    if (!vazia) {
      console.log(`Aba "${tab}" tem conteúdo — mantida sem alteração.`);
      continue;
    }
    const metaAtual = await sheets.spreadsheets.get({ spreadsheetId: SPREADSHEET_ID });
    if (metaAtual.data.sheets.length <= 1) {
      console.log(`Aba "${tab}" está vazia mas é a única da planilha — mantida.`);
      continue;
    }
    const tabId = metaAtual.data.sheets.find((s) => s.properties.title === tab)?.properties.sheetId;
    if (tabId != null) {
      await sheets.spreadsheets.batchUpdate({ spreadsheetId: SPREADSHEET_ID, requestBody: { requests: [{ deleteSheet: { sheetId: tabId } }] } });
      console.log(`Aba padrão "${tab}" (vazia) removida.`);
    }
  }

  // 2. Escreve cabeçalhos nas abas base + novas (só se a linha de cabeçalho
  // ainda estiver vazia). headerRowOf(tab) é 3 para Equipamentos/Operadores/
  // Lançamento Diário (layout com faixa de título) e 1 para as demais.
  for (const [tab, headers] of Object.entries(todasAsAbas)) {
    const hr = headerRowOf(tab);
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!${hr}:${hr}` });
    const jaTemCabecalho = cur.data.values && cur.data.values[0] && cur.data.values[0].length > 0;
    if (!jaTemCabecalho) {
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab}!A${hr}`,
        valueInputOption: 'RAW',
        requestBody: { values: [headers] },
      });
      console.log(`Cabeçalhos escritos em "${tab}" (linha ${hr}).`);
    } else {
      console.log(`"${tab}" já tem cabeçalho — mantido sem alteração.`);
    }
  }

  // 3. Acrescenta colunas técnicas ao final das abas existentes (só as que faltam).
  for (const [tab, cols] of Object.entries(EXTRA_COLUMNS)) {
    const hr = headerRowOf(tab);
    const cur = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${tab}!${hr}:${hr}` });
    const existing = (cur.data.values && cur.data.values[0]) || [];
    const missing = cols.filter((c) => !existing.includes(c));
    if (missing.length) {
      const startCol = colLetter(existing.length);
      await sheets.spreadsheets.values.update({
        spreadsheetId: SPREADSHEET_ID,
        range: `${tab}!${startCol}${hr}`,
        valueInputOption: 'RAW',
        requestBody: { values: [missing] },
      });
      console.log(`"${tab}": colunas técnicas adicionadas -> ${missing.join(', ')}`);
    } else {
      console.log(`"${tab}": nenhuma coluna nova necessária.`);
    }
  }

  // 4. Popula a aba Config com listas iniciais, só se ela estiver vazia.
  const cfgData = await sheets.spreadsheets.values.get({ spreadsheetId: SPREADSHEET_ID, range: `${TABS.CONFIG}!A2:B` });
  const cfgVazia = !cfgData.data.values || cfgData.data.values.length === 0;
  if (cfgVazia) {
    const maxLen = Math.max(CONFIG_SEED.Funcoes.length, CONFIG_SEED.TiposEquipamento.length);
    const rows = [];
    for (let i = 0; i < maxLen; i++) rows.push([CONFIG_SEED.Funcoes[i] || '', CONFIG_SEED.TiposEquipamento[i] || '']);
    await sheets.spreadsheets.values.update({
      spreadsheetId: SPREADSHEET_ID,
      range: `${TABS.CONFIG}!A2`,
      valueInputOption: 'RAW',
      requestBody: { values: rows },
    });
    console.log('"Config" populada com listas iniciais de Função/Tipo.');
  } else {
    console.log('"Config" já tem dados — mantida sem alteração.');
  }

  console.log('\n✅ Setup da planilha concluído com sucesso. Nada existente foi alterado ou removido.');
}

main().catch((e) => {
  console.error('❌ Erro no setup da planilha:', e.message);
  process.exit(1);
});
