// fcrawler.js
const fs = require('fs');
const path = require('path');
const axios = require('axios');
const cheerio = require('cheerio');
const { google } = require('googleapis');

// GOOGLE DRIVE AUTH SETUP
const auth = new google.auth.GoogleAuth({
  credentials: {
    type: "service_account",
    project_id: "fvideo-storage",
    private_key_id: "bfee408f7119fdaa45844420f0e2a1dc2f91523d",
    private_key: `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDAG//EzgU79Kfg
U+0xKway6SKAz+q4EZARPU7geZ5RPdBmOW8J968umMB5YLIV4kArCMt1H0mZgmm8
a5KuBXislWzGIdiTXpr2JFvsPrKgEDu6L7gP90KXrmLZ3Uo/1SHDE/WSgwUP13EU
ro7V2XVytZfAsTJn0rTui6louOecHIrBVqXXncH89AbLYwtDEHLfF0LGHShiWG7W
AgLJj10+wThROHBH8GaEnSNnpfo5pJ9f+txVc45Zf76XNZX+G+d53XZUMvcFuzBH
34iPvcDbFzFrJW5nchu6aSZHPvcSzUT1nzc8/S3JxdvKGi07Dd2lHbM7C8sH5TVP
OI6cSfxRAgMBAAECggEAEmBbRfsjGwobKOU+Ui64dFLCvymkXTko281Oh0B6+XB9
R9oEmiJ8OmvYNYQfZOKAmt07gReeFbYY4TI1FLpnQbMFdap1KhupnRP7SwzwT0le
PUAlTjmrwBCpWgfF+3cqxJtbKUmpKUvFgGH2PdSQXImsW31XwgCw2AS6Ds9pMFCM
LDsocqhsndtUdVZxwxxyHZ5GYURNWgQ7NoiU2GymStq/R71LTzyoFMAyw4md4aBH
1FjTfMkxuFnVVuv6qtWTfWuVkHAromdOCzRsSnOpDCUVagkwZMJAVEHpbZhJ9uoQ
lwipmjcjh0hTbqKWTnREsMJ7w1AC+/QVdTXab/405QKBgQDmUdG1BdR4MZnEgHk7
3YdMjmWzfZtvRJ6YXFgx4JMZdOm02iSHy7Ep9dgVvce6iW6hLhTyRyglLtR/18Fg
38sLsuDuGRbGNyYobB86aXRahdLDxXJlX81eDDylOZ3895m3piI5nOJ/hI3fHj2w
cnnvJ+XKO9YPP7xl9lUUpYezkwKBgQDVh4RsRhePNC4vJ3jFvJbcezqF81YLWLW+
rXOchHfYffea4pM7e6LICU6G1ZZ7qpGmngEzC5zGqJWId3KCWL31bB+m0OgprZbZ
nISqKGmEZW7VfOuoNc1zYRDe/vCAnHyLwTSvbgJaYFbzxU0deI6TgXVOUaqs4NJN
hJxvuGrHCwKBgDkoROqvr7LEXGyvlWaN623MSODqYxCR7unQwPJf0SGYKgd/u2EX
47eOEzoSBub8BEBrtzcJAaV4obO4T31DDJiyo69y+nvmY8nUS0urr/xnCY8cCO+v
fr/AOaynR9XnfHZe/E9f57XNp4efcZ/ASRJYzGYLw2u1XYPQRf0Bt1ORAoGAIXbm
ow1tHc1gu5UlEWBYCF/rsRiM0KRrf2Gxr8L3AV/kkUqXJohe35jNzMXmmqUFxKYY
rAZS4LOFE+kcch80TiVO5Jby+60v6hTkmcJRnyVCdITqbedYto9s1HYB/TYJMuHp
vuCvz7gviG7QgiDlv2pXlxmndQabDvkMh1nQqjcCgYEAnT9ZV15sXwZEVL8k7zUL
JFB0T9hVvtfFRtVQrkO9iUe2z+Tr0PxkUCQF4Fm/qvnwbLtIJN8OjtfxwRVELif3
kRKzpPzbwLMpnjeu8Q7krOrUAA878Gj179nuqkLulj0zuPyW3GPLdj50+F1jXOUh
dccWKCxeR84FyDT0yfBTMgE=
-----END PRIVATE KEY-----`,
    client_email: "fprojecttext@fvideo-storage.iam.gserviceaccount.com",
    client_id: "109374060354568163586",
    token_uri: "https://oauth2.googleapis.com/token"
  },
  scopes: ['https://www.googleapis.com/auth/drive']
});

const drive = google.drive({ version: 'v3', auth });
const folderId = '1P5emItPagoPMRUhnp1gfDuCo13ntWawv'; // Your shared folder ID

// UTILS
async function uploadToDrive(name, content, mimeType) {
  const fileMetadata = {
    name,
    parents: [folderId]
  };
  const media = {
    mimeType,
    body: Buffer.from(content)
  };
  try {
    await drive.files.create({
      resource: fileMetadata,
      media,
      supportsAllDrives: true,
      fields: 'id'
    });
    console.log(`📤 Uploaded to Drive: ${name}`);
  } catch (err) {
    console.error(`❌ Drive upload failed: ${err.message}`);
  }
}

async function crawlPage(url) {
  try {
    const res = await axios.get(url, { timeout: 10000 });
    const html = res.data;
    const $ = cheerio.load(html);
    let text = '';
    let images = [];

    $('img').each((i, el) => {
      const src = $(el).attr('src');
      if (src) {
        images.push(src.startsWith('http') ? src : new URL(src, url).href);
        console.log(`📷 Image detected: ${src}`);
      }
    });

    $('a[href$=".pdf"], a[href$=".zip"]').each((i, el) => {
      const link = $(el).attr('href');
      const fullUrl = link.startsWith('http') ? link : new URL(link, url).href;
      console.log(`📎 Doc detected (not downloaded): ${fullUrl}`);
    });

    $('script, style, noscript').remove();
    text = $('body').text().replace(/\s+/g, ' ').trim();

    const filenameSafe = url.replace(/[^a-zA-Z0-9]/g, '_').slice(0, 100);
    await uploadToDrive(`${filenameSafe}.html`, html, 'text/html');
    await uploadToDrive(`${filenameSafe}.txt`, text, 'text/plain');
  } catch (err) {
    console.error(`❌ Failed to crawl ${url}: ${err.message}`);
  }
}

// START
(async () => {
  const startUrl = 'https://dspace.mit.edu/handle/1721.1/12192'; // Change this to your starting URL
  console.log(`📄 Crawling: ${startUrl}`);
  await crawlPage(startUrl);
})();
