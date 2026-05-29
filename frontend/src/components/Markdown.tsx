import { Fragment, type ReactNode } from 'react';

// Minimal, dependency-free markdown renderer — enough for the coach's output
// (headings, bold, inline code, bullet / numbered lists, rules, paragraphs).
// Styling comes from the `.prose-coach` rules in index.css.

function renderInline(text: string, keyBase: string): ReactNode[] {
  const nodes: ReactNode[] = [];
  // Split on **bold** and `code`, keeping the delimiters.
  const parts = text.split(/(\*\*[^*]+\*\*|`[^`]+`)/g);
  parts.forEach((part, i) => {
    if (!part) return;
    if (part.startsWith('**') && part.endsWith('**')) {
      nodes.push(<strong key={`${keyBase}-b${i}`}>{part.slice(2, -2)}</strong>);
    } else if (part.startsWith('`') && part.endsWith('`')) {
      nodes.push(<code key={`${keyBase}-c${i}`}>{part.slice(1, -1)}</code>);
    } else {
      nodes.push(<Fragment key={`${keyBase}-t${i}`}>{part}</Fragment>);
    }
  });
  return nodes;
}

interface ListBlock {
  ordered: boolean;
  items: string[];
}

export function Markdown({ text, className = '' }: { text: string; className?: string }) {
  const lines = text.replace(/\r\n/g, '\n').split('\n');
  const blocks: ReactNode[] = [];
  let para: string[] = [];
  let list: ListBlock | null = null;
  let k = 0;

  const flushPara = () => {
    if (para.length) {
      blocks.push(<p key={`p${k++}`}>{renderInline(para.join(' '), `p${k}`)}</p>);
      para = [];
    }
  };
  const flushList = () => {
    if (list) {
      const items = list.items;
      const ordered = list.ordered;
      blocks.push(
        ordered ? (
          <ol key={`l${k++}`}>
            {items.map((it, i) => (
              <li key={i}>{renderInline(it, `l${k}-${i}`)}</li>
            ))}
          </ol>
        ) : (
          <ul key={`l${k++}`}>
            {items.map((it, i) => (
              <li key={i}>{renderInline(it, `l${k}-${i}`)}</li>
            ))}
          </ul>
        ),
      );
      list = null;
    }
  };

  for (const raw of lines) {
    const line = raw.trimEnd();
    const trimmed = line.trim();

    if (!trimmed) {
      flushPara();
      flushList();
      continue;
    }

    // Headings
    const h = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (h) {
      flushPara();
      flushList();
      const level = Math.min(h[1].length, 3);
      const content = renderInline(h[2], `h${k}`);
      if (level === 1) blocks.push(<h1 key={`h${k++}`}>{content}</h1>);
      else if (level === 2) blocks.push(<h2 key={`h${k++}`}>{content}</h2>);
      else blocks.push(<h3 key={`h${k++}`}>{content}</h3>);
      continue;
    }

    // Horizontal rule
    if (/^(-{3,}|_{3,}|\*{3,})$/.test(trimmed)) {
      flushPara();
      flushList();
      blocks.push(<hr key={`hr${k++}`} />);
      continue;
    }

    // Ordered list item
    const ol = /^\d+[.)]\s+(.*)$/.exec(trimmed);
    if (ol) {
      flushPara();
      if (!list || !list.ordered) {
        flushList();
        list = { ordered: true, items: [] };
      }
      list.items.push(ol[1]);
      continue;
    }

    // Unordered list item
    const ul = /^[-*+]\s+(.*)$/.exec(trimmed);
    if (ul) {
      flushPara();
      if (!list || list.ordered) {
        flushList();
        list = { ordered: false, items: [] };
      }
      list.items.push(ul[1]);
      continue;
    }

    // Plain paragraph text
    flushList();
    para.push(trimmed);
  }
  flushPara();
  flushList();

  return <div className={`prose-coach ${className}`}>{blocks}</div>;
}
