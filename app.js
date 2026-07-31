/* ==========================================================================
   Mom's Recipe Book — app.js

   Plain ES2018 browser JavaScript. No build step, no framework, no runtime
   dependency on anything outside this repo (GitHub's API is only ever touched
   when someone deliberately publishes an edit).

   Layout of this file:
     1.  Config + tiny helpers
     2.  Display preferences (reader mode, text-size stepper)
     3.  Data layer (recipes.json + locally staged edits)
     4.  Edit mode state
     5.  Home page
     6.  Recipe detail page
     7.  Recipe editor dialog
     8.  Import (from a link, or from pasted text)
     9.  GitHub REST API + publish flow
     10. Share / download / print
     11. Boot
   ========================================================================== */
(function () {
  "use strict";

  /* ======================================================================
     1. Config + helpers
     ====================================================================== */

  /* The site only ever talks to its own repository, so this is hardcoded
     rather than configurable. If the repo is renamed or moved, this object
     is the only thing that needs to change. */
  var REPO = {
    owner: "holyscotsman",
    name: "Kitchen-Table",
    branch: "main"
  };

  var STORAGE = {
    reader: "mrb.readerMode",
    textStep: "mrb.textStep",
    editMode: "mrb.editMode",
    staged: "mrb.stagedChanges",
    token: "mrb.githubToken",
    baseSha: "mrb.baseSha"
  };

  var CATEGORIES = [
    "Breakfast",
    "Lunch",
    "Dinner",
    "Dessert",
    "Side",
    "Snack",
    "Drink"
  ];

  var TEXT_STEPS = [0.9, 1, 1.15, 1.3, 1.5, 1.7, 2];
  var DEFAULT_TEXT_STEP = 1;

  function $(id) {
    return document.getElementById(id);
  }

  function esc(value) {
    return String(value == null ? "" : value)
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;")
      .replace(/'/g, "&#39;");
  }

  function store(key, value) {
    try {
      if (value === null) localStorage.removeItem(key);
      else localStorage.setItem(key, JSON.stringify(value));
    } catch (err) {
      /* Private browsing or a full quota — preferences just won't persist. */
    }
  }

  function read(key, fallback) {
    try {
      var raw = localStorage.getItem(key);
      return raw === null ? fallback : JSON.parse(raw);
    } catch (err) {
      return fallback;
    }
  }

  function slugify(text) {
    return String(text || "")
      .toLowerCase()
      .replace(/['’]/g, "")
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 60);
  }

  var toastTimer = null;
  function toast(message) {
    var node = $("toast");
    if (!node) return;
    node.textContent = message;
    node.hidden = false;
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () {
      node.hidden = true;
    }, 4200);
  }

  function showMessage(id, text, kind) {
    var node = $(id);
    if (!node) return;
    node.textContent = text;
    node.className = "msg msg--" + (kind || "error");
    node.hidden = !text;
  }

  function clearMessage(id) {
    var node = $(id);
    if (node) node.hidden = true;
  }

  function openDialog(id) {
    var dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.showModal === "function") dialog.showModal();
    else dialog.setAttribute("open", "");
  }

  function closeDialog(id) {
    var dialog = $(id);
    if (!dialog) return;
    if (typeof dialog.close === "function") dialog.close();
    else dialog.removeAttribute("open");
  }

  /* ======================================================================
     2. Display preferences — reader mode + text-size stepper

     These are the only two settings Mom is expected to touch, so they live
     on <html>, apply before first paint where possible, and persist.
     ====================================================================== */

  var prefs = {
    reader: read(STORAGE.reader, false) === true,
    step: (function () {
      var saved = read(STORAGE.textStep, DEFAULT_TEXT_STEP);
      return typeof saved === "number" && saved >= 0 && saved < TEXT_STEPS.length
        ? saved
        : DEFAULT_TEXT_STEP;
    })()
  };

  function applyPrefs() {
    var root = document.documentElement;
    root.classList.toggle("reader", prefs.reader);
    root.style.setProperty("--fs", String(TEXT_STEPS[prefs.step]));

    var toggle = $("reader-toggle");
    if (toggle) toggle.setAttribute("aria-pressed", String(prefs.reader));

    var smaller = $("text-smaller");
    var larger = $("text-larger");
    if (smaller) smaller.disabled = prefs.step === 0;
    if (larger) larger.disabled = prefs.step === TEXT_STEPS.length - 1;
  }

  function initPrefs() {
    applyPrefs();

    var toggle = $("reader-toggle");
    if (toggle) {
      toggle.addEventListener("click", function () {
        prefs.reader = !prefs.reader;
        /* Turning reader mode on shouldn't leave text small — nudge the
           stepper up to a comfortable floor the first time. */
        if (prefs.reader && prefs.step < 2) {
          prefs.step = 2;
          store(STORAGE.textStep, prefs.step);
        }
        store(STORAGE.reader, prefs.reader);
        applyPrefs();
        toast(prefs.reader ? "Reader mode on" : "Reader mode off");
      });
    }

    function stepBy(delta) {
      var next = Math.min(TEXT_STEPS.length - 1, Math.max(0, prefs.step + delta));
      if (next === prefs.step) return;
      prefs.step = next;
      store(STORAGE.textStep, prefs.step);
      applyPrefs();
      toast("Text size " + Math.round(TEXT_STEPS[prefs.step] * 100) + "%");
    }

    var smaller = $("text-smaller");
    var larger = $("text-larger");
    if (smaller) smaller.addEventListener("click", function () { stepBy(-1); });
    if (larger) larger.addEventListener("click", function () { stepBy(1); });
  }

  /* ======================================================================
     3. Data layer
     ====================================================================== */

  var publishedRecipes = []; // exactly what's in recipes.json on the server
  var staged = read(STORAGE.staged, {}) || {}; // id -> {op, recipe}

  function normalize(recipe) {
    var out = {
      id: recipe.id || slugify(recipe.title),
      title: recipe.title || "Untitled recipe",
      category: CATEGORIES.indexOf(recipe.category) > -1 ? recipe.category : "Dinner",
      contributor: (recipe.contributor || "Mom").trim() || "Mom",
      ingredients: Array.isArray(recipe.ingredients) ? recipe.ingredients.slice() : [],
      steps: Array.isArray(recipe.steps) ? recipe.steps.slice() : []
    };
    ["servings", "prepTime", "cookTime", "notes", "source", "image"].forEach(
      function (key) {
        if (recipe[key]) out[key] = recipe[key];
      }
    );
    if (Array.isArray(recipe.flagged) && recipe.flagged.length) {
      out.flagged = recipe.flagged.slice();
    }
    if (recipe._pendingImage) out._pendingImage = recipe._pendingImage;
    return out;
  }

  function loadRecipes() {
    return fetch("recipes.json", { cache: "no-cache" })
      .then(function (response) {
        if (!response.ok) throw new Error("HTTP " + response.status);
        return response.json();
      })
      .then(function (data) {
        if (!Array.isArray(data)) throw new Error("recipes.json is not a list");
        publishedRecipes = data.map(normalize);
        return publishedRecipes;
      });
  }

  /* The staged overlay is applied only in Edit Mode. Viewer Mode always shows
     exactly what's published, so nobody is ever looking at a half-finished
     edit and thinking it's live. */
  function visibleRecipes() {
    if (!editMode.on) return publishedRecipes.slice();
    return mergedRecipes();
  }

  function mergedRecipes() {
    var byId = {};
    publishedRecipes.forEach(function (recipe) {
      byId[recipe.id] = recipe;
    });
    Object.keys(staged).forEach(function (id) {
      var change = staged[id];
      if (change.op === "delete") delete byId[id];
      else byId[id] = normalize(change.recipe);
    });
    return Object.keys(byId).map(function (id) {
      return byId[id];
    });
  }

  function findRecipe(id) {
    var list = visibleRecipes();
    for (var i = 0; i < list.length; i++) {
      if (list[i].id === id) return list[i];
    }
    return null;
  }

  function stagedCount() {
    return Object.keys(staged).length;
  }

  function saveStaged() {
    store(STORAGE.staged, staged);
    renderEditBar();
  }

  function stageUpsert(recipe) {
    staged[recipe.id] = { op: "upsert", recipe: recipe };
    saveStaged();
  }

  function stageDelete(id) {
    /* Deleting something that was only ever staged just drops the staged
       entry — there's nothing on the server to remove. */
    var wasPublished = publishedRecipes.some(function (r) {
      return r.id === id;
    });
    if (!wasPublished) delete staged[id];
    else staged[id] = { op: "delete", id: id };
    saveStaged();
  }

  function discardStaged() {
    staged = {};
    saveStaged();
  }

  function contributorsOf(list) {
    var seen = [];
    list.forEach(function (recipe) {
      if (seen.indexOf(recipe.contributor) === -1) seen.push(recipe.contributor);
    });
    return seen.sort();
  }

  /* ======================================================================
     4. Edit mode
     ====================================================================== */

  var editMode = {
    on: read(STORAGE.editMode, false) === true
  };

  function applyEditMode() {
    document.documentElement.classList.toggle("edit-mode", editMode.on);
    var toggle = $("edit-toggle");
    if (toggle) toggle.setAttribute("aria-pressed", String(editMode.on));
    var label = $("edit-toggle-label");
    if (label) label.textContent = editMode.on ? "Done editing" : "Edit mode";
    renderEditBar();
  }

  function renderEditBar() {
    var detail = $("edit-status-detail");
    if (!detail) return;
    var count = stagedCount();
    if (!count) {
      detail.textContent = "No unpublished changes.";
    } else {
      detail.textContent =
        count === 1
          ? "1 change staged, not published yet."
          : count + " changes staged, not published yet.";
    }
    var publishBtn = $("publish");
    if (publishBtn) publishBtn.disabled = count === 0;
  }

  function initEditMode(onChange) {
    applyEditMode();

    var toggle = $("edit-toggle");
    if (!toggle) return;

    toggle.addEventListener("click", function () {
      if (!editMode.on) {
        /* Deliberate, but not a password — a single confirm is enough to stop
           somebody landing in Edit Mode by accident. */
        var ok = window.confirm(
          "Turn on Edit Mode?\n\nThis shows the controls for adding, changing, and removing recipes. Nothing is published until you press “Publish changes”."
        );
        if (!ok) return;
        editMode.on = true;
      } else {
        if (stagedCount() > 0) {
          var leave = window.confirm(
            "You still have " +
              stagedCount() +
              " unpublished change(s).\n\nLeaving Edit Mode keeps them staged on this device — they just won't be visible until you come back and publish. Continue?"
          );
          if (!leave) return;
        }
        editMode.on = false;
      }
      store(STORAGE.editMode, editMode.on);
      applyEditMode();
      if (onChange) onChange();
    });
  }

  /* ======================================================================
     5. Home page
     ====================================================================== */

  var filters = { search: "", category: "All", contributor: "All" };

  function initHome() {
    initPrefs();
    initEditMode(renderHome);
    initEditorDialog(renderHome);
    initGithubDialog();
    initImportDialog();
    initPublishDialog();
    wireDialogCloseButtons();

    $("search").addEventListener("input", function (event) {
      filters.search = event.target.value.trim().toLowerCase();
      renderList();
    });

    $("clear-filters").addEventListener("click", function () {
      filters = { search: "", category: "All", contributor: "All" };
      $("search").value = "";
      renderHome();
    });

    $("add-recipe").addEventListener("click", function () {
      openEditor(null);
    });

    $("import-recipe").addEventListener("click", function () {
      clearMessage("import-error");
      clearMessage("import-ok");
      openDialog("import-dialog");
    });

    $("publish").addEventListener("click", openPublishDialog);

    loadRecipes()
      .then(function () {
        $("loading").hidden = true;
        renderHome();
      })
      .catch(function (error) {
        $("loading").innerHTML =
          '<p class="msg msg--error">Could not load the recipes. ' +
          esc(error.message) +
          "</p>";
      });
  }

  function renderHome() {
    renderFilters();
    renderList();
    renderContributorOptions();
  }

  function chipHtml(value, label, active) {
    return (
      '<button type="button" class="chip" data-value="' +
      esc(value) +
      '" aria-pressed="' +
      (active ? "true" : "false") +
      '">' +
      esc(label) +
      "</button>"
    );
  }

  function renderFilters() {
    var list = visibleRecipes();

    var usedCategories = CATEGORIES.filter(function (category) {
      return list.some(function (recipe) {
        return recipe.category === category;
      });
    });

    var categoryHost = $("category-filters");
    categoryHost.innerHTML =
      chipHtml("All", "All", filters.category === "All") +
      usedCategories
        .map(function (category) {
          return chipHtml(category, category, filters.category === category);
        })
        .join("");

    Array.prototype.forEach.call(
      categoryHost.querySelectorAll(".chip"),
      function (chip) {
        chip.addEventListener("click", function () {
          filters.category = chip.dataset.value;
          renderFilters();
          renderList();
        });
      }
    );

    /* The contributor filter only earns its space once more than one person
       has actually contributed a recipe. */
    var people = contributorsOf(list);
    var group = $("contributor-group");
    var host = $("contributor-filters");
    if (people.length < 2) {
      group.hidden = true;
      host.innerHTML = "";
      filters.contributor = "All";
      return;
    }

    group.hidden = false;
    host.innerHTML =
      chipHtml("All", "Everyone", filters.contributor === "All") +
      people
        .map(function (person) {
          return chipHtml(person, person, filters.contributor === person);
        })
        .join("");

    Array.prototype.forEach.call(host.querySelectorAll(".chip"), function (chip) {
      chip.addEventListener("click", function () {
        filters.contributor = chip.dataset.value;
        renderFilters();
        renderList();
      });
    });
  }

  function matchesFilters(recipe) {
    if (filters.category !== "All" && recipe.category !== filters.category) {
      return false;
    }
    if (
      filters.contributor !== "All" &&
      recipe.contributor !== filters.contributor
    ) {
      return false;
    }
    if (!filters.search) return true;

    var haystack = [
      recipe.title,
      recipe.category,
      recipe.contributor,
      recipe.notes || "",
      recipe.ingredients.join(" ")
    ]
      .join(" ")
      .toLowerCase();
    return haystack.indexOf(filters.search) > -1;
  }

  function renderList() {
    var grid = $("recipe-grid");
    var all = visibleRecipes().sort(function (a, b) {
      return a.title.localeCompare(b.title);
    });
    var matches = all.filter(matchesFilters);

    $("result-count").textContent =
      matches.length === all.length
        ? all.length + (all.length === 1 ? " recipe" : " recipes")
        : matches.length + " of " + all.length + " recipes";

    $("empty-state").hidden = matches.length > 0;

    grid.innerHTML = matches
      .map(function (recipe) {
        var stagedChange = staged[recipe.id];
        var badge = "";
        if (editMode.on && stagedChange) {
          var isNew = !publishedRecipes.some(function (r) {
            return r.id === recipe.id;
          });
          badge =
            '<span class="tag">' + (isNew ? "New — unpublished" : "Edited — unpublished") + "</span>";
        }

        /* No image field means no <img> at all — not a placeholder box. */
        var thumb = recipe.image
          ? '<img class="recipe-card__thumb" src="' +
            esc(recipe.image) +
            '" alt="" loading="lazy" onerror="this.remove()" />'
          : "";

        var meta = [
          '<span class="tag">' + esc(recipe.category) + "</span>",
          "<span>" + esc(recipe.contributor) + "</span>"
        ];
        if (recipe.cookTime) meta.push("<span>" + esc(recipe.cookTime) + "</span>");

        return (
          "<li>" +
          '<article class="recipe-card">' +
          thumb +
          '<a class="recipe-card__link" href="recipe.html?id=' +
          encodeURIComponent(recipe.id) +
          '">' +
          '<h3 class="recipe-card__title">' +
          esc(recipe.title) +
          "</h3>" +
          '<p class="recipe-card__meta">' +
          meta.join("") +
          badge +
          "</p>" +
          "</a>" +
          '<div class="recipe-card__edit" data-edit-only>' +
          '<button type="button" class="btn btn--small" data-edit-id="' +
          esc(recipe.id) +
          '">Edit</button>' +
          '<button type="button" class="btn btn--small btn--danger" data-delete-id="' +
          esc(recipe.id) +
          '">Delete</button>' +
          "</div>" +
          "</article>" +
          "</li>"
        );
      })
      .join("");

    Array.prototype.forEach.call(
      grid.querySelectorAll("[data-edit-id]"),
      function (button) {
        button.addEventListener("click", function () {
          openEditor(findRecipe(button.dataset.editId));
        });
      }
    );

    Array.prototype.forEach.call(
      grid.querySelectorAll("[data-delete-id]"),
      function (button) {
        button.addEventListener("click", function () {
          var recipe = findRecipe(button.dataset.deleteId);
          if (!recipe) return;
          if (
            window.confirm(
              'Remove "' +
                recipe.title +
                '"?\n\nIt stays on the live site until you publish.'
            )
          ) {
            stageDelete(recipe.id);
            renderHome();
            toast("Removal staged");
          }
        });
      }
    );
  }

  function renderContributorOptions() {
    var datalist = $("contributor-options");
    if (!datalist) return;
    datalist.innerHTML = contributorsOf(mergedRecipes())
      .map(function (person) {
        return '<option value="' + esc(person) + '"></option>';
      })
      .join("");
  }

  /* ======================================================================
     6. Recipe detail page
     ====================================================================== */

  var currentRecipe = null;

  function initDetail() {
    initPrefs();
    initEditMode(function () {
      renderDetail();
    });
    initEditorDialog(function () {
      renderDetail();
    });
    initGithubDialog();
    wireDialogCloseButtons();

    $("share-recipe").addEventListener("click", shareRecipe);
    $("download-recipe").addEventListener("click", downloadRecipe);
    $("print-recipe").addEventListener("click", function () {
      window.print();
    });
    $("edit-this").addEventListener("click", function () {
      if (currentRecipe) openEditor(currentRecipe);
    });

    /* The Web Share API is the whole point of "Save to Notes" on iPhone;
       everywhere else the button honestly says what it does instead. */
    if (!navigator.share) {
      $("share-label").textContent = "Copy recipe text";
    }

    loadRecipes()
      .then(function () {
        $("loading").hidden = true;
        renderDetail();
      })
      .catch(function (error) {
        $("loading").innerHTML =
          '<p class="msg msg--error">Could not load the recipe. ' +
          esc(error.message) +
          "</p>";
      });
  }

  function currentId() {
    return new URLSearchParams(window.location.search).get("id") || "";
  }

  function renderDetail() {
    var host = $("recipe");
    var recipe = findRecipe(currentId());
    currentRecipe = recipe;

    if (!recipe) {
      host.hidden = false;
      host.innerHTML =
        '<div class="empty-state"><h2>Recipe not found</h2>' +
        "<p>It may have been renamed or removed.</p>" +
        '<a class="btn btn--primary" href="index.html">Back to all recipes</a></div>';
      $("detail-actions").hidden = true;
      return;
    }

    document.title = recipe.title + " — Mom's Recipe Book";

    var meta = [["Category", recipe.category]];
    if (recipe.servings) meta.push(["Serves", recipe.servings]);
    if (recipe.prepTime) meta.push(["Prep", recipe.prepTime]);
    if (recipe.cookTime) meta.push(["Cook", recipe.cookTime]);
    meta.push(["From", recipe.contributor]);

    var html = "";

    if (recipe.image) {
      html +=
        '<img class="recipe__hero" src="' +
        esc(recipe.image) +
        '" alt="' +
        esc(recipe.title) +
        '" onerror="this.remove()" />';
    }

    html += '<h1 class="recipe__title">' + esc(recipe.title) + "</h1>";

    html +=
      '<dl class="recipe__meta">' +
      meta
        .map(function (pair) {
          return (
            "<div><dt>" + esc(pair[0]) + "</dt><dd>" + esc(pair[1]) + "</dd></div>"
          );
        })
        .join("") +
      "</dl>";

    if (recipe.flagged && recipe.flagged.length) {
      html +=
        '<div class="callout callout--warn">' +
        "<h2>Worth double-checking</h2><ul>" +
        recipe.flagged
          .map(function (note) {
            return "<li>" + esc(note) + "</li>";
          })
          .join("") +
        "</ul></div>";
    }

    /* A handful of recipes were transcribed from screenshots that never
       captured the ingredient list. Say so plainly rather than leaving a
       heading with nothing underneath it. */
    html += '<section class="recipe__section"><h2>Ingredients</h2>';
    if (recipe.ingredients.length) {
      html +=
        '<ul class="ingredients">' +
        recipe.ingredients
          .map(function (item) {
            return "<li>" + esc(item) + "</li>";
          })
          .join("") +
        "</ul>";
    } else {
      html +=
        '<p class="recipe__missing">No ingredient list was captured for this ' +
        "recipe — only the steps below.</p>";
    }
    html += "</section>";

    html += '<section class="recipe__section"><h2>Steps</h2>';
    if (recipe.steps.length) {
      html +=
        '<ol class="steps">' +
        recipe.steps
          .map(function (step) {
            return "<li>" + esc(step) + "</li>";
          })
          .join("") +
        "</ol>";
    } else {
      html +=
        '<p class="recipe__missing">No steps were captured for this recipe.</p>';
    }
    html += "</section>";

    if (recipe.notes) {
      html +=
        '<div class="callout"><h2>Notes</h2><p>' + esc(recipe.notes) + "</p></div>";
    }

    if (recipe.source) {
      html += '<p class="recipe__source">Source: ' + esc(recipe.source) + "</p>";
    }

    host.innerHTML = html;
    host.hidden = false;
    $("detail-actions").hidden = false;
  }

  /* ======================================================================
     7. Recipe editor dialog
     ====================================================================== */

  var editorState = { original: null, pendingImage: null };

  function listRow(value, index, kind) {
    var li = document.createElement("li");

    var indexLabel = document.createElement("span");
    indexLabel.className = "list-editor__index";
    indexLabel.textContent = kind === "steps" ? index + 1 + "." : "•";
    indexLabel.setAttribute("aria-hidden", "true");

    var field = document.createElement("textarea");
    field.value = value || "";
    field.rows = 1;
    field.setAttribute(
      "aria-label",
      (kind === "steps" ? "Step " : "Ingredient ") + (index + 1)
    );

    var remove = document.createElement("button");
    remove.type = "button";
    remove.className = "btn btn--small btn--danger";
    remove.innerHTML = '<span aria-hidden="true">✕</span>';
    remove.setAttribute(
      "aria-label",
      "Remove " + (kind === "steps" ? "step " : "ingredient ") + (index + 1)
    );
    remove.addEventListener("click", function () {
      li.remove();
      renumber(kind);
    });

    li.appendChild(indexLabel);
    li.appendChild(field);
    li.appendChild(remove);
    return li;
  }

  function renumber(kind) {
    var host = $(kind === "steps" ? "steps-editor" : "ingredients-editor");
    Array.prototype.forEach.call(host.children, function (li, index) {
      li.querySelector(".list-editor__index").textContent =
        kind === "steps" ? index + 1 + "." : "•";
      li.querySelector("textarea").setAttribute(
        "aria-label",
        (kind === "steps" ? "Step " : "Ingredient ") + (index + 1)
      );
    });
  }

  function fillList(kind, values) {
    var host = $(kind === "steps" ? "steps-editor" : "ingredients-editor");
    host.innerHTML = "";
    (values && values.length ? values : [""]).forEach(function (value, index) {
      host.appendChild(listRow(value, index, kind));
    });
  }

  function readList(kind) {
    var host = $(kind === "steps" ? "steps-editor" : "ingredients-editor");
    return Array.prototype.map
      .call(host.querySelectorAll("textarea"), function (field) {
        return field.value.trim();
      })
      .filter(Boolean);
  }

  function openEditor(recipe) {
    clearMessage("editor-error");
    $("f-title-error").hidden = true;
    editorState.original = recipe;
    editorState.pendingImage = (recipe && recipe._pendingImage) || null;

    $("editor-title").textContent = recipe ? "Edit recipe" : "Add a recipe";
    $("f-title").value = recipe ? recipe.title : "";
    $("f-category").value = recipe ? recipe.category : "Dinner";
    $("f-contributor").value = recipe ? recipe.contributor : "";
    $("f-servings").value = (recipe && recipe.servings) || "";
    $("f-prep").value = (recipe && recipe.prepTime) || "";
    $("f-cook").value = (recipe && recipe.cookTime) || "";
    $("f-notes").value = (recipe && recipe.notes) || "";
    $("f-source").value = (recipe && recipe.source) || "";
    $("f-flagged").value =
      recipe && recipe.flagged ? recipe.flagged.join("\n") : "";
    $("f-photo").value = "";

    fillList("ingredients", recipe ? recipe.ingredients : []);
    fillList("steps", recipe ? recipe.steps : []);

    renderContributorOptions();
    openDialog("editor-dialog");
    /* Focus synchronously. A deferred focus lands after someone has already
       started typing and drags their text into the wrong field. */
    $("f-title").focus();
  }

  function initEditorDialog(afterSave) {
    if (!$("editor-dialog")) return;

    $("add-ingredient").addEventListener("click", function () {
      var host = $("ingredients-editor");
      host.appendChild(listRow("", host.children.length, "ingredients"));
      host.lastChild.querySelector("textarea").focus();
    });

    $("add-step").addEventListener("click", function () {
      var host = $("steps-editor");
      host.appendChild(listRow("", host.children.length, "steps"));
      host.lastChild.querySelector("textarea").focus();
    });

    $("f-photo").addEventListener("change", function (event) {
      var file = event.target.files && event.target.files[0];
      if (!file) {
        editorState.pendingImage = null;
        return;
      }
      resizeImage(file)
        .then(function (base64) {
          editorState.pendingImage = { base64: base64 };
          $("f-photo-hint").textContent =
            "Photo ready — it publishes with the recipe.";
        })
        .catch(function () {
          showMessage("editor-error", "That image could not be read.", "error");
        });
    });

    /* Enter inside a field shouldn't quietly submit-and-close the dialog. */
    $("editor-form").addEventListener("submit", function (event) {
      event.preventDefault();
    });

    $("editor-save").addEventListener("click", function () {
      var title = $("f-title").value.trim();
      $("f-title-error").hidden = !!title;
      if (!title) {
        $("f-title").focus();
        return;
      }

      var ingredients = readList("ingredients");
      var steps = readList("steps");
      if (!ingredients.length && !steps.length) {
        showMessage(
          "editor-error",
          "Add at least one ingredient or step before saving.",
          "error"
        );
        return;
      }

      var original = editorState.original;
      var id = original ? original.id : uniqueId(slugify(title));

      var recipe = {
        id: id,
        title: title,
        category: $("f-category").value,
        contributor: $("f-contributor").value.trim() || "Mom",
        servings: $("f-servings").value.trim(),
        prepTime: $("f-prep").value.trim(),
        cookTime: $("f-cook").value.trim(),
        ingredients: ingredients,
        steps: steps,
        notes: $("f-notes").value.trim(),
        source: $("f-source").value.trim(),
        flagged: $("f-flagged")
          .value.split("\n")
          .map(function (line) {
            return line.trim();
          })
          .filter(Boolean)
      };

      if (original && original.image) recipe.image = original.image;
      if (editorState.pendingImage) {
        recipe._pendingImage = editorState.pendingImage;
        recipe.image = "images/" + id + ".jpg";
      }

      stageUpsert(normalize(recipe));
      editorState.pendingImage = null;
      $("f-photo-hint").textContent =
        "Gets resized and published to images/ alongside the recipe.";
      closeDialog("editor-dialog");
      toast(original ? "Change staged" : "Recipe staged");
      if (afterSave) afterSave();
    });
  }

  function uniqueId(base) {
    var taken = {};
    mergedRecipes().forEach(function (recipe) {
      taken[recipe.id] = true;
    });
    var candidate = base || "recipe";
    var counter = 2;
    while (taken[candidate]) {
      candidate = base + "-" + counter++;
    }
    return candidate;
  }

  /* Photos get downscaled in the browser so the repo doesn't fill up with
     multi-megabyte originals. */
  function resizeImage(file) {
    return new Promise(function (resolve, reject) {
      var reader = new FileReader();
      reader.onerror = reject;
      reader.onload = function () {
        var image = new Image();
        image.onerror = reject;
        image.onload = function () {
          var maxEdge = 1600;
          var scale = Math.min(1, maxEdge / Math.max(image.width, image.height));
          var canvas = document.createElement("canvas");
          canvas.width = Math.round(image.width * scale);
          canvas.height = Math.round(image.height * scale);
          canvas.getContext("2d").drawImage(image, 0, 0, canvas.width, canvas.height);
          var dataUrl = canvas.toDataURL("image/jpeg", 0.82);
          resolve(dataUrl.slice(dataUrl.indexOf(",") + 1));
        };
        image.src = reader.result;
      };
      reader.readAsDataURL(file);
    });
  }

  /* ======================================================================
     8. Import

     Two honest paths. A link is tried directly against the target site and
     read for standard recipe markup; that works on sites which allow it and
     fails cleanly on the many that don't, at which point pasting the text
     always works. Nothing is ever saved without a human seeing it first.
     ====================================================================== */

  function initImportDialog() {
    if (!$("import-dialog")) return;

    $("import-fetch").addEventListener("click", function () {
      var url = $("import-url").value.trim();
      clearMessage("import-error");
      clearMessage("import-ok");
      if (!url) {
        showMessage("import-error", "Paste a link first.", "error");
        return;
      }

      var button = $("import-fetch");
      button.disabled = true;
      button.textContent = "Fetching…";

      fetch(url, { mode: "cors" })
        .then(function (response) {
          if (!response.ok) throw new Error("The page returned " + response.status + ".");
          return response.text();
        })
        .then(function (html) {
          var parsed = parseRecipeFromHtml(html);
          if (!parsed) {
            throw new Error(
              "That page loaded, but it doesn't publish recipe data this site can read. Copy the recipe text and paste it below instead."
            );
          }
          parsed.source = url;
          closeDialog("import-dialog");
          openEditor(normalize(parsed));
        })
        .catch(function (error) {
          var blocked = /Failed to fetch|NetworkError|Load failed/i.test(
            error.message
          );
          showMessage(
            "import-error",
            blocked
              ? "That site doesn't allow other sites to read its pages, so the recipe can't be fetched automatically. Copy the recipe text and paste it in the box below — that always works."
              : error.message,
            "error"
          );
        })
        .then(function () {
          button.disabled = false;
          button.textContent = "Fetch and read the page";
        });
    });

    $("import-parse").addEventListener("click", function () {
      clearMessage("import-error");
      var text = $("import-text").value;
      if (!text.trim()) {
        showMessage("import-error", "Paste some recipe text first.", "error");
        return;
      }
      var parsed = parseRecipeFromText(text);
      closeDialog("import-dialog");
      $("import-text").value = "";
      openEditor(normalize(parsed));
    });
  }

  /* Reads schema.org Recipe data (JSON-LD), which most recipe sites publish
     for search engines. */
  function parseRecipeFromHtml(html) {
    var doc = new DOMParser().parseFromString(html, "text/html");
    var blocks = doc.querySelectorAll('script[type="application/ld+json"]');
    for (var i = 0; i < blocks.length; i++) {
      var data;
      try {
        data = JSON.parse(blocks[i].textContent);
      } catch (err) {
        continue;
      }
      var recipe = findRecipeNode(data);
      if (recipe) return fromJsonLd(recipe);
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
    var type = node["@type"];
    if (type === "Recipe" || (Array.isArray(type) && type.indexOf("Recipe") > -1)) {
      return node;
    }
    if (node["@graph"]) return findRecipeNode(node["@graph"]);
    return null;
  }

  function fromJsonLd(node) {
    function text(value) {
      if (!value) return "";
      if (typeof value === "string") return value.trim();
      if (Array.isArray(value)) return text(value[0]);
      if (value.text) return String(value.text).trim();
      if (value.name) return String(value.name).trim();
      return "";
    }

    function list(value) {
      if (!value) return [];
      if (typeof value === "string") {
        return value.split(/\n+/).map(function (line) { return line.trim(); }).filter(Boolean);
      }
      if (!Array.isArray(value)) return [text(value)].filter(Boolean);
      var out = [];
      value.forEach(function (item) {
        if (item && item["@type"] === "HowToSection" && item.itemListElement) {
          out = out.concat(list(item.itemListElement));
        } else {
          var line = text(item);
          if (line) out.push(line);
        }
      });
      return out;
    }

    /* ISO 8601 durations ("PT1H30M") turned into something readable. */
    function duration(value) {
      var raw = text(value);
      var match = /^P(?:\d+D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(raw);
      if (!match || (!match[1] && !match[2])) return raw && !/^P/.test(raw) ? raw : "";
      var parts = [];
      if (match[1]) parts.push(match[1] + " hr");
      if (match[2]) parts.push(match[2] + " min");
      return parts.join(" ");
    }

    var flagged = [];
    var title = text(node.name);
    if (!title) flagged.push("No title was found on the page — add one.");

    var ingredients = list(node.recipeIngredient || node.ingredients);
    if (!ingredients.length) {
      flagged.push("No ingredients were found — check the original page.");
    }

    var steps = list(node.recipeInstructions);
    if (!steps.length) {
      flagged.push("No steps were found — check the original page.");
    }

    flagged.push("Imported from a link — check it against the original before publishing.");

    var image = "";
    if (node.image) {
      image = typeof node.image === "string" ? node.image : text(node.image.url || node.image);
    }

    return {
      title: title,
      category: guessCategory(node.recipeCategory ? text(node.recipeCategory) : ""),
      contributor: "",
      servings: text(node.recipeYield),
      prepTime: duration(node.prepTime),
      cookTime: duration(node.cookTime || node.totalTime),
      ingredients: ingredients,
      steps: steps,
      notes: text(node.description),
      flagged: flagged,
      /* Deliberately not carried into `image` — remote URLs would break the
         "everything is a local file" promise. Noted instead. */
      source: image ? "Original photo: " + image : ""
    };
  }

  function guessCategory(raw) {
    var value = String(raw || "").toLowerCase();
    for (var i = 0; i < CATEGORIES.length; i++) {
      if (value.indexOf(CATEGORIES[i].toLowerCase()) > -1) return CATEGORIES[i];
    }
    if (/appetizer|salad|soup|bread/.test(value)) return "Side";
    return "Dinner";
  }

  var SECTION_HEADINGS = {
    ingredients: /^(ingredients?|what you(’|')?ll need|you will need)\s*:?\s*$/i,
    steps: /^(instructions?|directions?|steps?|method|preparation|how to make it)\s*:?\s*$/i,
    notes: /^(notes?|tips?)\s*:?\s*$/i
  };

  var QUANTITY_START = /^(\d|½|⅓|¼|¾|⅔|⅛|a |an |one |two |three |four |half )/i;
  var MEASURE = /\b(cups?|tbsp|tsp|tablespoons?|teaspoons?|ounces?|oz|pounds?|lbs?|grams?|g|kg|ml|liters?|cloves?|cans?|packages?|pinch|dash|sticks?|slices?|quarts?|pints?)\b/i;

  function parseRecipeFromText(raw) {
    var lines = raw
      .split(/\r?\n/)
      .map(function (line) {
        return line.replace(/^[\s•\-*–—]+/, "").replace(/^\d+[.)]\s*/, "").trim();
      })
      .filter(Boolean);

    var flagged = [];
    var title = "";
    var ingredients = [];
    var steps = [];
    var notes = [];
    var section = null;
    var sawHeadings = false;

    lines.forEach(function (line, index) {
      var matchedHeading = null;
      Object.keys(SECTION_HEADINGS).forEach(function (key) {
        if (SECTION_HEADINGS[key].test(line)) matchedHeading = key;
      });

      if (matchedHeading) {
        section = matchedHeading;
        sawHeadings = true;
        return;
      }

      if (!title && index === 0) {
        title = line;
        return;
      }

      if (section === "ingredients") ingredients.push(line);
      else if (section === "steps") steps.push(line);
      else if (section === "notes") notes.push(line);
      else if (!section) {
        /* Before any heading appears, sort lines by shape: short lines that
           lead with a quantity read as ingredients, long sentences as steps. */
        if ((QUANTITY_START.test(line) || MEASURE.test(line)) && line.length < 90) {
          ingredients.push(line);
        } else if (line.length > 40) {
          steps.push(line);
        } else {
          ingredients.push(line);
        }
      }
    });

    if (!title) {
      title = "Untitled recipe";
      flagged.push("No title was obvious in the pasted text — add one.");
    }
    if (!sawHeadings) {
      flagged.push(
        "The text had no “Ingredients”/“Instructions” headings, so the split between ingredients and steps was guessed. Check both lists."
      );
    }
    if (!ingredients.length) flagged.push("No ingredients were picked up.");
    if (!steps.length) flagged.push("No steps were picked up.");

    return {
      title: title,
      category: "Dinner",
      contributor: "",
      ingredients: ingredients,
      steps: steps,
      notes: notes.join(" "),
      flagged: flagged,
      source: "Imported from pasted text"
    };
  }

  /* ======================================================================
     9. GitHub REST API + publish
     ====================================================================== */

  var API = "https://api.github.com/repos/" + REPO.owner + "/" + REPO.name;

  function getToken() {
    return read(STORAGE.token, "") || "";
  }

  function utf8ToBase64(text) {
    var bytes = new TextEncoder().encode(text);
    var binary = "";
    var chunk = 0x8000;
    for (var i = 0; i < bytes.length; i += chunk) {
      binary += String.fromCharCode.apply(
        null,
        bytes.subarray(i, Math.min(i + chunk, bytes.length))
      );
    }
    return btoa(binary);
  }

  function githubRequest(path, options) {
    options = options || {};
    return fetch(API + path, {
      method: options.method || "GET",
      headers: {
        Authorization: "Bearer " + getToken(),
        Accept: "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "Content-Type": "application/json"
      },
      body: options.body ? JSON.stringify(options.body) : undefined
    }).then(function (response) {
      if (response.status === 404 && options.allow404) return null;
      return response.json().then(
        function (data) {
          if (!response.ok) {
            var error = new Error(describeGithubError(response.status, data));
            error.status = response.status;
            throw error;
          }
          return data;
        },
        function () {
          if (!response.ok) throw new Error("GitHub returned " + response.status + ".");
          return null;
        }
      );
    });
  }

  function describeGithubError(status, data) {
    var detail = (data && data.message) || "";
    if (status === 401) {
      return "GitHub rejected the token. It may be expired or mistyped — reconnect with a new one.";
    }
    if (status === 403) {
      return "That token isn't allowed to write here. Check it has Contents: Read and write on this repository. (" + detail + ")";
    }
    if (status === 404) {
      return "GitHub couldn't find the repository with this token. Check the token is scoped to " + REPO.owner + "/" + REPO.name + ".";
    }
    if (status === 409 || status === 422) {
      return "The file changed on GitHub since this edit started.";
    }
    return detail || "GitHub returned " + status + ".";
  }

  function initGithubDialog() {
    var dialog = $("github-dialog");
    if (!dialog) return;

    var repoName = $("github-repo-name");
    if (repoName) repoName.textContent = REPO.owner + "/" + REPO.name;

    $("github-save").addEventListener("click", function () {
      var token = $("github-token").value.trim();
      if (!token) {
        showMessage("github-error", "Paste a token first.", "error");
        return;
      }
      store(STORAGE.token, token);
      $("github-token").value = "";
      clearMessage("github-error");
      closeDialog("github-dialog");
      toast("Connected to GitHub");
      if (pendingAfterConnect) {
        var next = pendingAfterConnect;
        pendingAfterConnect = null;
        next();
      }
    });

    $("github-forget").addEventListener("click", function () {
      store(STORAGE.token, null);
      $("github-forget").hidden = true;
      toast("Token removed from this device");
    });
  }

  var pendingAfterConnect = null;

  function ensureToken(next) {
    if (getToken()) {
      next();
      return;
    }
    pendingAfterConnect = next;
    clearMessage("github-error");
    $("github-forget").hidden = !getToken();
    openDialog("github-dialog");
  }

  function initPublishDialog() {
    if (!$("publish-dialog")) return;
    $("publish-confirm").addEventListener("click", doPublish);
  }

  function openPublishDialog() {
    if (!stagedCount()) return;
    ensureToken(function () {
      clearMessage("publish-error");
      clearMessage("publish-ok");
      $("publish-confirm").disabled = false;
      $("commit-message").value = defaultCommitMessage();
      renderStagedList();
      openDialog("publish-dialog");
    });
  }

  function renderStagedList() {
    var host = $("staged-list");
    host.innerHTML = Object.keys(staged)
      .map(function (id) {
        var change = staged[id];
        var wasPublished = publishedRecipes.some(function (r) {
          return r.id === id;
        });
        var kind =
          change.op === "delete" ? "deleted" : wasPublished ? "edited" : "added";
        var title =
          change.op === "delete"
            ? (publishedRecipes.filter(function (r) { return r.id === id; })[0] || {}).title || id
            : change.recipe.title;
        var image =
          change.op !== "delete" && change.recipe._pendingImage
            ? " (with a new photo)"
            : "";
        return (
          "<li><span class='staged-badge staged-badge--" + kind + "'>" +
          kind +
          "</span><span>" +
          esc(title) +
          esc(image) +
          "</span></li>"
        );
      })
      .join("");
  }

  function defaultCommitMessage() {
    var count = stagedCount();
    return count === 1
      ? "Update recipes.json via Edit Mode (1 change)"
      : "Update recipes.json via Edit Mode (" + count + " changes)";
  }

  function doPublish() {
    var button = $("publish-confirm");
    button.disabled = true;
    button.textContent = "Publishing…";
    clearMessage("publish-error");
    clearMessage("publish-ok");

    var message = $("commit-message").value.trim() || defaultCommitMessage();

    /* Always read the current file immediately before writing, so a stale sha
       is caught as a conflict rather than silently overwriting someone. */
    githubRequest("/contents/recipes.json?ref=" + encodeURIComponent(REPO.branch))
      .then(function (file) {
        var serverRecipes = JSON.parse(decodeBase64Utf8(file.content));
        var conflicts = findConflicts(serverRecipes);
        if (conflicts.length) {
          var error = new Error(
            "Someone else published changes to " +
              conflicts.join(", ") +
              " while this edit was open. Reload the page to pull in their version, then redo this edit so neither change is lost."
          );
          error.conflict = true;
          throw error;
        }
        return publishImages().then(function () {
          return putRecipes(serverRecipes, file.sha, message);
        });
      })
      .then(function () {
        discardStaged();
        showMessage(
          "publish-ok",
          "Published. The live site updates in about a minute, once GitHub finishes rebuilding it — a refresh before then will still show the old version.",
          "ok"
        );
        button.textContent = "Published";
        renderStagedList();
        return loadRecipes().then(function () {
          if ($("recipe-grid")) renderHome();
          else renderDetail();
        });
      })
      .catch(function (error) {
        showMessage("publish-error", error.message, "error");
        button.disabled = false;
        button.textContent = "Publish to the live site";
      });
  }

  function decodeBase64Utf8(base64) {
    var binary = atob(String(base64).replace(/\s/g, ""));
    var bytes = new Uint8Array(binary.length);
    for (var i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
    return new TextDecoder().decode(bytes);
  }

  /* Order-independent fingerprint of a recipe. Comparing raw JSON strings
     would flag every edit as a conflict, because normalising a recipe changes
     its key order without changing its meaning. */
  function fingerprint(recipe) {
    var clean = stripInternal(normalize(recipe));
    return JSON.stringify(
      Object.keys(clean)
        .sort()
        .map(function (key) {
          return [key, clean[key]];
        })
    );
  }

  /* A conflict is only real if someone else changed one of the same recipes
     this edit touched — unrelated additions merge without complaint. */
  function findConflicts(serverRecipes) {
    var serverById = {};
    serverRecipes.forEach(function (recipe) {
      serverById[recipe.id] = fingerprint(recipe);
    });
    var baseById = {};
    publishedRecipes.forEach(function (recipe) {
      baseById[recipe.id] = fingerprint(recipe);
    });

    var clashes = [];
    Object.keys(staged).forEach(function (id) {
      var wasThere = Object.prototype.hasOwnProperty.call(baseById, id);
      var isThere = Object.prototype.hasOwnProperty.call(serverById, id);

      if (wasThere !== isThere) {
        clashes.push(id);
        return;
      }
      if (wasThere && serverById[id] !== baseById[id]) {
        clashes.push(id);
      }
    });
    return clashes;
  }

  function stripInternal(recipe) {
    var out = {};
    Object.keys(recipe).forEach(function (key) {
      if (key.charAt(0) !== "_") out[key] = recipe[key];
    });
    return out;
  }

  function publishImages() {
    var uploads = Object.keys(staged)
      .filter(function (id) {
        var change = staged[id];
        return change.op !== "delete" && change.recipe._pendingImage;
      })
      .map(function (id) {
        var change = staged[id];
        var path = "images/" + id + ".jpg";
        return githubRequest(
          "/contents/" + path + "?ref=" + encodeURIComponent(REPO.branch),
          { allow404: true }
        ).then(function (existing) {
          return githubRequest("/contents/" + path, {
            method: "PUT",
            body: {
              message: "Add photo for " + change.recipe.title,
              content: change.recipe._pendingImage.base64,
              branch: REPO.branch,
              sha: existing ? existing.sha : undefined
            }
          });
        });
      });

    return Promise.all(uploads);
  }

  function putRecipes(serverRecipes, sha, message) {
    var byId = {};
    var order = [];
    serverRecipes.forEach(function (recipe) {
      byId[recipe.id] = recipe;
      order.push(recipe.id);
    });

    Object.keys(staged).forEach(function (id) {
      var change = staged[id];
      if (change.op === "delete") {
        delete byId[id];
        return;
      }
      if (!byId[id]) order.push(id);
      byId[id] = cleanForFile(change.recipe);
    });

    var payload = order
      .filter(function (id) {
        return byId[id];
      })
      .map(function (id) {
        return byId[id];
      });

    return githubRequest("/contents/recipes.json", {
      method: "PUT",
      body: {
        message: message,
        content: utf8ToBase64(JSON.stringify(payload, null, 2) + "\n"),
        sha: sha,
        branch: REPO.branch
      }
    });
  }

  /* Writes the schema's field order, drops empty optional fields, and never
     lets an internal key (like a pending image blob) reach the file. */
  function cleanForFile(recipe) {
    var out = {
      id: recipe.id,
      title: recipe.title,
      category: recipe.category,
      contributor: recipe.contributor
    };
    ["servings", "prepTime", "cookTime"].forEach(function (key) {
      if (recipe[key]) out[key] = recipe[key];
    });
    out.ingredients = recipe.ingredients;
    out.steps = recipe.steps;
    if (recipe.notes) out.notes = recipe.notes;
    if (recipe.flagged && recipe.flagged.length) out.flagged = recipe.flagged;
    if (recipe.source) out.source = recipe.source;
    if (recipe.image) out.image = recipe.image;
    return out;
  }

  /* ======================================================================
     10. Share / download / print
     ====================================================================== */

  function recipeToText(recipe) {
    var lines = [recipe.title, ""];

    var meta = [];
    if (recipe.servings) meta.push("Serves: " + recipe.servings);
    if (recipe.prepTime) meta.push("Prep: " + recipe.prepTime);
    if (recipe.cookTime) meta.push("Cook: " + recipe.cookTime);
    meta.push("From: " + recipe.contributor);
    lines.push(meta.join("  |  "), "");

    lines.push("INGREDIENTS");
    if (recipe.ingredients.length) {
      recipe.ingredients.forEach(function (item) {
        lines.push("- " + item);
      });
    } else {
      lines.push("(not captured for this recipe)");
    }
    lines.push("");

    lines.push("STEPS");
    if (recipe.steps.length) {
      recipe.steps.forEach(function (step, index) {
        lines.push(index + 1 + ". " + step);
      });
    } else {
      lines.push("(not captured for this recipe)");
    }

    if (recipe.notes) lines.push("", "NOTES", recipe.notes);

    if (recipe.flagged && recipe.flagged.length) {
      lines.push("", "WORTH DOUBLE-CHECKING");
      recipe.flagged.forEach(function (note) {
        lines.push("- " + note);
      });
    }

    if (recipe.source) lines.push("", "Source: " + recipe.source);

    return lines.join("\n");
  }

  function shareRecipe() {
    if (!currentRecipe) return;
    var text = recipeToText(currentRecipe);

    if (navigator.share) {
      navigator
        .share({ title: currentRecipe.title, text: text })
        .catch(function () {
          /* A cancelled share sheet is not an error worth reporting. */
        });
      return;
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard
        .writeText(text)
        .then(function () {
          toast("Recipe copied — paste it into Notes");
        })
        .catch(function () {
          downloadRecipe();
        });
      return;
    }

    downloadRecipe();
  }

  function downloadRecipe() {
    if (!currentRecipe) return;
    var blob = new Blob([recipeToText(currentRecipe)], {
      type: "text/plain;charset=utf-8"
    });
    var url = URL.createObjectURL(blob);
    var link = document.createElement("a");
    link.href = url;
    link.download = currentRecipe.id + ".txt";
    document.body.appendChild(link);
    link.click();
    link.remove();
    setTimeout(function () {
      URL.revokeObjectURL(url);
    }, 1000);
    toast("Downloaded");
  }

  /* ======================================================================
     11. Boot
     ====================================================================== */

  function wireDialogCloseButtons() {
    Array.prototype.forEach.call(
      document.querySelectorAll("[data-close-dialog]"),
      function (button) {
        button.addEventListener("click", function () {
          closeDialog(button.dataset.closeDialog);
        });
      }
    );
  }

  document.addEventListener("DOMContentLoaded", function () {
    if ($("recipe-grid")) initHome();
    else if ($("recipe")) initDetail();
  });
})();
