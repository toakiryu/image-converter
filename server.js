const express = require("express");
const path = require("path");
const multer = require("multer");
const sharp = require("sharp");
const fs = require("fs");
const { exec } = require("child_process");
const icoToPng = require("ico-to-png");
const archiver = require("archiver");

const app = express();

const decodeFilename = (filename) => {
  try {
    return decodeURIComponent(filename);
  } catch (e) {
    console.error("Filename decoding failed:", e);
    return filename; // デコード失敗した場合はそのまま返す
  }
};

const encodeFilename = (filename) => {
  try {
    return encodeURIComponent(filename);
  } catch (e) {
    console.error("Filename encoding failed:", e);
    return filename;
  }
};

// アップロード先の設定
const upload = multer({
  storage: multer.diskStorage({
    destination: path.join(__dirname, "uploads"),
    filename: (req, file, cb) => {
      const decodedName = decodeFilename(file.originalname);
      cb(null, decodedName);
    },
  }),
});

// ダウンロードディレクトリのパス
const downloadDir = path.join(__dirname, "downloads");

// ダウンロードディレクトリが存在しない場合は作成
if (!fs.existsSync(downloadDir)) {
  fs.mkdirSync(downloadDir);
}

// 静的ファイルの提供
app.use(express.static(path.join(__dirname, "public")));
app.use(express.json());

function removeLastExtension(filename) {
  return filename.replace(/\.[a-zA-Z0-9]+$/, "");
}

// 複数ファイルの画像変換API
app.post("/convert", upload.array("images"), async (req, res) => {
  try {
    const { format } = req.body;
    const convertedFiles = [];

    // アップロードされたファイルごとに処理
    for (const file of req.files) {
      const newFilename = removeLastExtension(file.filename);
      // const originalName = path.parse(file.originalname).name;
      const inputPath = file.path;
      const outputPath = path.resolve(
        __dirname,
        `uploads/${newFilename}.${format}`
      );

      // .ico ファイルの場合、最初に PNG に変換
      if (file.mimetype === "image/vnd.microsoft.icon") {
        const pngBuffer = await icoToPng(inputPath);
        await sharp(pngBuffer).toFormat(format).toFile(outputPath);
      } else {
        await sharp(inputPath).toFormat(format).toFile(outputPath);
      }

      convertedFiles.push(`${newFilename}.${format}`);
    }

    res.json({
      message: "Images converted!",
      files: convertedFiles,
    });
  } catch (error) {
    res.status(500).send(error.message);
  }
});

app.post("/download", (req, res) => {
  const filesToDownload = req.body.files; // クライアントから送信されたダウンロードファイルリスト

  const archive = archiver("zip", {
    zlib: { level: 9 }, // 最大圧縮
  });

  const output = fs.createWriteStream(
    path.join(downloadDir, "converted_files.zip")
  );
  archive.pipe(output);

  filesToDownload.forEach((file) => {
    const filePath = path.resolve(__dirname, "uploads", file);
    archive.file(filePath, { name: file });
  });

  output.on("close", () => {
    res.download(
      path.join(__dirname, "downloads", "converted_files.zip"),
      "converted_files.zip"
    );
  });

  archive.finalize();
});

// サーバー終了時に変換済みファイルを削除
const deleteFiles = async () => {
  const publicDir = path.resolve(__dirname, "uploads");
  const downloadsDir = path.resolve(__dirname, "downloads");

  const logFiles = async (dir) => {
    const files = await fs.promises.readdir(dir);
    console.log(`Files in ${dir}:`, files);
    return files;
  };

  const deleteFromDir = async (dir) => {
    const files = await logFiles(dir); // ファイルリストをログ
    const unlinkPromises = files.map(async (file) => {
      const filePath = path.join(dir, file);
      try {
        if (fs.existsSync(filePath)) {
          await fs.promises.unlink(filePath);
          console.log(`Deleted file: ${file}`);
        } else {
          console.warn(`File not found: ${file}`);
        }
      } catch (err) {
        console.error(`Failed to delete file ${file}:`, err.message);
      }
    });

    await Promise.all(unlinkPromises);
  };

  await deleteFromDir(publicDir);
  await deleteFromDir(downloadsDir);
};

// サーバー起動
const server = app.listen(0, () => {
  const PORT = server.address().port; // 自動で割り当てられたポート番号を取得
  console.log(`Server is running at http://localhost:${PORT}`);
  exec(`open http://localhost:${PORT}`, (err) => {
    if (err) {
      console.error("Failed to open browser:", err);
    }
  });

  // サーバーのcloseイベントをリスンして終了時のログを表示
  server.on("close", () => {
    console.log("Server has been shut down.");
  });

  // SIGINT (Ctrl+C) をリスンしてサーバーを終了
  process.on("SIGINT", async () => {
    console.log("SIGINT received");
    try {
      console.log("Deleting files...");
      await deleteFiles();
      console.log("Files deleted.");
    } catch (error) {
      console.error("Error during file deletion:", error);
    }

    console.log("Closing server...");
    server.close(() => {
      console.log("Server closed.");
      process.exit();
    });
  });
});
