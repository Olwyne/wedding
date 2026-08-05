// admin/richtext.js
const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'LI']);
const DROP_ENTIRELY = new Set(['SCRIPT', 'STYLE', 'NOSCRIPT', 'TITLE', 'TEXTAREA']);

function sanitizeNode(parent) {
  Array.from(parent.childNodes).forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
      if (DROP_ENTIRELY.has(node.tagName)) {
        parent.removeChild(node);
        return;
      }
      sanitizeNode(node);
      if (ALLOWED_TAGS.has(node.tagName)) {
        Array.from(node.attributes).forEach(attr => node.removeAttribute(attr.name));
      } else {
        while (node.firstChild) parent.insertBefore(node.firstChild, node);
        parent.removeChild(node);
      }
    } else if (node.nodeType !== Node.TEXT_NODE) {
      parent.removeChild(node);
    }
  });
}

export function sanitizeHtml(html) {
  const template = document.createElement('template');
  template.innerHTML = typeof html === 'string' ? html : '';
  sanitizeNode(template.content);
  return template.innerHTML;
}

function escapeText(str) {
  return str.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
}

function htmlFromLegacyText(text) {
  const blocks = text.split(/\n{2,}/).filter(b => b.trim() !== '');
  if (blocks.length === 0) return '';
  return blocks
    .map(block => `<p>${block.split('\n').map(escapeText).join('<br>')}</p>`)
    .join('');
}

const TOOLBAR_BUTTONS = [
  { cmd: 'bold', label: 'G', title: 'Gras' },
  { cmd: 'italic', label: 'I', title: 'Italique' },
  { cmd: 'insertUnorderedList', label: '•', title: 'Liste' },
];

export function mountRichEditor(container, initialValue) {
  const value = typeof initialValue === 'string' ? initialValue : '';
  // Legacy plain text containing a literal '<' followed by a letter (rare) is misdetected as HTML; acceptable tradeoff per spec.
  const startHtml = value.includes('<') ? value : htmlFromLegacyText(value);

  container.innerHTML = `
    <div class="rich-editor-toolbar">
      ${TOOLBAR_BUTTONS.map(b =>
        `<button type="button" class="rich-editor-btn" data-cmd="${b.cmd}" title="${b.title}">${b.label}</button>`
      ).join('')}
    </div>
    <div class="rich-editor-content" contenteditable="true">${startHtml}</div>`;

  const contentEl = container.querySelector('.rich-editor-content');
  container.querySelectorAll('.rich-editor-btn').forEach(btn => {
    btn.addEventListener('click', () => {
      contentEl.focus();
      document.execCommand(btn.dataset.cmd);
    });
  });

  return {
    getHtml: () => {
      const html = contentEl.innerHTML;
      return html.trim() === '' || /<[a-z]/i.test(html) ? html : `<p>${html}</p>`;
    },
  };
}
