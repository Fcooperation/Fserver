import axios from 'axios';
import { URL } from 'url';

export async function checkRobotsTxt(siteUrl) {
  try {
    const { origin } = new URL(siteUrl);
    const robotsUrl = origin + '/robots.txt';
    const response = await axios.get(robotsUrl, { timeout: 5000 });

    const disallows = [];
    const lines = response.data.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.toLowerCase().startsWith('disallow:')) {
        disallows.push(trimmed.split(':')[1].trim());
      }
    }

    return {
      site: origin,
      robotsFound: true,
      disallowedPaths: disallows
    };
  } catch (err) {
    return {
      site: siteUrl,
      robotsFound: false,
      error: err.message
    };
  }
}
