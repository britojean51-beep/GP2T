// ============================================================================
// Cache.gs — Cache curto só para listagens (GET), equivalente ao lib/cache.js
// do Node. Usa CacheService (compartilhado entre execuções, diferente do Map
// em memória do Node — mas o efeito prático é o mesmo: TTL curto, nunca
// usado na busca de linha para escrita). TTL aqui é em SEGUNDOS (CacheService
// não aceita ms), diferente do cache.js original que usava ms.
// ============================================================================
var CACHE_TTL_PADRAO = 9; // segundos

// Lista fixa de chaves conhecidas — CacheService não permite listar/varrer
// chaves por prefixo, então cacheClear(prefixo) limpa por busca nesta lista.
var CACHE_CHAVES_CONHECIDAS = [
  'equipamentos:all',
  'operadores:all',
  'lancamentos:all',
  'resumos:lancamentos',
  'resumos:equipamentos',
  'resumos:manutencoes',
  'config:rows',
];

function cacheGet(key) {
  var raw = CacheService.getScriptCache().get(key);
  if (!raw) return null;
  try {
    return JSON.parse(raw);
  } catch (e) {
    return null;
  }
}

function cacheSet(key, value, ttlSeconds) {
  try {
    CacheService.getScriptCache().put(key, JSON.stringify(value), ttlSeconds || CACHE_TTL_PADRAO);
  } catch (e) {
    // Valor grande demais para o CacheService (limite ~100KB) — só não cacheia,
    // não deve derrubar a operação principal.
    Logger.log('cacheSet falhou para "' + key + '": ' + e);
  }
}

function cacheClear(prefix) {
  var alvo = CACHE_CHAVES_CONHECIDAS.filter(function (k) {
    return !prefix || k.indexOf(prefix) === 0;
  });
  if (alvo.length) CacheService.getScriptCache().removeAll(alvo);
}
