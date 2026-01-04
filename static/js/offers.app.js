(function() {
  'use strict';

  const saleBody = document.getElementById('saleBody');
  const saleToggle = document.getElementById('saleToggle');
  const saleMin = document.getElementById('saleMin');
  const saleMax = document.getElementById('saleMax');

  let listingsContainer = null;
  let isLoading = false;

  function init() {
    if (!saleBody || !saleToggle) return;

    listingsContainer = document.createElement('div');
    listingsContainer.id = 'listingsContainer';
    listingsContainer.style.marginTop = '12px';
    listingsContainer.style.maxHeight = '280px';
    listingsContainer.style.overflowY = 'auto';
    saleBody.appendChild(listingsContainer);

    saleToggle.addEventListener('click', function() {
      const active = this.getAttribute('aria-pressed') === 'true';
      this.setAttribute('aria-pressed', String(!active));
      this.textContent = active ? 'Pokaż oferty sprzedaży' : 'Ukryj oferty';

      if (!active) {
        loadListings();
      } else {
        listingsContainer.innerHTML = '';
      }
    });

    if (saleMin) saleMin.addEventListener('change', function() {
      if (saleToggle.getAttribute('aria-pressed') === 'true') loadListings();
    });

    if (saleMax) saleMax.addEventListener('change', function() {
      if (saleToggle.getAttribute('aria-pressed') === 'true') loadListings();
    });
  }

  async function loadListings(page) {
    if (isLoading) return;
    isLoading = true;
    page = page || 1;

    const params = new URLSearchParams();
    params.set('status', 'active');
    params.set('order_by', 'price');
    params.set('page', page);
    params.set('per_page', '20');

    if (saleMin && saleMin.value) params.set('min_price', saleMin.value);
    if (saleMax && saleMax.value) params.set('max_price', saleMax.value);

    listingsContainer.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px;">Ładowanie...</p>';

    try {
      const res = await fetch('/api/listings/?' + params.toString());
      const data = await res.json();

      if (!data.ok) {
        listingsContainer.innerHTML = '<p style="color:#f87171;padding:8px;">Błąd ładowania</p>';
        isLoading = false;
        return;
      }

      renderListings(data.listings, data.page, data.pages, data.total);
    } catch (e) {
      console.error('[Offers]', e);
      listingsContainer.innerHTML = '<p style="color:#f87171;padding:8px;">Błąd połączenia</p>';
    }

    isLoading = false;
  }

  function renderListings(listings, page, pages, total) {
    if (!listings || !listings.length) {
      listingsContainer.innerHTML = '<p style="color:var(--text-muted);font-size:13px;padding:8px;">Brak ofert</p>';
      return;
    }

    let html = '';

    for (let i = 0; i < listings.length; i++) {
      const l = listings[i];
      html += '<div class="listing-item" data-id="' + l.id + '" data-house="' + l.house_id + '" data-lat="' + (l.house_lat || '') + '" data-lon="' + (l.house_lon || '') + '">';
      html += '<div style="display:flex;justify-content:space-between;align-items:center;">';
      html += '<div>';
      html += '<div style="font-weight:600;font-size:13px;">' + (l.house_name || 'Dom') + '</div>';
      html += '<div style="font-size:11px;color:var(--text-muted);margin-top:2px;">' + l.share_count + ' ' + (l.share_count === 1 ? 'udział' : 'udziałów') + '</div>';
      html += '</div>';
      html += '<div style="text-align:right;">';
      html += '<div style="font-weight:700;font-size:14px;color:var(--accent);">' + formatPrice(l.price) + ' ' + l.currency + '</div>';
      html += '</div>';
      html += '</div>';
      html += '</div>';
    }

    if (pages > 1) {
      html += '<div style="display:flex;justify-content:center;gap:8px;margin-top:10px;">';
      if (page > 1) {
        html += '<button class="btn-ghost page-btn" data-page="' + (page - 1) + '" style="padding:4px 10px;font-size:11px;">←</button>';
      }
      html += '<span style="padding:4px 10px;font-size:11px;color:var(--text-muted);">' + page + ' / ' + pages + '</span>';
      if (page < pages) {
        html += '<button class="btn-ghost page-btn" data-page="' + (page + 1) + '" style="padding:4px 10px;font-size:11px;">→</button>';
      }
      html += '</div>';
    }

    html += '<div style="text-align:center;margin-top:6px;font-size:10px;color:var(--text-muted);">' + total + ' ofert</div>';

    listingsContainer.innerHTML = html;

    const items = listingsContainer.querySelectorAll('.listing-item');
    for (let i = 0; i < items.length; i++) {
      items[i].style.cssText = 'padding:10px;margin-bottom:6px;background:var(--glass-light);border:1px solid var(--border);border-radius:8px;cursor:pointer;transition:all 0.15s ease;';

      items[i].addEventListener('mouseenter', function() {
        this.style.background = 'var(--glass-hover)';
        this.style.borderColor = 'var(--border-hover)';
      });

      items[i].addEventListener('mouseleave', function() {
        this.style.background = 'var(--glass-light)';
        this.style.borderColor = 'var(--border)';
      });

      items[i].addEventListener('click', function() {
        const lat = parseFloat(this.dataset.lat);
        const lon = parseFloat(this.dataset.lon);
        const houseId = this.dataset.house;

        if (lat && lon && typeof window.viewer !== 'undefined') {
          window.viewer.camera.flyTo({
            destination: Cesium.Cartesian3.fromDegrees(lon, lat, 500),
            duration: 1.5
          });
        }

        if (typeof window.showFeaturePanel === 'function') {
          window.showFeaturePanel(houseId);
        }
      });
    }

    const pageButtons = listingsContainer.querySelectorAll('.page-btn');
    for (let i = 0; i < pageButtons.length; i++) {
      pageButtons[i].addEventListener('click', function() {
        loadListings(parseInt(this.dataset.page));
      });
    }
  }

  function formatPrice(price) {
    return Number(price).toLocaleString('pl-PL');
  }

  window.loadListings = loadListings;

  window.renderOffersPanel = function() {
    if (saleToggle && saleToggle.getAttribute('aria-pressed') === 'true') {
      loadListings();
    }
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();