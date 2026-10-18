/*!
 * Blauw Films — Image Zoom v1.4.0
 * https://github.com/BlauwFilms/blauw-zoom · MIT
 *
 * What gets zoom:
 *  • Images inside Webflow rich text (unchanged since v1.0).
 *  • Images inside any element with  data-blauw-zoom-group  — opened as a
 *    gallery: arrows, ← / → keys, horizontal swipe or trackpad swipe, counter.
 *    Works on CMS collection lists, including ones that still use a Webflow
 *    Lightbox Link: the Webflow lightbox is bypassed.
 *  • Any single  <img data-blauw-zoom>.
 *  Opt out:  data-blauw-zoom="off"  on an image. Images marked
 *  data-blauw-bound="1" belong to another Blauw script (blauw-gallery).
 *
 * v1.4.0
 *  • Gallery mode (data-blauw-zoom-group)
 *  • Full-resolution source picked from src / srcset, neighbours preloaded
 *  • One delegated click listener replaces per-image binding + MutationObserver
 *  • Touch: swipe down to close; image settles back to centre when not zoomed
 *  • Page fallback (no rich text on the page) no longer hijacks linked images
 *  • Events on document: "blauw:zoom", detail.action = open | view | close
 *
 * v1.2.0
 *  • Clone sized to rendered px dimensions — pixel-perfect centring
 *  • Source visibility restored at start of close animation
 */

(function () {
  "use strict";
  if (window.BlauwZoom) return;

  var VERSION = "1.4.0";

  var CFG = {
    ZOOM_STEP:     0.12,
    ZOOM_MIN:      0.3,
    ZOOM_MAX:      6.0,
    DISMISS_BELOW: 0.55,
    INITIAL_SCALE: 0.88,
    ANIM_MS:       300,
    NAV_MS:        240,
    NAV_SHIFT:     48,     /* px the image slides when changing image */
    SWIPE_MIN:     60,     /* px horizontal touch swipe to change image */
    SWIPE_CLOSE:   90,     /* px downward touch swipe to close */
    WHEEL_NAV:     40,     /* accumulated horizontal wheel delta to change image */
    VIEW_PAD:      64,
    VIEW_PAD_NAV:  144,    /* side padding in gallery mode, keeps arrows clear */
    PAN_MARGIN:    80,
    STORAGE_KEY:   "blauw-zoom-dark",
    RICH_TEXT_SEL: ".w-richtext, .rich-text, [class*='rich-text']",
    GROUP_SEL:     "[data-blauw-zoom-group]",
    SINGLE_SEL:    "img[data-blauw-zoom]"
  };

  var state = {
    open: false, darkMode: false,
    scale: 1,
    x: 0, y: 0,
    dragging: false,
    dragStartX: 0, dragStartY: 0,
    imgStartX: 0,  imgStartY: 0,
    sourceImg: null,
    imgW: 0, imgH: 0,
    list: [], index: 0,
    token: 0, navLock: false,
    wheelAcc: 0, wheelLock: false, wheelTimer: null,
    swipeX: 0, swipeY: 0, swipeScale: 1, multiTouch: false
  };

  var overlay, stage, zoomImg, toggle, hint, prevBtn, nextBtn, counter;
  var dims = {};

  function clamp(v, lo, hi) { return Math.max(lo, Math.min(hi, v)); }
  function raf2(fn) { requestAnimationFrame(function () { requestAnimationFrame(fn); }); }
  function isGallery() { return state.list.length > 1; }

  function emit(action) {
    try {
      document.dispatchEvent(new CustomEvent("blauw:zoom", { detail: {
        action: action,
        index: state.index,
        total: state.list.length,
        src: state.sourceImg ? (state.sourceImg.currentSrc || state.sourceImg.src) : ""
      }}));
    } catch (e) {}
  }

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
      : "none";
    zoomImg.style.transform = "translate(" + state.x + "px," + state.y + "px) scale(" + state.scale + ")";
  }

  /* ── Day / night ─────────────────────────────────────────── */
  function setDarkMode(dark, skipStorage) {
    state.darkMode = dark;
    overlay.classList.toggle("dark-mode", dark);
    toggle.classList.toggle("dark", dark);
    toggle.setAttribute("aria-label", dark ? "Switch to light background" : "Switch to dark background");
    renderToggleIcon(dark);
    if (!skipStorage) {
      try { localStorage.setItem(CFG.STORAGE_KEY, dark ? "1" : "0"); } catch (e) {}
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

  function navButton(cls, label, points) {
    var b = document.createElement("button");
    b.className = "blauw-zoom-nav " + cls;
    b.setAttribute("type", "button");
    b.setAttribute("aria-label", label);
    b.innerHTML = '<svg viewBox="0 0 24 24" xmlns="http://www.w3.org/2000/svg"><polyline points="' + points + '"/></svg>';
    document.body.appendChild(b);
    return b;
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

    prevBtn = navButton("is-prev", "Previous image", "15 6 9 12 15 18");
    nextBtn = navButton("is-next", "Next image", "9 6 15 12 9 18");

    counter = document.createElement("div");
    counter.className = "blauw-zoom-counter";
    counter.setAttribute("aria-live", "polite");
    document.body.appendChild(counter);

    hint = document.createElement("div");
    hint.className = "blauw-zoom-hint";
    hint.textContent = "scroll to exit";
    document.body.appendChild(hint);

    var stored;
    try { stored = localStorage.getItem(CFG.STORAGE_KEY); } catch (e) {}
    setDarkMode(stored === "1", true);

    toggle.addEventListener("click", function (e) {
      e.stopPropagation();
      setDarkMode(!state.darkMode);
    });
    prevBtn.addEventListener("click", function (e) { e.stopPropagation(); go(-1); });
    nextBtn.addEventListener("click", function (e) { e.stopPropagation(); go(1); });
    overlay.addEventListener("click", close);
    stage.addEventListener("click", function (e) { if (e.target === stage) close(); });
  }

  function setChrome(on) {
    var nav = on && isGallery();
    toggle.classList.toggle("is-visible", on);
    hint.classList.toggle("is-visible", on);
    prevBtn.classList.toggle("is-visible", nav);
    nextBtn.classList.toggle("is-visible", nav);
    counter.classList.toggle("is-visible", nav);
  }

  /* ── Which images, which source ──────────────────────────── */
  function hasPageTargets() {
    return !!document.querySelector(CFG.RICH_TEXT_SEL + "," + CFG.GROUP_SEL + "," + CFG.SINGLE_SEL);
  }

  function isZoomable(img) {
    if (!img || img.tagName !== "IMG" || img === zoomImg) return false;
    if (img.dataset.blauwBound === "1") return false;          /* owned by blauw-gallery */
    var flag = img.getAttribute("data-blauw-zoom");
    if (flag === "off" || flag === "false") return false;
    if (flag !== null || img.closest(CFG.GROUP_SEL)) return true;
    if (img.closest(CFG.RICH_TEXT_SEL)) return true;
    /* Page with no rich text and no opt-ins: every image, as in v1.0–1.3,
       but never an image that is a link. */
    return !hasPageTargets() && !img.closest("a[href]");
  }

  function listFor(img) {
    var group = img.closest(CFG.GROUP_SEL);
    if (!group) return [img];
    var all = group.querySelectorAll("img"), out = [];
    for (var i = 0; i < all.length; i++) {
      var im = all[i];
      if (!isZoomable(im)) continue;
      if (im.closest(".w-condition-invisible")) continue;
      if (!im.getClientRects().length) continue;               /* display: none */
      if (!(im.getAttribute("src") || im.getAttribute("srcset"))) continue;
      out.push(im);
    }
    return out.indexOf(img) < 0 ? [img] : out;
  }

  var resolver = document.createElement("a");
  function abs(u) { resolver.href = u; return resolver.href; }

  /* Webflow keeps the original upload in src and smaller cuts in srcset.
     Prefer src unless it is itself one of the srcset cuts. */
  function bestSrc(img) {
    var src = img.getAttribute("src");
    var set = img.getAttribute("srcset");
    if (!set) return src ? abs(src) : (img.currentSrc || "");
    var best = "", bestW = 0, srcInSet = false, srcAbs = src ? abs(src) : "";
    set.split(",").forEach(function (part) {
      var bits = part.trim().split(/\s+/);
      if (!bits[0]) return;
      var url = abs(bits[0]);
      var w = parseInt(bits[1], 10) || 0;
      if (url === srcAbs) srcInSet = true;
      if (w >= bestW) { bestW = w; best = url; }
    });
    if (srcAbs && !srcInSet) return srcAbs;
    return best || srcAbs || img.currentSrc || "";
  }

  function load(src, cb) {
    if (!src) { cb(null); return; }
    if (dims[src]) { cb(dims[src]); return; }
    var im = new Image();
    im.decoding = "async";
    im.onload = function () {
      dims[src] = { w: im.naturalWidth, h: im.naturalHeight };
      cb(dims[src]);
    };
    im.onerror = function () { cb(null); };
    im.src = src;
  }

  function fitBox(nw, nh, capAtNatural) {
    var arrows = isGallery() && !(window.matchMedia && window.matchMedia("(hover: none)").matches);
    var vw = window.innerWidth  - (arrows ? CFG.VIEW_PAD_NAV : CFG.VIEW_PAD);
    var vh = window.innerHeight - CFG.VIEW_PAD;
    var s = Math.min(vw / nw, vh / nh);
    if (capAtNatural) s = Math.min(s, 1);
    return { w: Math.round(nw * s), h: Math.round(nh * s) };
  }

  function place(box) {
    state.imgW = box.w;
    state.imgH = box.h;
    zoomImg.style.width  = box.w + "px";
    zoomImg.style.height = box.h + "px";
    zoomImg.style.left   = Math.round(window.innerWidth  / 2 - box.w / 2) + "px";
    zoomImg.style.top    = Math.round(window.innerHeight / 2 - box.h / 2) + "px";
  }

  function updateCounter() {
    counter.textContent = isGallery() ? (state.index + 1) + " / " + state.list.length : "";
  }

  /* ── Show one image (open or after navigating) ───────────── */
  function showAt(idx, dir) {
    var token = ++state.token;
    var img   = state.list[idx];

    if (state.sourceImg && state.sourceImg !== img) state.sourceImg.style.visibility = "";
    state.sourceImg = img;
    state.index = idx;
    state.x = 0; state.y = 0; state.scale = 1;
    img.style.visibility = "hidden";
    updateCounter();

    var hi  = bestSrc(img);
    var low = img.currentSrc || img.src;

    function enter(src, box) {
      if (token !== state.token || !state.open) return;
      zoomImg.style.transition = "none";
      zoomImg.style.opacity    = "0";
      zoomImg.style.transform  = dir
        ? "translate(" + (dir * CFG.NAV_SHIFT) + "px,0px) scale(1)"
        : "translate(0px,0px) scale(" + CFG.INITIAL_SCALE + ")";
      zoomImg.src = src;
      zoomImg.alt = img.alt || "";
      place(box);
      raf2(function () {
        if (token !== state.token || !state.open) return;
        var ms = dir ? CFG.NAV_MS : CFG.ANIM_MS;
        zoomImg.style.transition = "transform " + ms + "ms cubic-bezier(0.22,1,0.36,1), opacity " + ms + "ms ease";
        zoomImg.style.opacity    = "1";
        zoomImg.style.transform  = "translate(0px,0px) scale(1)";
      });
    }

    function upgrade(d) {
      if (!d || token !== state.token || !state.open) return;
      if (zoomImg.src !== hi) zoomImg.src = hi;
      var box = fitBox(d.w, d.h, true);
      if (box.w !== state.imgW || box.h !== state.imgH) {
        place(box);
        applyTransform(true);
      }
    }

    if (dims[hi]) {
      enter(hi, fitBox(dims[hi].w, dims[hi].h, true));
    } else if (img.complete && img.naturalWidth) {
      /* show the already-loaded cut instantly, swap in full resolution when ready */
      enter(low, fitBox(img.naturalWidth, img.naturalHeight, low === hi));
      load(hi, upgrade);
    } else {
      load(hi, function (d) {
        if (d) enter(hi, fitBox(d.w, d.h, true));
        else   enter(low, fitBox(img.offsetWidth || 4, img.offsetHeight || 3, false));
      });
    }

    if (isGallery()) {
      var n = state.list.length;
      load(bestSrc(state.list[(idx + 1) % n]), function () {});
      load(bestSrc(state.list[(idx - 1 + n) % n]), function () {});
    }
    emit(dir ? "view" : "open");
  }

  function go(step) {
    if (!state.open || !isGallery() || state.navLock) return;
    var n   = state.list.length;
    var idx = (state.index + step + n) % n;
    var out = Math.round(CFG.NAV_MS * 0.6);
    state.navLock = true;
    zoomImg.style.transition = "transform " + out + "ms cubic-bezier(0.4,0,1,1), opacity " + out + "ms ease";
    zoomImg.style.opacity    = "0";
    zoomImg.style.transform  = "translate(" + (state.x - step * CFG.NAV_SHIFT) + "px," + state.y + "px) scale(" + state.scale + ")";
    setTimeout(function () {
      state.navLock = false;
      if (state.open) showAt(idx, step);
    }, out);
  }

  /* ── Open / close ────────────────────────────────────────── */
  function open(img) {
    if (state.open || !img) return;
    state.list  = listFor(img);
    state.open  = true;
    state.scale = 1;
    state.x = 0; state.y = 0;

    stage.appendChild(zoomImg);
    overlay.classList.add("is-active");
    stage.classList.add("is-active");
    setChrome(true);
    document.body.style.overflow = "hidden";

    showAt(Math.max(state.list.indexOf(img), 0), 0);
  }

  function close() {
    if (!state.open) return;
    emit("close");
    state.open = false;
    state.token++;
    state.dragging = false;

    /* Restore the source now, under the fading overlay — no pop */
    if (state.sourceImg) state.sourceImg.style.visibility = "";

    overlay.classList.remove("is-active");
    setChrome(false);
    document.body.style.overflow = "";

    zoomImg.style.transition = "transform " + CFG.ANIM_MS + "ms cubic-bezier(0.4,0,0.2,1), opacity " + Math.round(CFG.ANIM_MS * 0.7) + "ms ease";
    zoomImg.style.transform  = "translate(" + state.x + "px," + state.y + "px) scale(" + (state.scale * CFG.INITIAL_SCALE) + ")";
    zoomImg.style.opacity    = "0";

    setTimeout(function () {
      if (state.open) return;                      /* reopened during the fade */
      if (zoomImg.parentNode) zoomImg.parentNode.removeChild(zoomImg);
      stage.classList.remove("is-active");
      state.sourceImg = null;
      state.list = [];
      state.x = 0; state.y = 0; state.scale = 1;
    }, CFG.ANIM_MS + 40);
  }

  /* ── Wheel: vertical zooms (scroll out to exit), horizontal browses ── */
  function onWheel(e) {
    e.preventDefault();
    e.stopPropagation();
    var dx = e.deltaX || 0, dy = e.deltaY || 0;

    if (Math.abs(dx) > Math.abs(dy)) {
      if (!isGallery() || state.scale > 1.01) return;
      clearTimeout(state.wheelTimer);
      state.wheelTimer = setTimeout(function () { state.wheelLock = false; state.wheelAcc = 0; }, 250);
      if (state.wheelLock) return;                 /* wait out trackpad inertia */
      state.wheelAcc += dx;
      if (Math.abs(state.wheelAcc) >= CFG.WHEEL_NAV) {
        state.wheelLock = true;
        go(state.wheelAcc > 0 ? 1 : -1);
        state.wheelAcc = 0;
      }
      return;
    }

    var delta = dy || e.detail || (e.wheelDelta ? -e.wheelDelta : 0);
    if (!delta) return;
    var newScale = state.scale + (delta > 0 ? -1 : 1) * CFG.ZOOM_STEP * 4;
    if (newScale < CFG.DISMISS_BELOW) { close(); return; }
    state.scale = clamp(newScale, CFG.ZOOM_MIN, CFG.ZOOM_MAX);
    applyTransform(true);
  }

  /* ── Drag (mouse) ────────────────────────────────────────── */
  function onMouseDown(e) {
    if (!state.open || e.button === 2) return;
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

  /* ── Touch: drag, pinch, swipe ───────────────────────────── */
  var pinchStart = null, pinchScaleStart = null;

  function onTouchStart(e) {
    if (!state.open) return;
    if (e.touches.length === 1) {
      state.dragging   = true;
      state.multiTouch = false;
      state.dragStartX = state.swipeX = e.touches[0].clientX;
      state.dragStartY = state.swipeY = e.touches[0].clientY;
      state.imgStartX  = state.x;
      state.imgStartY  = state.y;
      state.swipeScale = state.scale;
      zoomImg.classList.add("is-dragging");
    } else if (e.touches.length === 2) {
      state.dragging   = false;
      state.multiTouch = true;
      pinchStart       = Math.hypot(e.touches[0].clientX - e.touches[1].clientX, e.touches[0].clientY - e.touches[1].clientY);
      pinchScaleStart  = state.scale;
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
    if (e.touches.length !== 0) return;
    var wasDragging = state.dragging;
    state.dragging = false; pinchStart = null; pinchScaleStart = null;
    zoomImg.classList.remove("is-dragging");
    if (!state.open || !wasDragging || state.multiTouch || state.swipeScale > 1.01) return;

    var t  = e.changedTouches && e.changedTouches[0];
    if (!t) return;
    var dx = t.clientX - state.swipeX;
    var dy = t.clientY - state.swipeY;

    if (isGallery() && Math.abs(dx) > CFG.SWIPE_MIN && Math.abs(dx) > Math.abs(dy) * 1.5) {
      go(dx < 0 ? 1 : -1);
      return;
    }
    if (dy > CFG.SWIPE_CLOSE && dy > Math.abs(dx) * 1.5) { close(); return; }

    /* not zoomed in: settle back to centre */
    state.x = 0; state.y = 0;
    applyTransform(true);
  }

  function onKeyDown(e) {
    if (!state.open) return;
    if (e.key === "Escape")     { close(); }
    else if (e.key === "ArrowRight") { e.preventDefault(); go(1); }
    else if (e.key === "ArrowLeft")  { e.preventDefault(); go(-1); }
  }

  /* ── One delegated click listener (capture phase) ────────────
     Capture runs before Webflow's own handlers, so an image inside a
     Webflow Lightbox Link opens here and the Webflow lightbox never does. */
  function onClick(e) {
    if (state.open) return;
    if (e.button !== 0 || e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
    var t = e.target;
    if (!t || !t.closest) return;

    var img = t.tagName === "IMG" ? t : null;
    if (!img) {
      var link = t.closest(CFG.GROUP_SEL + " a");
      if (link) img = link.querySelector("img");
    }
    if (!isZoomable(img)) return;

    e.preventDefault();
    e.stopPropagation();
    if (e.stopImmediatePropagation) e.stopImmediatePropagation();
    open(img);
  }

  function bindGlobal() {
    window.addEventListener("click", onClick, true);
    document.addEventListener("mousedown",  function (e) { if (e.target === zoomImg) onMouseDown(e); });
    document.addEventListener("mousemove",  onMouseMove);
    document.addEventListener("mouseup",    onMouseUp);
    document.addEventListener("touchstart", onTouchStart, { passive: false });
    document.addEventListener("touchmove",  onTouchMove,  { passive: false });
    document.addEventListener("touchend",   onTouchEnd);
    document.addEventListener("wheel",      function (e) { if (state.open) onWheel(e); }, { passive: false });
    document.addEventListener("keydown",    onKeyDown);
  }

  function init() { buildDOM(); bindGlobal(); }

  window.BlauwZoom = {
    version: VERSION,
    open:  function (img) { if (isZoomable(img)) open(img); },
    close: close,
    next:  function () { go(1); },
    prev:  function () { go(-1); }
  };

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", init);
  } else {
    init();
  }

})();
