/* ==========================================================================
   Broadford Cemetery Trust — accessible navigation
   --------------------------------------------------------------------------
   The navigation is a single flat list of links: Home, About, Grave search,
   Fees, History, Fundraiser, Policies, Contact. There are no submenus, so the
   only behaviour this file adds is the small-screen disclosure toggle.

   Progressive enhancement. With JavaScript disabled the markup is already a
   plain list: every link is visible and reachable, and the hamburger button is
   hidden by CSS. This file only ADDS the toggle on top.

     - the button is a real <button> with aria-expanded and aria-controls
     - Escape closes the menu and returns focus to the button
     - resizing to desktop always restores the visible list
     - works with touch; no hover dependency anywhere
   ========================================================================== */

(function () {
  'use strict';

  var nav = document.querySelector('[data-nav]');
  if (!nav) { return; }

  var toggle = document.querySelector('[data-nav-toggle]');
  if (!toggle) { return; }

  var DESKTOP = '(min-width: 62em)';

  function isDesktop() {
    return window.matchMedia && window.matchMedia(DESKTOP).matches;
  }

  function setNavOpen(open) {
    toggle.setAttribute('aria-expanded', open ? 'true' : 'false');
    if (open) {
      nav.removeAttribute('hidden');
    } else {
      nav.setAttribute('hidden', '');
    }
    var label = toggle.querySelector('[data-nav-toggle-label]');
    if (label) { label.textContent = open ? 'Close' : 'Menu'; }
  }

  function syncToViewport() {
    if (isDesktop()) {
      nav.removeAttribute('hidden');          // desktop: always visible
      toggle.setAttribute('aria-expanded', 'false');
    } else if (toggle.getAttribute('aria-expanded') !== 'true') {
      nav.setAttribute('hidden', '');
    }
  }

  toggle.setAttribute('aria-expanded', 'false');
  toggle.addEventListener('click', function () {
    setNavOpen(toggle.getAttribute('aria-expanded') !== 'true');
  });

  syncToViewport();
  window.addEventListener('resize', syncToViewport);

  document.addEventListener('keydown', function (event) {
    if (event.key !== 'Escape' && event.key !== 'Esc') { return; }
    if (toggle.getAttribute('aria-expanded') === 'true' && !isDesktop()) {
      setNavOpen(false);
      toggle.focus();
    }
  });
}());
