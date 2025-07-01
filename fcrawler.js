// fcrawler.js
import axios from 'axios';
import * as cheerio from 'cheerio';
import fs from 'fs';
import path from 'path';
import { google } from 'googleapis';
import { Readable } from 'stream';

// === Google Drive Setup ===
const KEYFILE = {
  "type": "service_account",
  "project_id": "fvideo-storage",
  "private_key_id": "bfee408f7119fdaa45844420f0e2a1dc2f91523d",
  "private_key": "-----BEGIN PRIVATE KEY-----\nMIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAG//EzgU79Kfg\nU+0xKway6SKAz+q4EZARPU7geZ5RPdBmOW8J968umMB5YLIV4kArCMt1H0mZgmm8\na5KuBXislWzGIdiTXpr2JFvsPrKgEDu6L7gP90KXrmLZ3Uo/1SHDE/WSgwUP13EU\nro7V2XVytZfAsTJn0rTui6louOecHIrBVqXXncH89AbLYwtDEHLfF0LGHShiWG7W\nAgLJj10+wThROHBH8GaEnSNnpfo5pJ9f+txVc45Zf76XNZX+G+d53XZUMvcFuzBH\n34iPvcDbFzFrJW5nchu6aSZHPvcSzUT1nzc8/S3JxdvKGi07Dd2lHbM7C8sH5TVP\nOI6cSfxRAgMBAAECggEAEmBbRfsjGwobKOU+Ui64dFLCvymkXTko281Oh0B6+XB9\nR9oEmiJ8OmvYNYQfZOKAmt07gReeFbYY4TI1FLpnQbMFdap1KhupnRP7SwzwT0le\nPUAlTjmrwBCpWgfF+3cqxJtbKUmpKUvFgGH2PdSQXImsW31XwgCw2AS6Ds9pMFCM\nLDsocqhsndtUdVZxwxxyHZ5GYURNWgQ7NoiU2GymStq/R71LTzyoFMAyw4md4aBH\n1FjTfMkxuFnVVuv6qtWTfWuVkHAromdOCzRsSnOpDCUVagkwZMJAVEHpbZhJ9uoQ\nlwipmjcjh0hTbqKWTnREsMJ7w1AC+/QVdTXab/405QKBgQDmUdG1BdR4MZnEgHk7\n3YdMjmWzfZtvRJ6YXFgx4JMZdOm02iSHy7Ep9dgVvce6iW6hLhTyRyglLtR/18Fg\n38sLsuDuGRbGNyYobB86aXRahdLDxXJlX81eDDylOZ3895m3piI5nOJ/hI3fHj2w\ncnnvJ+XKO9YPP7xl9lUUpYezkwKBgQDVh4RsRhePNC4vJ3jFvJbcezqF81YLWLW+\nrXOchHfYffea4pM7e6LICU6G1ZZ7qpGmngEzC5zGqJWId3KCWL31bB+m0OgprZbZ\nnISqKGmEZW7VfOuoNc1zYRDe/vCAnHyLwTSvbgJaYFbzxU0deI6TgXVOUaqs4NJN\nhJxvuGrHCwKBgDkoROqvr7LEXGyvlWaN623MSODqYxCR7unQwPJf0SGYKgd/u2EX\n47eOEzoSBub8BEBrtzcJAaV4obO4T31DDJiyo69y+nvmY8nUS0urr/xnCY8cCO+v\nfr/AOaynR9XnfHZe/E9f57XNp4efcZ/ASRJYzGYLw2u1XYPQRf0Bt1ORAoGAIXbm\now1tHc1gu5UlEWBYCF/rsRiM0KRrf2Gxr8L3AV/kkUqXJohe35jNzMXmmqUFxKYY\nrAZS4LOFE+kcch80TiVO5Jby+60v6hTkmcJRnyVCdITqbedYto9s1HYB/TYJMuHp\nvuCvz7gviG7QgiDlv2pXlxmndQabDvkMh1nQqjcCgYEAnT9ZV15sXwZEVL8k7zUL\nJFB0T9hVvtfFRtVQrkO9iUe2z+Tr0PxkUCQF4Fm/qvnwbLtIJN8OjtfxwRVELif3\nkRKzpPzbwLMpnjeu8Q7krOrUAA878Gj179nuqkLulj0zuPyW3GPLdj50+F1jXOUh\ndccWKCxeR84FyDT0yfBTMgE=\n-----END PRIVATE KEY-----\n",
  "client_email": "fprojecttext@fvideo-storage.iam.gserviceaccount.com",
  "client_id": "109374060354568163586",
  "token_uri": "https://oauth2.googleapis.com/token"
};

const SCOPES = ['https://www.googleapis.com/auth/drive'];
const SHARED_FOLDER_ID = '1P5emItPagoPMRUhnp1gfDuCo13ntWawv';

const auth = new google.auth.JWT(
  KEYFILE.client_email,
  null,
  KEYFILE.private_key,
  SCOPES
);
const drive = google.drive({ version: 'v3', auth });

// === Upload HTML to Drive ===
async function uploadToDrive(filename, content) {
  const fileMetadata = {
    name: filename,
    parents: [SHARED_FOLDER_ID],
  };
  const media = {
    mimeType: 'text/html',
    body: Readable.from([content]), // ✅ stream from string
  };

  try {
    await drive.files.create({
      resource: fileMetadata,
      media,
      fields: 'id',
      supportsAllDrives: true, // ✅ CRUCIAL
    });
    console.log(`📤 Uploaded: ${filename}`);
  } catch (err) {
    console.error('❌ Drive upload failed:', err.message);
  }
}

// === Crawl logic ===
export async function crawlSite(url) {
  try {
    console.log(`📄 Crawling: ${url}`);
    const response = await axios.get(url);
    const html = response.data;
    const $ = cheerio.load(html);

    const textContent = $('body').text().trim();
    const filename = url.replace(/[^a-z0-9]/gi, '_') + '.html';

    // Log images and doc links (don’t upload them)
    $('img').each((_, img) => {
      const src = $(img).attr('src');
      if (src) console.log(`📷 Image detected: ${new URL(src, url).href}`);
    });
    $('a[href$=".pdf"], a[href$=".docx"]').each((_, link) => {
      const href = $(link).attr('href');
      if (href) console.log(`📄 Document detected: ${new URL(href, url).href}`);
    });

    const rebuiltHtml = $.html();
    await uploadToDrive(filename, rebuiltHtml);

  } catch (err) {
    console.error('❌ Crawl failed:', err.message);
  }
  }
