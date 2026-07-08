const express = require('express');
const router = express.Router();
const { getNews, refreshNews, getNewsPaginated, getRelated } = require('../controllers/news.controller');

router.get('/', getNews);
router.post('/refresh', refreshNews);
router.get('/feed', getNewsPaginated);
router.get('/related', getRelated);

module.exports = router;
