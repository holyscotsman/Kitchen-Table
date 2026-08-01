/* ==========================================================================
   Kitchen Table — app.js

   Plain ES2018, no build step, no framework. A hash router over three screens:
     #            → Main
     #menu        → Menu   (#menu?who=Joan / #menu?cat=Dinner pre-filter it)
     #<recipe-id> → Recipe

   Rendering is a full re-render of the active screen into #app on every state
   change, with focus and caret position restored afterwards. At this size that
   is simpler and less error-prone than diffing, and stays well inside a frame.

   Layout of this file:
     1.  Constants + storage
     2.  Icons
     3.  State
     4.  Quantity scaling
     5.  Helpers
     6.  Main screen
     7.  Menu screen
     8.  Recipe screen — viewer
     9.  Recipe screen — edit
     10. Sheets (filter, sort, download)
     11. Share / download / wake lock
     12. Router + boot
   ========================================================================== */
(function () {
  "use strict";

  /* ======================================================================
     1. Constants + storage
     ====================================================================== */

  /* Rendered in the bottom corner of every screen. The 1.0 gameplan in
     GAMEPLAN.md is what closes the gap: when its 130 tasks are done this
     becomes "1.0" and nothing else about the stamp changes. */
  var VERSION = "0.9";

  var FS = [20, 24, 29, 34, 40]; // px; index 1 (24px) is the default
  var DEFAULT_FS = 1;
  /* Meal order, so the "Course" sort reads like a day rather than an
     alphabetical list. Sides and Drinks are here because the collection has 10
     side dishes and a lemonade, and folding them into Dinner/Cocktails would
     have mislabelled about a fifth of the recipes. */
  var CATS = [
    "Breakfast", "Brunch", "Lunch", "Dinner", "Sides",
    "Snacks", "Baking", "Desserts", "Cocktails", "Drinks"
  ];

  /* Older category names, kept so a device with a saved overlay from before
     the rename doesn't end up with recipes that match no filter. */
  var CAT_ALIASES = {
    Side: "Sides", Dessert: "Desserts", Snack: "Snacks", Drink: "Drinks"
  };

  /* Everyone with a section, whether or not they have recipes yet. Joan holds
     the whole collection today; the rest are here so there is somewhere to put
     a recipe when they contribute one. */
  var WHO = ["Joan", "Jason", "Jennifer", "Lindsay", "Siobhan"];

  /* Earlier names, mapped so a device holding a saved overlay keeps resolving. */
  var WHO_ALIASES = { Mom: "Joan", Me: "Jason" };
  var FIELD_ORDER = [
    "id", "title", "category", "contributor", "servings", "prepTime",
    "cookTime", "ingredients", "steps", "notes", "flagged", "source",
    "image", "tags"
  ];

  var SORTS = [
    { key: "recent", label: "Recently added" },
    { key: "az", label: "Name A – Z" },
    { key: "course", label: "Course" }
  ];

  var K = {
    theme: "kt.theme",
    fs: "kt.fsIndex",
    easyRead: "kt.easyRead",
    recipes: "kt.recipes",
    images: "kt.images"
  };

  /* Photos are held apart from the recipe records, keyed by id. Inlining data
     URLs into kt.recipes would put multi-hundred-kilobyte blobs into the file
     that "Download updated recipes.json" produces, which then gets committed —
     the download writes an images/<id>.jpg path instead, and the picture comes
     out of "Download photos" as a real file. */
  var IMG_MAX_EDGE = 1200;
  var IMG_QUALITY = 0.72;

  /* Easy Read never drops the reader below this step. The A−/A+ stepper still
     works above it — the mode is additive, not a replacement. */
  var EASY_MIN_FS = 2;

  /* A static page cannot fetch another origin, so the page has to come through
     a relay. Any one free relay goes down — allorigins was returning 522 for a
     while — so they are tried in turn, and the last one returns readable text
     rather than HTML, which the photo parser can still make sense of. If every
     one of them fails there is always the paste box, which needs no network. */
  var RELAYS = [
    { url: function (u) { return u; }, kind: "html" },
    { url: function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); }, kind: "html" },
    { url: function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); }, kind: "html" },
    { url: function (u) { return "https://r.jina.ai/" + u; }, kind: "text" }
  ];
  var RELAY_TIMEOUT = 12000;
  var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5/dist/tesseract.min.js";

  function load(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (e) {
      return fallback;
    }
  }

  function save(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
    } catch (e) {
      /* Private browsing — preferences just won't persist. */
    }
  }

  /* ======================================================================
     2. Icons — hand-written inline SVG, stroke-based, currentColor
     ====================================================================== */

  function svg(paths, w, h) {
    return (
      '<svg viewBox="0 0 24 24" width="' + (w || 22) + '" height="' + (h || 22) +
      '" fill="none" stroke="currentColor" stroke-width="2.2" ' +
      'stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      paths + "</svg>"
    );
  }

  var I = {
    search: function () {
      return svg('<circle cx="11" cy="11" r="7"/><path d="M20 20l-3.5-3.5"/>');
    },
    sun: function () {
      return svg(
        '<circle cx="12" cy="12" r="4"/><path d="M12 2v2M12 20v2M2 12h2M20 12h2' +
        'M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M19.1 4.9l-1.4 1.4M6.3 17.7l-1.4 1.4"/>'
      );
    },
    moon: function () {
      return svg('<path d="M20 14.5A8.5 8.5 0 019.5 4a8.5 8.5 0 1010.5 10.5z"/>');
    },
    chevL: function () {
      return svg('<path d="M15 5l-7 7 7 7"/>', 20, 20);
    },
    chevR: function (w, h) {
      return svg('<path d="M9 5l7 7-7 7"/>', w || 13, h || 22);
    },
    chevD: function () {
      return svg('<path d="M6 9l6 6 6-6"/>', 20, 20);
    },
    filter: function () {
      return svg('<path d="M4 7h16M7 12h10M10 17h4"/>', 20, 20);
    },
    plus: function (s) {
      return svg('<path d="M12 5v14M5 12h14"/>', s || 22, s || 22);
    },
    minus: function (s) {
      return svg('<path d="M5 12h14"/>', s || 22, s || 22);
    },
    check: function (s) {
      return svg('<path d="M5 12.5l4.5 4.5L19 7"/>', s || 18, s || 18);
    },
    x: function () {
      return svg('<path d="M6 6l12 12M18 6L6 18"/>', 20, 20);
    },
    share: function () {
      return svg(
        '<path d="M12 15V4M8.5 7.5L12 4l3.5 3.5"/>' +
        '<path d="M5 13v5.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V13"/>',
        20, 20
      );
    },
    download: function () {
      return svg(
        '<path d="M12 4v11M8.5 11.5L12 15l3.5-3.5"/>' +
        '<path d="M5 15v3.5A1.5 1.5 0 006.5 20h11a1.5 1.5 0 001.5-1.5V15"/>',
        20, 20
      );
    },
    photo: function () {
      return svg(
        '<rect x="3" y="5" width="18" height="14" rx="2"/>' +
        '<circle cx="8.5" cy="10" r="1.2"/><path d="M21 16l-5-5-6 6"/>',
        28, 28
      );
    },
    book: function (s) {
      return svg(
        '<path d="M4 5.5h6a2 2 0 012 2V19a2 2 0 00-2-2H4z"/>' +
        '<path d="M20 5.5h-6a2 2 0 00-2 2V19a2 2 0 012-2h6z"/>',
        s || 26, s || 26
      );
    }
  };

  /* One per category, drawn rather than pulled from a library — the handoff
     asks for stroke-based inline SVG in currentColor and nothing else. */
  var CAT_ICON = {
    Breakfast: '<ellipse cx="12" cy="12" rx="8" ry="6"/><circle cx="12" cy="12" r="2.6"/>',
    Brunch: '<path d="M6 5h9v5a4.5 4.5 0 01-9 0z"/><path d="M15 6.5h1.8a2 2 0 010 4H15"/><path d="M4 19h13"/>',
    Lunch: '<path d="M3.5 15l8.5-8 8.5 8z"/><path d="M3.5 15h17"/><path d="M6 18.5h12"/>',
    Dinner: '<path d="M6 3v8a2 2 0 004 0V3"/><path d="M8 11v10"/><path d="M17 3c-1.6 1.4-2.2 3.4-2 6 .1 1.3.7 2 2 2z"/><path d="M17 11v10"/>',
    Sides: '<path d="M3.5 11h17a8.5 8.5 0 01-17 0z"/><path d="M2.5 20h19"/>',
    Snacks: '<circle cx="12" cy="12" r="8"/><circle cx="9.5" cy="10" r="1"/><circle cx="14" cy="9.5" r="1"/><circle cx="12.5" cy="14.5" r="1"/>',
    Baking: '<path d="M6.5 4.5l11 11"/><path d="M4.5 8.5a3 3 0 014-4l11 11a3 3 0 01-4 4z"/>',
    Desserts: '<path d="M7 10h10l-1.4 9.5a1.5 1.5 0 01-1.5 1.3h-4.2a1.5 1.5 0 01-1.5-1.3z"/><path d="M8 10a4 4 0 018 0"/><path d="M12 3v3"/>',
    Cocktails: '<path d="M4 5h16l-8 8z"/><path d="M12 13v7"/><path d="M8.5 20h7"/>',
    Drinks: '<path d="M7 4h10l-1.2 15a1.6 1.6 0 01-1.6 1.4h-4.4A1.6 1.6 0 018.2 19z"/><path d="M7.6 10h8.8"/>'
  };

  function catIcon(category, size) {
    var paths = CAT_ICON[category];
    if (!paths) return "";
    return svg(paths, size || 22, size || 22);
  }

  /* Artwork, as opposed to icons. These fill a slot that would otherwise be
     blank — a recipe with no photograph, a search that found nothing — so they
     are decorative by definition and always aria-hidden. Same stroke language
     as the icons above, same currentColor, no new palette. The steam drifts;
     the CSS turns that off under prefers-reduced-motion. */
  var ART = {
    /* Bowl on a table with three wisps of steam. Stands in for a hero photo. */
    steam: function () {
      return (
        '<svg class="art art--steam" viewBox="0 0 120 92" fill="none" ' +
        'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' +
        '<path class="wisp wisp--a" d="M44 48c-6-6 6-10 0-16s6-10 0-16"/>' +
        '<path class="wisp wisp--b" d="M60 44c-6-7 6-11 0-19s6-11 0-19"/>' +
        '<path class="wisp wisp--c" d="M76 48c-6-6 6-10 0-16s6-10 0-16"/>' +
        '<path d="M26 58q34 26 68 0"/>' +
        '<path d="M20 58h80"/>' +
        '<path d="M12 80h96"/>' +
        "</svg>"
      );
    },
    /* An empty plate, for the states where there is genuinely nothing. */
    empty: function () {
      return (
        '<svg class="art art--empty" viewBox="0 0 120 92" fill="none" ' +
        'stroke="currentColor" stroke-width="2.6" stroke-linecap="round" ' +
        'stroke-linejoin="round" aria-hidden="true">' +
        '<ellipse cx="60" cy="48" rx="34" ry="26"/>' +
        '<ellipse cx="60" cy="48" rx="21" ry="15"/>' +
        "</svg>"
      );
    }
  };

  /* ======================================================================
     3. State
     ====================================================================== */

  var S = {
    base: [],      // recipes.json as shipped
    recipes: [],   // base with the localStorage overlay applied
    loaded: false,
    error: "",

    theme: load(K.theme, "dark") === "light" ? "light" : "dark",
    fsIndex: (function () {
      var v = load(K.fs, DEFAULT_FS);
      return typeof v === "number" && v >= 0 && v < FS.length ? v : DEFAULT_FS;
    })(),
    easyRead: load(K.easyRead, false) === true,

    route: { name: "main", id: "" },

    textOpen: false,

    /* Add / Import flow */
    addStep: "choose",   // choose | link | photo | review
    addBusy: "",
    addError: "",
    addDraft: null,
    addUrl: "",
    addPaste: "",
    addPhoto: null,

    mainQ: "",

    menuQ: "",
    searchOpen: false,
    filterOpen: false,
    sortOpen: false,
    who: [],
    cats: [],
    tags: [],
    sort: "recent",
    removing: false,

    editing: false,
    serves: null,
    checkedIng: {},
    checkedStep: {},
    awake: false,
    dlOpen: false,
    draft: null,
    saved: false,

    notice: "",

    /* Motion cues. Rendering is a full rebuild, so a CSS animation attached to
       an element replays on every re-render unless something says which change
       caused it. These flags are set by the action that earned the animation
       and cleared the moment they are read, so a filter tap never re-plays a
       tick that was checked ten renders ago. */
    pulseRow: "",      // "i:3" / "s:0" — the row just checked
    pulseScale: false, // servings just changed
    pulseTheme: false, // theme just toggled
    pulseSheet: false, // a sheet just opened
    paintedRoute: ""   // last route actually painted, for the enter animation
  };

  function applyTheme() {
    if (S.theme === "light") {
      document.documentElement.setAttribute("data-theme", "light");
    } else {
      document.documentElement.removeAttribute("data-theme");
    }
    var meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute("content", S.theme === "light" ? "#F3F6F3" : "#0E1712");
    applyEasy();
  }

  function applyEasy() {
    if (S.easyRead) document.documentElement.setAttribute("data-easy", "on");
    else document.documentElement.removeAttribute("data-easy");
  }

  /* The step actually used for reading — Easy Read raises the floor. */
  function effectiveFs() {
    return S.easyRead ? Math.max(EASY_MIN_FS, S.fsIndex) : S.fsIndex;
  }

  function toggleEasy() {
    S.easyRead = !S.easyRead;
    save(K.easyRead, S.easyRead);
    applyEasy();
    render();
  }

  function toggleTheme() {
    S.theme = S.theme === "light" ? "dark" : "light";
    save(K.theme, S.theme);
    S.pulseTheme = true;
    applyTheme();
    render();
  }

  function stepFs(delta) {
    var floor = S.easyRead ? EASY_MIN_FS : 0;
    var next = Math.min(FS.length - 1, Math.max(floor, effectiveFs() + delta));
    if (next === S.fsIndex) return;
    S.fsIndex = next;
    save(K.fs, next);
    render();
  }

  /* ======================================================================
     4. Quantity scaling — ported from the design reference

     Scales the leading quantity of a line only; the rest of the string is
     untouched. Lines with no leading number pass through unchanged, which is
     correct: "Salt and pepper to taste" should not acquire a number.
     ====================================================================== */

  var VULGAR = [[0.25, "¼"], [0.333, "⅓"], [0.5, "½"],
                [0.667, "⅔"], [0.75, "¾"]];

  function fmtQty(n) {
    var whole = Math.floor(n + 1e-9);
    var frac = n - whole;
    var f = "";
    for (var i = 0; i < VULGAR.length; i++) {
      if (Math.abs(frac - VULGAR[i][0]) < 0.03) f = VULGAR[i][1];
    }
    if (!f && frac > 0.03) return String(Math.round(n * 100) / 100);
    if (whole === 0) return f || "0";
    return f ? whole + f : String(whole);
  }

  function scaleLine(text, mult) {
    if (Math.abs(mult - 1) < 0.001) return text;
    return String(text).replace(
      /^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)/,
      function (m) {
        var n;
        if (m.indexOf("/") >= 0) {
          var parts = m.trim().split(/\s+/);
          var frac = parts[parts.length - 1].split("/");
          n = (parts.length > 1 ? parseFloat(parts[0]) : 0) +
              parseFloat(frac[0]) / parseFloat(frac[1]);
        } else {
          n = parseFloat(m);
        }
        return fmtQty(n * mult);
      }
    );
  }

  /* ======================================================================
     5. Helpers
     ====================================================================== */

  /* The escaping rule, audited across every render path (gameplan 044):
     anything that can carry user or imported text — titles, ingredients,
     steps, notes, tags, contributor, source, flagged entries, error
     messages — goes through esc() at the point of interpolation. What is
     interpolated bare is only ever one of: a number (counts, servings, font
     px), a boolean into an ARIA attribute, an internal constant (sort keys,
     element ids, class fragments), or markup built by the icon helpers.
     recipe ids reach hrefs escaped and are slugified [a-z0-9-] besides.
     Plain-text sinks — recipeText, confirm(), fetch URLs — are not HTML and
     need no escaping. */
  function esc(v) {
    return String(v == null ? "" : v)
      .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
  }

  function byId(id) {
    for (var i = 0; i < S.recipes.length; i++) {
      if (S.recipes[i].id === id) return S.recipes[i];
    }
    return null;
  }

  /* Title, ingredients, and tags — so "Thai" finds a dish tagged Thai even
     when the word appears nowhere in the recipe itself. */
  function matchesQuery(r, q) {
    if (!q) return true;
    if (r.title.toLowerCase().indexOf(q) > -1) return true;
    if (tagsOf(r).some(function (t) { return t.toLowerCase().indexOf(q) > -1; })) return true;
    return (r.ingredients || []).some(function (i) {
      return i.toLowerCase().indexOf(q) > -1;
    });
  }

  function countBy(list, key, value) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (list[i][key] === value) n++;
    return n;
  }

  function themeBtn(extraClass) {
    var spin = S.pulseTheme ? " themebtn--spin" : "";
    return (
      '<button type="button" class="iconbtn press themebtn' + spin + " " +
      (extraClass || "") + '" data-act="theme" aria-label="Switch to ' +
      (S.theme === "light" ? "dark" : "light") + ' mode">' +
      (S.theme === "light" ? I.moon() : I.sun()) + "</button>"
    );
  }

  /* kt.recipes holds "the full edited recipe set", so when it exists it is
     authoritative — including about what is *absent*.

     An earlier version merged it over the shipped file id by id, which meant a
     removed recipe reappeared on the next load: it was missing from the
     overlay, so the lookup fell through to the published copy. Treating the
     overlay as the complete list is what makes Remove actually stick.

     The trade-off: once a device has local changes, recipes added to the
     published recipes.json won't appear there until those changes are
     downloaded and committed, or undone with "Undo all my changes". */
  function applyOverlay() {
    var overlay = load(K.recipes, null);
    S.recipes = (Array.isArray(overlay) ? overlay : S.base).map(normalizeRecipe);
  }

  function normalizeRecipe(r) {
    var out = {};
    Object.keys(r).forEach(function (k) { out[k] = r[k]; });
    if (WHO_ALIASES[out.contributor]) out.contributor = WHO_ALIASES[out.contributor];
    if (CAT_ALIASES[out.category]) out.category = CAT_ALIASES[out.category];
    if (CATS.indexOf(out.category) === -1) out.category = "Dinner";
    if (out.tags && !Array.isArray(out.tags)) delete out.tags;
    return out;
  }

  function persistRecipes() {
    save(K.recipes, S.recipes);
  }

  /* ---- photos ---- */

  function images() {
    return load(K.images, {}) || {};
  }

  /* A local photo wins over the published path, so a freshly attached picture
     shows before anyone has committed the file. */
  function imageFor(recipe) {
    return images()[recipe.id] || recipe.image || "";
  }

  function setImage(id, dataUrl) {
    var map = images();
    map[id] = dataUrl;
    try {
      localStorage.setItem(K.images, JSON.stringify(map));
      return "";
    } catch (e) {
      return "There isn’t room on this phone for another photo. Download your " +
             "photos and recipes.json, commit them, then remove some here.";
    }
  }

  function removeImage(id) {
    var map = images();
    delete map[id];
    save(K.images, map);
  }

  /* Downscaled in the browser: a phone photo is several megabytes and
     localStorage is a few, so full-size originals fill it after two or three. */
  function readPhoto(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = function () { reject(new Error("That image couldn’t be read.")); };
      reader.onload = function () {
        var img = new Image();
        img.onerror = function () { reject(new Error("That file isn’t an image this phone can open.")); };
        img.onload = function () {
          var scale = Math.min(1, IMG_MAX_EDGE / Math.max(img.width, img.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(img.width * scale);
          canvas.height = Math.round(img.height * scale);
          canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
          resolve(canvas.toDataURL("image/jpeg", IMG_QUALITY));
        };
        img.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ---- tags ---- */

  function tagsOf(recipe) {
    return Array.isArray(recipe.tags) ? recipe.tags : [];
  }

  function allTags() {
    var seen = {};
    S.recipes.forEach(function (r) {
      tagsOf(r).forEach(function (t) { seen[t] = true; });
    });
    return Object.keys(seen).sort(function (a, b) { return a.localeCompare(b); });
  }

  function parseTags(text) {
    var seen = {};
    var out = [];
    String(text || "").split(",").forEach(function (raw) {
      var t = raw.trim().replace(/\s+/g, " ");
      if (!t) return;
      var key = t.toLowerCase();
      if (seen[key]) return;
      seen[key] = true;
      out.push(t);
    });
    return out;
  }

  function orderFields(recipe) {
    var out = {};
    FIELD_ORDER.forEach(function (k) {
      if (recipe[k] !== undefined && recipe[k] !== "") out[k] = recipe[k];
    });
    /* A locally attached photo becomes a repo path, not a base64 blob — the
       committed recipes.json stays readable and small. */
    if (images()[recipe.id]) out.image = "images/" + recipe.id + ".jpg";
    return out;
  }

  /* Saves each attached photo as images/<id>.jpg, one file at a time. Browsers
     rate-limit rapid downloads, hence the stagger. */
  function downloadPhotos() {
    var map = images();
    var ids = Object.keys(map).filter(function (id) { return id !== "__new__"; });
    if (!ids.length) {
      setNotice("There are no photos on this phone yet.");
      return;
    }
    ids.forEach(function (id, i) {
      setTimeout(function () {
        var parts = map[id].split(",");
        var bin = atob(parts[1]);
        var bytes = new Uint8Array(bin.length);
        for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        downloadBlob(bytes, id + ".jpg", "image/jpeg");
      }, i * 350);
    });
    setNotice(
      ids.length === 1
        ? "Saving 1 photo. Put it in the images folder and commit it."
        : "Saving " + ids.length + " photos. Put them in the images folder and commit them."
    );
  }

  /* ======================================================================
     6. Main screen
     ====================================================================== */

  function viewMain() {
    var q = S.mainQ.trim().toLowerCase();
    var h = "";

    h += '<div class="main" id="main-content">';
    h += '<div class="main__top"><div>' +
         '<h1 class="main__title">Kitchen Table</h1>' +
         '<p class="main__sub">A Simmonds Styled Menu</p>' +
         "</div>" +
         '<div class="main__marks">' +
         '<span class="appmark" aria-hidden="true">' + I.book(30) + "</span>" +
         themeBtn("themebtn--main") + "</div></div>";

    h += '<p class="main__intro">Every recipe the family cooks, in one place — ' +
         "search it, scale it to however many you're feeding, and tick off the " +
         "ingredients as you go.</p>";

    h += '<div class="searchwrap">' +
         '<span class="searchwrap__icon">' + I.search() + "</span>" +
         '<label class="vh" for="main-search">Search recipes</label>' +
         '<input class="searchfield" id="main-search" type="search" ' +
         'placeholder="Search ' + S.recipes.length + ' recipes" ' +
         'value="' + esc(S.mainQ) + '" data-act="main-q" autocomplete="off" />' +
         "</div>";

    if (q) {
      /* While searching, results replace the browse stack entirely. */
      var hits = S.recipes.filter(function (r) { return matchesQuery(r, q); });
      h += '<h2 class="results__h">' + hits.length +
           (hits.length === 1 ? " match" : " matches") + "</h2>";
      if (!hits.length) {
        h += '<div class="emptystate">' + ART.empty() +
             "<p>No recipes match. Try a different word.</p></div>";
      } else {
        h += '<div class="cardgrid">' +
             hits.slice(0, 12).map(cardHtml).join("") + "</div>";
      }
      h += "</div>";
      return h;
    }

    var dinners = S.recipes.filter(function (r) { return r.category === "Dinner"; });
    if (dinners.length) {
      /* Stable across a day, different tomorrow. */
      var pick = dinners[new Date().getDate() % dinners.length];
      h += '<section class="band"><h2 class="band__h">Tonight’s idea</h2>' +
           '<a class="hero press" href="#' + esc(pick.id) + '">' +
           (imageFor(pick)
             ? '<img class="hero__img" src="' + esc(imageFor(pick)) +
               '" alt="' + esc(pick.title) + '" />'
             : '<div class="hero__blank">' + ART.steam() + "</div>") +
           '<div class="hero__body">' +
           '<p class="hero__meta">' + esc(pick.contributor) +
           (pick.cookTime ? " · " + esc(pick.cookTime) : "") + "</p>" +
           '<p class="hero__title">' + esc(pick.title) + "</p>" +
           "</div></a></section>";
    }

    h += '<section class="band"><h2 class="band__h">Whose recipe?</h2>' +
         '<div class="who-grid">' +
         WHO.map(function (name) {
           var n = countBy(S.recipes, "contributor", name);
           /* A section with nothing in it yet recedes rather than shouting a
              zero — it is a place to put something, not a result. */
           return '<a class="who-tile press' + (n ? "" : " who-tile--empty") +
                  '" href="#menu?who=' + encodeURIComponent(name) + '">' +
                  '<span class="who-tile__count">' + n + "</span>" +
                  '<span class="who-tile__name">' + esc(name) + "</span></a>";
         }).join("") +
         "</div></section>";

    /* Sits directly under "Whose recipe?" so the way to the whole list is
       reachable without scrolling past the course rows. */
    h += '<a class="bigbtn press" href="#menu">View all ' + S.recipes.length +
         " recipes " + I.chevR(16, 16) + "</a>";

    h += '<section class="band band--spaced"><h2 class="band__h">What kind of thing?</h2>' +
         '<div class="cat-grid">' +
         CATS.filter(function (c) { return countBy(S.recipes, "category", c); })
           .map(function (c) {
             return '<a class="cat-row press" href="#menu?cat=' + encodeURIComponent(c) + '">' +
                    '<span class="cat-row__label">' +
                    '<span class="cat-row__icon" aria-hidden="true">' + catIcon(c, 20) + "</span>" +
                    esc(c) + "</span>" +
                    '<span class="cat-row__count">' + countBy(S.recipes, "category", c) + "</span></a>";
           }).join("") +
         "</div></section>";
    h += "</div>";
    return h;
  }

  /* ======================================================================
     7. Menu screen
     ====================================================================== */

  function cardHtml(r) {
    /* Long time strings are omitted rather than truncated. */
    var time = r.cookTime || r.prepTime || "";
    if (time.length > 14) time = "";
    /* meta is pre-escaped here — it is interpolated bare below. */
    var meta = esc(r.contributor) + (time ? " · " + esc(time) : "");
    var src = imageFor(r);
    /* A photo replaces the category icon; without one, the icon is what tells
       you at a glance whether this is a breakfast or a dessert. Either way
       there is always exactly one thing in that slot, so the rows line up. */
    var lead = src
      ? '<img class="rcard__thumb" src="' + esc(src) + '" alt="" loading="lazy" />'
      : '<span class="rcard__icon" aria-hidden="true">' + catIcon(r.category, 24) + "</span>";
    var tags = tagsOf(r).slice(0, 2);
    return (
      '<a class="rcard press" href="#' + esc(r.id) + '">' +
      lead +
      '<span class="rcard__body">' +
      '<span class="rcard__title">' + esc(r.title) + "</span>" +
      '<span class="rcard__meta">' + esc(r.category) + " · " + meta + "</span>" +
      (tags.length
        ? '<span class="rcard__tags">' +
          tags.map(function (t) {
            return '<span class="minitag">' + esc(t) + "</span>";
          }).join("") + "</span>"
        : "") +
      "</span>" +
      '<span class="rcard__chev">' + I.chevR() + "</span>" +
      "</a>"
    );
  }

  function menuMatches() {
    var q = S.menuQ.trim().toLowerCase();
    var list = S.recipes.filter(function (r) {
      if (S.who.length && S.who.indexOf(r.contributor) === -1) return false;
      if (S.cats.length && S.cats.indexOf(r.category) === -1) return false;
      /* Tags are AND-ed: picking Italian and Vegetarian means both. */
      if (S.tags.length && !S.tags.every(function (t) {
        return tagsOf(r).indexOf(t) > -1;
      })) return false;
      return matchesQuery(r, q);
    });

    if (S.sort === "az") {
      list.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else if (S.sort === "course") {
      list.sort(function (a, b) {
        var d = CATS.indexOf(a.category) - CATS.indexOf(b.category);
        return d || a.title.localeCompare(b.title);
      });
    }
    return list;
  }

  function viewMenu() {
    var list = menuMatches();
    var filterCount = S.who.length + S.cats.length + S.tags.length;
    var sortLabel = SORTS.filter(function (s) { return s.key === S.sort; })[0].label;
    var h = "";

    h += '<header class="mhead"><div class="mhead__inner">';
    /* The eyebrow doubles as the way back to Main. The design draws it as a
       plain label, but without this the Menu is a dead end — the only route
       back to the dashboard would be the browser's back button. Same position,
       same type, no visual change. */
    h += '<div class="mhead__row"><div>' +
         '<a class="eyebrow eyebrow--link" href="#">Kitchen Table</a>' +
         '<h1 class="mhead__h1">Menu</h1></div>' +
         '<div class="mhead__tools">' +
         '<button type="button" class="iconbtn press' + (S.searchOpen ? " is-on" : "") +
         '" data-act="toggle-search" aria-pressed="' + S.searchOpen +
         '" aria-label="Search recipes">' + I.search() + "</button>" +
         themeBtn() +
         '<button type="button" class="iconbtn press' + (S.easyRead ? " is-on" : "") +
         '" data-act="open-text" aria-haspopup="dialog" ' +
         'aria-label="Text size, currently ' + FS[effectiveFs()] +
         ' pixels">Aa</button>' +
         "</div></div>";

    if (S.searchOpen) {
      h += '<div class="mhead__search">' +
           '<label class="vh" for="menu-search">Search recipes</label>' +
           '<input class="menusearch" id="menu-search" type="search" ' +
           'placeholder="Search recipes" value="' + esc(S.menuQ) +
           '" data-act="menu-q" autocomplete="off" /></div>';
    }

    h += '<div class="toolrow" style="position:relative">' +
         '<button type="button" class="toolbtn toolbtn--filter press' +
         (filterCount ? " is-on" : "") + '" data-act="open-filter" ' +
         'aria-haspopup="dialog">' + I.filter() + "<span>Filter</span>" +
         (filterCount ? '<span class="badge">' + filterCount + "</span>" : "") +
         "</button>" +
         '<button type="button" class="toolbtn toolbtn--sort press' +
         (S.sortOpen ? " is-open" : "") + '" data-act="toggle-sort" ' +
         'aria-haspopup="true" aria-expanded="' + S.sortOpen + '">' +
         "<span>Sort: " + esc(sortLabel) + "</span>" + I.chevD() + "</button>";
    if (S.sortOpen) h += sortMenuHtml();
    h += "</div>";

    if (S.notice) h += '<p class="hint" role="status">' + esc(S.notice) + "</p>";
    h += "</div></header>";

    h += '<div class="menubody" id="main-content">';
    h += '<div class="countrow"><span>' + list.length +
         (list.length === 1 ? " recipe" : " recipes") +
         (S.removing ? " — tap a recipe to remove it" : "") + "</span>" +
         '<span class="countrow__actions">' +
         (filterCount || S.menuQ
           ? '<button type="button" class="textbtn" data-act="clear-filters">Clear</button>'
           : "") +
         '<button type="button" class="textbtn' +
         (S.removing ? " textbtn--removing" : "") + '" data-act="toggle-remove">' +
         (S.removing ? "Done" : "Remove") + "</button>" +
         "</span></div>";

    if (!list.length) {
      /* "No recipes match" is the wrong sentence when a person simply hasn't
         contributed anything yet — say what is actually true. */
      var lonePerson = S.who.length === 1 && !S.cats.length && !S.tags.length &&
        !S.menuQ && !countBy(S.recipes, "contributor", S.who[0]) ? S.who[0] : "";
      h += '<div class="emptystate">' + ART.empty() + "<p>" +
           (lonePerson
             ? esc(lonePerson) + " hasn’t added any recipes yet."
             : "No recipes match. Try a different word, or clear the filters.") +
           "</p>" +
           '<button type="button" class="bigbtn press" data-act="show-all">' +
           "Show all recipes</button>" +
           /* Recovery path: if the list is empty because recipes were removed
              on this phone, Edit mode is unreachable, so the reset lives here
              too. */
           (hasLocalChanges() && !S.who.length && !S.cats.length && !S.tags.length && !S.menuQ
             ? '<button type="button" class="outlinebtn outlinebtn--danger press" ' +
               'data-act="reset-local" style="max-width:420px;margin:12px auto 0">' +
               "Undo all my changes on this phone</button>"
             : "") +
           "</div>";
    } else if (S.removing) {
      h += '<div class="cardgrid">' + list.map(function (r) {
        return '<button type="button" class="rrow press" data-act="remove" ' +
               'data-id="' + esc(r.id) + '">' +
               '<span class="rcard__body"><span class="rcard__title">' +
               esc(r.title) + "</span>" +
               '<span class="rcard__meta">' + esc(r.contributor) + "</span></span>" +
               '<span class="rrow__minus">' + I.minus(20) + "</span></button>";
      }).join("") + "</div>";
    } else {
      h += '<div class="cardgrid">' + list.map(cardHtml).join("") + "</div>";
    }
    h += "</div>";

    h += '<div class="addbar"><a class="addpill press" href="#add">' +
         I.plus(20) + "Add recipe</a></div>";

    if (S.filterOpen) h += filterSheetHtml();
    if (S.textOpen) h += textSheetHtml();
    return h;
  }

  function sortMenuHtml() {
    return (
      '<div class="sortmenu" role="menu" aria-label="Sort recipes" ' +
      'style="top:calc(100% + 8px); left:0">' +
      SORTS.map(function (s) {
        var on = s.key === S.sort;
        return '<button type="button" class="sortmenu__row" role="menuitemradio" ' +
               'aria-checked="' + on + '" data-act="sort" data-key="' + s.key + '">' +
               "<span>" + esc(s.label) + "</span>" +
               (on ? I.check() : "") + "</button>";
      }).join("") +
      "</div>"
    );
  }

  /* ======================================================================
     10. Sheets

     Every sheet traps focus while open, closes on Escape, and returns focus to
     whatever opened it. Without the restore, dismissing a sheet drops the
     caret back at the top of the document, which is disorienting on a screen
     reader and on a keyboard alike.
     ====================================================================== */

  var FOCUSABLE =
    'a[href], button:not([disabled]), input:not([disabled]), ' +
    'select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])';

  var sheetReturn = null;   // selector of the trigger to restore focus to
  var openSheetId = null;   // which sheet element currently holds focus

  function openSheet(flag, trigger) {
    sheetReturn = trigger ? '[data-act="' + trigger.getAttribute("data-act") + '"]' : null;
    S.filterOpen = false;
    S.textOpen = false;
    S.dlOpen = false;
    S.sortOpen = false;
    S[flag] = true;
    openSheetId = null;
    S.pulseSheet = true;
    render();
  }

  function closeSheet(flag) {
    S[flag] = false;
    openSheetId = null;
    render();
    if (sheetReturn) {
      var back = document.querySelector(sheetReturn);
      if (back) back.focus();
      sheetReturn = null;
    }
  }

  function activeSheet() {
    return document.querySelector('.sheet[role="dialog"]');
  }

  /* Called after every render: move focus into a sheet the first time it
     appears, and leave it alone on subsequent re-renders. */
  function syncSheetFocus() {
    var sheet = activeSheet();
    if (!sheet) { openSheetId = null; return; }
    if (openSheetId === sheet.id) return;
    openSheetId = sheet.id;
    var first = sheet.querySelector(FOCUSABLE);
    if (first) first.focus();
  }

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Tab") return;
    var sheet = activeSheet();
    if (!sheet) return;
    var items = Array.prototype.filter.call(
      sheet.querySelectorAll(FOCUSABLE),
      function (el) { return el.offsetParent !== null; }
    );
    if (!items.length) return;
    var first = items[0];
    var last = items[items.length - 1];
    if (ev.shiftKey && document.activeElement === first) {
      ev.preventDefault();
      last.focus();
    } else if (!ev.shiftKey && document.activeElement === last) {
      ev.preventDefault();
      first.focus();
    } else if (items.indexOf(document.activeElement) === -1) {
      ev.preventDefault();
      first.focus();
    }
  });

  function filterSheetHtml() {
    /* Counts are cross-filtered: course counts reflect the selected people
       and vice versa. */
    function countWho(name) {
      return S.recipes.filter(function (r) {
        return r.contributor === name &&
          (!S.cats.length || S.cats.indexOf(r.category) > -1);
      }).length;
    }
    function countCat(cat) {
      return S.recipes.filter(function (r) {
        return r.category === cat &&
          (!S.who.length || S.who.indexOf(r.contributor) > -1);
      }).length;
    }

    return (
      '<button type="button" class="scrim" data-act="close-filter" ' +
      'aria-label="Close filters"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="Filter recipes" ' +
      'id="filter-sheet"><div class="sheet__inner">' +
      '<div class="sheet__head"><h2 class="sheet__title">Filter</h2>' +
      '<button type="button" class="donebtn press" data-act="close-filter">Done</button>' +
      "</div>" +
      '<h3 class="grouph">Who it’s from</h3><div class="chiprow">' +
      WHO.filter(function (n) { return countBy(S.recipes, "contributor", n); })
        .map(function (name) {
          var on = S.who.indexOf(name) > -1;
          /* The check is the non-colour half of the selected state — a filled
             background alone fails anyone who can't rely on colour. */
          return '<button type="button" class="chip press" aria-pressed="' + on +
                 '" data-act="fw" data-key="' + esc(name) + '">' +
                 (on ? I.check(15) : "") +
                 esc(name) + " (" + countWho(name) + ")</button>";
        }).join("") + "</div>" +
      '<h3 class="grouph">Course</h3><div class="chiprow">' +
      CATS.filter(function (c) { return countBy(S.recipes, "category", c); })
        .map(function (cat) {
          var on = S.cats.indexOf(cat) > -1;
          return '<button type="button" class="chip press" aria-pressed="' + on +
                 '" data-act="fc" data-key="' + esc(cat) + '">' +
                 (on ? I.check(15) : "") +
                 esc(cat) + " (" + countCat(cat) + ")</button>";
        }).join("") + "</div>" +
      tagGroupHtml() +
      '<div class="sheet__foot">' +
      '<button type="button" class="sheetbtn press" data-act="reset-filters">' +
      "Reset to all recipes</button></div>" +
      "</div></div>"
    );
  }

  /* The Menu's "Aa" button opens this rather than silently cycling sizes, so
     the stepper and Easy Read live together in one place with a live sample. */
  function textSheetHtml() {
    var px = FS[effectiveFs()];
    return (
      '<button type="button" class="scrim" data-act="close-text" ' +
      'aria-label="Close text size"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-label="Text size" ' +
      'id="text-sheet"><div class="sheet__inner sheet__inner--narrow">' +
      '<div class="sheet__head"><h2 class="sheet__title">Text size</h2>' +
      '<button type="button" class="donebtn press" data-act="close-text">Done</button>' +
      "</div>" +
      '<div class="fsrow">' +
      '<button type="button" class="fsbig press" data-act="fs-" ' +
      'aria-label="Smaller text"' + (effectiveFs() === 0 ? " disabled" : "") +
      ">A−</button>" +
      '<span class="fsrow__value">' + px + "px</span>" +
      '<button type="button" class="fsbig press" data-act="fs+" ' +
      'aria-label="Larger text"' +
      (effectiveFs() === FS.length - 1 ? " disabled" : "") + ">A+</button>" +
      "</div>" +
      '<p class="fssample" style="font-size:' + px + 'px">' +
      "Bake for 25 minutes until golden.</p>" +
      '<button type="button" class="wakerow press" role="switch" ' +
      'aria-checked="' + S.easyRead + '" data-act="toggle-easy" ' +
      'style="font-size:18px; margin-top:18px">' +
      '<span class="wakerow__label">Easy Read<span class="fssub">' +
      "Bigger text, no faded grey, one wide column</span></span>" +
      '<span class="switch" aria-hidden="true"' +
      (S.easyRead ? ' aria-checked="true"' : "") + "></span></button>" +
      "</div></div>"
    );
  }

  /* The tag group only earns its space once something has been tagged —
     nothing ships pre-tagged, since guessing a dish's nationality is exactly
     how the contributor attributions ended up wrong. */
  function tagGroupHtml() {
    var tags = allTags();
    if (!tags.length) return "";
    function countTag(tag) {
      return S.recipes.filter(function (r) {
        if (tagsOf(r).indexOf(tag) === -1) return false;
        if (S.who.length && S.who.indexOf(r.contributor) === -1) return false;
        if (S.cats.length && S.cats.indexOf(r.category) === -1) return false;
        return true;
      }).length;
    }
    return '<h3 class="grouph">Tags</h3><div class="chiprow">' +
      tags.map(function (tag) {
        var on = S.tags.indexOf(tag) > -1;
        return '<button type="button" class="chip press" aria-pressed="' + on +
               '" data-act="ft" data-key="' + esc(tag) + '">' +
               (on ? I.check(15) : "") +
               esc(tag) + " (" + countTag(tag) + ")</button>";
      }).join("") + "</div>";
  }

  function downloadSheetHtml(r) {
    return (
      '<button type="button" class="scrim" data-act="close-dl" ' +
      'aria-label="Close download options"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" ' +
      'aria-label="Download this recipe" id="dl-sheet">' +
      '<div class="sheet__inner sheet__inner--narrow">' +
      '<div class="sheet__head"><h2 class="sheet__title">Download this recipe</h2></div>' +
      '<button type="button" class="sheetbtn press" data-act="dl-pdf">' +
      "PDF — printable page</button>" +
      '<button type="button" class="sheetbtn press" data-act="dl-txt">' +
      "Plain text (.txt)</button>" +
      '<button type="button" class="sheetbtn sheetbtn--acc press" data-act="close-dl">' +
      "Cancel</button>" +
      "</div></div>"
    );
  }

  /* ======================================================================
     8. Recipe screen — viewer
     ====================================================================== */

  function viewRecipe(r) {
    var mult = S.serves && r.servings ? S.serves / r.servings : 1;
    var h = "";

    h += '<header class="rhead"><div class="rhead__inner">' +
         '<a class="backlink press" href="#menu">' + I.chevL() + "Menu</a>" +
         '<div class="rhead__tools">' + themeBtn() +
         '<div class="fsgroup">' +
         '<button type="button" data-act="fs-" aria-label="Smaller text"' +
         (effectiveFs() === 0 ? " disabled" : "") + ">A−</button>" +
         '<button type="button" data-act="fs+" aria-label="Larger text"' +
         (effectiveFs() === FS.length - 1 ? " disabled" : "") + ">A+</button>" +
         "</div></div></div></header>";

    h += '<div class="modestrip"><div class="modestrip__inner">' +
         '<span class="modestrip__label">' +
         (S.editing ? "Edit mode — changes save on this phone"
                    : "Viewer mode — read only") + "</span>" +
         '<span class="modestrip__edit">Edit</span>' +
         '<button type="button" class="switch" role="switch" aria-checked="' +
         S.editing + '" data-act="toggle-edit" aria-label="Edit mode"></button>' +
         "</div></div>";

    h += '<div class="recipe" id="main-content" style="font-size:' +
         FS[effectiveFs()] + 'px">';

    if (S.editing) {
      h += editBody(r);
      /* Notices must reach edit mode too — the quota failure on attaching a
         photo happens here, and a warning nobody can see is a silent loss. */
      if (S.notice) {
        h += '<p class="notice" role="status" style="margin-top:16px">' +
             esc(S.notice) + "</p>";
      }
      h += "</div>";
      return h;
    }

    var hero = imageFor(r);
    if (hero) {
      h += '<img class="r-hero" src="' + esc(hero) + '" alt="' + esc(r.title) + '" />';
    }

    h += '<p class="r-eyebrow">' + esc(r.contributor) + " · " + esc(r.category) + "</p>";
    h += '<h1 class="r-title">' + esc(r.title) + "</h1>";

    if (tagsOf(r).length) {
      h += '<p class="r-tags">' + tagsOf(r).map(function (t) {
        return '<a class="minitag minitag--link press" href="#menu?tag=' +
               encodeURIComponent(t) + '">' + esc(t) + "</a>";
      }).join("") + "</p>";
    }

    h += '<div class="topgrid">';
    h += '<div class="servcard"><div class="servcard__text">' +
         '<p class="minilabel">Servings</p>' +
         '<p class="servcard__value">' + S.serves + " " +
         (S.serves === 1 ? "person" : "people") + "</p></div>" +
         '<button type="button" class="servbtn press" data-act="serv-" ' +
         'aria-label="Fewer servings"' + (S.serves <= 1 ? " disabled" : "") + ">" +
         I.minus(24) + "</button>" +
         '<button type="button" class="servbtn press" data-act="serv+" ' +
         'aria-label="More servings"' + (S.serves >= 40 ? " disabled" : "") + ">" +
         I.plus(24) + "</button></div>";

    if (r.prepTime) {
      h += '<div class="statcard"><p class="minilabel">Prep</p>' +
           '<p class="statcard__value">' + esc(r.prepTime) + "</p></div>";
    }
    if (r.cookTime) {
      h += '<div class="statcard"><p class="minilabel">Cook</p>' +
           '<p class="statcard__value">' + esc(r.cookTime) + "</p></div>";
    }
    h += "</div>";

    if (S.serves !== r.servings) {
      h += '<p class="scalednote">Amounts adjusted from the original ' +
           r.servings + '.<span class="screen-only"> Tap − / + to change.</span></p>';
    }

    if ("wakeLock" in navigator) {
      h += '<button type="button" class="wakerow press" role="switch" ' +
           'aria-checked="' + S.awake + '" data-act="toggle-wake">' +
           '<span class="wakerow__label">Keep screen on while cooking</span>' +
           '<span class="switch" aria-hidden="true"' +
           (S.awake ? ' aria-checked="true"' : "") + "></span></button>";
    }

    h += '<div class="bodygrid">';

    h += '<section class="bodygrid__ing"><h2 class="r-h2">Ingredients</h2>' +
         '<p class="hint">Tap to check off as you go</p>';
    /* A rescale changes the numbers in place, which is easy to miss at any font
       size and very easy to miss at 40px. The list flashes once so the change
       is seen rather than merely made. */
    var scaled = S.pulseScale ? " is-rescaled" : "";

    if ((r.ingredients || []).length) {
      h += '<ul class="checklist' + scaled + '">' + r.ingredients.map(function (line, i) {
        var done = !!S.checkedIng[i];
        var pop = S.pulseRow === "i:" + i ? " is-ticked" : "";
        return '<li><button type="button" class="checkrow press" aria-pressed="' +
               done + '" data-act="chk-i" data-i="' + i + '">' +
               '<span class="checkbox' + pop + '">' + (done ? I.check(18) : "") + "</span>" +
               '<span class="checkrow__text">' + esc(scaleLine(line, mult)) +
               "</span></button></li>";
      }).join("") + "</ul>";
    } else {
      h += '<p class="hint">No ingredient list was captured for this recipe.</p>';
    }
    h += "</section>";

    h += "<section><h2 class=\"r-h2\">Instructions</h2>";
    h += '<ol class="checklist checklist--steps' + scaled + '">' +
         (r.steps || []).map(function (line, i) {
      var done = !!S.checkedStep[i];
      var pop = S.pulseRow === "s:" + i ? " is-ticked" : "";
      return '<li><button type="button" class="checkrow press" aria-pressed="' +
             done + '" data-act="chk-s" data-i="' + i + '">' +
             '<span class="stepnum' + pop + '">' + (done ? I.check(16) : i + 1) + "</span>" +
             '<span class="checkrow__text">' + esc(scaleLine(line, mult)) +
             "</span></button></li>";
    }).join("") + "</ol></section>";

    h += "</div>";

    if (r.notes) {
      h += '<section class="r-section"><h2 class="r-h2">Notes</h2>' +
           '<div class="panel">' + esc(r.notes) + "</div></section>";
    }

    /* Shown in viewer mode too — it is information, not an edit affordance. */
    if (r.flagged && r.flagged.length) {
      h += '<section class="r-section"><div class="panel panel--flag">' +
           "<h2>Worth double-checking</h2><ul>" +
           r.flagged.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") +
           "</ul></div></section>";
    }

    h += '<div class="actionrow">' +
         '<button type="button" class="actbtn press" data-act="share">' +
         I.share() + "Share</button>" +
         '<button type="button" class="actbtn actbtn--primary press" data-act="open-dl">' +
         I.download() + "Download</button></div>";

    if (S.notice) {
      h += '<p class="notice" role="status" style="margin-top:16px">' +
           esc(S.notice) + "</p>";
    }

    if (r.source) {
      h += '<p class="sourceline">From Joan’s screenshots · ' + esc(r.source) + "</p>";
    }

    h += "</div>";
    if (S.dlOpen) h += downloadSheetHtml(r);
    return h;
  }

  /* ======================================================================
     9. Recipe screen — edit
     ====================================================================== */

  function editBody(r) {
    var d = S.draft;
    var h = "";

    h += '<div class="field"><label class="field__label" for="e-title">Title</label>' +
         '<input class="input" id="e-title" data-act="d" data-k="title" value="' +
         esc(d.title) + '" /></div>';

    h += '<div class="fieldrow">' +
         '<div class="field"><label class="field__label" for="e-serves">Serves</label>' +
         '<input class="input" id="e-serves" type="number" min="1" max="40" ' +
         'data-act="d" data-k="servings" value="' + esc(d.servings) + '" /></div>' +
         '<div class="field"><label class="field__label" for="e-from">From</label>' +
         '<input class="input" id="e-from" data-act="d" data-k="contributor" value="' +
         esc(d.contributor) + '" /></div></div>';

    h += '<h2 class="r-h2">Ingredients</h2>';
    h += d.ingredients.map(function (line, i) {
      return '<div class="editline">' +
             '<label class="vh" for="e-ing-' + i + '">Ingredient ' + (i + 1) + "</label>" +
             '<textarea class="textarea" id="e-ing-' + i + '" rows="2" ' +
             'data-act="dl" data-k="ingredients" data-i="' + i + '">' +
             esc(line) + "</textarea>" +
             '<button type="button" class="delbtn press" data-act="del" ' +
             'data-k="ingredients" data-i="' + i + '" aria-label="Remove ingredient ' +
             (i + 1) + '">' + I.x() + "</button></div>";
    }).join("");
    h += '<button type="button" class="addline press" data-act="add" ' +
         'data-k="ingredients">+ Add ingredient</button>';

    h += '<h2 class="r-h2" style="margin-top:22px">Instructions</h2>';
    h += d.steps.map(function (line, i) {
      return '<div class="editline">' +
             '<label class="vh" for="e-step-' + i + '">Step ' + (i + 1) + "</label>" +
             '<textarea class="textarea" id="e-step-' + i + '" rows="3" ' +
             'data-act="dl" data-k="steps" data-i="' + i + '">' +
             esc(line) + "</textarea>" +
             '<button type="button" class="delbtn press" data-act="del" ' +
             'data-k="steps" data-i="' + i + '" aria-label="Remove step ' +
             (i + 1) + '">' + I.x() + "</button></div>";
    }).join("");
    h += '<button type="button" class="addline press" data-act="add" ' +
         'data-k="steps">+ Add step</button>';

    h += '<div class="field" style="margin-top:22px">' +
         '<label class="field__label" for="e-notes">Notes</label>' +
         '<textarea class="textarea" id="e-notes" rows="4" data-act="d" ' +
         'data-k="notes">' + esc(d.notes || "") + "</textarea></div>";

    h += tagsFieldHtml("e-tags", d.tags, "d");
    h += photoFieldHtml("e-photo", r.id, "e-photo-act");

    h += '<button type="button" class="savebtn press" data-act="save">' +
         (S.saved ? "Saved ✓" : "Save changes") + "</button>";
    h += '<button type="button" class="outlinebtn press" data-act="dl-json">' +
         "Download updated recipes.json</button>";
    if (Object.keys(images()).length) {
      h += '<button type="button" class="outlinebtn press" data-act="dl-photos">' +
           "Download photos</button>";
    }
    if (hasLocalChanges()) {
      h += '<button type="button" class="outlinebtn outlinebtn--danger press" ' +
           'data-act="reset-local">Undo all my changes on this phone</button>';
    }
    return h;
  }

  function hasLocalChanges() {
    try { return localStorage.getItem(K.recipes) !== null; } catch (e) { return false; }
  }

  /* Everything Edit mode writes lives in one localStorage key, and there is no
     other undo — a removed recipe is otherwise gone from this device for good.
     This puts it all back to the published file. */
  function resetLocal() {
    if (!window.confirm(
      "Put every recipe back the way it is on the website?\n\n" +
      "This undoes everything changed, added, or removed on this phone. " +
      "Photos you have added are kept. Anything already downloaded and " +
      "committed is unaffected."
    )) return;
    try { localStorage.removeItem(K.recipes); } catch (e) {}
    applyOverlay();
    S.editing = false;
    S.draft = null;
    S.saved = false;
    var still = byId(S.route.id);
    if (S.route.name === "recipe" && !still) location.hash = "#menu";
    else { render(); announce("Local changes undone."); }
  }

  /* Shared by Edit mode and the Add review screen so the two field sets stay
     identical, which is what the handoff asks for. */
  function tagsFieldHtml(id, tags, act) {
    /* Edit mode keeps the draft's tags as the raw comma string the user is
       typing; the Add flow hands over a parsed array. Accept both. */
    var value = Array.isArray(tags) ? tags.join(", ") : String(tags || "");
    return '<div class="field">' +
      '<label class="field__label" for="' + id + '">Tags</label>' +
      '<input class="input" id="' + id + '" data-act="' + act + '" data-k="tags" ' +
      'value="' + esc(value) + '" ' +
      'placeholder="Italian, vegetarian, quick" />' +
      '<span class="fieldhint">Separate with commas. Include where the dish is ' +
      "from — those become filters.</span></div>";
  }

  function photoFieldHtml(id, recipeId, act) {
    var src = images()[recipeId];
    return '<div class="field">' +
      '<label class="field__label" for="' + id + '">Photo</label>' +
      (src
        ? '<div class="photorow"><img class="photorow__img" src="' + esc(src) +
          '" alt="" /><button type="button" class="delbtn press" ' +
          'data-act="rm-photo" data-key="' + esc(recipeId) +
          '" aria-label="Remove photo">' + I.x() + "</button></div>"
        : "") +
      '<input class="input" id="' + id + '" type="file" accept="image/*" ' +
      'data-act="' + act + '" data-key="' + esc(recipeId) + '" />' +
      '<span class="fieldhint">Shrunk and kept on this phone. ' +
      '"Download photos" saves it as a file to commit.</span></div>';
  }

  function startDraft(r) {
    S.draft = {
      title: r.title,
      servings: r.servings,
      contributor: r.contributor,
      ingredients: (r.ingredients || []).slice(),
      steps: (r.steps || []).slice(),
      notes: r.notes || "",
      tags: tagsOf(r).join(", ")
    };
    S.saved = false;
  }

  function saveDraft(r) {
    var updated = {};
    Object.keys(r).forEach(function (k) { updated[k] = r[k]; });
    updated.title = S.draft.title.trim() || r.title;
    updated.servings = Math.min(40, Math.max(1, parseInt(S.draft.servings, 10) || r.servings));
    updated.contributor = S.draft.contributor.trim() || r.contributor;
    updated.ingredients = S.draft.ingredients.filter(function (x) { return x.trim(); });
    updated.steps = S.draft.steps.filter(function (x) { return x.trim(); });
    if (S.draft.notes.trim()) updated.notes = S.draft.notes.trim();
    else delete updated.notes;
    var tags = parseTags(S.draft.tags);
    if (tags.length) updated.tags = tags; else delete updated.tags;

    S.recipes = S.recipes.map(function (x) {
      return x.id === r.id ? updated : x;
    });
    persistRecipes();
    S.serves = updated.servings;
    S.saved = true;
  }

  /* ======================================================================
     10b. Add / Import

     Three ways in — typed, from a link, from a photo — and all three land on
     the same review screen before anything is saved. Nothing is ever added
     silently: whatever the parser had to guess goes into `flagged`, which the
     recipe page then shows in Viewer mode too.
     ====================================================================== */

  function blankDraft() {
    return {
      title: "", category: "Dinner", contributor: WHO[0], servings: 4,
      prepTime: "", cookTime: "", ingredients: [""], steps: [""],
      notes: "", flagged: [], source: "", tags: ""
    };
  }

  function viewAdd() {
    var h = "";
    h += '<header class="rhead"><div class="rhead__inner">' +
         '<a class="backlink press" href="#menu">' + I.chevL() + "Menu</a>" +
         '<div class="rhead__tools">' + themeBtn() + "</div></div></header>";

    h += '<div class="addscreen" id="main-content">';
    h += '<h1 class="addscreen__h1">Add a recipe</h1>';

    if (S.addError) {
      h += '<p class="notice notice--bad" role="alert">' + esc(S.addError) + "</p>";
    }
    if (S.addBusy) {
      h += '<p class="notice" role="status">' + esc(S.addBusy) + "</p>";
    }

    if (S.addStep === "choose") {
      h += '<p class="addscreen__lead">Three ways to get a recipe in. However it ' +
           "starts, you get to check it over before it’s saved.</p>";
      h += '<button type="button" class="pathbtn press" data-act="add-path" ' +
           'data-key="review"><span class="pathbtn__t">Type it in</span>' +
           '<span class="pathbtn__s">A blank recipe you fill out yourself</span></button>';
      h += '<button type="button" class="pathbtn press" data-act="add-path" ' +
           'data-key="link"><span class="pathbtn__t">From a link</span>' +
           '<span class="pathbtn__s">Paste a recipe page address and pull it in</span></button>';
      h += '<button type="button" class="pathbtn press" data-act="add-path" ' +
           'data-key="photo"><span class="pathbtn__t">From a photo</span>' +
           '<span class="pathbtn__s">Read the text out of a picture of a recipe</span></button>';
      h += "</div>";
      return h;
    }

    if (S.addStep === "link") {
      h += '<div class="field"><label class="field__label" for="a-url">' +
           "Recipe address</label>" +
           '<input class="input" id="a-url" type="url" placeholder="https://…" ' +
           'data-act="a-url" value="' + esc(S.addUrl || "") + '" /></div>';
      h += '<p class="addscreen__note">Most recipe sites stop other sites reading ' +
           "their pages directly, so this goes through a free public relay. The " +
           "address you paste is sent to that relay; nothing else about you is. " +
           "Relays go down sometimes — if it can’t get through, use the box " +
           "below.</p>";
      h += '<button type="button" class="savebtn press" data-act="add-fetch"' +
           (S.addBusy ? " disabled" : "") + ">Fetch the recipe</button>";

      /* The path that never fails: no network, no relay, no third party. */
      h += '<div class="field" style="margin-top:26px">' +
           '<label class="field__label" for="a-paste">Or paste the recipe text</label>' +
           '<textarea class="textarea" id="a-paste" rows="8" data-act="a-paste" ' +
           'placeholder="Copy the recipe off the page and paste it here — title, ' +
           'ingredients, then the steps.">' + esc(S.addPaste || "") + "</textarea>" +
           '<span class="fieldhint">Works offline and always works. Keep the ' +
           "site’s own “Ingredients” and “Instructions” headings in if you can — " +
           "they make the split exact rather than guessed.</span></div>";
      h += '<button type="button" class="outlinebtn press" data-act="add-paste"' +
           (S.addPaste && S.addPaste.trim() ? "" : " disabled") +
           ">Read the pasted text</button>";
      h += '<button type="button" class="outlinebtn press" data-act="add-back">Back</button>';
      h += "</div>";
      return h;
    }

    if (S.addStep === "photo") {
      h += '<div class="field"><label class="field__label" for="a-photo">' +
           "Photo of the recipe</label>" +
           '<input class="input" id="a-photo" type="file" accept="image/*" ' +
           'data-act="a-photo" /></div>';
      h += '<p class="addscreen__note">The text is read on this phone — the ' +
           "picture is never uploaded anywhere. It works best on flat, well-lit, " +
           "printed text, and it will get some things wrong; anything it isn’t " +
           "sure about gets flagged for you on the next screen.</p>";
      h += '<button type="button" class="savebtn press" data-act="add-ocr"' +
           (S.addBusy || !S.addPhoto ? " disabled" : "") + ">Read the photo</button>";
      h += '<button type="button" class="outlinebtn press" data-act="add-back">Back</button>';
      h += "</div>";
      return h;
    }

    /* Review — the same field set as Edit mode, bound to the add draft. */
    var d = S.addDraft;
    h += '<p class="addscreen__lead">Check this over, then save it.</p>';

    if (d.flagged && d.flagged.length) {
      h += '<div class="panel panel--flag" style="margin-bottom:16px">' +
           "<h2>Worth double-checking</h2><ul>" +
           d.flagged.map(function (f) { return "<li>" + esc(f) + "</li>"; }).join("") +
           "</ul></div>";
    }

    h += '<div class="field"><label class="field__label" for="a-title">Title</label>' +
         '<input class="input" id="a-title" data-act="ad" data-k="title" value="' +
         esc(d.title) + '" /></div>';

    h += '<div class="fieldrow">' +
         '<div class="field"><label class="field__label" for="a-cat">Course</label>' +
         '<select class="input" id="a-cat" data-act="ad" data-k="category">' +
         CATS.map(function (c) {
           return '<option' + (c === d.category ? " selected" : "") + ">" + esc(c) + "</option>";
         }).join("") + "</select></div>" +
         '<div class="field"><label class="field__label" for="a-from">From</label>' +
         '<input class="input" id="a-from" data-act="ad" data-k="contributor" list="who-list" value="' +
         esc(d.contributor) + '" />' +
         '<datalist id="who-list">' +
         WHO.map(function (w) { return '<option value="' + esc(w) + '"></option>'; }).join("") +
         "</datalist></div></div>";

    h += '<div class="fieldrow">' +
         '<div class="field"><label class="field__label" for="a-serves">Serves</label>' +
         '<input class="input" id="a-serves" type="number" min="1" max="40" ' +
         'data-act="ad" data-k="servings" value="' + esc(d.servings) + '" /></div>' +
         '<div class="field"><label class="field__label" for="a-prep">Prep time</label>' +
         '<input class="input" id="a-prep" data-act="ad" data-k="prepTime" value="' +
         esc(d.prepTime) + '" /></div>' +
         '<div class="field"><label class="field__label" for="a-cook">Cook time</label>' +
         '<input class="input" id="a-cook" data-act="ad" data-k="cookTime" value="' +
         esc(d.cookTime) + '" /></div></div>';

    h += '<h2 class="r-h2" style="margin-top:22px">Ingredients</h2>';
    h += d.ingredients.map(function (line, i) {
      return '<div class="editline">' +
             '<label class="vh" for="a-ing-' + i + '">Ingredient ' + (i + 1) + "</label>" +
             '<textarea class="textarea" id="a-ing-' + i + '" rows="2" ' +
             'data-act="adl" data-k="ingredients" data-i="' + i + '">' +
             esc(line) + "</textarea>" +
             '<button type="button" class="delbtn press" data-act="adel" ' +
             'data-key="ingredients" data-i="' + i + '" aria-label="Remove ingredient ' +
             (i + 1) + '">' + I.x() + "</button></div>";
    }).join("");
    h += '<button type="button" class="addline press" data-act="aadd" ' +
         'data-key="ingredients">+ Add ingredient</button>';

    h += '<h2 class="r-h2" style="margin-top:22px">Instructions</h2>';
    h += d.steps.map(function (line, i) {
      return '<div class="editline">' +
             '<label class="vh" for="a-step-' + i + '">Step ' + (i + 1) + "</label>" +
             '<textarea class="textarea" id="a-step-' + i + '" rows="3" ' +
             'data-act="adl" data-k="steps" data-i="' + i + '">' +
             esc(line) + "</textarea>" +
             '<button type="button" class="delbtn press" data-act="adel" ' +
             'data-key="steps" data-i="' + i + '" aria-label="Remove step ' +
             (i + 1) + '">' + I.x() + "</button></div>";
    }).join("");
    h += '<button type="button" class="addline press" data-act="aadd" ' +
         'data-key="steps">+ Add step</button>';

    h += '<div class="field" style="margin-top:22px">' +
         '<label class="field__label" for="a-notes">Notes</label>' +
         '<textarea class="textarea" id="a-notes" rows="4" data-act="ad" ' +
         'data-k="notes">' + esc(d.notes || "") + "</textarea></div>";

    h += tagsFieldHtml("a-tags", parseTags(d.tags), "ad");
    h += photoFieldHtml("a-photo-file", "__new__", "a-photo-act");

    h += '<button type="button" class="savebtn press" data-act="add-save">' +
         "Save to my recipes</button>";
    h += '<button type="button" class="outlinebtn press" data-act="add-back">' +
         "Start over</button>";
    h += "</div>";
    return h;
  }

  function saveNewRecipe() {
    var d = S.addDraft;
    var title = (d.title || "").trim();
    if (!title) {
      S.addError = "Give the recipe a title before saving.";
      render();
      var f = document.getElementById("a-title");
      if (f) f.focus();
      return;
    }

    var base = slugify(title) || "recipe";
    var id = base;
    var n = 2;
    while (byId(id)) id = base + "-" + n++;

    var recipe = {
      id: id,
      title: title,
      category: CATS.indexOf(d.category) > -1 ? d.category : "Dinner",
      contributor: (d.contributor || "").trim() || WHO[0],
      servings: Math.min(40, Math.max(1, parseInt(d.servings, 10) || 4)),
      ingredients: d.ingredients.filter(function (x) { return x.trim(); }),
      steps: d.steps.filter(function (x) { return x.trim(); })
    };
    if ((d.prepTime || "").trim()) recipe.prepTime = d.prepTime.trim();
    if ((d.cookTime || "").trim()) recipe.cookTime = d.cookTime.trim();
    if ((d.notes || "").trim()) recipe.notes = d.notes.trim();
    if (d.flagged && d.flagged.length) recipe.flagged = d.flagged.slice();
    if ((d.source || "").trim()) recipe.source = d.source.trim();
    var newTags = parseTags(d.tags);
    if (newTags.length) recipe.tags = newTags;

    /* The photo was staged under a placeholder key because the id only exists
       once the title is known. Move it across now. */
    var staged = images()["__new__"];
    if (staged) {
      setImage(id, staged);
      removeImage("__new__");
    }

    S.recipes = S.recipes.concat([recipe]);
    persistRecipes();
    S.addDraft = null;
    S.addStep = "choose";
    S.addError = "";
    S.addUrl = "";
    S.addPaste = "";
    S.addPhoto = null;
    location.hash = "#" + id;
  }

  function slugify(text) {
    return String(text || "").toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  /* ---- from a link: schema.org/Recipe JSON-LD via a public relay ---- */

  function fetchWithTimeout(url) {
    if (typeof AbortController === "undefined") return fetch(url);
    var ctl = new AbortController();
    var timer = setTimeout(function () { ctl.abort(); }, RELAY_TIMEOUT);
    return fetch(url, { signal: ctl.signal }).then(
      function (res) { clearTimeout(timer); return res; },
      function (err) { clearTimeout(timer); throw err; }
    );
  }

  /* Walks the relay list until one returns something usable. */
  function fetchViaRelays(url, index) {
    index = index || 0;
    if (index >= RELAYS.length) {
      return Promise.reject(new Error(
        "None of the ways in could reach that page — the site may block it, or " +
        "the relay services may be down. Paste the recipe text below instead; " +
        "that always works."
      ));
    }
    var relay = RELAYS[index];
    S.addBusy = "Fetching the page… (" + (index + 1) + " of " + RELAYS.length + ")";
    render();

    return fetchWithTimeout(relay.url(url))
      .then(function (res) {
        if (!res.ok) throw new Error("HTTP " + res.status);
        return res.text();
      })
      .then(function (body) {
        if (!body || body.length < 200) throw new Error("empty response");
        var draft = relay.kind === "html" ? recipeFromHtml(body) : null;
        if (draft) return { draft: draft, guessed: false };
        /* r.jina.ai hands back readable text rather than markup — no JSON-LD to
           find, but the photo parser handles exactly this shape. */
        if (relay.kind === "text") return { draft: draftFromText(body), guessed: true };
        throw new Error("no recipe data");
      })
      .catch(function () {
        return fetchViaRelays(url, index + 1);
      });
  }

  function importFromLink() {
    var url = (S.addUrl || "").trim();
    S.addError = "";
    if (!/^https?:\/\//i.test(url)) {
      S.addError = "That doesn’t look like a web address. It should start with https://";
      render();
      return;
    }
    S.addBusy = "Fetching the page…";
    render();

    fetchViaRelays(url)
      .then(function (result) {
        var draft = result.draft;
        draft.source = url;
        draft.flagged.push(
          result.guessed
            ? "Read from the page as plain text — the split between ingredients " +
              "and steps was guessed. Check both lists against the original."
            : "Imported from a link — check it against the original."
        );
        S.addDraft = draft;
        S.addStep = "review";
        S.addBusy = "";
        render();
      })
      .catch(function (err) {
        S.addBusy = "";
        S.addError = err.message;
        render();
      });
  }

  function recipeFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var blocks = doc.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < blocks.length; i++) {
      var data;
      try { data = JSON.parse(blocks[i].textContent); } catch (e) { continue; }
      var node = findRecipeNode(data);
      if (node) return draftFromJsonLd(node);
    }
    return null;
  }

  function findRecipeNode(node) {
    if (!node || typeof node !== "object") return null;
    if (Array.isArray(node)) {
      for (var i = 0; i < node.length; i++) {
        var hit = findRecipeNode(node[i]);
        if (hit) return hit;
      }
      return null;
    }
    var t = node["@type"];
    if (t === "Recipe" || (Array.isArray(t) && t.indexOf("Recipe") > -1)) return node;
    if (node["@graph"]) return findRecipeNode(node["@graph"]);
    return null;
  }

  function draftFromJsonLd(node) {
    function text(v) {
      if (!v) return "";
      if (typeof v === "string") return v.trim();
      if (Array.isArray(v)) return text(v[0]);
      if (v.text) return String(v.text).trim();
      if (v.name) return String(v.name).trim();
      return "";
    }
    function list(v) {
      if (!v) return [];
      if (typeof v === "string") {
        return v.split(/\n+/).map(function (s) { return s.trim(); }).filter(Boolean);
      }
      if (!Array.isArray(v)) return [text(v)].filter(Boolean);
      var out = [];
      v.forEach(function (item) {
        if (item && item["@type"] === "HowToSection" && item.itemListElement) {
          out = out.concat(list(item.itemListElement));
        } else {
          var s = text(item);
          if (s) out.push(s);
        }
      });
      return out;
    }
    /* ISO 8601 durations rendered readable; anything else passes through. */
    function dur(v) {
      var raw = text(v);
      var m = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(raw);
      if (!m || (!m[1] && !m[2])) return /^P/.test(raw) ? "" : raw;
      var parts = [];
      if (m[1]) parts.push(m[1] + " hr");
      if (m[2]) parts.push(m[2] + " min");
      return parts.join(" ");
    }

    var d = blankDraft();
    d.flagged = [];
    d.title = text(node.name);
    if (!d.title) d.flagged.push("No title was found on the page — add one.");

    d.ingredients = list(node.recipeIngredient || node.ingredients);
    if (!d.ingredients.length) {
      d.ingredients = [""];
      d.flagged.push("No ingredients were found — check the original page.");
    }

    d.steps = list(node.recipeInstructions);
    if (!d.steps.length) {
      d.steps = [""];
      d.flagged.push("No steps were found — check the original page.");
    }

    var y = text(node.recipeYield);
    var yn = parseInt((y.match(/\d+/) || [])[0], 10);
    if (yn) d.servings = Math.min(40, Math.max(1, yn));
    else d.flagged.push("No serving count was found — 4 was assumed.");

    d.prepTime = dur(node.prepTime);
    d.cookTime = dur(node.cookTime || node.totalTime);
    d.category = guessCategory(text(node.recipeCategory));
    d.notes = text(node.description);
    return capDraft(d);
  }

  /* Import fields are bounded (gameplan 046). A hostile or broken page can
     emit fields of any size; unchecked they exhaust the few MB localStorage
     offers and make every later render crawl. The caps are far above any real
     recipe, and every trim is disclosed in flagged rather than silent. */
  var CAPS = {
    title: 300, time: 60, notes: 5000, source: 300,
    line: 500, step: 2000, ingredients: 100, steps: 60
  };

  function capDraft(d) {
    var trimmed = [];
    function capText(key, max, label) {
      if (typeof d[key] === "string" && d[key].length > max) {
        d[key] = d[key].slice(0, max);
        trimmed.push(label);
      }
    }
    function capList(key, maxItems, maxLen, label) {
      if (!Array.isArray(d[key])) return;
      if (d[key].length > maxItems) {
        d[key] = d[key].slice(0, maxItems);
        trimmed.push(label + " list");
      }
      var cut = false;
      d[key] = d[key].map(function (s) {
        s = String(s);
        if (s.length > maxLen) { cut = true; return s.slice(0, maxLen); }
        return s;
      });
      if (cut) trimmed.push("a " + label + " line");
    }
    capText("title", CAPS.title, "the title");
    capText("prepTime", CAPS.time, "the prep time");
    capText("cookTime", CAPS.time, "the cook time");
    capText("notes", CAPS.notes, "the notes");
    capText("source", CAPS.source, "the source");
    capList("ingredients", CAPS.ingredients, CAPS.line, "ingredient");
    capList("steps", CAPS.steps, CAPS.step, "step");
    if (trimmed.length) {
      d.flagged = (d.flagged || []).concat(
        "Trimmed unusually long content from this import (" +
        trimmed.filter(function (t, i) { return trimmed.indexOf(t) === i; }).join(", ") +
        ") — check nothing important was cut."
      );
    }
    return d;
  }

  function guessCategory(raw) {
    var v = String(raw || "").toLowerCase().trim();
    if (!v) return "Dinner";
    /* Recipe sites emit singular categories — "Dessert", "Side dish", "Drink".
       Our names are plural, so match the stem as well or every import lands in
       Dinner. */
    for (var i = 0; i < CATS.length; i++) {
      var cat = CATS[i].toLowerCase();
      if (v.indexOf(cat) > -1 || v.indexOf(cat.replace(/s$/, "")) > -1) {
        return CATS[i];
      }
    }
    if (/appetizer|salad|soup|bread|starter|accompaniment/.test(v)) return "Sides";
    if (/cake|cookie|biscuit|pudding|sweet|pastry|tart/.test(v)) return "Desserts";
    if (/cocktail|martini|negroni/.test(v)) return "Cocktails";
    if (/smoothie|juice|tea|coffee|lemonade/.test(v)) return "Drinks";
    if (/bake|bread|scone|muffin/.test(v)) return "Baking";
    return "Dinner";
  }

  /* ---- from a photo: in-browser OCR, lazily loaded ---- */

  function loadTesseract() {
    if (window.Tesseract) return Promise.resolve(window.Tesseract);
    return new Promise(function (resolve, reject) {
      var done = false;
      var s = document.createElement("script");
      s.src = TESSERACT_CDN;
      s.async = true;
      s.onload = function () {
        done = true;
        if (window.Tesseract) resolve(window.Tesseract);
        else reject(new Error("The text-recognition library loaded but didn’t start."));
      };
      s.onerror = function () {
        done = true;
        reject(new Error(
          "The text-recognition library couldn’t be downloaded. It needs a " +
          "connection the first time. You can still type the recipe in."
        ));
      };
      document.head.appendChild(s);
      setTimeout(function () {
        if (!done) reject(new Error("Reading the photo took too long. Try a smaller picture, or type it in."));
      }, 45000);
    });
  }

  function importFromPhoto() {
    if (!S.addPhoto) return;
    S.addError = "";
    S.addBusy = "Getting ready…";
    render();

    loadTesseract()
      .then(function (T) {
        S.addBusy = "Reading the photo… this can take a minute.";
        render();
        return T.recognize(S.addPhoto, "eng", {
          logger: function (m) {
            if (m.status === "recognizing text" && typeof m.progress === "number") {
              S.addBusy = "Reading the photo… " + Math.round(m.progress * 100) + "%";
              var n = document.querySelector(".notice");
              if (n) n.textContent = S.addBusy;
            }
          }
        });
      })
      .then(function (res) {
        var text = (res && res.data && res.data.text) || "";
        if (!text.trim()) {
          throw new Error("No readable text was found in that picture. Try a clearer, flatter photo.");
        }
        var draft = draftFromText(text);
        draft.flagged.push("Read from a photo — the text will have mistakes. Check every line.");
        S.addDraft = draft;
        S.addStep = "review";
        S.addBusy = "";
        render();
      })
      .catch(function (err) {
        S.addBusy = "";
        S.addError = err.message;
        render();
      });
  }

  var HEADINGS = {
    ingredients: /^(ingredients?|what you(’|')?ll need|you will need)\s*:?\s*$/i,
    steps: /^(instructions?|directions?|steps?|method|preparation)\s*:?\s*$/i,
    notes: /^(notes?|tips?)\s*:?\s*$/i
  };
  var QTY_START = /^(\d|½|⅓|¼|¾|⅔|⅛|a |an |one |two |three |four |half )/i;
  var MEASURE = /\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|litres?|liters?|cloves?|cans?|packets?|packages?|pinch|dash|sticks?|slices?|quarts?|pints?)\b/i;

  function draftFromText(raw) {
    var lines = raw.split(/\r?\n/)
      .map(function (l) {
        return l.replace(/^[\s•\-*–—]+/, "").replace(/^\d+[.)]\s*/, "").trim();
      })
      .filter(Boolean);

    var d = blankDraft();
    d.flagged = [];
    d.ingredients = [];
    d.steps = [];
    var notes = [];
    var section = null;
    var sawHeadings = false;

    lines.forEach(function (line, index) {
      var matched = null;
      Object.keys(HEADINGS).forEach(function (k) {
        if (HEADINGS[k].test(line)) matched = k;
      });
      if (matched) { section = matched; sawHeadings = true; return; }
      if (!d.title && index === 0) { d.title = line; return; }
      if (section === "ingredients") d.ingredients.push(line);
      else if (section === "steps") d.steps.push(line);
      else if (section === "notes") notes.push(line);
      else if ((QTY_START.test(line) || MEASURE.test(line)) && line.length < 90) {
        d.ingredients.push(line);
      } else if (line.length > 40) d.steps.push(line);
      else d.ingredients.push(line);
    });

    if (!d.title) {
      d.title = "";
      d.flagged.push("No title was obvious — add one.");
    }
    if (!sawHeadings) {
      d.flagged.push(
        "There were no “Ingredients” / “Instructions” headings, so the split " +
        "between the two lists was guessed. Check both."
      );
    }
    if (!d.ingredients.length) { d.ingredients = [""]; d.flagged.push("No ingredients were picked up."); }
    if (!d.steps.length) { d.steps = [""]; d.flagged.push("No steps were picked up."); }
    d.notes = notes.join(" ");
    d.source = "Read from a photo";
    return capDraft(d);
  }

  /* ======================================================================
     11. Share / download / wake lock
     ====================================================================== */

  function recipeText(r) {
    var mult = S.serves && r.servings ? S.serves / r.servings : 1;
    var lines = [r.title, ""];
    lines.push("From: " + r.contributor);
    lines.push(
      S.serves === r.servings
        ? "Serves " + r.servings
        : "Serves " + S.serves + " (adjusted from " + r.servings + ")"
    );
    if (r.prepTime) lines.push("Prep: " + r.prepTime);
    if (r.cookTime) lines.push("Cook: " + r.cookTime);
    lines.push("", "INGREDIENTS");
    if ((r.ingredients || []).length) {
      r.ingredients.forEach(function (i) { lines.push("- " + scaleLine(i, mult)); });
    } else {
      lines.push("(not captured for this recipe)");
    }
    lines.push("", "INSTRUCTIONS");
    (r.steps || []).forEach(function (s, i) {
      lines.push(i + 1 + ". " + scaleLine(s, mult));
    });
    if (r.notes) lines.push("", "NOTES", r.notes);
    if (r.flagged && r.flagged.length) {
      lines.push("", "WORTH DOUBLE-CHECKING");
      r.flagged.forEach(function (f) { lines.push("- " + f); });
    }
    if (r.source) lines.push("", "Source: " + r.source);
    return lines.join("\n");
  }

  function downloadBlob(text, filename, type) {
    var blob = new Blob([text], { type: type });
    var url = URL.createObjectURL(blob);
    var a = document.createElement("a");
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    a.remove();
    setTimeout(function () { URL.revokeObjectURL(url); }, 1000);
  }

  function shareRecipe(r) {
    var text = recipeText(r);
    if (navigator.share) {
      navigator.share({ title: r.title, text: text }).catch(function () {});
      return;
    }
    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(function () {
        setNotice("Recipe copied to the clipboard.");
      }).catch(function () {
        downloadBlob(text, r.id + ".txt", "text/plain;charset=utf-8");
      });
      return;
    }
    downloadBlob(text, r.id + ".txt", "text/plain;charset=utf-8");
  }

  var wakeSentinel = null;
  var wakeWanted = false;   // the user's intent, kept across backgrounding

  function dropWake() {
    if (wakeSentinel) {
      try { wakeSentinel.release(); } catch (e) {}
      wakeSentinel = null;
    }
    S.awake = false;
  }

  function releaseWake() {
    wakeWanted = false;
    dropWake();
  }

  function requestWake() {
    return navigator.wakeLock.request("screen").then(function (s) {
      wakeSentinel = s;
      S.awake = true;
      s.addEventListener("release", function () {
        wakeSentinel = null;
        S.awake = false;
      });
    });
  }

  function toggleWake() {
    if (S.awake) {
      releaseWake();
      render();
      return;
    }
    wakeWanted = true;
    requestWake().then(render).catch(function () {
      wakeWanted = false;
      setNotice("This browser wouldn’t keep the screen on.");
    });
  }

  /* iOS drops the lock whenever the tab is backgrounded and does not restore
     it. Without re-requesting, the switch silently stops working the first
     time someone answers a text mid-recipe. */
  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") {
      dropWake();
      return;
    }
    if (wakeWanted && S.route.name === "recipe" && "wakeLock" in navigator) {
      requestWake().then(render).catch(function () {
        wakeWanted = false;
        render();
      });
    }
  });

  /* ======================================================================
     12. Router + boot
     ====================================================================== */

  function parseHash() {
    var raw = (location.hash || "#").slice(1);
    if (!raw || raw === "main") return { name: "main", id: "" };
    if (raw === "add") return { name: "add", id: "" };
    if (raw.indexOf("menu") === 0) {
      var qs = raw.indexOf("?") > -1 ? raw.slice(raw.indexOf("?") + 1) : "";
      var who = [], cats = [], tags = [];
      qs.split("&").forEach(function (pair) {
        var kv = pair.split("=");
        if (kv[0] === "who" && kv[1]) who = [decodeURIComponent(kv[1])];
        if (kv[0] === "cat" && kv[1]) cats = [decodeURIComponent(kv[1])];
        if (kv[0] === "tag" && kv[1]) tags = [decodeURIComponent(kv[1])];
      });
      return { name: "menu", id: "", who: who, cats: cats, tags: tags };
    }
    return { name: "recipe", id: decodeURIComponent(raw) };
  }

  /* Scroll position per route. Coming back to the Menu from a recipe should
     land where you left off — with 48 cards, jumping to the top every time is
     a real cost. */
  var scrollPos = {};
  var scrollTick = null;

  function routeKey(route) {
    return route.name + ":" + (route.id || "");
  }

  window.addEventListener("scroll", function () {
    if (scrollTick) return;
    scrollTick = setTimeout(function () {
      scrollTick = null;
      scrollPos[routeKey(S.route)] = window.scrollY;
    }, 120);
  }, { passive: true });

  function screenTitle() {
    if (S.route.name === "menu") return "Menu — Kitchen Table";
    if (S.route.name === "add") return "Add a recipe — Kitchen Table";
    if (S.route.name === "recipe") {
      var r = byId(S.route.id);
      return (r ? r.title + " — " : "") + "Kitchen Table";
    }
    return "Kitchen Table";
  }

  function announce(text) {
    var live = document.getElementById("route-live");
    if (live) live.textContent = text;
  }

  /* Sets the one transient message slot and speaks it. Both callers live on
     the Recipe screen, so the message has to render there — not only on the
     Menu, where it used to be the sole thing that displayed it. */
  function setNotice(text) {
    S.notice = text;
    render();
    announce(text);
  }

  function onRoute() {
    var next = parseHash();
    var changedRecipe = next.name !== "recipe" || next.id !== S.route.id;
    var changedRoute = routeKey(next) !== routeKey(S.route);

    if (next.name === "menu") {
      if (next.who.length || next.cats.length || next.tags.length) {
        S.who = next.who;
        S.cats = next.cats;
        S.tags = next.tags;
      } else if (S.route.name !== "recipe") {
        /* A bare #menu means the whole menu. Without this, arriving from
           #menu?who=Lindsay leaves the filter applied while the address bar
           claims otherwise. Coming back from a recipe is the exception — that
           should return the list as you left it, which is why the scroll
           position is restored too. */
        S.who = [];
        S.cats = [];
        S.tags = [];
      }
    }

    /* Arriving at Add from elsewhere starts a fresh one. Staying on it keeps
       the draft, so "Start over" is the only thing that discards work. */
    if (next.name === "add" && S.route.name !== "add") {
      S.addStep = "choose";
      S.addDraft = null;
      S.addError = "";
      S.addBusy = "";
      S.addUrl = "";
      S.addPaste = "";
      S.addPhoto = null;
    }

    if (changedRecipe) {
      /* Check state is per-visit and must not survive leaving the recipe. */
      S.checkedIng = {};
      S.checkedStep = {};
      S.editing = false;
      S.draft = null;
      S.saved = false;
      S.dlOpen = false;
      releaseWake();
    }

    S.route = next;
    S.notice = "";

    if (next.name === "recipe") {
      var r = byId(next.id);
      if (r && changedRecipe) S.serves = r.servings || 4;
    }

    render();

    document.title = screenTitle();

    if (changedRoute) {
      window.scrollTo(0, scrollPos[routeKey(next)] || 0);
      /* Move focus to the new screen's heading so a screen reader and a
         keyboard both land somewhere sensible after navigating. */
      var head = document.querySelector("#app h1");
      if (head) {
        head.setAttribute("tabindex", "-1");
        head.focus({ preventScroll: true });
      }
      announce(document.title);
    }
  }

  function render() {
    var app = document.getElementById("app");
    if (!app) return;

    /* Preserve focus and caret across the re-render. */
    var active = document.activeElement;
    var focusId = active && active.id ? active.id : null;
    var selStart = null, selEnd = null;
    if (focusId && active.selectionStart !== undefined) {
      try {
        selStart = active.selectionStart;
        selEnd = active.selectionEnd;
      } catch (e) {}
    }

    var html;
    if (S.error) {
      html = '<div class="main"><p class="emptystate">' + esc(S.error) + "</p></div>";
    } else if (!S.loaded) {
      html = '<p class="boot">Loading recipes…</p>';
    } else if (S.route.name === "menu") {
      html = viewMenu();
    } else if (S.route.name === "add") {
      html = viewAdd();
    } else if (S.route.name === "recipe") {
      var r = byId(S.route.id);
      html = r
        ? viewRecipe(r)
        : '<div class="main"><div class="emptystate">' + ART.empty() +
          "<p>That recipe isn’t here.</p>" +
          '<a class="bigbtn press" href="#menu">See all recipes</a></div></div>';
    } else {
      html = viewMain();
    }

    /* Version, bottom corner of every screen. Outside the screen wrapper so it
       never inherits the recipe's reading size — this is chrome, and chrome
       does not scale with A−/A+. */
    if (S.loaded) {
      html += '<p class="vstamp">v' + VERSION + "</p>";
    }

    app.innerHTML = html;

    /* Every flag is consumed by exactly one paint. A sheet slides up when it
       opens and then stays put, so ticking a filter chip inside it does not
       re-play the slide. */
    app.classList.toggle("sheet-in", S.pulseSheet);
    S.pulseRow = "";
    S.pulseScale = false;
    S.pulseTheme = false;
    S.pulseSheet = false;

    /* The enter animation belongs to a change of screen, not to every state
       change — otherwise tapping a filter chip re-plays the whole page. */
    var painted = routeKey(S.route);
    if (S.loaded && painted !== S.paintedRoute) {
      S.paintedRoute = painted;
      app.classList.remove("screen-in");
      void app.offsetWidth; // restart, rather than continue, the animation
      app.classList.add("screen-in");
    }

    if (focusId) {
      var el = document.getElementById(focusId);
      if (el) {
        el.focus();
        if (selStart !== null && el.setSelectionRange) {
          try { el.setSelectionRange(selStart, selEnd); } catch (e) {}
        }
      }
    }

    syncSheetFocus();
  }

  /* One delegated listener for every action in the app. */
  document.addEventListener("click", function (ev) {
    var el = ev.target.closest ? ev.target.closest("[data-act]") : null;
    if (!el) return;
    var act = el.getAttribute("data-act");
    var key = el.getAttribute("data-key");
    var idx = parseInt(el.getAttribute("data-i"), 10);
    var r = S.route.name === "recipe" ? byId(S.route.id) : null;

    if (act === "theme") { toggleTheme(); return; }
    if (act === "open-text") { openSheet("textOpen", el); return; }
    if (act === "close-text") { closeSheet("textOpen"); return; }
    if (act === "toggle-easy") { toggleEasy(); return; }
    if (act === "fs-") { stepFs(-1); return; }
    if (act === "fs+") { stepFs(1); return; }

    if (act === "toggle-search") {
      S.searchOpen = !S.searchOpen;
      if (!S.searchOpen) S.menuQ = "";
      render();
      if (S.searchOpen) {
        var f = document.getElementById("menu-search");
        if (f) f.focus();
      }
      return;
    }
    if (act === "open-filter") { openSheet("filterOpen", el); return; }
    if (act === "close-filter") { closeSheet("filterOpen"); return; }
    if (act === "toggle-sort") { S.sortOpen = !S.sortOpen; render(); return; }
    if (act === "sort") { S.sort = key; S.sortOpen = false; render(); return; }
    if (act === "fw") {
      var iw = S.who.indexOf(key);
      if (iw > -1) S.who.splice(iw, 1); else S.who.push(key);
      render(); return;
    }
    if (act === "fc") {
      var ic = S.cats.indexOf(key);
      if (ic > -1) S.cats.splice(ic, 1); else S.cats.push(key);
      render(); return;
    }
    if (act === "ft") {
      var it = S.tags.indexOf(key);
      if (it > -1) S.tags.splice(it, 1); else S.tags.push(key);
      render(); return;
    }
    /* Clearing filters has to drop them from the address too. Otherwise the
       list shows everything while the URL still says ?who=…, and a reload or a
       shared link quietly re-applies it. */
    function dropFilterParams() {
      if (/^#menu\?/.test(location.hash)) {
        location.hash = "#menu";
        return true;
      }
      return false;
    }
    if (act === "reset-filters") {
      S.who = []; S.cats = []; S.tags = [];
      if (!dropFilterParams()) render();
      return;
    }
    if (act === "clear-filters") {
      S.who = []; S.cats = []; S.tags = []; S.menuQ = "";
      if (!dropFilterParams()) render();
      return;
    }
    if (act === "show-all") {
      S.who = []; S.cats = []; S.tags = []; S.menuQ = "";
      S.searchOpen = false;
      if (!dropFilterParams()) render();
      return;
    }
    if (act === "toggle-remove") { S.removing = !S.removing; render(); return; }
    if (act === "reset-local") { resetLocal(); return; }
    if (act === "rm-photo") { removeImage(key); render(); return; }
    if (act === "dl-photos") { downloadPhotos(); return; }
    if (act === "remove") {
      var victim = byId(el.getAttribute("data-id"));
      if (victim && window.confirm('Remove "' + victim.title + '" from the collection?')) {
        S.recipes = S.recipes.filter(function (x) { return x.id !== victim.id; });
        persistRecipes();
        render();
      }
      return;
    }
    /* ---- Add / Import ---- */
    if (act === "add-path") {
      S.addStep = key;
      S.addError = "";
      if (key === "review") S.addDraft = blankDraft();
      render();
      return;
    }
    if (act === "add-back") {
      S.addStep = "choose";
      S.addError = "";
      S.addBusy = "";
      render();
      return;
    }
    if (act === "add-fetch") { importFromLink(); return; }
    if (act === "add-paste") {
      var text = (S.addPaste || "").trim();
      if (!text) return;
      var draft = draftFromText(text);
      draft.source = (S.addUrl || "").trim() || "Pasted text";
      S.addDraft = draft;
      S.addStep = "review";
      S.addError = "";
      S.addBusy = "";
      render();
      return;
    }
    if (act === "add-ocr") { importFromPhoto(); return; }
    if (act === "aadd") { S.addDraft[key].push(""); render(); return; }
    if (act === "adel") { S.addDraft[key].splice(idx, 1); render(); return; }
    if (act === "add-save") { saveNewRecipe(); return; }

    if (!r) return;

    if (act === "serv-" || act === "serv+") {
      var before = S.serves;
      S.serves = act === "serv-"
        ? Math.max(1, S.serves - 1)
        : Math.min(40, S.serves + 1);
      S.pulseScale = S.serves !== before;
      render();
      return;
    }
    /* Only a newly-ticked row animates. Un-ticking is a correction, and a
       correction should not be celebrated. */
    if (act === "chk-i") {
      S.checkedIng[idx] = !S.checkedIng[idx];
      S.pulseRow = S.checkedIng[idx] ? "i:" + idx : "";
      render(); return;
    }
    if (act === "chk-s") {
      S.checkedStep[idx] = !S.checkedStep[idx];
      S.pulseRow = S.checkedStep[idx] ? "s:" + idx : "";
      render(); return;
    }
    if (act === "toggle-wake") { toggleWake(); return; }
    if (act === "share") { shareRecipe(r); return; }
    if (act === "open-dl") { openSheet("dlOpen", el); return; }
    if (act === "close-dl") { closeSheet("dlOpen"); return; }
    if (act === "dl-txt") {
      downloadBlob(recipeText(r), r.id + ".txt", "text/plain;charset=utf-8");
      S.dlOpen = false; render(); return;
    }
    if (act === "dl-pdf") {
      S.dlOpen = false;
      render();
      /* Prints from the dedicated print stylesheet — black on white, no
         chrome — rather than screenshotting the dark UI. */
      setTimeout(function () { window.print(); }, 60);
      return;
    }

    if (act === "toggle-edit") {
      S.editing = !S.editing;
      if (S.editing) startDraft(r);
      else { S.draft = null; S.saved = false; }
      render(); return;
    }
    if (act === "add") {
      S.draft[key].push("");
      S.saved = false;
      render(); return;
    }
    if (act === "del") {
      S.draft[key].splice(idx, 1);
      S.saved = false;
      render(); return;
    }
    if (act === "save") { saveDraft(r); render(); return; }
    if (act === "dl-json") {
      downloadBlob(
        JSON.stringify(S.recipes.map(orderFields), null, 2) + "\n",
        "recipes.json",
        "application/json"
      );
      return;
    }
  });

  document.addEventListener("input", function (ev) {
    var el = ev.target;
    var act = el.getAttribute && el.getAttribute("data-act");
    if (!act) return;

    if (act === "main-q") { S.mainQ = el.value; render(); return; }
    if (act === "menu-q") { S.menuQ = el.value; render(); return; }
    if (act === "a-url") { S.addUrl = el.value; return; }
    if (act === "a-paste") {
      var had = !!(S.addPaste || "").trim();
      S.addPaste = el.value;
      /* Re-render only when the button's enabled state actually flips, so
         typing doesn't rebuild the textarea on every keystroke. */
      if (had !== !!el.value.trim()) render();
      return;
    }
    if (act === "e-photo-act" || act === "a-photo-act") {
      var file = el.files && el.files[0];
      if (!file) return;
      var target = el.getAttribute("data-key");
      readPhoto(file)
        .then(function (dataUrl) {
          var err = setImage(target, dataUrl);
          if (err) { S.addError = err; setNotice(err); }
          else { S.addError = ""; render(); }
        })
        .catch(function (e) { setNotice(e.message); });
      return;
    }
    if (act === "a-photo") {
      S.addPhoto = (el.files && el.files[0]) || null;
      S.addError = "";
      render();
      return;
    }
    if (act === "ad") {
      S.addDraft[el.getAttribute("data-k")] = el.value;
      return;
    }
    if (act === "adl") {
      S.addDraft[el.getAttribute("data-k")][parseInt(el.getAttribute("data-i"), 10)] = el.value;
      return;
    }
    if (act === "d") {
      S.draft[el.getAttribute("data-k")] = el.value;
      S.saved = false;
      var btn = document.querySelector('[data-act="save"]');
      if (btn) btn.textContent = "Save changes";
      return;
    }
    if (act === "dl") {
      S.draft[el.getAttribute("data-k")][parseInt(el.getAttribute("data-i"), 10)] = el.value;
      S.saved = false;
      return;
    }
  });

  document.addEventListener("keydown", function (ev) {
    if (ev.key !== "Escape") return;
    if (S.filterOpen) closeSheet("filterOpen");
    else if (S.textOpen) closeSheet("textOpen");
    else if (S.dlOpen) closeSheet("dlOpen");
    else if (S.sortOpen) { S.sortOpen = false; render(); }
  });

  /* The sort menu is a popup, not a sheet — a tap anywhere else dismisses it. */
  document.addEventListener("click", function (ev) {
    if (!S.sortOpen) return;
    if (ev.target.closest && ev.target.closest('.sortmenu, [data-act="toggle-sort"]')) return;
    S.sortOpen = false;
    render();
  }, true);

  window.addEventListener("hashchange", onRoute);

  applyTheme();

  fetch("recipes.json", { cache: "no-cache" })
    .then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    })
    .then(function (data) {
      S.base = data;
      applyOverlay();
      S.loaded = true;
      onRoute();
    })
    .catch(function (err) {
      S.error = "The recipes could not be loaded (" + err.message +
                "). Check the connection and reload.";
      render();
    });
})();
