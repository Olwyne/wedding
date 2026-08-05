// admin/richtext.js
const ALLOWED_TAGS = new Set(['P', 'BR', 'B', 'STRONG', 'I', 'EM', 'UL', 'LI']);

function sanitizeNode(parent) {
  Array.from(parent.childNodes).forEach(node => {
    if (node.nodeType === Node.ELEMENT_NODE) {
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
