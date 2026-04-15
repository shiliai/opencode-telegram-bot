import type { Context } from "grammy";
import { config } from "../../config.js";
import { processUserPrompt, type ProcessPromptDeps } from "./prompt.js";
import {
  downloadTelegramFile,
  toDataUri,
  isTextMimeType,
  isFileSizeAllowed,
} from "../utils/file-download.js";
import { saveFileLocally, isUploadSizeAllowed } from "../utils/file-save.js";
import { getModelCapabilities, supportsInput } from "../../model/capabilities.js";
import { getStoredModel } from "../../model/manager.js";
import { getCurrentProject } from "../../settings/manager.js";
import { logger } from "../../utils/logger.js";
import { t } from "../../i18n/index.js";
import type { FilePartInput, Model } from "@opencode-ai/sdk/v2";

export interface DocumentHandlerDeps extends ProcessPromptDeps {
  downloadFile?: (
    api: Context["api"],
    fileId: string,
  ) => Promise<{ buffer: Buffer; filePath: string }>;
  getModelCapabilities?: (
    providerId: string,
    modelId: string,
  ) => Promise<Model["capabilities"] | null>;
  getStoredModel?: () => { providerID: string; modelID: string };
  processPrompt?: (
    ctx: Context,
    text: string,
    deps: ProcessPromptDeps,
    fileParts?: FilePartInput[],
  ) => Promise<boolean>;
  saveFile?: (buffer: Buffer, filename: string) => Promise<string>;
  getCurrentProject?: () => { worktree: string } | undefined;
}

export async function handleDocumentMessage(
  ctx: Context,
  deps: DocumentHandlerDeps,
): Promise<void> {
  const downloadFile = deps.downloadFile ?? downloadTelegramFile;
  const getCapabilities = deps.getModelCapabilities ?? getModelCapabilities;
  const getStored = deps.getStoredModel ?? getStoredModel;
  const processPrompt = deps.processPrompt ?? processUserPrompt;
  const saveFile = deps.saveFile ?? saveFileLocally;
  const getProject = deps.getCurrentProject ?? getCurrentProject;

  const doc = ctx.message?.document;
  if (!doc) {
    return;
  }

  if (!getProject()) {
    await ctx.reply(t("bot.project_not_selected"));
    return;
  }

  const caption = ctx.message.caption || "";
  const mimeType = doc.mime_type || "";
  const filename = doc.file_name || "document";

  try {
    if (isTextMimeType(mimeType)) {
      if (!isFileSizeAllowed(doc.file_size, config.files.maxFileSizeKb)) {
        logger.warn(
          `[Document] Text file too large: ${filename} (${doc.file_size} bytes > ${config.files.maxFileSizeKb}KB)`,
        );
        await ctx.reply(
          t("bot.text_file_too_large", { maxSizeKb: String(config.files.maxFileSizeKb) }),
        );
        return;
      }

      await ctx.reply(t("bot.file_downloading"));
      const downloadedFile = await downloadFile(ctx.api, doc.file_id);

      const textContent = downloadedFile.buffer.toString("utf-8");

      const promptWithFile = `--- Content of ${filename} ---\n${textContent}\n--- End of file ---\n\n${caption}`;

      logger.info(
        `[Document] Sending text file (${downloadedFile.buffer.length} bytes, ${filename}) as prompt`,
      );

      await processPrompt(ctx, promptWithFile, deps);
      return;
    }

    if (!isUploadSizeAllowed(doc.file_size)) {
      logger.warn(
        `[Document] File too large: ${filename} (${doc.file_size} bytes > ${config.files.uploadMaxSizeMb}MB)`,
      );
      await ctx.reply(
        t("bot.file_upload_too_large", {
          maxSizeMb: String(config.files.uploadMaxSizeMb),
        }),
      );
      return;
    }

    await ctx.reply(t("bot.file_downloading"));
    const downloadedFile = await downloadFile(ctx.api, doc.file_id);
    const localPath = await saveFile(downloadedFile.buffer, filename);

    const fileParts: FilePartInput[] = [];

    if (mimeType === "application/pdf") {
      const storedModel = getStored();
      const capabilities = await getCapabilities(storedModel.providerID, storedModel.modelID);

      if (supportsInput(capabilities, "pdf")) {
        const dataUri = toDataUri(downloadedFile.buffer, mimeType);
        fileParts.push({
          type: "file",
          mime: mimeType,
          filename,
          url: dataUri,
        });
      }
    }

    const promptText = caption
      ? `User uploaded file: ${localPath}\n${caption}`
      : `User uploaded file: ${localPath}`;

    logger.info(
      `[Document] Saved ${filename} (${downloadedFile.buffer.length} bytes) to ${localPath}`,
    );

    await processPrompt(ctx, promptText, deps, fileParts);
  } catch (err) {
    logger.error("[Document] Error handling document message:", err);
    await ctx.reply(t("bot.file_download_error"));
  }
}
