import { promises as fs } from "fs";
import * as path from "path";
import { config } from "../../config.js";
import { logger } from "../../utils/logger.js";

export async function saveFileLocally(buffer: Buffer, filename: string): Promise<string> {
  const uploadDir = config.files.uploadDir;
  await fs.mkdir(uploadDir, { recursive: true });

  const timestamp = Date.now();
  const safeName = filename.replace(/[^a-zA-Z0-9._-]/g, "_");
  const localFilename = `${timestamp}_${safeName}`;
  const localPath = path.join(uploadDir, localFilename);

  await fs.writeFile(localPath, buffer);
  logger.info(`[FileSave] Saved ${buffer.length} bytes to ${localPath}`);

  return localPath;
}

export function isUploadSizeAllowed(fileSize: number | undefined): boolean {
  if (!fileSize) {
    return true; // Unknown size — allow, will be checked on download
  }

  const maxBytes = config.files.uploadMaxSizeMb * 1024 * 1024;
  return fileSize <= maxBytes;
}
