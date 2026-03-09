export type ChatAction =
  | "NONE"
  | "SHOW_BOOKING_LINK"
  | "CAPTURE_LEAD"
  | "CALL_HUMAN"
  | "EMERGENCY_NOTICE";

export type LLMContextItem = {
  type: "settings" | "faq" | "kb" | "web";
  id: string;
  content: string;
};

export type LLMRequest = {
  tenantId: string;
  message: string;
  context: LLMContextItem[];
};

export type LLMResponse = {
  replyText: string;
  action: ChatAction;
  leadFieldsNeeded: string[];
  sources: { type: LLMContextItem["type"]; id: string; excerpt?: string }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
    totalTokens: number;
    model?: string;
  };
};

export interface LLMProvider {
  generate(request: LLMRequest): Promise<LLMResponse>;
}
