import Anthropic from "@anthropic-ai/sdk";
import OpenAI from "openai";
import { loadConfig } from "../config.js";

let anthropic: Anthropic | null = null;
let openai: OpenAI | null = null;

function getAnthropic(): Anthropic {
  if (!anthropic) {
    anthropic = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });
  }
  return anthropic;
}

function getOpenAI(): OpenAI {
  if (!openai) {
    openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });
  }
  return openai;
}

export interface GenerateOptions {
  prompt: string;
  system?: string;
  model?: "claude" | "openai";
  maxTokens?: number;
}

export async function generate(options: GenerateOptions): Promise<string> {
  const config = loadConfig();
  const provider = options.model ?? config.ai.default_model;
  const maxTokens = options.maxTokens ?? 4096;

  if (provider === "claude") {
    const client = getAnthropic();
    const response = await client.messages.create({
      model: config.ai.claude.model,
      max_tokens: maxTokens,
      system: options.system ?? "",
      messages: [{ role: "user", content: options.prompt }],
    });

    const block = response.content[0];
    if (block.type === "text") return block.text;
    return "";
  }

  // OpenAI
  const client = getOpenAI();
  const messages: OpenAI.Chat.ChatCompletionMessageParam[] = [];
  if (options.system) {
    messages.push({ role: "system", content: options.system });
  }
  messages.push({ role: "user", content: options.prompt });

  const response = await client.chat.completions.create({
    model: config.ai.openai.model,
    max_tokens: maxTokens,
    messages,
  });

  return response.choices[0]?.message?.content ?? "";
}
