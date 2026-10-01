// Public (no login) endpoints used by the sign-up page.
const express = require('express');
const { offeredProgrammes } = require('../lib/studentAccounts');

const router = express.Router();

router.get('/programmes', (req, res) => {
  res.json({ programmes: offeredProgrammes(req.db) });
});

module.exports = { publicRouter: router };
