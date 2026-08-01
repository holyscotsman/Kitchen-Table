# Photo treatment — every slot, every orientation

Gameplan task `057`. Photos arrive from phones, which means portrait far
more often than not; the collection's cards are also squarish. Every slot
therefore declares one deliberate box and centre-crops into it with
`object-fit: cover` — a portrait photo, a landscape one and a square land
identically, and no slot ever changes size because of what was uploaded.

| Slot | Box | Crop | Reserved before decode |
| --- | --- | --- | --- |
| Recipe hero (`.r-hero`) | 3:2, width-filling, max 280px tall | cover, centre | yes — `aspect-ratio` |
| Main "Tonight's idea" (`.hero__img`) | width-filling × 200px | cover, centre | yes — fixed height |
| Menu thumbnail (`.rcard__thumb`) | 64 × 64, `--r-input` corners | cover, centre | yes — fixed both |
| Edit preview (`.photorow__img`) | 84 × 84, `--r-input` corners | cover, centre | yes — fixed both |

Rules that go with the boxes:

- **No placeholder, ever.** A recipe without a photo renders the category
  icon (Menu) or the steam artwork (Main hero) — never a broken-image glyph
  or an empty grey box pretending to load.
- **Thumbnails lazy-load** (`loading="lazy"`) and their boxes are fixed, so
  a list of photos decodes without a single layout shift.
- **The stored photo is already downscaled** on the device to 1200px /
  JPEG 0.72 before any slot sees it; slots never receive originals.
- **Centre-crop is the only crop.** If a card's handwriting sits at the top
  of a portrait photo, the fix is task `065`'s lightbox (the full image, one
  tap away), not per-photo crop controls.
