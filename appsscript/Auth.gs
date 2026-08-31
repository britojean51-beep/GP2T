// ============================================================================
// Auth.gs — Login, hash de senha e token de sessão, sem bcrypt/jsonwebtoken
// (não existem no Apps Script). Equivalente ao backend/src/services/
// auth.service.js + middlewares/auth.js + authorize.js do Node.
//
// Senha: PBKDF2 manual — SHA-256 de (senha+salt) repetido ~10.000x. Mais
// lento de força-bruta que um SHA-256 único (bcrypt de verdade não está
// disponível). Coluna "Salt" em Usuários (aditiva — ver Setup.gs).
//
// Token: HMAC-SHA256 assinado manualmente sobre payloadBase64, formato
// "payloadBase64.assinaturaBase64" — mesma ideia de um JWT, sem depender de
// biblioteca. Segredo em Script Properties (JWT_SECRET).
// ============================================================================

var PBKDF2_ITERACOES = 10000;
var TOKEN_VALIDADE_MS = 12 * 60 * 60 * 1000; // 12h, igual ao Node (expiresIn: '12h')

function hashPassword(senha, salt) {
  var digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, senha + ':' + salt, Utilities.Charset.UTF_8);
  for (var i = 1; i < PBKDF2_ITERACOES; i++) {
    digestBytes = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, digestBytes);
  }
  return Utilities.base64Encode(digestBytes);
}

function criarToken(payload) {
  var payloadComExpiracao = Object.assign({}, payload, { exp: Date.now() + TOKEN_VALIDADE_MS });
  var payloadB64 = Utilities.base64EncodeWebSafe(JSON.stringify(payloadComExpiracao));
  var assinatura = Utilities.computeHmacSha256Signature(payloadB64, getScriptProp('JWT_SECRET'));
  var assinaturaB64 = Utilities.base64EncodeWebSafe(assinatura);
  return payloadB64 + '.' + assinaturaB64;
}

// Lança AppError(401,...) se o token faltar, estiver corrompido, com
// assinatura inválida, ou expirado — mesmo comportamento do authMiddleware
// do Node (SEM_TOKEN / TOKEN_INVALIDO).
function verifyToken(token) {
  if (!token) throw new AppError(401, 'SEM_TOKEN', 'Token de autenticação ausente.');
  var partes = String(token).split('.');
  if (partes.length !== 2) throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão expirada ou inválida. Faça login novamente.');

  var assinaturaEsperada = Utilities.base64EncodeWebSafe(Utilities.computeHmacSha256Signature(partes[0], getScriptProp('JWT_SECRET')));
  if (assinaturaEsperada !== partes[1]) {
    throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão expirada ou inválida. Faça login novamente.');
  }

  var payload;
  try {
    payload = JSON.parse(Utilities.newBlob(Utilities.base64DecodeWebSafe(partes[0])).getDataAsString());
  } catch (e) {
    throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão expirada ou inválida. Faça login novamente.');
  }
  if (!payload.exp || Date.now() > payload.exp) {
    throw new AppError(401, 'TOKEN_INVALIDO', 'Sessão expirada ou inválida. Faça login novamente.');
  }
  return payload;
}

// Equivalente ao middlewares/authorize.js do Node.
function requireRole(ctx, perfisPermitidos) {
  if (!ctx.user || perfisPermitidos.indexOf(ctx.user.perfil) === -1) {
    throw new AppError(403, 'SEM_PERMISSAO', 'Você não tem permissão para esta ação.');
  }
}

function authLogin(params) {
  var email = params.email, senha = params.senha;
  if (!email || !senha) throw new AppError(400, 'CAMPOS_OBRIGATORIOS', 'Informe e-mail e senha.');

  var usuarios = getAllRows(TABS.USUARIOS);
  var usuario = usuarios.filter(function (u) {
    return String(u.Email || '').toLowerCase() === String(email).toLowerCase();
  })[0];
  if (!usuario) throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');
  if (usuario.Status !== 'Ativo') throw new AppError(403, 'USUARIO_INATIVO', 'Usuário inativo. Contate o administrador.');

  var hashCalculado = hashPassword(senha, usuario.Salt || '');
  if (hashCalculado !== usuario.SenhaHash) throw new AppError(401, 'CREDENCIAIS_INVALIDAS', 'E-mail ou senha inválidos.');

  var payload = { id: usuario.Id, nome: usuario.Nome, email: usuario.Email, perfil: usuario.Perfil };
  return { token: criarToken(payload), usuario: payload };
}
