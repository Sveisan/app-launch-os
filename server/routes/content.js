const express = require('express');
const router = express.Router();
const { pool } = require('../db/index');
const { renderTechniquePage, renderUseCasePage } = require('../templates/content');
const path = require('path');

router.get('/for/:outcome', async (req, res) => {
  try {
    const { outcome } = req.params;
    const result = await pool.query("SELECT * FROM content WHERE type = 'use-case' AND slug = $1 AND published = TRUE", [outcome]);
    if (result.rows.length === 0) {
      return res.status(404).send('Not found'); 
    }
    const html = renderUseCasePage(result.rows[0]);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.get('/:slug', async (req, res) => {
  try {
    const { slug } = req.params;
    const result = await pool.query('SELECT * FROM content WHERE slug = $1 AND published = TRUE', [slug]);
    if (result.rows.length === 0) {
      return res.status(404).send('Not found'); 
    }
    const row = result.rows[0];
    const html = (row.type === 'faq-cluster') ? renderUseCasePage(row) : renderTechniquePage(row);
    res.send(html);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
});

router.sitemap = async (req, res) => {
  try {
    const result = await pool.query('SELECT slug, type, updated_at FROM content WHERE published = TRUE');
    
    let xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
  <url>
    <loc>https://breathe-collection.com/</loc>
    <changefreq>weekly</changefreq>
    <priority>1.0</priority>
  </url>
  <url>
    <loc>https://breathe-collection.com/creators.html</loc>
    <changefreq>monthly</changefreq>
    <priority>0.8</priority>
  </url>`;

    result.rows.forEach(row => {
      let loc = `https://breathe-collection.com/breathing/${row.slug}`;
      if (row.type === 'use-case') {
        loc = `https://breathe-collection.com/breathing/for/${row.slug}`;
      }
      
      xml += `
  <url>
    <loc>${loc}</loc>
    <lastmod>${new Date(row.updated_at).toISOString().split('T')[0]}</lastmod>
    <changefreq>weekly</changefreq>
    <priority>0.7</priority>
  </url>`;
    });

    xml += '\n</urlset>';
    
    res.header('Content-Type', 'application/xml');
    res.send(xml);
  } catch (err) {
    console.error(err);
    res.status(500).send('Server Error');
  }
};

module.exports = router;
