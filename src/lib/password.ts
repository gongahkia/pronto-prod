import { randomBytes, scrypt as scryptCallback, timingSafeEqual } from "node:crypto";
import { promisify } from "node:util";

const scrypt = promisify(scryptCallback);
const KEY_LENGTH = 64;

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(16).toString("base64url");
  const key = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  return `scrypt$${salt}$${key.toString("base64url")}`;
}

export async function verifyPassword(
  password: string,
  encodedHash: string,
): Promise<boolean> {
  const [scheme, salt, storedKey] = encodedHash.split("$");
  if (scheme !== "scrypt" || !salt || !storedKey) {
    return false;
  }

  const actualKey = (await scrypt(password, salt, KEY_LENGTH)) as Buffer;
  const expectedKey = Buffer.from(storedKey, "base64url");

  return (
    actualKey.length === expectedKey.length &&
    timingSafeEqual(actualKey, expectedKey)
  );
}

