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

    route: { name: "main", id: "" },

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
  }

  function toggleTheme() {
    S.theme = S.theme === "light" ? "dark" : "light";
    save(K.theme, S.theme);
    applyTheme();
    render();
  }

  function stepFs(delta) {
    var next = Math.min(FS.length - 1, Math.max(0, S.fsIndex + delta));
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

  /* Applies the localStorage overlay over the shipped file. */
  function applyOverlay() {
    var overlay = load(K.recipes, null);
    if (!Array.isArray(overlay)) {
      S.recipes = S.base.slice();
      return;
    }
    var byKey = {};
    overlay.forEach(function (r) { if (r && r.id) byKey[r.id] = r; });
    S.recipes = S.base.map(function (r) { return byKey[r.id] || r; });
    /* Anything in the overlay that isn't in the shipped file is a locally
       added recipe — keep it at the end. */
    overlay.forEach(function (r) {
      if (r && r.id && !S.base.some(function (b) { return b.id === r.id; })) {
        S.recipes.push(r);
      }
    });
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
    h += '<div class="mhead__row"><div>' +
         '<p class="eyebrow">Kitchen Table</p>' +
         '<h1 class="mhead__h1">Menu</h1></div>' +
         '<div class="mhead__tools">' +
         '<button type="button" class="iconbtn press' + (S.searchOpen ? " is-on" : "") +
         '" data-act="toggle-search" aria-pressed="' + S.searchOpen +
         '" aria-label="Search recipes">' + I.search() + "</button>" +
         themeBtn() +
         '<button type="button" class="iconbtn press" data-act="cycle-fs" ' +
         'aria-label="Text size, currently ' + FS[S.fsIndex] + ' pixels">Aa</button>' +
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
           "Show all recipes</button></div>";
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

    h += '<div class="addbar"><a class="addpill press" href="#menu" ' +
         'data-act="add-recipe">' + I.plus(20) + "Add recipe</a></div>";

    if (S.filterOpen) h += filterSheetHtml();
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
     ====================================================================== */

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
         (S.fsIndex === 0 ? " disabled" : "") + ">A−</button>" +
         '<button type="button" data-act="fs+" aria-label="Larger text"' +
         (S.fsIndex === FS.length - 1 ? " disabled" : "") + ">A+</button>" +
         "</div></div></div></header>";

    h += '<div class="modestrip"><div class="modestrip__inner">' +
         '<span class="modestrip__label">' +
         (S.editing ? "Edit mode — changes save on this phone"
                    : "Viewer mode — read only") + "</span>" +
         '<span class="modestrip__edit">Edit</span>' +
         '<button type="button" class="switch" role="switch" aria-checked="' +
         S.editing + '" data-act="toggle-edit" aria-label="Edit mode"></button>' +
         "</div></div>";

    h += '<div class="recipe" id="main-content" style="font-size:' + FS[S.fsIndex] + 'px">';

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
    return h;
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
        S.notice = "Recipe copied to the clipboard.";
        render();
      }).catch(function () {
        downloadBlob(text, r.id + ".txt", "text/plain;charset=utf-8");
      });
      return;
    }
    downloadBlob(text, r.id + ".txt", "text/plain;charset=utf-8");
  }

  var wakeSentinel = null;

  function releaseWake() {
    if (wakeSentinel) {
      try { wakeSentinel.release(); } catch (e) {}
      wakeSentinel = null;
    }
    S.awake = false;
  }

  function toggleWake() {
    if (S.awake) {
      releaseWake();
      render();
      return;
    }
    navigator.wakeLock.request("screen").then(function (s) {
      wakeSentinel = s;
      S.awake = true;
      s.addEventListener("release", function () {
        wakeSentinel = null;
        S.awake = false;
      });
      render();
    }).catch(function () {
      S.notice = "This browser wouldn’t keep the screen on.";
      render();
    });
  }

  document.addEventListener("visibilitychange", function () {
    if (document.visibilityState === "hidden") releaseWake();
  });

  /* ======================================================================
     12. Router + boot
     ====================================================================== */

  function parseHash() {
    var raw = (location.hash || "#").slice(1);
    if (!raw || raw === "main") return { name: "main", id: "" };
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

  function onRoute() {
    var next = parseHash();
    var changedRecipe = next.name !== "recipe" || next.id !== S.route.id;

    if (next.name === "menu" && (next.who.length || next.cats.length)) {
      S.who = next.who;
      S.cats = next.cats;
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

    window.scrollTo(0, 0);
    render();
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
    if (act === "cycle-fs") {
      S.fsIndex = (S.fsIndex + 1) % FS.length;
      save(K.fs, S.fsIndex);
      S.notice = "Text size " + FS[S.fsIndex] + "px — applies when reading a recipe.";
      render();
      return;
    }
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
    if (act === "open-filter") { S.filterOpen = true; S.sortOpen = false; render(); return; }
    if (act === "close-filter") { S.filterOpen = false; render(); return; }
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
    if (act === "remove") {
      var victim = byId(el.getAttribute("data-id"));
      if (victim && window.confirm('Remove "' + victim.title + '" from the collection?')) {
        S.recipes = S.recipes.filter(function (x) { return x.id !== victim.id; });
        persistRecipes();
        render();
      }
      return;
    }
    if (act === "add-recipe") {
      ev.preventDefault();
      S.notice = "Adding a recipe by hand isn’t built yet — it wasn’t part of this design round.";
      render();
      return;
    }

    if (!r) return;

    if (act === "serv-") { S.serves = Math.max(1, S.serves - 1); render(); return; }
    if (act === "serv+") { S.serves = Math.min(40, S.serves + 1); render(); return; }
    if (act === "chk-i") { S.checkedIng[idx] = !S.checkedIng[idx]; render(); return; }
    if (act === "chk-s") { S.checkedStep[idx] = !S.checkedStep[idx]; render(); return; }
    if (act === "toggle-wake") { toggleWake(); return; }
    if (act === "share") { shareRecipe(r); return; }
    if (act === "open-dl") { S.dlOpen = true; render(); return; }
    if (act === "close-dl") { S.dlOpen = false; render(); return; }
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
    if (S.filterOpen) { S.filterOpen = false; render(); }
    else if (S.dlOpen) { S.dlOpen = false; render(); }
    else if (S.sortOpen) { S.sortOpen = false; render(); }
  });

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
