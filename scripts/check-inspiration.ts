/**
 * Inspiration classify rules, checked without a database.
 *
 *   npm run check:inspiration
 */

import { classifyUrl, screenshotUrl, slugifyBoard } from "../lib/inspiration"
import { isPrivateHost } from "../lib/inspiration-unfurl"

let failures = 0
function check(label: string, actual: unknown, expected: unknown) {
  const a = JSON.stringify(actual)
  const e = JSON.stringify(expected)
  if (a === e) console.log(`  ok   ${label}`)
  else {
    failures += 1
    console.log(`  FAIL ${label}\n       got  ${a}\n       want ${e}`)
  }
}

console.log("slugs")
check("modern websites", slugifyBoard("Modern websites"), "modern-websites")
check("strips punctuation", slugifyBoard("Look & feel!"), "look-feel")

console.log("")
console.log("instagram")
const ig = classifyUrl(
  "https://www.instagram.com/reel/Dci-Pn-vvnH/?utm_source=ig_web_copy_link&igsi=NTc4MTIwNjQ2YQ=="
)
check("kind", ig?.kind, "video")
check("provider", ig?.provider, "instagram")
check("tracking stripped", ig?.canonical, "https://www.instagram.com/reel/Dci-Pn-vvnH/")
check("embed", ig?.embedUrl, "https://www.instagram.com/reel/Dci-Pn-vvnH/embed")

const post = classifyUrl("https://www.instagram.com/p/AbC123/")
check("post kind stays video", post?.kind, "video")
check("post title", post?.title, "Instagram post")

console.log("")
console.log("youtube")
const yt = classifyUrl("https://youtu.be/dQw4w9wgGcQ?si=abc")
check("youtube id", yt?.canonical, "https://www.youtube.com/watch?v=dQw4w9wgGcQ")
check("youtube embed", yt?.embedUrl, "https://www.youtube-nocookie.com/embed/dQw4w9wgGcQ")
check(
  "youtube thumb",
  yt?.previewUrl,
  "https://i.ytimg.com/vi/dQw4w9wgGcQ/hqdefault.jpg"
)
check(
  "shorts",
  classifyUrl("https://www.youtube.com/shorts/abcdefghijk")?.embedUrl,
  "https://www.youtube-nocookie.com/embed/abcdefghijk"
)

console.log("")
console.log("vimeo / tiktok / x")
check(
  "vimeo embed",
  classifyUrl("https://vimeo.com/123456789")?.embedUrl,
  "https://player.vimeo.com/video/123456789"
)
check(
  "tiktok embed",
  classifyUrl("https://www.tiktok.com/@someone/video/7123456789012345678")?.provider,
  "tiktok"
)
check(
  "x status",
  classifyUrl("https://x.com/foo/status/1234567890123456789")?.embedUrl,
  "https://platform.twitter.com/embed/Tweet.html?id=1234567890123456789"
)

console.log("")
console.log("images and sites")
const img = classifyUrl("https://cdn.example.com/mood/hero.jpg?w=1200")
check("image kind", img?.kind, "image")
check("image preview is itself", img?.previewUrl, img?.canonical)
const site = classifyUrl("https://www.example.com/work/studio")
check("site kind", site?.kind, "website")
check("site host", site?.host, "example.com")
check(
  "screenshot helper",
  screenshotUrl("https://example.com/"),
  "https://image.thum.io/get/width/1200/noanimate/https%3A%2F%2Fexample.com%2F"
)

console.log("")
console.log("rejects")
check("not a url", classifyUrl("just some words"), null)
check("javascript", classifyUrl("javascript:alert(1)"), null)

console.log("")
console.log("ssrf hosts")
check("localhost", isPrivateHost("localhost"), true)
check("loopback", isPrivateHost("127.0.0.1"), true)
check("rfc1918", isPrivateHost("192.168.1.10"), true)
check("link local", isPrivateHost("169.254.1.1"), true)
check("public", isPrivateHost("instagram.com"), false)
check("rfc1918 10", isPrivateHost("10.0.0.4"), true)
check("does not treat fcm as ipv6", isPrivateHost("fcm.googleapis.com"), false)

if (failures) {
  console.error(`\n${failures} failed`)
  process.exit(1)
}
console.log("\nall good")
