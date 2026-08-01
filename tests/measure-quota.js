/* Gameplan task 010 — measure how many photos localStorage actually holds.
 *
 * Not a pass/fail suite: a measuring tool. It synthesises photos the same way
 * the app stores them (canvas at the app's 1200px / 0.72-quality settings,
 * photographic noise so JPEG can't cheat), then fills kt.images one recipe at
 * a time until the quota throws. The number it prints is the ceiling that
 * decides task 062.
 *
 *   KT_BASE=http://127.0.0.1:8899 node tests/measure-quota.js
 */
const { chromium, devices } = require('playwright');
const B = process.env.KT_BASE || 'http://127.0.0.1:8899';

(async () => {
  const br = await chromium.launch(process.env.KT_CHROMIUM ? { executablePath: process.env.KT_CHROMIUM } : {});
  const ctx = await br.newContext({ ...devices['iPhone 13'] });
  const p = await ctx.newPage();
  await p.goto(B + '/index.html');
  await p.waitForSelector('.main__title');

  const result = await p.evaluate(async () => {
    /* A 1200px frame of photographic noise — the worst realistic case for
       JPEG size, which is the honest way to measure a ceiling. */
    function fakePhoto() {
      var c = document.createElement('canvas');
      c.width = 1200; c.height = 900;
      var g = c.getContext('2d');
      var img = g.createImageData(1200, 900);
      for (var i = 0; i < img.data.length; i += 4) {
        img.data[i] = 120 + ((Math.random() * 120) | 0);
        img.data[i + 1] = 90 + ((Math.random() * 100) | 0);
        img.data[i + 2] = 60 + ((Math.random() * 80) | 0);
        img.data[i + 3] = 255;
      }
      g.putImageData(img, 0, 0);
      return c.toDataURL('image/jpeg', 0.72);
    }

    var url = fakePhoto();
    var perPhotoKB = Math.round(url.length / 1024);
    var images = {};
    var stored = 0;
    var quotaAt = null;
    for (var n = 1; n <= 48; n++) {
      images['recipe-' + n] = url;
      try {
        localStorage.setItem('kt.images.probe', JSON.stringify(images));
        stored = n;
      } catch (e) {
        quotaAt = n;
        break;
      }
    }
    var bytes = (localStorage.getItem('kt.images.probe') || '').length;
    localStorage.removeItem('kt.images.probe');
    return { perPhotoKB: perPhotoKB, stored: stored, quotaAt: quotaAt, totalKB: Math.round(bytes / 1024) };
  });

  console.log('One 1200px/0.72 noisy photo as a data URL: ~' + result.perPhotoKB + ' KB');
  console.log('Photos stored before quota: ' + result.stored + (result.quotaAt ? ' (failed at #' + result.quotaAt + ')' : ' (all 48 fit)'));
  console.log('Bytes held at that point: ~' + result.totalKB + ' KB');
  console.log(result.quotaAt
    ? 'CEILING: localStorage cannot hold the collection — task 062 must move photos to IndexedDB.'
    : 'CEILING: 48 photos of this size fit — 062 can be a written justification.');
  await br.close();
})();
