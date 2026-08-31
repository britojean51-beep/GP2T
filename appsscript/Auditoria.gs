// ============================================================================
// Auditoria.gs — Log de toda escrita. Equivalente ao
// backend/src/services/auditoria.service.js. Nunca derruba a operação
// principal se falhar (só loga no Logger); nunca é apagado/atualizado por
// outra rotina (só append).
// ============================================================================
function logAudit(entry) {
  try {
    appendRow(TABS.AUDITORIA, {
      Id: Utilities.getUuid(),
      Timestamp: new Date().toISOString(),
      UsuarioId: entry.usuarioId || '',
      UsuarioNome: entry.usuarioNome || '',
      Acao: entry.acao || '',
      Entidade: entry.entidade || '',
      EntidadeId: entry.entidadeId || '',
      Detalhes: entry.detalhes || '',
    });
  } catch (e) {
    Logger.log('Falha ao gravar auditoria (operação principal não foi afetada): ' + e);
  }
}
