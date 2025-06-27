import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { URL } from 'url';
import robotsParser from 'robots-parser';
import crypto from 'crypto';
import * as mega from 'megajs';

// ⚠️ MEGA Login Info
const megaEmail = 'thefcooperation@gmail.com';
const megaPassword = '*Onyedika2009*';

const storageDir = './crawled';
if (!fs.existsSync(storageDir)) fs.mkdirSync(storageDir);

// Helper: hash the URL to generate unique filename base
function hashUrl(url) {
  return crypto.createHash('md5').update(url).digest('hex');
}

// Check robots.txt
async function checkRobotsTxt(siteUrl) {
  try {
    const robotsUrl = new URL('/robots.txt', siteUrl).href;
    const res = await axios.get(robotsUrl, { timeout: 5000 });
    const robots = robotsParser(robotsUrl, res.data);
    return robots.isAllowed(siteUrl);
  } catch {
    return true;
  }
}

// MAIN FUNCTION
export async function crawlPage(url) {
  const allowed = await checkRobotsTxt(url);
  if (!allowed) {
    console.log(`❌ Blocked by robots.txt: ${url}`);
    return;
  }

  console.log('🔐 Logging in to MEGA...');
  const storage = new mega.Storage({ email: megaEmail, password: megaPassword }, () => {
    storage.on('ready', async () => {
      console.log('📂 MEGA storage ready.');

      try {
        const res = await axios.get(url, { timeout: 10000 });
        const $ = cheerio.load(res.data);

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
        console.log(`✅ Page saved locally: ${filename}`);

        // Delete older version on MEGA (same ID/hash)
        const existing = storage.children.find(f => f.name.startsWith(id));
        if (existing) {
          console.log(`🗑 Removing old MEGA file: ${existing.name}`);
          existing.delete(err => {
            if (err) console.warn('⚠️ Failed to delete old file:', err.message);
          });
        }

        // Upload new version
        console.log(`📤 Uploading to MEGA: ${filename}`);
        const upload = storage.upload(filename);
        fs.createReadStream(filepath).pipe(upload);

        upload.on('complete', () => {
          console.log(`✅ Uploaded to MEGA: ${filename}`);
          fs.unlinkSync(filepath); // Delete local after upload
        });

        upload.on('error', (err) => {
          console.error('❌ Upload error:', err.message);
        });

      } catch (err) {
        console.error(`❌ Crawl failed: ${err.message}`);
      }
    });

    storage.on('error', (err) => {
      console.error('❌ MEGA login error:', err.message);
    });
  });
}
