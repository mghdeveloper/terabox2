const puppeteer = require('puppeteer');
const express = require('express');
const multer = require('multer');
const cors = require('cors');
const fs = require('fs');
const path = require('path');
const axios = require('axios');




const app = express();

const COOKIES_FILE = path.join(__dirname, 'terabox_cookies.json');
const LOGIN_URL = 'https://www.terabox.com/';
const EMAIL = 'rrymouss@gmail.com';
const PASSWORD = 'kokohihi.123';
const UPDATE_INTERVAL = 3 * 24 * 60 * 60 * 1000; // 3 days in milliseconds

// Function to log in and update cookies
async function updateCookies() {
    const browser = await puppeteer.connect({
  browserWSEndpoint: `wss://production-sfo.browserless.io/?token=2TLTrZMP94stEGu44d80f6867ddd3938757024525214c3361&proxy=residential`,
});
    const page = await browser.newPage();

    console.log('Opening TeraBox...');
    await page.goto(LOGIN_URL, { waitUntil: 'domcontentloaded', timeout: 60000 });

    // Click the login button
// Small delay to ensure the page has loaded
await new Promise(resolve => setTimeout(resolve, 2000));

// Try to find the login button by class first
const loginButtonSelector = '.lgoin-btn';
let loginButtonFound = await page.$(loginButtonSelector);

if (loginButtonFound) {
    console.log("✅ Login button found by class. Clicking...");
    await loginButtonFound.click();
} else {
    console.log("⚠️ Login button class not found, searching by text...");

    // Use evaluateHandle to find a div with innerText 'Login' (case-insensitive)
    const loginButtonByTextHandle = await page.evaluateHandle(() => {
        const allDivs = Array.from(document.querySelectorAll('div'));
        return allDivs.find(d => d.innerText.trim().toLowerCase() === 'login') || null;
    });

    if (loginButtonByTextHandle) {
        const element = loginButtonByTextHandle.asElement();
        if (element) {
            console.log("✅ Login button found by text. Clicking...");
            await element.click();
        } else {
            throw new Error("❌ Login button handle found but no element attached.");
        }
    } else {
        throw new Error("❌ Login button not found by class or text!");
    }
}

    // Wait for the "Other Login Options" section
    await page.waitForSelector('.other-item', { timeout: 10000 });

    // Click the second div inside .other-item (email login)
    await page.evaluate(() => {
        document.querySelectorAll('.other-item div')[1].click();
    });

    // Wait for email/password fields
    await page.waitForSelector('#email-input', { timeout: 10000 });
    await page.waitForSelector('#pwd-input', { timeout: 10000 });
    await page.waitForSelector('.btn-class-login', { timeout: 10000 });

    // Fill login details
    await page.type('#email-input', EMAIL, { delay: 100 });
    await page.type('#pwd-input', PASSWORD, { delay: 100 });

    // Click login button
    await page.click('.btn-class-login');

    // Wait for login to complete
    await page.waitForNavigation({ waitUntil: 'networkidle2', timeout: 60000 });

    console.log('Login successful! Saving cookies...');
    const cookies = await page.cookies();
    const fs = require('fs'); // Use the standard fs module

await fs.promises.writeFile(COOKIES_FILE, JSON.stringify(cookies, null, 2));



    console.log(`Cookies updated and saved to ${COOKIES_FILE}`);
    await browser.close();
}
const SELF_CHECK_URL = "https://libby.onrender.com/hi";

async function checkServerHealth() {
    try {
        const response = await axios.get(SELF_CHECK_URL);
        console.log(`🔄 Self-check response: ${response.data}`);
    } catch (error) {
        console.error("❌ Self-check failed:", error.message);
    }
}

// Run the health check every 10 seconds
setInterval(checkServerHealth, 10000);

// Function to schedule cookie updates every 3 days
async function scheduleCookieUpdates() {
  console.log('Cookie updater started. Running every 3 days...');
  try {
    await updateCookies();
  } catch (err) {
    console.error('❌ Initial cookie update failed:', err);
  }

  setInterval(async () => {
    try {
      await updateCookies();
    } catch (err) {
      console.error('❌ Scheduled cookie update failed:', err);
    }
  }, UPDATE_INTERVAL);
}

// Start the updater
scheduleCookieUpdates();

const port = process.env.PORT || 3000;
const COOKIES_PATH = path.resolve(__dirname, 'terabox_cookies.json');
app.use((req, res, next) => {
    res.setHeader("Connection", "keep-alive");
    res.setHeader("Content-Type", "application/json");
    res.setHeader("Access-Control-Allow-Origin", "*"); // Allow CORS for debugging
    res.setHeader("Access-Control-Allow-Methods", "GET, POST, PUT, DELETE, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Content-Type, Authorization");
    next();
});
app.use(express.json({ limit: '100mb' }));
app.use(express.urlencoded({ extended: true, limit: '100mb' }));

// Enable CORS
app.use(cors());
app.get('/hi', (req, res) => {
    console.log("✅ /hi endpoint was accessed.");
    res.send("hi");
});

// Ensure the uploads directory exists
const uploadDir = path.join(__dirname, 'uploads');
if (!fs.existsSync(uploadDir)) {
    fs.mkdirSync(uploadDir, { recursive: true });
}

const upload = multer({
    storage: multer.diskStorage({
        destination: (req, file, cb) => {
            cb(null, uploadDir);  // ✅ Store files in 'uploads/' folder
        },
        filename: (req, file, cb) => {
            cb(null, Date.now() + '-' + file.originalname); // Unique filename
        }
    }),
    limits: { fileSize: 500 * 1024 * 1024 } // Increase limit if needed
});


async function uploadToTeraBox(filePath, fileName) {
    const MAX_RETRIES = 3;
    let attempt = 0;
    let requestId = Date.now(); // Unique ID for tracking each file upload

    while (attempt < MAX_RETRIES) {
        let browser;
        let uploadPage;

        try {
            console.log(`🔄 Attempt ${attempt + 1}/${MAX_RETRIES} for file: ${fileName} (Request ID: ${requestId})`);

            // Launch a new isolated browser instance
            const browser = await puppeteer.connect({
  browserWSEndpoint: `wss://production-sfo.browserless.io/?token=2TLTrZMP94stEGu44d80f6867ddd3938757024525214c3361&proxy=residential`,
});

            uploadPage = await browser.newPage();
            await uploadPage.setViewport({ width: 1280, height: 800 });
            await uploadPage.setUserAgent(
                "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/119.0.0.0 Safari/537.36"
            );

            // Load cookies if available
            if (fs.existsSync(COOKIES_PATH)) {
                const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
                await uploadPage.setCookie(...cookies);
            }

            console.log("🌍 Navigating to TeraBox...");
            await uploadPage.goto('https://www.terabox.com/main?category=all', { waitUntil: 'load', timeout: 60000 });

            console.log("✅ Page loaded successfully.");

            const fileInputSelector = 'input#h5Input0';
            await uploadPage.waitForSelector(fileInputSelector, { visible: true, timeout: 20000 });

// **Store the initial first row ID**
            // **Store the initial first row ID**
const firstRowSelector = 'tbody tr:first-child';
let initialRowId = await uploadPage.evaluate((selector) => {
    const row = document.querySelector(selector);
    return row ? row.getAttribute('data-id') : null;
}, firstRowSelector);

console.log("📌 Stored initial first row ID:", initialRowId);
console.log(`📤 Uploading file: ${fileName} (Request ID: ${requestId})`);

const inputUploadHandle = await uploadPage.$(fileInputSelector);
await inputUploadHandle.uploadFile(filePath);
console.log(`📤 File selected for upload: ${filePath}`);

// **Wait for upload progress or success**
console.log("⏳ Checking for upload status...");

const successSelector = '.status-success.file-list';
const progressSelector = '.status-uploading.file-list .progress-now.progress-common';

try {
    // Check if file is already marked as uploaded (fast uploads)
    const isUploaded = await uploadPage.evaluate((selector) => {
        return !!document.querySelector(selector);
    }, successSelector);

    if (isUploaded) {
        console.log("✅ Upload completed instantly (Success detected).");
    } else {
        console.log("⏳ Upload in progress, tracking dynamically...");

        // **Track Upload Progress Dynamically**
        await new Promise(async (resolve) => {
            let lastProgress = "";

            const checkProgress = async () => {
                try {
                    const progress = await uploadPage.evaluate((selector) => {
                        const progressElement = document.querySelector(selector);
                        return progressElement ? progressElement.style.width : null;
                    }, progressSelector);

                    if (progress && progress !== lastProgress) {
                        console.log(`📊 Upload Progress: ${progress}`);
                        lastProgress = progress;
                    }

                    // **Check if upload finished successfully**
                    const isUploaded = await uploadPage.evaluate((selector) => {
                        return !!document.querySelector(selector);
                    }, successSelector);

                    if (isUploaded || progress === "100%") {
                        console.log("✅ Upload completed!");
                        resolve();
                    } else {
                        setTimeout(checkProgress, 1000);
                    }
                } catch (error) {
                    console.log("⚠️ Error tracking progress, but upload is still ongoing...");
                    setTimeout(checkProgress, 1000);
                }
            };

            checkProgress();
        });
    }
} catch (error) {
    console.log("⚠️ Upload tracking encountered an error:", error);
}

console.log("✅ Upload finished.");


// **Wait for upload to complete by detecting new row ID**
            console.log("⏳ Waiting for the upload to complete...");
            await uploadPage.waitForFunction(
                (selector, initialId) => {
                    const row = document.querySelector(selector);
                    return row && row.getAttribute('data-id') !== initialId;
                },
                { timeout: 600000 }, // Wait up to 10 minutes
                firstRowSelector,
                initialRowId
            );

            console.log("✅ Upload finished, new file detected.");

// **Store the ID of the new uploaded file's row**
            let uploadedRowId = await uploadPage.evaluate((selector) => {
                const row = document.querySelector(selector);
                return row ? row.getAttribute('data-id') : null;
            }, firstRowSelector);

            console.log("📌 Stored uploaded row ID:", uploadedRowId);

// **Select the first row and its checkbox**
            await uploadPage.waitForSelector(firstRowSelector, { visible: true });
            await uploadPage.click(firstRowSelector);
            console.log("✅ Selected first row");

            const checkboxSelector = 'tbody tr:first-child .wp-s-pan-table__body-row--checkbox-block.is-select';
            await uploadPage.waitForSelector(checkboxSelector, { visible: true });
            await uploadPage.click(checkboxSelector);
            console.log("✅ Selected checkbox");


            // **Share file and get the link**
            console.log("🔗 Generating share link...");
            const shareButtonSelector = '[title="Share"]';
            await uploadPage.waitForSelector(shareButtonSelector, { visible: true });
            await uploadPage.click(shareButtonSelector);

            const copyButtonSelector = '.private-share-btn';
            await uploadPage.waitForSelector(copyButtonSelector, { visible: true });
            await uploadPage.click(copyButtonSelector);

            const linkSelector = '.copy-link-content p.text';
            await uploadPage.waitForSelector(linkSelector, { visible: true });
            const shareLink = await uploadPage.$eval(linkSelector, el => el.textContent.trim());

            console.log(`✅ Share Link: ${shareLink}`);

            // 🆕 **Step: Click on the row that matches the stored uploaded row ID**
            if (uploadedRowId) {
                const uploadedCheckboxSelector = `tbody tr[data-id="${uploadedRowId}"] .wp-s-pan-table__body-row--checkbox-block.is-select`;
                await uploadPage.waitForSelector(uploadedCheckboxSelector, { visible: true });
                await uploadPage.click(uploadedCheckboxSelector);
                console.log(`✅ Clicked on the uploaded row (ID: ${uploadedRowId})`);
            } else {
                console.log("⚠️ Could not find uploaded row ID. Skipping row click.");
            }

            await uploadPage.close();
            await browser.close();
            console.log("❎ Closed the browser.");
            fs.unlinkSync(filePath); 
            console.log(`🗑️ Deleted temporary file: ${filePath}`);

            return { success: true, link: shareLink };
        } catch (error) {
            console.error(`❌ Upload error on attempt ${attempt + 1}:`, error);
            attempt++;

            if (uploadPage) await uploadPage.close();
            if (browser) await browser.close();
        }
    }

    return { success: false, error: "Upload failed after multiple attempts." };
}

app.get("/proxy", async (req, res) => {
  const targetUrl = req.query.url;
  if (!targetUrl) return res.status(400).send("Missing URL parameter");

  const referer = "https://www.1024tera.com/";
  const cookies = `browserid=CpaFTbGSs3HeO3SFHcqa4CRzaT4vlD7HVDl5Og-UF0SptpDVu63cnwl3XBE=; lang=en; ...`;

  // MIME type detection
  const ext = path.extname(targetUrl).toLowerCase();
  const mimeMap = {
    ".m3u8": "application/vnd.apple.mpegurl",
    ".ts": "video/MP2T",
  };
  const mime = mimeMap[ext] || "application/octet-stream";

  const headers = {
    Referer: referer,
    "User-Agent":
      "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
    Cookie: cookies,
  };

  // Forward range requests for partial playback
  if (req.headers.range) {
    headers.Range = req.headers.range;
  }

  try {
    const response = await axios({
      url: targetUrl,
      method: "GET",
      headers,
      responseType: "stream",
      maxRedirects: 5,
      decompress: false, // don't decompress to avoid memory buffering
    });

    // Forward headers from the upstream response
    res.setHeader("Content-Type", mime);
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Accept-Ranges", "bytes");

    if (response.headers["content-length"])
      res.setHeader("Content-Length", response.headers["content-length"]);
    if (response.headers["content-range"])
      res.setHeader("Content-Range", response.headers["content-range"]);

    // Immediately pipe (no storage in RAM)
    response.data.pipe(res);

    // Handle stream errors cleanly
    response.data.on("error", (err) => {
      console.error("❌ Proxy stream error:", err.message);
      if (!res.headersSent) res.writeHead(502);
      res.end("Stream error");
    });

    // When finished, close response
    response.data.on("end", () => {
      res.end();
    });
  } catch (error) {
    console.error("❌ Proxy request failed:", error.message);
    res.status(502).send(`Failed to fetch segment: ${error.message}`);
  }
});
app.get("/stream", async (req, res) => {
  const { filename } = req.query;
  if (!filename) {
    return res.status(400).json({ success: false, message: "Missing 'filename' query parameter." });
  }

    const COOKIE_STRING = `browserid=CpaFTbGSs3HeO3SFHcqa4CRzaT4vlD7HVDl5Og-UF0SptpDVu63cnwl3XBE=; lang=en; TSID=fu79RRYes2WHH3xyF7g4lGDdndhCu0yc; Lda_aKUr6BGRn=hipodi.com/r/v2?; Lda_aKUr6BGRr=0; __bid_n=19a3f392d37b8c5ef14207; _ga=GA1.1.759595362.1761997305; _gcl_au=1.1.1032610337.1761997774; _tt_enable_cookie=1; _ttp=01K8ZM0S39F70JJ3K660B29EDH_.tt.1; _fbp=fb.1.1761997776154.299446426197481242; ttcsid=1761997775983::SPyfDApALJW-Pws-nAfo.1.1761998289016.0; ttcsid_CE7B8VRC77U8BHMEOA70=1761997775982::xUMYX9WAgpnqtAfqgWEe.1.1761998289017.0; _ga_RSNVN63CM3=GS2.1.s1761997776$o1$g1$t1761998292$j56$l0$h0; __stripe_mid=e2910684-cbb3-487c-bf9b-0fff1c0ed4936d0f49; ndus=YSIVdgCteHuikmQATvl7LR0dHGYsJ9QePZkklNe1; _rdt_uuid=1761998627204.7a54da87-b299-4993-a64a-808e3b2bb18d; _rdt_em=:92c86f9fd14070f987ca63bb6e77603e3995ffca29dacb7b7f63b627e203828e,dcae6590804a25d28c3636bafb2ec06d021a7e425c0178c6664895fe7be54c2b,63d71941f4a6e80cb503e63d5d406ed7879ebeb9532741d75316c71c3079f20b; _ga_HSVH9T016H=GS2.1.s1761997774$o1$g1$t1761998634$j52$l0$h0; Fm_kZf8ZQvmX=1; Ac_aqK8DtrDS=10; g_state={"i_l":0,"i_ll":1762003456326,"i_b":"iWjWAqGE/e2HmMNKNsoqq1t/138HVu6We32lPylQvlQ"}; ndut_fmt=8AC62D9DE2C083FFD9D1A8FA80A09F25626DDD0CDEB2C49328769DFD561561E9; _ga_06ZNKL8C2E=GS2.1.s1762003455$o2$g1$t1762004454$j59$l0$h0`;

  const resolutions = ["M3U8_AUTO_360", "M3U8_AUTO_480", "M3U8_AUTO_720", "M3U8_AUTO_1080"];
  const cacheDir = path.join(__dirname, "m3u8_cache");

  // Ensure cache directory exists
  if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });

  const results = {};

  try {
    for (const resolution of resolutions) {
      const streamURL = `https://www.1024tera.com/api/streaming?path=${encodeURIComponent("/" + filename)}&app_id=250528&clienttype=0&type=${resolution}&vip=0`;

      console.log(`🌐 Fetching ${resolution}...`);

      try {
        const response = await axios.get(streamURL, {
          headers: {
            Cookie: COOKIE_STRING,
            "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
            Accept: "*/*",
            Referer: "https://www.1024tera.com/",
          },
          responseType: "text",
          validateStatus: () => true
        });

        // Save M3U8 content to file only if we got content
        if (response.status === 200 && response.data.startsWith("#EXTM3U")) {
          const safeFilename = filename.replace(/[^a-z0-9_\-]/gi, "_"); // sanitize
          const filePath = path.join(cacheDir, `${safeFilename}_${resolution}.m3u8`);
          fs.writeFileSync(filePath, response.data, "utf-8");
          console.log(`✅ Saved M3U8: ${filePath}`);

          results[resolution] = { file: filePath, status: response.status, url: streamURL };
        } else {
          console.warn(`⚠️ No M3U8 content found for ${resolution} (status: ${response.status})`);
          results[resolution] = { file: null, status: response.status, url: streamURL };
        }
      } catch (err) {
        console.error(`❌ Error fetching ${resolution}: ${err.message}`);
        results[resolution] = { file: null, error: err.message, url: streamURL };
      }
    }

    res.json({ success: true, cachedFiles: results });
  } catch (err) {
    console.error("❌ Stream route error:", err.message);
    res.status(500).json({ success: false, message: "Stream retrieval failed." });
  }
});

app.post('/upload', (req, res) => {
    let receivedBytes = 0;
    let loggedMB = 0;
    const originalFilename = req.headers['filename']; // Get filename from header

    if (!originalFilename) {
        return res.status(400).json({ success: false, message: "Filename is required in headers." });
    }

    const tempFilePath = path.join(uploadDir, originalFilename); // Initial file path (temp name)
    const writeStream = fs.createWriteStream(tempFilePath);

    console.log("📥 Upload started...");

    req.on('data', (chunk) => {
        receivedBytes += chunk.length;
        writeStream.write(chunk);

        // Log every 1MB received
        const receivedMB = Math.floor(receivedBytes / (1024 * 1024));
        if (receivedMB > loggedMB) {
            loggedMB = receivedMB;
            console.log(`📊 Received: ${receivedMB}MB`);
        }
    });

    req.on('end', async () => {
        writeStream.end();
        console.log(`✅ Upload complete. Total size: ${(receivedBytes / (1024 * 1024)).toFixed(2)}MB`);

        try {
            // Rename file before uploading to TeraBox
            const timestamp = Date.now();
            const newFileName = `${timestamp}-${originalFilename}`;
            const newFilePath = path.join(uploadDir, newFileName);

            fs.renameSync(tempFilePath, newFilePath);
            console.log(`📁 Renamed file to: ${newFileName}`);

            // Upload to TeraBox
            const result = await uploadToTeraBox(newFilePath, newFileName);

            if (!result.success) {
                console.error("❌ Upload failed:", result.error);
                return res.status(500).json({ success: false, message: result.error || "Upload failed." });
            }

            // Respond with details
            res.json({
                success: true,
                fileName: newFileName,
                shareUrl: result.link
            });

        } catch (error) {
            console.error("❌ Server error:", error);
            res.status(500).json({ success: false, message: "Internal server error." });
        }
    });

    req.on('error', (err) => {
        console.error("❌ Upload error:", err);
        res.status(500).json({ success: false, message: "Upload interrupted." });
    });
});

app.get('/download', async (req, res) => {
    const { filename } = req.query;
    if (!filename) {
        return res.status(400).json({ success: false, message: "Filename is required." });
    }

    try {
        console.log(`🔍 Searching for file: ${filename}`);
        const browser = await puppeteer.launch({
            headless: 'new',  // Use 'new' for improved headless mode
            protocolTimeout: 180000, // Increased protocol timeout for stability
            executablePath: process.env.PUPPETEER_EXECUTABLE_PATH || undefined, // Use default if not set
            args: [
                '--no-sandbox',
                '--disable-setuid-sandbox',
                '--disable-dev-shm-usage',
                '--disable-gpu',
                '--disable-features=IsolateOrigins,site-per-process', // More stable site isolation
                '--disable-web-security',
                '--disable-http2', // Disable HTTP/2 if causing issues
                '--proxy-server="direct://"',
                '--proxy-bypass-list=*',
                '--disable-background-timer-throttling',
                '--disable-backgrounding-occluded-windows',
                '--disable-renderer-backgrounding',
                '--disable-accelerated-2d-canvas',
                '--disable-ipc-flooding-protection',
                '--enable-features=NetworkService,NetworkServiceInProcess',
            ],
            ignoreDefaultArgs: ['--disable-extensions'], // Allow extensions if needed
            defaultViewport: null, // Avoid viewport resizing issues
        });
        const page = await browser.newPage();

        // Load cookies if available
        if (fs.existsSync(COOKIES_PATH)) {
            const cookies = JSON.parse(fs.readFileSync(COOKIES_PATH, 'utf8'));
            await page.setCookie(...cookies);
        }

        await page.goto(`https://www.terabox.com/main?category=all&search=${encodeURIComponent(filename)}`, { waitUntil: 'domcontentloaded' });

        const firstRowSelector = 'tbody tr:first-child';
        await page.waitForSelector(firstRowSelector, { visible: true, timeout: 30000 });
        await page.click(firstRowSelector);
        console.log("✅ Selected first row");

        const checkboxSelector = 'tbody tr:first-child .wp-s-pan-table__body-row--checkbox-block.is-select';
        await page.waitForSelector(checkboxSelector, { visible: true });
        await page.click(checkboxSelector);
        console.log("✅ Selected checkbox");

        const downloadButtonSelector = '.u-button-group.wp-s-agile-tool-bar__h-button-group.is-list.is-has-more div:nth-child(2)';
        await page.waitForSelector(downloadButtonSelector, { visible: true });

        // Intercept network requests to detect the file download URL
        let downloadLink = null;

        const waitForDownloadLink = new Promise((resolve) => {
            page.on('response', async (response) => {
                const url = response.url();
                if (url.startsWith("https://d-jp02-zen.terabox.com/file/")) {
                    downloadLink = url;
                    console.log(`🔗 Captured download link: ${downloadLink}`);
                    resolve();
                }
            });
        });

        await page.click(downloadButtonSelector);
        console.log("⬇️ Clicked second download button");

        // Wait until the network captures the download link
        await waitForDownloadLink;

        await browser.close();

        if (downloadLink) {
            res.json({ success: true, downloadLink });
        } else {
            res.status(500).json({ success: false, message: "Failed to capture download link." });
        }
    } catch (error) {
        console.error("❌ Download error:", error);
        res.status(500).json({ success: false, message: "Failed to retrieve download link." });
    }
});


const server = app.listen(port, () => {
    console.log(`🚀 Server running at http://localhost:${port}`);
});
server.timeout = 600000; // 10 minutes
server.headersTimeout = 650000; // Increase header timeout
