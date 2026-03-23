import Fastify from "fastify";
import cors from "@fastify/cors";
import multipart from "@fastify/multipart";
import { errorHandlerPlugin } from "./errors.js";
import { docsTemplateRoutes } from "./routes/templates.js";
import { docsRequestRoutes } from "./routes/requests.js";
import { docsPublicRoutes } from "./routes/public.js";

const app = Fastify({ logger: true });

app.register(cors, { origin: true });
app.register(multipart, { limits: { fileSize: 20 * 1024 * 1024 } });
app.register(errorHandlerPlugin);

app.get("/health", async () => ({ ok: true }));

app.register(docsTemplateRoutes);
app.register(docsRequestRoutes);
app.register(docsPublicRoutes);

const port = Number(process.env.DOCS_API_PORT ?? 4100);

app.listen({ port, host: "0.0.0.0" }).catch((error) => {
  app.log.error(error);
  process.exit(1);
});
