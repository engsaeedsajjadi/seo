// The small Markdown subset article drafts use (## / ### headings, paragraphs, - and 1. lists,
// **bold**), turned into HTML for a WordPress post. Every text is escaped first, so a draft can
// never carry markup of its own.

const escape = (s: string) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
const inline = (s: string) => escape(s).replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>');

export function markdownToHtml(markdown: string): string {
  const out: string[] = [];
  let paragraph: string[] = [];
  let list: { tag: 'ul' | 'ol'; items: string[] } | null = null;
  const flushParagraph = () => { if (paragraph.length) out.push(`<p>${inline(paragraph.join(' '))}</p>`); paragraph = []; };
  const flushList = () => { if (list) out.push(`<${list.tag}>${list.items.map((i) => `<li>${inline(i)}</li>`).join('')}</${list.tag}>`); list = null; };
  for (const raw of markdown.replace(/\r\n/g, '\n').split('\n')) {
    const line = raw.trim();
    const heading = /^(#{2,4})\s+(.+)$/.exec(line);
    const bullet = /^[-*]\s+(.+)$/.exec(line);
    const numbered = /^\d+[.)]\s+(.+)$/.exec(line);
    if (!line) { flushParagraph(); flushList(); continue; }
    if (heading) { flushParagraph(); flushList(); const level = Math.min(4, heading[1].length); out.push(`<h${level}>${inline(heading[2])}</h${level}>`); continue; }
    if (bullet || numbered) {
      flushParagraph();
      const tag = bullet ? 'ul' : 'ol';
      if (list && list.tag !== tag) flushList();
      list ??= { tag, items: [] };
      list.items.push((bullet ?? numbered)![1]);
      continue;
    }
    flushList();
    paragraph.push(line.replace(/^#\s+/, ''));
  }
  flushParagraph();
  flushList();
  return out.join('\n');
}
