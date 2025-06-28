import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import robotsParser from 'robots-parser';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Storage } from 'megajs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
const indexPath = path.join(crawledDir, 'search_index.json');

const mega = new Storage({
  email: 'thefcooperation@gmail.com',
  password: '*Onyedika2009*', // Replace this securely
});

if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);

export async function crawlSite(startUrl) {
  const visited = new Set();
  const toVisit = [startUrl];
  const searchIndex = [];

  await new Promise((resolve, reject) => {
    mega.login((err) => {
      if (err) reject(err);
      else resolve();
    });
  });

  while (toVisit.length > 0 && visited.size < 10) {
    const url = toVisit.shift();
    if (visited.has(url)) continue;
    visited.add(url);

    try {
      const robotsTxtUrl = new URL('/robots.txt', url).href;
      const robotsTxt = await axios.get(robotsTxtUrl).then(res => res.data).catch(() => '');
      const robots = robotsParser(robotsTxtUrl, robotsTxt);
      if (!robots.isAllowed(url)) continue;

      console.log(`📄 Crawling: ${url}`);
      const response = await axios.get(url);
      const $ = cheerio.load(response.data);

      let text = $('body').text().replace(/\s+/g, ' ').trim();
      const sentences = text.match(/[^\.!\?]+[\.!\?]+/g) || [text];

      const pageTitle = $('title').text().trim() || 'Untitled';
      const filename = `${pageTitle.replace(/[^\w\s]/gi, '').replace(/\s+/g, '_')}.html`;
      const filePath = path.join(crawledDir, filename);
      fs.writeFileSync(filePath, response.data);

      const stats = fs.statSync(filePath);
      const fileSizeKB = (stats.size / 1024).toFixed(2);
      console.log(`📏 File size: ${fileSizeKB} KB`);

      await new Promise((resolve, reject) => {
        const uploadIfNotExists = () => {
          mega.root.children((err, files) => {
            if (err) return reject(err);
            const exists = files.some(f => f.name === filename);
            if (exists) {
              console.log(`⏩ Skipped (already exists): ${filename}`);
              resolve();
            } else {
              const upload = mega.upload(filename, { size: stats.size });
              fs.createReadStream(filePath).pipe(upload);
              upload.on('complete', () => {
                console.log(`📤 Uploaded: ${filename}`);
                resolve();
              });
              upload.on('error', reject);
            }
          });
        };
        uploadIfNotExists();
      });

      searchIndex.push({
        url,
        title: pageTitle,
        filename,
        created: stats.birthtime,
        sentences,
      });

      $('a[href]').each((_, a) => {
        const link = new URL($(a).attr('href'), url).href;
        if (!visited.has(link) && link.startsWith('http')) toVisit.push(link);
      });

    } catch (err) {
      console.error(`❌ Error crawling ${url}:`, err.message);
    }
  }

  fs.writeFileSync(indexPath, JSON.stringify(searchIndex, null, 2));
  console.log('✅ Crawl complete. Search index saved.');
}
