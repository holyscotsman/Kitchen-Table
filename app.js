/* ==========================================================================
   Kitchen Table — app.js

   Plain ES2018, no build step, no framework. A hash router over three screens:
     #            → Main
     #menu        → Menu   (#menu?who=Mom / #menu?cat=Dinner pre-filter it)
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

  var FS = [20, 24, 29, 34, 40]; // px; index 1 (24px) is the default
  var DEFAULT_FS = 1;
  var CATS = ["Dinner", "Breakfast", "Side", "Dessert", "Snack", "Drink"];
  var WHO = ["Mom", "Me", "Jennifer"];
  var FIELD_ORDER = [
    "id", "title", "category", "contributor", "servings", "prepTime",
    "cookTime", "ingredients", "steps", "notes", "flagged", "source", "image"
  ];

  var SORTS = [
    { key: "recent", label: "Recently added" },
    { key: "az", label: "Name A – Z" },
    { key: "quick", label: "Quickest first" },
    { key: "course", label: "Course" },
    { key: "who", label: "Who it's from" }
  ];

  var K = {
    theme: "kt.theme",
    fs: "kt.fsIndex",
    easyRead: "kt.easyRead",
    recipes: "kt.recipes"
  };

  /* Easy Read never drops the reader below this step. The A−/A+ stepper still
     works above it — the mode is additive, not a replacement. */
  var EASY_MIN_FS = 2;

  var CORS_PROXY = "https://api.allorigins.win/raw?url=";
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
    addPhoto: null,

    mainQ: "",

    menuQ: "",
    searchOpen: false,
    filterOpen: false,
    sortOpen: false,
    who: [],
    cats: [],
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

    notice: ""
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

  /* Sorting only — display never uses this. */
  function totalMinutes(recipe) {
    var text = (recipe.prepTime || "") + " " + (recipe.cookTime || "");
    var re = /(\d+(?:\.\d+)?)\s*(hour|hr|h|minute|min|m)\b/gi;
    var total = 0;
    var found = false;
    var m;
    while ((m = re.exec(text))) {
      found = true;
      var n = parseFloat(m[1]);
      total += /^h/i.test(m[2]) ? n * 60 : n;
    }
    return found ? total : 1e6;
  }

  /* ======================================================================
     5. Helpers
     ====================================================================== */

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

  function countBy(list, key, value) {
    var n = 0;
    for (var i = 0; i < list.length; i++) if (list[i][key] === value) n++;
    return n;
  }

  function themeBtn(extraClass) {
    return (
      '<button type="button" class="iconbtn press ' + (extraClass || "") + '" ' +
      'data-act="theme" aria-label="Switch to ' +
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
    S.recipes = Array.isArray(overlay) ? overlay.slice() : S.base.slice();
  }

  function persistRecipes() {
    save(K.recipes, S.recipes);
  }

  function orderFields(recipe) {
    var out = {};
    FIELD_ORDER.forEach(function (k) {
      if (recipe[k] !== undefined && recipe[k] !== "") out[k] = recipe[k];
    });
    return out;
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
         '<p class="main__sub">Everything Mom cooks, in one place.</p>' +
         "</div>" + themeBtn("themebtn--main") + "</div>";

    h += '<div class="searchwrap">' +
         '<span class="searchwrap__icon">' + I.search() + "</span>" +
         '<label class="vh" for="main-search">Search recipes</label>' +
         '<input class="searchfield" id="main-search" type="search" ' +
         'placeholder="Search ' + S.recipes.length + ' recipes" ' +
         'value="' + esc(S.mainQ) + '" data-act="main-q" autocomplete="off" />' +
         "</div>";

    if (q) {
      /* While searching, results replace the browse stack entirely. */
      var hits = S.recipes.filter(function (r) {
        if (r.title.toLowerCase().indexOf(q) > -1) return true;
        return (r.ingredients || []).some(function (i) {
          return i.toLowerCase().indexOf(q) > -1;
        });
      });
      h += '<h2 class="results__h">' + hits.length +
           (hits.length === 1 ? " match" : " matches") + "</h2>";
      if (!hits.length) {
        h += '<p class="emptystate">No recipes match. Try a different word.</p>';
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
           (pick.image
             ? '<img class="hero__img" src="' + esc(pick.image) + '" alt="' + esc(pick.title) + '" />'
             : '<div class="hero__blank"></div>') +
           '<div class="hero__body">' +
           '<p class="hero__meta">' + esc(pick.contributor) +
           (pick.cookTime ? " · " + esc(pick.cookTime) : "") + "</p>" +
           '<p class="hero__title">' + esc(pick.title) + "</p>" +
           "</div></a></section>";
    }

    h += '<section class="band"><h2 class="band__h">Whose recipe?</h2>' +
         '<div class="who-grid">' +
         WHO.map(function (name) {
           return '<a class="who-tile press" href="#menu?who=' + encodeURIComponent(name) + '">' +
                  '<span class="who-tile__count">' + countBy(S.recipes, "contributor", name) + "</span>" +
                  '<span class="who-tile__name">' + esc(name) + "</span></a>";
         }).join("") +
         "</div></section>";

    h += '<section class="band"><h2 class="band__h">What kind of thing?</h2>' +
         '<div class="cat-grid">' +
         CATS.filter(function (c) { return countBy(S.recipes, "category", c); })
           .map(function (c) {
             return '<a class="cat-row press" href="#menu?cat=' + encodeURIComponent(c) + '">' +
                    "<span>" + esc(c) + "</span>" +
                    '<span class="cat-row__count">' + countBy(S.recipes, "category", c) + "</span></a>";
           }).join("") +
         "</div></section>";

    h += '<a class="bigbtn press" href="#menu">See all ' + S.recipes.length +
         " recipes " + I.chevR(16, 16) + "</a>";
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
    var meta = esc(r.contributor) + (time ? " · " + esc(time) : "");
    return (
      '<a class="rcard press" href="#' + esc(r.id) + '">' +
      '<span class="rcard__body">' +
      '<span class="rcard__title">' + esc(r.title) + "</span>" +
      '<span class="rcard__meta">' + meta + "</span>" +
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
      if (!q) return true;
      if (r.title.toLowerCase().indexOf(q) > -1) return true;
      return (r.ingredients || []).some(function (i) {
        return i.toLowerCase().indexOf(q) > -1;
      });
    });

    if (S.sort === "az") {
      list.sort(function (a, b) { return a.title.localeCompare(b.title); });
    } else if (S.sort === "quick") {
      list.sort(function (a, b) { return totalMinutes(a) - totalMinutes(b); });
    } else if (S.sort === "course") {
      list.sort(function (a, b) {
        var d = CATS.indexOf(a.category) - CATS.indexOf(b.category);
        return d || a.title.localeCompare(b.title);
      });
    } else if (S.sort === "who") {
      list.sort(function (a, b) {
        var d = WHO.indexOf(a.contributor) - WHO.indexOf(b.contributor);
        return d || a.title.localeCompare(b.title);
      });
    }
    return list;
  }

  function viewMenu() {
    var list = menuMatches();
    var filterCount = S.who.length + S.cats.length;
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
      h += '<div class="emptystate"><p>No recipes match. Try a different word, ' +
           "or clear the filters.</p>" +
           '<button type="button" class="bigbtn press" data-act="show-all">' +
           "Show all recipes</button>" +
           /* Recovery path: if the list is empty because recipes were removed
              on this phone, Edit mode is unreachable, so the reset lives here
              too. */
           (hasLocalChanges() && !S.who.length && !S.cats.length && !S.menuQ
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
      WHO.map(function (name) {
        var on = S.who.indexOf(name) > -1;
        return '<button type="button" class="chip press" aria-pressed="' + on +
               '" data-act="fw" data-key="' + esc(name) + '">' +
               esc(name) + " (" + countWho(name) + ")</button>";
      }).join("") + "</div>" +
      '<h3 class="grouph">Course</h3><div class="chiprow">' +
      CATS.map(function (cat) {
        var on = S.cats.indexOf(cat) > -1;
        return '<button type="button" class="chip press" aria-pressed="' + on +
               '" data-act="fc" data-key="' + esc(cat) + '">' +
               esc(cat) + " (" + countCat(cat) + ")</button>";
      }).join("") + "</div>" +
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
      h += "</div>";
      return h;
    }

    h += '<p class="r-eyebrow">' + esc(r.contributor) + " · " + esc(r.category) + "</p>";
    h += '<h1 class="r-title">' + esc(r.title) + "</h1>";

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
           r.servings + ". Tap − / + to change.</p>";
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
    if ((r.ingredients || []).length) {
      h += '<ul class="checklist">' + r.ingredients.map(function (line, i) {
        var done = !!S.checkedIng[i];
        return '<li><button type="button" class="checkrow press" aria-pressed="' +
               done + '" data-act="chk-i" data-i="' + i + '">' +
               '<span class="checkbox">' + (done ? I.check(18) : "") + "</span>" +
               '<span class="checkrow__text">' + esc(scaleLine(line, mult)) +
               "</span></button></li>";
      }).join("") + "</ul>";
    } else {
      h += '<p class="hint">No ingredient list was captured for this recipe.</p>';
    }
    h += "</section>";

    h += "<section><h2 class=\"r-h2\">Instructions</h2>";
    h += '<ol class="checklist checklist--steps">' + (r.steps || []).map(function (line, i) {
      var done = !!S.checkedStep[i];
      return '<li><button type="button" class="checkrow press" aria-pressed="' +
             done + '" data-act="chk-s" data-i="' + i + '">' +
             '<span class="stepnum">' + (done ? I.check(16) : i + 1) + "</span>" +
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
      h += '<p class="sourceline">From Mom’s screenshots · ' + esc(r.source) + "</p>";
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

    h += '<button type="button" class="savebtn press" data-act="save">' +
         (S.saved ? "Saved ✓" : "Save changes") + "</button>";
    h += '<button type="button" class="outlinebtn press" data-act="dl-json">' +
         "Download updated recipes.json</button>";
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
      "Anything already downloaded and committed is unaffected."
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

  function startDraft(r) {
    S.draft = {
      title: r.title,
      servings: r.servings,
      contributor: r.contributor,
      ingredients: (r.ingredients || []).slice(),
      steps: (r.steps || []).slice(),
      notes: r.notes || ""
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
      notes: "", flagged: [], source: ""
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
      h += '<p class="addscreen__note">Most recipe sites block other sites from ' +
           "reading their pages directly, so the page is fetched through a free " +
           "public relay (allorigins.win). The address you paste is sent to that " +
           "relay. Nothing else about you is.</p>";
      h += '<button type="button" class="savebtn press" data-act="add-fetch"' +
           (S.addBusy ? " disabled" : "") + ">Fetch the recipe</button>";
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

    S.recipes = S.recipes.concat([recipe]);
    persistRecipes();
    S.addDraft = null;
    S.addStep = "choose";
    S.addError = "";
    S.addUrl = "";
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

    fetch(CORS_PROXY + encodeURIComponent(url))
      .then(function (res) {
        if (!res.ok) throw new Error("The relay couldn’t fetch that page (" + res.status + ").");
        return res.text();
      })
      .then(function (html) {
        var draft = recipeFromHtml(html);
        if (!draft) {
          throw new Error(
            "That page loaded, but it doesn’t publish recipe data this site can " +
            "read. Try the photo option, or type it in."
          );
        }
        draft.source = url;
        draft.flagged.push("Imported from a link — check it against the original.");
        S.addDraft = draft;
        S.addStep = "review";
        S.addBusy = "";
        render();
      })
      .catch(function (err) {
        S.addBusy = "";
        S.addError = /Failed to fetch|NetworkError|Load failed/i.test(err.message)
          ? "Couldn’t reach the relay. Check the connection and try again, or type the recipe in."
          : err.message;
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
    return d;
  }

  function guessCategory(raw) {
    var v = String(raw || "").toLowerCase();
    for (var i = 0; i < CATS.length; i++) {
      if (v.indexOf(CATS[i].toLowerCase()) > -1) return CATS[i];
    }
    if (/appetizer|salad|soup|bread|starter/.test(v)) return "Side";
    if (/cake|cookie|pudding|sweet/.test(v)) return "Dessert";
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
    return d;
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
      var who = [], cats = [];
      qs.split("&").forEach(function (pair) {
        var kv = pair.split("=");
        if (kv[0] === "who" && kv[1]) who = [decodeURIComponent(kv[1])];
        if (kv[0] === "cat" && kv[1]) cats = [decodeURIComponent(kv[1])];
      });
      return { name: "menu", id: "", who: who, cats: cats };
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

    if (next.name === "menu" && (next.who.length || next.cats.length)) {
      S.who = next.who;
      S.cats = next.cats;
    }

    /* Arriving at Add from elsewhere starts a fresh one. Staying on it keeps
       the draft, so "Start over" is the only thing that discards work. */
    if (next.name === "add" && S.route.name !== "add") {
      S.addStep = "choose";
      S.addDraft = null;
      S.addError = "";
      S.addBusy = "";
      S.addUrl = "";
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
        : '<div class="main"><p class="emptystate">That recipe isn’t here.</p>' +
          '<a class="bigbtn press" href="#menu">See all recipes</a></div>';
    } else {
      html = viewMain();
    }
    app.innerHTML = html;

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
    if (act === "reset-filters") { S.who = []; S.cats = []; render(); return; }
    if (act === "clear-filters") { S.who = []; S.cats = []; S.menuQ = ""; render(); return; }
    if (act === "show-all") {
      S.who = []; S.cats = []; S.menuQ = ""; S.searchOpen = false; render(); return;
    }
    if (act === "toggle-remove") { S.removing = !S.removing; render(); return; }
    if (act === "reset-local") { resetLocal(); return; }
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
    if (act === "add-ocr") { importFromPhoto(); return; }
    if (act === "aadd") { S.addDraft[key].push(""); render(); return; }
    if (act === "adel") { S.addDraft[key].splice(idx, 1); render(); return; }
    if (act === "add-save") { saveNewRecipe(); return; }

    if (!r) return;

    if (act === "serv-") { S.serves = Math.max(1, S.serves - 1); render(); return; }
    if (act === "serv+") { S.serves = Math.min(40, S.serves + 1); render(); return; }
    if (act === "chk-i") { S.checkedIng[idx] = !S.checkedIng[idx]; render(); return; }
    if (act === "chk-s") { S.checkedStep[idx] = !S.checkedStep[idx]; render(); return; }
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
