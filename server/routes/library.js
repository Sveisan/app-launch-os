const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderLibraryPage } = require('../templates/library');

router.get('/', async (req, res) => {
  try {
    const result = await pool.query(
      `SELECT slug, type, title, meta_description 
       FROM content 
       WHERE published = TRUE 
       ORDER BY title ASC`
    );
    const html = renderLibraryPage(result.rows);
    res.send(html);
  } catch (err) {
    console.error('Error fetching library:', err);
    res.status(500).send('Internal Server Error');
  }
});

module.exports = router;
