import multer from "multer";
import { config } from "../config.js";

const ALLOWED = ["image/jpeg", "image/png", "image/webp"];

export const uploadPhoto = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: config.rules.maxUploadBytes, files: 1 },
  fileFilter: (_req, file, cb) => {
    if (!ALLOWED.includes(file.mimetype)) {
      return cb(new Error("Недопустимый формат файла"));
    }
    cb(null, true);
  },
}).single("photo");
