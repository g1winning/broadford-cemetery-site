/* ==========================================================================
   Broadford Cemetery Trust: request forms and "share a story"
   --------------------------------------------------------------------------
   Both forms send to the Trust's records system (the CMS), whose address is
   in data-endpoint. The plot (and for stories, the person) comes from the
   page address: ?plot=CE-5-7&person=<id>&name=<name>.
   Errors are shown beside each field and in a summary at the top, as on the
   contact page (WCAG 3.3.1 and 3.3.3).
   ========================================================================== */

(function () {
  'use strict';

  var form = document.querySelector('[data-request-form], [data-story-form]');
  if (!form) { return; }

  var T = JSON.parse(form.getAttribute('data-strings') || '{}');
  var ROOT = form.getAttribute('data-root') || '';
  var isStory = form.hasAttribute('data-story-form');
  var params = new URLSearchParams(location.search);
  var plotRef = params.get('plot') || '';
  var summary = document.getElementById('form-errors');
  var summaryList = document.getElementById('form-errors-list');
  var status = document.getElementById('form-status');
  var button = form.querySelector('button[type="submit"]');
  var MAX = 10 * 1024 * 1024;
  var TYPES = ['image/jpeg', 'image/png', 'image/webp', 'application/pdf'];

  function slugOf(ref) { return ref.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, ''); }

  // The plot this request or story is about.
  if (plotRef) {
    var plotInput = form.querySelector('[data-plot-input]');
    if (plotInput) { plotInput.value = plotRef; }
    document.querySelectorAll('[data-plot-ref]').forEach(function (el) { el.textContent = plotRef; });
    document.querySelectorAll('[data-plot-link]').forEach(function (a) { a.href = ROOT + 'grave-search/plot/' + slugOf(plotRef) + '/'; });
    document.querySelectorAll('[data-plot-line]').forEach(function (el) { el.hidden = false; });
  } else {
    document.querySelectorAll('[data-plot-link]').forEach(function (a) { a.href = ROOT + 'grave-search/'; });
  }
  if (isStory) {
    var personInput = form.querySelector('[data-person-input]');
    if (personInput) { personInput.value = params.get('person') || ''; }
    var about = document.querySelector('[data-about-name]');
    if (about) { about.textContent = params.get('name') || ''; }
  }
  // No address to send to (the records system is not online yet): say so
  // and give the Trust's email address instead of a form that cannot be sent.
  if (!form.getAttribute('data-endpoint')) {
    var off = document.querySelector('[data-forms-off]');
    if (off) { off.hidden = false; }
    form.hidden = true;
    return;
  }
  if (form.getAttribute('data-needs-plot') === 'yes' && !plotRef) {
    var none = document.querySelector('[data-no-plot]');
    if (none) { none.hidden = false; }
    form.hidden = true;
    return;
  }

  // ---------- signature pad -------------------------------------------------

  document.querySelectorAll('[data-signature]').forEach(function (box) {
    var canvas = box.querySelector('canvas');
    var hidden = box.querySelector('input[type="hidden"]');
    var ctx = canvas.getContext('2d');
    var drawing = false, drawn = false;
    ctx.lineWidth = 2.5; ctx.lineCap = 'round'; ctx.strokeStyle = '#020617';
    function point(e) {
      var r = canvas.getBoundingClientRect();
      return { x: (e.clientX - r.left) * canvas.width / r.width, y: (e.clientY - r.top) * canvas.height / r.height };
    }
    canvas.addEventListener('pointerdown', function (e) { drawing = true; canvas.setPointerCapture(e.pointerId); var p = point(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); });
    canvas.addEventListener('pointermove', function (e) { if (!drawing) { return; } var p = point(e); ctx.lineTo(p.x, p.y); ctx.stroke(); drawn = true; });
    function end() { if (!drawing) { return; } drawing = false; if (drawn) { hidden.value = canvas.toDataURL('image/png'); } }
    canvas.addEventListener('pointerup', end);
    canvas.addEventListener('pointercancel', end);
    box.querySelector('[data-signature-clear]').addEventListener('click', function () {
      ctx.clearRect(0, 0, canvas.width, canvas.height); hidden.value = ''; drawn = false;
    });
  });

  // ---------- validation ----------------------------------------------------

  function labelOf(el) {
    var l = form.querySelector('label[for="' + el.id + '"]');
    return l ? l.childNodes[0].textContent.trim() : el.name;
  }
  function setError(el, msg) {
    var err = document.getElementById(el.id + '-error');
    if (msg) { el.setAttribute('aria-invalid', 'true'); } else { el.removeAttribute('aria-invalid'); }
    if (err) { err.textContent = msg || ''; }
  }
  function check() {
    var problems = [];
    Array.prototype.forEach.call(form.elements, function (el) {
      if (!el.name || el.type === 'hidden' || el.closest('.honeypot') || !el.id) { return; }
      var msg = '';
      if (el.type === 'checkbox') {
        if (el.required && !el.checked) { msg = T.requiredMessage.replace('{label}', labelOf(el)); }
      } else if (el.type === 'file') {
        var files = Array.prototype.slice.call(el.files || []);
        if (el.required && !files.length) { msg = T.requiredMessage.replace('{label}', labelOf(el)); }
        files.forEach(function (f) {
          if (f.size > MAX) { msg = T.fileTooBig; }
          else if (TYPES.indexOf(f.type) === -1) { msg = T.fileType; }
        });
      } else {
        var v = el.value.trim();
        if (el.required && !v) { msg = T.requiredMessage.replace('{label}', labelOf(el)); }
        else if (v && el.type === 'email' && !/^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(v)) { msg = T.emailMessage; }
      }
      setError(el, msg);
      if (msg) { problems.push({ el: el, msg: msg }); }
    });
    return problems;
  }
  function showSummary(problems) {
    summaryList.innerHTML = '';
    problems.forEach(function (p) {
      var li = document.createElement('li');
      var a = document.createElement('a');
      a.href = '#' + p.el.id;
      a.textContent = p.msg;
      a.addEventListener('click', function (e) { e.preventDefault(); p.el.focus(); });
      li.appendChild(a);
      summaryList.appendChild(li);
    });
    summary.hidden = problems.length === 0;
    if (problems.length) { summary.focus(); }
  }

  // ---------- sending -------------------------------------------------------

  form.addEventListener('submit', function (e) {
    e.preventDefault();
    var problems = check();
    showSummary(problems);
    if (problems.length) { return; }

    var fd = new FormData(form);
    // A typed name stands in for a drawn signature.
    document.querySelectorAll('[data-signature]').forEach(function (box) {
      var name = box.getAttribute('data-name');
      var typed = fd.get(name + '_typed');
      if (!fd.get(name) && typed) { fd.set(name, 'typed:' + typed); }
      fd.delete(name + '_typed');
    });
    // Checkboxes that are not ticked are sent as nothing; send "no" so the Trust sees the answer.
    Array.prototype.forEach.call(form.querySelectorAll('input[type="checkbox"]'), function (c) { if (!c.checked) { fd.set(c.name, ''); } });

    var label = button.textContent;
    button.disabled = true;
    button.textContent = T.sending || label;
    fetch(form.getAttribute('data-endpoint'), { method: 'POST', body: fd, headers: { Accept: 'application/json' } })
      .then(function (r) { return r.json().then(function (j) { return { ok: r.ok, body: j }; }); })
      .then(function (res) {
        if (res.ok && res.body.ok) {
          form.hidden = true;
          summary.hidden = true;
          var ref = status.querySelector('[data-reference]');
          if (ref) { ref.textContent = res.body.reference || ''; }
          status.hidden = false;
          status.focus();
          return;
        }
        var fields = (res.body && res.body.fields) || {};
        var list = [];
        Object.keys(fields).forEach(function (name) {
          var el = form.querySelector('[name="' + name.replace(/"/g, '') + '"]');
          if (el && el.id) { setError(el, fields[name]); list.push({ el: el, msg: fields[name] }); }
        });
        if (!list.length) { list.push({ el: button, msg: (res.body && res.body.error) || T.failed }); }
        showSummary(list);
      })
      .catch(function () { showSummary([{ el: button, msg: T.failed }]); })
      .then(function () { button.disabled = false; button.textContent = label; });
  });
})();
