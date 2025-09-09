// public/js/bullets.js
// מציג תיאורים כרשימות נקודות בכל הבילדרים (כולל חלונות "פירוט"),
// ומסתיר שדות "משך זמן" אם קיימים בממשק. תצוגה בלבד – לא נוגע בקלט.

(function () {
  function textFromHTML(el) {
    if (!el) return '';
    let html = el.innerHTML || '';
    html = html.replace(/<br\s*\/?>/gi, '\n').replace(/&nbsp;/gi, ' ').replace(/\r/g, '');
    if (!html.trim()) return (el.textContent || '').replace(/\r/g, '');
    const tmp = document.createElement('div');
    tmp.innerHTML = html;
    return (tmp.textContent || '').replace(/\r/g, '');
  }

  function toBullets(el) {
    if (!el || el.dataset.__bulleted === '1') return;
    if (el.querySelector('ul,ol')) { el.dataset.__bulleted = '1'; return; }

    let raw = textFromHTML(el).trim();
    if (!raw) return;

    let lines = raw.split('\n').map(s => s.trim()).filter(Boolean);
    if (lines.length <= 1) {
      const bySentence = raw.split(/(?<=[\.\!\?])\s+/).map(s => s.trim()).filter(Boolean);
      if (bySentence.length > 1) lines = bySentence;
    }
    if (lines.length <= 1) {
      const byDots = raw.split(/[•\-–]\s+/).map(s => s.trim()).filter(Boolean);
      if (byDots.length > 1) lines = byDots;
    }
    if (lines.length <= 1) return;

    const ul = document.createElement('ul');
    ul.className = 'desc-list';
    for (const ln of lines) {
      const li = document.createElement('li');
      li.textContent = ln;
      ul.appendChild(li);
    }
    el.innerHTML = '';
    el.appendChild(ul);
    el.dataset.__bulleted = '1';
  }

  function scan(root) {
    const selectors = [
      '[data-desc]',
      '.description', '.desc',
      '.exercise-description', '.game-description',
      '.item-card .details p',
      '.item .description', '.card .description',
      '.lesson-item .description', '.list-item .description',
      '.modal .description', '.modal [data-desc]',
      '.details-modal .description',
      'td.description',
      '.swal2-html-container'
    ];
    selectors.forEach(sel => root.querySelectorAll(sel).forEach(toBullets));
  }

  function hideDurationFields(root) {
    const inputs = root.querySelectorAll(
      'input[name*="duration"], input[id*="duration"], input[name*="minutes"], input[id*="minutes"]'
    );
    inputs.forEach(inp => { const box = closestBox(inp); if (box) box.style.display = 'none'; });
    const labels = root.querySelectorAll('label, .form-label, .field-label, .input-label, .control-label');
    labels.forEach(l => {
      const t = (l.textContent || '').trim();
      if (t.includes('משך') || t.includes('בדקות') || t.includes('זמן')) {
        const box = closestBox(l); if (box) box.style.display = 'none';
      }
    });
    function closestBox(node) {
      return node.closest('.form-group, .field, .input-group, .mb-3, .row, .col, .group, .box, .card, .control') || node.parentElement;
    }
  }

  const style = document.createElement('style');
  style.textContent = `
    .desc-list{margin:6px 0 0 0;padding:0 18px 0 0;list-style:disc;list-style-position:inside;color:#4A5568;font-size:14px;line-height:1.6}
    .desc-list li{margin:2px 0}
  `;
  document.head.appendChild(style);

  window.addEventListener('load', () => {
    hideDurationFields(document);
    scan(document);
    const obs = new MutationObserver(muts => {
      for (const m of muts) {
        if (m.type === 'childList') {
          m.addedNodes.forEach(n => { if (n.nodeType === 1) { hideDurationFields(n); scan(n); } });
        } else if (m.type === 'attributes' && m.target && m.target.nodeType === 1) {
          hideDurationFields(m.target); scan(m.target);
        }
      }
    });
    obs.observe(document.body, { childList: true, subtree: true, attributes: true });
  });
})();
