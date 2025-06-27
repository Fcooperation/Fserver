import * as cheerio from 'cheerio';
import axios from 'axios';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Storage } from 'megajs';
import crypto from 'crypto';
import { JSDOM } from 'jsdom';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const visited = new Set();
let pageCount = 0;

const MAX_PAGES = 10;
const searchIndex = [];

function sanitizeFilename(str) {
  return str.replace(/[^a-z0-9]/gi, '_').substring(0, 100);
}

async function getHtml(url) {
  const res = await axios.get(url, { timeout: 10000 });
  return res.data;
}

function extractSentences(text) {
  return text
    .replace(/\s+/g, ' ')
    .match(/[^\.!\?]+[\.!\?]+/g)
    ?.map(s => s.trim())
    .filter(Boolean) || [];
}

function generateFilename(title, url) {
  const titlePart = sanitizeFilename(title || 'page');
  const urlHash = crypto.createHash('md5').update(url).digest('hex').substring(0, 6);
  return `${titlePart}_${urlHash}.html`;
}

async function saveToFile(filename, content) {
  const fullPath = path.join(__dirname, 'saved', filename);
  await fs.mkdir(path.dirname(fullPath), { recursive: true });
  await fs.writeFile(fullPath, content, 'utf8');
  return fullPath;
}

async function getFileSizeInKB(filepath) {
  const stat = await fs.stat(filepath);
  return stat.size / 1024;
}

async function uploadToMega(filepath, filename) {
  const storage = new Storage({
    email: 'thefcooperation@gmail.com',
    password: 'YourMegaPassword',
  });

  return new Promise((resolve, reject) => {
    storage.on('ready', async () => {
      try {
        const stream = await fs.readFile(filepath);
        const upload = storage.upload(filename, stream.length, {
          allowUploadBuffering: true,
        });
        upload.end(stream);
        upload.on('complete', () => {
          console.log(`📤 Uploaded: ${filename}`);
          resolve();
        });
      } catch (err) {
        reject(err);
      }
    });
    storage.on('error', reject);
    storage.login();
  });
}

function parseLinks($, baseUrl) {
  const base = new URL(baseUrl);
  return $('a[href]')
    .map((_, el) => $(el).attr('href'))
    .get()
    .map(href => {
      try {
        return new URL(href, base).toString();
      } catch {
        return null;
      }
    })
    .filter(link => link && !visited.has(link));
}

export async function crawlSite(startUrl) {
  pageCount = 0;
  visited.clear();
  searchIndex.length = 0;
  await crawlPage(startUrl);
  const indexPath = path.join(__dirname, 'saved', 'search_index.json');
  await fs.writeFile(indexPath, JSON.stringify(searchIndex, null, 2));
  console.log('✅ Crawl complete. Search index saved.');
}

async function crawlPage(url) {
  if (visited.has(url) || pageCount >= MAX_PAGES) return;
  visited.add(url);
  pageCount++;

  console.log(`📄 Crawling: ${url}`);

  try {
    const html = await getHtml(url);
    const $ = cheerio.load(html);
    const title = $('title').text() || 'Untitled';
    const bodyHtml = $('body').html() || '';
    const textContent = $('body').text();
    const sentences = extractSentences(textContent);
    const structuredHtml = `<html><head><title>${title}</title></head><body>${bodyHtml}</body></html>`;
    const filename = generateFilename(title, url);
    const savedPath = await saveToFile(filename, structuredHtml);
    const fileSizeKB = await getFileSizeInKB(savedPath);

    console.log(`📏 File size: ${fileSizeKB.toFixed(2)} KB`);

    // Upload if file is readable
    if (fileSizeKB > 0) {
      await uploadToMega(savedPath, filename);
    }

    // Save to search index
    searchIndex.push({
      url,
      title,
      filename,
      text: textContent,
      sentences,
    });

    // Crawl next links
    const links = parseLinks($, url);
    for (const link of links) {
      await crawlPage(link);
    }
  } catch (err) {
    console.error(`❌ Failed to crawl ${url}:`, err.message);
  }
}
