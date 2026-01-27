function getCookie(name) {
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop().split(';').shift();
  return '';
}

window.getCookie = getCookie;

function bindAccordion(containerSelector) {
  const headers = document.querySelectorAll(containerSelector + ' .section-header');
  headers.forEach(header => {
    const btn = header.querySelector('.toggle');
    const body = document.querySelector(header.getAttribute('data-target')) ||
                 (header.nextElementSibling && header.nextElementSibling.classList.contains('section-body')
                   ? header.nextElementSibling
                   : null);
    if (!btn || !body) return;

    let open = header.getAttribute('aria-expanded') === 'true';
    const update = () => {
      body.style.display = open ? 'block' : 'none';
      btn.textContent = open ? 'Zwiń' : 'Rozwiń';
      header.setAttribute('aria-expanded', String(open));
    };
    update();

    const toggle = () => { open = !open; update(); };
    header.addEventListener('click', (e) => {
      if (e.target.closest('.toggle')) return;
      toggle();
    });
    btn.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      toggle();
    });
  });
}

function hidePanels() {
  const panelIds = ['offersPanel', 'appPanel', 'viewpointsPanel'];
  panelIds.forEach(id => {
    const p = document.getElementById(id);
    if (p) p.style.display = 'none';
  });
}

function openPanel(panelId) {
  hidePanels();
  const p = document.getElementById(panelId);
  if (p) p.style.display = 'block';
}

function openPanelInMenu(panelId) {
  hidePanels();

  const menu = document.getElementById('menuPanel');
  const p = document.getElementById(panelId);
  if (!menu || !p) return;

  p.classList.add('dock-left');
  p.style.display = 'block';

  menu.style.display = 'none';

  const closer = p.querySelector(`[data-close="${panelId}"]`) ||
                 p.querySelector('.panel-close') ||
                 p.querySelector('.feature-close');

  if (closer) {
    const onClose = () => {
      p.style.display = 'none';
      p.classList.remove('dock-left');
      menu.style.display = 'block';
      closer.removeEventListener('click', onClose);
    };
    closer.addEventListener('click', onClose, { once: true });
  }
}
