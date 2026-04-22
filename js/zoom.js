/*!
 * Blauw Films — Rich Text Image Zoom v1.2.0
 *
 * v1.2.0 fixes:
 *  • Clone sized to rendered px dimensions with scale(1) transform —
 *    left/top centring is now pixel-perfect for every image
 *  • Source image visibility restored at start of close animation,
 *    not at end — eliminates the pop/fade-back-in glitch entirely
 */

(function () {
  "use strict";

  var CFG = {
    ZOOM_STEP:     0.12,
    ZOOM_MIN:      0.3,
    ZOOM_MAX:      6.0,
    DISMISS_BELOW: 0.55,
    INITIAL_SCALE: 0.88,
    ANIM_MS:       300,
    STORAGE_KEY:   "blauw-zoom-dark",
    RICH_TEXT_SEL: ".w-richtext, .rich-text, [class*='rich-text']",
    PAN_MARGIN:    80
  };

  var state = {
    open: false, darkMode: false,
    scale: 1, baseScale: 1,
    x: 0, y: 0,
    dragging: false,
    dragStartX: 0, dragStartY: 0,
    imgStartX: 0,  imgStartY: 0,
    sourceImg: null,
    imgW: 0, imgH: 0   /* rendered px dimensions at baseScale */
  };

  var overlay, stage, zoomImg, toggle, hint;

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }

  /* Pan bounds: keep PAN_MARGIN px of image visible on every edge */
  function clampPan(x, y) {
    var halfW = (state.imgW / 2) * state.scale;
    var halfH = (state.imgH / 2) * state.scale;
    var m     = CFG.PAN_MARGIN;
    return {
      x: clamp(x, -(Math.max(halfW - m, 0)), Math.max(halfW - m, 0)),
      y: clamp(y, -(Math.max(halfH - m, 0)), Math.max(halfH - m, 0))
    };
  }

  function applyTransform(animate) {
    if (!zoomImg) return;
    var c = clampPan(state.x, state.y);
    state.x = c.x; state.y = c.y;
    zoomImg.style.transition = animate
      ? "transform 0.18s cubic-bezier(0.25,0.46,0.45,0.94)"
      : "box-shadow 0.2s ease";
    zoomImg.style.transform = "translate(" + state.x + "px," + state.y + "px) scale(" + state.scale + ")";
  }

  function setDarkMode(dark, skipStorage) {
    state.darkMode = dark;
    if (dark) {
      overlay.classList.add("dark-mode");
      toggle.classList.add("dark");
      toggle.setAttribute("aria-label", "Switch to light background");
      renderToggleIcon(true);
    } else {
      overlay.classList.remove("dark-mode");
      toggle.classList.remove("dark");
      toggle.setAttribute("aria-label", "Switch to dark background");
      renderToggleIcon(false);
    }
    if (!skipStorage) {
      try { localStorage.setItem(CFG.STORAGE_KEY, dark ? "1" : "0"); } catch(e) {}
    }
  }

  function renderToggleIcon(isDark) {
    if (isDark) {
      toggle.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<circle cx="12" cy="12" r="4.5"/>' +
        '<line x1="12" y1="2"  x2="12" y2="5"/><line x1="12" y1="19" x2="12" y2="22"/>' +
        '<line x1="2"  y1="12" x2="5"  y2="12"/><line x1="19" y1="12" x2="22" y2="12"/>' +
        '<line x1="4.93" y1="4.93"   x2="7.05"  y2="7.05"/>' +
        '<line x1="16.95" y1="16.95" x2="19.07" y2="19.07"/>' +
        '<line x1="4.93" y1="19.07"  x2="7.05"  y2="16.95"/>' +
        '<line x1="16.95" y1="7.05"  x2="19.07" y2="4.93"/></svg>';
    } else {
      toggle.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg">' +
        '<path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z"/></svg>';
    }
  }

  function buildDOM() {
    overlay = document.createElement("div");
    overlay.className = "blauw-zoom-overlay";
    document.body.appendChild(overlay);

    stage = document.createElement("div");
    stage.className = "blauw-zoom-stage";
    document.body.appendChild(stage);

    zoomImg = document.createElement("img");
    zoomImg.className = "blauw-zoom-img";
    zoomImg.setAttribute("draggable", "false");

    toggle = document.createElement("button");
    toggle.className = "blauw-zoom-toggle";
    toggle.setAttribute("type", "button");
    document.body.appendChild(toggle);

    hint = document.createElement("div");
    hint.className = "blauw-zoom-hint";
    hint.textContent = "scroll to exit";
    document.body.appendChild(hint);

    var stored;
    try { stored = localStorage.getItem(CFG.STORAGE_KEY); } catch(e) {}
    setDarkMode(stored === "1", true);

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setDarkMode(!state.darkMode);
    });
    overlay.addEventListener("click", close);
    stage.addEventListener("click", function (e) { if (e.target === stage) close(); });
  }

  /* ── Open ────────────────────────────────────────────────── */
  function open(imgEl) {
    if (state.open) return;
    state.open      = true;
    state.sourceImg = imgEl;
    state.x = 0;
    state.y = 0;

    var vw = window.innerWidth  - 64;
    var vh = window.innerHeight - 64;
    var nw = imgEl.naturalWidth  || imgEl.offsetWidth  || vw;
    var nh = imgEl.naturalHeight || imgEl.offsetHeight || vh;

    /* baseScale: largest scale where image fits in viewport */
    state.baseScale = Math.min(vw / nw, vh / nh, 1);
    state.scale     = 1; /* we bake the scale into the element size */

    /*
     * KEY FIX: size the clone to its *rendered* pixel dimensions so that
     * left = (vw/2 - rw/2) and top = (vh/2 - rh/2) is always exact centre.
     * We set the CSS transform scale to 1 at rest — zooming then multiplies
     * from that baseline via state.scale which starts at 1.
     */
    var rw = nw * state.baseScale;
    var rh = nh * state.baseScale;
    state.imgW = rw;
    state.imgH = rh;

    var cw = window.innerWidth;
    var ch = window.innerHeight;

    zoomImg.src              = imgEl.src;
    zoomImg.alt              = imgEl.alt || "";
    zoomImg.style.width      = rw + "px";
    zoomImg.style.height     = rh + "px";
    zoomImg.style.left       = (cw / 2 - rw / 2) + "px";
    zoomImg.style.top        = (ch / 2 - rh / 2) + "px";
    zoomImg.style.transition = "none";
    zoomImg.style.opacity    = "0";
    zoomImg.style.transform  = "translate(0px,0px) scale(" + CFG.INITIAL_SCALE + ")";

    stage.appendChild(zoomImg);

    /* Hide source instantly — no fade */
    imgEl.style.visibility = "hidden";

    overlay.classList.add("is-active");
    stage.classList.add("is-active");
    toggle.classList.add("is-visible");
    hint.classList.add("is-visible");
    document.body.style.overflow = "hidden";

    requestAnimationFrame(function () {
      requestAnimationFrame(function () {
        zoomImg.style.transition = "transform " + CFG.ANIM_MS + "ms cubic-bezier(0.22,1,0.36,1), opacity " + CFG.ANIM_MS + "ms ease";
        zoomImg.style.opacity    = "1";
        zoomImg.style.transform  = "translate(0px,0px) scale(1)";
      });
    });
  }

  /* ── Close ───────────────────────────────────────────────── */
  function close() {
    if (!state.open) return;
    state.open = false;

    /*
     * KEY FIX: restore source visibility NOW, at the start of the close
     * animation — not at the end. The overlay fade hides the source img
     * while the clone fades out, so there is zero visible pop or gap.
     */
    if (state.sourceImg) state.sourceImg.style.visibility = "";

    overlay.classList.remove("is-active");
    toggle.classList.remove("is-visible");
    hint.classList.remove("is-visible");
    document.body.style.overflow = "";

    zoomImg.style.transition = "transform " + CFG.ANIM_MS + "ms cubic-bezier(0.4,0,0.2,1), opacity " + Math.round(CFG.ANIM_MS * 0.7) + "ms ease";
    zoomImg.style.transform  = "translate(" + state.x + "px," + state.y + "px) scale(" + (state.scale * CFG.INITIAL_SCALE) + ")";
    zoomImg.style.opacity    = "0";

    var src = state.sourceImg;
    setTimeout(function () {
      if (zoomImg.parentNode) zoomImg.parentNode.removeChild(zoomImg);
      stage.classList.remove("is-active");
      state.sourceImg = null;
      state.x = 0;
      state.y = 0;
      state.scale = 1;
    }, CFG.ANIM_MS + 40);
  }

  /* ── Wheel zoom ──────────────────────────────────────────── */
  function onWheel(e) {
    if (!state.open) return;
    e.preventDefault();
    e.stopPropagation();
    var delta     = e.deltaY || e.detail || (-e.wheelDelta);
    var direction = delta > 0 ? -1 : 1;
    var newScale  = state.scale + direction * CFG.ZOOM_STEP * 4;
    if (newScale < CFG.DISMISS_BELOW) { close(); return; }
    state.scale = clamp(newScale, CFG.ZOOM_MIN, CFG.ZOOM_MAX);
    applyTransform(true);
  }

  /* ── Drag (mouse) ────────────────────────────────────────── */
  function onMouseDown(e) {
    if (!state.open) return;
    if (e.button === 2) return;
    e.preventDefault();
    state.dragging   = true;
    state.dragStartX = e.clientX;
    state.dragStartY = e.clientY;
    state.imgStartX  = state.x;
    state.imgStartY  = state.y;
    zoomImg.classList.add("is-dragging");
  }

  function onMouseMove(e) {
    if (!state.dragging) return;
    state.x = state.imgStartX + (e.clientX - state.dragStartX);
    state.y = state.imgStartY + (e.clientY - state.dragStartY);
    applyTransform(false);
  }

  function onMouseUp() {
    if (!state.dragging) return;
    state.dragging = false;
    zoomImg.classList.remove("is-dragging");
  }

  /* ── Drag (touch) ────────────────────────────────────────── */
  var pinchStart = null, pinchScaleStart = null;

  function onTouchStart(e) {
    if (!state.open) return;
    if (e.touches.length === 1) {
      state.dragging   = true;
      state.dragStartX = e.touches[0].clientX;
      state.dragStartY = e.touches[0].clientY;
      state.imgStartX  = state.x;
      state.imgStartY  = state.y;
      zoomImg.classList.add("is-dragging");
    } else if (e.touches.length === 2) {
      state.dragging  = false;
      pinchStart      = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchScaleStart = state.scale;
    }
  }

  function onTouchMove(e) {
    if (!state.open) return;
    e.preventDefault();
    if (e.touches.length === 1 && state.dragging) {
      state.x = state.imgStartX + (e.touches[0].clientX - state.dragStartX);
      state.y = state.imgStartY + (e.touches[0].clientY - state.dragStartY);
      applyTransform(false);
    } else if (e.touches.length === 2 && pinchStart !== null) {
      var dist = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      state.scale = clamp(pinchScaleStart * (dist / pinchStart), CFG.ZOOM_MIN, CFG.ZOOM_MAX);
      applyTransform(true);
    }
  }

  function onTouchEnd(e) {
    if (e.touches.length === 0) {
      state.dragging = false; pinchStart = null; pinchScaleStart = null;
      zoomImg.classList.remove("is-dragging");
    }
  }

  function onKeyDown(e) { if (state.open && e.key === "Escape") close(); }

  /* ── Bind images ─────────────────────────────────────────── */
  function bindImages() {
    var containers = document.querySelectorAll(CFG.RICH_TEXT_SEL);
    if (!containers.length) containers = [document.body];
    containers.forEach(function (container) {
      container.querySelectorAll("img").forEach(function (img) {
        if (img.dataset.blauwBound) return;
        img.dataset.blauwBound = "1";
        img.addEventListener("click", function (e) {
          e.preventDefault();
          if (state.open) { close(); return; }
          open(img);
        });
      });
    });
  }

  function bindGlobal() {
    document.addEventListener("mousedown",  function(e){ if(e.target === zoomImg) onMouseDown(e); });
    document.addEventListener("mousemove",  onMouseMove);
    document.addEventListener("mouseup",    onMouseUp);
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove",  onTouchMove,  { passive: false });
    document.addEventListener("touchend",   onTouchEnd);
    document.addEventListener("wheel",      function(e){ if (state.open) onWheel(e); }, { passive: false });
    document.addEventListener("keydown",    onKeyDown);
  }

  function observeDOM() {
    if (!window.MutationObserver) return;
    var o = new MutationObserver(function (m) {
      var needs = false;
      m.forEach(function(n){ if(n.addedNodes.length) needs = true; });
      if (needs) bindImages();
    });
    o.observe(document.body, { childList: true, subtree: true });
  }

  function init() { buildDOM(); bindImages(); bindGlobal(); observeDOM(); }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
