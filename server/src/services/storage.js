import fs from "node:fs/promises";
import path from "node:path";
import { config } from "../config.js";

/**
 * Драйвер хранилища. Локальный диск для разработки, S3-совместимый (Cloudflare
 * R2 и т.п.) — для прода, где диск контейнера эфемерный. Роуты работают только
 * с key, поэтому переезд на S3 не трогает бизнес-логику.
 */
const localRoot = path.resolve(process.cwd(), config.storage.path);

let s3Client = null;
async function getS3Client() {
  if (s3Client) return s3Client;
  const { S3Client } = await import("@aws-sdk/client-s3");
  s3Client = new S3Client({
    region: "auto",
    endpoint: config.storage.s3.endpoint,
    credentials: {
      accessKeyId: config.storage.s3.key,
      secretAccessKey: config.storage.s3.secret,
    },
  });
  return s3Client;
}

async function streamToBuffer(stream) {
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export const storage = {
  async put(key, buffer) {
    if (config.storage.driver === "s3") return putS3(key, buffer);
    const full = path.join(localRoot, key);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, buffer);
    return key;
  },

  async get(key) {
    if (config.storage.driver === "s3") return getS3(key);
    return fs.readFile(path.join(localRoot, key));
  },

  async remove(key) {
    if (config.storage.driver === "s3") return removeS3(key);
    await fs.rm(path.join(localRoot, key), { force: true });
  },

  buildKey(userId, submissionId, variant = "orig") {
    const d = new Date();
    const yyyy = d.getFullYear();
    const mm = String(d.getMonth() + 1).padStart(2, "0");
    return `${yyyy}/${mm}/${userId}/${submissionId}-${variant}.jpg`;
  },
};

async function putS3(key, buffer) {
  const { PutObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  await client.send(
    new PutObjectCommand({
      Bucket: config.storage.s3.bucket,
      Key: key,
      Body: buffer,
      ContentType: "image/jpeg",
    })
  );
  return key;
}

async function getS3(key) {
  const { GetObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  const res = await client.send(
    new GetObjectCommand({ Bucket: config.storage.s3.bucket, Key: key })
  );
  return streamToBuffer(res.Body);
}

async function removeS3(key) {
  const { DeleteObjectCommand } = await import("@aws-sdk/client-s3");
  const client = await getS3Client();
  await client.send(
    new DeleteObjectCommand({ Bucket: config.storage.s3.bucket, Key: key })
  );
}
