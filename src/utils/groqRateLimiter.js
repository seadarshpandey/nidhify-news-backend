const MAX_BUDGET_WAIT_MS = 60000;

let lock = Promise.resolve();
let remainingTokens = null;
let resetTokensAt = 0;

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const estimateTokens = (messages, maxTokens = 0) => {
  let chars = 0;
  for (const m of messages || []) {
    chars += (m.role?.length || 0) + (m.content?.length || 0) + 24;
  }
  return Math.ceil(chars / 4) + maxTokens;
};

const updateBudget = (headers = {}) => {
  const remaining = Number(
    headers["x-ratelimit-remaining-tokens"] ??
      headers["X-Ratelimit-Remaining-Tokens"],
  );
  const reset = Number(
    headers["x-ratelimit-reset-tokens"] ?? headers["X-Ratelimit-Reset-Tokens"],
  );
  if (Number.isFinite(remaining)) remainingTokens = remaining;
  if (Number.isFinite(reset) && reset >= 0) {
    resetTokensAt = Date.now() + reset * 1000;
  }
};

const clearBudget = () => {
  remainingTokens = null;
  resetTokensAt = 0;
};

const waitForBudget = async (estimate) => {
  if (remainingTokens == null || estimate <= remainingTokens) return;
  const waitMs = Math.max(0, resetTokensAt - Date.now());
  if (waitMs > 0) {
    await sleep(Math.min(waitMs, MAX_BUDGET_WAIT_MS));
  }
};

const serialize = async (fn) => {
  const run = lock.then(fn, fn);
  lock = run.then(
    () => undefined,
    () => undefined,
  );
  return run;
};

module.exports = {
  estimateTokens,
  updateBudget,
  clearBudget,
  waitForBudget,
  serialize,
  sleep,
};