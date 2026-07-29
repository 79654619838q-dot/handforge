import dotenv from "dotenv";
dotenv.config();

const num = (v, d) => (v === undefined || v === "" ? d : Number(v));

export const config = {
  port: num(process.env.PORT, 4000),
  corsOrigin: process.env.CORS_ORIGIN || "http://localhost:5173",

  jwtSecret: process.env.JWT_SECRET || "dev-secret-change-me",
  jwtRefreshSecret: process.env.JWT_REFRESH_SECRET || "dev-refresh-secret-change-me",
  accessTtl: "15m",
  refreshTtl: "30d",

  anthropicKey: process.env.ANTHROPIC_API_KEY || "",
  openrouterKey: process.env.OPENROUTER_API_KEY || "",
  models: {
    vision: process.env.AI_MODEL_VISION || "google/gemini-2.5-flash",
    tasks: process.env.AI_MODEL_TASKS || "google/gemini-2.5-flash-lite",
    arbiter: process.env.AI_MODEL_ARBITER || "google/gemini-2.5-pro",
  },
  aiTimeoutMs: num(process.env.AI_TIMEOUT_MS, 25000),

  rules: {
    maxAttempts: num(process.env.MAX_ATTEMPTS_PER_ASSIGNMENT, 3),
    confidenceApprove: num(process.env.CONFIDENCE_APPROVE, 0.75),
    confidenceArbiter: num(process.env.CONFIDENCE_ARBITER, 0.45),
    blurMinScore: num(process.env.BLUR_MIN_SCORE, 40),
    duplicateHamming: num(process.env.DUPLICATE_HAMMING, 6),
    taskPoolMin: num(process.env.TASK_POOL_MIN, 60),
    captureTokenTtlSec: num(process.env.CAPTURE_TOKEN_TTL_SEC, 300),
    minElapsedMs: 800,
    maxUploadBytes: 8 * 1024 * 1024,
    minUploadBytes: 30 * 1024,
  },

  storage: {
    driver: process.env.STORAGE_DRIVER || "local",
    path: process.env.STORAGE_PATH || "./storage/photos",
    s3: {
      endpoint: process.env.S3_ENDPOINT,
      bucket: process.env.S3_BUCKET,
      key: process.env.S3_KEY,
      secret: process.env.S3_SECRET,
    },
  },
};

export const hasAI = () => Boolean(config.openrouterKey || config.anthropicKey);
export const aiProvider = () => (config.openrouterKey ? "openrouter" : config.anthropicKey ? "anthropic" : null);
