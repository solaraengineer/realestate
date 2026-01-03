(function() {
  // Kliknięcie w tytuły sekcji (Sprzedaż/Aukcje) – rozwijanie/zwijanie sekcji
  const sectionTitles = document.querySelectorAll('.offers-panel .section-title.section-trigger');
  sectionTitles.forEach(title => {
    title.addEventListener('click', () => {
      const target = title.getAttribute('data-target');
      const body = document.querySelector(target);
      if (!body) return;
      body.style.display = (body.style.display === 'block') ? 'none' : 'block';
    });
  });

  // Przyciski "Pokaż/Ukryj" dla list ofert sprzedaży i ofert aukcji
  const saleT = document.getElementById('saleToggle');
  const auctionT = document.getElementById('auctionToggle');

  if (saleT) {
    let saleOpen = false;
    const updateSale = () => {
      saleT.setAttribute('aria-pressed', saleOpen);
      saleT.textContent = saleOpen ? 'Ukryj oferty sprzedaży' : 'Pokaż oferty sprzedaży';
    };
    updateSale();
    saleT.addEventListener('click', () => {
      saleOpen = !saleOpen;
      updateSale();
    });
  }

  if (auctionT) {
    let aucOpen = false;
    const updateAuc = () => {
      auctionT.setAttribute('aria-pressed', aucOpen);
      auctionT.textContent = aucOpen ? 'Ukryj oferty aukcji' : 'Pokaż oferty aukcji';
    };
    updateAuc();
    auctionT.addEventListener('click', () => {
      aucOpen = !aucOpen;
      updateAuc();
    });
  }
})();
