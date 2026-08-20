(function () {
  var grid = document.getElementById('listing-grid');
  if (!grid) return;

  var cards = Array.prototype.slice.call(grid.querySelectorAll('.card'));
  var chipGroups = Array.prototype.slice.call(document.querySelectorAll('.chip-row[data-filter-group]'));
  var searchInput = document.getElementById('search-input');
  var countEl = document.getElementById('result-count');
  var clearBtn = document.getElementById('clear-filters');

  // selected.area / .price / .layout / .tag are Sets of chosen values
  var selected = {};
  chipGroups.forEach(function (row) {
    selected[row.getAttribute('data-filter-group')] = new Set();
  });

  function cardMatches(card) {
    var query = (searchInput && searchInput.value.trim().toLowerCase()) || '';
    if (query && card.getAttribute('data-search').indexOf(query) === -1) return false;

    if (selected.type.size && !selected.type.has(card.getAttribute('data-type'))) return false;
    if (selected.area.size && !selected.area.has(card.getAttribute('data-area'))) return false;
    if (selected.price.size && !selected.price.has(card.getAttribute('data-price'))) return false;
    if (selected.layout.size && !selected.layout.has(card.getAttribute('data-layout'))) return false;

    if (selected.tag.size) {
      var cardTags = (card.getAttribute('data-tags') || '').split(' ').filter(Boolean);
      for (var t of selected.tag) {
        if (cardTags.indexOf(t) === -1) return false;
      }
    }
    return true;
  }

  function applyFilters() {
    var visible = 0;
    cards.forEach(function (card) {
      var match = cardMatches(card);
      card.style.display = match ? '' : 'none';
      if (match) visible++;
    });
    if (countEl) countEl.textContent = '符合 ' + visible + ' 筆物件';
  }

  chipGroups.forEach(function (row) {
    var group = row.getAttribute('data-filter-group');
    row.querySelectorAll('.chip').forEach(function (chip) {
      chip.addEventListener('click', function () {
        var value = chip.getAttribute('data-value');
        if (selected[group].has(value)) {
          selected[group].delete(value);
          chip.classList.remove('active');
        } else {
          selected[group].add(value);
          chip.classList.add('active');
        }
        applyFilters();
      });
    });
  });

  if (searchInput) {
    searchInput.addEventListener('input', applyFilters);
  }

  if (clearBtn) {
    clearBtn.addEventListener('click', function () {
      chipGroups.forEach(function (row) {
        var group = row.getAttribute('data-filter-group');
        selected[group].clear();
        row.querySelectorAll('.chip.active').forEach(function (chip) {
          chip.classList.remove('active');
        });
      });
      if (searchInput) searchInput.value = '';
      applyFilters();
    });
  }

  applyFilters();
})();
