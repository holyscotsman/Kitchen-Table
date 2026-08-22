# How to add a recipe to Kitchen Table

*For the family — no GitHub account, no technical anything required. If a step
here doesn't work the way this page says, that's a bug in the page: tell
Jason.*

## The one thing to understand first

When you add or change a recipe, it saves **on your phone only**. You'll see
it every time you open the site on that phone, but nobody else will — not
until it's published (step 4). Think of it as writing in your own copy of the
book, then handing the pages to Jason to put in everyone's copy.

## 1. Open the site

Go to **https://holyscotsman.github.io/Kitchen-Table/** in Safari. (Tip: use
the Share button → *Add to Home Screen* once, and it behaves like an app.)

## 2. Tap "Add recipe"

It's the green pill at the bottom of the **All recipes** screen (tap "View
all recipes" from the front page if you're not there). You'll get four ways
in — pick whichever matches what you're holding:

- **Type it in** — a blank form. Best when you know the recipe by heart.
- **From a link** — paste the web address of a recipe page. The site reads
  the page and fills the form for you. *Fair warning, shown in the app too:
  the address you paste is fetched through a public relay service.* If the
  fetch fails, there's a paste box right below — copy the recipe's text from
  the page and paste it there instead; that path always works.
- **From a photo** — take a picture of a recipe card or cookbook page. The
  reading happens on your phone; the photo is never uploaded anywhere. It
  *will* misread some lines — that's why the next step exists.
- **From a video** — paste a YouTube or Instagram link. The family's
  kitchen server watches it for you: it fetches the video, listens to the
  narration, reads any text on screen, and writes up a draft. This takes a
  few minutes and **you don't have to wait** — close the page, and the
  finished draft will be sitting at the top of the Add screen under "Ready
  to check over" when anyone comes back. Videos leave a lot unsaid, so
  expect a longer "Worth double-checking" list than usual — that's the
  feature being honest, not broken. (If the server's been idle it takes a
  minute to wake up; the app says so while it happens.)

### Sharing a video straight into the app

- **Android**: install the site (browser menu → *Add to home screen*), then
  the share button under any YouTube video or Instagram Reel → **Kitchen
  Table**. The link lands in the importer and sends itself.
- **iPhone**: Apple doesn't let websites join the share sheet, so paste the
  link into **From a video** — or set up a one-time Shortcut, about two
  minutes: open the **Shortcuts** app → **+** → name it "Send to Kitchen
  Table" → add the action **Get Contents of URL** → set the URL to
  `https://kitchen-table-5tp6.onrender.com/api/import/video`, Method to
  **POST**, Request Body to **JSON** with one field: `url` = **Shortcut
  Input**. Then in the Shortcut's settings (ⓘ) turn on **Show in Share
  Sheet**. From then on: share button on any video → *Send to Kitchen
  Table* → the draft appears on the Add screen when it's done.

## 3. Check the form, then Save

All four paths land on the same review form. Look it over — anything the
reader had to guess is listed under "Worth double-checking" and stays
attached to the recipe so others see it too.

While you're there:

- **Category** answers *"when would you serve this?"* — one of Breakfast,
  Brunch, Lunch, Dinner, Sides, Snacks, Baking, Desserts, Cocktails, Drinks.
- **Everything else true about the dish is a tag**: where it's from
  (Scottish, Italian), what's in it, how it's made (air fryer), who it suits.
  As you type a tag, the site suggests ones that already exist — **tap the
  suggestion** rather than typing your own spelling, so we don't end up with
  "italian", "Italian" and "Italy" as three different filters.
- **From** is whose recipe it is — your name, or Joan's if it's hers.
- **Photo** — attach one if you have one. It shows immediately on your phone.

Press **Save**. The recipe is now in your phone's copy of the book.

## 4. Make it real for everyone

Three ways, easiest first:

**The easiest way, if the passphrase is set up:** in Edit mode there's a
**Family passphrase** box. Put the family's passphrase in it once — just
once, on that phone — and from then on pressing **Save** puts the change in
everyone's copy as well as your own. The app tells you which happened, every
time: if it says *saved on this phone*, it means only this phone, and the
other two ways below still work.

**The reliable way:** open any recipe, turn on **Edit** (the switch at the
top), and press **"Download updated recipes.json"**. Your phone saves a file —
send that file to Jason (text, email, AirDrop, anything). If you added
photos, press **"Download photos"** too and send those along. Jason puts
them in the book, and within a couple of minutes the site shows your recipe
to everyone.

**The do-it-yourself way** (needs a GitHub account, entirely optional):
replace `recipes.json` in the repository with your downloaded file, put any
photos in `images/`, and commit. The site republishes itself.

## Fixing mistakes

- **Edit anything:** open the recipe, flip the **Edit** switch, change it,
  Save. (Same rule: on your phone until published.)
- **Remove a recipe:** on All recipes, tap **Remove**, then the recipe.
- **Panic button:** if your phone's copy is in a state you don't like,
  **"Undo all my changes on this phone"** (in the Edit footer) puts
  everything back to the published book. Your un-sent changes are gone after
  this — that's the point — so download the file first if any of them matter.

## If two people edited the same recipe

Whoever's file reaches Jason last would normally win, so he checks before
publishing: if both of you changed the *same* recipe, he'll ask (usually
Joan) which version is right rather than picking silently. Neither version
gets thrown away without someone saying so.
