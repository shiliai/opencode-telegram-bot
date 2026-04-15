import { describe, expect, it } from "vitest";
import { convertMarkdownToTelegram } from "../../src/summary/telegram-markdown-converter.js";

describe("summary/telegram-markdown-converter", () => {
  describe("convertMarkdownToTelegram", () => {
    it("converts headings to bold", () => {
      const result = convertMarkdownToTelegram("# Hello");
      expect(result).toContain("*Hello*");
    });

    it("converts bold and italic", () => {
      const result = convertMarkdownToTelegram("**bold** and *italic*");
      expect(result).toContain("*bold*");
      expect(result).toContain("_italic_");
    });

    it("converts strikethrough", () => {
      const result = convertMarkdownToTelegram("~~deleted~~");
      expect(result).toContain("~deleted~");
    });

    it("converts inline code", () => {
      const result = convertMarkdownToTelegram("use `const`");
      expect(result).toContain("`const`");
    });

    it("converts code blocks", () => {
      const result = convertMarkdownToTelegram("```ts\nconst x = 1;\n```");
      expect(result).toContain("```\nconst x = 1;\n```");
    });

    it("converts links", () => {
      const result = convertMarkdownToTelegram("[example](https://example.com)");
      expect(result).toContain("[example](https://example.com)");
    });

    it("handles already-encoded URLs without throwing", () => {
      const result = convertMarkdownToTelegram("[link](https://example.com/path%20with%20spaces)");
      expect(result).toContain("[link](");
    });

    it("handles malformed percent-escapes in URLs without throwing", () => {
      const result = convertMarkdownToTelegram("[link](https://example.com/path%ZZ)");
      expect(result).toContain("[link](");
    });

    it("converts tables to bullet list format", () => {
      const result = convertMarkdownToTelegram("| A | B |\n| --- | --- |\n| 1 | 2 |");
      expect(result).toContain("• A: 1");
      expect(result).toContain("B: 2");
    });

    it("escapes pipe characters in table output", () => {
      const result = convertMarkdownToTelegram("| A | B |\n| --- | --- |\n| 1 | 2 |");
      expect(result).toContain("\\|");
    });

    it("handles empty tables", () => {
      const result = convertMarkdownToTelegram("| A |\n| --- |");
      expect(result.trim()).toBe("");
    });

    it("converts lists", () => {
      const result = convertMarkdownToTelegram("- item one\n- item two");
      expect(result).toContain("•   item one");
      expect(result).toContain("•   item two");
    });

    it("converts blockquotes", () => {
      const result = convertMarkdownToTelegram("> quoted text");
      expect(result).toContain("> quoted text");
    });

    it("handles underline HTML tags", () => {
      const result = convertMarkdownToTelegram("<u>underlined</u>");
      expect(result).toContain("__underlined__");
    });

    it("handles spoiler HTML tags", () => {
      const result = convertMarkdownToTelegram('<span class="tg-spoiler">hidden</span>');
      expect(result).toContain("||hidden||");
    });

    it("handles multiline underline HTML tags", () => {
      const result = convertMarkdownToTelegram("<u>line one\nline two</u>");
      expect(result).toContain("__line one\nline two__");
    });

    it("handles multiline spoiler HTML tags", () => {
      const result = convertMarkdownToTelegram(
        '<span class="tg-spoiler">line one\nline two</span>',
      );
      expect(result).toContain("||line one\nline two||");
    });

    it("does not break on multiple placeholders in same message", () => {
      const result = convertMarkdownToTelegram("<u>first</u> and <u>second</u>");
      expect(result).toContain("__first__");
      expect(result).toContain("__second__");
    });

    it("escapes reserved MarkdownV2 characters in text", () => {
      const result = convertMarkdownToTelegram("hello_world *bold* [link]");
      expect(result).toContain("hello\\_world");
      expect(result).toContain("\\[link\\]");
    });
  });
});
