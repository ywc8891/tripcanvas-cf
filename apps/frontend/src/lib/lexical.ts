// Minimal Lexical -> HTML renderer for Payload's richtext output.
// Handles the node types currently produced by the CMS: paragraph, heading,
// quote, list/listitem, link, upload (media), and text with format flags.

type LexicalNode = {
  type: string;
  version?: number;
  format?: number | string;
  indent?: number;
  direction?: string | null;
  children?: LexicalNode[];
  // text node
  text?: string;
  mode?: string;
  style?: string;
  // heading
  tag?: string;
  // list
  listType?: 'bullet' | 'number' | 'check';
  start?: number;
  // listitem (checked) / link / upload all share `value` with different shapes
  checked?: boolean;
  // link
  fields?: {
    url?: string;
    newTab?: boolean;
    linkType?: string;
    doc?: { value?: { slug?: string } };
  };
  // upload
  relationTo?: string;
  // For listitem: numeric position. For upload (depth>=1): populated doc.
  // For upload (depth=0): id. Typed loose to cover all cases.
  value?: unknown;
};

type LexicalRoot = {
  root: LexicalNode;
};

const R2_PUBLIC_URL = 'https://pub-2faca0649c2047a1859536a3114d3f95.r2.dev';

function r2ToHttps(url: string): string {
  if (url.startsWith('r2://')) {
    const withoutScheme = url.slice('r2://'.length);
    const slash = withoutScheme.indexOf('/');
    const key = slash >= 0 ? withoutScheme.slice(slash + 1) : withoutScheme;
    return `${R2_PUBLIC_URL}/${key}`;
  }
  return url;
}

const R2_PARA_RE = /^(Image[^(]*) \(r2:\/\/([^)]+)\)$/;

const TEXT_FORMAT = {
  BOLD: 1,
  ITALIC: 2,
  STRIKETHROUGH: 4,
  UNDERLINE: 8,
  CODE: 16,
  SUBSCRIPT: 32,
  SUPERSCRIPT: 64,
};

function escapeHtml(str: string): string {
  return str
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function escapeAttr(str: string): string {
  return escapeHtml(str);
}

function renderText(node: LexicalNode): string {
  let html = escapeHtml(node.text ?? '');
  const format = typeof node.format === 'number' ? node.format : 0;

  if (format & TEXT_FORMAT.CODE) html = `<code>${html}</code>`;
  if (format & TEXT_FORMAT.BOLD) html = `<strong>${html}</strong>`;
  if (format & TEXT_FORMAT.ITALIC) html = `<em>${html}</em>`;
  if (format & TEXT_FORMAT.UNDERLINE) html = `<u>${html}</u>`;
  if (format & TEXT_FORMAT.STRIKETHROUGH) html = `<s>${html}</s>`;
  if (format & TEXT_FORMAT.SUBSCRIPT) html = `<sub>${html}</sub>`;
  if (format & TEXT_FORMAT.SUPERSCRIPT) html = `<sup>${html}</sup>`;

  return html;
}

function renderChildren(nodes: LexicalNode[] | undefined): string {
  if (!nodes) return '';
  return nodes.map(renderNode).join('');
}

function renderNode(node: LexicalNode): string {
  switch (node.type) {
    case 'text':
      return renderText(node);

    case 'linebreak':
      return '<br />';

    case 'paragraph': {
      const rawText = (node.children ?? [])
        .map((c) => (c.type === 'text' ? (c.text ?? '') : ''))
        .join('');
      const m = R2_PARA_RE.exec(rawText);
      if (m) {
        const altLabel = m[1].startsWith('Image:') ? m[1].slice('Image:'.length).trim() : '';
        const httpsUrl = r2ToHttps(`r2://${m[2]}`);
        return `<figure><img src="${escapeAttr(httpsUrl)}" alt="${escapeAttr(altLabel)}" loading="lazy" /></figure>`;
      }
      return `<p>${renderChildren(node.children)}</p>`;
    }

    case 'heading': {
      const tag = node.tag && /^h[1-6]$/.test(node.tag) ? node.tag : 'h2';
      return `<${tag}>${renderChildren(node.children)}</${tag}>`;
    }

    case 'quote':
      return `<blockquote>${renderChildren(node.children)}</blockquote>`;

    case 'list': {
      const tag = node.listType === 'number' ? 'ol' : 'ul';
      const cls = node.listType === 'check' ? ' class="lexical-list-check"' : '';
      return `<${tag}${cls}>${renderChildren(node.children)}</${tag}>`;
    }

    case 'listitem': {
      if (typeof node.checked === 'boolean') {
        const checked = node.checked ? ' checked' : '';
        return `<li class="lexical-list-item-check"><input type="checkbox" disabled${checked} /> ${renderChildren(node.children)}</li>`;
      }
      return `<li>${renderChildren(node.children)}</li>`;
    }

    case 'link':
    case 'autolink': {
      const url = node.fields?.url ?? '#';
      const target = node.fields?.newTab ? ' target="_blank" rel="noopener noreferrer"' : '';
      return `<a href="${escapeAttr(url)}"${target}>${renderChildren(node.children)}</a>`;
    }

    case 'upload': {
      const value = node.value as
        | { url?: string; alt?: string; width?: number; height?: number }
        | undefined
        | null;
      if (value && typeof value === 'object' && value.url) {
        const url = String(value.url);
        const alt = escapeAttr(String(value.alt ?? ''));
        const width = value.width ? ` width="${value.width}"` : '';
        const height = value.height ? ` height="${value.height}"` : '';
        return `<figure><img src="${escapeAttr(url)}" alt="${alt}"${width}${height} loading="lazy" /></figure>`;
      }
      return '';
    }

    case 'placeholder-image': {
      const n = node as unknown as { wp_url?: string; alt?: string; width?: number | null; height?: number | null };
      const url = n.wp_url ?? '';
      if (!url.startsWith('https://')) return '';
      const alt = escapeAttr(String(n.alt ?? ''));
      const width = n.width ? ` width="${n.width}"` : '';
      const height = n.height ? ` height="${n.height}"` : '';
      return `<figure><img src="${escapeAttr(url)}" alt="${alt}"${width}${height} loading="lazy" /></figure>`;
    }

    case 'horizontalrule':
      return '<hr />';

    default:
      // Unknown node: render children if any, else nothing.
      return renderChildren(node.children);
  }
}

export function lexicalToHtml(content: unknown): string {
  if (!content || typeof content !== 'object') return '';
  const root = (content as LexicalRoot).root;
  if (!root) return '';
  return renderChildren(root.children);
}
