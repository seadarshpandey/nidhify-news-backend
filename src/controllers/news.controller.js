const { fetchAllNews, getCacheStatus, getRelatedArticles, resetCache } = require('../utils/newsFetcher');

const getNews = async (req, res, next) => {
  try {
    let articles = await fetchAllNews();

    const { category, source, limit, page } = req.query;

    if (category) {
      articles = articles.filter(a => a.category.toLowerCase() === category.toLowerCase());
    }

    if (source) {
      articles = articles.filter(a => a.source.toLowerCase().includes(source.toLowerCase()));
    }

    const pageNum = Math.max(1, parseInt(page) || 1);
    const limitNum = Math.min(50, Math.max(1, parseInt(limit) || 20));
    const startIndex = (pageNum - 1) * limitNum;
    const paginated = articles.slice(startIndex, startIndex + limitNum);

    res.json({
      success: true,
      data: {
        totalArticles: articles.length,
        page: pageNum,
        limit: limitNum,
        totalPages: Math.ceil(articles.length / limitNum),
        articles: paginated
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

    resetCache();
    const articles = await fetchAllNews();

    res.json({
      success: true,
      message: 'News cache refreshed',
      totalArticles: articles.length
    });
  } catch (err) {
    next(err);
  }
};

const getNewsPaginated = async (req, res, next) => {
  try {
    const allNews = await fetchAllNews();

    let { page, limit: rawLimit, category } = req.query;
    page = Math.max(1, parseInt(page) || 1);
    limit = Math.min(20, Math.max(1, parseInt(rawLimit) || 10));

    let filtered = allNews;
    if (category) {
      filtered = allNews.filter(a => a.category.toLowerCase() === category.toLowerCase());
    }

    const total = filtered.length;
    const startIndex = (page - 1) * limit;
    const articles = filtered.slice(startIndex, startIndex + limit);
    const hasMore = startIndex + limit < total;

    res.json({
      success: true,
      data: {
        articles,
        pagination: {
          currentPage: page,
          limit,
          totalArticles: total,
          hasMore,
          nextPage: hasMore ? page + 1 : null
        },
        endMessage: hasMore ? null : `You're all caught up! Fresh news arrives every 30 minutes.`
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

    await fetchAllNews();

    const articleUrl = decodeURIComponent(req.query.url);
    const rawLimit = parseInt(req.query.limit) || 5;
    const limitNum = Math.min(10, Math.max(1, rawLimit));

    const articles = getRelatedArticles(articleUrl, limitNum);

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
