const express = require("express");
const multer = require("multer");
const { spawn } = require("child_process");
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const app = express();
const PORT = process.env.PORT || 3000;
const ROOT = __dirname;
const TMP = path.join(ROOT, "tmp");
const OUT = path.join(ROOT, "output");

fs.mkdirSync(TMP, { recursive: true });
fs.mkdirSync(OUT, { recursive: true });

app.use(express.json());
app.use(express.static(path.join(ROOT, "public")));
app.use("/output", express.static(OUT));

const upload = multer({
  dest: TMP,
  limits: { fileSize: 500 * 1024 * 1024 }
});

function run(cmd, args) {
  return new Promise((resolve, reject) => {
    const p = spawn(cmd, args);
    let stdout = "", stderr = "";
    p.stdout.on("data", d => stdout += d);
    p.stderr.on("data", d => stderr += d);
    p.on("error", reject);
    p.on("close", code => code === 0 ? resolve({stdout, stderr}) :
      reject(new Error(stderr.slice(-4000) || `${cmd} exited ${code}`)));
  });
}

function safeId() {
  return crypto.randomBytes(8).toString("hex");
}

function isValidYouTubeUrl(raw) {
  try {
    const u = new URL(raw);
    return ["www.youtube.com", "youtube.com", "m.youtube.com", "youtu.be"].includes(u.hostname);
  } catch {
    return false;
  }
}

app.get("/api/health", (_, res) => res.json({ ok: true }));

// Metadata only. This does not download the video.
app.post("/api/info", async (req, res) => {
  try {
    const url = String(req.body?.url || "").trim();
    if (!isValidYouTubeUrl(url)) {
      return res.status(400).json({ error: "Masukkan URL YouTube yang valid." });
    }

    const { stdout } = await run("yt-dlp", [
      "--dump-single-json",
      "--skip-download",
      "--no-warnings",
      "--no-playlist",
      url
    ]);
    const data = JSON.parse(stdout);

    res.json({
      id: data.id,
      title: data.title,
      channel: data.channel || data.uploader,
      duration: data.duration || 0,
      thumbnail: data.thumbnail || "",
      webpage_url: data.webpage_url || url
    });
  } catch (e) {
    res.status(500).json({ error: "Gagal membaca video. Pastikan URL publik dan coba lagi." });
  }
});

// Download + trim + 9:16 crop. Intended for content you own or are authorized to process.
app.post("/api/clip", async (req, res) => {
  const url = String(req.body?.url || "").trim();
  const start = Number(req.body?.start);
  const end = Number(req.body?.end);
  const crop = String(req.body?.crop || "center");

  if (!isValidYouTubeUrl(url)) return res.status(400).json({ error: "URL YouTube tidak valid." });
  if (!Number.isFinite(start) || !Number.isFinite(end) || start < 0 || end <= start) {
    return res.status(400).json({ error: "Timestamp tidak valid." });
  }
  if (end - start > 180) return res.status(400).json({ error: "V1 dibatasi maksimal 3 menit per clip." });

  const id = safeId();
  const source = path.join(TMP, `${id}.mp4`);
  const output = path.join(OUT, `${id}.mp4`);

  // Download a compatible MP4. yt-dlp is only invoked server-side.
  try {
    await run("yt-dlp", [
      "--no-playlist",
      "-f", "bv*[ext=mp4][height<=1080]+ba[ext=m4a]/b[ext=mp4]/b",
      "--merge-output-format", "mp4",
      "-o", source,
      url
    ]);

    // 9:16: scale height to 1920 then crop a 1080x1920 window.
    // crop=... uses a simple horizontal position selection.
    const x = crop === "left" ? "0" :
              crop === "right" ? "iw-ih*9/16" :
              "(iw-ih*9/16)/2";

    await run("ffmpeg", [
      "-y",
      "-ss", String(start),
      "-i", source,
      "-t", String(end - start),
      "-vf", `scale=-2:1920,crop=1080:1920:${x}:0,format=yuv420p`,
      "-c:v", "libx264",
      "-preset", "veryfast",
      "-crf", "23",
      "-c:a", "aac",
      "-b:a", "128k",
      "-movflags", "+faststart",
      output
    ]);

    try { fs.unlinkSync(source); } catch {}
    res.json({
      ok: true,
      url: `/output/${path.basename(output)}`,
      filename: path.basename(output)
    });
  } catch (e) {
    try { fs.unlinkSync(source); } catch {}
    res.status(500).json({
      error: "Gagal membuat clip.",
      detail: e.message
    });
  }
});

app.listen(PORT, () => console.log(`YouTube Clipper V1 running on port ${PORT}`));
