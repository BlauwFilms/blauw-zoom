# Blauw Films — Image Zoom

A premium image zoom overlay for Webflow rich-text fields and CMS image galleries. Built for the **Blauw Films Art Gallery** to give visitors a refined, tactile experience when exploring images in blog or editorial content.

---

## Features

| Feature | Detail |
|---|---|
| **Click to zoom** | Any image inside a Webflow rich-text block opens in a full-screen overlay |
| **Scroll to zoom in/out** | Mouse wheel and trackpad pinch control the zoom level |
| **Drag to pan** | Click-and-drag (or touch-drag) repositions the zoomed image freely |
| **Scroll to exit** | Scrolling below the minimum zoom threshold dismisses the overlay — no close button |
| **Pinch to zoom (mobile)** | Two-finger pinch gesture supported on touch devices |
| **Right-click preserved** | Native browser context menu always works so visitors can save images |
| **Gallery mode** | Images inside `data-blauw-zoom-group` open as a set: arrows, ← / → keys, trackpad or touch swipe, `2 / 8` counter, neighbours preloaded |
| **Replaces Webflow Lightbox** | Images inside a Webflow Lightbox Link in a group open here; the Webflow lightbox is bypassed |
| **Full resolution** | Picks the original upload from `src` / `srcset`, not the small responsive cut |
| **Swipe down to close (mobile)** | Same gesture as the product gallery |
| **Day / Night toggle** | Minimalist sun/moon icon in the top-right corner (50 % grey, 50 % opacity) |
| | Light mode backdrop: `#f9f9f9` |
| | Dark mode backdrop: `#101010` |
| | Preference is saved to `localStorage` across page loads |
| **Keyboard escape** | `Esc` key also closes the overlay |
| **Dynamic content** | One delegated click listener, so images injected later (CMS, pagination, tabs) work without rebinding |

---

## File Structure

```
/
├── css/
│   └── zoom.css        ← Stylesheet
├── js/
│   └── zoom.js         ← Script
└── README.md
```

---

## Deployment to GitHub Pages

1. Create a new public GitHub repository (e.g. `blauw-zoom`).
2. Push this entire folder to the `main` branch.
3. Go to **Settings → Pages** and set the source to **Deploy from a branch → main → / (root)**.
4. After a minute, your files will be live at:

```
https://blauwfilms.github.io/blauw-zoom/css/zoom.css
https://blauwfilms.github.io/blauw-zoom/js/zoom.js
```

---

## Webflow Integration

### 1. Add to `<head>` (Site Settings → Custom Code → Head)

```html
<link rel="stylesheet" href="https://blauwfilms.github.io/blauw-zoom/css/zoom.css">
```

### 2. Add before `</body>` (Site Settings → Custom Code → Footer)

```html
<script src="https://blauwfilms.github.io/blauw-zoom/js/zoom.js"></script>
```

> Replace `BlauwFilms` with your actual GitHub username and `blauw-zoom` with your repository name if different.

### 3. Galleries (CMS multi-image fields, collection lists)

Add the attribute `data-blauw-zoom-group` to the element that contains the images — usually the **Collection List** inside the Collection List Wrapper. Every image inside it becomes part of one gallery, in page order. The layout is untouched.

```
Collection List Wrapper
└── Collection List          ← data-blauw-zoom-group
    └── Collection Item
        └── Lightbox Link    ← may stay; or replace with a Div Block
            └── Image
```

Other attributes:

| Attribute | On | Effect |
|---|---|---|
| `data-blauw-zoom-group` | any container | Gallery of all images inside |
| `data-blauw-zoom` | an `<img>` | Zoom this single image anywhere on the page |
| `data-blauw-zoom="off"` | an `<img>` | Never zoom this image |

Events: `document.addEventListener("blauw:zoom", e => e.detail.action /* open | view | close */)`.

---

## Configuration

All tunable values are at the top of `zoom.js` inside the `CFG` object:

```js
var CFG = {
  ZOOM_STEP:     0.12,   // zoom speed per scroll tick (fraction)
  ZOOM_MIN:      0.3,    // minimum scale factor before auto-dismiss
  ZOOM_MAX:      6.0,    // maximum scale factor (clamp)
  DISMISS_BELOW: 0.55,   // scroll-out dismiss threshold (relative to fit scale)
  INITIAL_SCALE: 0.92,   // entrance animation start scale
  ANIM_MS:       280,    // open/close animation duration in milliseconds
  NAV_MS:        240,    // image-to-image transition in gallery mode
  SWIPE_MIN:     60,     // px horizontal touch swipe to change image
  SWIPE_CLOSE:   90,     // px downward touch swipe to close
  STORAGE_KEY:   "blauw-zoom-dark",     // localStorage key for dark mode preference
  RICH_TEXT_SEL: ".w-richtext, .rich-text, [class*='rich-text']",  // rich-text containers
  GROUP_SEL:     "[data-blauw-zoom-group]",                        // gallery containers
  SINGLE_SEL:    "img[data-blauw-zoom]"                            // single opt-in images
};
```

---

## How It Works

1. One click listener (capture phase) decides whether the clicked image is zoomable: inside rich text, inside a gallery group, or opted in with `data-blauw-zoom`. Capture runs before Webflow's handlers, which is how a Lightbox Link is bypassed.
2. On click, a cloned `<img>` flies from the source position to the viewport centre using a CSS transition.
3. The original image is made invisible (`opacity: 0`) so the zoom clone appears seamless.
4. The wheel event listener zooms by adjusting a CSS `scale()` transform. Dragging adjusts `translate()`.
5. When the zoom scale drops below `DISMISS_BELOW`, the overlay closes and the clone flies back out.
6. In a gallery, arrows, keys or swipes slide to the next image; the counter and preloading follow.

---

## Browser Support

All modern browsers (Chrome, Firefox, Safari, Edge). No dependencies — vanilla JS, no jQuery or Bootstrap required.

---

## License

MIT — free to use and modify for Blauw Films and beyond.
