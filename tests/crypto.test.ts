import { describe, expect, it } from "vitest";
import { decryptJson, deriveKey, encryptJson, maskValue, safeEqual } from "../lib/crypto";

const SECRET = "correct horse battery staple 2026";

describe("AES-256-GCM settings encryption", () => {
  it("round-trips structured settings", () => {
    const value = { refreshToken: "refresh-abc", nested: { array: [1, 2, 3] } };
    const envelope = encryptJson(value, SECRET);
    expect(envelope.v).toBe(1);
    expect(envelope.data).not.toContain("refresh-abc");
    expect(decryptJson(envelope, SECRET)).toEqual(value);
  });

  it("uses a fresh salt and IV for each write", () => {
    const a = encryptJson({ a: 1 }, SECRET);
    const b = encryptJson({ a: 1 }, SECRET);
    expect(a.salt).not.toBe(b.salt);
    expect(a.iv).not.toBe(b.iv);
    expect(a.data).not.toBe(b.data);
  });

  it("rejects a wrong secret", () => {
    const envelope = encryptJson({ secret: "x" }, SECRET);
    try {
      decryptJson(envelope, "a completely different secret");
      throw new Error("expected decryption to fail");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFIG" });
      expect(String((error as { detail?: string }).detail)).toMatch(/could not be decrypted/i);
    }
  });

  it("detects tampering", () => {
    const envelope = encryptJson({ secret: "x" }, SECRET);
    const tampered = { ...envelope, data: Buffer.from("tampered").toString("base64") };
    expect(() => decryptJson(tampered, SECRET)).toThrow();
  });

  it("rejects short APP_SECRET values", () => {
    try {
      deriveKey("too-short", Buffer.alloc(16));
      throw new Error("expected a short secret to be rejected");
    } catch (error) {
      expect(error).toMatchObject({ code: "CONFIG" });
      expect(String((error as { detail?: string }).detail)).toMatch(/at least 16/i);
    }
  });

  it("masks secrets without revealing the value", () => {
    const masked = maskValue("shhh-this-is-a-long-token-1234");
    expect(masked.isSet).toBe(true);
    expect(masked.masked).toContain("1234");
    expect(masked.masked).not.toContain("shhh");
    expect(maskValue("")).toEqual({ isSet: false, masked: "" });
    expect(maskValue("ab").masked).not.toContain("ab");
  });

  it("compares passwords in constant time", () => {
    expect(safeEqual("hello", "hello")).toBe(true);
    expect(safeEqual("hello", "hellp")).toBe(false);
  });
});
