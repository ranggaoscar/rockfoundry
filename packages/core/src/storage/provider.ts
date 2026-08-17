import * as crypto from "node:crypto";
import * as fs from "node:fs/promises";
import * as path from "node:path";

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

export class LocalStorageProvider implements StorageProvider {
  private readonly basePath: string;
  private initialized = false;

  constructor(
    basePath = path.resolve(
      process.env.ROCKFOUNDRY_EXPORTS_DIR || path.join("data", "exports"),
    ),
  ) {
    this.basePath = basePath;
  }

  private async ensureDirectory() {
    if (this.initialized) return;
    await fs.mkdir(this.basePath, { recursive: true });
    this.initialized = true;
  }

  private safePath(key: string) {
    const safeKey = key.replace(/[^a-zA-Z0-9._/-]/g, "_");
    const resolvedBase = path.resolve(this.basePath);
    const resolvedPath = path.resolve(this.basePath, safeKey);
    if (
      resolvedPath !== resolvedBase &&
      !resolvedPath.startsWith(`${resolvedBase}${path.sep}`)
    )
      throw new Error("Path traversal detected");
    return resolvedPath;
  }

  async store(
    key: string,
    buffer: Buffer,
    projectId: string,
  ): Promise<StoredFile> {
    await this.ensureDirectory();
    const filePath = this.safePath(key);
    await fs.mkdir(path.dirname(filePath), { recursive: true });
    await fs.writeFile(filePath, buffer);
    const now = new Date();
    return {
      id: key,
      projectId,
      stateRevision: 1,
      filePath,
      size: buffer.length,
      checksum: crypto.createHash("sha256").update(buffer).digest("hex"),
      createdAt: now,
      expiresAt: new Date(now.getTime() + 24 * 60 * 60 * 1000),
      status: "active",
    };
  }

  async retrieve(key: string) {
    try {
      return await fs.readFile(this.safePath(key));
    } catch {
      return null;
    }
  }

  async delete(key: string) {
    try {
      await fs.unlink(this.safePath(key));
      return true;
    } catch {
      return false;
    }
  }

  async cleanup() {
    await this.ensureDirectory();
    const entries = await fs.readdir(this.basePath, { withFileTypes: true });
    const expiry = Date.now() - 24 * 60 * 60 * 1000;
    let cleaned = 0;
    for (const entry of entries) {
      if (!entry.isFile()) continue;
      const filePath = this.safePath(entry.name);
      try {
        const stats = await fs.stat(filePath);
        if (stats.mtimeMs < expiry) {
          await fs.unlink(filePath);
          cleaned += 1;
        }
      } catch {
        // A concurrently removed file is already cleaned up.
      }
    }
    return cleaned;
  }

  async generateSignedUrl(key: string) {
    return `/api/exports/download/${encodeURIComponent(key)}`;
  }
}

export function createStorageProvider(basePath?: string) {
  return new LocalStorageProvider(basePath);
}
