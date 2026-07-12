const AppVersion = require('../models/appVersion.model');

const getAppVersion = async (req, res, next) => {
  try {
    const { platform } = req.body;

    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Invalid or missing platform' });
    }

    const config = await AppVersion.findOne({ platform }).lean();

    if (!config) {
      return res.status(404).json({ success: false, message: 'No configuration found for this platform' });
    }

    res.json({
      success: true,
      data: {
        latestVersion: config.latestVersion,
        minimumVersion: config.minimumVersion,
        forceUpdate: config.forceUpdate,
        showUpdate: config.showUpdate,
        title: config.title,
        message: config.message,
        storeUrl: platform === 'android' ? config.playStoreUrl : config.appStoreUrl
      }
    });
  } catch (err) {
    next(err);
  }
};

const upsertAppVersion = async (req, res, next) => {
  try {
    if (req.headers['x-admin-secret'] !== process.env.ADMIN_SECRET) {
      return res.status(401).json({ success: false, message: 'Unauthorized' });
    }

    const { platform, latestVersion, minimumVersion } = req.body;

    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Valid platform is required' });
    }

    if (!latestVersion) {
      return res.status(400).json({ success: false, message: 'latestVersion is required' });
    }

    if (!minimumVersion) {
      return res.status(400).json({ success: false, message: 'minimumVersion is required' });
    }

    const config = await AppVersion.findOneAndUpdate(
      { platform },
      { $set: req.body },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    res.json({
      success: true,
      data: config
    });
  } catch (err) {
    next(err);
  }
};

const adminGetAppVersion = async (req, res, next) => {
  try {
    const { platform } = req.body;

    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Valid platform is required' });
    }

    const config = await AppVersion.findOne({ platform }).lean();

    if (!config) {
      return res.status(404).json({ success: false, message: 'No configuration found for this platform' });
    }

    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

const adminSaveAppVersion = async (req, res, next) => {
  try {
    const { platform, latestVersion, minimumVersion } = req.body;

    if (!platform || !['android', 'ios'].includes(platform)) {
      return res.status(400).json({ success: false, message: 'Valid platform is required' });
    }

    if (!latestVersion) {
      return res.status(400).json({ success: false, message: 'latestVersion is required' });
    }

    if (!minimumVersion) {
      return res.status(400).json({ success: false, message: 'minimumVersion is required' });
    }

    const config = await AppVersion.findOneAndUpdate(
      { platform },
      { $set: req.body },
      { upsert: true, returnDocument: 'after', runValidators: true }
    );

    res.json({ success: true, data: config });
  } catch (err) {
    next(err);
  }
};

module.exports = { getAppVersion, upsertAppVersion, adminGetAppVersion, adminSaveAppVersion };
