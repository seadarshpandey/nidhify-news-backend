const express = require('express');
const router = express.Router();
const { getAppVersion, upsertAppVersion } = require('../controllers/appVersion.controller');

router.post('/', getAppVersion);
router.post('/upsert', upsertAppVersion);

module.exports = router;
