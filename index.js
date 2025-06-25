const express = require('express');
const { testRobots } = require('./fcrawler');

const app = express();
const PORT = process.env.PORT || 3000;

// Trigger the robots test immediately
testRobots('https://www.google.com/search', 'fcrawler');

app.get('/', (req, res) => {
  res.send('Fweb is online and crawling... ✅');
});

// Prevent timeout by opening a port
app.listen(PORT, () => {
  console.log(`🌐 Server running on port ${PORT}`);
});
