/* ==========================================================================
   Broadford Cemetery Trust — contact form (FormSubmit)
   --------------------------------------------------------------------------
   The <form> already has action="https://formsubmit.co/broadfordct@gmail.com"
   and method="POST", so it works with JavaScript disabled — it just redirects
   to FormSubmit's own confirmation page.

   This file upgrades it: validate in the page, show errors next to the fields
   plus a summary at the top (WCAG 3.3.1 and 3.3.3), and submit over AJAX so
   the visitor stays on the Trust's page.

   FormSubmit requires the /ajax/ prefix and an Accept: application/json header
   for fetch submissions — the plain URL fails silently with XHR.

   Deployment note: FormSubmit sends a one-time confirmation email to
   broadfordct@gmail.com on the first submission from a new address, and the
   link in it must be clicked before messages are delivered. This activation
   has been completed for this endpoint.
   ========================================================================== */

(function () {
  'use strict';

  var AJAX_ENDPOINT = 'https://formsubmit.co/ajax/broadfordct@gmail.com';

  var form = document.getElementById('contact-form');
  if (!form) { return; }

  var status = document.getElementById('form-status');
  var summary = document.getElementById('form-errors');
  var summaryList = document.getElementById('form-errors-list');
  var button = form.querySelector('button[type="submit"]');

  var FIELDS = [
    { id: 'name', message: 'Enter your name so the Trust knows who is writing.' },
    { id: 'email', message: 'Enter an email address so the Trust can reply to you.' },
    { id: 'message', message: 'Enter your message.' }
  ];

  function setError(field, message) {
    var el = document.getElementById(field.id);
    var errEl = document.getElementById(field.id + '-error');
    if (!el || !errEl) { return; }
    if (message) {
      el.setAttribute('aria-invalid', 'true');
      errEl.textContent = message;
    } else {
      el.removeAttribute('aria-invalid');
      errEl.textContent = '';
    }
  }

  function looksLikeEmail(value) {
    return /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/.test(value);
  }

  function validate() {
    var problems = [];

    FIELDS.forEach(function (field) {
      var el = document.getElementById(field.id);
      if (!el) { return; }
      var value = (el.value || '').trim();

      if (!value) {
        setError(field, field.message);
        problems.push({ id: field.id, message: field.message });
        return;
      }
      if (field.id === 'email' && !looksLikeEmail(value)) {
        var m = 'Check the email address — it should look like name@example.com.';
        setError(field, m);
        problems.push({ id: field.id, message: m });
        return;
      }
      setError(field, '');
    });

    if (problems.length) {
      summaryList.innerHTML = '';
      problems.forEach(function (p) {
        var li = document.createElement('li');
        var a = document.createElement('a');
        a.href = '#' + p.id;
        a.textContent = p.message;
        a.addEventListener('click', function (e) {
          e.preventDefault();
          var target = document.getElementById(p.id);
          if (target) { target.focus(); }
        });
        li.appendChild(a);
        summaryList.appendChild(li);
      });
      summary.hidden = false;
      if (summary.scrollIntoView) { summary.scrollIntoView({ block: 'nearest' }); }
      var first = document.getElementById(problems[0].id);
      if (first) { first.focus(); }
    } else {
      summary.hidden = true;
      summaryList.innerHTML = '';
    }

    return problems.length === 0;
  }

  /* Clear a field's error as soon as the visitor fixes it */
  FIELDS.forEach(function (field) {
    var el = document.getElementById(field.id);
    if (!el) { return; }
    el.addEventListener('input', function () {
      if (el.getAttribute('aria-invalid') === 'true' && (el.value || '').trim()) {
        setError(field, '');
      }
    });
  });

  function showStatus(kind, heading, body) {
    status.className = 'form-status form-status--' + kind;
    status.innerHTML = '<h3>' + heading + '</h3><p>' + body + '</p>';
    status.hidden = false;
    if (status.scrollIntoView) { status.scrollIntoView({ block: 'nearest' }); }
  }

  form.addEventListener('submit', function (event) {
    event.preventDefault();
    status.hidden = true;

    if (!validate()) { return; }

    var data = new FormData(form);
    data.append('_replyto', data.get('email'));

    button.disabled = true;
    var original = button.textContent;
    button.textContent = 'Sending…';

    window.fetch(AJAX_ENDPOINT, {
      method: 'POST',
      body: data,
      headers: { Accept: 'application/json' }
    })
      .then(function (response) {
        if (!response.ok) { throw new Error('HTTP ' + response.status); }
        return response.json().catch(function () { return {}; });
      })
      .then(function () {
        showStatus('ok', 'Thank you — your message has been sent',
          'A trustee will reply to the email address you gave. The Trust is run by ' +
          'volunteers, so please allow a few days.');
        form.reset();
        FIELDS.forEach(function (f) { setError(f, ''); });
        button.textContent = 'Message sent';
      })
      .catch(function () {
        showStatus('error', 'Your message could not be sent',
          'Something went wrong on the way to our mail service. Please try again, or ' +
          'email the Trust directly at <a href="mailto:broadfordct@gmail.com">' +
          'broadfordct@gmail.com</a>.');
        button.disabled = false;
        button.textContent = original;
      });
  });
}());
