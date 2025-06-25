// fcrawler.js
const axios = require('axios');
const robotsParser = require('robots-parser');

async function testRobots(url = 'https://www.google.com/search', userAgent = 'fcrawler') {
  try {
    const { origin } = new URL(url);
    const robotsUrl = `${origin}/robots.txt`;

    const res = await axios.get(robotsUrl);
    const robots = robotsParser(robotsUrl, res.data);

    const isAllowed = robots.isAllowed(url, userAgent);

    console.log(`✅ ${url} is ${isAllowed ? 'ALLOWED' : 'BLOCKED'} for ${userAgent}`);
  } catch (err) {
    console.error(`❌ Failed to check robots.txt for ${url}`);
    console.error(err.message);
  }
}

testRobots();
