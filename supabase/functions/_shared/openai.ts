import { requireEnv } from './http.ts';

const CHAT_COMPLETIONS_URL = 'https://api.openai.com/v1/chat/completions';

/** Small wrapper around the OpenAI chat completions API for text summaries. */
export async function completeText(options: {
  system: string;
  user: string;
  model?: string;
  maxTokens?: number;
}): Promise<string> {
  const apiKey = requireEnv('OPENAI_API_KEY');
  const model = options.model ?? Deno.env.get('SUMMARY_MODEL') ?? 'gpt-5-mini';

  const response = await fetch(CHAT_COMPLETIONS_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      Authorization: `Bearer ${apiKey}`,
    },
    body: JSON.stringify({
      model,
      messages: [
        { role: 'system', content: options.system },
        { role: 'user', content: options.user },
      ],
      max_completion_tokens: options.maxTokens ?? 500,
    }),
  });

  if (!response.ok) {
    throw new Error(`OpenAI request failed (${response.status}): ${await response.text()}`);
  }

  const body = (await response.json()) as {
    choices?: Array<{ message?: { content?: string | null } }>;
  };
  const text = body.choices?.[0]?.message?.content?.trim();
  if (!text) {
    throw new Error('OpenAI returned an empty completion');
  }
  return text;
}
