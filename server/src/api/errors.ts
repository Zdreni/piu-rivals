// An error with an HTTP status, answered as { error: message }.
export class HttpError extends Error {
  constructor(readonly statusCode: number, message: string) {
    super(message);
  }
}
