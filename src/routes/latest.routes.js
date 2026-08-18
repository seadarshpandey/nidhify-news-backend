const express = require('express');
const router = express.Router();
const { getLatestNews } = require('../controllers/news.controller');

router.get('/fetch-one-latest-news', getLatestNews);

module.exports = router;