import 'dotenv/config';

function required(name) {
  const value = process.env[name];
  if (!value) {
    throw new Error(
      `Variável de ambiente obrigatória ausente: ${name}. Confira o arquivo .env (veja .env.example).`
    );
  }
  return value;
}

export const PORT = process.env.PORT || 3000;
export const SPREADSHEET_ID = required('SPREADSHEET_ID');
export const JWT_SECRET = required('JWT_SECRET');
export const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
export const GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 = required('GOOGLE_SERVICE_ACCOUNT_JSON_BASE64');
