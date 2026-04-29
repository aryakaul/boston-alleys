const MAP_CENTER = [42.3467, -71.0817];
const MAP_ZOOM   = 14;

// Warm gradient: golden yellow (score 1) → deep red (score 10)
function scoreToColor(score) {
  const t     = (score - 1) / 9;
  const hue   = Math.round(55 - t * 50);
  const light = Math.round(72 - t * 30);
  return `hsl(${hue}, 95%, ${light}%)`;
}

// Global slideshow state — safe because only one popup is open at a time
const _ss = { photos: [], idx: 0, num: null, popup: null };

window.slidePrev = function () {
  _ss.idx = (_ss.idx - 1 + _ss.photos.length) % _ss.photos.length;
  refreshSlide();
};

window.slideNext = function () {
  _ss.idx = (_ss.idx + 1) % _ss.photos.length;
  refreshSlide();
};

function refreshSlide() {
  const img   = document.querySelector('.slideshow img');
  const count = document.querySelector('.slide-count');
  if (img)   img.src = `photos/${_ss.num}/${_ss.photos[_ss.idx]}`;
  if (count) count.textContent = `${_ss.idx + 1} / ${_ss.photos.length}`;
}

function buildPopupContent(feature, review) {
  const name      = feature.properties.name;
  const alleyType = feature.properties.alley_type;

  const header = `
    <div class="popup-header">
      <div class="alley-type">${alleyType}</div>
      <h3>${name}</h3>
    </div>`;

  if (!review) {
    return header + `<div class="popup-unreviewed">Not yet visited.</div>`;
  }

  const num    = String(feature.properties.number);
  const photos = review.photos || [];
  const mean   = ((review.vibe + review.shortcut + review.potential) / 3).toFixed(1);

  let slideshow = '';
  if (photos.length) {
    slideshow = `
      <div class="slideshow">
        ${photos.length > 1 ? `<button class="slide-btn prev" onclick="slidePrev()">&#8592;</button>` : ''}
        <img src="photos/${num}/${photos[0]}" alt="${name}" />
        ${photos.length > 1 ? `<button class="slide-btn next" onclick="slideNext()">&#8594;</button>` : ''}
        ${photos.length > 1 ? `<div class="slide-count">1 / ${photos.length}</div>` : ''}
      </div>`;
  }

  const scores = `
    <div class="popup-scores">
      <div class="score-item">
        <span class="score-label">Aesthetic</span>
        <span class="score-value">${review.vibe}</span>
      </div>
      <div class="score-item">
        <span class="score-label">Shortcut</span>
        <span class="score-value">${review.shortcut}</span>
      </div>
      <div class="score-item">
        <span class="score-label">Potential</span>
        <span class="score-value">${review.potential}</span>
      </div>
      <div class="score-mean">Mean: <b>${mean} / 10</b></div>
    </div>`;

  const notes = review.notes
    ? `<div class="popup-notes">${review.notes}</div>`
    : '';

  return header + slideshow + scores + notes;
}

async function init() {
  const bostonBounds = L.latLngBounds([42.28, -71.18], [42.42, -70.95]);
  const map = L.map('map', {
    zoomControl: true,
    maxBounds: bostonBounds,
    maxBoundsViscosity: 1.0,
    minZoom: 13,
  }).setView(MAP_CENTER, MAP_ZOOM);

  L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/">CARTO</a>',
    maxZoom: 19,
  }).addTo(map);

  const [geojson, reviews] = await Promise.all([
    fetch('data/alleys.geojson').then(r => r.json()),
    fetch('data/reviews.json').then(r => r.json()),
  ]);

  function makeLayer(features) {
    return L.geoJSON({ type: 'FeatureCollection', features }, {
      style(feature) {
        const num       = String(feature.properties.number);
        const review    = reviews[num];
        const isPrivate = feature.properties.alley_type === 'private';
        const mean      = review
          ? (review.vibe + review.shortcut + review.potential) / 3
          : null;
        return {
          color:     mean !== null ? scoreToColor(mean) : '#9ca3af',
          weight:    3.5,
          opacity:   0.9,
          dashArray: isPrivate ? '6 5' : null,
        };
      },
      onEachFeature(feature, layer) {
        layer.on('click', () => {
          const num    = String(feature.properties.number);
          const review = reviews[num];
          _ss.photos = review?.photos || [];
          _ss.idx    = 0;
          _ss.num    = num;
          const center  = layer.getBounds().getCenter();
          const content = buildPopupContent(feature, review);
          if (_ss.popup) {
            _ss.popup.setLatLng(center).setContent(content).openOn(map);
          } else {
            _ss.popup = L.popup({ maxWidth: 320, minWidth: 300 })
              .setLatLng(center).setContent(content).openOn(map);
          }
        });
        layer.on('mouseover', function () { this.setStyle({ weight: 5, opacity: 1 }); });
        layer.on('mouseout',  function () { this.setStyle({ weight: 3.5, opacity: 0.9 }); });
      },
    });
  }

  const publicLayer  = makeLayer(geojson.features.filter(f => f.properties.alley_type === 'public'));
  const privateLayer = makeLayer(geojson.features.filter(f => f.properties.alley_type === 'private'));
  publicLayer.addTo(map);
  privateLayer.addTo(map);

  // Toggle buttons
  document.getElementById('toggle-public').addEventListener('click', function () {
    const active = map.hasLayer(publicLayer);
    active ? map.removeLayer(publicLayer) : publicLayer.addTo(map);
    this.classList.toggle('inactive', active);
  });

  document.getElementById('toggle-private').addEventListener('click', function () {
    const active = map.hasLayer(privateLayer);
    active ? map.removeLayer(privateLayer) : privateLayer.addTo(map);
    this.classList.toggle('inactive', active);
  });
}

init();
