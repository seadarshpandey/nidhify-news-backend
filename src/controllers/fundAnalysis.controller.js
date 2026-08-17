const { callGroqWithFallback } = require("../utils/groqClient");

const MAX_HOLDINGS = 100;
const MAX_QUESTION_LENGTH = 500;

const compactHoldings = (holdings, totalInvested) =>
  holdings.map((holding, idx) => {
    const invested = Number(holding.InvestedVal) || 0;

    return {
      idx,
      n: holding.schemeName,
      r: holding.rating,
      i: invested,
      v: Number(holding.currVal) || 0,
      ar: Number(holding.AbsReturn) || 0,
      w: totalInvested
        ? Number(((invested / totalInvested) * 100).toFixed(2))
        : 0,
    };
  });

const round = (num, digits = 2) => {
  const factor = 10 ** digits;
  return Math.round(num * factor) / factor;
};

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
  typeof language === "string" && language.trim()
    ? language.trim()
    : "English";

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

const buildAnalysisPrompt = (holdings, aggregates, language) => {
  const systemContent = `You are an educational mutual fund portfolio analyst. Help investors understand their portfolio. You are not a SEBI-registered advisor.

Never recommend buying, selling, adding, reducing or exiting any fund. Do not use phrases such as "you should buy", "sell", "add", "exit" or "I recommend". Provide objective analysis only. Mention consulting a SEBI-registered advisor for investment decisions.

Analyze every holding using only the supplied data. Do not invent missing data. Financial values supplied by the system are authoritative. Do not recalculate them. Keep all text concise.

Write all text in ${language}.

Return ONLY valid JSON. No markdown or text outside JSON.

Required structure:
{
  "summary": "2-3 concise sentences",
  "health": {
    "score": 0,
    "label": "Strong | Moderate | Needs Attention",
    "reasoning": "short"
  },
  "diversification": {
    "score": 0,
    "label": "Well Diversified | Moderate | Concentrated",
    "observations": ["short observations"],
    "concentrationRisk": "short"
  },
  "funds": [
    {
      "idx": 0,
      "category": "Liquid | Mid Cap | Small Cap | Flexi Cap | Large Cap / Index | other",
      "riskLevel": "Low | Moderate | High | Very High",
      "ratingMeaning": "one short line",
      "navAnalysis": "one short line; do not invent NAV data",
      "performanceAnalysis": "2 short sentences",
      "strengths": ["2 short points"],
      "weaknesses": ["2 short points"],
      "keyFactors": ["2 short points"],
      "assessment": "objective short assessment",
      "suitability": "who this type of fund may suit, without recommendation",
      "whatToWatch": "short risks or factors to monitor"
    }
  ],
  "categoryExposure": [
    {
      "category": "...",
      "weightPercent": 0
    }
  ],
  "marketContext": "State that current market/news data was not supplied. Do not invent current market conditions.",
  "considerations": ["4 concise factual points"],
  "alerts": {
    "positive": ["short points"],
    "negative": ["short points"]
  },
  "riskProfile": "one concise paragraph",
  "report": "Concise narrative in ${language}. Use \\\\n for paragraph breaks and ### for headings. Cover portfolio summary, every fund, diversification, market context, considerations and alerts. No buy/sell directives.",
  "disclaimer": "AI-generated educational information, not investment advice; consult a SEBI-registered advisor."
}

Field mapping for input:
idx = position of this holding in the holdings array (copy it back exactly in funds[].idx, do not recompute or reorder)
n = scheme name
r = rating
i = invested value
v = current value
ar = absolute return percentage
w = portfolio weight percentage.`;

  const userContent = `Portfolio:
${JSON.stringify({
  h: holdings,
  a: aggregates,
})}

Analyze every holding and return the required JSON in ${language}.`;

  return [
    {
      role: "system",
      content: systemContent,
    },
    {
      role: "user",
      content: userContent,
    },
  ];
};

const buildAskPrompt = (holdings, aggregates, language, question) => {
  const systemContent = `You are an educational mutual fund analyst. Help investors understand their funds. You are not a SEBI-registered advisor.

Never recommend buying, selling, adding, reducing or exiting any fund. Give objective explanations of performance, risk, costs, category role and relevant factors.

Answer only from the supplied portfolio data. Do not invent missing information. Financial values supplied by the system are authoritative.

Be concise and specific to the user's actual funds. Write in ${language}.

Current market or news data was not supplied. Do not claim current market events or recent news.

Answer the question directly.`;

  const userContent = `Portfolio:
${JSON.stringify({
  h: holdings,
  a: aggregates,
})}

Question: ${question}

Answer in ${language}.`;

  return [
    {
      role: "system",
      content: systemContent,
    },
    {
      role: "user",
      content: userContent,
    },
  ];
};

// Reconstructs each fund entry directly from the source holding by index —
// no key-matching against model-echoed numbers, so nothing can silently
// fail to merge.
const attachFundData = (holdings, aggregates, funds = []) =>
  funds.map((f) => {
    const holding = holdings[f.idx];

    if (!holding) return f; // safety net if idx is ever missing/out of range

    const invested = round(Number(holding.InvestedVal) || 0);
    const currentValue = round(Number(holding.currVal) || 0);

    return {
      schemeCode: holding.schemeCode,
      schemeName: holding.schemeName,
      planType: holding.planType,
      rating: holding.rating,
      invested,
      currentValue,
      returnPercent: round(
        Number(holding.AbsReturn) || Number(holding.currReturn) || 0,
      ),
      weight: aggregates.totalInvested
        ? round((invested / aggregates.totalInvested) * 100)
        : 0,
      category: f.category,
      riskLevel: f.riskLevel,
      ratingMeaning: f.ratingMeaning,
      navAnalysis: f.navAnalysis,
      performanceAnalysis: f.performanceAnalysis,
      strengths: f.strengths,
      weaknesses: f.weaknesses,
      keyFactors: f.keyFactors,
      assessment: f.assessment,
      suitability: f.suitability,
      whatToWatch: f.whatToWatch,
    };
  });

const analyzePortfolio = async (req, res, next) => {
  try {
    const { holdings, language } = req.body;

    const validationError = validateHoldings(holdings);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    const lang = resolveLanguage(language);

    const aggregates = computeAggregates(holdings);

    const modelHoldings = compactHoldings(holdings, aggregates.totalInvested);

    const messages = buildAnalysisPrompt(modelHoldings, aggregates, lang);

    const { result: analysis, model } = await callGroqWithFallback(messages, {
      maxTokens: 2500,
    });

    const result = {
      ...analysis,
      metrics: buildMetrics(aggregates),
      funds: attachFundData(holdings, aggregates, analysis.funds),
      meta: {
        analyzedAt: new Date().toISOString(),
        language: lang,
        model,
      },
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

const askFunds = async (req, res, next) => {
  try {
    const { holdings, question, language } = req.body;

    const validationError = validateHoldings(holdings);

    if (validationError) {
      return res.status(400).json({
        success: false,
        message: validationError,
      });
    }

    if (typeof question !== "string" || !question.trim()) {
      return res.status(400).json({
        success: false,
        message: "question is required",
      });
    }

    if (question.length > MAX_QUESTION_LENGTH) {
      return res.status(400).json({
        success: false,
        message: `question cannot exceed ${MAX_QUESTION_LENGTH} characters`,
      });
    }

    const lang = resolveLanguage(language);

    const aggregates = computeAggregates(holdings);

    const questionText = question.trim();

    const modelHoldings = compactHoldings(holdings, aggregates.totalInvested);

    const messages = buildAskPrompt(modelHoldings, aggregates, lang, questionText);

    const { result: answer, model } = await callGroqWithFallback(messages, {
      maxTokens: 1000,
      jsonResponse: false,
    });

    const result = {
      question: questionText,
      answer,
      language: lang,
      answeredAt: new Date().toISOString(),
      model,
    };

    res.json({
      success: true,
      data: result,
    });
  } catch (err) {
    next(err);
  }
};

module.exports = {
  analyzePortfolio,
  askFunds,
};