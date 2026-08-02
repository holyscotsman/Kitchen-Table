/* The in-process job queue: one at a time, in order, survive nothing.
 * Persistence is Postgres's job (the import_jobs row), so losing this queue
 * on restart is designed-for — boot re-queues 'queued' rows and fails
 * mid-flight ones with the resubmit message. A library would be more code
 * than this is. */
"use strict";

function serialQueue() {
  let tail = Promise.resolve();
  let pending = 0;
  return {
    push(fn) {
      pending++;
      tail = tail
        .then(fn)
        .catch(() => { /* runJob reports its own failures into the job row */ })
        .finally(() => { pending--; });
      return tail;
    },
    size() { return pending; }
  };
}

module.exports = { serialQueue };
