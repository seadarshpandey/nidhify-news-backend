const News = require('../models/News');
const { fetchAndStoreNews, getRelatedArticles, computeArticleId } = require('../utils/newsFetcher');

const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');

const toArticleResponse = (doc) => ({
  id: computeArticleId(doc.url),
  title: doc.title,
  description: doc.description,
  url: doc.url,
  publishedAt: doc.publishedAt,
  source: doc.source,
  category: doc.category
});

const getNews = async (req, res, next) => {
  try {
    const { category, source, limit, page } = req.query;

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));

    const filter = {};
    if (category) filter.category = { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') };
    if (source) filter.source = { $regex: escapeRegex(source), $options: 'i' };

    const [articles, totalArticles] = await Promise.all([
      News.find(filter)
        .sort({ publishedAt: -1 })
        .skip((pageNum - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      News.countDocuments(filter)
    ]);

    res.json({
      success: true,
      data: {
        totalArticles,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(totalArticles / limitNum),
        articles: articles.map(toArticleResponse)
      }
    });
  } catch (err) {
    next(err);
  }
};

const refreshNews = async (req, res, next) => {
  try {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const stats = await fetchAndStoreNews();

    res.json({
      success: true,
      message: 'News cache refreshed',
      totalArticles: stats.uniqueArticles
    });
  } catch (err) {
    next(err);
  }
};

const getNewsPaginated = async (req, res, next) => {
  try {
    let { page, limit: rawLimit, category } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(20, Math.max(1, parseInt(rawLimit) || 10));

    const filter = {};
    if (category) filter.category = { $regex: new RegExp(`^${escapeRegex(category)}$`, 'i') };

    const [articles, totalArticles] = await Promise.all([
      News.find(filter)
        .sort({ publishedAt: -1 })
        .skip((page - 1) * limitNum)
        .limit(limitNum)
        .lean(),
      News.countDocuments(filter)
    ]);

    const hasMore = (page - 1) * limitNum + articles.length < totalArticles;

    res.json({
      success: true,
      data: {
        articles: articles.map(toArticleResponse),
        pagination: {
          currentPage: page,
          limit: limitNum,
          totalArticles,
          hasMore,
          nextPage: hasMore ? page + 1 : null
        },
        endMessage: hasMore ? null : `You're all caught up! Fresh news is updated every hour.`
      }
    });
  } catch (err) {
    next(err);
  }
};

const getRelated = async (req, res, next) => {
  try {
    if (!req.query.url) {
      return res.status(400).json({ success: false, message: 'Article URL is required' });
    }

    const articleUrl = decodeURIComponent(req.query.url);
    const rawLimit = parseInt(req.query.limit) || 5;
    const limitNum = Math.min(10, Math.max(1, rawLimit));

    const articles = await getRelatedArticles(articleUrl, limitNum);

    res.json({
      success: true,
      data: {
        relatedTo: articleUrl,
        articles,
        count: articles.length
      }
    });
  } catch (err) {
    next(err);
  }
};

module.exports = { getNews, refreshNews, getNewsPaginated, getRelated };
