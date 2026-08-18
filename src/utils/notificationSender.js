const News = require("../models/News");

async function sendNewsNotification() {
  try {
    const latest = await News.findOne().sort({ publishedAt: -1 }).lean();
    if (!latest) {
      console.log("No news articles found to send notification.");
      return null;
    }

    const payload = {
      title: latest.title.slice(0, 60),
      message: (latest.description || latest.title).slice(0, 90),
      url: "https://app.nidhify.com/ReadNews",
      sendToAll: true,
    };

    console.log(`Sending notification for: "${latest.title}"`);

    const apiUrl = `${(process.env.MAIN_BACKEND_URL).trim()}/api/notifications/send-news-notification`;
    const res = await fetch(apiUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-admin-secret": process.env.ADMIN_SECRET,
      },
      body: JSON.stringify(payload),
      signal: AbortSignal.timeout(15000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${res.statusText}`);
    }

    const data = await res.json();
    console.log(`Notification sent successfully: ${JSON.stringify(data)}`);
    return data;
  } catch (err) {
    console.error("Notification send error:", err.message);
    if (err.cause) console.error("  cause:", err.cause.code, err.cause.message);
    console.error(err.stack);
    throw err;
  }
}

module.exports = { sendNewsNotification };
