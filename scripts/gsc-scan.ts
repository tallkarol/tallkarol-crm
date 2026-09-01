/**
 * Run an index scan by hand. The scheduled path is
 * /api/insights/gsc-scan?site=<slug>; this is the same code without the HTTP.
 *
 *   npm run gsc:scan -- mycustommanufacturer
 */
import { runGscScan } from "../lib/insights/gsc-scan"

const slug = process.argv[2]
if (!slug) {
  console.error("usage: npm run gsc:scan -- <site-slug>")
  process.exit(1)
}

runGscScan(slug)
  .then((s) => {
    console.log(
      `${s.slug} ${s.scannedOn}: ${s.passCount}/${s.urlCount} indexed · ` +
        `${s.opened} opened · ${s.resolved} resolved · ${s.stillOpen} open` +
        (s.taskId ? ` · task ${s.taskId}` : " · no task needed")
    )
    process.exit(0)
  })
  .catch((err) => {
    console.error(err)
    process.exit(1)
  })
