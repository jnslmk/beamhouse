// Minimal XML reader: the element/attribute subset description.xml needs.
// No text content, namespaces, CDATA, entities beyond the five predefined ones.

export interface XmlNode {
  tag: string;
  attrs: Record<string, string>;
  children: XmlNode[];
}

const ENTITIES: Record<string, string> = {
  amp: "&",
  lt: "<",
  gt: ">",
  quot: '"',
  apos: "'",
};

function decodeEntities(value: string): string {
  return value.replace(/&(#\d+|#x[0-9a-fA-F]+|\w+);/g, (match, body: string) => {
    if (body.startsWith("#x")) return String.fromCodePoint(parseInt(body.slice(1), 16));
    if (body.startsWith("#")) return String.fromCodePoint(parseInt(body.slice(1), 10));
    return ENTITIES[body] ?? match;
  });
}

function parseAttributes(source: string): Record<string, string> {
  const attrs: Record<string, string> = {};
  const pattern = /([\w:.-]+)\s*=\s*("([^"]*)"|'([^']*)')/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(source)) !== null) {
    attrs[match[1]!] = decodeEntities(match[3] ?? match[4] ?? "");
  }
  return attrs;
}

export function parseXml(text: string): XmlNode {
  const root: XmlNode = { tag: "", attrs: {}, children: [] };
  const stack: XmlNode[] = [root];
  let index = 0;
  while (index < text.length) {
    const open = text.indexOf("<", index);
    if (open === -1) break;
    index = open;
    if (text.startsWith("<!--", index)) {
      const end = text.indexOf("-->", index + 4);
      if (end === -1) throw new Error("xml: unterminated comment");
      index = end + 3;
      continue;
    }
    if (text.startsWith("<?", index) || text.startsWith("<!", index)) {
      const end = text.indexOf(">", index + 2);
      if (end === -1) throw new Error("xml: unterminated directive");
      index = end + 1;
      continue;
    }
    const end = text.indexOf(">", index + 1);
    if (end === -1) throw new Error("xml: unterminated tag");
    const body = text.slice(index + 1, end).trim();
    if (body.startsWith("/")) {
      const tag = body.slice(1).trim();
      const node = stack.pop();
      if (!node || node.tag !== tag) throw new Error(`xml: mismatched close tag </${tag}>`);
      index = end + 1;
      continue;
    }
    const selfClosing = body.endsWith("/");
    const inner = selfClosing ? body.slice(0, -1).trim() : body;
    const space = inner.search(/\s/);
    const tag = space === -1 ? inner : inner.slice(0, space);
    if (!tag) throw new Error("xml: empty tag");
    const node: XmlNode = {
      tag,
      attrs: parseAttributes(space === -1 ? "" : inner.slice(space + 1)),
      children: [],
    };
    stack[stack.length - 1]!.children.push(node);
    if (!selfClosing) stack.push(node);
    index = end + 1;
  }
  if (stack.length !== 1) throw new Error("xml: unclosed tags");
  const document = root.children.filter((child) => child.tag !== "");
  if (document.length !== 1) throw new Error("xml: expected a single root element");
  return document[0]!;
}

export function child(node: XmlNode, tag: string): XmlNode | undefined {
  return node.children.find((candidate) => candidate.tag === tag);
}

export function children(node: XmlNode, tag: string): XmlNode[] {
  return node.children.filter((candidate) => candidate.tag === tag);
}
