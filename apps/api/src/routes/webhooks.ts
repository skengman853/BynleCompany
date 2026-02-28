import type { FastifyInstance } from "fastify";
import { handleCalendlyWebhook } from "../booking/calendlyWebhook.js";
import { validateCalendlyWebhookSignature } from "../booking/webhookSecurity.js";

export async function calendlyWebhookRoutes(app: FastifyInstance) {
  app.register(async (webhookApp) => {
    webhookApp.removeAllContentTypeParsers();
    webhookApp.addContentTypeParser("*", { parseAs: "string" }, (_request, body, done) => done(null, body));

    webhookApp.post("/v1/webhooks/calendly", async (request, reply) => {
      const expectedToken = process.env.CALENDLY_WEBHOOK_TOKEN?.trim();
      if (expectedToken) {
        const token = ((request.query as { token?: string } | undefined)?.token ?? "").trim();
        if (token !== expectedToken) {
          return reply.code(401).send({ error: "Invalid webhook token" });
        }
      }

      const rawBody = typeof request.body === "string" ? request.body : "";
      if (!rawBody) {
        return reply.code(400).send({ error: "Missing raw webhook body" });
      }

      const signatureValidation = await validateCalendlyWebhookSignature({
        rawBody,
        signatureHeader: request.headers["calendly-webhook-signature"]
      });
      if (!signatureValidation.ok) {
        return reply.code(signatureValidation.statusCode).send({ error: signatureValidation.error });
      }

      let payload: unknown;
      try {
        payload = JSON.parse(rawBody);
      } catch {
        return reply.code(400).send({ error: "Invalid JSON body" });
      }

      const result = await handleCalendlyWebhook(payload);
      if (!result.handled) {
        request.log.info({ reason: result.reason }, "Ignored Calendly webhook event");
        return reply.code(202).send({
          ok: true,
          ignored: true,
          reason: result.reason
        });
      }

      request.log.info(
        { tenantId: result.tenantId, status: result.status },
        "Processed Calendly webhook event"
      );
      return { ok: true };
    });
  });
}
