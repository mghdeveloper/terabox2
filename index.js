const express = require("express");
const fs = require("fs");
const path = require("path");
const axios = require("axios");
const cors = require("cors");

const app = express();

// === Enable CORS for all origins ===
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// === Configuration ===
const cacheDir = path.join(__dirname, "m3u8_cache");
const logDir = path.join(__dirname, "logs");
const logFile = path.join(logDir, "stream_errors.log");

// Ensure directories exist
if (!fs.existsSync(cacheDir)) fs.mkdirSync(cacheDir, { recursive: true });
if (!fs.existsSync(logDir)) fs.mkdirSync(logDir, { recursive: true });

// === Helper: Log errors ===
function logError(message) {
  const time = new Date().toISOString().replace("T", " ").split(".")[0];
  fs.appendFileSync(logFile, `[${time}] ${message}\n`);
}

// === Cookie string ===
const cookieString = `browserid=CpaFTbGSs3HeO3SFHcqa4CRzaT4vlD7HVDl5Og-UF0SptpDVu63cnwl3XBE=; lang=en; TSID=fu79RRYes2WHH3xyF7g4lGDdndhCu0yc; ...etc...`; // truncated for clarity

// === POST /upload ===
app.post("/upload", async (req, res) => {
  const { filename } = req.body;
  if (!filename) {
    return res.status(400).json({ success: false, message: "Missing 'filename' parameter." });
  }

  const resolutions = ["M3U8_AUTO_360", "M3U8_AUTO_480", "M3U8_AUTO_720", "M3U8_AUTO_1080"];
  const results = {};

  for (const resolution of resolutions) {
    const streamURL = `https://www.1024tera.com/api/streaming?path=${encodeURIComponent(
      "/" + filename
    )}&app_id=250528&clienttype=0&type=${resolution}&vip=0`;

    try {
      const response = await axios.get(streamURL, {
        headers: {
          Cookie: cookieString,
          "User-Agent":
            "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36",
          Accept: "*/*",
          Referer: "https://www.1024tera.com/",
        },
        timeout: 60000,
      });

      if (response.status === 200 && response.data.startsWith("#EXTM3U")) {
        const modified = response.data
          .split("\n")
          .map((line) => {
            line = line.trim();
            if (line && !line.startsWith("#")) {
              return `https://libby.onrender.com/proxy?url=${encodeURIComponent(line)}`;
            }
            return line;
          })
          .join("\n");

        const safeFilename = filename.replace(/[^a-z0-9_\-]/gi, "_");
        const filePath = path.join(cacheDir, `${safeFilename}_${resolution}.m3u8`);
        fs.writeFileSync(filePath, modified);

        results[resolution] = { file: path.basename(filePath), status: response.status, url: streamURL };
      } else {
        throw new Error("Invalid or missing M3U8 content");
      }
    } catch (err) {
      const errorMsg = err.message || "Unknown error";
      logError(`Resolution: ${resolution} | URL: ${streamURL} | Error: ${errorMsg}`);
      results[resolution] = {
        file: null,
        status: err.response?.status || 500,
        url: streamURL,
        error: errorMsg,
      };
    }
  }

  return res.json({ success: true, cachedFiles: results });
});

// === GET /download?file=FILENAME ===
app.get("/download", (req, res) => {
  const file = req.query.file;
  if (!file) {
    return res.status(400).json({ success: false, message: "Missing 'file' query parameter." });
  }

  const filePath = path.join(cacheDir, file);
  if (!fs.existsSync(filePath)) {
    return res.status(404).json({ success: false, message: "File not found." });
  }

  res.download(filePath, file, (err) => {
    if (err) logError(`Download failed for ${file}: ${err.message}`);
  });
});

// === Start server ===
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`✅ Stream server running on port ${PORT}`));
