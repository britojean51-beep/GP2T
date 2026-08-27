import { randomUUID } from 'crypto';
import { appendRow } from '../lib/sheets.js';
import { TABS } from '../config/schema.js';

// A auditoria nunca deve derrubar a operação principal: se falhar, loga no
// console do servidor mas não propaga o erro. O log de auditoria nunca é
// apagado nem atualizado por outra rotina (só append).
export async function logAudit({ usuarioId, usuarioNome, acao, entidade, entidadeId, detalhes }) {
  try {
    await appendRow(TABS.AUDITORIA, {
      Id: randomUUID(),
      Timestamp: new Date().toISOString(),
      UsuarioId: usuarioId || '',
      UsuarioNome: usuarioNome || '',
      Acao: acao || '',
      Entidade: entidade || '',
      EntidadeId: entidadeId || '',
      Detalhes: detalhes || '',
    });
  } catch (e) {
    console.error('Falha ao gravar auditoria (operação principal não foi afetada):', e.message);
  }
}
