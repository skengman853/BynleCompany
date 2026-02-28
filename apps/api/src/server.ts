import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { rateLimitPlugin } from "./rate-limit.js";
import { errorHandlerPlugin } from "./errors.js";
import { widgetRoutes } from "./routes/widget.js";
import { chatRoutes } from "./routes/chat.js";
import { leadRoutes } from "./routes/leads.js";
import { settingsRoutes } from "./routes/settings.js";
import { faqRoutes } from "./routes/faqs.js";
import { kbRoutes } from "./routes/kb.js";
import { analyticsRoutes } from "./routes/analytics.js";
import { billingRoutes, observabilityRoutes, metricsRoutes } from "./routes/monitoring.js";
import { bookingRoutes } from "./routes/bookings.js";
import { calendlyWebhookRoutes } from "./routes/webhooks.js";

const app = Fastify({ logger: true });

// --- Plugins ---
app.register(cors, { origin: true });
app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
app.register(errorHandlerPlugin);
app.register(rateLimitPlugin, {
  windowMs: 60_000,
  maxRequests: Number(process.env.RATE_LIMIT_RPM ?? 60)
});

// --- Health ---
app.get("/health", async () => ({ ok: true }));

// --- Routes ---
app.register(widgetRoutes);
app.register(chatRoutes);
app.register(leadRoutes);
app.register(settingsRoutes);
app.register(faqRoutes);
app.register(kbRoutes);
app.register(analyticsRoutes);
app.register(bookingRoutes);
app.register(billingRoutes);
app.register(observabilityRoutes);
app.register(metricsRoutes);
app.register(calendlyWebhookRoutes);

// --- Start ---
const port = Number(process.env.API_PORT ?? 4000);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
