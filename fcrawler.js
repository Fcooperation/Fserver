import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import robotsParser from 'robots-parser';
import crypto from 'crypto';
import mega from 'megajs';

// ⚠️ Hardcoded MEGA login (secure this in production)
const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*';

// Directory to store temporary JSON files
const storageDir = './crawled';
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);

// Helper: Hash the URL for filenames
function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Check robots.txt rules
async function checkRobotsTxt(siteUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', siteUrl).href;
    const res = await axios.get(robotsUrl, { timeout: 5000 });
    const robots = robotsParser(robotsUrl, res.data);
    return robots.isAllowed(siteUrl);
  } catch {
    return true; // If no robots.txt found, allow crawl
  }
}

// Main page crawler
async function crawlPage(url) {
  const isAllowed = await checkRobotsTxt(url);
  if (!isAllowed) {
    console.log(`❌ Blocked by robots.txt: ${url}`);
    return;
  }

  try {
    const response = await axios.get(url, { timeout: 10000 });
    const $ = cheerio.load(response.data);

    const title = $('title').text().trim() || 'Untitled';
    const textBlocks = [];

    $('h1, h2, h3, p, li').each((_, el) => {
      const text = $(el).text().trim();
      if (text.length > 20) textBlocks.push(text);
    });

    const textContent = textBlocks.join('\n\n');
    const createdAt = new Date().toISOString();
    const id = hashUrl(url);
    const filename = `${id}_${createdAt}.json`;
    const filepath = path.join(storageDir, filename);

    const pageData = {
      url,
      title,
      text: textContent,
      type: 'article',
      createdAt
    };

    fs.writeFileSync(filepath, JSON.stringify(pageData, null, 2));
    console.log(`✅ Page crawled and saved: ${filename}`);

    await uploadToMega(id, filename, filepath);
  } catch (err) {
    console.error(`❌ Failed to crawl ${url}:`, err.message);
  }
}

// Uploads file to MEGA and deletes old versions
async function uploadToMega(id, filename, filepath) {
  return new Promise((resolve, reject) => {
    const storage = mega({ email: megaEmail, password: megaPassword }, () => {
      storage.on('ready', async () => {
        // Check for old files with same hash prefix
        const existing = storage.children.find(file => file.name.startsWith(id));
        if (existing) {
          console.log(`🗑 Deleting old file: ${existing.name}`);
          existing.delete((err) => {
            if (err) console.error("❌ Failed to delete old version:", err.message);
          });
        }

        console.log(`📤 Uploading to MEGA: ${filename}`);
        const upload = storage.upload(filename);
        const readStream = fs.createReadStream(filepath);
        readStream.pipe(upload);

        upload.on('complete', () => {
          console.log(`✅ Uploaded to MEGA: ${filename}`);
          fs.unlinkSync(filepath); // clean local copy
          resolve();
        });

        upload.on('error', reject);
      });
    });

    storage.on('error', (err) => {
      console.error('❌ MEGA login failed:', err.message);
      reject(err);
    });
  });
}

// ⛳ Start crawling here
const startUrl = 'https://www.google.com/';
crawlPage(startUrl);
