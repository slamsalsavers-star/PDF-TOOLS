export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string
  ) {
    super(message);
    this.name = 'AppError';
  }
}

export const Errors = {
  badRequest:   (msg = 'Bad request')          => new AppError(400, msg, 'BAD_REQUEST'),
  unauthorized: (msg = 'Unauthorized')         => new AppError(401, msg, 'UNAUTHORIZED'),
  forbidden:    (msg = 'Forbidden')            => new AppError(403, msg, 'FORBIDDEN'),
  notFound:     (msg = 'Not found')            => new AppError(404, msg, 'NOT_FOUND'),
  conflict:     (msg = 'Conflict')             => new AppError(409, msg, 'CONFLICT'),
  internal:     (msg = 'Internal server error')=> new AppError(500, msg, 'INTERNAL'),
};
