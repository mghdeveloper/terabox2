// server.js
const express = require("express");
const multer = require("multer");
const axios = require("axios");
const fs = require("fs");
const path = require("path");
const FormData = require("form-data");
const cors = require("cors");

const app = express();
app.use(cors()); // Allow all CORS

// ============================
// CONFIGURATION
// ============================
const APP_ID = "250528";
const JS_TOKEN = "5DC263D8AA4BDE275E023FB17E801FBA870A9732ECFECF8D6488783A69136EC55BC38F16311018A009B1029EA142D1CD0F11B77E35EDDC3E09E7F9C791F1BB43";
const DP_LOGID = "88945700695386130051";
const BDSTOKEN = "49f3f89dbff9c3284888f118e9061d19";
const COOKIE_STRING = 'browserid=CpaFTbGSs3HeO3SFHcqa4CRzaT4vlD7HVDl5Og-UF0SptpD...'; // truncated for brevity

const HEADERS = {
  "Accept": "application/json, text/plain, */*",
  "Accept-Language": "en-US,en;q=0.9",
  "Connection": "keep-alive",
  "Origin": "https://www.1024tera.com",
  "Referer": "https://www.1024tera.com/main?category=all",
  "User-Agent": "Mozilla/5.0 (iPhone; CPU iPhone OS 18_5 like Mac OS X) AppleWebKit/605.1.15 Version/18.5 Mobile/15E148 Safari/604.1",
  "X-Requested-With": "XMLHttpRequest",
  "Cookie": COOKIE_STRING
};

// ============================
// MULTER SETUP
// ============================
const upload = multer({ dest: "uploads/" });

// ============================
// HELPER FUNCTION
// ============================
async function postRequest(url, headers, data, isFile = false) {
  if (isFile) {
    return axios.post(url, data, { headers });
  } else {
    return axios.post(url, new URLSearchParams(data), { headers });
  }
}

// ============================
// ROUTE: UPLOAD FILE TO TERABOX
// ============================
app.post("/upload", upload.single("file"), async (req, res) => {
  try {
    if (!req.file) return res.status(400).send("❌ No file uploaded.");

    const filePath = req.file.path;
    const ext = path.extname(req.file.originalname);
    const timestamp = Date.now();
    const newName = `${timestamp}${ext}`;
    const savePath = path.join(__dirname, newName);
    fs.renameSync(filePath, savePath);

    const REMOTE_PATH = `/${newName}`;
    const fileSize = fs.statSync(savePath).size;
    const local_mtime = Math.floor(Date.now() / 1000);

    // === STEP 1: PRECREATE ===
    const precreateUrl = `https://www.1024tera.com/api/precreate?app_id=${APP_ID}&web=1&channel=dubox&clienttype=0&jsToken=${JS_TOKEN}&dp-logid=${DP_LOGID}`;
    const precreateData = {
      path: REMOTE_PATH,
      autoinit: "1",
      target_path: "/",
      block_list: "[]",
      size: fileSize.toString(),
      file_limit_switch_v34: "true",
      g_identity: "",
      local_mtime: local_mtime.toString()
    };
    let response = await postRequest(precreateUrl, HEADERS, precreateData);
    const uploadid = response.data.uploadid;
    if (!uploadid) throw new Error("❌ Precreate failed");

    // === STEP 2: UPLOAD FILE ===
    const uploadUrl = `https://c-jp.1024tera.com/rest/2.0/pcs/superfile2?method=upload&app_id=${APP_ID}&channel=dubox&clienttype=0&web=1&path=${encodeURIComponent(REMOTE_PATH)}&uploadid=${uploadid}&uploadsign=0&partseq=0`;
    const form = new FormData();
    form.append("file", fs.createReadStream(savePath));

    response = await postRequest(uploadUrl, { ...HEADERS, ...form.getHeaders() }, form, true);
    const md5 = response.data.md5;
    if (!md5) throw new Error("❌ Upload failed");

    // === STEP 3: CREATE FINAL FILE ===
    const createUrl = `https://www.1024tera.com/api/create?isdir=0&rtype=1&bdstoken=${BDSTOKEN}&app_id=${APP_ID}&web=1&channel=dubox&clienttype=0&jsToken=${JS_TOKEN}&dp-logid=${parseInt(DP_LOGID)+2}`;
    const createData = {
      path: REMOTE_PATH,
      size: fileSize.toString(),
      uploadid,
      target_path: "/",
      block_list: JSON.stringify([md5]),
      local_mtime: local_mtime.toString()
    };
    response = await postRequest(createUrl, { ...HEADERS, "Content-Type": "application/x-www-form-urlencoded" }, createData);

    fs.unlinkSync(savePath); // delete local file

    if (response.data.errno === 0) {
      return res.json({ success: true, remotePath: REMOTE_PATH });
    } else {
      throw new Error("⚠️ Create step failed");
    }
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// ============================
// ROUTE: DOWNLOAD FILE
// ============================
app.get("/download", async (req, res) => {
  try {
    const filePath = req.query.path;
    if (!filePath) return res.status(400).send("❌ Missing 'path' query param");

    // Example TeraBox download URL, may require token/cookies
    const downloadUrl = `https://www.1024tera.com/api/download?path=${encodeURIComponent(filePath)}&bdstoken=${BDSTOKEN}`;
    const response = await axios.get(downloadUrl, { headers: HEADERS, responseType: "stream" });

    res.setHeader("Content-Disposition", `attachment; filename="${path.basename(filePath)}"`);
    response.data.pipe(res);
  } catch (err) {
    console.error(err);
    res.status(500).send(err.message);
  }
});

// ============================
// START SERVER
// ============================
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`Server running on port ${PORT}`));
