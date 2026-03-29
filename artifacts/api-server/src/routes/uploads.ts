import { Router } from "express";
import multer from "multer";
import { ObjectStorageService } from "../lib/objectStorage";

const router = Router();
const objectStorage = new ObjectStorageService();

const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 20 * 1024 * 1024 },
});

router.post("/", upload.single("file"), async (req, res): Promise<void> => {
  if (!req.file) { res.status(400).json({ error: "No file uploaded" }); return; }
  try {
    const objectPath = await objectStorage.uploadBufferWithFilename(
      req.file.buffer,
      req.file.mimetype,
      "uploads",
      req.file.originalname
    );
    res.json({
      url: `/api/storage/objects${objectPath.slice("/objects".length)}`,
      objectPath,
      filename: req.file.originalname,
      size: req.file.size,
    });
  } catch (err) {
    console.error("Upload failed:", err);
    res.status(500).json({ error: "Upload failed" });
  }
});

export default router;
