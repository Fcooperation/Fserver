// fcrawler.js

import axios from 'axios';
import { URL } from 'url';
import robotsParser from 'robots-parser';

export async function checkRobotsTxt(pageUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', pageUrl).href;
    const response = await axios.get(robotsUrl, { timeout: 5000 });
    const robots = robotsParser(robotsUrl, response.data);
    const isAllowed = robots.isAllowed(pageUrl, '*');

    if (isAllowed) {
      console.log(`✅ Allowed by robots.txt: ${pageUrl}`);
    } else {
      console.log(`⛔ Blocked by robots.txt: ${pageUrl}`);
    }

    return isAllowed;
  } catch (err) {
    console.log(`📂 No robots.txt found. Proceeding: ${pageUrl}`);
    return true; // No robots.txt = allowed
  }
}
