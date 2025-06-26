import axios from 'axios';
import robotsParser from 'robots-parser';

export async function checkRobotsTxt(siteUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', siteUrl).href;
    console.log(`📡 Initial robots.txt check for ${siteUrl}`);

    const res = await axios.get(robotsUrl);
    const parser = robotsParser(robotsUrl, res.data);

    return {
      site: siteUrl,
      robotsFound: true,
      disallowedPaths: parser.getDisallowedPaths('*'),
      allowedPaths: parser.getAllowedPaths('*'),
    };
  } catch (err) {
    return {
      site: siteUrl,
      robotsFound: false,
      error: err.message,
    };
  }
}
