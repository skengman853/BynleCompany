import type { FastifyInstance } from "fastify";
import { prisma } from "@bynle/db";
import { requireAdminAuth } from "../admin-auth.js";

export async function bookingRoutes(app: FastifyInstance) {
  app.get("/v1/bookings", async (request, reply) => {
    const admin = await requireAdminAuth(request, reply, ["OWNER", "STAFF"]);
    if (!admin) return;

    const query = request.query as { status?: string; limit?: string | number } | undefined;
    const requestedStatus = typeof query?.status === "string" ? query.status.toUpperCase() : undefined;
    const status =
      requestedStatus === "CONFIRMED" || requestedStatus === "CANCELED" ? requestedStatus : undefined;
    const requestedLimit = Number(query?.limit ?? 50);
    const limit = Number.isFinite(requestedLimit)
      ? Math.max(1, Math.min(200, Math.trunc(requestedLimit)))
      : 50;

    return prisma.booking.findMany({
      where: {
        tenantId: admin.tenantId,
        ...(status ? { status } : {})
      },
      orderBy: { createdAt: "desc" },
      take: limit,
      select: {
        id: true,
        status: true,
        startTime: true,
        endTime: true,
        timezone: true,
        inviteeName: true,
        inviteeEmail: true,
        inviteePhone: true,
        cancelUrl: true,
        rescheduleUrl: true,
        cancellationReason: true,
        createdAt: true,
        updatedAt: true
      }
    });
  });
}
