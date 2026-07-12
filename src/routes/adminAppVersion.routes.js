const express = require('express');
const router = express.Router();
const { adminGetAppVersion, adminSaveAppVersion } = require('../controllers/appVersion.controller');

router.post('/get', adminGetAppVersion);
router.post('/save', adminSaveAppVersion);

module.exports = router;
