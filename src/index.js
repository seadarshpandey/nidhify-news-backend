const express = require("express");
const cors = require("cors");
const morgan = require("morgan");
const cron = require("node-cron");
const connectDB = require("./config/db");
require("dotenv").config();
const { sendNewsNotification } = require("./utils/notificationSender");

process.on("unhandledRejection", (err) => {
  console.error("Unhandled rejection:", err.message);
});

const app = express();

const corsOptions = {
  origin: ["http://localhost:3000", process.env.FRONTEND_URL].filter(
    Boolean,
  ),
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
app.use("/api/app-version", require("./routes/appVersion.routes"));
app.use("/api/admin-app-version", require("./routes/adminAppVersion.routes"));
app.use("/api/fund-analysis", require("./routes/fundAnalysis.routes"));

app.get("/api/health", (req, res) =>
  res.json({ status: "ok", time: new Date() }),
);

app.post("/api/notifications/send-news-notification-internal", async (req, res, next) => {
  try {
    if (req.headers["x-admin-secret"] !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ success: false, message: "Unauthorized" });
    }
    const result = await sendNewsNotification();
    res.json({ success: true, message: "Notification sent", data: result });
  } catch (err) {
    next(err);
  }
});

app.use((err, req, res, next) => {
  console.error(err.message);
  const body = { success: false, message: err.message || "Server Error" };
  if (err.cause?.code) body.cause = err.cause.code;
  if (err.status === 429) {
    body.waitSeconds = err.waitSeconds || 15;
  }
  res.status(err.status || 500).json(body);
});

const PORT = process.env.PORT || 5100;

connectDB().then(async () => {
  app.listen(PORT, () => console.log(`News server running on port ${PORT}`));

  const { fetchAndStoreNews } = require("./utils/newsFetcher");

  const timezone = "Asia/Kolkata";

  cron.schedule(
    "0 8-20 * * *",
    () => {
      console.log("Scheduled RSS sync running...");
      fetchAndStoreNews().catch((err) =>
        console.error("RSS sync error:", err.message),
      );
    },
    { timezone },
  );

  cron.schedule(
    "0 8,19 * * *",
    () => {
      console.log("Scheduled notification sending...");
      sendNewsNotification().catch((err) => {
        console.error("Notification cron error:", err.message);
        if (err.cause) console.error("  cause:", err.cause.code, err.cause.message);
      });
    },
    { timezone },
  );

  console.log("Triggering initial background RSS sync...");
  fetchAndStoreNews()
    .then((stats) =>
      console.log(`Initial RSS sync complete: ${JSON.stringify(stats)}`),
    )
    .catch((err) => console.error("Initial RSS sync error:", err.message));
});
