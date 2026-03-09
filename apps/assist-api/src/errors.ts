import type { FastifyInstance, FastifyError } from "fastify";

export type ApiErrorResponse = {
  error: string;
  code: string;
  details?: unknown;
};

export function sendError(
  reply: { code: (status: number) => { send: (body: ApiErrorResponse) => void } },
  status: number,
  error: string,
  code: string,
  details?: unknown
) {
  return reply.code(status).send({ error, code, details });
}

export async function errorHandlerPlugin(app: FastifyInstance) {
  app.setErrorHandler((error: FastifyError, _request, reply) => {
    const status = error.statusCode ?? 500;

    if (status >= 500) {
      app.log.error(error);
    }

    return reply.code(status).send({
      error: status >= 500 ? "Internal server error" : error.message,
      code: error.code ?? "UNKNOWN_ERROR"
    });
  });

  app.setNotFoundHandler((_request, reply) => {
    return reply.code(404).send({
      error: "Route not found",
      code: "NOT_FOUND"
    });
  });
}
