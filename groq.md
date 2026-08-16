# Groq Mutual Fund Analysis API

This backend integrates with [Groq](https://console.groq.com) (free tier) to analyze mutual fund portfolios and answer investor questions. News context is read from the local `News` collection (synced hourly) but is **optional** — analysis works even when no news is available.

> **No Recommendations Policy:** This AI is an *educational* analyst. It is NOT a SEBI-registered investment advisor and holds no certification, so it **never recommends buying, selling, adding, reducing, or exiting any fund**. It provides objective analysis (performance, risk, costs, factors to weigh) and always directs investors to consult a SEBI-registered advisor for buy/sell decisions.

## Setup

1. Create a free account at https://console.groq.com (no credit card required).
2. Generate an API key: **API Keys → Create API Key**.
3. Add it to `.env`:

```
GROQ_API_KEY=gsk_your_key_here
FUND_ANALYSIS_API_KEY=<a long random hex string>
```

- Default model: `llama-3.3-70b-versatile`
- Free tier limits: 30 req/min, 14,400 req/day, ~12k tokens/min (a rate-limit 429 returns `waitSeconds` so the client can wait and retry).
- **Auth:** every request to `/api/fund-analysis/*` must send `x-api-key: <FUND_ANALYSIS_API_KEY>` (401 otherwise).
- **Rate limits (per IP, in-memory):** `/analyze` = 5 req / 10 min, `/ask` = 30 req / 10 min (429 with `waitSeconds` on exceed).

---

## Endpoint 1: Deep Portfolio Analysis

**`POST /api/fund-analysis/analyze`**

Analyzes the whole portfolio and **every fund individually** (per-fund deep dive: rating meaning, NAV analysis, strengths/weaknesses, assessment, what to watch). The AI never issues buy/sell/add/exit directives.

### Request

```bash
curl -X POST http://localhost:5100/api/fund-analysis/ask \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FUND_ANALYSIS_API_KEY" \
  -d '{
    "language": "English",
    "holdings": [
      {
        "schemeCode": 119568,
        "schemeName": "Aditya Birla Sun Life Liquid Fund - Growth - Direct Plan",
        "currVal": 506.17,
        "InvestedVal": 500,
        "currReturn": 6.17,
        "AbsReturn": 1.23,
        "planType": "Direct",
        "rating": "Not Rated",
        "latestNAV": 456.8278,
        "latestNAVDate": "2026-08-14T00:00:00.000Z"
      },
      {
        "schemeCode": 118989,
        "schemeName": "HDFC Mid Cap Fund - Growth Option - Direct Plan",
        "currVal": 13798.69,
        "InvestedVal": 13000,
        "currReturn": 798.69,
        "AbsReturn": 6.14,
        "planType": "Direct",
        "rating": "In-Form",
        "latestNAV": 236.372,
        "latestNAVDate": "2026-08-14T00:00:00.000Z"
      },
      {
        "schemeCode": 120716,
        "schemeName": "UTI Nifty 50 Index Fund - Growth Option- Direct",
        "currVal": 3794.91,
        "InvestedVal": 4000,
        "currReturn": -205.09,
        "AbsReturn": -5.13,
        "planType": "Direct",
        "rating": "On-Track",
        "latestNAV": 171.5836,
        "latestNAVDate": "2026-08-14T00:00:00.000Z"
      }
    ]
  }'
```

### Success Response (`200`)

```json
{
  "success": true,
  "data": {
    "summary": "The portfolio shows a moderate return of 3.43% with a total invested value of ₹17,500 and a current value of ₹18,099.77. It is spread across liquid, mid cap and large cap / index categories, with a healthy mix of low and moderate risk funds. The UTI Nifty 50 Index Fund is currently underperforming.",
    "metrics": [
      { "key": "totalInvested", "label": "Total Invested", "value": 17500, "display": "₹17,500.00", "format": "currency" },
      { "key": "currentValue", "label": "Current Value", "value": 18099.77, "display": "₹18,099.77", "format": "currency" },
      { "key": "totalReturn", "label": "Total Return", "value": 599.77, "display": "₹599.77", "format": "currency", "trend": "up" },
      { "key": "returnPercent", "label": "Return %", "value": 3.43, "display": "3.43%", "format": "percent", "trend": "up" }
    ],
    "health": {
      "score": 68,
      "label": "Moderate",
      "reasoning": "Returns are positive but modest, diversification is reasonable, and there is one underperforming holding pulling the portfolio down."
    },
    "diversification": {
      "score": 72,
      "label": "Moderate",
      "observations": [
        "Mix of liquid, mid cap and index categories",
        "No single fund exceeds 76% of invested value"
      ],
      "concentrationRisk": "Moderate exposure to mid cap volatility through the HDFC Mid Cap Fund."
    },
    "funds": [
      {
        "schemeCode": 119568,
        "schemeName": "Aditya Birla Sun Life Liquid Fund - Growth - Direct Plan",
        "planType": "Direct",
        "category": "Liquid",
        "invested": 500,
        "currentValue": 506.17,
        "returnPercent": 1.23,
        "weight": 2.8,
        "riskLevel": "Low",
        "rating": "Not Rated",
        "ratingMeaning": "Liquid funds are typically not risk-rated in the same way as equity funds because of their low volatility.",
        "navAnalysis": "Latest NAV of 456.8278 on 2026-08-14 shows stable, low-risk appreciation with an absolute return of 1.23% since investment.",
        "performanceAnalysis": "The fund has performed as expected for a liquid fund, providing steady and low-risk returns. Its role in the portfolio is capital preservation and emergency liquidity rather than growth. Given the small allocation, its performance impact is minimal.",
        "strengths": ["Very low risk", "High liquidity", "Stable NAV"],
        "weaknesses": ["Low returns", "Small allocation limits impact"],
        "keyFactors": ["Capital preservation", "Short-term parking"],
        "assessment": "This liquid fund is serving its role as the portfolio's safety and liquidity component, with steady low-risk appreciation of 1.23% since investment.",
        "suitability": "Generally suits investors needing emergency funds or short-term parking; returns are low by design.",
        "whatToWatch": "Rates can fall if the RBI cuts rates; consider shifting excess cash to a short-duration fund only if yields turn unattractive."
      },
      {
        "schemeCode": 118989,
        "schemeName": "HDFC Mid Cap Fund - Growth Option - Direct Plan",
        "planType": "Direct",
        "category": "Mid Cap",
        "invested": 13000,
        "currentValue": 13798.69,
        "returnPercent": 6.14,
        "weight": 76.2,
        "riskLevel": "High",
        "rating": "In-Form",
        "ratingMeaning": "The 'In-Form' rating indicates the fund is currently performing well relative to its category.",
        "navAnalysis": "Latest NAV of 236.372 on 2026-08-14 with an absolute return of 6.14% since investment, outperforming the rest of the portfolio.",
        "performanceAnalysis": "This is the portfolio's best performer and also its largest allocation at 76% of invested value. Mid cap funds carry higher volatility and cyclicality, so the strong recent performance should be seen against that risk. The concentration here is the single biggest risk to portfolio stability.",
        "strengths": ["Best performing holding", "Strong fund house", "Good category track record"],
        "weaknesses": ["Very large concentration", "High volatility", "Mid cap cyclicality"],
        "keyFactors": ["Concentration risk", "Outperformer"],
        "assessment": "A well-performing fund that also carries the portfolio's highest concentration and volatility; both the performance and the risk should be weighed together.",
        "suitability": "Generally suits investors with a long horizon and high risk appetite; mid cap volatility should be expected.",
        "whatToWatch": "Mid cap valuations, market correction risk, and any change in fund manager or mandate."
      },
      {
        "schemeCode": 120716,
        "schemeName": "UTI Nifty 50 Index Fund - Growth Option- Direct",
        "planType": "Direct", 
        "category": "Large Cap / Index",
        "invested": 4000,
        "currentValue": 3794.91,
        "returnPercent": -5.13,
        "weight": 21.0,
        "riskLevel": "Moderate",
        "rating": "On-Track",
        "ratingMeaning": "'On-Track' means the fund is performing in line with its category expectations, neither outstanding nor lagging by much.",
        "navAnalysis": "Latest NAV of 171.5836 on 2026-08-14 with an absolute return of -5.13% since investment, tracking the Nifty 50 decline.",
        "performanceAnalysis": "The fund tracks the Nifty 50, so its negative return mirrors the index correction. This is expected for an index fund during market downturns. Its role is broad market exposure and low cost; the loss is a paper loss unless redeemed.",
        "strengths": ["Low cost", "Broad market exposure", "No manager risk"],
        "weaknesses": ["No downside protection", "Tracks market falls"],
        "keyFactors": ["Index tracking", "Long-term core holding"],
        "assessment": "An index fund currently in a short-term drawdown that mirrors the broader market correction; its long-term core role remains unchanged.",
        "suitability": "Generally suits long-horizon investors wanting low-cost broad market exposure.",
        "whatToWatch": "Nifty 50 trend, any change in tracking error, and horizon alignment."
      }
    ],
    "categoryExposure": [
      { "category": "Liquid", "weightPercent": 2.8 },
      { "category": "Mid Cap", "weightPercent": 76.2 },
      { "category": "Large Cap / Index", "weightPercent": 21.0 }
    ],
    "marketContext": "Equity markets have been volatile recently; large caps have corrected while mid caps have remained relatively resilient. Investors should avoid reacting to short-term swings.",
    "considerations": [
      "76% of invested value sits in a single mid cap fund - the largest concentration risk in the portfolio.",
      "The liquid fund allocation is small (2.8%) but serves as the emergency/safety component.",
      "The index fund's -5.13% is a paper loss mirroring the broader Nifty 50 correction.",
      "Direct plans generally have lower expense ratios than regular plans, which matters over the long term.",
      "Portfolio risk is moderate-to-high due to the mid cap overweight."
    ],
    "alerts": {
      "positive": [
        "Portfolio is net positive at +3.43%",
        "Best performer (Mid Cap) has strong momentum"
      ],
      "negative": [
        "76% of the portfolio is in one fund",
        "Index fund is showing a -5.13% paper loss"
      ]
    },
    "riskProfile": "Moderate-to-high risk driven primarily by the large single-fund allocation to a mid cap fund.",
    "report": "### Portfolio Summary\nThe portfolio has returned 3.43% since investment, with a current value of approximately ₹18,099 against ₹17,500 invested. It is spread across liquid, mid cap and index categories, giving a moderate overall risk profile.\n\n### Aditya Birla Sun Life Liquid Fund\nThis liquid fund provides stability and emergency liquidity with very low risk. Its small allocation limits its impact on returns.\n\n### HDFC Mid Cap Fund\nThe portfolio's largest and best performing holding at 76% of invested value, up 6.14%. Its high concentration and mid cap volatility are the portfolio's biggest risks.\n\n### UTI Nifty 50 Index Fund\nThe index fund is down 5.13%, tracking the broader market correction. As a low-cost core large-cap holding this is a paper loss unless redeemed.\n\n### Considerations\nWeigh the mid cap concentration, keep the liquid fund for emergencies, and review the portfolio periodically.\n\n### Disclaimer\nThis analysis is generated by an AI and is for educational and informational purposes only. It is NOT investment advice and does not constitute a recommendation to buy, sell, or hold any mutual fund. Please consult a SEBI-registered investment advisor before making any investment decision.",
    "disclaimer": "This analysis is generated by an AI and is for educational and informational purposes only. It is NOT investment advice and does not constitute a recommendation to buy, sell, or hold any mutual fund. Please consult a SEBI-registered investment advisor before making any investment decision.",
    "meta": {
      "analyzedAt": "2026-08-16T04:45:00.000Z",
      "language": "English",
      "model": "llama-3.3-70b-versatile"
    }
  }
}
```

### Validation Error (`400`)

```bash
curl -X POST http://localhost:5100/api/fund-analysis/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FUND_ANALYSIS_API_KEY" \
  -d '{ "holdings": [] }'
```

```json
{
  "success": false,
  "message": "holdings must be a non-empty array"
}
```

---

## Endpoint 2: Ask About Your Funds

**`POST /api/fund-analysis/ask`**

Plain-text Q&A. Send the same `holdings` plus a `question`; Groq answers specifically about the funds in the portfolio.

### Request

```bash
curl -X POST http://localhost:5100/api/fund-analysis/analyze \
  -H "Content-Type: application/json" \
  -H "x-api-key: $FUND_ANALYSIS_API_KEY" \
  -d '{
    "language": "English",
    "question": "Which fund should I add more money to and why?",
    "holdings": [
      {
        "schemeCode": 118989,
        "schemeName": "HDFC Mid Cap Fund - Growth Option - Direct Plan",
        "currVal": 13798.69,
        "InvestedVal": 13000,
        "currReturn": 798.69,
        "AbsReturn": 6.14,
        "planType": "Direct",
        "rating": "In-Form",
        "latestNAV": 236.372,
        "latestNAVDate": "2026-08-14T00:00:00.000Z"
      },
      {
        "schemeCode": 120716,
        "schemeName": "UTI Nifty 50 Index Fund - Growth Option- Direct",
        "currVal": 3794.91,
        "InvestedVal": 4000,
        "currReturn": -205.09,
        "AbsReturn": -5.13,
        "planType": "Direct",
        "rating": "On-Track",
        "latestNAV": 171.5836,
        "latestNAVDate": "2026-08-14T00:00:00.000Z"
      }
    ]
  }'
```

### Success Response (`200`)

```json
{
  "success": true,
  "data": {
    "question": "Which fund should I add more money to and why?",
    "answer": "I cannot recommend buying or adding to any specific fund, as this analysis is educational and not investment advice. What I can do is lay out the facts you should weigh before deciding. The HDFC Mid Cap Fund (118989) has delivered the strongest absolute return so far (6.14%) and is rated In-Form, but it already holds about 76% of your invested value, so adding to it would further concentrate your risk in mid cap volatility. The UTI Nifty 50 Index Fund (120716) is currently down -5.13%, which reflects the broader market correction; its low cost and broad exposure make it the portfolio's core large-cap holding. Whether adding to either makes sense depends on your horizon, risk appetite and asset allocation goals - please consult a SEBI-registered investment advisor for a decision.",
    "language": "English",
    "answeredAt": "2026-08-16T04:50:00.000Z"
  }
}
```

### Validation Errors (`400`)

Missing question:

```json
{
  "success": false,
  "message": "question is required"
}
```

Question too long (> 500 chars):

```json
{
  "success": false,
  "message": "question cannot exceed 500 characters"
}
```

---

## Language Support

Both endpoints accept an optional `language` field (e.g. `"Hindi"`, `"Hinglish"`, `"Tamil"`). When omitted, it defaults to `"English"` and every text field in the response is written in that language.

## Error Handling

| Scenario | Status | Body |
| --- | --- | --- |
| Missing/invalid `holdings` | `400` | `{ "success": false, "message": "holdings must be a non-empty array" }` |
| `holdings` > 100 items | `400` | `{ "success": false, "message": "holdings cannot exceed 100 items" }` |
| Missing/empty `question` | `400` | `{ "success": false, "message": "question is required" }` |
| `question` > 500 chars | `400` | `{ "success": false, "message": "question cannot exceed 500 characters" }` |
| Missing/wrong `x-api-key` | `401` | `{ "success": false, "message": "Unauthorized" }` |
| Per-IP rate limit exceeded | `429` | `{ "success": false, "message": "Too many requests. Please try again in Ns.", "waitSeconds": N }` |
| `GROQ_API_KEY` not set | `500` | `{ "success": false, "message": "GROQ_API_KEY is not configured" }` |
| Groq rate-limited/timed out | `429`/`504` | `{ "success": false, "message": "..." }` (429 includes `waitSeconds`) |