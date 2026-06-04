export type ChatContentPart =
  | { type: "text"; text: string }
  | { type: "image_url"; image_url: { url: string } };

export type ChatUserContent = string | ChatContentPart[];

export type JsonSchemaResponseFormat = {
  type: "json_schema";
  json_schema: {
    name: string;
    strict: boolean;
    schema: Record<string, unknown>;
  };
};

export type ProviderPreferences = {
  require_parameters?: boolean;
  data_collection?: "allow" | "deny";
  allow_fallbacks?: boolean;
  zdr?: boolean;
};

export type ReasoningConfig = {
  enabled?: boolean;
  effort?: "xhigh" | "high" | "medium" | "low" | "minimal" | "none";
  max_tokens?: number;
  exclude?: boolean;
};

/**
 * Builds the OpenRouter user message for a single post. When an image URL is
 * available it is sent as a real `image_url` content part so a vision model can
 * see the picture; without it we degrade to text-only (caption + metadata).
 */
export function buildVisionUserContent(input: {
  postId: string;
  caption?: string | null;
  imageUrl?: string | null;
}): ChatContentPart[] {
  const parts: ChatContentPart[] = [
    {
      type: "text",
      text: `Post ID: ${input.postId}\nCaption: ${input.caption ?? ""}\nDescribe visible public facts only.`
    }
  ];
  if (input.imageUrl) {
    parts.push({ type: "image_url", image_url: { url: input.imageUrl } });
  }
  return parts;
}

/**
 * Assembles the chat-completions request body. `maxTokens` is passed per call so
 * vision/report/chat each respect their own output budget instead of sharing one
 * global cap.
 */
export function buildChatCompletionBody(input: {
  model: string;
  system: string;
  user: ChatUserContent;
  maxTokens: number;
  responseFormat?: JsonSchemaResponseFormat;
  provider?: ProviderPreferences;
  temperature?: number;
  reasoning?: ReasoningConfig;
}) {
  return stripUndefined({
    model: input.model,
    messages: [
      { role: "system", content: input.system },
      { role: "user", content: input.user }
    ],
    max_tokens: input.maxTokens,
    response_format: input.responseFormat,
    provider: input.provider,
    temperature: input.temperature,
    reasoning: input.reasoning
  });
}

function stripUndefined<T extends Record<string, unknown>>(value: T): T {
  return Object.fromEntries(Object.entries(value).filter(([, item]) => item !== undefined)) as T;
}
