const express = require("express");
const router = express.Router();
const {
  analyzePortfolio,
  askFunds,
} = require("../controllers/fundAnalysis.controller");
const {
  requireApiKey,
  ipRateLimit,
} = require("../middleware/fundAnalysisGuard");

router.post("/analyze", requireApiKey, ipRateLimit, analyzePortfolio);
router.post("/ask", requireApiKey, ipRateLimit, askFunds);

module.exports = router;