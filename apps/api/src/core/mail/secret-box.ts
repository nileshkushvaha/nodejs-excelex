import { createCipheriv, createDecipheriv, randomBytes } from "node:crypto";

/**
 * Secrets at rest: AES-256-GCM under one deployment key.
 *
 * A client's SMTP password has to be stored — the job that sends their mail
 * needs it — and must not be readable by anyone with a database dump. GCM
 * gives confidentiality and integrity in one primitive; the random IV per
 * value means two identical passwords do not look identical; the version
 * byte in front means the key or the algorithm can be rotated later
 * without a flag day, because each value says how it was sealed.
 *
 * Wire form: `v1:<iv b64>:<tag b64>:<ciphertext b64>`.
 */
const VERSION = "v1";

export class SecretBox {
  private readonly key: Buffer;

  constructor(keyBase64: string) {
    this.key = Buffer.from(keyBase64, "base64");
    if (this.key.length !== 32) {
      throw new Error("SECRETS_KEY must decode to exactly 32 bytes (openssl rand -base64 32).");
    }
  }

  seal(plaintext: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    const body = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
    const tag = cipher.getAuthTag();
    return [VERSION, iv.toString("base64"), tag.toString("base64"), body.toString("base64")].join(":");
  }

  open(sealed: string): string {
    const [version, iv, tag, body] = sealed.split(":");
    if (version !== VERSION || !iv || !tag || !body) {
      throw new Error("Sealed value is not in a form this key can open.");
    }
    const decipher = createDecipheriv("aes-256-gcm", this.key, Buffer.from(iv, "base64"));
    decipher.setAuthTag(Buffer.from(tag, "base64"));
    return Buffer.concat([decipher.update(Buffer.from(body, "base64")), decipher.final()]).toString("utf8");
  }
}
