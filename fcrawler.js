import fs from 'fs';
import path from 'path';
import axios from 'axios';
import * as cheerio from 'cheerio';
import { fileURLToPath } from 'url';
import { dirname } from 'path';
import { Storage } from 'megajs';

const __dirname = dirname(fileURLToPath(import.meta.url));
const crawledDir = path.join(__dirname, 'crawled');
if (!fs.existsSync(crawledDir)) fs.mkdirSync(crawledDir);

// Login accounts
const megaAccounts = {
  text: { email: 'thefcooperation@gmail.com', password: '*Onyedika2009*' },
  images: { email: 'fprojectimages@gmail.com', password: '*Onyedika2009*' },
  documents: { email: 'fprojectdocuments@gmail.com', password: '*Onyedika2009*' },
};

// Utility to upload file to MEGA
async function uploadToMega(type, filePath, fileName) {
  const { email, password } = megaAccounts[type];
  const storage = new Storage({ email, password });
  return new Promise((resolve, reject) => {
    storage.on('ready', () => {
      storage.upload(fileName, fs.createReadStream(filePath)).complete((err, file) => {
        if (err) reject(err);
        else {
          console.log(`📤 Uploaded to MEGA (${type}): ${fileName}`);
          resolve();
        }
      });
    });
    storage.on('error', reject);
  });
}

// Detect if URL is a document
function isDocument(url) {
  return url.match(/\.(pdf|docx?|pptx?|xlsx?|txt)$/i);
}
function isImage(url) {
  return url.match(/\.(png|jpe?g|gif|bmp|webp|svg)$/i);
}

async function crawl(url, visited = new Set()) {
  if (visited.has(url)) return;
  visited.add(url);
  try {
    const res = await axios.get(url, { timeout: 15000 });
    const $ = cheerio.load(res.data);
    const pageTitle = $('title').text() || 'Untitled';
    const safeTitle = pageTitle.replace(/[^\w\s]/g, '_').replace(/\s+/g, '_');
    const htmlPath = path.join(crawledDir, `${safeTitle}.html`);
    if (fs.existsSync(htmlPath)) {
      console.log(`⏩ Skipped (already exists): ${safeTitle}.html`);
    } else {
      fs.writeFileSync(htmlPath, $.html());
      await uploadToMega('text', htmlPath, `${safeTitle}.html`);
    }

    $('img').each(async (_, img) => {
      const src = $(img).attr('src');
      if (!src || !isImage(src)) return;
      const absoluteUrl = new URL(src, url).href;
      const filename = path.basename(absoluteUrl.split('?')[0]);
      const imgPath = path.join(crawledDir, filename);
      if (fs.existsSync(imgPath)) {
        console.log(`⏩ Skipped (already exists): ${filename}`);
        return;
      }
      try {
        const imgRes = await axios.get(absoluteUrl, { responseType: 'arraybuffer' });
        fs.writeFileSync(imgPath, imgRes.data);
        console.log(`🖼️ Downloaded image: ${filename}`);
        await uploadToMega('images', imgPath, filename);
      } catch (e) {
        console.log(`⚠️ Failed image: ${src}`);
      }
    });

    $('a').each(async (_, link) => {
      const href = $(link).attr('href');
      if (!href) return;
      const fullUrl = new URL(href, url).href;

      // Thumbnail box for documents
      if (isDocument(fullUrl)) {
        const fileName = path.basename(fullUrl.split('?')[0]);
        const ext = fileName.split('.').pop().toLowerCase();
        const icon = `https://upload.wikimedia.org/wikipedia/commons/8/87/PDF_file_icon.svg`; // basic icon (you can customize per ext)
        const thumbHtml = `
          <div style="border:1px solid #ccc;padding:10px;width:300px;margin:10px;">
            <img src="${icon}" alt="${ext}" style="width:30px;vertical-align:middle;">
            <a href="${fullUrl}" target="_blank" style="margin-left:10px;">${fileName}</a>
          </div>
        `;
        const thumbPath = path.join(crawledDir, `${fileName}.html`);
        if (!fs.existsSync(thumbPath)) {
          fs.writeFileSync(thumbPath, thumbHtml);
          await uploadToMega('documents', thumbPath, `${fileName}.html`);
        } else {
          console.log(`⏩ Skipped (already exists): ${fileName}.html`);
        }
      }

      // Crawl deeper
      if (fullUrl.startsWith('http') && !visited.has(fullUrl)) {
        await crawl(fullUrl, visited);
      }
    });

  } catch (err) {
    console.log(`❌ Error crawling ${url}: ${err.message}`);
  }
}

// Start crawling
const startUrl = 'https://govinfo.gov/';
console.log(`🚀 Server running on http://localhost:10000/`);
crawl(startUrl);
