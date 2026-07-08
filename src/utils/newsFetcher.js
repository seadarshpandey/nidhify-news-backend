const Parser = require('rss-parser');
const News = require('../models/News');

const NEWS_FEEDS = [
  { name: 'ET Mutual Funds', url: 'https://economictimes.indiatimes.com/mf/rss.cms', category: 'Mutual Funds' },
  { name: 'Moneycontrol Markets', url: 'https://www.moneycontrol.com/rss/marketreports.xml', category: 'Markets' },
  { name: 'LiveMint Money', url: 'https://www.livemint.com/rss/money', category: 'Personal Finance' },
  { name: 'ET Now Business', url: 'https://www.etnownews.com/feeds/gns-etn-markets.xml', category: 'Business' }
];

const CACHE_DURATION = 3 * 60 * 60 * 1000;
const MAX_PER_FEED = 2;
const MAX_CACHE_SIZE = 15;

let newsCache = { data: [], fetchedAt: null };

const fetchAllNews = async () => {
  if (newsCache.fetchedAt && (Date.now() - newsCache.fetchedAt) < CACHE_DURATION) {
    return newsCache.data;
  }

  const parser = new Parser({
    timeout: 8000,
    headers: { 'User-Agent': 'Mozilla/5.0' }
  });

  const allItems = [];

  for (let i = 0; i < NEWS_FEEDS.length; i += 2) {
    const batch = NEWS_FEEDS.slice(i, i + 2);
    const results = await Promise.allSettled(
      batch.map(feed => parser.parseURL(feed.url))
    );

    for (let j = 0; j < results.length; j++) {
      const feedIndex = i + j;
      if (results[j].status === 'rejected') continue;

      for (const item of (results[j].value.items || []).slice(0, MAX_PER_FEED)) {
        const title = (item.title || '').trim();
        const url = item.link || '';
        if (!title || !url) continue;

        allItems.push({
          id: Buffer.from(url).toString('base64').slice(0, 16),
          title,
          description: (item.contentSnippet || '').slice(0, 200),
          url,
          publishedAt: item.pubDate ? new Date(item.pubDate) : new Date(),
          source: NEWS_FEEDS[feedIndex].name,
          category: NEWS_FEEDS[feedIndex].category
        });
      }
    }
  }

  const seen = new Set();
  const unique = allItems.filter(item => {
    if (seen.has(item.url)) return false;
    seen.add(item.url);
    return true;
  });

  unique.sort((a, b) => new Date(b.publishedAt) - new Date(a.publishedAt));

  newsCache = { data: unique.slice(0, MAX_CACHE_SIZE), fetchedAt: Date.now() };

  try {
    for (const article of newsCache.data) {
      await News.findOneAndUpdate(
        { url: article.url },
        {
          title: article.title,
          description: article.description,
          publishedAt: article.publishedAt,
          source: article.source,
          category: article.category,
          fetchedAt: new Date()
        },
        { upsert: true, new: true }
      );
    }
  } catch (err) {
    console.error('Failed to persist news to MongoDB:', err.message);
  }

  return newsCache.data;
};

const getCacheStatus = () => {
  const remaining = newsCache.fetchedAt ? Math.max(0, CACHE_DURATION - (Date.now() - newsCache.fetchedAt)) : 0;
  return {
    isCached: !!(newsCache.fetchedAt && remaining > 0),
    totalArticles: newsCache.data.length,
    nextRefreshIn: `${Math.ceil(remaining / 1000 / 60)}m`
  };
};

const resetCache = () => { newsCache.fetchedAt = null; };

const getNewsByPage = (page = 1, limit = 10) => {
  const allNews = newsCache.data;
  const startIndex = (page - 1) * limit;
  return {
    articles: allNews.slice(startIndex, startIndex + limit),
    page,
    limit,
    totalArticles: allNews.length,
    hasMore: startIndex + limit < allNews.length,
    nextPage: startIndex + limit < allNews.length ? page + 1 : null
  };
};

const getRelatedArticles = (articleUrl, limit = 5) => {
  const allNews = newsCache.data;
  const ref = allNews.find(a => a.url === articleUrl);
  if (!ref) return allNews.slice(0, limit);

  const keywords = ref.title.split(/\s+/).filter(w => w.length > 3).slice(0, 3);
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
  const results = scored.slice(0, limit).map(s => s.article);

  if (results.length < limit) {
    const used = new Set(results.map(a => a.url));
    used.add(articleUrl);
    results.push(...allNews.filter(a => !used.has(a.url)).slice(0, limit - results.length));
  }

  return results;
};

module.exports = { fetchAllNews, getCacheStatus, getNewsByPage, getRelatedArticles, resetCache };
