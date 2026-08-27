// Erro de aplicação com status HTTP e código estável para o frontend tratar
// (ex.: exibir mensagem específica quando erro === 'HORIMETRO_INFERIOR').
export class AppError extends Error {
  constructor(status, code, message) {
    super(message);
    this.name = 'AppError';
    this.status = status;
    this.code = code;
  }
}
