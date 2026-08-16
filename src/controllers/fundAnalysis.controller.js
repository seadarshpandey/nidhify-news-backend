const News = require("../models/News");
const { callGroq, DEFAULT_MODEL } = require("../utils/groqClient");

const MAX_HOLDINGS = 100;
const MAX_QUESTION_LENGTH = 500;
const NEWS_CONTEXT_LIMIT = 4;
const NEWS_SUMMARY_LIMIT = 160;
const COMPACT_FIELDS = [
  "schemeName",
  "planType",
  "rating",
  "AbsReturn",
  "InvestedVal",
  "currVal",
  "currReturn",
];
const NEWS_CATEGORIES = [
  "Mutual Funds",
  "Markets",
  "Wealth",
  "Personal Finance",
];

const compactHoldings = (holdings) =>
  holdings.map((holding) => {
    const out = {};
    for (const field of COMPACT_FIELDS) {
      if (holding[field] != null) out[field] = holding[field];
    }
    return out;
  });

const round = (num, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
};

const escapeRegex = (str) =>
  str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const validateHoldings = (holdings) => {
  if (!Array.isArray(holdings) || holdings.length === 0) {
    return "holdings must be a non-empty array";
  }
  if (holdings.length > MAX_HOLDINGS) {
    return `holdings cannot exceed ${MAX_HOLDINGS} items`;
  }
  return null;
};

const resolveLanguage = (language) =>
  typeof language === "string" && language.trim() ? language.trim() : "English";

const computeAggregates = (holdings) => {
  let totalInvested = 0;
  let totalCurrentValue = 0;

  for (const holding of holdings) {
    totalInvested += Number(holding.InvestedVal) || 0;
    totalCurrentValue += Number(holding.currVal) || 0;
  }

  const totalReturn = round(totalCurrentValue - totalInvested);
  const totalReturnPercent = totalInvested
    ? round((totalReturn / totalInvested) * 100)
    : 0;

  return {
    totalInvested: round(totalInvested),
    totalCurrentValue: round(totalCurrentValue),
    totalReturn,
    totalReturnPercent,
    holdingCount: holdings.length,
  };
};

const formatCurrency = (num) =>
  new Intl.NumberFormat("en-IN", {
    style: "currency",
    currency: "INR",
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  }).format(num);

const trendOf = (num) => (num > 0 ? "up" : num < 0 ? "down" : "flat");

const buildMetrics = (aggregates) => [
  {
    key: "totalInvested",
    label: "Total Invested",
    value: aggregates.totalInvested,
    display: formatCurrency(aggregates.totalInvested),
    format: "currency",
  },
  {
    key: "currentValue",
    label: "Current Value",
    value: aggregates.totalCurrentValue,
    display: formatCurrency(aggregates.totalCurrentValue),
    format: "currency",
  },
  {
    key: "totalReturn",
    label: "Total Return",
    value: aggregates.totalReturn,
    display: formatCurrency(aggregates.totalReturn),
    format: "currency",
    trend: trendOf(aggregates.totalReturn),
  },
  {
    key: "returnPercent",
    label: "Return %",
    value: aggregates.totalReturnPercent,
    display: `${aggregates.totalReturnPercent}%`,
    format: "percent",
    trend: trendOf(aggregates.totalReturnPercent),
  },
];

const getNewsContext = async () => {
  try {
    const categoryRegexes = NEWS_CATEGORIES.map(
      (c) => new RegExp(`^${escapeRegex(c)}$`, "i"),
    );

    const articles = await News.find({ category: { $in: categoryRegexes } })
      .sort({ publishedAt: -1 })
      .limit(NEWS_CONTEXT_LIMIT)
      .select("title description category publishedAt source")
      .lean();

    return articles.map((a) => ({
      title: a.title,
      category: a.category,
      source: a.source,
      publishedAt: a.publishedAt,
      summary: (a.description || "").slice(0, NEWS_SUMMARY_LIMIT),
    }));
  } catch (err) {
    console.error("News context fetch failed (continuing without it):", err.message);
    return [];
  }
};

const newsNote = (newsContext) =>
  newsContext.length > 0
    ? `Latest market news context (most recent first, use only as supplementary background):
${JSON.stringify(newsContext, null, 2)}`
    : "No market news context is currently available. Base the analysis only on the provided holdings data.";

const buildAnalysisPrompt = (holdings, aggregates, newsContext, language) => {
  const systemContent = `You are an educational mutual fund analyst. You help investors UNDERSTAND their portfolio but are NOT a SEBI-registered advisor and have NO certification to recommend investments.

STRICT RULE: Never recommend buying, selling, adding, reducing or exiting any fund. No "you should buy/sell/add/exit" or "I recommend". Give objective analysis of each fund's performance, risk, costs, category role and factors to weigh, and direct the investor to a SEBI-registered advisor for buy/sell decisions.

Analyze EVERY fund in the holdings. Be concise: keep every text field short. Write all text in ${language}.

Respond ONLY with valid JSON matching this schema (no markdown, no fences, no text outside the JSON):
{
  "summary": "2-3 sentence overall assessment",
  "health": { "score": 0-100, "label": "Strong | Moderate | Needs Attention", "reasoning": "short" },
  "diversification": { "score": 0-100, "label": "Well Diversified | Moderate | Concentrated", "observations": ["..."], "concentrationRisk": "..." },
  "funds": [
    {
      "schemeCode": number, "schemeName": "full name", "planType": "Direct | Regular",
      "category": "Liquid | Mid Cap | Small Cap | Flexi Cap | Large Cap / Index | other",
      "invested": number, "currentValue": number, "returnPercent": number,
      "weight": number, "riskLevel": "Low | Moderate | High | Very High",
      "rating": "as provided", "ratingMeaning": "one line",
      "navAnalysis": "one line on NAV and return since investment",
      "performanceAnalysis": "2-3 sentences on performance, risk and portfolio role",
      "strengths": ["2-3"], "weaknesses": ["2-3"], "keyFactors": ["2-3 concise"],
      "assessment": "descriptive, no buy/sell directive", "suitability": "who this suits, factors to weigh",
      "whatToWatch": "risks/events to monitor"
    }
  ],
  "categoryExposure": [{ "category": "...", "weightPercent": number }],
  "marketContext": "2-3 sentence market context (skip news if none available)",
  "considerations": ["4-6 factual points, NOT buy/sell directives"],
  "alerts": { "positive": ["..."], "negative": ["..."] },
  "riskProfile": "one paragraph",
  "report": "A CONCISE narrative in ${language}. Use '\\n' for paragraph breaks and '### ' for headings (e.g. '### Portfolio Summary', '### HDFC Mid Cap Fund'). Cover: portfolio summary, every fund (max 2 short sentences each), diversification, market context, considerations, alerts, disclaimer. NO buy/sell directives.",
  "disclaimer": "AI-generated, educational, not investment advice; consult a SEBI-registered advisor."
}`;

  const userContent = `Investor portfolio holdings (primary data):
${JSON.stringify({ holdings, aggregates }, null, 2)}

${newsNote(newsContext)}

Return the analysis JSON written in ${language}.`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
};

const buildAskPrompt = (holdings, aggregates, newsContext, language, question) => {
  const systemContent = `You are an educational mutual fund analyst. You help investors UNDERSTAND their funds but are NOT a SEBI-registered advisor and have NO certification to recommend investments.

STRICT RULE: Never recommend buying, selling, adding, reducing or exiting any fund. Give objective explanation of performance, risk, costs and factors to weigh, and direct the investor to a SEBI-registered advisor for buy/sell decisions.

Answer the investor's question clearly and helpfully based ONLY on the provided holdings and supplementary news. Be specific to the actual funds. If data is insufficient, say so honestly. Be concise. Write the answer in ${language}.`;

  const userContent = `Investor portfolio holdings:
${JSON.stringify({ holdings, aggregates }, null, 2)}

${newsNote(newsContext)}

Investor's question: ${question}

Answer in ${language}.`;

  return [
    { role: "system", content: systemContent },
    { role: "user", content: userContent },
  ];
};

const mergeFundNumbers = (holdings, funds = []) => {
  const keyOf = (schemeCode, invested) =>
    `${schemeCode}_${Math.round(Number(invested) * 100)}`;

  const valuesByKey = new Map();
  for (const holding of holdings) {
    valuesByKey.set(keyOf(holding.schemeCode, holding.InvestedVal), {
      invested: round(Number(holding.InvestedVal) || 0),
      currentValue: round(Number(holding.currVal) || 0),
      returnPercent: round(Number(holding.AbsReturn) ?? Number(holding.currReturn) ?? 0),
    });
  }

  return funds.map((fund) => {
    const match = valuesByKey.get(
      keyOf(fund.schemeCode, fund.invested),
    );
    return match ? { ...fund, ...match } : fund;
  });
};

const analyzePortfolio = async (req, res, next) => {
  try {
    const { holdings, language } = req.body;

    const validationError = validateHoldings(holdings);
    if (validationError) {
      return res
        .status(400)
        .json({ success: false, message: validationError });
    }

    const lang = resolveLanguage(language);
    const aggregates = computeAggregates(holdings);
    const modelHoldings = compactHoldings(holdings);

    const newsContext = await getNewsContext();

    const messages = buildAnalysisPrompt(
      modelHoldings,
      aggregates,
      newsContext,
      lang,
    );
    const analysis = await callGroq(messages, { maxTokens: 5000 });

    const result = {
      ...analysis,
      metrics: buildMetrics(aggregates),
      funds: mergeFundNumbers(holdings, analysis.funds),
      meta: {
        analyzedAt: new Date().toISOString(),
        language: lang,
        model: DEFAULT_MODEL,
      },
    };

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

const askFunds = async (req, res, next) => {
  try {
    const { holdings, question, language } = req.body;

    const validationError = validateHoldings(holdings);
    if (validationError) {
      return res
        .status(400)
        .json({ success: false, message: validationError });
    }

    if (typeof question !== "string" || !question.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "question is required" });
    }
    if (question.length > MAX_QUESTION_LENGTH) {
      return res
        .status(400)
        .json({
          success: false,
          message: `question cannot exceed ${MAX_QUESTION_LENGTH} characters`,
        });
    }

    const lang = resolveLanguage(language);
    const aggregates = computeAggregates(holdings);
    const questionText = question.trim();
    const modelHoldings = compactHoldings(holdings);

    const newsContext = await getNewsContext();

    const messages = buildAskPrompt(
      modelHoldings,
      aggregates,
      newsContext,
      lang,
      questionText,
    );
    const answer = await callGroq(messages, {
      maxTokens: 1500,
      jsonResponse: false,
    });

    const result = {
      question: questionText,
      answer,
      language: lang,
      answeredAt: new Date().toISOString(),
    };

    res.json({ success: true, data: result });
  } catch (err) {
    next(err);
  }
};

module.exports = { analyzePortfolio, askFunds };