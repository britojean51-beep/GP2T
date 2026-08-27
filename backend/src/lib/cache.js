// ============================================================================
// cache.js — Cache curtíssimo em memória, só para listagens (GET).
// Nunca usado na busca de linha para escrita (isso é sempre leitura fresca).
// TTL curto (padrão 9s) para que uma edição manual do admin na planilha
// apareça no app em poucos segundos, sem martelar a API do Sheets a cada clique.
// ============================================================================
const store = new Map();

export function cacheGet(key) {
  const hit = store.get(key);
  if (!hit) return undefined;
  if (Date.now() > hit.expires) {
    store.delete(key);
    return undefined;
  }
  return hit.value;
}

export function cacheSet(key, value, ttlMs = 9000) {
  store.set(key, { value, expires: Date.now() + ttlMs });
}

export function cacheClear(prefix) {
  for (const key of store.keys()) {
    if (!prefix || key.startsWith(prefix)) store.delete(key);
  }
}
