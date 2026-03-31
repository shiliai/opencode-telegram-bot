import type {
  Blockquote,
  Code,
  Definition as MdastDefinition,
  Delete,
  Emphasis,
  Heading,
  HTML,
  Image,
  ImageReference,
  InlineCode,
  Link,
  LinkReference,
  List,
  ListItem,
  Parents,
  Strong,
  Table,
  Text,
} from "mdast";
import {
  defaultHandlers,
  type Info,
  type Options as MarkdownOptions,
  type State,
} from "mdast-util-to-markdown";
import { toString as mdastToString } from "mdast-util-to-string";
import { remark } from "remark";
import remarkGfm from "remark-gfm";
import remarkRemoveComments from "remark-remove-comments";
import remarkStringify from "remark-stringify";
import type { Node } from "unist";
import { remove } from "unist-util-remove";
import { visit } from "unist-util-visit";

type UnsupportedTagsStrategy = "escape" | "remove" | "keep";
type TextType = "text" | "code" | "link";

interface Definition {
  title: string | null;
  url: string;
}

type DefinitionsRecord = Record<string, Definition>;

function wrap(text: string, ...wrappers: string[]): string {
  return [...wrappers, text, ...wrappers.reverse()].join("");
}

function isUrl(value: string): boolean {
  try {
    return Boolean(new URL(value));
  } catch {
    return false;
  }
}

function escapeSymbols(text: string, textType: TextType = "text"): string {
  if (!text) {
    return text;
  }

  switch (textType) {
    case "code":
      return text.replace(/\\/g, "\\\\").replace(/`/g, "\\`");

    case "link": {
      let escaped = text.replace(/\\/g, "\\\\").replace(/\)/g, "\\)").replace(/\(/g, "\\(");
      if (text.startsWith("tg://")) {
        escaped = escaped.replace(/\?/g, "\\?").replace(/=/g, "\\=");
      }

      return escaped;
    }

    default:
      return text
        .replace(/\\/g, "\\\\")
        .replace(/_/g, "\\_")
        .replace(/\*/g, "\\*")
        .replace(/\[/g, "\\[")
        .replace(/\]/g, "\\]")
        .replace(/\(/g, "\\(")
        .replace(/\)/g, "\\)")
        .replace(/~/g, "\\~")
        .replace(/`/g, "\\`")
        .replace(/>/g, "\\>")
        .replace(/#/g, "\\#")
        .replace(/\+/g, "\\+")
        .replace(/-/g, "\\-")
        .replace(/=/g, "\\=")
        .replace(/\|/g, "\\|")
        .replace(/{/g, "\\{")
        .replace(/}/g, "\\}")
        .replace(/\./g, "\\.")
        .replace(/!/g, "\\!");
  }
}

function processUnsupportedTags(content: string, strategy: UnsupportedTagsStrategy): string {
  switch (strategy) {
    case "escape":
      return escapeSymbols(content);
    case "remove":
      return "";
    case "keep":
    default:
      return content;
  }
}

function renderChildren(node: Parents, state: State, info: Info): string {
  let result = "";
  for (const child of node.children) {
    result += state.handle(child, node, state, info);
  }
  return result;
}

function collectDefinitions(definitions: DefinitionsRecord): (tree: Node) => void {
  return (tree: Node) => {
    visit(tree, "definition", (node) => {
      const definitionNode = node as MdastDefinition;
      definitions[definitionNode.identifier] = {
        title: definitionNode.title ?? null,
        url: definitionNode.url,
      };
    });
  };
}

function removeDefinitions(): (tree: Node) => void {
  return (tree: Node) => {
    remove(tree, { cascade: true }, "definition");
  };
}

function handleHeading(
  node: Heading,
  _parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const marker = "*";
  const exit = state.enter("headingAtx");
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
}

function handleStrong(
  node: Strong,
  _parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const marker = "*";
  const exit = state.enter("strong");
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
}

function handleDelete(
  node: Delete,
  _parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const marker = "~";
  const exit = state.enter("strikethrough" as Parameters<typeof state.enter>[0]);
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
}

function handleEmphasis(
  node: Emphasis,
  _parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const marker = "_";
  const exit = state.enter("emphasis");
  const value = renderChildren(node, state, {
    ...info,
    before: marker,
    after: marker,
  });
  exit();
  return wrap(value, marker);
}

function handleText(node: Text, _parent: Parents | undefined, state: State, _info: Info): string {
  const exit = state.enter("phrasing");
  const text = node.value;
  exit();
  return escapeSymbols(text);
}

function handleInlineCode(
  node: InlineCode,
  _parent: Parents | undefined,
  state: State,
  _info: Info,
): string {
  const exit = state.enter("paragraph");
  const value = escapeSymbols(node.value, "code");
  exit();
  return `\`${value}\``;
}

function handleCode(node: Code, _parent: Parents | undefined, state: State, _info: Info): string {
  const exit = state.enter("codeFenced");
  const content = node.value.replace(/^#![a-z]+\n/, "");
  const escapedContent = escapeSymbols(content, "code");
  exit();
  return wrap(escapedContent, "```", "\n");
}

function handleLink(node: Link, _parent: Parents | undefined, state: State, info: Info): string {
  const exit = state.enter("link");
  const text =
    renderChildren(node, state, { ...info, before: "[", after: "]" }) ||
    (node.title ? escapeSymbols(node.title) : "");
  let isUrlEncoded = false;
  try {
    isUrlEncoded = decodeURI(node.url) !== node.url;
  } catch {
    isUrlEncoded = false;
  }
  const url = isUrlEncoded ? node.url : encodeURI(node.url);
  exit();

  if (!isUrl(url)) {
    return text || escapeSymbols(url);
  }

  if (text) {
    return `[${text}](${escapeSymbols(url, "link")})`;
  }

  return `[${escapeSymbols(url)}](${escapeSymbols(url, "link")})`;
}

function handleLinkReference(definitions: DefinitionsRecord) {
  return (node: LinkReference, _parent: Parents | undefined, state: State, info: Info): string => {
    const exit = state.enter("linkReference");
    const definition = definitions[node.identifier];
    const text =
      renderChildren(node, state, { ...info, before: "[", after: "]" }) || definition?.title || "";
    exit();

    if (!definition || !isUrl(definition.url)) {
      return escapeSymbols(text);
    }

    if (text) {
      return `[${text}](${escapeSymbols(definition.url, "link")})`;
    }

    return `[${escapeSymbols(definition.url)}](${escapeSymbols(definition.url, "link")})`;
  };
}

function handleImage(node: Image, _parent: Parents | undefined, state: State, _info: Info): string {
  const exit = state.enter("image");
  const text = node.alt || node.title || "";
  const url = node.url;
  exit();

  if (!isUrl(url)) {
    return escapeSymbols(text) || escapeSymbols(url);
  }

  if (text) {
    return `[${escapeSymbols(text)}](${escapeSymbols(url, "link")})`;
  }

  return `[${escapeSymbols(url)}](${escapeSymbols(url, "link")})`;
}

function handleImageReference(definitions: DefinitionsRecord) {
  return (
    node: ImageReference,
    _parent: Parents | undefined,
    state: State,
    _info: Info,
  ): string => {
    const exit = state.enter("imageReference");
    const definition = definitions[node.identifier];
    const text = node.alt || definition?.title || "";
    exit();

    if (!definition || !isUrl(definition.url)) {
      return escapeSymbols(text);
    }

    if (text) {
      return `[${escapeSymbols(text)}](${escapeSymbols(definition.url, "link")})`;
    }

    return `[${escapeSymbols(definition.url)}](${escapeSymbols(definition.url, "link")})`;
  };
}

function handleList(node: List, parent: Parents | undefined, state: State, info: Info): string {
  const result = defaultHandlers.list(node, parent, state, info);
  let processed = result.replace(/^(\d+)\./gm, "$1\\.");

  const siblingIndex = parent?.children.findIndex((child) => child === node) ?? -1;
  const nextSibling = siblingIndex >= 0 ? parent?.children[siblingIndex + 1] : undefined;
  if (nextSibling?.type === "code") {
    processed += "\n";
  }

  return processed;
}

function handleListItem(
  node: ListItem,
  parent: Parents | undefined,
  state: State,
  info: Info,
): string {
  const result = defaultHandlers.listItem(node, parent, state, info);
  let processed = result;
  processed = processed.replace(/^(\s*)\*\s*/gm, "$1•   ");
  processed = processed.replace(/^(\s*)(\d+\.) /gm, "$1$2  ");
  processed = processed.replace(/^(\s*)(\d+\\\.) /gm, "$1$2  ");

  return processed;
}

function handleBlockquote(unsupportedTagsStrategy: UnsupportedTagsStrategy) {
  return (node: Blockquote, _parent: Parents | undefined, state: State, info: Info): string => {
    const exit = state.enter("blockquote");
    const content = renderChildren(node, state, info);
    exit();

    const lines = content.split("\n").filter((line) => line.trim());
    const quotedLines = lines.map((line) => `> ${line}`);
    return processUnsupportedTags(quotedLines.join("\n"), unsupportedTagsStrategy);
  };
}

function handleHtml(unsupportedTagsStrategy: UnsupportedTagsStrategy) {
  return (node: HTML): string => {
    return processUnsupportedTags(node.value, unsupportedTagsStrategy);
  };
}

function handleTable(unsupportedTagsStrategy: UnsupportedTagsStrategy) {
  return (node: Table): string => {
    const rows = node.children.map((row) => row.children.map((cell) => mdastToString(cell).trim()));

    if (rows.length < 2) {
      return processUnsupportedTags("", unsupportedTagsStrategy);
    }

    const headers = rows[0] ?? [];
    const dataRows = rows.slice(1);

    const formattedLines: string[] = [];

    for (const row of dataRows) {
      const rowItems: string[] = [];
      for (let colIndex = 0; colIndex < headers.length; colIndex++) {
        const header = headers[colIndex] ?? "";
        const cellValue = row[colIndex] ?? "";
        if (header && cellValue) {
          rowItems.push(`${escapeSymbols(header)}: ${escapeSymbols(cellValue)}`);
        } else if (cellValue) {
          rowItems.push(escapeSymbols(cellValue));
        }
      }
      if (rowItems.length > 0) {
        formattedLines.push(`• ${rowItems.join(" \\| ")}`);
      }
    }

    return processUnsupportedTags(`${formattedLines.join("\n")}\n`, unsupportedTagsStrategy);
  };
}

function createMarkdownOptions(
  definitions: DefinitionsRecord,
  unsupportedTagsStrategy: UnsupportedTagsStrategy = "keep",
): MarkdownOptions {
  return {
    bullet: "*",
    bulletOrdered: ".",
    bulletOther: "+",
    tightDefinitions: true,
    listItemIndent: "one",
    handlers: {
      heading: handleHeading,
      strong: handleStrong,
      delete: handleDelete,
      emphasis: handleEmphasis,
      list: handleList,
      listItem: handleListItem,
      inlineCode: handleInlineCode,
      code: handleCode,
      link: handleLink,
      linkReference: handleLinkReference(definitions),
      image: handleImage,
      imageReference: handleImageReference(definitions),
      text: handleText,
      blockquote: handleBlockquote(unsupportedTagsStrategy),
      html: handleHtml(unsupportedTagsStrategy),
      table: handleTable(unsupportedTagsStrategy),
    },
  };
}

function preprocessV2HtmlTags(text: string): string {
  let processed = text;
  processed = processed.replace(
    /<u>([\s\S]*?)<\/u>/g,
    (_match, content: string) => `【U:${content}:U】`,
  );
  processed = processed.replace(
    /<span class="tg-spoiler">([\s\S]*?)<\/span>/g,
    (_match, content: string) => `【S:${content}:S】`,
  );
  return processed;
}

function postprocessV2Formatting(text: string): string {
  let processed = text;
  processed = processed.replace(
    /【U:([\s\S]*?):U】/g,
    (_match, content: string) => `__${content}__`,
  );
  processed = processed.replace(
    /【S:([\s\S]*?):S】/g,
    (_match, content: string) => `||${content}||`,
  );
  return processed;
}

export function convertMarkdownToTelegram(
  markdown: string,
  unsupportedTagsStrategy: UnsupportedTagsStrategy = "keep",
): string {
  const definitions: DefinitionsRecord = {};
  const markdownOptions = createMarkdownOptions(definitions, unsupportedTagsStrategy);
  const preprocessedMarkdown = preprocessV2HtmlTags(markdown);

  let result = remark()
    .use(remarkGfm)
    .use(remarkRemoveComments)
    .use(collectDefinitions, definitions)
    .use(removeDefinitions)
    .use(remarkStringify, markdownOptions)
    .processSync(preprocessedMarkdown)
    .toString()
    .replace(/<!---->\n/gi, "");

  result = postprocessV2Formatting(result);
  return result;
}
