const express = require('express');
const { parseSitemaps } = require('./fcrawler');

const app = express();
const PORT = process.env.PORT || 3000;

// 👇 Start the crawler
parseSitemaps('https://www.google.com'); // or replace with any test site

// 👇 Keep the server alive
app.get('/', (req, res) => {
  res.send('Fweb crawler is running...');
});

app.listen(PORT, () => {
  console.log(`🌐 Server listening on port ${PORT}`);
});
