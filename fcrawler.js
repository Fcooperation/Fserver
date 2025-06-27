import axios from 'axios';
import cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import robotsParser from 'robots-parser';
import crypto from 'crypto';
import mega from 'megajs';

// ⚠️ MEGA CREDENTIALS (handle securely in production!)
const megaEmail = "thefcooperation@gmail.com";
const megaPassword = "*Onyedika2009*";

// Directory for temp storage
const storageDir = './crawled';
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);

// Hash function for filenames
function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

async function checkRobotsTxt(siteUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', siteUrl).href;
    const res = await axios.get(robotsUrl, { timeout: 5000 });
    const robots = robotsParser(robotsUrl, res.data);
    return robots.isAllowed(siteUrl);
  } catch {
    return true; // If robots.txt not found, allow crawl
  }
}

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

    await uploadToMega(filename, filepath);
  } catch (err) {
    console.error(`❌ Failed to crawl ${url}:`, err.message);
  }
}

async function uploadToMega(filename, filepath) {
  return new Promise((resolve, reject) => {
    const storage = mega({ email: megaEmail, password: megaPassword }, () => {
      storage.on('ready', async () => {
        const existing = storage.children.find(file => file.name.startsWith(filename.split('_')[0]));
        if (existing) {
          console.log(`🗑 Deleting old file: ${existing.name}`);
          existing.delete((err) => {
            if (err) console.error("❌ Error deleting old version:", err.message);
          });
        }

        console.log(`📤 Uploading ${filename} to MEGA...`);
        const upload = storage.upload(filename);
        const readStream = fs.createReadStream(filepath);
        readStream.pipe(upload);

        upload.on('complete', () => {
          console.log(`✅ Uploaded to MEGA: ${filename}`);
          fs.unlinkSync(filepath); // Clean up local file
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

// Start the crawler on a sample page
const startUrl = 'https://www.google.com/';
crawlPage(startUrl);
