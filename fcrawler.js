import axios from 'axios';
import robotsParser from 'robots-parser';

const USER_AGENT = 'fserverbot';
const START_URL = 'https://example.com'; // Change this to the real site

async function getRobotsRules(site) {
  const robotsUrl = `${site}/robots.txt`;
  try {
    const res = await axios.get(robotsUrl, {
      headers: { 'User-Agent': USER_AGENT }
    });
    const robotsTxt = res.data;
    const parser = robotsParser(robotsUrl, robotsTxt);
    return {
      found: true,
      parser
    };
  } catch (err) {
    return {
      found: false,
      parser: robotsParser(robotsUrl, '') // fallback empty
    };
  }
}

async function crawlSite(site) {
  console.log(`📡 Checking robots.txt for ${site}`);
  const { found, parser } = await getRobotsRules(site);

  console.log(found
    ? '✅ robots.txt found and loaded.'
    : '❌ No robots.txt found. Crawling all paths.');

  const pathsToCheck = [
    '/', '/admin', '/blog/post1', '/private/data'
  ];

  for (const path of pathsToCheck) {
    const fullUrl = site + path;
    if (parser.isDisallowed(fullUrl, USER_AGENT)) {
      console.log(`🚫 Skipped: ${fullUrl} (Disallowed by robots.txt)`);
    } else {
      console.log(`✅ Allowed: ${fullUrl} (Ready to crawl)`);
      // (Future: fetch content)
    }
  }
}

crawlSite(START_URL);
