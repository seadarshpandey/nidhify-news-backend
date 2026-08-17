const {
  estimateTokens,
  updateBudget,
  waitForBudget,
  serialize,
  sleep,
} = require("./groqRateLimiter");

const GROQ_API_URL = "https://api.groq.com/openai/v1/chat/completions";

const DEFAULT_MODEL = "openai/gpt-oss-120b";

const FALLBACK_MODELS = [
  "openai/gpt-oss-120b",
  "openai/gpt-oss-20b",
  "llama-3.1-8b-instant",
];

const REQUEST_TIMEOUT_MS = 90000;
const MAX_5XX_RETRIES = 2;
const DEFAULT_429_WAIT_SECONDS = 15;

const parseRetryAfterMs = (data, headers) => {
  const retryAfter = headers?.get
    ? headers.get("retry-after") || headers.get("Retry-After")
    : null;

  if (retryAfter && !isNaN(Number(retryAfter))) {
    return Number(retryAfter) * 1000;
  }

  const match = /Please try again in ([\d.]+)s?/i.exec(
    data?.error?.message || "",
  );

  if (match && !isNaN(Number(match[1]))) {
    return Number(match[1]) * 1000;
  }

  return null;
};

const readBudgetHeaders = (headers) => {
  if (!headers?.get) return {};

  return {
    "x-ratelimit-remaining-tokens": headers.get(
      "x-ratelimit-remaining-tokens",
    ),
    "x-ratelimit-reset-tokens": headers.get(
      "x-ratelimit-reset-tokens",
    ),
  };
};

// Returns the parsed content only — no model info. Used internally by
// callGroq, which attaches the model that actually served the request.
const callGroq = async (
  messages,
  {
    model = DEFAULT_MODEL,
    temperature = 0.4,
    maxTokens = 4000,
    jsonResponse = true,
  } = {},
) => {
  const apiKey = process.env.GROQ_API_KEY;

  if (!apiKey) {
    const err = new Error("GROQ_API_KEY is not configured");
    err.status = 500;
    throw err;
  }

  return serialize(async () => {
    const requestTokens = estimateTokens(messages, maxTokens);
    await waitForBudget(requestTokens);

    let fiveXxRetries = 0;

    for (;;) {
      const controller = new AbortController();
      const timeout = setTimeout(
        () => controller.abort(),
        REQUEST_TIMEOUT_MS,
      );

      try {
        const requestBody = {
          model,
          messages,
          temperature,
          max_tokens: maxTokens,
        };

        if (jsonResponse) {
          requestBody.response_format = {
            type: "json_object",
          };
        }

        const response = await fetch(GROQ_API_URL, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${apiKey}`,
          },
          body: JSON.stringify(requestBody),
          signal: controller.signal,
        });

        const data = await response.json();

        updateBudget(readBudgetHeaders(response.headers));

        if (response.ok) {
          const content = data?.choices?.[0]?.message?.content;

          if (!content) {
            const err = new Error("Groq returned empty content");
            err.status = 502;
            throw err;
          }

          return jsonResponse ? JSON.parse(content) : content;
        }

        if (response.status === 429) {
          const waitMs = parseRetryAfterMs(data, response.headers);

          const err = new Error(
            data?.error?.message ||
              "Groq rate limit reached. Please try again shortly.",
          );

          err.status = 429;

          err.waitSeconds =
            waitMs != null
              ? Math.ceil(waitMs / 1000)
              : DEFAULT_429_WAIT_SECONDS;

          throw err;
        }

        if (response.status >= 500 && fiveXxRetries < MAX_5XX_RETRIES) {
          fiveXxRetries += 1;
          await sleep(1000 * fiveXxRetries);
          continue;
        }

        const err = new Error(
          data?.error?.message ||
            `Groq API error: ${response.status}`,
        );

        err.status = response.status;

        throw err;
      } catch (err) {
        if (err.name === "AbortError") {
          const timeoutErr = new Error("Groq request timed out");
          timeoutErr.status = 504;
          throw timeoutErr;
        }

        if (err.status === 429) {
          throw err;
        }

        if (err.status >= 500 && fiveXxRetries < MAX_5XX_RETRIES) {
          fiveXxRetries += 1;
          await sleep(1000 * fiveXxRetries);
          continue;
        }

        throw err;
      } finally {
        clearTimeout(timeout);
      }
    }
  });
};

// Tries each fallback model in order and returns which one actually
// succeeded, so callers can report it in their response `meta`.
const callGroqWithFallback = async (
  messages,
  {
    temperature = 0.4,
    maxTokens = 4000,
    jsonResponse = true,
  } = {},
) => {
  let lastError;

  for (const model of FALLBACK_MODELS) {
    try {
      const result = await callGroq(messages, {
        model,
        temperature,
        maxTokens,
        jsonResponse,
      });

      return { result, model };
    } catch (error) {
      lastError = error;

      if (![404, 429, 500, 502, 503, 504].includes(error.status)) {
        throw error;
      }
    }
  }

  throw lastError;
};

module.exports = {
  callGroq,
  callGroqWithFallback,
  DEFAULT_MODEL,
  FALLBACK_MODELS,
};