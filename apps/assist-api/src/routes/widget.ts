import type { FastifyInstance } from "fastify";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const currentFilePath = fileURLToPath(import.meta.url);
const widgetScriptPath = path.resolve(path.dirname(currentFilePath), "../../public/widget.js");

export async function widgetRoutes(app: FastifyInstance) {
  app.get("/widget.js", async (_request, reply) => {
    try {
      const scriptContent = await fs.promises.readFile(widgetScriptPath, "utf8");
      return reply
        .header("content-type", "application/javascript; charset=utf-8")
        .header("cache-control", "no-store")
        .send(scriptContent);
    } catch (error) {
      app.log.error({ error }, "Failed to serve widget.js");
      return reply.code(500).send({ error: "Failed to load widget script" });
    }
  });
}
