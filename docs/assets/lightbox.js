(function () {
  var box = document.getElementById('lightbox');
  if (!box) return;

  var photos = Array.prototype.slice.call(document.querySelectorAll('.gallery-photo'));
  if (!photos.length) return;

  var img = box.querySelector('.lightbox-img');
  var countEl = box.querySelector('.lightbox-count');
  var prevBtn = box.querySelector('[data-lightbox-prev]');
  var nextBtn = box.querySelector('[data-lightbox-next]');
  var closeBtn = box.querySelector('[data-lightbox-close]');
  var current = 0;

  if (photos.length < 2) {
    if (prevBtn) prevBtn.style.display = 'none';
    if (nextBtn) nextBtn.style.display = 'none';
  }

  function show(index) {
    current = (index + photos.length) % photos.length;
    img.src = photos[current].src;
    img.alt = photos[current].alt;
    if (countEl) countEl.textContent = (current + 1) + ' / ' + photos.length;
  }

  function open(index) {
    show(index);
    box.classList.add('open');
    box.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
  }

  function close() {
    box.classList.remove('open');
    box.setAttribute('aria-hidden', 'true');
    document.body.style.overflow = '';
  }

  photos.forEach(function (photo, index) {
    photo.style.cursor = 'zoom-in';
    photo.addEventListener('click', function () {
      open(index);
    });
  });

  if (prevBtn) prevBtn.addEventListener('click', function () { show(current - 1); });
  if (nextBtn) nextBtn.addEventListener('click', function () { show(current + 1); });
  if (closeBtn) closeBtn.addEventListener('click', close);

  box.addEventListener('click', function (e) {
    if (e.target === box) close();
  });

  document.addEventListener('keydown', function (e) {
    if (!box.classList.contains('open')) return;
    if (e.key === 'Escape') close();
    if (e.key === 'ArrowLeft') show(current - 1);
    if (e.key === 'ArrowRight') show(current + 1);
  });
})();
