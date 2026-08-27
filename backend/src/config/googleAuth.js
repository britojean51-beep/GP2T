import { google } from 'googleapis';
import { GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 } from './env.js';

let cachedClient = null;

// Autentica como a conta de serviço do Google Cloud, usando a credencial
// entregue via variável de ambiente (nunca lida de um arquivo no repositório).
export async function getAuthClient() {
  if (cachedClient) return cachedClient;

  let credentials;
  try {
    const json = Buffer.from(GOOGLE_SERVICE_ACCOUNT_JSON_BASE64, 'base64').toString('utf-8');
    credentials = JSON.parse(json);
  } catch (e) {
    throw new Error(
      'GOOGLE_SERVICE_ACCOUNT_JSON_BASE64 inválido — confira se é o JSON da service account codificado em base64 numa única linha.'
    );
  }

  const auth = new google.auth.GoogleAuth({
    credentials,
    scopes: ['https://www.googleapis.com/auth/spreadsheets'],
  });
  cachedClient = await auth.getClient();
  return cachedClient;
}
