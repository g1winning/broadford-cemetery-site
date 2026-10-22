/* ==========================================================================
   Broadford Cemetery Trust: grave search and cemetery map
   --------------------------------------------------------------------------
   Loads grave-search/map-data.json (built from the Trust's records) and
   draws every plot on an aerial photo with Leaflet. The search results list
   is the main way in: it works with a keyboard and a screen reader, and the
   map follows it. Selecting a result or a plot shows its details beside the
   map and puts ?plot=<slug> in the address so the view can be shared.
   ========================================================================== */

(function () {
  'use strict';

  var app = document.querySelector('[data-grave-app]');
  if (!app || !window.L) { return; }

  var S = JSON.parse(app.getAttribute('data-strings'));
  var ROOT = app.getAttribute('data-root') || '';
  var $ = function (sel) { return app.querySelector(sel); };
  var $$ = function (sel) { return Array.prototype.slice.call(app.querySelectorAll(sel)); };

  var input = $('[data-search-input]');
  var form = $('[data-search-form]');
  var advanced = $('[data-advanced]');
  var clearBtn = $('[data-clear]');
  var resultsWrap = $('[data-results-wrap]');
  var resultsList = $('[data-results]');
  var resultsCount = $('[data-results-count]');
  var panel = $('[data-panel]');
  var mapEl = $('[data-map]');
  var locateStatus = $('[data-locate-status]');

  var COLOURS = {
    Occupied:    { fill: '#7C3AED', line: '#4C1D95' },
    Reserved:    { fill: '#D97706', line: '#92400E' },
    Vacant:      { fill: '#16A34A', line: '#14532D' },
    Unavailable: { fill: '#6B7280', line: '#374151' }
  };
  var MAX_RESULTS = 60;
  var LABEL_ZOOM = 22;       // plot references
  var NAME_ZOOM = 23;        // plot references and names

  var data, map, plotLayer, labelLayer, selected, layersBySlug = {}, plotsBySlug = {};
  var visibleStatuses = {};
  $$('[data-status-filter]').forEach(function (c) { visibleStatuses[c.value] = true; });

  // ---------- helpers -------------------------------------------------------

  function esc(s) {
    return String(s == null ? '' : s).replace(/[&<>"']/g, function (c) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c];
    });
  }
  // Lower case, accents removed, apostrophes and hyphens ignored: "O'Dwyer" finds "odwyer".
  function norm(s) {
    return String(s || '').toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/['’\-.]/g, '').trim();
  }
  function year(d) { return d ? Number(String(d).slice(0, 4)) : null; }
  function lifespan(p) {
    var b = year(p.born), d = year(p.died);
    if (b && d) { return b + ' to ' + d; }
    if (d) { return 'died ' + (p.diedText || d); }
    if (b) { return 'born ' + b; }
    return '';
  }
  function statusLabel(s) { return (S.statusLabels && S.statusLabels[s]) || s; }
  function plotUrl(p) { return ROOT + 'grave-search/plot/' + p.slug + '/'; }

  // ---------- map -----------------------------------------------------------

  function buildMap() {
    map = L.map(mapEl, { zoomControl: true, maxZoom: 23, preferCanvas: true, scrollWheelZoom: false });
    // The page scrolls past the map; the wheel only zooms once someone has clicked into it.
    map.on('click focus', function () { map.scrollWheelZoom.enable(); });
    mapEl.addEventListener('mouseleave', function () { map.scrollWheelZoom.disable(); });
    var aerial = L.tileLayer(data.imagery.url, {
      maxNativeZoom: data.imagery.maxNativeZoom || 19, maxZoom: 23, attribution: esc(data.imagery.credit)
    });
    var street = L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
      maxNativeZoom: 19, maxZoom: 23, attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
    });
    aerial.addTo(map);
    var layers = {};
    layers[S.map.aerialLabel] = aerial;
    layers[S.map.streetLabel] = street;
    L.control.layers(layers, null, { position: 'topright' }).addTo(map);
    L.control.scale({ imperial: false }).addTo(map);

    // Section outlines and names.
    var sections = L.layerGroup().addTo(map);
    // Section names crowd each other when the whole cemetery is in view.
    function sectionNames() { mapEl.classList.toggle('grave-map--far', map.getZoom() < 19); }
    map.on('zoomend', sectionNames);
    data.sections.forEach(function (s) {
      if (!s.ring) { return; }
      var poly = L.polygon(s.ring, { color: '#FFFFFF', weight: 2, opacity: 0.9, fill: false, interactive: false });
      poly.addTo(sections);
      poly.bindTooltip(esc(s.name), { permanent: true, direction: 'center', className: 'grave-section-label', interactive: false });
    });

    // Plots.
    plotLayer = L.featureGroup().addTo(map);
    data.plots.forEach(function (p) {
      plotsBySlug[p.slug] = p;
      if (!p.ring) { return; }
      var c = COLOURS[p.status] || COLOURS.Unavailable;
      var poly = L.polygon(p.ring, { color: c.line, weight: 1, fillColor: c.fill, fillOpacity: 0.5 });
      poly.plot = p;
      poly.on('click', function () { selectPlot(p, { fly: false, from: 'map' }); });
      layersBySlug[p.slug] = poly;
      poly.addTo(plotLayer);
    });

    labelLayer = L.layerGroup().addTo(map);
    map.on('zoomend moveend', drawLabels);
    map.on('zoomend', fillForZoom);

    var bounds = plotLayer.getBounds();
    map.fitBounds(bounds, { padding: [10, 10] });
    sectionNames();
    app.homeBounds = bounds;
  }

  // Plot references and names written on the plots, only when zoomed in close.
  function drawLabels() {
    labelLayer.clearLayers();
    if (map.getZoom() < LABEL_ZOOM) { return; }
    var view = map.getBounds().pad(0.1);
    data.plots.forEach(function (p) {
      if (!p.centre || !visibleStatuses[p.status] || !view.contains(p.centre)) { return; }
      var withNames = map.getZoom() >= NAME_ZOOM;
      var names = withNames ? p.people.slice(0, 3).map(function (x) { return esc(x.short); }).join('<br>') : '';
      var more = withNames && p.people.length > 3 ? '<br>+' + (p.people.length - 3) : '';
      L.marker(p.centre, {
        interactive: false, keyboard: false,
        icon: L.divIcon({ className: 'grave-plot-label', html: '<b>' + esc(p.ref) + '</b>' + (names ? '<br>' + names + more : ''), iconSize: null })
      }).addTo(labelLayer);
    });
  }

  // Lighter colour close up, so the photo of the ground shows through.
  function fillOpacity() { return map.getZoom() >= 21 ? 0.2 : 0.5; }
  function fillForZoom() {
    var o = fillOpacity();
    plotLayer.eachLayer(function (l) { if (!selected || l.plot !== selected) { l.setStyle({ fillOpacity: o, weight: map.getZoom() >= 21 ? 2 : 1 }); } });
  }

  function applyStatusFilter() {
    data.plots.forEach(function (p) {
      var layer = layersBySlug[p.slug];
      if (!layer) { return; }
      var show = visibleStatuses[p.status] || (selected && selected.slug === p.slug);
      if (show && !plotLayer.hasLayer(layer)) { plotLayer.addLayer(layer); }
      if (!show && plotLayer.hasLayer(layer)) { plotLayer.removeLayer(layer); }
    });
    drawLabels();
  }

  function highlight(p) {
    if (selected && layersBySlug[selected.slug]) {
      var prev = COLOURS[selected.status] || COLOURS.Unavailable;
      layersBySlug[selected.slug].setStyle({ color: prev.line, weight: map.getZoom() >= 21 ? 2 : 1, fillOpacity: fillOpacity() });
    }
    selected = p;
    var layer = layersBySlug[p.slug];
    if (layer) {
      if (!plotLayer.hasLayer(layer)) { plotLayer.addLayer(layer); }
      layer.setStyle({ color: '#FACC15', weight: 4, fillOpacity: 0.35 });
      layer.bringToFront();
    }
  }

  // ---------- plot panel ----------------------------------------------------

  function formsFor(p) {
    return (data.forms || []).filter(function (f) {
      if (f.forSaleOnly) { return p.forSale; }
      return f.plotStatuses.length && f.plotStatuses.indexOf(p.status) !== -1;
    });
  }

  function selectPlot(p, opts) {
    opts = opts || {};
    highlight(p);
    if (opts.fly !== false && p.centre) { map.flyTo(p.centre, NAME_ZOOM, { duration: 0.8 }); }
    var people = p.people.length
      ? '<ul class="grave-panel-people">' + p.people.map(function (x) {
          var facts = [];
          if (x.bornText) { facts.push('Born ' + esc(x.bornText)); }
          if (x.diedText) { facts.push('Died ' + esc(x.diedText)); }
          if (x.age) { facts.push('Age ' + esc(x.age)); }
          return '<li><a href="' + plotUrl(p) + '#person-' + esc(x.id) + '"><strong>' + esc(x.name) + '</strong></a>' +
            (facts.length ? '<br><span class="records">' + facts.join(', ') + '</span>' : '') + '</li>';
        }).join('') + '</ul>'
      : '<p>' + esc(S.panel.emptyPlot) + '</p>';
    var forms = formsFor(p);
    var requests = forms.length
      ? '<h3 class="grave-panel-h3">' + esc(S.panel.requestsHeading) + '</h3><ul class="grave-panel-requests">' + forms.map(function (f) {
          return '<li><a href="' + ROOT + 'grave-search/request/' + esc(f.key) + '/?plot=' + encodeURIComponent(p.ref) + '">' + esc(f.title) + '</a></li>';
        }).join('') + '</ul>'
      : '';
    var dir = p.centre ? 'https://www.google.com/maps/dir/?api=1&destination=' + p.centre[0] + ',' + p.centre[1] + '&travelmode=walking' : '';
    panel.innerHTML =
      '<div class="grave-panel-head"><h2 id="grave-panel-title">Plot <span class="records">' + esc(p.ref) + '</span></h2>' +
      '<button type="button" class="grave-panel-close" data-panel-close>' + esc(S.panel.closeLabel) + '</button></div>' +
      (p.thumb ? '<img class="grave-panel-photo" src="' + ROOT + esc(p.thumb) + '" alt="">' : '') +
      '<p class="grave-panel-meta">' + esc(S.panel.sectionLabel) + ' ' + esc(p.section) +
      ' &middot; <span class="grave-status grave-status--' + esc(p.status.toLowerCase()) + '">' + esc(statusLabel(p.status)) + '</span></p>' +
      people +
      '<p class="btn-row"><a class="btn" href="' + plotUrl(p) + '">' + esc(S.panel.detailsButton) + '</a>' +
      (dir ? '<a class="btn btn--secondary" href="' + dir + '" target="_blank" rel="noopener">' + esc(S.panel.directionsLabel) + '<span class="visually-hidden"> ' + esc(S.newWindowText) + '</span></a>' : '') +
      '</p><p><button type="button" class="grave-linkish" data-copy-link>' + esc(S.panel.shareLabel) + '</button> <span data-copy-status role="status" aria-live="polite"></span></p>' +
      requests;
    panel.hidden = false;
    var url = new URL(location.href);
    url.searchParams.set('plot', p.slug);
    history.replaceState(null, '', url.pathname + url.search);
    if (opts.from !== 'load') { panel.focus({ preventScroll: opts.from === 'map' }); }
    if (opts.from === 'map' && window.matchMedia('(max-width: 59.99em)').matches) { panel.scrollIntoView({ behavior: 'smooth', block: 'start' }); }
  }

  function closePanel() {
    panel.hidden = true;
    if (selected) {
      var prev = COLOURS[selected.status] || COLOURS.Unavailable;
      if (layersBySlug[selected.slug]) { layersBySlug[selected.slug].setStyle({ color: prev.line, weight: map.getZoom() >= 21 ? 2 : 1, fillOpacity: fillOpacity() }); }
      selected = null;
      applyStatusFilter();
    }
    var url = new URL(location.href);
    url.searchParams.delete('plot');
    history.replaceState(null, '', url.pathname + url.search);
  }

  panel.addEventListener('click', function (e) {
    if (e.target.closest('[data-panel-close]')) { closePanel(); input.focus(); }
    if (e.target.closest('[data-copy-link]')) {
      var link = location.origin + location.pathname + '?plot=' + selected.slug;
      var done = function () { panel.querySelector('[data-copy-status]').textContent = S.panel.copied; };
      if (navigator.clipboard) { navigator.clipboard.writeText(link).then(done, function () { prompt('', link); }); } else { prompt('', link); }
    }
  });

  // ---------- search --------------------------------------------------------

  var index = [];
  function buildIndex() {
    data.plots.forEach(function (p) {
      p.people.forEach(function (x) {
        index.push({ kind: 'person', plot: p, person: x, first: norm(x.first), last: norm(x.last), full: norm(x.name), diedYear: year(x.died) });
      });
      index.push({ kind: 'plot', plot: p, ref: norm(p.ref) });
    });
  }

  function criteria() {
    var fd = new FormData(form);
    return {
      q: norm(fd.get('q')), first: norm(fd.get('first')), last: norm(fd.get('last')),
      from: Number(fd.get('from')) || null, to: Number(fd.get('to')) || null, section: fd.get('section') || ''
    };
  }

  function search(c) {
    var words = c.q ? c.q.split(/\s+/) : [];
    var any = c.q || c.first || c.last || c.from || c.to || c.section;
    if (!any) { return null; }
    var out = [];
    index.forEach(function (e) {
      if (c.section && e.plot.section !== c.section) { return; }
      if (e.kind === 'plot') {
        if (c.first || c.last || c.from || c.to) { return; }
        if (c.q && (e.ref === c.q.replace(/\s+/g, '') || e.ref.indexOf(c.q.replace(/\s+/g, '')) === 0)) { out.push({ e: e, score: e.ref === c.q ? 0 : 1 }); }
        if (!c.q && c.section) { out.push({ e: e, score: 5 }); }
        return;
      }
      if (c.first && e.first.indexOf(c.first) !== 0) { return; }
      if (c.last && e.last.indexOf(c.last) !== 0) { return; }
      if (c.from && (!e.diedYear || e.diedYear < c.from)) { return; }
      if (c.to && (!e.diedYear || e.diedYear > c.to)) { return; }
      var score = 3;
      if (words.length) {
        var ok = words.every(function (w) { return e.full.indexOf(w) !== -1 || e.full.split(' ').some(function (part) { return part.indexOf(w) === 0; }); });
        if (!ok) { return; }
        if (e.last === words[words.length - 1] || e.last === words[0]) { score = 1; }
        else if (words.some(function (w) { return e.last.indexOf(w) === 0; })) { score = 2; }
      }
      out.push({ e: e, score: score });
    });
    out.sort(function (a, b) {
      if (a.score !== b.score) { return a.score - b.score; }
      var ea = a.e, eb = b.e;
      var la = ea.last || ea.ref || '', lb = eb.last || eb.ref || '';
      return la.localeCompare(lb) || (ea.first || '').localeCompare(eb.first || '') || ((ea.diedYear || 0) - (eb.diedYear || 0));
    });
    return out.map(function (x) { return x.e; });
  }

  function render(results) {
    resultsList.innerHTML = '';
    if (!results) { resultsWrap.hidden = true; clearBtn.hidden = true; return; }
    resultsWrap.hidden = false;
    clearBtn.hidden = false;
    var n = results.length;
    resultsCount.textContent = n === 0 ? S.search.noResults
      : (n === 1 ? S.search.resultsOne : S.search.resultsMany.replace('{n}', n)) +
        (n > MAX_RESULTS ? '. ' + S.search.tooMany.replace('{shown}', MAX_RESULTS).replace('{n}', n) : '');
    results.slice(0, MAX_RESULTS).forEach(function (e) {
      var li = document.createElement('li');
      var b = document.createElement('button');
      b.type = 'button';
      b.className = 'grave-result';
      if (e.kind === 'person') {
        b.innerHTML = '<span class="grave-result-name">' + esc(e.person.name) + '</span>' +
          '<span class="grave-result-meta records">' + esc([lifespan(e.person), 'Plot ' + e.plot.ref, e.plot.section].filter(Boolean).join(', ')) + '</span>';
      } else {
        b.innerHTML = '<span class="grave-result-name">Plot <span class="records">' + esc(e.plot.ref) + '</span></span>' +
          '<span class="grave-result-meta">' + esc([statusLabel(e.plot.status), e.plot.section, e.plot.people.map(function (x) { return x.name; }).join(', ')].filter(Boolean).join(', ')) + '</span>';
      }
      b.addEventListener('click', function () { selectPlot(e.plot, { fly: true, from: 'list' }); });
      li.appendChild(b);
      resultsList.appendChild(li);
    });
  }

  var timer;
  function runSearch() {
    var c = criteria();
    render(search(c));
    var url = new URL(location.href);
    if (c.q) { url.searchParams.set('q', form.elements.q.value.trim()); } else { url.searchParams.delete('q'); }
    history.replaceState(null, '', url.pathname + url.search);
  }
  form.addEventListener('input', function () { clearTimeout(timer); timer = setTimeout(runSearch, 200); });
  form.addEventListener('submit', function (e) {
    e.preventDefault();
    runSearch();
    var first = resultsList.querySelector('button');
    if (first && resultsList.children.length === 1) { first.click(); }
  });
  clearBtn.addEventListener('click', function () {
    form.reset();
    render(null);
    var url = new URL(location.href);
    url.searchParams.delete('q');
    history.replaceState(null, '', url.pathname + url.search);
    input.focus();
  });

  // ---------- tools ---------------------------------------------------------

  $$('[data-status-filter]').forEach(function (c) {
    c.addEventListener('change', function () { visibleStatuses[c.value] = c.checked; applyStatusFilter(); });
  });
  $('[data-reset]').addEventListener('click', function () { map.flyToBounds(app.homeBounds, { padding: [10, 10], duration: 0.8 }); });

  var youAreHere;
  $('[data-locate]').addEventListener('click', function () {
    if (!navigator.geolocation) { locateStatus.textContent = S.map.locateError; return; }
    navigator.geolocation.getCurrentPosition(function (pos) {
      var ll = [pos.coords.latitude, pos.coords.longitude];
      if (youAreHere) { map.removeLayer(youAreHere); }
      youAreHere = L.layerGroup([
        L.circle(ll, { radius: pos.coords.accuracy, color: '#0369A1', weight: 1, fillOpacity: 0.1, interactive: false }),
        L.circleMarker(ll, { radius: 8, color: '#FFFFFF', weight: 3, fillColor: '#0369A1', fillOpacity: 1, interactive: false })
      ]).addTo(map);
      map.flyTo(ll, Math.max(map.getZoom(), 19));
      locateStatus.textContent = '';
    }, function () { locateStatus.textContent = S.map.locateError; }, { enableHighAccuracy: true, timeout: 15000 });
  });

  // ---------- start ---------------------------------------------------------

  fetch(app.getAttribute('data-map-data'))
    .then(function (r) { return r.json(); })
    .then(function (d) {
      data = d;
      buildMap();
      buildIndex();
      var params = new URLSearchParams(location.search);
      if (params.get('q')) { input.value = params.get('q'); runSearch(); }
      var slug = params.get('plot');
      if (slug && plotsBySlug[slug]) {
        var p = plotsBySlug[slug];
        selectPlot(p, { fly: false, from: 'load' });
        if (p.centre) { map.setView(p.centre, NAME_ZOOM); }
      }
    })
    .catch(function () {
      mapEl.innerHTML = '<p class="grave-map-error">' + esc(S.map.noScript) + '</p>';
    });
})();
