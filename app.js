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
     a recipe when they contribute one. Jessica joined 2026-08-02. */
  var WHO = ["Joan", "Jason", "Jennifer", "Lindsay", "Siobhan", "Jessica"];

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
    images: "kt.images",
    /* sessionStorage, not localStorage: an accidental refresh mid-import
       keeps the work, closing the tab lets it go. Nothing here is "saved" —
       the draft only becomes a recipe when Save is pressed. */
    addDraft: "kt.addDraft",
    plan: "kt.plan",
    /* Where the kitchen server lives. Unset means the baked-in address;
       tests point it at a stub. */
    importApi: "kt.importApi"
  };

  /* The week planner's slots. All three exist on every day; the UI shows
     Dinner always and the others on demand (DECISIONS.md 120). */
  var SLOTS = ["breakfast", "lunch", "dinner"];

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
    { name: "directly", url: function (u) { return u; }, kind: "html" },
    { name: "allorigins.win", url: function (u) { return "https://api.allorigins.win/raw?url=" + encodeURIComponent(u); }, kind: "html" },
    { name: "corsproxy.io", url: function (u) { return "https://corsproxy.io/?url=" + encodeURIComponent(u); }, kind: "html" },
    { name: "r.jina.ai", url: function (u) { return "https://r.jina.ai/" + u; }, kind: "text" }
  ];
  var RELAY_TIMEOUT = 12000;
  /* Pinned to the exact version, with subresource integrity: a tampered CDN
     copy refuses to load rather than running (gameplan 048). The hash is the
     sha384 of this one file — bumping the version means recomputing it:
       curl -sL <url> | openssl dgst -sha384 -binary | openssl base64 -A
     SRI covers this entry script; the worker and wasm it then fetches are
     version-pinned by it in turn, which is as far as the mechanism reaches. */
  var TESSERACT_CDN = "https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/tesseract.min.js";
  var TESSERACT_SRI = "sha384-GJqSu7vueQ9qN0E9yLPb3Wtpd7OrgK8KmYzC8T1IysG1bcvxvIO4qtYR/D3A991F";

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
    },
    flag: function (s) {
      return svg('<path d="M6 21V4"/><path d="M6 4h11l-2.5 4L17 12H6"/>', s || 16, s || 16);
    },
    swap: function (s) {
      return svg(
        '<path d="M8 7h11"/><path d="M15.5 3.5L19 7l-3.5 3.5"/>' +
        '<path d="M16 17H5"/><path d="M8.5 13.5L5 17l3.5 3.5"/>',
        s || 20, s || 20
      );
    },
    /* The mark: the steam bowl, the same drawing the empty hero uses — one
       identity, not a generic book. */
    logo: function (s) {
      return svg(
        '<path d="M9.5 9.5c-3-3 3-5 0-8"/><path d="M14.5 9.5c-3-3 3-5 0-8"/>' +
        '<path d="M4 13q8 7 16 0"/><path d="M3 13h18"/><path d="M7.5 20h9"/>',
        s || 26, s || 26
      );
    }
  };

  /* One per category, drawn rather than pulled from a library — the handoff
     asks for stroke-based inline SVG in currentColor and nothing else. */
  var CAT_ICON = {
    /* 056: the centred ellipse-plus-circle read as an eye, not an egg. In a
       pan, with the yolk off-centre, it can only be breakfast. */
    Breakfast: '<circle cx="10" cy="12" r="7"/><circle cx="8.8" cy="10.8" r="2.4"/><path d="M17 12h4.5"/>',
    Brunch: '<path d="M6 5h9v5a4.5 4.5 0 01-9 0z"/><path d="M15 6.5h1.8a2 2 0 010 4H15"/><path d="M4 19h13"/>',
    Lunch: '<path d="M3.5 15l8.5-8 8.5 8z"/><path d="M3.5 15h17"/><path d="M6 18.5h12"/>',
    Dinner: '<path d="M6 3v8a2 2 0 004 0V3"/><path d="M8 11v10"/><path d="M17 3c-1.6 1.4-2.2 3.4-2 6 .1 1.3.7 2 2 2z"/><path d="M17 11v10"/>',
    /* 056: the old lone half-dome read as a mound at 20px and shadowed the
       Lunch cloche. A footed bowl with two peas above the rim is a side dish
       at any size. */
    Sides: '<path d="M4 10.5h16"/><path d="M4.5 10.5a7.5 7.5 0 0015 0"/><path d="M9.5 18h5"/><circle cx="9.5" cy="7" r="1.3"/><circle cx="14" cy="6.2" r="1.3"/>',
    Snacks: '<circle cx="12" cy="12" r="8"/><circle cx="9.5" cy="10" r="1"/><circle cx="14" cy="9.5" r="1"/><circle cx="12.5" cy="14.5" r="1"/>',
    /* 056: the diagonal whisk collapsed into a pill below 24px. A scored
       loaf on a board is bread — bread is baking. */
    Baking: '<path d="M4 14a4.5 4.5 0 014.5-4.5h7A4.5 4.5 0 0120 14v4H4z"/><path d="M9 12.2l-1.2 2.6M13.2 12.2l-1.2 2.6M17.2 12.2L16 14.8"/><path d="M2.5 21h19"/>',
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
    addPhotos: [],
    addDupe: null,     // id of the likely duplicate, when one was found
    addDupeOk: false,  // "Save anyway" pressed

    /* From a video — the one import that happens on the kitchen server. */
    videoUrl: "",
    videoJob: null,     // { id, status, stage, eta, overrun } while watching
    videoWaking: false, // slow first answer = free-tier server waking, not broken
    videoReady: [],     // finished imports awaiting review (the Add screen list)

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

    /* 068 — bulk tagging. Its own mode, same shape as removal: enter, tap
       recipes to select, then one sheet applies a tag list to all of them. */
    tagging: false,
    tagSel: {},
    tagSheetOpen: false,
    bulkTags: "",

    /* 069 — the rename/merge sheet. */
    tagManageOpen: false,
    tagEditing: "",
    tagEditVal: "",

    /* Phase 15 — the week planner. plan entries are shaped exactly like
       kitchen.menu_plan rows so the database wiring syncs, never migrates. */
    plan: [],
    planWeekOffset: 0,   // 0 = the week containing today; ±1 steps whole weeks
    pickFor: null,       // {date, slot} while the picker sheet is open
    pickQ: "",
    mealFor: null,       // plan-entry id while the meal sheet is open
    pickOpen: false,
    mealOpen: false,
    listOpen: false,     // the shopping-list preview fold

    editing: false,
    serves: null,
    checkedIng: {},
    checkedStep: {},
    awake: false,
    dlOpen: false,
    lbOpen: false,
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

  /* Every fraction a kitchen measure actually has: halves, thirds, quarters,
     and eighths. A scaled quantity SNAPS to the nearest one instead of ever
     printing a decimal — "0.83 cup" was Jason's bug report, and no recipe
     card in history has said 0.83. Worst-case snap error is 1/16 (~4% of a
     cup), and the "Amounts adjusted" note already tells the cook the numbers
     have been rescaled. */
  var VULGAR = [
    [0.125, "⅛"], [0.25, "¼"], [0.333, "⅓"], [0.375, "⅜"], [0.5, "½"],
    [0.625, "⅝"], [0.667, "⅔"], [0.75, "¾"], [0.875, "⅞"]
  ];

  function fmtQty(n) {
    if (n <= 0) return "0";
    var whole = Math.floor(n + 1e-9);
    var frac = n - whole;
    /* Snap to the nearest kitchen fraction (or to 0 / 1). */
    var best = null, bestD = frac; // distance to 0
    for (var i = 0; i < VULGAR.length; i++) {
      var d = Math.abs(frac - VULGAR[i][0]);
      if (d < bestD) { bestD = d; best = VULGAR[i][1]; }
    }
    if (1 - frac < bestD) { whole += 1; best = null; } // closer to the next whole
    if (whole === 0 && !best) best = "⅛"; // a nonzero amount never rounds to nothing
    if (whole === 0) return best;
    return best ? whole + best : String(whole);
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
  /* 087 — search folds diacritics and tolerates one adjacent typo. "creme"
     finds crème; "chiken" still finds chicken. Fold first (cheap, exact),
     fuzz only when folding found nothing, so precision degrades gracefully
     rather than fuzzily. */
  function fold(s) {
    var out = String(s).toLowerCase();
    /* normalize+strip combining marks where the engine has it; the map keeps
       the common cases working even without String.normalize. */
    if (out.normalize) out = out.normalize("NFD").replace(/[̀-ͯ]/g, "");
    var MAP = { "æ": "ae", "œ": "oe", "ø": "o", "ß": "ss", "đ": "d", "þ": "th" };
    return out.replace(/[æœøßđþ]/g, function (c) { return MAP[c] || c; });
  }

  /* One edit (missing, extra, wrong, or swapped letter) counts as a match for
     terms of 5+ letters — short words stay exact or they match everything. */
  function nearWord(word, term) {
    if (word.indexOf(term) > -1) return true;
    if (term.length < 5) return false;
    var la = word.length, lb = term.length;
    if (Math.abs(la - lb) > 1) {
      /* term may still sit inside a longer word with one typo — slide it. */
      for (var s = 0; s + lb - 1 <= la; s++) {
        if (editsAtMostOne(word.slice(s, s + lb + 1), term)) return true;
      }
      return false;
    }
    return editsAtMostOne(word, term);
  }

  function editsAtMostOne(a, b) {
    if (a === b) return true;
    var la = a.length, lb = b.length;
    if (Math.abs(la - lb) > 1) return false;
    var i = 0, j = 0, edits = 0;
    while (i < la && j < lb) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (la === lb) {
        /* swapped pair counts as the one edit */
        if (a[i] === b[j + 1] && a[i + 1] === b[j]) { i += 2; j += 2; }
        else { i++; j++; }
      } else if (la > lb) { i++; } else { j++; }
    }
    return edits + (la - i) + (lb - j) <= 1;
  }

  function fieldMatches(text, q) {
    var t = fold(text);
    if (t.indexOf(q) > -1) return true;
    var words = t.split(/[^a-z0-9]+/);
    return words.some(function (w) { return w && nearWord(w, q); });
  }

  /* 088 — say which field matched, so a tag hit doesn't look like a mistake.
     Returns "" (no match) or the field name, title first since a title hit
     needs no explanation. */
  function matchField(r, q) {
    if (!q) return "title";
    if (fieldMatches(r.title, q)) return "title";
    if (tagsOf(r).some(function (t) { return fieldMatches(t, q); })) return "tag";
    if ((r.ingredients || []).some(function (i) { return fieldMatches(i, q); })) return "ingredient";
    return "";
  }

  function matchesQuery(r, q) {
    return !q || matchField(r, fold(q)) !== "";
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

  /* ---- photos ----

     Photos live in IndexedDB (database "kt", store "images"), because
     localStorage tops out around twelve of them — task 010 measured ~425 KB
     per 1200px photo against a ~5 MB quota, and the collection is 48.

     Reads stay synchronous against an in-memory cache filled once at boot,
     so every call site keeps its shape. Writes update the cache immediately
     and persist behind it; a persist failure removes the cache entry again
     and reports, so the screen never shows a photo that isn't really kept.

     A browser with no usable IndexedDB falls back to the old localStorage
     store, whose smaller ceiling still fails loudly. Legacy kt.images data
     migrates into the database at boot and the old key is removed. */

  var IMG = {};
  var imgDb = null;
  var IMG_FULL_MSG =
    "There isn’t room on this phone for another photo. Download your " +
    "photos and recipes.json, commit them, then remove some here.";

  function idbOpen() {
    return new Promise(function (resolve) {
      if (!window.indexedDB) return resolve(null);
      var req;
      try { req = indexedDB.open("kt", 1); } catch (e) { return resolve(null); }
      req.onupgradeneeded = function () {
        req.result.createObjectStore("images");
      };
      req.onsuccess = function () { resolve(req.result); };
      req.onerror = function () { resolve(null); };
      req.onblocked = function () { resolve(null); };
    });
  }

  function idbPut(id, val) {
    return new Promise(function (resolve, reject) {
      try {
        var tx = imgDb.transaction("images", "readwrite");
        tx.objectStore("images").put(val, id);
        tx.oncomplete = function () { resolve(); };
        tx.onerror = tx.onabort = function () { reject(tx.error); };
      } catch (e) { reject(e); }
    });
  }

  function idbDelete(id) {
    return new Promise(function (resolve) {
      try {
        var tx = imgDb.transaction("images", "readwrite");
        tx.objectStore("images").delete(id);
        tx.oncomplete = tx.onerror = tx.onabort = function () { resolve(); };
      } catch (e) { resolve(); }
    });
  }

  function idbAll() {
    return new Promise(function (resolve) {
      var out = {};
      try {
        var tx = imgDb.transaction("images", "readonly");
        var store = tx.objectStore("images");
        var req = store.openCursor();
        req.onsuccess = function () {
          var cur = req.result;
          if (!cur) return resolve(out);
          out[cur.key] = cur.value;
          cur.continue();
        };
        req.onerror = function () { resolve(out); };
      } catch (e) { resolve(out); }
    });
  }

  /* Runs once at boot, before the first render. Never rejects. */
  function initImages() {
    return idbOpen().then(function (db) {
      imgDb = db;
      if (!db) {
        IMG = load(K.images, {}) || {};
        return;
      }
      return idbAll().then(function (map) {
        IMG = map;
        var legacy = load(K.images, null);
        if (!legacy || typeof legacy !== "object") return;
        var puts = Object.keys(legacy).map(function (k) {
          IMG[k] = legacy[k];
          return idbPut(k, legacy[k]);
        });
        return Promise.all(puts).then(function () {
          try { localStorage.removeItem(K.images); } catch (e) {}
        }, function () { /* keep the legacy key until it migrates */ });
      });
    });
  }

  function images() {
    return IMG;
  }

  /* A stored value is one data URL, or an array of them when a recipe spans
     several cards — the first page is the recipe's face everywhere. */
  function pagesOf(id) {
    var v = IMG[id];
    if (!v) return [];
    return Array.isArray(v) ? v : [v];
  }

  /* A local photo wins over the published path, so a freshly attached picture
     shows before anyone has committed the file. */
  function imageFor(recipe) {
    return pagesOf(recipe.id)[0] || recipe.image || "";
  }

  /* Resolves to "" on success or a user-facing message on failure. */
  function setImage(id, dataUrl) {
    IMG[id] = dataUrl;
    if (imgDb) {
      return idbPut(id, dataUrl).then(
        function () { return ""; },
        function () { delete IMG[id]; return IMG_FULL_MSG; }
      );
    }
    try {
      localStorage.setItem(K.images, JSON.stringify(IMG));
      return Promise.resolve("");
    } catch (e) {
      delete IMG[id];
      return Promise.resolve(IMG_FULL_MSG);
    }
  }

  function removeImage(id) {
    delete IMG[id];
    if (imgDb) idbDelete(id);
    else save(K.images, IMG);
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
    /* Multi-page recipes save as <id>.jpg, <id>-2.jpg, … */
    var files = [];
    ids.forEach(function (id) {
      pagesOf(id).forEach(function (url, page) {
        files.push({ name: id + (page ? "-" + (page + 1) : "") + ".jpg", url: url });
      });
    });
    files.forEach(function (f, i) {
      setTimeout(function () {
        var parts = f.url.split(",");
        var bin = atob(parts[1]);
        var bytes = new Uint8Array(bin.length);
        for (var j = 0; j < bin.length; j++) bytes[j] = bin.charCodeAt(j);
        downloadBlob(bytes, f.name, "image/jpeg");
      }, i * 350);
    });
    setNotice(
      files.length === 1
        ? "Saving 1 photo. Put it in the images folder and commit it."
        : "Saving " + files.length + " photos. Put them in the images folder and commit them."
    );
  }

  /* ======================================================================
     6. Main screen
     ====================================================================== */

  function viewMain() {
    var q = S.mainQ.trim().toLowerCase();
    var h = "";

    h += '<div class="main" id="main-content">';
    /* The mark sits with the name — a logo lockup on the left — and the one
       control (theme) keeps the right. The logo is a link home: pressing a
       logo should never do nothing. */
    h += '<div class="main__top"><div class="main__brand">' +
         '<a class="applogo press" href="#" aria-label="Kitchen Table — home">' +
         I.logo(30) + "</a>" +
         "<div>" +
         '<h1 class="main__title">Kitchen Table</h1>' +
         '<p class="main__sub">A Simmonds Styled Menu</p>' +
         "</div></div>" +
         themeBtn("themebtn--main") + "</div>";

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
             hits.slice(0, 12).map(function (r) {
               var f = matchField(r, fold(q));
               return cardHtml(r, f === "title" ? "" : f);
             }).join("") + "</div>";
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
           /* 058: an empty section is an invitation, not a zero. The plus and
              the words are the signal, so it never rests on colour alone. */
           return n
             ? '<a class="who-tile press" href="#menu?who=' +
               encodeURIComponent(name) + '">' +
               '<span class="who-tile__count">' + n + "</span>" +
               '<span class="who-tile__name">' + esc(name) + "</span></a>"
             : '<a class="who-tile who-tile--empty press" href="#menu?who=' +
               encodeURIComponent(name) + '">' +
               '<span class="who-tile__plus" aria-hidden="true">' + I.plus(26) + "</span>" +
               '<span class="who-tile__name">' + esc(name) + "</span>" +
               '<span class="who-tile__invite">None yet — add the first</span></a>';
         }).join("") +
         "</div></section>";

    /* Sits directly under "Whose recipe?" so the way to the whole list is
       reachable without scrolling past the course rows. */
    h += '<a class="bigbtn press" href="#menu">View all ' + S.recipes.length +
         " recipes " + I.chevR(16, 16) + "</a>";

    var planned = S.plan.filter(function (e) {
      return weekDays(0).map(isoDate).indexOf(e.date) > -1;
    }).length;
    h += '<a class="bigbtn bigbtn--quiet press" href="#plan">Plan the week' +
         (planned ? " · " + planned + " planned" : "") + " " + I.chevR(16, 16) + "</a>";

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

  function cardHtml(r, matchNote) {
    /* Long time strings are omitted rather than truncated. */
    var time = r.cookTime || r.prepTime || "";
    if (time.length > 14) time = "";
    /* meta is pre-escaped here — it is interpolated bare below. */
    var meta = esc(r.contributor) + (time ? " · " + esc(time) : "");
    /* 088: a hit on something not visible on the card says so, so a tag or
       ingredient match doesn't read as a wrong result. */
    if (matchNote) {
      meta += ' · <span class="matchnote">matches ' + esc(matchNote) + "</span>";
    }
    var src = imageFor(r);
    /* A photo replaces the category icon; without one, the icon is what tells
       you at a glance whether this is a breakfast or a dessert. Either way
       there is always exactly one thing in that slot, so the rows line up. */
    var lead = src
      ? '<img class="rcard__thumb" src="' + esc(src) + '" alt="" loading="lazy" ' +
        'width="64" height="64" decoding="async" data-cat="' + esc(r.category) + '" />'
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

  /* 089, ruled 2026-08-01: the Menu is NOT virtualised. The collection is 48
     against the task's own ~150 threshold, the full list renders in one
     innerHTML pass with CLS 0.0000 and FCP at a fifth of budget, and
     virtualising would complicate scroll restoration, find-in-page, and the
     screen-reader experience for zero measured gain. Revisit at ~150, per the
     gameplan. */
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

    var selCount = Object.keys(S.tagSel).filter(function (k) { return S.tagSel[k]; }).length;

    h += '<div class="menubody" id="main-content">';
    h += '<div class="countrow"><span>' + list.length +
         (list.length === 1 ? " recipe" : " recipes") +
         (S.removing ? " — tap a recipe to remove it" : "") +
         (S.tagging ? " — tap the ones to tag" : "") + "</span>" +
         '<span class="countrow__actions">' +
         (filterCount || S.menuQ
           ? '<button type="button" class="textbtn" data-act="clear-filters">Clear</button>'
           : "") +
         (S.removing
           ? ""
           : '<button type="button" class="textbtn' +
             (S.tagging ? " textbtn--removing" : "") + '" data-act="toggle-tagging">' +
             (S.tagging ? "Done" : "Tag") + "</button>") +
         (S.tagging
           ? ""
           : '<button type="button" class="textbtn' +
             (S.removing ? " textbtn--removing" : "") + '" data-act="toggle-remove">' +
             (S.removing ? "Done" : "Remove") + "</button>") +
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
    } else if (S.tagging) {
      h += '<div class="cardgrid">' + list.map(function (r) {
        var on = !!S.tagSel[r.id];
        return '<button type="button" class="rrow press" data-act="tag-pick" ' +
               'aria-pressed="' + on + '" data-id="' + esc(r.id) + '">' +
               '<span class="checkbox">' + (on ? I.check(18) : "") + "</span>" +
               '<span class="rcard__body"><span class="rcard__title">' +
               esc(r.title) + "</span>" +
               '<span class="rcard__meta">' +
               (tagsOf(r).length ? tagsOf(r).join(", ") : "No tags yet") +
               "</span></span></button>";
      }).join("") + "</div>";
    } else {
      var mq = S.menuQ.trim() ? fold(S.menuQ.trim()) : "";
      h += '<div class="cardgrid">' + list.map(function (r) {
        var f = mq ? matchField(r, mq) : "";
        return cardHtml(r, f && f !== "title" ? f : "");
      }).join("") + "</div>";
    }
    h += "</div>";

    if (S.tagging) {
      h += '<div class="addbar"><button type="button" class="addpill press" ' +
           'data-act="open-bulk"' + (selCount ? "" : " disabled") + ">" +
           I.plus(20) + "Tag " + selCount +
           (selCount === 1 ? " recipe" : " recipes") + "</button></div>";
    } else {
      h += '<div class="addbar"><a class="addpill press" href="#add">' +
           I.plus(20) + "Add recipe</a></div>";
    }

    if (S.filterOpen) h += filterSheetHtml();
    if (S.textOpen) h += textSheetHtml();
    if (S.tagSheetOpen) h += bulkTagSheetHtml(selCount);
    if (S.tagManageOpen) h += tagManageSheetHtml();
    return h;
  }

  /* 068 — the one sheet that finishes a bulk tag. Same dialog contract as
     every other sheet; the field reuses the 067 suggestion machinery. */
  function bulkTagSheetHtml(selCount) {
    return (
      '<button type="button" class="scrim" data-act="close-bulk" aria-label="Close"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="bulk-title">' +
      '<div class="sheet__inner sheet__inner--narrow">' +
      '<div class="sheet__head"><h2 class="sheet__title" id="bulk-title">Tag ' +
      selCount + (selCount === 1 ? " recipe" : " recipes") + "</h2>" +
      '<button type="button" class="donebtn press" data-act="close-bulk">Cancel</button></div>' +
      '<div class="field">' +
      '<label class="field__label" for="bulk-tags">Tags to add</label>' +
      '<input class="input" id="bulk-tags" data-act="bulk-tags" data-k="tags" ' +
      'value="' + esc(S.bulkTags) + '" autocomplete="off" ' +
      'placeholder="Italian, vegetarian, quick" />' +
      '<div class="sugrow" id="bulk-tags-sug" data-for="bulk-tags"></div>' +
      '<span class="fieldhint">Added to every selected recipe. Tags they ' +
      "already have aren’t doubled.</span></div>" +
      '<div class="sheet__foot">' +
      '<button type="button" class="savebtn press" data-act="bulk-apply">Add tags</button>' +
      "</div></div></div>"
    );
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
    S.lbOpen = false;
    S.sortOpen = false;
    S.tagSheetOpen = false;
    S.tagManageOpen = false;
    S.pickOpen = false;
    S.mealOpen = false;
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
    /* The lightbox is a dialog on the same trap/Escape/return contract. */
    return document.querySelector('.sheet[role="dialog"], .lightbox[role="dialog"]');
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
                 '<span class="chip__label">' + esc(name) + " (" + countWho(name) + ")</span></button>";
        }).join("") + "</div>" +
      '<h3 class="grouph">Course</h3><div class="chiprow">' +
      CATS.filter(function (c) { return countBy(S.recipes, "category", c); })
        .map(function (cat) {
          var on = S.cats.indexOf(cat) > -1;
          return '<button type="button" class="chip press" aria-pressed="' + on +
                 '" data-act="fc" data-key="' + esc(cat) + '">' +
                 (on ? I.check(15) : "") +
                 '<span class="chip__label">' + esc(cat) + " (" + countCat(cat) + ")</span></button>";
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
    return '<div class="grouph-row"><h3 class="grouph">Tags</h3>' +
      '<button type="button" class="textbtn" data-act="tag-manage">Rename or merge</button></div>' +
      '<div class="chiprow">' +
      tags.map(function (tag) {
        var on = S.tags.indexOf(tag) > -1;
        return '<button type="button" class="chip press" aria-pressed="' + on +
               '" data-act="ft" data-key="' + esc(tag) + '">' +
               (on ? I.check(15) : "") +
               '<span class="chip__label">' + esc(tag) + " (" + countTag(tag) + ")</span></button>";
      }).join("") + "</div>";
  }

  /* 069 — rename and merge. Renaming onto a name that already exists (any
     casing) is a merge: every recipe carrying the old tag carries the target
     once, and the old name is gone everywhere. There is no partial version of
     that — which is the entire point of doing it here rather than by hand. */
  function tagManageSheetHtml() {
    var tags = allTags();
    function usage(tag) {
      return S.recipes.filter(function (r) { return tagsOf(r).indexOf(tag) > -1; }).length;
    }
    return (
      '<button type="button" class="scrim" data-act="close-tag-manage" aria-label="Close"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="tm-title">' +
      '<div class="sheet__inner sheet__inner--narrow">' +
      '<div class="sheet__head"><h2 class="sheet__title" id="tm-title">Tags</h2>' +
      '<button type="button" class="donebtn press" data-act="close-tag-manage">Done</button></div>' +
      '<p class="hint" style="margin-top:0">Tap a tag to rename it. Renaming it to ' +
      "another tag’s name merges the two.</p>" +
      '<div class="managelist">' +
      tags.map(function (tag) {
        if (S.tagEditing === tag) {
          return '<div class="managerow managerow--edit">' +
            '<label class="vh" for="tag-rename">New name for ' + esc(tag) + "</label>" +
            '<input class="input" id="tag-rename" data-act="tag-rename-input" value="' +
            esc(S.tagEditVal) + '" autocomplete="off" />' +
            '<button type="button" class="donebtn press" data-act="tag-rename-apply" ' +
            'data-key="' + esc(tag) + '">Save</button>' +
            '<button type="button" class="textbtn" data-act="tag-edit" data-key="">Cancel</button>' +
            "</div>";
        }
        return '<button type="button" class="managerow press" data-act="tag-edit" ' +
               'data-key="' + esc(tag) + '">' +
               '<span class="chip__label">' + esc(tag) + "</span>" +
               '<span class="managerow__count">' + usage(tag) +
               (usage(tag) === 1 ? " recipe" : " recipes") + "</span></button>";
      }).join("") +
      "</div></div></div>"
    );
  }

  function renameTag(oldTag, nextRaw) {
    var next = String(nextRaw || "").trim().replace(/\s+/g, " ");
    if (!next || next === oldTag) return "";
    /* Same letters, new casing is a plain rename; a different existing tag
       (any casing) is a merge and says so before it happens. */
    var target = null;
    allTags().forEach(function (t) {
      if (t !== oldTag && t.toLowerCase() === next.toLowerCase()) target = t;
    });
    if (target) {
      if (!window.confirm('Merge "' + oldTag + '" into "' + target + '"? Every recipe tagged "' +
          oldTag + '" will carry "' + target + '" instead.')) return "";
      next = target;
    }
    var touched = 0;
    S.recipes = S.recipes.map(function (r) {
      var have = tagsOf(r);
      if (have.indexOf(oldTag) === -1) return r;
      var out = {};
      Object.keys(r).forEach(function (k) { out[k] = r[k]; });
      var seen = {};
      out.tags = have.map(function (t) { return t === oldTag ? next : t; })
        .filter(function (t) {
          var lt = t.toLowerCase();
          if (seen[lt]) return false;
          seen[lt] = true;
          return true;
        });
      touched++;
      return out;
    });
    persistRecipes();
    /* An active filter on the old name follows the rename. */
    S.tags = S.tags.map(function (t) { return t === oldTag ? next : t; })
      .filter(function (t, i, a) { return a.indexOf(t) === i; });
    return (target ? "Merged into “" + next + "”" : "Renamed to “" + next + "”") +
           " — " + touched + (touched === 1 ? " recipe updated." : " recipes updated.");
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

  /* 082 — a flag that names its field ("Servings — …") surfaces beside that
     field, not only in the panel at the bottom. Free-text flags (including
     everything committed before this convention) classify by keyword, so old
     data gains the chips too. */
  function fieldOfFlag(f) {
    var s = String(f).toLowerCase();
    var m = s.match(/^(title|servings|ingredients|steps)\s*—/);
    if (m) return m[1];
    if (/serving/.test(s)) return "servings";
    if (/ingredient/.test(s)) return "ingredients";
    if (/\bsteps?\b/.test(s)) return "steps";
    if (/title/.test(s)) return "title";
    return "";
  }

  function fieldFlagChip(field, flags) {
    if (!flags[field] || !flags[field].length) return "";
    return '<button type="button" class="fieldflag press" data-act="to-flags">' +
           I.flag(14) + "Double-check</button>";
  }

  function viewRecipe(r) {
    var mult = S.serves && r.servings ? S.serves / r.servings : 1;
    var h = "";

    var fieldFlags = { title: [], servings: [], ingredients: [], steps: [] };
    (r.flagged || []).forEach(function (f) {
      var k = fieldOfFlag(f);
      if (k) fieldFlags[k].push(f);
    });

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
      /* The hero is a 3:2 crop; the tap opens the whole photograph — which
         matters when the photo is a handwritten card and the writing is what
         got cropped. */
      h += '<button type="button" class="herobtn press" data-act="open-lb" ' +
           'aria-label="Show the photo full screen">' +
           '<img class="r-hero" src="' + esc(hero) + '" alt="' + esc(r.title) +
           '" decoding="async" /></button>';
    }

    h += '<p class="r-eyebrow">' + esc(r.contributor) + " · " + esc(r.category) + "</p>";
    h += '<h1 class="r-title">' + esc(r.title) +
         fieldFlagChip("title", fieldFlags) + "</h1>";

    if (tagsOf(r).length) {
      h += '<p class="r-tags">' + tagsOf(r).map(function (t) {
        return '<a class="minitag minitag--link press" href="#menu?tag=' +
               encodeURIComponent(t) + '">' + esc(t) + "</a>";
      }).join("") + "</p>";
    }

    h += '<div class="topgrid">';
    h += '<div class="servcard"><div class="servcard__text">' +
         '<p class="minilabel">Servings' + fieldFlagChip("servings", fieldFlags) + "</p>" +
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

    h += '<section class="bodygrid__ing"><h2 class="r-h2">Ingredients' +
         fieldFlagChip("ingredients", fieldFlags) + "</h2>" +
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
      /* 071: four recipes arrived with no ingredient list at all. Say so
         loudly — this is missing content, not an empty section — and say how
         it gets fixed. The pointer is prose, not a button: Viewer mode shows
         no edit affordances, and that rule outranks convenience. */
      h += '<div class="panel panel--flag"><h2>No ingredients were captured</h2>' +
           "<p>This recipe’s list didn’t survive transcription. If you have " +
           "Joan’s original, turn on <strong>Edit</strong> at the top of this " +
           "page and type the ingredients in — the field will be waiting.</p></div>";
    }
    h += "</section>";

    h += '<section><h2 class="r-h2">Instructions' +
         fieldFlagChip("steps", fieldFlags) + "</h2>";
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

    /* Later cards of a multi-photo recipe, uncropped — the transcription's
       source, kept in sight. */
    var extraPages = pagesOf(r.id).slice(1);
    if (extraPages.length) {
      h += '<section class="r-section"><h2 class="r-h2">Recipe card photos</h2>' +
           extraPages.map(function (u, i) {
             return '<img class="r-page" src="' + esc(u) + '" alt="' +
                    esc(r.title) + " — card " + (i + 2) + '" decoding="async" />';
           }).join("") + "</section>";
    }

    if (r.notes) {
      h += '<section class="r-section"><h2 class="r-h2">Notes</h2>' +
           '<div class="panel">' + esc(r.notes) + "</div></section>";
    }

    /* Shown in viewer mode too — it is information, not an edit affordance. */
    if (r.flagged && r.flagged.length) {
      h += '<section class="r-section"><div class="panel panel--flag" id="flag-panel">' +
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
    if (S.lbOpen && hero) {
      h += '<div class="lightbox" role="dialog" aria-modal="true" ' +
           'aria-label="Photo of ' + esc(r.title) + '" id="lightbox">' +
           '<button type="button" class="iconbtn lightbox__close press" ' +
           'data-act="close-lb" aria-label="Close photo">' + I.x() + "</button>" +
           '<img class="lightbox__img" src="' + esc(hero) + '" alt="' + esc(r.title) + '" />' +
           "</div>";
    }
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
      'value="' + esc(value) + '" autocomplete="off" ' +
      'placeholder="Italian, vegetarian, quick" />' +
      /* 067: existing tags surface as the user types, so "ital" becomes the
         Italian that already exists instead of a new lowercase twin. The row
         is rebuilt in place on input — a full render would steal the caret. */
      '<div class="sugrow" id="' + id + '-sug" data-for="' + id + '"></div>' +
      '<span class="fieldhint">Separate with commas. Include where the dish is ' +
      "from — those become filters.</span></div>";
  }

  /* The segment being typed is everything after the last comma. Matches are
     existing tags only, the already-listed ones excluded, canonical casing
     preserved — prefix matches outrank substring ones. */
  function tagSuggestions(raw) {
    var parts = String(raw || "").split(",");
    var seg = parts.pop().trim().toLowerCase();
    if (!seg) return [];
    var have = parts.map(function (p) { return p.trim().toLowerCase(); });
    return allTags()
      .filter(function (t) {
        var lt = t.toLowerCase();
        return lt.indexOf(seg) > -1 && lt !== seg && have.indexOf(lt) === -1;
      })
      .sort(function (a, b) {
        var pa = a.toLowerCase().indexOf(seg) === 0 ? 0 : 1;
        var pb = b.toLowerCase().indexOf(seg) === 0 ? 0 : 1;
        return pa - pb || a.localeCompare(b);
      })
      .slice(0, 5);
  }

  function syncTagSuggestions(input) {
    var row = document.getElementById(input.id + "-sug");
    if (!row) return;
    row.innerHTML = tagSuggestions(input.value).map(function (t) {
      return '<button type="button" class="sugchip press" data-act="tag-sug" ' +
             'data-key="' + esc(t) + '" data-input="' + esc(input.id) + '">' +
             esc(t) + "</button>";
    }).join("");
  }

  /* Tapping a suggestion completes the segment with the canonical tag. */
  function applyTagSuggestion(el) {
    var input = document.getElementById(el.getAttribute("data-input"));
    if (!input) return;
    var parts = input.value.split(",");
    parts.pop();
    parts.push(" " + el.getAttribute("data-key"));
    var next = parts.join(",").replace(/^\s+/, "") + ", ";
    input.value = next;
    if (input.id === "bulk-tags") S.bulkTags = next;
    else if (S.route.name === "recipe" && S.draft) { S.draft.tags = next; S.saved = false; }
    else if (S.addDraft) { S.addDraft.tags = next; scheduleAddPersist(); }
    syncTagSuggestions(input);
    input.focus();
  }

  function photoFieldHtml(id, recipeId, act) {
    var pages = pagesOf(recipeId);
    return '<div class="field">' +
      '<label class="field__label" for="' + id + '">Photo</label>' +
      (pages.length
        ? '<div class="photorow"><img class="photorow__img" src="' + esc(pages[0]) +
          '" alt="" />' +
          (pages.length > 1
            ? '<span class="fieldhint">' + pages.length + " pages</span>"
            : "") +
          '<button type="button" class="delbtn press" ' +
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

  /* ======================================================================
     10a. The week planner — Phase 15, ruled into 1.0
     ====================================================================== */

  function loadPlan() {
    var p = load(K.plan, []);
    S.plan = Array.isArray(p) ? p.filter(function (e) {
      return e && e.date && SLOTS.indexOf(e.slot) > -1;
    }) : [];
  }

  function persistPlan() { save(K.plan, S.plan); }

  function isoDate(d) {
    return d.getFullYear() + "-" +
      String(d.getMonth() + 1).padStart(2, "0") + "-" +
      String(d.getDate()).padStart(2, "0");
  }

  /* Monday of the viewed week (DECISIONS.md 120: weeks start Monday). */
  function weekStart(offset) {
    var now = new Date();
    var day = (now.getDay() + 6) % 7; // Mon=0
    var mon = new Date(now.getFullYear(), now.getMonth(), now.getDate() - day + offset * 7);
    return mon;
  }

  function weekDays(offset) {
    var mon = weekStart(offset);
    var out = [];
    for (var i = 0; i < 7; i++) {
      var d = new Date(mon.getFullYear(), mon.getMonth(), mon.getDate() + i);
      out.push(d);
    }
    return out;
  }

  var DAY_NAMES = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
  var MONTHS = ["January", "February", "March", "April", "May", "June", "July",
    "August", "September", "October", "November", "December"];

  function planEntry(date, slot) {
    for (var i = 0; i < S.plan.length; i++) {
      if (S.plan[i].date === date && S.plan[i].slot === slot) return S.plan[i];
    }
    return null;
  }

  function planLabel(offset) {
    var days = weekDays(offset);
    var a = days[0], b = days[6];
    var range = a.getMonth() === b.getMonth()
      ? a.getDate() + " – " + b.getDate() + " " + MONTHS[b.getMonth()]
      : a.getDate() + " " + MONTHS[a.getMonth()] + " – " + b.getDate() + " " + MONTHS[b.getMonth()];
    if (offset === 0) return "This week · " + range;
    if (offset === 1) return "Next week · " + range;
    if (offset === -1) return "Last week · " + range;
    return range;
  }

  function mealCardHtml(entry) {
    var r = byId(entry.recipeId);
    /* 127: a plan outlives its recipe. The slot degrades to the name it was
       planned under, says so, and never crashes or vanishes. */
    if (!r) {
      return '<div class="mealcard mealcard--gone">' +
        '<span class="rcard__body">' +
        '<span class="rcard__title">' + esc(entry.titleThen) + "</span>" +
        '<span class="rcard__meta">No longer in the book</span></span>' +
        '<button type="button" class="delbtn press" data-act="plan-remove" ' +
        'data-key="' + esc(entry.id) + '" aria-label="Remove ' + esc(entry.titleThen) +
        ' from the plan">' + I.x() + "</button></div>";
    }
    var src = imageFor(r);
    var lead = src
      ? '<img class="rcard__thumb" src="' + esc(src) + '" alt="" loading="lazy" ' +
        'width="64" height="64" decoding="async" />'
      : '<span class="rcard__icon" aria-hidden="true">' + catIcon(r.category, 24) + "</span>";
    return '<button type="button" class="mealcard press" data-act="plan-meal" ' +
      'data-key="' + esc(entry.id) + '">' + lead +
      '<span class="rcard__body">' +
      '<span class="rcard__title">' + esc(r.title) + "</span>" +
      '<span class="rcard__meta">' + esc(cap(entry.slot)) + " · serves " +
      entry.servings + "</span></span>" +
      '<span class="rcard__chev">' + I.chevR() + "</span></button>";
  }

  function cap(s) { return s.charAt(0).toUpperCase() + s.slice(1); }

  function viewPlan() {
    var h = "";
    h += '<header class="rhead"><div class="rhead__inner">' +
         '<a class="backlink press" href="#">' + I.chevL() + "Home</a>" +
         '<div class="rhead__tools">' + themeBtn() + "</div></div></header>";

    h += '<div class="plan" id="main-content">';
    h += '<p class="eyebrow">Kitchen Table</p>';
    h += '<h1 class="mhead__h1">' + esc(planLabel(S.planWeekOffset)) + "</h1>";

    h += '<div class="weeknav">' +
         '<button type="button" class="iconbtn press" data-act="week-prev" ' +
         'aria-label="Previous week">' + I.chevL() + "</button>" +
         '<button type="button" class="weeknav__today press" data-act="week-today"' +
         (S.planWeekOffset === 0 ? " disabled" : "") + ">Today</button>" +
         '<button type="button" class="iconbtn press" data-act="week-next" ' +
         'aria-label="Next week">' + I.chevR(22, 22) + "</button></div>";

    var todayIso = isoDate(new Date());
    weekDays(S.planWeekOffset).forEach(function (d) {
      var iso = isoDate(d);
      var isToday = iso === todayIso;
      h += '<section class="dayblock' + (isToday ? " dayblock--today" : "") + '">' +
           '<h2 class="dayhead">' + DAY_NAMES[(d.getDay() + 6) % 7] + " " + d.getDate() +
           (isToday ? '<span class="daytag">Today</span>' : "") + "</h2>";

      var dinner = planEntry(iso, "dinner");
      h += dinner
        ? mealCardHtml(dinner)
        : '<button type="button" class="slotadd press" data-act="plan-pick" ' +
          'data-key="' + iso + '|dinner">' + I.plus(20) + "Add dinner</button>";

      /* Breakfast and lunch: visible when planned, one quiet tap when not. */
      var quiet = "";
      ["breakfast", "lunch"].forEach(function (slot) {
        var e = planEntry(iso, slot);
        if (e) h += mealCardHtml(e);
        else quiet += '<button type="button" class="textbtn" data-act="plan-pick" ' +
                      'data-key="' + iso + "|" + slot + '">+ ' + cap(slot) + "</button>";
      });
      if (quiet) h += '<div class="quietadds">' + quiet + "</div>";
      h += "</section>";
    });

    h += shoppingHtml();

    h += '<button type="button" class="outlinebtn press planprint" data-act="plan-print">' +
         "Print this week</button>";

    if (S.notice) h += '<p class="notice" role="status">' + esc(S.notice) + "</p>";
    h += "</div>";

    if (S.pickOpen) h += pickSheetHtml();
    if (S.mealOpen) h += mealSheetHtml();
    return h;
  }

  /* 130 — the summing spike, shipped honestly as a preview. Lines whose
     quantity, unit and remaining text all agree get summed at each meal's own
     servings; everything else is listed as written. Failure modes are in
     DECISIONS.md 130 — nothing here guesses. */
  function shoppingHtml() {
    var days = weekDays(S.planWeekOffset).map(isoDate);
    var entries = S.plan.filter(function (e) { return days.indexOf(e.date) > -1; });
    if (!entries.length) return "";

    var sums = {};   // key -> {qty, unit, rest}
    var asIs = [];
    entries.forEach(function (e) {
      var r = byId(e.recipeId);
      if (!r) return;
      var mult = r.servings ? e.servings / r.servings : 1;
      (r.ingredients || []).forEach(function (line) {
        var m = String(line).match(/^(\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:\.\d+)?)\s*([a-zA-Z]*)\s+(.*)$/);
        if (!m || !m[3]) { asIs.push(scaleLine(line, mult)); return; }
        var n;
        if (m[1].indexOf("/") > -1) {
          var parts = m[1].trim().split(/\s+/);
          var fr = parts[parts.length - 1].split("/");
          n = (parts.length > 1 ? parseFloat(parts[0]) : 0) + parseFloat(fr[0]) / parseFloat(fr[1]);
        } else n = parseFloat(m[1]);
        var key = fold(m[2]) + "|" + fold(m[3]);
        if (!sums[key]) sums[key] = { qty: 0, unit: m[2], rest: m[3] };
        sums[key].qty += n * mult;
      });
    });

    var keys = Object.keys(sums).sort(function (a, b) {
      return sums[a].rest.localeCompare(sums[b].rest);
    });
    if (!keys.length && !asIs.length) return "";

    var h = '<section class="shoplist">' +
      '<button type="button" class="shoplist__head press" data-act="toggle-list" ' +
      'aria-expanded="' + S.listOpen + '">' +
      '<span>Shopping list <span class="shoplist__tag">preview</span></span>' +
      (S.listOpen ? I.chevD() : I.chevR()) + "</button>";
    if (S.listOpen) {
      h += '<ul class="shoplist__items">';
      keys.forEach(function (k) {
        var s = sums[k];
        h += "<li>" + esc(fmtQty(s.qty)) + (s.unit ? " " + esc(s.unit) : "") +
             " " + esc(s.rest) + "</li>";
      });
      h += "</ul>";
      if (asIs.length) {
        h += '<p class="hint">As written, not summed:</p><ul class="shoplist__items shoplist__items--dim">' +
             asIs.map(function (l) { return "<li>" + esc(l) + "</li>"; }).join("") + "</ul>";
      }
      h += '<p class="hint">Same wording and unit sum together; everything else is listed as written.</p>';
    }
    h += "</section>";
    return h;
  }

  function pickSheetHtml() {
    var q = S.pickQ.trim().toLowerCase();
    var hits = q
      ? S.recipes.filter(function (r) { return matchesQuery(r, q); }).slice(0, 8)
      : S.recipes.slice().sort(function (a, b) { return a.title.localeCompare(b.title); }).slice(0, 8);
    var slot = S.pickFor ? cap(S.pickFor.slot) : "";
    return (
      '<button type="button" class="scrim" data-act="close-pick" aria-label="Close"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="pick-title">' +
      '<div class="sheet__inner sheet__inner--narrow">' +
      '<div class="sheet__head"><h2 class="sheet__title" id="pick-title">' + esc(slot) +
      (S.pickFor ? " · " + esc(prettyDate(S.pickFor.date)) : "") + "</h2>" +
      '<button type="button" class="donebtn press" data-act="close-pick">Cancel</button></div>' +
      '<label class="vh" for="pick-q">Search recipes</label>' +
      '<input class="input" id="pick-q" type="search" data-act="pick-q" ' +
      'placeholder="Search recipes" value="' + esc(S.pickQ) + '" autocomplete="off" />' +
      '<div class="picklist">' +
      hits.map(function (r) {
        return '<button type="button" class="mealcard press" data-act="plan-assign" ' +
          'data-key="' + esc(r.id) + '">' +
          '<span class="rcard__icon" aria-hidden="true">' + catIcon(r.category, 24) + "</span>" +
          '<span class="rcard__body"><span class="rcard__title">' + esc(r.title) + "</span>" +
          '<span class="rcard__meta">' + esc(r.category) + " · serves " + r.servings +
          "</span></span></button>";
      }).join("") +
      (hits.length ? "" : '<p class="emptystate">No recipes match.</p>') +
      "</div></div></div>"
    );
  }

  function prettyDate(iso) {
    var p = iso.split("-");
    var d = new Date(+p[0], +p[1] - 1, +p[2]);
    return DAY_NAMES[(d.getDay() + 6) % 7] + " " + d.getDate();
  }

  function mealSheetHtml() {
    var entry = null;
    S.plan.forEach(function (e) { if (e.id === S.mealFor) entry = e; });
    if (!entry) return "";
    var r = byId(entry.recipeId);
    var title = r ? r.title : entry.titleThen;
    return (
      '<button type="button" class="scrim" data-act="close-meal" aria-label="Close"></button>' +
      '<div class="sheet" role="dialog" aria-modal="true" aria-labelledby="meal-title">' +
      '<div class="sheet__inner sheet__inner--narrow">' +
      '<div class="sheet__head"><h2 class="sheet__title" id="meal-title">' + esc(title) + "</h2>" +
      '<button type="button" class="donebtn press" data-act="close-meal">Done</button></div>' +
      '<p class="hint" style="margin-top:0">' + esc(cap(entry.slot)) + " · " +
      esc(prettyDate(entry.date)) + "</p>" +
      /* 125: the meal's own servings, not the recipe's default. */
      '<div class="servcard"><div class="servcard__text">' +
      '<p class="minilabel">Serving</p>' +
      '<p class="servcard__value">' + entry.servings + " " +
      (entry.servings === 1 ? "person" : "people") + "</p></div>" +
      '<button type="button" class="servbtn press" data-act="meal-serv-" ' +
      'aria-label="Fewer people"' + (entry.servings <= 1 ? " disabled" : "") + ">" +
      I.minus(24) + "</button>" +
      '<button type="button" class="servbtn press" data-act="meal-serv+" ' +
      'aria-label="More people"' + (entry.servings >= 40 ? " disabled" : "") + ">" +
      I.plus(24) + "</button></div>" +
      '<div class="sheet__foot">' +
      (r ? '<a class="bigbtn press" style="margin-bottom:10px" href="#' + esc(r.id) + '">Open the recipe</a>' : "") +
      '<button type="button" class="outlinebtn outlinebtn--danger press" data-act="plan-remove" ' +
      'data-key="' + esc(entry.id) + '">Remove from the plan</button>' +
      "</div></div></div>"
    );
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
      /* Finished video imports wait here for whoever comes back (the spec's
         badge, grown into the list it stood for). */
      if (S.videoReady.length) {
        h += '<div class="panel vready"><h2>Ready to check over</h2>' +
             '<p class="vready__s">Video imports the kitchen server has finished. ' +
             "Open one to look it over and save it.</p>" +
             S.videoReady.map(function (j) {
               return '<button type="button" class="pathbtn press" data-act="video-open" ' +
                      'data-id="' + j.id + '"><span class="pathbtn__t">' +
                      esc(j.title || "Untitled recipe") + "</span>" +
                      '<span class="pathbtn__s">From ' +
                      (j.platform === "instagram" ? "Instagram" : "YouTube") +
                      "</span></button>";
             }).join("") + "</div>";
      }
      h += '<p class="addscreen__lead">Four ways to get a recipe in. However it ' +
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
      h += '<button type="button" class="pathbtn press" data-act="add-path" ' +
           'data-key="video"><span class="pathbtn__t">From a video</span>' +
           '<span class="pathbtn__s">A YouTube or Instagram link, written up for you</span></button>';
      h += "</div>";
      return h;
    }

    if (S.addStep === "link") {
      h += '<div class="field"><label class="field__label" for="a-url">' +
           "Recipe address</label>" +
           '<input class="input" id="a-url" type="url" placeholder="https://…" ' +
           'data-act="a-url" value="' + esc(S.addUrl || "") + '" /></div>';
      /* Full disclosure before the request (gameplan 050): exactly who can
         see the pasted address, by name, drawn from the live relay list so
         the text can never drift from the code. */
      h += '<p class="addscreen__note">Most recipe sites stop other sites reading ' +
           "their pages directly, so this tries the site itself first, then " +
           "free public relays in turn: " +
           RELAYS.filter(function (r) { return r.name !== "directly"; })
             .map(function (r) { return r.name; }).join(", ") +
           ". The address you paste is sent to each service tried until one " +
           "answers, and the page comes back through it; nothing else about " +
           "you is sent. Relays go down sometimes — if none get through, use " +
           "the box below, which needs no network at all.</p>";
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
      /* A long recipe spans two cards — photos accumulate, and all of them
         are read into one draft and kept as the recipe's pages. */
      if (S.addPhotos.length) {
        h += '<ul class="pagelist">' + S.addPhotos.map(function (f, i) {
          return '<li class="pagelist__row"><span>Photo ' + (i + 1) +
                 " · " + esc(f.name || "picture") + "</span>" +
                 '<button type="button" class="delbtn press" data-act="a-photo-rm" ' +
                 'data-i="' + i + '" aria-label="Remove photo ' + (i + 1) + '">' +
                 I.x() + "</button></li>";
        }).join("") + "</ul>";
      }
      h += '<div class="field"><label class="field__label" for="a-photo">' +
           (S.addPhotos.length ? "Add another photo" : "Photo of the recipe") +
           "</label>" +
           '<input class="input" id="a-photo" type="file" accept="image/*" ' +
           'data-act="a-photo" /></div>';
      h += '<p class="addscreen__note">The text is read on this phone — the ' +
           "picture is never uploaded anywhere. It works best on flat, well-lit, " +
           "printed text, and it will get some things wrong; anything it isn’t " +
           "sure about gets flagged for you on the next screen.</p>";
      h += '<button type="button" class="savebtn press" data-act="add-ocr"' +
           (S.addBusy || !S.addPhotos.length ? " disabled" : "") + ">Read the photo" +
           (S.addPhotos.length > 1 ? "s" : "") + "</button>";
      h += '<button type="button" class="outlinebtn press" data-act="add-back">Back</button>';
      h += "</div>";
      return h;
    }

    if (S.addStep === "video") {
      if (S.videoWaking) {
        h += '<p class="notice" role="status">Waking up the kitchen server — it ' +
             "falls asleep when nobody’s used it for a while. This can take up " +
             "to a minute.</p>";
      }
      if (S.videoJob) {
        /* The progress card: three human stages, a rough ETA, and the
           promise that matters — closing the page loses nothing. */
        var st = S.videoJob.status;
        var idx = st === "transcribing" ? 1 : st === "extracting" ? 2 : 0;
        var names = ["Fetching the video", "Listening to it", "Writing up the recipe"];
        h += '<div class="panel vprog" role="status"><h2>' +
             (st === "queued" ? "Waiting its turn…" : "Working on it…") + "</h2>" +
             '<ol class="vprog__list">' +
             names.map(function (nm, i) {
               var cls = i < idx ? "vprog__s vprog__s--done"
                 : i === idx ? "vprog__s vprog__s--now" : "vprog__s";
               return '<li class="' + cls + '">' +
                      (i < idx ? I.check(15) : "") + esc(nm) + "</li>";
             }).join("") + "</ol>";
        h += '<p class="vprog__eta">' + esc(fmtEta(S.videoJob)) + "</p>";
        h += '<p class="addscreen__note">This runs on the kitchen server — you ' +
             "can close this page. The finished recipe will be waiting on the " +
             "Add screen when you come back.</p></div>";
        h += '<button type="button" class="outlinebtn press" data-act="add-back">' +
             "Leave it cooking</button>";
        h += "</div>";
        return h;
      }
      h += '<div class="field"><label class="field__label" for="a-vurl">' +
           "Video address</label>" +
           '<input class="input" id="a-vurl" type="url" ' +
           'placeholder="https://youtube.com/… or https://instagram.com/…" ' +
           'data-act="video-url" value="' + esc(S.videoUrl || "") + '" /></div>';
      /* Same disclosure discipline as the link importer (050): name every
         service the link touches before anything is sent. */
      h += '<p class="addscreen__note">The address goes to the family’s kitchen ' +
           "server (on Render), which fetches the video, has Groq transcribe " +
           "the narration, and has Claude write it up into a draft. The video " +
           "itself is deleted the moment that’s done, and nothing is saved to " +
           "the book until you’ve checked the draft over. Anything the video " +
           "never said gets flagged, not guessed.</p>";
      h += '<button type="button" class="savebtn press" data-act="video-submit"' +
           (S.addBusy ? " disabled" : "") + ">Send it to the kitchen</button>";
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

    /* 083 — parsers guess the ingredients/steps split, and on a photographed
       card they guess it wrong often. Every review line carries a one-tap
       "send to the other list" beside its delete, so a misplaced line is a
       correction, not a retype. */
    h += '<h2 class="r-h2" style="margin-top:22px">Ingredients</h2>';
    h += d.ingredients.map(function (line, i) {
      return '<div class="editline">' +
             '<label class="vh" for="a-ing-' + i + '">Ingredient ' + (i + 1) + "</label>" +
             '<textarea class="textarea" id="a-ing-' + i + '" rows="2" ' +
             'data-act="adl" data-k="ingredients" data-i="' + i + '">' +
             esc(line) + "</textarea>" +
             '<button type="button" class="delbtn press" data-act="amove" ' +
             'data-key="ingredients" data-i="' + i + '" aria-label="Move ingredient ' +
             (i + 1) + ' to the steps">' + I.swap() + "</button>" +
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
             '<button type="button" class="delbtn press" data-act="amove" ' +
             'data-key="steps" data-i="' + i + '" aria-label="Move step ' +
             (i + 1) + ' to the ingredients">' + I.swap() + "</button>" +
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

    if (S.addDupe) {
      var existing = byId(S.addDupe);
      h += '<div class="panel panel--flag" role="alert" style="margin-top:18px">' +
           "<h2>This might already be in the book</h2>" +
           "<p>It looks a lot like <strong>" +
           esc(existing ? existing.title : S.addDupe) + "</strong>. " +
           "Open it to compare, or save this one anyway — two versions is " +
           "allowed, it just shouldn’t be an accident.</p>" +
           '<a class="outlinebtn press" style="text-align:center; line-height:60px" href="#' +
           esc(S.addDupe) + '">Open ' + esc(existing ? existing.title : "the existing recipe") + "</a>" +
           '<button type="button" class="savebtn press" data-act="add-save-anyway">' +
           "Save anyway</button></div>";
    }

    h += '<button type="button" class="savebtn press" data-act="add-save">' +
         "Save to my recipes</button>";
    h += '<button type="button" class="outlinebtn press" data-act="add-back">' +
         "Start over</button>";
    h += "</div>";
    return h;
  }

  /* Likely-duplicate check (gameplan 070): normalized-title match, or strong
     overlap of both title words and ingredient lines. Conservative on
     purpose — a false "duplicate" on every casserole would teach people to
     ignore the warning. */
  function findDuplicate(d) {
    function norm(s) { return String(s || "").toLowerCase().replace(/[^a-z0-9 ]+/g, "").trim(); }
    function tokens(s) { return norm(s).split(/\s+/).filter(Boolean); }
    function overlap(a, b) {
      if (!a.length || !b.length) return 0;
      var seen = {};
      a.forEach(function (t) { seen[t] = true; });
      var hit = 0;
      b.forEach(function (t) { if (seen[t]) hit++; });
      return hit / Math.max(a.length, b.length);
    }
    var dTitle = norm(d.title);
    var dTok = tokens(d.title);
    var dIng = (d.ingredients || []).map(norm).filter(Boolean);
    for (var i = 0; i < S.recipes.length; i++) {
      var r = S.recipes[i];
      if (norm(r.title) === dTitle) return r;
      var tScore = overlap(dTok, tokens(r.title));
      if (tScore >= 0.5) {
        var iScore = overlap(dIng, (r.ingredients || []).map(norm));
        if (iScore >= 0.4) return r;
      }
    }
    return null;
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

    /* A likely duplicate warns once and never blocks — "Save anyway" is one
       tap. Two of the same recipe is the family's call, not the app's. */
    if (!S.addDupeOk) {
      var dup = findDuplicate(d);
      if (dup) {
        S.addDupe = dup.id;
        render();
        return;
      }
    }
    S.addDupe = null;
    S.addDupeOk = false;

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
       once the title is known. Move it across now; if the persist fails the
       recipe still saves and the failure is said out loud. */
    var staged = images()["__new__"];
    if (staged) {
      setImage(id, staged).then(function (err) { if (err) setNotice(err); });
      removeImage("__new__");
    }

    S.recipes = S.recipes.concat([recipe]);
    persistRecipes();
    /* A video import tells the kitchen server its draft was accepted, so
       the database gets the reviewed version and the job leaves the
       waiting list. The local save above never waits on it. */
    if (d.videoJobId) acceptVideoJob(d.videoJobId, recipe);
    S.addDraft = null;
    S.addStep = "choose";
    S.addError = "";
    S.addUrl = "";
    S.addPaste = "";
    S.addPhotos = [];
    S.addDupe = null;
    S.addDupeOk = false;
    clearAddDraft();
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
        if (draft) return { draft: draft, guessed: false, via: relay.name };
        /* r.jina.ai hands back readable text rather than markup — no JSON-LD to
           find, but the photo parser handles exactly this shape. */
        if (relay.kind === "text") return { draft: draftFromText(body), guessed: true, via: relay.name };
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
        /* Naming the route in (gameplan 051): when one relay is persistently
           the one answering — or failing — that fact is diagnosable rather
           than a guess. */
        var via = result.via === "directly"
          ? "fetched directly from the site"
          : "fetched through " + result.via;
        draft.flagged.push(
          result.guessed
            ? "Read from the page as plain text (" + via + ") — the split " +
              "between ingredients and steps was guessed. Check both lists " +
              "against the original."
            : "Imported from a link (" + via + ") — check it against the original."
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

  /* ---- from a video: the kitchen server does the reading ----
     The only feature that leaves this page's own machinery: a YouTube or
     Instagram link goes to the import server (backend/), which fetches,
     transcribes, and writes up a draft as a background job. The phone can
     close; the job's whole life lives in a database row, and the finished
     draft lands on the same review screen as every other import. */

  var IMPORT_API = (function () {
    var o = load(K.importApi, "");
    return (typeof o === "string" && /^https?:\/\//.test(o)
      ? o : "https://kitchen-table-5tp6.onrender.com").replace(/\/+$/, "");
  })();

  /* Fetch against the kitchen server with the free tier's one quirk handled:
     a cold server takes ~30–60s to wake, so a slow first answer flips the
     "waking up" notice (never an error) and one network failure retries
     once before giving up. */
  function kitchenFetch(path, opts, quiet) {
    opts = opts || {};
    function attempt(retriesLeft) {
      var ctl = typeof AbortController === "undefined" ? null : new AbortController();
      var timer = ctl && setTimeout(function () { ctl.abort(); }, opts.timeout || 90000);
      var wakeTimer = null;
      if (!quiet) {
        wakeTimer = setTimeout(function () {
          if (!S.videoWaking) { S.videoWaking = true; render(); }
        }, 4000);
      }
      return fetch(IMPORT_API + path, {
        method: opts.method || "GET",
        headers: opts.body ? { "content-type": "application/json" } : undefined,
        body: opts.body ? JSON.stringify(opts.body) : undefined,
        signal: ctl ? ctl.signal : undefined
      }).then(function (res) {
        return res.json().catch(function () { return {}; }).then(function (data) {
          if (!res.ok) {
            var e = new Error(data.error || "The kitchen server answered oddly (HTTP " + res.status + ").");
            e.answered = true; /* the server spoke — never retry these */
            throw e;
          }
          return data;
        });
      }).catch(function (err) {
        var aborted = /abort/i.test(String((err && err.name) || err));
        if (retriesLeft > 0 && !err.answered && !aborted) {
          /* A dropped connection is what waking looks like from outside. */
          return new Promise(function (r) { setTimeout(r, 3000); })
            .then(function () { return attempt(retriesLeft - 1); });
        }
        throw new Error(err.answered
          ? err.message
          : "The kitchen server couldn’t be reached — it may still be waking " +
            "up, which takes about a minute. Try again shortly.");
      }).finally(function () {
        if (timer) clearTimeout(timer);
        if (wakeTimer) clearTimeout(wakeTimer);
        S.videoWaking = false;
      });
    }
    return attempt(1);
  }

  function submitVideo() {
    var url = (S.videoUrl || "").trim();
    S.addError = "";
    if (!/^https?:\/\//i.test(url) ||
        !/youtube\.com|youtu\.be|instagram\.com|instagr\.am/i.test(url)) {
      S.addError = "That doesn’t look like a YouTube or Instagram link.";
      render();
      return;
    }
    S.addBusy = "Sending the link to the kitchen…";
    render();
    kitchenFetch("/api/import/video", { method: "POST", body: { url: url } })
      .then(function (r) {
        S.addBusy = "";
        S.videoUrl = "";
        S.videoJob = { id: r.job_id, status: "queued", stage: "Waiting its turn", eta: null };
        scheduleAddPersist();
        startVideoPoll();
        render();
      })
      .catch(function (err) {
        S.addBusy = "";
        S.addError = err.message;
        render();
      });
  }

  /* Polling, 3.5s while the page is open — the job doesn't need us watching. */
  var videoPollTick = null;
  function startVideoPoll() {
    stopVideoPoll();
    videoPollTick = setInterval(pollVideoJob, 3500);
  }
  function stopVideoPoll() {
    if (videoPollTick) { clearInterval(videoPollTick); videoPollTick = null; }
  }
  function pollVideoJob() {
    if (!S.videoJob || S.route.name !== "add") { stopVideoPoll(); return; }
    kitchenFetch("/api/import/jobs/" + S.videoJob.id, { timeout: 15000 }, true)
      .then(function (job) {
        if (!S.videoJob || S.videoJob.id !== job.id) return;
        if (job.status === "ready_for_review") {
          stopVideoPoll();
          openVideoDraft(job);
          return;
        }
        if (job.status === "failed") {
          stopVideoPoll();
          S.videoJob = null;
          S.addError = job.error_message || "The import didn’t work — try the link again.";
          scheduleAddPersist();
          render();
          return;
        }
        var before = S.videoJob.status + "|" + fmtEta(S.videoJob);
        S.videoJob = { id: job.id, status: job.status, eta: job.eta_seconds, overrun: job.overrun };
        if (before !== job.status + "|" + fmtEta(S.videoJob)) render();
      })
      .catch(function () { /* transient — the next tick tries again */ });
  }

  function fmtEta(job) {
    if (!job) return "";
    if (job.overrun) return "Taking a bit longer than usual…";
    var s = job.eta;
    if (typeof s !== "number") return "Working out how long this will take…";
    if (s < 50) return "Under a minute left.";
    var m = Math.round(s / 60) || 1;
    return "About " + m + (m === 1 ? " minute" : " minutes") + " left.";
  }

  /* A finished job → the standard review screen. The job id rides along so
     Save can tell the server its draft was accepted. */
  function openVideoDraft(job) {
    var rj = job.result_json || {};
    var d = blankDraft();
    d.title = rj.title || "";
    d.category = CATS.indexOf(rj.category) > -1 ? rj.category : "Dinner";
    d.contributor = rj.contributor || WHO[0];
    d.servings = rj.servings || 4;
    d.prepTime = rj.prepTime || "";
    d.cookTime = rj.cookTime || "";
    d.ingredients = rj.ingredients && rj.ingredients.length ? rj.ingredients.slice() : [""];
    d.steps = rj.steps && rj.steps.length ? rj.steps.slice() : [""];
    d.notes = rj.notes || "";
    d.flagged = (rj.flagged || []).slice();
    d.source = rj.source || "";
    d.tags = (rj.tags || []).join(", ");
    d.videoJobId = job.id;
    S.videoJob = null;
    S.videoReady = S.videoReady.filter(function (j) { return j.id !== job.id; });
    S.addDraft = d;
    S.addStep = "review";
    S.addError = "";
    scheduleAddPersist();
    render();
  }

  /* The Add screen's waiting list — refreshed on arrival, quietly. */
  function fetchVideoReady() {
    kitchenFetch("/api/import/jobs?status=ready_for_review", { timeout: 12000 }, true)
      .then(function (data) {
        var jobs = (data && data.jobs) || [];
        var before = JSON.stringify(S.videoReady);
        S.videoReady = jobs;
        if (S.route.name === "add" && JSON.stringify(jobs) !== before) render();
      })
      .catch(function () { /* asleep or offline — the list just stays empty */ });
  }

  function openReadyJob(id) {
    S.addBusy = "Fetching the draft…";
    render();
    kitchenFetch("/api/import/jobs/" + id, { timeout: 20000 })
      .then(function (job) {
        S.addBusy = "";
        if (job.status === "ready_for_review") openVideoDraft(job);
        else {
          S.addError = "That import isn’t ready after all.";
          fetchVideoReady();
          render();
        }
      })
      .catch(function (err) {
        S.addBusy = "";
        S.addError = err.message;
        render();
      });
  }

  /* Save pressed on a video draft: the phone's copy saved instantly (like
     every import); the server is told so the database gets the reviewed
     version and the job leaves the waiting list. Failure is said, not
     hidden — the job stays listed until an accept lands. */
  function acceptVideoJob(jobId, recipe) {
    kitchenFetch("/api/import/jobs/" + jobId + "/accept",
      { method: "POST", body: { recipe: recipe }, timeout: 90000 }, true)
      .then(function () {
        S.videoReady = S.videoReady.filter(function (j) { return j.id !== jobId; });
      })
      .catch(function () {
        setNotice("Saved on this phone. The kitchen server couldn’t be told " +
          "yet, so this import stays in the waiting list for now.");
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
    if (!d.title) d.flagged.push("Title — none was found on the page; add one.");

    d.ingredients = list(node.recipeIngredient || node.ingredients);
    if (!d.ingredients.length) {
      d.ingredients = [""];
      d.flagged.push("Ingredients — none were found; check the original page.");
    }

    d.steps = list(node.recipeInstructions);
    if (!d.steps.length) {
      d.steps = [""];
      d.flagged.push("Steps — none were found; check the original page.");
    }

    var y = text(node.recipeYield);
    var yn = parseInt((y.match(/\d+/) || [])[0], 10);
    if (yn) d.servings = Math.min(40, Math.max(1, yn));
    else d.flagged.push("Servings — no count was found; 4 was assumed.");

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
      s.integrity = TESSERACT_SRI;
      s.crossOrigin = "anonymous";
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
    if (!S.addPhotos.length) return;
    var photos = S.addPhotos.slice();
    var many = photos.length > 1;
    S.addError = "";
    S.addBusy = "Getting ready…";
    render();

    loadTesseract()
      .then(function (T) {
        /* Sequential, one card at a time — the texts join into one draft. */
        var texts = [];
        var chain = Promise.resolve();
        photos.forEach(function (file, i) {
          chain = chain.then(function () {
            S.addBusy = many
              ? "Reading photo " + (i + 1) + " of " + photos.length + "…"
              : "Reading the photo… this can take a minute.";
            render();
            return T.recognize(file, "eng", {
              logger: function (m) {
                if (m.status === "recognizing text" && typeof m.progress === "number") {
                  S.addBusy = (many ? "Photo " + (i + 1) + " of " + photos.length + " — " : "") +
                    "reading… " + Math.round(m.progress * 100) + "%";
                  var n = document.querySelector(".notice");
                  if (n) n.textContent = S.addBusy;
                }
              }
            }).then(function (res) {
              texts.push((res && res.data && res.data.text) || "");
            });
          });
        });
        return chain.then(function () { return texts; });
      })
      .then(function (texts) {
        var text = texts.join("\n\n");
        if (!text.trim()) {
          throw new Error("No readable text was found in that picture. Try a clearer, flatter photo.");
        }
        var draft = draftFromText(text);
        draft.flagged.push(many
          ? "Read from " + photos.length + " photos — the text will have mistakes, " +
            "and the join between cards may sit mid-list. Check every line."
          : "Read from a photo — the text will have mistakes. Check every line.");
        /* The cards themselves are kept as the recipe's pages, so the source
           is always one tap away from the transcription. */
        return Promise.all(photos.map(readPhoto)).then(function (pages) {
          return setImage("__new__", many ? pages : pages[0]).then(function (err) {
            if (err) draft.flagged.push("The photos couldn’t be kept on this phone (" + err + ")");
            S.addDraft = draft;
            S.addStep = "review";
            S.addBusy = "";
            render();
          });
        });
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

  /* Levenshtein capped at 2 — enough to recognise "1NGRED1ENTS" as a heading
     without a full distance matrix. */
  function lev2(a, b) {
    if (Math.abs(a.length - b.length) > 2) return 3;
    var prev = [], cur = [];
    for (var j = 0; j <= b.length; j++) prev[j] = j;
    for (var i = 1; i <= a.length; i++) {
      cur = [i];
      var rowMin = i;
      for (var k = 1; k <= b.length; k++) {
        cur[k] = Math.min(
          prev[k] + 1, cur[k - 1] + 1,
          prev[k - 1] + (a[i - 1] === b[k - 1] ? 0 : 1)
        );
        if (cur[k] < rowMin) rowMin = cur[k];
      }
      if (rowMin > 2) return 3;
      prev = cur;
    }
    return prev[b.length];
  }

  /* A heading survives OCR noise: "lngredients", "1NGRED1ENTS", "D1RECTIONS"
     all land within two edits of the real word once case is folded. */
  var HEADING_WORDS = {
    ingredients: ["ingredients", "ingredient"],
    steps: ["instructions", "instruction", "directions", "direction", "steps",
            "method", "preparation"],
    notes: ["notes", "note", "tips", "tip"]
  };

  function fuzzyHeading(line) {
    var w = line.toLowerCase().replace(/[^a-z0-9]/g, "").replace(/[01]/g, function (c) {
      return c === "0" ? "o" : "i"; // the two digits OCR loves to substitute
    });
    if (!w || w.length > 16) return null;
    var hit = null;
    Object.keys(HEADING_WORDS).forEach(function (k) {
      HEADING_WORDS[k].forEach(function (word) {
        if (lev2(w, word) <= (word.length > 6 ? 2 : 1)) hit = k;
      });
    });
    return hit;
  }

  var STEP_VERB = /^(mix|stir|add|bake|preheat|heat|combine|pour|whisk|cook|simmer|place|remove|serve|season|cover|bring|drain|fold|beat|chill|roll|cut|slice|grease|sprinkle|transfer|return|reduce|boil|melt|mash|fry|roast|grill|blend|knead|let|set|repeat|garnish|arrange|spread|top|turn|flip|rest|allow|divide|shape|form|brush|line|wrap|refrigerate|freeze|thaw|toss|marinate)\b/i;

  function draftFromText(raw) {
    var rough = raw.split(/\r?\n/).map(function (l) { return l.trim(); }).filter(Boolean);

    /* Bullet ghosts: OCR reads • as a letter — "e 2 cups flour". If three or
       more lines open with the same one-character token, that token is a
       bullet, whatever letter it pretends to be. */
    var leadCount = {};
    rough.forEach(function (l) {
      var m = l.match(/^(\S)\s+\S/);
      if (m) leadCount[m[1]] = (leadCount[m[1]] || 0) + 1;
    });
    var bullets = Object.keys(leadCount).filter(function (t) {
      return leadCount[t] >= 3 && /[^A-Za-z0-9]|[eoO°©®«»·¤§*+~-]/.test(t);
    });

    var stepNumbered = {};
    var lines = [];
    rough.forEach(function (l) {
      bullets.forEach(function (t) {
        if (l.indexOf(t + " ") === 0) l = l.slice(2);
      });
      l = l.replace(/^[\s•·▪‣◦\-*–—]+/, "");
      /* An original "3." or "3)" is the strongest step signal there is —
         remember it before stripping it. */
      var wasNumbered = /^\d{1,2}[.)]\s/.test(l);
      l = l.replace(/^\d{1,2}[.)]\s*/, "").trim();
      if (!l || /^[^A-Za-z0-9]{1,3}$/.test(l)) return;
      if (wasNumbered) stepNumbered[lines.length] = true;
      lines.push(l);
    });

    var d = blankDraft();
    d.flagged = [];
    d.ingredients = [];
    d.steps = [];
    var notes = [];
    var section = null;
    var sawHeadings = false;
    var sawServings = false;

    /* Meta lines claim their field and leave the flow: serves, times. */
    function claimMeta(line) {
      var m = line.match(/^(?:serves?|servings?|yields?|makes|portions?|feeds)\s*:?\s*(\d{1,2})\b/i);
      if (m) {
        d.servings = Math.min(40, Math.max(1, parseInt(m[1], 10)));
        sawServings = true;
        return true;
      }
      /* A time claim needs the word "time" or a colon — "Bake at 400 for 15
         minutes" is a step, "Bake: 40 min" and "Cook time 1 hr" are meta. */
      m = line.match(/^prep(?:\s*time\s*:?|\s*:)\s*(.+)$/i);
      if (m && m[1].length < 25) { d.prepTime = m[1].trim(); return true; }
      m = line.match(/^(?:cook|bake|total)(?:\s*time\s*:?|\s*:)\s*(.+)$/i);
      if (m && m[1].length < 25) { d.cookTime = m[1].trim(); return true; }
      return false;
    }

    /* Screenshot chrome is never a title: clock readings, "< Back", URLs,
       bare single words in a sea of content. */
    function junkTitle(line) {
      return /^\d{1,2}:\d{2}/.test(line) || /^[<‹«]/.test(line) ||
             /https?:\/\//i.test(line) || /^\d+%/.test(line) ||
             /^(back|menu|search|share|save|home)$/i.test(line);
    }

    function looksLikeIngredient(line) {
      if (QTY_START.test(line)) return true;
      var head = line.slice(0, 26);
      return MEASURE.test(head) && line.length < 90;
    }

    lines.forEach(function (line, index) {
      var matched = fuzzyHeading(line);
      if (matched) { section = matched; sawHeadings = true; return; }
      if (claimMeta(line)) return;
      /* Screenshot chrome above the first real section is dropped outright —
         a clock reading is not an ingredient. Inside a section everything is
         kept: better a junk line a human deletes than a real one lost. */
      if (!section && junkTitle(line)) return;
      /* Only before any heading, and only when the line doesn't read as a
         measured quantity — "Two Card Scones" is a title, "2 cups flour"
         never is. */
      if (!d.title && !section &&
          !/^[\d½⅓¼¾⅔⅛]/.test(line) && !MEASURE.test(line.slice(0, 26)) &&
          line.length < 70 && index < 6) {
        d.title = line;
        return;
      }
      if (section === "ingredients") d.ingredients.push(line);
      else if (section === "steps") d.steps.push(line);
      else if (section === "notes") notes.push(line);
      else if (stepNumbered[index] || STEP_VERB.test(line)) d.steps.push(line);
      else if (looksLikeIngredient(line)) d.ingredients.push(line);
      else if (line.length > 55) d.steps.push(line);
      else d.ingredients.push(line);
    });

    if (!d.title) {
      d.title = "";
      d.flagged.push("Title — none was obvious; add one.");
    }
    if (!sawHeadings) {
      d.flagged.push(
        "There were no “Ingredients” / “Instructions” headings, so the split " +
        "between the two lists was guessed. Check both."
      );
    }
    if (!sawServings) {
      d.flagged.push("Servings — no count was found; 4 was assumed.");
    }
    if (!d.ingredients.length) { d.ingredients = [""]; d.flagged.push("Ingredients — none were picked up."); }
    if (!d.steps.length) { d.steps = [""]; d.flagged.push("Steps — none were picked up."); }
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
    if (raw === "plan") return { name: "plan", id: "" };
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

  /* The app restores scroll itself per hash route; left on "auto" the
     browser races it with its own restore on back/forward and one of the
     two loses on a slow machine. */
  if ("scrollRestoration" in history) history.scrollRestoration = "manual";

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
    if (S.route.name === "plan") return "This week — Kitchen Table";
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

    /* Arriving at Add resets the transient state, then restores whatever the
       session snapshot holds — so a refresh (or a detour to check a recipe)
       lands back in the half-finished import. Save and choosing a new path
       are what discard work, never navigation. */
    if (next.name === "add" && S.route.name !== "add") {
      S.addStep = "choose";
      S.addDraft = null;
      S.addError = "";
      S.addBusy = "";
      S.addUrl = "";
      S.addPaste = "";
      S.addPhotos = [];
      S.addDupe = null;
      S.addDupeOk = false;
      S.videoUrl = "";
      S.videoJob = null;
      S.videoWaking = false;
      restoreAddDraft();
      /* The waiting list greets whoever arrives — someone else's finished
         import is family news, not private state. */
      fetchVideoReady();
    }
    if (next.name !== "add" && S.route.name === "add") stopVideoPoll();

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

    /* A scroll sample still queued for the old route must not be filed under
       the new one — cancel it before the key changes. */
    if (scrollTick) { clearTimeout(scrollTick); scrollTick = null; }

    S.route = next;
    S.notice = "";

    if (next.name === "recipe") {
      var r = byId(next.id);
      if (r && changedRecipe) S.serves = r.servings || 4;
    }

    render();

    document.title = screenTitle();

    if (changedRoute) {
      /* After the frame, so the fresh screen's full height exists — a
         same-tick scrollTo can clamp against a layout that hasn't settled. */
      var backTo = scrollPos[routeKey(next)] || 0;
      window.scrollTo(0, backTo);
      if (backTo && window.requestAnimationFrame) {
        requestAnimationFrame(function () { window.scrollTo(0, backTo); });
      }
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

  /* Gameplan 084 — a half-finished import survives an accidental refresh.
     Snapshotted on every Add-screen render (the cheapest "on change" there
     is when every change renders), restored at boot, cleared by Save and by
     Start over. Chosen photo files can't be serialised; everything typed or
     parsed can, and is. */
  function persistAddDraft() {
    try {
      if (S.route.name !== "add") return;
      if (S.addStep === "choose" && !S.addDraft && !S.addUrl && !S.addPaste && !S.videoJob) {
        sessionStorage.removeItem(K.addDraft);
        return;
      }
      sessionStorage.setItem(K.addDraft, JSON.stringify({
        step: S.addStep === "photo" ? "choose" : S.addStep,
        draft: S.addDraft,
        url: S.addUrl,
        paste: S.addPaste,
        videoUrl: S.videoUrl,
        videoJob: S.videoJob ? { id: S.videoJob.id, status: S.videoJob.status } : null
      }));
    } catch (e) { /* private browsing — the draft just won't survive */ }
  }

  function restoreAddDraft() {
    try {
      var raw = sessionStorage.getItem(K.addDraft);
      if (!raw) return;
      var d = JSON.parse(raw);
      if (d && (d.draft || d.url || d.paste || d.videoJob)) {
        S.addStep = d.step || "choose";
        S.addDraft = d.draft || null;
        S.addUrl = d.url || "";
        S.addPaste = d.paste || "";
        S.videoUrl = d.videoUrl || "";
        /* A watch in progress resumes — the job kept cooking through the
           refresh; polling picks it back up where the row says it is. */
        if (d.videoJob && d.videoJob.id) {
          S.videoJob = { id: d.videoJob.id, status: d.videoJob.status || "queued", eta: null };
          startVideoPoll();
        }
      }
    } catch (e) {}
  }

  function clearAddDraft() {
    try { sessionStorage.removeItem(K.addDraft); } catch (e) {}
  }

  /* Typing deliberately doesn't re-render, so the snapshot is scheduled off
     the input handlers instead — debounced to one write per pause. */
  var addPersistTick = null;
  function scheduleAddPersist() {
    if (addPersistTick) clearTimeout(addPersistTick);
    addPersistTick = setTimeout(function () {
      addPersistTick = null;
      persistAddDraft();
    }, 250);
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
    } else if (S.route.name === "plan") {
      html = viewPlan();
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
    persistAddDraft();
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
    if (act === "tag-sug") { applyTagSuggestion(el); return; }
    if (act === "to-flags") {
      var fp = document.getElementById("flag-panel");
      if (fp) {
        fp.scrollIntoView({
          behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches
            ? "auto" : "smooth",
          block: "center"
        });
      }
      return;
    }
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
    if (act === "toggle-remove") {
      S.removing = !S.removing;
      S.tagging = false; S.tagSel = {};
      render(); return;
    }
    if (act === "toggle-tagging") {
      S.tagging = !S.tagging;
      S.removing = false;
      if (!S.tagging) { S.tagSel = {}; S.bulkTags = ""; }
      render(); return;
    }
    if (act === "tag-pick") {
      var pid = el.getAttribute("data-id");
      S.tagSel[pid] = !S.tagSel[pid];
      render(); return;
    }
    if (act === "open-bulk") { openSheet("tagSheetOpen", el); return; }
    if (act === "close-bulk") { closeSheet("tagSheetOpen"); return; }
    /* ---- Week planner ---- */
    if (act === "plan-pick") {
      var pk = key.split("|");
      S.pickFor = { date: pk[0], slot: pk[1] };
      S.pickQ = "";
      openSheet("pickOpen", el);
      var pf = document.getElementById("pick-q");
      if (pf) pf.focus();
      return;
    }
    if (act === "close-pick") { S.pickFor = null; closeSheet("pickOpen"); return; }
    if (act === "plan-assign") {
      var pr = byId(key);
      if (!pr || !S.pickFor) return;
      /* 126: the same recipe twice in a week is a plan, not an error — each
         entry stands alone with its own servings. */
      S.plan.push({
        id: "p" + Date.now().toString(36) + Math.floor(Math.random() * 1e4).toString(36),
        date: S.pickFor.date,
        slot: S.pickFor.slot,
        recipeId: pr.id,
        titleThen: pr.title,
        servings: pr.servings
      });
      persistPlan();
      setNotice(pr.title + " planned for " + prettyDate(S.pickFor.date) + ".");
      S.pickFor = null;
      closeSheet("pickOpen");
      return;
    }
    if (act === "plan-meal") { S.mealFor = key; openSheet("mealOpen", el); return; }
    if (act === "close-meal") { S.mealFor = null; closeSheet("mealOpen"); return; }
    if (act === "meal-serv-" || act === "meal-serv+") {
      S.plan.forEach(function (e) {
        if (e.id !== S.mealFor) return;
        e.servings = act === "meal-serv-"
          ? Math.max(1, e.servings - 1)
          : Math.min(40, e.servings + 1);
      });
      persistPlan();
      render();
      return;
    }
    if (act === "plan-remove") {
      S.plan = S.plan.filter(function (e) { return e.id !== key; });
      persistPlan();
      if (S.mealOpen) { S.mealFor = null; closeSheet("mealOpen"); } else render();
      return;
    }
    if (act === "week-prev" || act === "week-next" || act === "week-today") {
      var nextOffset = act === "week-today" ? 0
        : S.planWeekOffset + (act === "week-prev" ? -1 : 1);
      if (nextOffset === S.planWeekOffset) return;
      S.planWeekOffset = nextOffset;
      /* 128: the week slides with the View Transitions API where it exists,
         repaints plainly where it doesn't, and never animates under reduced
         motion. */
      var reduce = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      if (document.startViewTransition && !reduce) {
        document.startViewTransition(function () { render(); });
      } else {
        render();
      }
      return;
    }
    if (act === "toggle-list") { S.listOpen = !S.listOpen; render(); return; }
    if (act === "plan-print") { window.print(); return; }

    if (act === "tag-manage") { openSheet("tagManageOpen", el); return; }
    if (act === "close-tag-manage") {
      S.tagEditing = ""; S.tagEditVal = "";
      closeSheet("tagManageOpen"); return;
    }
    if (act === "tag-edit") {
      S.tagEditing = key || "";
      S.tagEditVal = key || "";
      render();
      if (key) {
        var f = document.getElementById("tag-rename");
        if (f) { f.focus(); f.select(); }
      }
      return;
    }
    if (act === "tag-rename-apply") {
      var msg = renameTag(key, S.tagEditVal);
      S.tagEditing = ""; S.tagEditVal = "";
      if (msg) setNotice(msg);
      render();
      return;
    }
    if (act === "bulk-apply") {
      var toAdd = parseTags(S.bulkTags);
      if (!toAdd.length) { closeSheet("tagSheetOpen"); return; }
      /* A typed tag that matches an existing one in any casing becomes the
         existing form — bulk tagging must not mint near-duplicates (067's
         rule, enforced here too). */
      var canon = {};
      allTags().forEach(function (t) { canon[t.toLowerCase()] = t; });
      toAdd = toAdd.map(function (t) { return canon[t.toLowerCase()] || t; });
      var touched = 0;
      S.recipes = S.recipes.map(function (r) {
        if (!S.tagSel[r.id]) return r;
        var out = {};
        Object.keys(r).forEach(function (k) { out[k] = r[k]; });
        var have = tagsOf(r).slice();
        var lower = have.map(function (t) { return t.toLowerCase(); });
        toAdd.forEach(function (t) {
          if (lower.indexOf(t.toLowerCase()) === -1) { have.push(t); lower.push(t.toLowerCase()); }
        });
        out.tags = have;
        touched++;
        return out;
      });
      persistRecipes();
      S.tagSheetOpen = false;
      S.tagging = false; S.tagSel = {}; S.bulkTags = "";
      setNotice("Tagged " + touched + (touched === 1 ? " recipe." : " recipes."));
      render();
      return;
    }
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
      /* Backing out of the wait screen abandons the watching, not the job —
         it finishes server-side and appears in the waiting list. */
      stopVideoPoll();
      S.videoJob = null;
      S.addStep = "choose";
      S.addError = "";
      S.addBusy = "";
      scheduleAddPersist();
      fetchVideoReady();
      render();
      return;
    }
    if (act === "video-submit") { submitVideo(); return; }
    if (act === "video-open") { openReadyJob(parseInt(el.getAttribute("data-id"), 10)); return; }
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
    if (act === "amove") {
      var other = key === "ingredients" ? "steps" : "ingredients";
      var moved = S.addDraft[key].splice(idx, 1)[0];
      S.addDraft[other].push(moved);
      scheduleAddPersist();
      setNotice("Moved to " + (other === "steps" ? "the instructions." : "the ingredients."));
      render();
      return;
    }
    if (act === "add-save") { saveNewRecipe(); return; }
    if (act === "add-save-anyway") { S.addDupeOk = true; saveNewRecipe(); return; }

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
    if (act === "open-lb") { openSheet("lbOpen", el); return; }
    if (act === "close-lb") { closeSheet("lbOpen"); return; }
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
      if (S.editing) {
        startDraft(r);
        /* 071: a recipe with no ingredients opens Edit with one empty line
           ready and the caret already in it — the missing thing is the first
           thing the keyboard touches. */
        if (r && !(r.ingredients || []).filter(function (x) { return x.trim(); }).length) {
          if (!S.draft.ingredients.length) S.draft.ingredients.push("");
          render();
          var firstIng = document.getElementById("e-ing-0");
          if (firstIng) firstIng.focus();
          return;
        }
      } else { S.draft = null; S.saved = false; }
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
    if (act === "a-url") { S.addUrl = el.value; scheduleAddPersist(); return; }
    if (act === "video-url") { S.videoUrl = el.value; scheduleAddPersist(); return; }
    if (act === "a-paste") {
      var had = !!(S.addPaste || "").trim();
      S.addPaste = el.value;
      scheduleAddPersist();
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
        .then(function (dataUrl) { return setImage(target, dataUrl); })
        .then(function (err) {
          if (err) { S.addError = err; setNotice(err); }
          else { S.addError = ""; render(); }
        })
        .catch(function (e) { setNotice(e.message); });
      return;
    }
    if (act === "a-photo") {
      var picked = el.files && el.files[0];
      if (picked) S.addPhotos.push(picked);
      el.value = "";
      S.addError = "";
      render();
      return;
    }
    if (act === "a-photo-rm") {
      S.addPhotos.splice(idx, 1);
      render();
      return;
    }
    if (act === "ad") {
      S.addDraft[el.getAttribute("data-k")] = el.value;
      if (el.getAttribute("data-k") === "tags") syncTagSuggestions(el);
      scheduleAddPersist();
      return;
    }
    if (act === "bulk-tags") {
      S.bulkTags = el.value;
      syncTagSuggestions(el);
      return;
    }
    if (act === "tag-rename-input") { S.tagEditVal = el.value; return; }
    if (act === "pick-q") { S.pickQ = el.value; render(); return; }
    if (act === "adl") {
      S.addDraft[el.getAttribute("data-k")][parseInt(el.getAttribute("data-i"), 10)] = el.value;
      scheduleAddPersist();
      return;
    }
    if (act === "d") {
      S.draft[el.getAttribute("data-k")] = el.value;
      S.saved = false;
      if (el.getAttribute("data-k") === "tags") syncTagSuggestions(el);
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
    else if (S.lbOpen) closeSheet("lbOpen");
    else if (S.tagSheetOpen) closeSheet("tagSheetOpen");
    else if (S.tagManageOpen) { S.tagEditing = ""; S.tagEditVal = ""; closeSheet("tagManageOpen"); }
    else if (S.pickOpen) { S.pickFor = null; closeSheet("pickOpen"); }
    else if (S.mealOpen) { S.mealFor = null; closeSheet("mealOpen"); }
    else if (S.sortOpen) { S.sortOpen = false; render(); }
  });

  /* The sort menu is a popup, not a sheet — a tap anywhere else dismisses it. */
  document.addEventListener("click", function (ev) {
    if (!S.sortOpen) return;
    if (ev.target.closest && ev.target.closest('.sortmenu, [data-act="toggle-sort"]')) return;
    S.sortOpen = false;
    render();
  }, true);

  /* A recipe can reference images/<id>.jpg that was downloaded but never
     actually committed — its local copy gone, the published file absent. The
     broken-image glyph must never be the fallback: the thumbnail degrades to
     its category icon and heroes disappear, silently. Error events don't
     bubble, hence the capture phase. */
  document.addEventListener("error", function (ev) {
    var el = ev.target;
    if (!el || el.tagName !== "IMG") return;
    if (el.classList.contains("rcard__thumb")) {
      var span = document.createElement("span");
      span.className = "rcard__icon";
      span.setAttribute("aria-hidden", "true");
      span.innerHTML = catIcon(el.getAttribute("data-cat") || "", 24);
      el.replaceWith(span);
    } else if (el.classList.contains("r-hero")) {
      el.remove();
    } else if (el.classList.contains("hero__img")) {
      var blank = document.createElement("div");
      blank.className = "hero__blank";
      blank.innerHTML = ART.steam();
      el.replaceWith(blank);
    } else if (el.classList.contains("photorow__img")) {
      el.remove();
    }
  }, true);

  window.addEventListener("hashchange", onRoute);

  applyTheme();

  /* Photos load alongside the recipes so the first paint already knows every
     thumbnail — initImages never rejects, so the only failure mode here is
     the recipes themselves. */
  Promise.all([
    fetch("recipes.json", { cache: "no-cache" }).then(function (res) {
      if (!res.ok) throw new Error("HTTP " + res.status);
      return res.json();
    }),
    initImages()
  ])
    .then(function (both) {
      S.base = both[0];
      applyOverlay();
      loadPlan();
      S.loaded = true;
      onRoute();
    })
    .catch(function (err) {
      S.error = "The recipes could not be loaded (" + err.message +
                "). Check the connection and reload.";
      render();
    });
})();
