// ============================================================================
// sheets.js — Wrapper central de acesso à Planilha Google.
//
// Regra de ouro: nunca assumir posição fixa de coluna (lê sempre a linha de
// cabeçalho — ver headerRowOf() — e resolve nome->índice), e nunca reaproveitar
// um número de linha "antigo" para escrever — toda escrita (update/delete) faz
// uma leitura FRESCA da coluna de ID imediatamente antes, para não corromper
// dados se alguém editou a planilha manualmente entre a leitura e a escrita.
//
// Toda leitura usa valueRenderOption: UNFORMATTED_VALUE. Sem isso, o Sheets
// devolve números já formatados no locale da planilha (pt_BR: "2,5" em vez
// de 2.5) — o JS não entende vírgula decimal (Number("2,5") é NaN), então
// qualquer coluna com casas decimais (L/h, L/Ton etc.) vinha zerada/errada
// na leitura. Com UNFORMATTED_VALUE o Sheets devolve o número puro.
// ============================================================================
import { google } from 'googleapis';
import { getAuthClient } from '../config/googleAuth.js';
import { SPREADSHEET_ID } from '../config/env.js';

let sheetsClient = null;
async function getClient() {
  if (sheetsClient) return sheetsClient;
  const auth = await getAuthClient();
  sheetsClient = google.sheets({ version: 'v4', auth });
  return sheetsClient;
}

// Linha do cabeçalho por aba. Equipamentos/Operadores/Lançamento Diário/
// Manutenções usam o layout "profissional" (faixa de título na linha 1,
// subtítulo na linha 2, cabeçalho de colunas na linha 3, dados a partir da
// linha 4). As abas internas do app (Usuários/Auditoria/Config) continuam
// simples, cabeçalho na linha 1 — nunca foram tocadas pela migração de layout.
const HEADER_ROW = { Equipamentos: 3, Operadores: 3, 'Lançamento Diário': 3, 'Manutenções': 3 };
function headerRowOf(tab) {
  return HEADER_ROW[tab] || 1;
}

// Colunas cujo texto "parece data" (ex.: "2026-08-31") o Sheets converte
// sozinho para um valor de data de verdade ao escrever via USER_ENTERED —
// necessário pra MAX()/comparação de intervalo funcionar nas fórmulas da
// planilha (Resumo Diário/Semanal etc.). Com UNFORMATTED_VALUE, ler essas
// colunas devolve o número de série da data (dias desde 30/12/1899), não o
// texto — convertemos de volta pra "YYYY-MM-DD" aqui, uma vez só, pra todo
// o resto do app continuar comparando string de data como sempre fez.
const DATE_COLUMNS = new Set(['Data', 'Próxima Manutenção']);
const SHEETS_EPOCH_MS = Date.UTC(1899, 11, 30);
function serialParaISO(serial) {
  return new Date(SHEETS_EPOCH_MS + Math.round(serial) * 86400000).toISOString().slice(0, 10);
}

// Índice 0-based -> letra de coluna do Sheets (0 -> A, 25 -> Z, 26 -> AA...).
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

async function getHeaderMap(tab) {
  const sheets = await getClient();
  const headerRow = headerRowOf(tab);
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!${headerRow}:${headerRow}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const row = (res.data.values && res.data.values[0]) || [];
  const map = {};
  row.forEach((h, i) => {
    if (h && String(h).trim()) map[String(h).trim()] = i;
  });
  return { map, count: row.length };
}

// Lê todas as linhas de dados de uma aba, mapeadas por nome de cabeçalho.
// _rowNumber é só informativo (para debug/log) — nunca usar para escrever.
export async function getAllRows(tab) {
  const sheets = await getClient();
  const { map } = await getHeaderMap(tab);
  const dataStart = headerRowOf(tab) + 1;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${dataStart}:ZZ`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const rows = res.data.values || [];
  return rows
    .map((r, i) => {
      const obj = { _rowNumber: i + dataStart };
      for (const [name, idx] of Object.entries(map)) {
        let v = r[idx] ?? '';
        if (DATE_COLUMNS.has(name) && typeof v === 'number') v = serialParaISO(v);
        obj[name] = v;
      }
      return obj;
    })
    .filter((o) => Object.entries(o).some(([k, v]) => k !== '_rowNumber' && v !== '' && v != null));
}

// Acrescenta uma linha nova ao final da aba. rowObject: { NomeColuna: valor }.
export async function appendRow(tab, rowObject) {
  const sheets = await getClient();
  const { map, count } = await getHeaderMap(tab);
  const arr = new Array(count).fill('');
  for (const [name, idx] of Object.entries(map)) {
    if (name in rowObject) arr[idx] = rowObject[name] ?? '';
  }
  const dataStart = headerRowOf(tab) + 1;
  await sheets.spreadsheets.values.append({
    spreadsheetId: SPREADSHEET_ID,
    // Âncora no início da área de dados (não em A1): nas abas com faixa de
    // título/subtítulo (linhas 1-2, não vazias), ancorar em A1 confundiria o
    // Sheets sobre onde a "tabela" realmente começa.
    range: `${tab}!A${dataStart}`,
    valueInputOption: 'USER_ENTERED',
    // OVERWRITE, nunca INSERT_ROWS: INSERT_ROWS insere uma linha de verdade
    // e empurra tudo abaixo (inclusive em outras abas que referenciam essa
    // faixa) — isso desalinha as fórmulas fixas dos painéis (Resumo/
    // Histórico, ex. $A$4:$A$1003) a cada novo lançamento. Como só
    // acrescentamos em linhas já vazias (nunca sobrescrevemos dado real),
    // OVERWRITE tem exatamente o mesmo efeito prático sem esse risco.
    insertDataOption: 'OVERWRITE',
    requestBody: { values: [arr] },
  });
}

// Localiza o número da linha (1-based) cujo valor na coluna idColumnName é
// idValue. Leitura fresca e barata (só uma coluna) — sempre chamar isso
// imediatamente antes de update/delete, nunca cachear o resultado.
export async function findRowNumberById(tab, idColumnName, idValue) {
  const sheets = await getClient();
  const { map } = await getHeaderMap(tab);
  if (!(idColumnName in map)) {
    throw new Error(`Coluna "${idColumnName}" não encontrada na aba "${tab}". Rode o setup da planilha (npm run setup:sheet).`);
  }
  const letter = colLetter(map[idColumnName]);
  const dataStart = headerRowOf(tab) + 1;
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!${letter}${dataStart}:${letter}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const col = res.data.values || [];
  for (let i = 0; i < col.length; i++) {
    if (col[i][0] === idValue) return i + dataStart;
  }
  return null;
}

// Atualiza campos específicos de uma linha já localizada (rowNumber vindo de
// uma chamada FRESCA a findRowNumberById). Lê a linha inteira, mescla os
// campos alterados e regrava a linha inteira (evita gaps em colunas não citadas).
export async function updateRow(tab, rowNumber, rowObjectPartial) {
  const sheets = await getClient();
  const { map, count } = await getHeaderMap(tab);
  const letterEnd = colLetter(Math.max(count - 1, 0));
  const existingRes = await sheets.spreadsheets.values.get({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${rowNumber}:${letterEnd}${rowNumber}`,
    valueRenderOption: 'UNFORMATTED_VALUE',
  });
  const existing = (existingRes.data.values && existingRes.data.values[0]) || [];
  const merged = [...existing];
  while (merged.length < count) merged.push('');
  for (const [name, idx] of Object.entries(map)) {
    if (name in rowObjectPartial) merged[idx] = rowObjectPartial[name] ?? '';
  }
  await sheets.spreadsheets.values.update({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${rowNumber}:${letterEnd}${rowNumber}`,
    valueInputOption: 'USER_ENTERED',
    requestBody: { values: [merged] },
  });
}

// Remove os dados da linha rowNumber (1-based) de uma aba — limpa o conteúdo
// das células, NUNCA remove a linha de verdade (nunca deleteDimension).
// Um delete estrutural desloca linhas abaixo e o Sheets ajusta sozinho toda
// referência de fórmula fixa em OUTRAS abas que aponte pra essa faixa (ex.
// $A$4:$A$1003 dos painéis de Resumo/Histórico) — encolhendo a faixa a cada
// exclusão e corrompendo os painéis aos poucos. Limpar o conteúdo em vez de
// apagar a linha evita isso por completo; getAllRows já ignora linha
// totalmente vazia, então o resultado pro resto do app é idêntico.
export async function deleteRow(tab, rowNumber) {
  const sheets = await getClient();
  const { count } = await getHeaderMap(tab);
  const letterEnd = colLetter(Math.max(count - 1, 0));
  await sheets.spreadsheets.values.clear({
    spreadsheetId: SPREADSHEET_ID,
    range: `${tab}!A${rowNumber}:${letterEnd}${rowNumber}`,
  });
}

export { colLetter, headerRowOf };
