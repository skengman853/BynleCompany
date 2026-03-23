export type DocsTemplateSummary = {
  id: string;
  name: string;
  description: string | null;
  isActive: boolean;
  itemCount: number;
  createdAt: string;
  updatedAt: string;
};

export type DocsRequestSummary = {
  id: string;
  title: string;
  clientName: string;
  clientEmail: string;
  status: string;
  dueAt: string;
  completionPercent: number;
  lastReminderAt: string | null;
  updatedAt: string;
};

export type DocsOverview = {
  counts: {
    draft: number;
    inProgress: number;
    overdue: number;
    completedThisWeek: number;
  };
  overdueRequests: Array<{
    id: string;
    title: string;
    clientName: string;
    dueAt: string;
    missingRequiredItems: number;
  }>;
};

export type DocsRequestDetail = {
  id: string;
  title: string;
  status: string;
  clientName: string;
  clientEmail: string;
  clientPhone: string | null;
  customMessage: string | null;
  dueAt: string;
  sentAt: string | null;
  lastReminderAt: string | null;
  completionPercent: number;
  items: Array<{
    id: string;
    label: string;
    instructions: string | null;
    isRequired: boolean;
    status: string;
    acceptedMimeTypes: string[];
    maxFiles: number;
    files: Array<{
      id: string;
      originalFilename: string;
      mimeType: string;
      sizeBytes: number;
      status: string;
      uploadedAt: string;
    }>;
  }>;
  events: Array<{
    id: string;
    eventType: string;
    actorType: string;
    createdAt: string;
  }>;
};

const DEFAULT_ACCEPTED_MIME_TYPES = [
  "application/pdf",
  "image/jpeg",
  "image/png"
];

export function parseDocsItemsText(text: string) {
  const rows = text
    .split("\n")
    .map((row) => row.trim())
    .filter(Boolean);

  return rows.map((row, index) => {
    const parts = row.split("|").map((part) => part.trim());
    const lead = (parts[0] ?? "").toLowerCase();
    const hasExplicitRequiredFlag = lead === "required" || lead === "optional";

    const label = hasExplicitRequiredFlag ? parts[1] ?? "" : parts[0] ?? "";
    const instructions = hasExplicitRequiredFlag ? parts[2] ?? "" : parts[1] ?? "";
    const mimeValue = hasExplicitRequiredFlag ? parts[3] ?? "" : parts[2] ?? "";
    const maxFilesValue = hasExplicitRequiredFlag ? parts[4] ?? "" : parts[3] ?? "";
    const acceptedMimeTypes = mimeValue
      ? mimeValue
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean)
      : DEFAULT_ACCEPTED_MIME_TYPES;
    const maxFiles = Math.max(1, Number.parseInt(maxFilesValue || "1", 10) || 1);

    if (!label) {
      throw new Error(`Checklist line ${index + 1} is missing a label.`);
    }

    return {
      label,
      instructions: instructions || undefined,
      isRequired: hasExplicitRequiredFlag ? lead === "required" : true,
      acceptedMimeTypes,
      maxFiles,
      sortOrder: index + 1
    };
  });
}

export function toDateTimeLocalValue(input: string | Date | null | undefined) {
  if (!input) {
    return "";
  }

  const date = input instanceof Date ? input : new Date(input);
  if (Number.isNaN(date.getTime())) {
    return "";
  }

  const offsetMs = date.getTimezoneOffset() * 60 * 1000;
  return new Date(date.getTime() - offsetMs).toISOString().slice(0, 16);
}
