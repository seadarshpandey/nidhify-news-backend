const crypto = require("crypto");
const Parser = require("rss-parser");
const News = require("../models/News");

const NEWS_FEEDS = [
  {
    name: "ET Mutual Funds",
    url: "https://economictimes.indiatimes.com/mf/rssfeeds/359241701.cms",
    category: "Mutual Funds",
  },
  {
    name: "Livemint",
    url: "https://www.livemint.com/rss/markets",
    category: "Markets",
  },
  {
    name: "Moneycontrol Markets",
    url: "https://economictimes.indiatimes.com/wealth/rssfeeds/837555174.cms",
    category: "Wealth",
  },
  {
    name: "LiveMint Money",
    url: "https://www.livemint.com/rss/money",
    category: "Personal Finance",
  },
  {
    name: "LiveMint Money",
    url: "https://www.livemint.com/rss/budget",
    category: "Personal Finance",
  },
  {
    name: "ET Now Markets",
    url: "https://www.etnownews.com/feeds/gns-etn-markets.xml",
    category: "Markets",
  },
  {
    name: "ET Now Personal Finance",
    url: "https://www.etnownews.com/feeds/gns-etn-personal-finance.xml",
    category: "Personal Finance",
  },
  {
    name: "ET Now Mutual Funds",
    url: "https://www.etnownews.com/feeds/gns-etn-mutual-funds.xml",
    category: "Mutual Funds",
  },
  {
    name: "ET Now Income Tax",
    url: "https://www.etnownews.com/feeds/gns-etn-income-tax.xml",
    category: "Finance",
  },
  {
    name: "ET Now Budget",
    url: "https://www.etnownews.com/feeds/gns-etn-budget.xml",
    category: "Budget",
  },
  {
    name: "LiveMint",
    url: "https://www.livemint.com/rss/budget",
    category: "Budget",
  },
];

const MAX_PER_FEED = 5;
const BATCH_SIZE = 3;

let isSyncRunning = false;

function computeArticleId(url) {
  return crypto.createHash("sha1").update(String(url)).digest("hex").slice(0, 20);
}

function extractDescription(item) {
  const raw = item.contentSnippet || item.content || item.summary || "";
  const text = String(raw)
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim();
  if (!text) return null;
  if (text.length <= 400) return text;

  const cut = text.slice(0, 400);
  const lastSpace = cut.lastIndexOf(" ");
  return `${cut.slice(0, lastSpace > 0 ? lastSpace : 400)}…`;
}

function normalizeImageUrl(url) {
  if (typeof url !== "string") return url;

  if (
    /^https?:\/\/img\.etimg\.com\/photo\//i.test(url) &&
    /\.cms(\?.*)?$/i.test(url)
  ) {
    return url
      .replace("/photo/", "/thumb/")
      .replace(/\.cms(\?.*)?$/i, ",width-600,height-338.cms$1");
  }

  if (/^https?:\/\/images\.etnownews\.com\/thumb\//i.test(url)) {
    return url
      .replace(/width-\d+/i, "width-600")
      .replace(/height-\d+/i, "height-338");
  }

  return url;
}

function extractImageUrl(item) {
  const collectMediaUrls = (media) => {
    if (!media) return [];
    const list = Array.isArray(media) ? media : [media];
    return list
      .map((m) => m && m.$ && m.$.url)
      .filter((u) => typeof u === "string" && /^https?:\/\//i.test(u));
  };

  const fromHtml = (html) => {
    if (typeof html !== "string") return null;
    const match = html.match(/<img[^>]+src=["']([^"']+)["']/i);
    return match && /^https?:\/\//i.test(match[1]) ? match[1] : null;
  };

  const candidates = [
    item.enclosure?.url,
    ...collectMediaUrls(item.mediaContent || item["media:content"]),
    ...collectMediaUrls(item.mediaThumbnail || item["media:thumbnail"]),
    fromHtml(item["content:encoded"]) || fromHtml(item.content),
  ];

  const firstImage = candidates.find(
    (u) => typeof u === "string" && /^https?:\/\//i.test(u),
  );

  return firstImage ? normalizeImageUrl(firstImage) : null;
}

function getDedupKey(item) {
  const normalizedTitle = item.title.toLowerCase().trim();
  const dateStr = item.publishedAt
    ? new Date(item.publishedAt).toISOString().split("T")[0]
    : "";
  return `${normalizedTitle}_${dateStr}`;
}

async function fetchAndStoreNews() {
  if (isSyncRunning) {
    console.log("RSS sync skipped because previous sync is still running.");
    return null;
  }

  isSyncRunning = true;
  const startTime = Date.now();

  try {
    const parser = new Parser({
      timeout: 10000,
      headers: { "User-Agent": "Mozilla/5.0" },
      customFields: {
        item: [
          ["media:content", "mediaContent", { keepArray: true }],
          ["media:thumbnail", "mediaThumbnail", { keepArray: true }],
        ],
      },
    });

    const allItems = [];
    let processedFeeds = 0;

    for (let i = 0; i < NEWS_FEEDS.length; i += BATCH_SIZE) {
      const batch = NEWS_FEEDS.slice(i, i + BATCH_SIZE);
      const results = await Promise.allSettled(
        batch.map((feed) => parser.parseURL(feed.url)),
      );

      for (let j = 0; j < results.length; j++) {
        const feedIndex = i + j;
        if (results[j].status === "rejected") {
          console.error(
            `Failed to fetch feed: ${NEWS_FEEDS[feedIndex].name}`,
            results[j].reason?.message,
          );
          continue;
        }
        processedFeeds++;

        for (const item of (results[j].value.items || []).slice(
          0,
          MAX_PER_FEED,
        )) {
          const title = (item.title || "").trim();
          const url = item.link || "";
          if (!title || !url) continue;

          allItems.push({
            title,
            description: extractDescription(item),
            url,
            imageUrl: extractImageUrl(item),
            publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
            source: NEWS_FEEDS[feedIndex].name,
            category: NEWS_FEEDS[feedIndex].category,
          });
        }
      }
    }

    const seen = new Set();
    const uniqueItems = allItems.filter((item) => {
      const key = getDedupKey(item);
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    let inserted = 0,
      updated = 0,
      matched = 0;
    if (uniqueItems.length > 0) {
      const bulkOps = uniqueItems.map((article) => ({
        updateOne: {
          filter: { url: article.url },
          update: {
            $set: {
              title: article.title,
              description: article.description,
              publishedAt: article.publishedAt,
              source: article.source,
              category: article.category,
              imageUrl: article.imageUrl,
              fetchedAt: new Date(),
            },
          },
          upsert: true,
        },
      }));

      const bulkResult = await News.bulkWrite(bulkOps, { ordered: false });
      matched = bulkResult.matchedCount;
      inserted = bulkResult.upsertedCount;
      updated = bulkResult.modifiedCount;
    }

    const cutoffDate = new Date(Date.now() - 24 * 60 * 60 * 1000);
    const deleteResult = await News.deleteMany({
      publishedAt: { $lt: cutoffDate },
    });

    const executionTime = Date.now() - startTime;

    const stats = {
      feedsProcessed: processedFeeds,
      totalFeeds: NEWS_FEEDS.length,
      totalParsed: allItems.length,
      uniqueArticles: uniqueItems.length,
      inserted,
      updated,
      unchanged: Math.max(0, matched - updated),
      deleted: deleteResult.deletedCount,
      executionTime: `${executionTime}ms`,
    };

    console.log(`RSS sync complete: ${JSON.stringify(stats)}`);
    return stats;
  } finally {
    isSyncRunning = false;
  }
}

async function getRelatedArticles(articleUrl, limit = 5) {
  const allNews = await News.find().sort({ publishedAt: -1 }).limit(100).lean();

  const ref = allNews.find((a) => a.url === articleUrl);
  if (!ref)
    return allNews
      .slice(0, limit)
      .map((a) => ({ ...a, id: computeArticleId(a.url) }));

  const keywords = ref.title
    .split(/\s+/)
    .filter((w) => w.length > 3)
    .slice(0, 3);
  const scored = [];

  for (const article of allNews) {
    if (article.url === articleUrl) continue;
    let score = 0;
    for (const kw of keywords) {
      if (article.title.toLowerCase().includes(kw.toLowerCase())) score += 2;
    }
    if (article.category === ref.category) score += 2;
    if (score > 0) scored.push({ article, score });
  }

  scored.sort((a, b) => b.score - a.score);
  const results = scored
    .slice(0, limit)
    .map((s) => ({ ...s.article, id: computeArticleId(s.article.url) }));

  if (results.length < limit) {
    const used = new Set(results.map((a) => a.url));
    used.add(articleUrl);
    const fillers = allNews
      .filter((a) => !used.has(a.url))
      .slice(0, limit - results.length)
      .map((a) => ({ ...a, id: computeArticleId(a.url) }));
    results.push(...fillers);
  }

  return results;
}

module.exports = { fetchAndStoreNews, getRelatedArticles, computeArticleId };
