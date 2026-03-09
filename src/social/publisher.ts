import { loadConfig, type SocialPlatformConfig } from "../config.js";
import type { Platform, SocialPost } from "./generator.js";

interface BufferResponse {
  success: boolean;
  updates?: Array<{ id: string }>;
  message?: string;
}

export async function publishToBuffer(
  post: SocialPost,
  scheduledAt?: string
): Promise<{ id: string }> {
  const config = loadConfig();
  const platformConfig: SocialPlatformConfig | undefined =
    config.social[post.platform];
  const token = process.env.BUFFER_ACCESS_TOKEN || "";

  if (!token) {
    throw new Error(
      "Buffer access token not configured. Set BUFFER_ACCESS_TOKEN in .env"
    );
  }

  if (!platformConfig?.buffer_profile_id) {
    throw new Error(
      `Buffer profile ID not configured for ${post.platform}. Set it in config.yaml`
    );
  }

  // Build the post text with hashtags
  const hashtags = post.hashtags.map((h) => `#${h}`).join(" ");
  const fullText =
    post.platform === "instagram"
      ? `${post.text}\n\n${hashtags}`
      : `${post.text} ${hashtags}`;

  const body: Record<string, unknown> = {
    profile_ids: [platformConfig.buffer_profile_id],
    text: fullText,
  };

  if (scheduledAt) {
    body.scheduled_at = scheduledAt;
  }

  const response = await fetch("https://api.bufferapp.com/1/updates/create.json", {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      access_token: token,
      "profile_ids[]": platformConfig.buffer_profile_id,
      text: fullText,
      ...(scheduledAt ? { scheduled_at: scheduledAt } : {}),
    }),
  });

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Buffer API error (${response.status}): ${text}`);
  }

  const result = (await response.json()) as BufferResponse;
  if (!result.success) {
    throw new Error(`Buffer error: ${result.message ?? "Unknown error"}`);
  }

  return { id: result.updates?.[0]?.id ?? "" };
}
