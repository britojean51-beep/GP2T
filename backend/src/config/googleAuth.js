import { google } from 'googleapis';
import { GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 } from './env.js';

let cachedClient = null;

// Autentica como a conta de serviço do Google Cloud, usando a credencial
// entregue via variável de ambiente (nunca lida de um arquivo no repositório).
//
// Aceita dois formatos no mesmo GOOGLE_SERVICE_ACCOUNT_JSON_BASE64: o JSON
// colado diretamente (a maioria dos provedores de hospedagem, como o Render,
// aceita variáveis de ambiente com várias linhas — nesse caso não precisa
// converter nada, é só colar o conteúdo do arquivo baixado do Google Cloud)
// ou o mesmo JSON codificado em base64 numa única linha (útil em terminais/
// provedores que não aceitam valor multi-linha). Detecta automaticamente.
export async function getAuthClient() {
  if (cachedClient) return cachedClient;

  const valor = (GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 || '').trim();
  let credentials;
  try {
    credentials = JSON.parse(valor);
  } catch {
    try {
      credentials = JSON.parse(Buffer.from(valor, 'base64').toString('utf-8'));
    } catch {
      throw new Error(
        'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 inválido — cole o JSON da service account diretamente, ou o mesmo JSON convertido para base64 em uma única linha.'
      );
    }
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedClient = await auth.getClient();
  return cachedClient;
}
