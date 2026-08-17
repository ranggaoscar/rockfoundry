import * as fs from "fs/promises";
import * as path from "path";
import * as crypto from "crypto";

export interface StoredFile {
  id: string;
  projectId: string;
  stateRevision: number;
  filePath: string;
  size: number;
  checksum: string;
  createdAt: Date;
  expiresAt: Date;
  status: "active" | "expired" | "regenerating";
}

export interface StorageProvider {
  store(key: string, buffer: Buffer, projectId: string): Promise<StoredFile>;
  retrieve(key: string): Promise<Buffer | null>;
  delete(key: string): Promise<boolean>;
  cleanup(): Promise<number>;
  generateSignedUrl(key: string): Promise<string>;
}

// ── Local Filesystem Adapter ───────────────────────────────────

export class LocalStorageProvider implements StorageProvider {
  private basePath: string;
  private initialized = false;

  constructor(basePath: string = "./data/exports") {
    this.basePath = path.resolve(basePath);
  }

  private async ensureDirectory(): Promise<void> {
    if (this.initialized) return;
    await fs.mkdir(this.basePath, { recursive: true });
    this.initialized = true;
  }

  private sanitizeFileName(name: string): string {
    // Prevent path traversal
    return name.replace(/[^a-zA-Z0-9._-]/g, "_");
  }

  private verifyPath(filePath: string): void {
    const resolvedPath = path.resolve(filePath);
    const resolvedBase = path.resolve(this.basePath);
    if (!resolvedPath.startsWith(resolvedBase)) {
      throw new Error("Path traversal detected");
    }
  }

  async store(
    key: string,
    buffer: Buffer,
    projectId: string,
  ): Promise<StoredFile> {
    await this.ensureDirectory();

    const safeKey = this.sanitizeFileName(key);
    const filePath = path.join(this.basePath, safeKey);

    this.verifyPath(filePath);

    await fs.writeFile(filePath, buffer);

    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    return {
      id: safeKey,
      projectId,
      stateRevision: 1,
      filePath: safeKey,
      size: buffer.length,
      checksum,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "active",
    };
  }

  async retrieve(key: string): Promise<Buffer | null> {
    const safeKey = this.sanitizeFileName(key);
    const filePath = path.join(this.basePath, safeKey);

    this.verifyPath(filePath);

    try {
      return await fs.readFile(filePath);
    } catch {
      return null;
    }
  }

  async delete(key: string): Promise<boolean> {
    const safeKey = this.sanitizeFileName(key);
    const filePath = path.join(this.basePath, safeKey);

    this.verifyPath(filePath);

    try {
      await fs.unlink(filePath);
      return true;
    } catch {
      return false;
    }
  }

  async cleanup(): Promise<number> {
    await this.ensureDirectory();

    const files = await fs.readdir(this.basePath);
    let cleaned = 0;
    const now = Date.now();

    for (const file of files) {
      const filePath = path.join(this.basePath, file);
      this.verifyPath(filePath);

      try {
        const stats = await fs.stat(filePath);
        const age = now - stats.mtimeMs;
        if (age > 24 * 60 * 60 * 1000) {
          await fs.unlink(filePath);
          cleaned++;
        }
      } catch {
        // Skip files we can't stat or delete
      }
    }

    return cleaned;
  }

  async generateSignedUrl(key: string): Promise<string> {
    const safeKey = this.sanitizeFileName(key);
    return `/api/exports/download/${safeKey}`;
  }
}

// ── S3-Compatible Adapter ──────────────────────────────────────

export class S3StorageProvider implements StorageProvider {
  constructor(
    private readonly bucket: string,
    private readonly region: string,
    private readonly accessKeyId: string,
    private readonly secretAccessKey: string,
    private readonly endpoint?: string,
  ) {}

  async store(
    key: string,
    buffer: Buffer,
    projectId: string,
  ): Promise<StoredFile> {
    const checksum = crypto.createHash("sha256").update(buffer).digest("hex");

    // TODO: Implement S3 upload with @aws-sdk/client-s3
    // const command = new PutObjectCommand({
    //   Bucket: this.bucket,
    //   Key: key,
    //   Body: buffer,
    // });
    // await s3Client.send(command);

    return {
      id: key,
      projectId,
      stateRevision: 1,
      filePath: key,
      size: buffer.length,
      checksum,
      createdAt: new Date(),
      expiresAt: new Date(Date.now() + 24 * 60 * 60 * 1000),
      status: "active",
    };
  }

  async retrieve(key: string): Promise<Buffer | null> {
    // TODO: Implement S3 retrieval
    return null;
  }

  async delete(key: string): Promise<boolean> {
    // TODO: Implement S3 deletion
    return true;
  }

  async cleanup(): Promise<number> {
    // TODO: Implement S3 lifecycle management
    return 0;
  }

  async generateSignedUrl(key: string): Promise<string> {
    // TODO: Implement S3 signed URL generation
    return `/api/exports/download/${key}`;
  }
}

// ── Factory ───────────────────────────────────────────────────

export function createStorageProvider(): StorageProvider {
  const provider = process.env.STORAGE_PROVIDER || "local";

  if (provider === "s3") {
    return new S3StorageProvider(
      process.env.S3_BUCKET || "rockfoundry-exports",
      process.env.S3_REGION || "us-east-1",
      process.env.S3_ACCESS_KEY_ID || "",
      process.env.S3_SECRET_ACCESS_KEY || "",
      process.env.S3_ENDPOINT,
    );
  }

  return new LocalStorageProvider(
    process.env.STORAGE_LOCAL_PATH || "./data/exports",
  );
}
