import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import robotsParser from 'robots-parser';
import crypto from 'crypto';
import mega from 'megajs';

const visited = new Set();
const searchIndex = [];
const MAX_PAGES = 10;
let pageCount = 0;

function sanitizeFilename(name) {
  return name.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
}

async function isAllowedByRobots(url) {
  try {
    const robotsTxtUrl = new URL('/robots.txt', url).href;
    const { data } = await axios.get(robotsTxtUrl);
    const robots = robotsParser(robotsTxtUrl, data);
    return robots.isAllowed(url);
  } catch {
    return true;
  }
}

function extractSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .split(/(?<=[.!?])\s+/)
    .map(s => s.trim())
    .filter(s => s.length > 10);
}

async function uploadToMega(filename, buffer) {
  const fileSizeKB = buffer.length / 1024;
  console.log(`📏 File size: ${fileSizeKB.toFixed(2)} KB`);

  const storage = mega({
    email: process.env.MEGA_EMAIL,
    password: process.env.MEGA_PASSWORD
  });

  await new Promise(resolve => storage.on('ready', resolve));

  const exists = storage.children.find(file => file.name === filename);
  if (exists) {
    console.log(`⏩ Skipped (already exists): ${filename}`);
    return;
  }

  const file = storage.upload({
    name: filename,
    size: buffer.length
  });

  file.end(buffer);
  await new Promise(resolve => file.on('complete', resolve));
  console.log(`📤 Uploaded: ${filename}`);
}

async function crawlPage(url) {
  if (visited.has(url) || pageCount >= MAX_PAGES) return;
  if (!(await isAllowedByRobots(url))) return;

  visited.add(url);
  pageCount++;
  console.log(`📄 Crawling: ${url}`);

  try {
    const { data, headers } = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(data);

    const title = $('title').text().trim() || 'Untitled';
    const filename = sanitizeFilename(title) + '.html';
    const textContent = $('body').text();
    const sentences = extractSentences(textContent);
    const created = headers['last-modified'] || new Date().toISOString();

    sentences.forEach(sentence => {
      const hash = crypto.createHash('sha256').update(sentence + url).digest('hex');
      if (!searchIndex.find(e => e.id === hash)) {
        searchIndex.push({
          id: hash,
          sentence,
          source_url: url,
          filename,
          created_date: created
        });
      }
    });

    const html = $.html();
    const buffer = Buffer.from(html, 'utf-8');
    fs.writeFileSync(filename, html);

    await uploadToMega(filename, buffer);

    const links = $('a')
      .map((i, el) => $(el).attr('href'))
      .get()
      .filter(href => href && href.startsWith('http'));

    for (const link of links) {
      await crawlPage(link);
    }
  } catch (err) {
    console.error(`❌ Error crawling ${url}:`, err.message);
  }
}

export async function crawlSite(startUrl) {
  visited.clear();
  pageCount = 0;
  searchIndex.length = 0;

  await crawlPage(startUrl);
  fs.writeFileSync('search_index.json', JSON.stringify(searchIndex, null, 2));
  console.log('✅ Crawl complete. Search index saved.');
}
