/**
 * Pasted-screenshot rules, checked without a database.
 *
 *   npm run check:chat:attachments
 */

import { deflateSync } from "node:zlib"
import {
  ATTACH,
  attachmentName,
  imageNote,
  imagesTitle,
  pickImages,
  refuseImage,
  sniffImage,
} from "../lib/chat/attachments"

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

/** A real, decodable PNG — signature, IHDR, one IDAT, IEND. CRCs are not read by the sniffer. */
function png(width: number, height: number): Uint8Array {
  const chunk = (type: string, data: Buffer) => {
    const head = Buffer.alloc(8)
    head.writeUInt32BE(data.length, 0)
    head.write(type, 4, "ascii")
    return Buffer.concat([head, data, Buffer.alloc(4)])
  }
  const ihdr = Buffer.alloc(13)
  ihdr.writeUInt32BE(width, 0)
  ihdr.writeUInt32BE(height, 4)
  ihdr[8] = 8
  ihdr[9] = 2
  const rows = Buffer.alloc((width * 3 + 1) * height)
  return new Uint8Array(
    Buffer.concat([
      Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
      chunk("IHDR", ihdr),
      chunk("IDAT", deflateSync(rows)),
      chunk("IEND", Buffer.alloc(0)),
    ])
  )
}

/** SOI, an APP0 segment to walk past, a baseline SOF0 carrying the size, EOI. */
function jpeg(width: number, height: number, frame = 0xc0): Uint8Array {
  const app0 = [0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46, 0x49, 0x46, 0x00, 1, 1, 0, 0, 1, 0, 1, 0, 0]
  const sof = [
    0xff, frame, 0x00, 0x11, 0x08,
    (height >> 8) & 0xff, height & 0xff,
    (width >> 8) & 0xff, width & 0xff,
    0x03, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1,
  ]
  return new Uint8Array([0xff, 0xd8, ...app0, ...sof, 0xff, 0xd9])
}

console.log("sniffing")
check("png size from IHDR", sniffImage(png(1512, 982)), { mime: "image/png", width: 1512, height: 982 })
check("jpeg size from SOF0, past APP0", sniffImage(jpeg(2000, 1300)), { mime: "image/jpeg", width: 2000, height: 1300 })
check("progressive jpeg (SOF2)", sniffImage(jpeg(640, 480, 0xc2)), { mime: "image/jpeg", width: 640, height: 480 })
check("a DHT marker is not a frame", sniffImage(jpeg(640, 480, 0xc4)), null)
check("gif is not accepted", sniffImage(new Uint8Array(Buffer.from("GIF89a\x10\x00\x10\x00"))), null)
check("html named .png is not an image", sniffImage(new Uint8Array(Buffer.from("<script>alert(1)</script>"))), null)
check("truncated png", sniffImage(png(10, 10).slice(0, 20)), null)

console.log("")
console.log("refusing")
check("empty", refuseImage(new Uint8Array()).error, "That file is empty.")
check("over the byte cap", refuseImage(new Uint8Array(ATTACH.maxBytes + 1)).error, "Images are capped at 5 MB.")
check("not an image", refuseImage(new Uint8Array([1, 2, 3, 4])).error, "Only PNG and JPEG images can be attached.")
check("too many pixels a side", refuseImage(png(9000, 10)).error, "Images are capped at 8000 px a side.")
check("a screenshot passes", refuseImage(png(2000, 1299)).info, { mime: "image/png", width: 2000, height: 1299 })

console.log("")
console.log("names")
check("a pasted image says nothing", attachmentName("image.png", "image/png"), "screenshot.png")
check("empty", attachmentName("", "image/jpeg"), "screenshot.jpg")
check("macOS screenshot keeps its name", attachmentName("Screenshot 2026-09-16 at 11.20.04.png", "image/png"), "Screenshot 2026-09-16 at 11.20.04.png")
check("extension follows the bytes", attachmentName("photo.heic", "image/jpeg"), "photo.jpg")
check("no path, no quotes", attachmentName('../../etc/"pass"wd.png', "image/png"), "passwd.png")
check("no header injection", attachmentName("a\r\nSet-Cookie: x.png", "image/png"), "aSet-Cookie: x.png")
check("titles", [imagesTitle(1), imagesTitle(3)], ["Screenshot", "3 screenshots"])

console.log("")
console.log("which images a turn carries")
const thread = [
  { images: [{ id: "a" }, { id: "b" }] },
  { images: [] },
  { images: [{ id: "c" }] },
  {},
  { images: [{ id: "d" }, { id: "e" }, { id: "f" }, { id: "g" }] },
]
const sent = pickImages(thread)
check("newest six, oldest first", sent, ["b", "c", "d", "e", "f", "g"])
check("cap of zero sends none", pickImages(thread, 0), [])
check("a message whose image went", imageNote([{ id: "a" }, { id: "b" }], sent), "[image 1 attached; 1 older image not resent]")
check("one image", imageNote([{ id: "c" }], sent), "[image 2 attached]")
check("several", imageNote([{ id: "d" }, { id: "e" }, { id: "f" }, { id: "g" }], sent), "[images 3, 4, 5, 6 attached]")
check("no images, no mark", imageNote(undefined, sent), "")
check("all dropped", imageNote([{ id: "x" }, { id: "y" }], sent), "[2 older images not resent]")

console.log("")
if (failures) {
  console.log(`${failures} failed`)
  process.exit(1)
}
console.log("all passed")
