import type { FastifyInstance, FastifyRequest, FastifyReply } from "fastify";

type RateLimitEntry = { count: number; resetAt: number };

const DEFAULT_WINDOW_MS = 60_000;
const DEFAULT_MAX_REQUESTS = 60;

export async function rateLimitPlugin(
  app: FastifyInstance,
  opts: { windowMs?: number; maxRequests?: number; keyFn?: (req: FastifyRequest) => string } = {}
) {
  const windowMs = opts.windowMs ?? DEFAULT_WINDOW_MS;
  const maxRequests = opts.maxRequests ?? DEFAULT_MAX_REQUESTS;
  const keyFn = opts.keyFn ?? ((req: FastifyRequest) => req.ip);
  const store = new Map<string, RateLimitEntry>();

  // Sweep expired entries every 2 minutes
  const sweepInterval = setInterval(() => {
    const now = Date.now();
    for (const [key, entry] of store) {
      if (entry.resetAt <= now) store.delete(key);
    }
  }, 120_000);
  sweepInterval.unref();

  app.addHook("onClose", () => clearInterval(sweepInterval));

  app.addHook("onRequest", async (request: FastifyRequest, reply: FastifyReply) => {
    const key = keyFn(request);
    const now = Date.now();
    let entry = store.get(key);

    if (!entry || entry.resetAt <= now) {
      entry = { count: 0, resetAt: now + windowMs };
      store.set(key, entry);
    }

    entry.count += 1;

    reply.header("x-ratelimit-limit", maxRequests);
    reply.header("x-ratelimit-remaining", Math.max(0, maxRequests - entry.count));
    reply.header("x-ratelimit-reset", Math.ceil(entry.resetAt / 1000));

    if (entry.count > maxRequests) {
      return reply.code(429).send({ error: "Too many requests. Please try again later." });
    }
  });
}
