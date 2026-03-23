import { z } from "zod";

export const docsRequestStatusValues = [
  "DRAFT",
  "SENT",
  "IN_PROGRESS",
  "COMPLETED",
  "OVERDUE",
  "CANCELED"
] as const;

export const docsRequestItemStatusValues = [
  "PENDING",
  "UPLOADED",
  "APPROVED",
  "REJECTED",
  "WAIVED"
] as const;

export const docsFileStatusValues = [
  "RECEIVED",
  "PROCESSING",
  "READY",
  "REJECTED",
  "DELETED"
] as const;

export const docsActorTypeValues = ["SYSTEM", "STAFF", "CLIENT"] as const;

export const docsRequestStatusSchema = z.enum(docsRequestStatusValues);
export const docsRequestItemStatusSchema = z.enum(docsRequestItemStatusValues);
export const docsFileStatusSchema = z.enum(docsFileStatusValues);
export const docsActorTypeSchema = z.enum(docsActorTypeValues);

const docsMimeTypeSchema = z.string().min(1).max(255);

export const docsTemplateItemInputSchema = z.object({
  label: z.string().trim().min(1).max(200),
  instructions: z.string().trim().min(1).max(5000).optional(),
  isRequired: z.boolean().default(true),
  acceptedMimeTypes: z.array(docsMimeTypeSchema).min(1).max(20),
  maxFiles: z.number().int().min(1).max(20).default(1),
  sortOrder: z.number().int().min(0).max(1000)
});

export const docsTemplateCreateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().trim().min(1).max(2000).optional(),
  items: z.array(docsTemplateItemInputSchema).min(1).max(100)
});

export const docsTemplateUpdateSchema = z.object({
  name: z.string().trim().min(1).max(200).optional(),
  description: z.string().trim().min(1).max(2000).optional(),
  isActive: z.boolean().optional(),
  items: z.array(docsTemplateItemInputSchema).min(1).max(100).optional()
});

export const docsRequestCreateSchema = z
  .object({
    templateId: z.string().trim().min(1).optional(),
    title: z.string().trim().min(1).max(200),
    clientName: z.string().trim().min(1).max(200),
    clientEmail: z.string().trim().email(),
    clientPhone: z.string().trim().min(1).max(50).optional(),
    dueAt: z.string().datetime(),
    customMessage: z.string().trim().min(1).max(5000).optional(),
    items: z.array(docsTemplateItemInputSchema).max(100).default([])
  })
  .refine((value) => Boolean(value.templateId) || value.items.length > 0, {
    message: "Either templateId or at least one item is required",
    path: ["templateId"]
  });

export const docsRequestCancelSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
});

export const docsRequestApproveSchema = z.object({
  note: z.string().trim().min(1).max(1000).optional()
});

export const docsRequestRejectSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
});

export const docsRequestWaiveSchema = z.object({
  reason: z.string().trim().min(1).max(1000)
});

export const docsRequestListQuerySchema = z.object({
  status: docsRequestStatusSchema.optional(),
  search: z.string().trim().min(1).max(200).optional(),
  dueBefore: z.string().datetime().optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50)
});

export type DocsRequestStatus = z.infer<typeof docsRequestStatusSchema>;
export type DocsRequestItemStatus = z.infer<typeof docsRequestItemStatusSchema>;
export type DocsFileStatus = z.infer<typeof docsFileStatusSchema>;
export type DocsActorType = z.infer<typeof docsActorTypeSchema>;
export type DocsTemplateItemInput = z.infer<typeof docsTemplateItemInputSchema>;
export type DocsTemplateCreateInput = z.infer<typeof docsTemplateCreateSchema>;
export type DocsTemplateUpdateInput = z.infer<typeof docsTemplateUpdateSchema>;
export type DocsRequestCreateInput = z.infer<typeof docsRequestCreateSchema>;
export type DocsRequestCancelInput = z.infer<typeof docsRequestCancelSchema>;
export type DocsRequestApproveInput = z.infer<typeof docsRequestApproveSchema>;
export type DocsRequestRejectInput = z.infer<typeof docsRequestRejectSchema>;
export type DocsRequestWaiveInput = z.infer<typeof docsRequestWaiveSchema>;
export type DocsRequestListQuery = z.infer<typeof docsRequestListQuerySchema>;

export type DocsStatusItem = {
  isRequired: boolean;
  status: DocsRequestItemStatus;
};

export type DeriveDocsRequestStatusInput = {
  dueAt: Date;
  sentAt?: Date | null;
  canceledAt?: Date | null;
  items: DocsStatusItem[];
};

export function isDocsItemTerminal(status: DocsRequestItemStatus): boolean {
  return status === "APPROVED" || status === "WAIVED";
}

export function hasDocsItemActivity(status: DocsRequestItemStatus): boolean {
  return status !== "PENDING";
}

export function calculateDocsCompletionPercent(items: DocsStatusItem[]): number {
  const requiredItems = items.filter((item) => item.isRequired);
  if (requiredItems.length === 0) {
    return 100;
  }

  const completed = requiredItems.filter((item) => isDocsItemTerminal(item.status)).length;
  return Math.round((completed / requiredItems.length) * 100);
}

export function deriveDocsRequestStatus(
  input: DeriveDocsRequestStatusInput,
  now = new Date()
): DocsRequestStatus {
  if (input.canceledAt) {
    return "CANCELED";
  }

  const requiredItems = input.items.filter((item) => item.isRequired);
  const requiredComplete =
    requiredItems.length === 0 || requiredItems.every((item) => isDocsItemTerminal(item.status));

  if (requiredComplete) {
    return "COMPLETED";
  }

  if (input.dueAt.getTime() < now.getTime()) {
    return "OVERDUE";
  }

  const hasActivity = input.items.some((item) => hasDocsItemActivity(item.status));
  if (hasActivity) {
    return "IN_PROGRESS";
  }

  if (input.sentAt) {
    return "SENT";
  }

  return "DRAFT";
}
