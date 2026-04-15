import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("fs", () => ({
  promises: {
    mkdir: vi.fn().mockResolvedValue(undefined),
    writeFile: vi.fn().mockResolvedValue(undefined),
  },
}));

import { promises as fs } from "fs";
import { saveFileLocally, isUploadSizeAllowed } from "../../../src/bot/utils/file-save.js";

describe("bot/utils/file-save", () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  describe("saveFileLocally", () => {
    it("creates upload dir and writes file with timestamp prefix", async () => {
      const buffer = Buffer.from("test data");
      const result = await saveFileLocally(buffer, "report.pdf");

      expect(fs.mkdir).toHaveBeenCalledWith(expect.any(String), {
        recursive: true,
      });
      expect(fs.writeFile).toHaveBeenCalledWith(expect.stringContaining("report.pdf"), buffer);
      expect(result).toMatch(/\d+_report\.pdf$/);
    });

    it("sanitizes special characters in filename", async () => {
      const buffer = Buffer.from("data");
      const result = await saveFileLocally(buffer, "my file (1).pdf");

      expect(result).toMatch(/my_file__1_\.pdf$/);
    });
  });

  describe("isUploadSizeAllowed", () => {
    it("returns true for undefined size", () => {
      expect(isUploadSizeAllowed(undefined)).toBe(true);
    });

    it("returns true for file within limit", () => {
      expect(isUploadSizeAllowed(10 * 1024 * 1024)).toBe(true);
    });

    it("returns true for file at exact limit", () => {
      expect(isUploadSizeAllowed(20 * 1024 * 1024)).toBe(true);
    });

    it("returns false for file exceeding limit", () => {
      expect(isUploadSizeAllowed(25 * 1024 * 1024)).toBe(false);
    });
  });
});
