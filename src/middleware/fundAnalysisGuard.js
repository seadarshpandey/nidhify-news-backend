const WINDOW_MS = 10 * 60 * 1000;

const RATE_LIMITS = {
  analyze: { limit: 5, windowMs: WINDOW_MS },
  ask: { limit: 30, windowMs: WINDOW_MS },
};

const buckets = new Map();

const getClientIp = (req) =>
  req.headers["x-forwarded-for"]?.split(",")[0]?.trim() ||
  req.ip ||
  req.socket?.remoteAddress ||
  "unknown";

const cleanupExpired = () => {
  const now = Date.now();
  for (const [key, entry] of buckets) {
    if (now - entry.startedAt > entry.windowMs) {
      buckets.delete(key);
    }
  }
};

const requireApiKey = (req, res, next) => {
  const key = process.env.FUND_ANALYSIS_API_KEY;
  if (!key || req.headers["x-api-key"] !== key) {
    return res
      .status(401)
      .json({ success: false, message: "Unauthorized" });
  }
  next();
};

const ipRateLimit = (req, res, next) => {
  const fullPath = req.baseUrl + req.path;
  const isAnalyze = fullPath.endsWith("/analyze");
  const rule = isAnalyze ? RATE_LIMITS.analyze : RATE_LIMITS.ask;
  if (!rule) return next();

  const ip = getClientIp(req);
  const bucketKey = `${ip}|${isAnalyze ? "analyze" : "ask"}`;
  const now = Date.now();

  if (buckets.size > 1000) cleanupExpired();

  let entry = buckets.get(bucketKey);
  if (!entry || now - entry.startedAt > rule.windowMs) {
    entry = { startedAt: now, count: 0 };
    buckets.set(bucketKey, entry);
  }

  entry.count += 1;
  if (entry.count > rule.limit) {
    const waitSeconds = Math.max(
      1,
      Math.ceil((entry.startedAt + rule.windowMs - now) / 1000),
    );
    return res.status(429).json({
      success: false,
      message: `Too many requests. Please try again in ${waitSeconds}s.`,
      waitSeconds,
    });
  }

  next();
};

module.exports = { requireApiKey, ipRateLimit };