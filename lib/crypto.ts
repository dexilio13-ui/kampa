import { createCipheriv, createDecipheriv, randomBytes, scryptSync, timingSafeEqual, createHash, createHmac } from "node:crypto";
import { AppError } from "./errors";

const VERSION = 1;
const KEY_LEN = 32;
const IV_LEN = 12;

export interface EncryptedEnvelope {
  v: number;
  salt: string;
  iv: string;
  tag: string;
  data: string;
}

export function deriveKey(appSecret: string, salt: Buffer): Buffer {
  if (!appSecret || appSecret.length < 16) {
    throw new AppError("CONFIG", {
      detail: "APP_SECRET must be at least 16 characters.",
    });
  }
  return scryptSync(appSecret, salt, KEY_LEN);
}

export function encryptJson(value: unknown, appSecret: string): EncryptedEnvelope {
  const salt = randomBytes(16);
  const iv = randomBytes(IV_LEN);
  const key = deriveKey(appSecret, salt);
  const cipher = createCipheriv("aes-256-gcm", key, iv);
  const plaintext = Buffer.from(JSON.stringify(value), "utf8");
  const data = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: VERSION,
    salt: salt.toString("base64"),
    iv: iv.toString("base64"),
    tag: tag.toString("base64"),
    data: data.toString("base64"),
  };
}

export function decryptJson<T = unknown>(envelope: EncryptedEnvelope, appSecret: string): T {
  try {
    if (!envelope || envelope.v !== VERSION) throw new Error("Unsupported envelope version.");
    const salt = Buffer.from(envelope.salt, "base64");
    const iv = Buffer.from(envelope.iv, "base64");
    const tag = Buffer.from(envelope.tag, "base64");
    const data = Buffer.from(envelope.data, "base64");
    const key = deriveKey(appSecret, salt);
    const decipher = createDecipheriv("aes-256-gcm", key, iv);
    decipher.setAuthTag(tag);
    const plaintext = Buffer.concat([decipher.update(data), decipher.final()]);
    return JSON.parse(plaintext.toString("utf8")) as T;
  } catch (error) {
    if (error instanceof AppError) throw error;
    throw new AppError("CONFIG", {
      detail: "Stored settings could not be decrypted. APP_SECRET may have changed.",
    });
  }
}

export function maskValue(value: string | undefined): { isSet: boolean; masked: string } {
  if (!value) return { isSet: false, masked: "" };
  const visible = value.length <= 4 ? "••••" : value.slice(-4);
  return { isSet: true, masked: `••••••••${visible}` };
}

export function safeEqual(a: string, b: string): boolean {
  const left = createHash("sha256").update(a).digest();
  const right = createHash("sha256").update(b).digest();
  return timingSafeEqual(left, right);
}

export function signPayload(payload: string, secret: string): string {
  return createHmac("sha256", secret).update(payload).digest("base64url");
}
