const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const connectDB = require("./config/db");
require("dotenv").config();

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err.message);
});

const app = express();

const corsOptions = {
  origin: [process.env.FRONTEND_URL].filter(Boolean),
  methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
  allowedHeaders: ["Content-Type", "Authorization"],
  credentials: true,
  optionsSuccessStatus: 204,
};

app.use(cors(corsOptions));
app.options("*", cors(corsOptions));
app.use(express.json({ limit: "10mb" }));
app.use(morgan("dev"));

app.use("/api/news", require("./routes/news.routes"));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", time: new Date() }),
);

app.use((err, req, res, next) => {
  console.error(err.message);
  res.status(err.status || 500).json({ success: false, message: err.message || "Server Error" });
});

const PORT = process.env.PORT || 5100;

connectDB().then(async () => {
  app.listen(PORT, () => console.log(`News server running on port ${PORT}`));

  const { fetchAllNews, resetCache } = require("./utils/newsFetcher");
  const newsCount = await require("./models/News").countDocuments();
  if (newsCount === 0) {
    console.log("No news in DB. Fetching from RSS feeds...");
    fetchAllNews()
      .then(() => console.log("Initial news fetch complete"))
      .catch((err) => console.error("Initial news fetch error:", err.message));
  } else {
    console.log(`${newsCount} news articles found in DB. Loading into cache...`);
    resetCache();
    fetchAllNews()
      .then(() => console.log("Cache loaded from DB"))
      .catch((err) => console.error("Cache load error:", err.message));
  }
});

const cron = require("node-cron");
cron.schedule("*/30 * * * *", async () => {
  console.log("Scheduled news refresh starting...");
  try {
    const { fetchAllNews, resetCache } = require("./utils/newsFetcher");
    resetCache();
    const articles = await fetchAllNews();
    console.log(`News refresh complete: ${articles.length} articles`);
  } catch (err) {
    console.error("News refresh error:", err.message);
  }
});
