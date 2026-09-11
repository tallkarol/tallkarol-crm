// audio-tap — macOS system-audio + microphone capture helper for the Tall Karol CRM.
//
// Writes two 16 kHz mono 16-bit PCM WAV files (mic.wav = Karol, system.wav = the other
// side of the call) and speaks one JSON object per line on stdout. Diagnostics go to
// stderr so the parent can parse stdout blindly.
//
// Engines (chosen with --engine, default `auto` = tap → sck → mic):
//
//   tap  (preferred, macOS 14.2+)  Core Audio *process tap* + a private aggregate device.
//        The aggregate carries the default input device (mic) AND the tap, so one HAL
//        IOProc delivers both tracks on a single clock — they stay sample-aligned for
//        free — and the only TCC grant it needs is "System Audio Recording Only"
//        (+ Microphone). No Screen Recording nag, no video pipeline.
//   sck  (fallback, macOS 15+)      ScreenCaptureKit: capturesAudio + captureMicrophone on
//        one SCStream with a 2x2 px, 1 fps video config we ignore. Works wherever SCK
//        works, but needs the Screen Recording grant, and the two tracks arrive on
//        separate sample-buffer streams (separate clocks).
//   mic                             AVAudioEngine input tap → mic.wav only.
//
// Concurrency: HAL/SCK callbacks run on their own threads, so shared state lives in
// @unchecked Sendable classes guarded by locks; nothing touches top-level variables.

import Foundation
import CoreAudio
import AudioToolbox
import AVFoundation
import CoreMedia
import ScreenCaptureKit

// MARK: - Output (stdout = JSON lines only; stderr = diagnostics)

enum Out {
    private static let lock = NSLock()

    /// Write one line to stdout with a raw write(2) so a parent reading a pipe sees it immediately.
    static func line(_ s: String) {
        lock.lock(); defer { lock.unlock() }
        var bytes = Array((s + "\n").utf8)
        var off = 0
        while off < bytes.count {
            let n = bytes.withUnsafeMutableBytes { write(1, $0.baseAddress! + off, $0.count - off) }
            if n <= 0 { break }                       // EPIPE: parent is gone, nothing more to say
            off += n
        }
    }
    static func log(_ s: String) {
        FileHandle.standardError.write(("audio-tap: " + s + "\n").data(using: .utf8)!)
    }
    /// JSON string literal with escaping.
    static func q(_ s: String) -> String {
        var r = "\""
        for u in s.unicodeScalars {
            switch u {
            case "\"": r += "\\\""
            case "\\": r += "\\\\"
            case "\n": r += "\\n"
            case "\r": r += "\\r"
            case "\t": r += "\\t"
            default:
                if u.value < 0x20 { r += String(format: "\\u%04x", u.value) } else { r.unicodeScalars.append(u) }
            }
        }
        return r + "\""
    }
    static func arr(_ xs: [String]) -> String { "[" + xs.map(q).joined(separator: ",") + "]" }
    static func num(_ d: Double, _ digits: Int) -> String { String(format: "%.\(digits)f", d) }
    static func errorEvent(_ message: String) -> String { #"{"event":"error","message":\#(q(message))}"# }
}

struct TapError: Error, CustomStringConvertible {
    let description: String
    init(_ d: String) { description = d }
}

func fourcc(_ s: OSStatus) -> String {
    let u = UInt32(bitPattern: s)
    let chars = [24, 16, 8, 0].map { Character(UnicodeScalar(UInt8((u >> $0) & 0xff))) }
    let printable = chars.allSatisfy { $0.isASCII && !$0.isWhitespace && $0.asciiValue! >= 0x21 }
    return printable ? "'\(String(chars))'" : String(s)
}

func check(_ status: OSStatus, _ what: String) throws {
    if status != noErr { throw TapError("\(what) failed: \(fourcc(status))") }
}

/// Run `start` (which fires `done` exactly once from any thread) and wait at most `seconds`.
/// Returns nil on timeout — probe and record must never hang on a permission dialog.
final class ResultBox<T>: @unchecked Sendable {
    var value: T?
    let sem = DispatchSemaphore(value: 0)
    private let once = NSLock(); private var fired = false
    func set(_ v: T) { once.lock(); defer { once.unlock() }; if fired { return }; fired = true; value = v; sem.signal() }
}
func awaitBounded<T>(_ seconds: Double, _ start: (ResultBox<T>) -> Void) -> T? {
    let box = ResultBox<T>()
    start(box)
    return box.sem.wait(timeout: .now() + seconds) == .success ? box.value : nil
}

// MARK: - WAV writer (16-bit PCM mono, header patched on finalize)

final class WavWriter: @unchecked Sendable {
    let path: String
    let rate: Int
    private let queue = DispatchQueue(label: "tk.audio-tap.wav")
    private var fp: UnsafeMutablePointer<FILE>?
    private var dataBytes: UInt32 = 0

    init(path: String, rate: Int) throws {
        self.path = path; self.rate = rate
        guard let f = fopen(path, "wb") else { throw TapError("cannot create \(path): \(String(cString: strerror(errno)))") }
        fp = f
        let h = header(dataBytes: 0)
        _ = h.withUnsafeBytes { fwrite($0.baseAddress, 1, $0.count, f) }
    }
    private func header(dataBytes: UInt32) -> [UInt8] {
        var h: [UInt8] = []
        func u32(_ v: UInt32) { for s in [0, 8, 16, 24] { h.append(UInt8((v >> UInt32(s)) & 0xff)) } }
        func u16(_ v: UInt16) { h.append(UInt8(v & 0xff)); h.append(UInt8(v >> 8)) }
        h += Array("RIFF".utf8); u32(36 + dataBytes); h += Array("WAVE".utf8)
        h += Array("fmt ".utf8); u32(16); u16(1) /* PCM */; u16(1) /* mono */
        u32(UInt32(rate)); u32(UInt32(rate * 2)); u16(2); u16(16)
        h += Array("data".utf8); u32(dataBytes)
        return h
    }
    /// Off the audio thread: copy the samples, write on a serial queue.
    func append(_ samples: [Int16]) {
        guard !samples.isEmpty else { return }
        queue.async { [self] in
            guard let f = fp else { return }
            let n = samples.withUnsafeBytes { fwrite($0.baseAddress, 1, $0.count, f) }
            dataBytes &+= UInt32(n)
        }
    }
    func finalize() {
        queue.sync { [self] in
            guard let f = fp else { return }
            fp = nil
            fflush(f); fseek(f, 0, SEEK_SET)
            let h = header(dataBytes: dataBytes)
            _ = h.withUnsafeBytes { fwrite($0.baseAddress, 1, $0.count, f) }
            fclose(f)
        }
    }
    func unlink() { finalize(); Foundation.unlink(path) }
}

// MARK: - Mixdown + resample

/// Linear-interpolating resampler that keeps one sample of history so buffer boundaries are seamless.
struct MonoResampler {
    let srcRate: Double, dstRate: Double
    private var last: Float = 0
    private var pos: Double = 0       // read position in "x[-1] = last, x[0...] = input" index space
    init(srcRate: Double, dstRate: Double) { self.srcRate = srcRate; self.dstRate = dstRate; pos = 0 }
    mutating func process(_ input: [Float]) -> [Int16] {
        let n = input.count
        guard n > 0 else { return [] }
        let step = srcRate / dstRate
        var out: [Int16] = []; out.reserveCapacity(Int(Double(n) / step) + 2)
        var t = pos
        while t < Double(n - 1) || (n == 1 && t < 0) {
            let i = Int(floor(t)); let f = Float(t - Double(i))
            let a = i < 0 ? last : input[i]
            let b = input[min(i + 1, n - 1)]
            let v = max(-1, min(1, a + (b - a) * f))
            out.append(Int16(v * 32767))
            t += step
        }
        pos = t - Double(n)
        last = input[n - 1]
        return out
    }
}

enum SampleKind { case float32, int16, int32 }
func sampleKind(_ asbd: AudioStreamBasicDescription) -> SampleKind? {
    guard asbd.mFormatID == kAudioFormatLinearPCM else { return nil }
    let f = asbd.mFormatFlags
    if f & kAudioFormatFlagIsFloat != 0 { return asbd.mBitsPerChannel == 32 ? .float32 : nil }
    if f & kAudioFormatFlagIsSignedInteger != 0 { return asbd.mBitsPerChannel == 16 ? .int16 : asbd.mBitsPerChannel == 32 ? .int32 : nil }
    return nil
}
/// Sum `channels` interleaved channels of one buffer into `mono` (caller divides by the total).
func accumulate(_ kind: SampleKind, _ data: UnsafeMutableRawPointer, channels: Int, frames: Int, into mono: inout [Float]) {
    switch kind {
    case .float32:
        let p = data.assumingMemoryBound(to: Float.self)
        for i in 0..<frames { var s: Float = 0; for c in 0..<channels { s += p[i * channels + c] }; mono[i] += s }
    case .int16:
        let p = data.assumingMemoryBound(to: Int16.self)
        for i in 0..<frames { var s: Float = 0; for c in 0..<channels { s += Float(p[i * channels + c]) }; mono[i] += s / 32768 }
    case .int32:
        let p = data.assumingMemoryBound(to: Int32.self)
        for i in 0..<frames { var s: Float = 0; for c in 0..<channels { s += Float(p[i * channels + c]) }; mono[i] += s / 2147483648 }
    }
}
/// Mix every buffer/channel of an AudioBufferList (interleaved or planar) down to mono Float32.
func mixdown(_ buffers: [AudioBuffer], asbd: AudioStreamBasicDescription) -> [Float]? {
    guard let kind = sampleKind(asbd) else { return nil }
    let bps = Int(asbd.mBitsPerChannel / 8)
    var totalCh = 0, frames = Int.max
    for b in buffers {
        let ch = max(1, Int(b.mNumberChannels)); totalCh += ch
        frames = min(frames, Int(b.mDataByteSize) / (bps * ch))
    }
    guard totalCh > 0, frames > 0, frames != Int.max else { return nil }
    var mono = [Float](repeating: 0, count: frames)
    for b in buffers { if let d = b.mData { accumulate(kind, d, channels: max(1, Int(b.mNumberChannels)), frames: frames, into: &mono) } }
    let inv = 1 / Float(totalCh)
    for i in 0..<frames { mono[i] *= inv }
    return mono
}

/// One output track: resampler + RMS meter + WAV file. Thread-safe.
final class Track: @unchecked Sendable {
    let name: String
    let writer: WavWriter
    private let lock = NSLock()
    private var resampler: MonoResampler?
    private var sumSq: Double = 0, count = 0
    init(name: String, path: String, rate: Int) throws { self.name = name; writer = try WavWriter(path: path, rate: rate) }
    func ingest(_ mono: [Float], rate: Double) {
        lock.lock(); defer { lock.unlock() }
        if resampler == nil || resampler!.srcRate != rate { resampler = MonoResampler(srcRate: rate, dstRate: Double(writer.rate)) }
        let out = resampler!.process(mono)
        for s in out { let v = Double(s) / 32768; sumSq += v * v }
        count += out.count
        writer.append(out)
    }
    /// RMS since the last call, then reset (the parent's 1 s level meter).
    func takeRMS() -> Double {
        lock.lock(); defer { lock.unlock() }
        let r = count > 0 ? (sumSq / Double(count)).squareRoot() : 0
        sumSq = 0; count = 0
        return r
    }
}

// MARK: - Core Audio property helpers

func caAddress(_ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal) -> AudioObjectPropertyAddress {
    AudioObjectPropertyAddress(mSelector: sel, mScope: scope, mElement: kAudioObjectPropertyElementMain)
}
func caGet<T>(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope = kAudioObjectPropertyScopeGlobal, _ value: inout T) -> OSStatus {
    var addr = caAddress(sel, scope)
    var size = UInt32(MemoryLayout<T>.size)
    return withUnsafeMutablePointer(to: &value) { AudioObjectGetPropertyData(obj, &addr, 0, nil, &size, $0) }
}
func caGetArray<T>(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector, _ scope: AudioObjectPropertyScope) -> [T] {
    var addr = caAddress(sel, scope)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(obj, &addr, 0, nil, &size) == noErr, size > 0 else { return [] }
    let count = Int(size) / MemoryLayout<T>.stride
    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 16); defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(obj, &addr, 0, nil, &size, raw) == noErr else { return [] }
    return Array(UnsafeBufferPointer(start: raw.bindMemory(to: T.self, capacity: count), count: count))
}
func caGetString(_ obj: AudioObjectID, _ sel: AudioObjectPropertySelector) -> String? {
    var cf: Unmanaged<CFString>? = nil
    guard caGet(obj, sel, kAudioObjectPropertyScopeGlobal, &cf) == noErr, let s = cf?.takeRetainedValue() else { return nil }
    return s as String
}
func defaultInputDevice() -> (id: AudioObjectID, uid: String, name: String)? {
    var dev = AudioObjectID(kAudioObjectUnknown)
    guard caGet(AudioObjectID(kAudioObjectSystemObject), kAudioHardwarePropertyDefaultInputDevice, kAudioObjectPropertyScopeGlobal, &dev) == noErr,
          dev != kAudioObjectUnknown, let uid = caGetString(dev, kAudioDevicePropertyDeviceUID) else { return nil }
    return (dev, uid, caGetString(dev, kAudioObjectPropertyName) ?? uid)
}
/// Input-side stream layout of a device as the IOProc will deliver it: one entry per AudioBuffer.
func inputStreamCount(_ dev: AudioObjectID) -> Int {
    var addr = caAddress(kAudioDevicePropertyStreamConfiguration, kAudioObjectPropertyScopeInput)
    var size: UInt32 = 0
    guard AudioObjectGetPropertyDataSize(dev, &addr, 0, nil, &size) == noErr, size > 0 else { return 0 }
    let raw = UnsafeMutableRawPointer.allocate(byteCount: Int(size), alignment: 16); defer { raw.deallocate() }
    guard AudioObjectGetPropertyData(dev, &addr, 0, nil, &size, raw) == noErr else { return 0 }
    return Int(raw.assumingMemoryBound(to: AudioBufferList.self).pointee.mNumberBuffers)
}

// MARK: - Engines

protocol CaptureEngine: AnyObject {
    var name: String { get }
    var hasSystemTrack: Bool { get }
    /// Start delivering audio into the tracks. Throws if this engine cannot run here.
    func start(mic: Track, sys: Track?, rate: Int) throws
    func stop()
}

/// Engine 1: Core Audio process tap + private aggregate device (mic sub-device + tap).
@available(macOS 14.2, *)
final class TapEngine: CaptureEngine, @unchecked Sendable {
    let name = "tap", hasSystemTrack = true
    private var tapID = AudioObjectID(kAudioObjectUnknown)
    private var aggID = AudioObjectID(kAudioObjectUnknown)
    private var procID: AudioDeviceIOProcID?

    func start(mic: Track, sys: Track?, rate: Int) throws {
        guard let input = defaultInputDevice() else { throw TapError("no default input device") }
        let micStreams = inputStreamCount(input.id)

        // 1. The tap: every process's output, mixed to stereo, still audible (.unmuted), private to us.
        let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        desc.name = "TKAudioTap"
        desc.muteBehavior = .unmuted
        desc.isPrivate = true
        try check(AudioHardwareCreateProcessTap(desc, &tapID), "AudioHardwareCreateProcessTap")

        // 2. A private aggregate that carries the mic (sub-device, also the clock) and the tap.
        //    TapAutoStart=1 (per spec) means AudioDeviceStart waits for the first tapped audio —
        //    the IOProc (and so the mic track) only runs once something plays. TK_TAP_AUTOSTART=0
        //    starts the aggregate immediately instead.
        // Default 0: a meeting recorder must capture Karol's opening words before the far side
        // has said anything. TK_TAP_AUTOSTART=1 restores the wait-for-first-audio behaviour.
        let autoStart = ProcessInfo.processInfo.environment["TK_TAP_AUTOSTART"] == "1" ? 1 : 0
        let composition: [String: Any] = [
            kAudioAggregateDeviceNameKey: "TKAudioTap Aggregate",
            kAudioAggregateDeviceUIDKey: "com.tallkarol.audio-tap.agg." + UUID().uuidString,
            kAudioAggregateDeviceMainSubDeviceKey: input.uid,
            kAudioAggregateDeviceIsPrivateKey: 1,
            kAudioAggregateDeviceIsStackedKey: 0,
            kAudioAggregateDeviceTapAutoStartKey: autoStart,
            kAudioAggregateDeviceSubDeviceListKey: [[kAudioSubDeviceUIDKey: input.uid]],
            kAudioAggregateDeviceTapListKey: [[kAudioSubTapUIDKey: desc.uuid.uuidString, kAudioSubTapDriftCompensationKey: 1]],
        ]
        do { try check(AudioHardwareCreateAggregateDevice(composition as CFDictionary, &aggID), "AudioHardwareCreateAggregateDevice") }
        catch { stop(); throw error }

        // 3. Which IOProc buffers are mic and which are tap? The aggregate lists its input streams
        //    sub-devices first (in sub-device-list order), taps last; one AudioBuffer per stream.
        //    Confirm with the per-stream virtual formats (the tap is the stereo one at the end).
        let streams: [AudioStreamID] = caGetArray(aggID, kAudioDevicePropertyStreams, kAudioObjectPropertyScopeInput)
        var formats: [AudioStreamBasicDescription] = []
        for s in streams {
            var f = AudioStreamBasicDescription()
            guard caGet(s, kAudioStreamPropertyVirtualFormat, kAudioObjectPropertyScopeGlobal, &f) == noErr else { stop(); throw TapError("cannot read aggregate stream format") }
            formats.append(f)
        }
        guard formats.count >= 1 else { stop(); throw TapError("aggregate device has no input streams") }
        let micCount = min(micStreams, formats.count - 1)   // leave at least the last stream for the tap
        for (i, f) in formats.enumerated() {
            Out.log("aggregate input stream \(i): \(i < micCount ? "mic" : "tap") \(Int(f.mSampleRate)) Hz x\(f.mChannelsPerFrame) \(sampleKind(f).map { "\($0)" } ?? "unsupported-format")")
        }
        if micStreams == 0 { Out.log("warning: default input device reports no input streams; mic.wav will stay silent") }

        // 4. IOProc on the HAL thread: split buffers by index, mix each to mono, resample, write.
        let err = AudioDeviceCreateIOProcIDWithBlock(&procID, aggID, nil) { _, inData, _, _, _ in
            let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: inData))
            for (i, buf) in abl.enumerated() where i < formats.count {
                guard let track = i < micCount ? mic : sys, let mono = mixdown([buf], asbd: formats[i]) else { continue }
                track.ingest(mono, rate: formats[i].mSampleRate)
            }
        }
        do {
            try check(err, "AudioDeviceCreateIOProcIDWithBlock")
            try check(AudioDeviceStart(aggID, procID), "AudioDeviceStart")
        } catch { stop(); throw error }
        Out.log("tap engine running (aggregate \(aggID), tap \(tapID), autostart=\(autoStart))")
    }

    func stop() {
        if aggID != kAudioObjectUnknown {
            if let p = procID { AudioDeviceStop(aggID, p); AudioDeviceDestroyIOProcID(aggID, p); procID = nil }
            AudioHardwareDestroyAggregateDevice(aggID); aggID = AudioObjectID(kAudioObjectUnknown)
        }
        if tapID != kAudioObjectUnknown { AudioHardwareDestroyProcessTap(tapID); tapID = AudioObjectID(kAudioObjectUnknown) }
    }
}

/// Engine 2: ScreenCaptureKit with system audio + microphone outputs on one stream.
@available(macOS 15.0, *)
final class SCKEngine: NSObject, CaptureEngine, SCStreamOutput, SCStreamDelegate, @unchecked Sendable {
    let name = "sck", hasSystemTrack = true
    private var stream: SCStream?
    private var mic: Track?, sys: Track?
    private let queue = DispatchQueue(label: "tk.audio-tap.sck")
    var onFatal: (@Sendable (String) -> Void)?

    func start(mic: Track, sys: Track?, rate: Int) throws {
        self.mic = mic; self.sys = sys
        let engine = self
        let result: Result<Void, Error>? = awaitBounded(10) { box in
            Task { do { try await engine.setupAndStart(rate: rate); box.set(.success(())) } catch { box.set(.failure(error)) } }
        }
        switch result {
        case .none: stop(); throw TapError("ScreenCaptureKit did not start within 10 s (Screen Recording prompt unanswered?)")
        case .some(.failure(let e)): stop(); throw TapError("ScreenCaptureKit: \(e.localizedDescription)")
        case .some(.success): Out.log("sck engine running")
        }
    }
    private func setupAndStart(rate: Int) async throws {
        let content = try await SCShareableContent.current
        guard let display = content.displays.first else { throw TapError("no display to attach the audio stream to") }
        let cfg = SCStreamConfiguration()
        cfg.capturesAudio = true
        cfg.excludesCurrentProcessAudio = true
        cfg.captureMicrophone = true
        cfg.sampleRate = rate
        cfg.channelCount = 1
        cfg.width = 2; cfg.height = 2                          // video is mandatory; keep it negligible
        cfg.minimumFrameInterval = CMTime(value: 1, timescale: 1)
        cfg.showsCursor = false
        let s = SCStream(filter: SCContentFilter(display: display, excludingWindows: []), configuration: cfg, delegate: self)
        try s.addStreamOutput(self, type: .audio, sampleHandlerQueue: queue)
        try s.addStreamOutput(self, type: .microphone, sampleHandlerQueue: queue)
        stream = s
        try await s.startCapture()
    }
    func stream(_ stream: SCStream, didOutputSampleBuffer sb: CMSampleBuffer, of type: SCStreamOutputType) {
        let track: Track?
        switch type { case .audio: track = sys; case .microphone: track = mic; default: return }   // .screen ignored
        guard let track, CMSampleBufferDataIsReady(sb),
              let fd = CMSampleBufferGetFormatDescription(sb),
              let asbd = CMAudioFormatDescriptionGetStreamBasicDescription(fd)?.pointee else { return }
        var size = 0
        CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sb, bufferListSizeNeededOut: &size, bufferListOut: nil, bufferListSize: 0,
                                                                blockBufferAllocator: nil, blockBufferMemoryAllocator: nil, flags: 0, blockBufferOut: nil)
        guard size > 0 else { return }
        let raw = UnsafeMutableRawPointer.allocate(byteCount: size, alignment: 16); defer { raw.deallocate() }
        let abl = raw.assumingMemoryBound(to: AudioBufferList.self)
        var block: CMBlockBuffer?
        guard CMSampleBufferGetAudioBufferListWithRetainedBlockBuffer(sb, bufferListSizeNeededOut: nil, bufferListOut: abl, bufferListSize: size,
                                                                      blockBufferAllocator: kCFAllocatorDefault, blockBufferMemoryAllocator: kCFAllocatorDefault,
                                                                      flags: kCMSampleBufferFlag_AudioBufferList_Assure16ByteAlignment, blockBufferOut: &block) == noErr else { return }
        let buffers = Array(UnsafeMutableAudioBufferListPointer(abl))
        if let mono = mixdown(buffers, asbd: asbd) { track.ingest(mono, rate: asbd.mSampleRate) }
    }
    func stream(_ stream: SCStream, didStopWithError error: Error) {
        onFatal?("ScreenCaptureKit stream stopped: \(error.localizedDescription)")
    }
    func stop() {
        guard let s = stream else { return }
        stream = nil
        _ = awaitBounded(3) { (box: ResultBox<Bool>) in s.stopCapture { _ in box.set(true) } }
    }
}

/// Engine 3: AVAudioEngine input node tap — mic only.
final class MicEngine: CaptureEngine, @unchecked Sendable {
    let name = "mic", hasSystemTrack = false
    private let engine = AVAudioEngine()
    func start(mic: Track, sys: Track?, rate: Int) throws {
        let input = engine.inputNode
        let fmt = input.outputFormat(forBus: 0)
        guard fmt.sampleRate > 0, fmt.channelCount > 0 else { throw TapError("input node has no format (no input device?)") }
        input.installTap(onBus: 0, bufferSize: 4096, format: fmt) { buf, _ in
            let frames = Int(buf.frameLength)
            guard frames > 0, let asbd = buf.format.streamDescription.pointee as AudioStreamBasicDescription? else { return }
            let abl = UnsafeMutableAudioBufferListPointer(UnsafeMutablePointer(mutating: buf.audioBufferList))
            var buffers = Array(abl)
            // frameLength may be shorter than the buffer's capacity: clamp byte sizes to real frames.
            let bpf = Int(asbd.mBytesPerFrame)
            for i in buffers.indices { buffers[i].mDataByteSize = UInt32(min(Int(buffers[i].mDataByteSize), frames * bpf)) }
            if let mono = mixdown(buffers, asbd: asbd) { mic.ingest(mono, rate: fmt.sampleRate) }
        }
        engine.prepare()
        try engine.start()
        Out.log("mic engine running (\(Int(fmt.sampleRate)) Hz x\(fmt.channelCount))")
    }
    func stop() { engine.inputNode.removeTap(onBus: 0); engine.stop() }
}

/// All engines record the mic, so settle its TCC status up front (bounded: a human may be clicking).
func ensureMicPermission(waitSeconds: Double) throws {
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: return
    case .denied, .restricted: throw TapError("microphone access denied (System Settings › Privacy & Security › Microphone)")
    default:
        if waitSeconds <= 0 {   // TK_MIC_PROMPT_WAIT=0: start now; the OS prompts, mic is silent until allowed
            Out.log("microphone permission not determined; not waiting (mic silent until the prompt is answered)")
            AVCaptureDevice.requestAccess(for: .audio) { _ in }
            return
        }
        Out.log("microphone permission not determined; asking (waiting up to \(Int(waitSeconds)) s)")
        let granted: Bool? = awaitBounded(waitSeconds) { box in AVCaptureDevice.requestAccess(for: .audio) { box.set($0) } }
        guard let granted else { throw TapError("microphone permission prompt not answered within \(Int(waitSeconds)) s") }
        if !granted { throw TapError("microphone access denied") }
    }
}

// MARK: - Recorder (lifecycle, events, shutdown)

final class Recorder: @unchecked Sendable {
    enum State { case starting, running, stopping }
    let dir: String, rate: Int
    let control = DispatchQueue(label: "tk.audio-tap.control")
    private let lock = NSLock()
    private var state = State.starting
    private var engine: CaptureEngine?
    private var mic: Track?, sys: Track?
    private var startedAt = Date()
    private var timer: DispatchSourceTimer?

    init(dir: String, rate: Int) { self.dir = dir; self.rate = rate }

    private var trackNames: [String] { [mic, sys].compactMap { $0?.name } }

    /// Try engines in order (auto = tap → sck → mic); the first that starts wins. Files from a
    /// failed attempt are removed. Takes the mode string, not an array: passing the [String] in
    /// from runRecord crashed at -O (swiftc 6.2.4 read a garbage element on the first iteration
    /// whenever both caller and callee were optimized) — building the list here sidesteps it.
    func start(mode: String) {
        let engines = mode == "auto" ? ["tap", "sck", "mic"] : [mode]
        let promptWait = Double(ProcessInfo.processInfo.environment["TK_MIC_PROMPT_WAIT"] ?? "") ?? 20
        do { try ensureMicPermission(waitSeconds: promptWait) } catch { fail("\(error)") }
        var failures: [String] = []
        for name in engines {
            guard let eng = makeEngine(name) else { failures.append("\(name): unavailable on this macOS"); continue }
            do {
                let m = try Track(name: "mic", path: dir + "/mic.wav", rate: rate)
                let s = eng.hasSystemTrack ? try Track(name: "system", path: dir + "/system.wav", rate: rate) : nil
                lock.lock(); mic = m; sys = s; lock.unlock()
                try eng.start(mic: m, sys: s, rate: rate)
                markRunning(eng)
                return
            } catch {
                Out.log("engine \(name) failed: \(error)")
                failures.append("\(name): \(error)")
                lock.lock(); let m = mic, s = sys; mic = nil; sys = nil; lock.unlock()
                m?.writer.unlink(); s?.writer.unlink()
                if case .stopping = currentState { return }   // a signal arrived mid-start; shutdown owns exit
            }
        }
        fail("no capture engine could start — " + failures.joined(separator: "; "))
    }
    private var currentState: State { lock.lock(); defer { lock.unlock() }; return state }

    private func makeEngine(_ name: String) -> CaptureEngine? {
        switch name {
        case "tap": if #available(macOS 14.2, *) { return TapEngine() } else { return nil }
        case "sck":
            if #available(macOS 15.0, *) {
                let e = SCKEngine()
                e.onFatal = { [weak self] msg in
                    guard let me = self else { return }
                    me.control.async { me.shutdown(reason: msg, fatal: msg) }
                }
                return e
            } else { return nil }
        case "mic": return MicEngine()
        default: return nil
        }
    }

    private func markRunning(_ eng: CaptureEngine) {
        lock.lock()
        guard state == .starting else { lock.unlock(); eng.stop(); return }   // shutdown already underway
        state = .running; engine = eng; startedAt = Date()
        let t = DispatchSource.makeTimerSource(queue: control)
        t.schedule(deadline: .now() + 1, repeating: 1)
        t.setEventHandler { [weak self] in self?.emitLevel() }
        timer = t
        lock.unlock()
        Out.line(#"{"event":"started","engine":\#(Out.q(eng.name)),"tracks":\#(Out.arr(trackNames)),"rate":\#(rate)}"#)
        t.resume()
    }
    private func emitLevel() {
        lock.lock(); let m = mic, s = sys, t0 = startedAt, st = state; lock.unlock()
        guard st == .running, let m else { return }
        let t = Int(Date().timeIntervalSince(t0))
        var line = #"{"event":"level","t":\#(t),"mic":\#(Out.num(m.takeRMS(), 3))"#
        if let s { line += #","sys":\#(Out.num(s.takeRMS(), 3))"# }
        Out.line(line + "}")
    }
    /// Startup failure before anything ran.
    private func fail(_ message: String) -> Never {
        Out.line(Out.errorEvent(message)); exit(1)
    }
    /// The single exit path once tracks exist: stop the engine, patch WAV headers, report, exit.
    func shutdown(reason: String, fatal: String? = nil) {
        lock.lock()
        if state == .stopping { lock.unlock(); return }
        let wasRunning = state == .running
        state = .stopping
        let eng = engine, m = mic, s = sys, t0 = startedAt, tmr = timer
        lock.unlock()
        Out.log("stopping (\(reason))")
        tmr?.cancel()
        eng?.stop()
        m?.writer.finalize(); s?.writer.finalize()
        if let fatal { Out.line(Out.errorEvent(fatal)); exit(1) }
        guard wasRunning else { Out.line(Out.errorEvent("stopped before capture started (\(reason))")); exit(1) }
        let dur = Date().timeIntervalSince(t0)
        Out.line(#"{"event":"stopped","durationSec":\#(Out.num(dur, 1)),"tracks":\#(Out.arr([m, s].compactMap { $0?.name }))}"#)
        exit(0)
    }
}

// MARK: - Commands

func runProbe() -> Never {
    let v = ProcessInfo.processInfo.operatingSystemVersion
    let macos = "\(v.majorVersion).\(v.minorVersion)"

    let mic: String
    switch AVCaptureDevice.authorizationStatus(for: .audio) {
    case .authorized: mic = "ok"
    case .denied, .restricted: mic = "denied"
    default: mic = "undetermined"
    }

    // Tap: can we create (and destroy) a global process tap? noErr → ok. Note: creation succeeds
    // even before the "System Audio Recording Only" grant; the grant is checked when the tap is read.
    var tap = "unavailable"
    if #available(macOS 14.2, *) {
        let desc = CATapDescription(stereoGlobalTapButExcludeProcesses: [])
        desc.name = "TKAudioTap probe"; desc.isPrivate = true
        var id = AudioObjectID(kAudioObjectUnknown)
        let st = AudioHardwareCreateProcessTap(desc, &id)
        if st == noErr { tap = "ok"; AudioHardwareDestroyProcessTap(id) }
        else if st == kAudioHardwareIllegalOperationError { tap = "denied" }   // best guess at a TCC-shaped refusal
        else { Out.log("tap probe: \(fourcc(st))") }
    }

    // SCK: does SCShareableContent.current resolve? -3801 = user declined Screen Recording.
    var sck = "unavailable"
    let r: Result<Void, Error>? = awaitBounded(3) { box in
        Task { do { _ = try await SCShareableContent.current; box.set(.success(())) } catch { box.set(.failure(error)) } }
    }
    switch r {
    case .some(.success): sck = "ok"
    case .some(.failure(let e)):
        let ns = e as NSError
        sck = (ns.domain == SCStreamErrorDomain && ns.code == SCStreamError.Code.userDeclined.rawValue) ? "denied" : "unavailable"
        Out.log("sck probe: \(ns.domain) \(ns.code) \(ns.localizedDescription)")
    case .none: Out.log("sck probe: timed out after 3 s")
    }

    let input = defaultInputDevice().map { Out.q($0.name) } ?? "null"
    Out.line(#"{"event":"probe","macos":\#(Out.q(macos)),"engines":{"tap":\#(Out.q(tap)),"sck":\#(Out.q(sck)),"mic":\#(Out.q(mic))},"defaultInput":\#(input)}"#)
    exit(0)
}

func runRecord(_ args: [String]) -> Never {
    var dir: String?, engine = "auto", rate = 16000
    var i = 0
    while i < args.count {
        switch args[i] {
        case "--dir": i += 1; dir = i < args.count ? args[i] : nil
        case "--engine": i += 1; engine = i < args.count ? args[i] : ""
        case "--rate": i += 1; rate = i < args.count ? Int(args[i]) ?? 0 : 0
        default: Out.line(Out.errorEvent("unknown argument \(args[i])")); exit(2)
        }
        i += 1
    }
    guard let dir else { Out.line(Out.errorEvent("--dir is required")); exit(2) }
    guard rate > 0 else { Out.line(Out.errorEvent("--rate must be a positive integer")); exit(2) }
    guard ["auto", "tap", "sck", "mic"].contains(engine) else { Out.line(Out.errorEvent("--engine must be tap|sck|mic|auto")); exit(2) }
    do { try FileManager.default.createDirectory(atPath: dir, withIntermediateDirectories: true) }
    catch { Out.line(Out.errorEvent("cannot create \(dir): \(error.localizedDescription)")); exit(1) }

    let recorder = Recorder(dir: dir, rate: rate)

    // Signals: ignore the default disposition and route through DispatchSources on the control
    // queue, so a stop works even while the main thread is blocked in an engine start.
    signal(SIGPIPE, SIG_IGN)
    var sources: [DispatchSourceSignal] = []
    for sig in [SIGINT, SIGTERM, SIGHUP] {
        signal(sig, SIG_IGN)
        let src = DispatchSource.makeSignalSource(signal: sig, queue: recorder.control)
        src.setEventHandler { recorder.shutdown(reason: "signal \(sig)") }
        src.resume()
        sources.append(src)
    }
    // Parent-death detection: when stdin is a pipe and it hits EOF, the parent is gone. Skipped
    // for a TTY (a backgrounded read from the terminal would stop us with SIGTTIN).
    if isatty(0) == 0 {
        let t = Thread {
            var buf = [UInt8](repeating: 0, count: 256)
            while true {
                let n = buf.withUnsafeMutableBytes { read(0, $0.baseAddress, 256) }
                if n > 0 { continue }
                if n < 0 && errno == EINTR { continue }
                recorder.control.async { recorder.shutdown(reason: n == 0 ? "stdin EOF" : "stdin error") }
                return
            }
        }
        t.name = "stdin-watch"; t.start()
    }

    recorder.start(mode: engine)
    withExtendedLifetime(sources) { dispatchMain() }
}

let usage = """
audio-tap — Tall Karol meeting audio capture (macOS 14.2+)

  audio-tap probe
      One JSON line: {"event":"probe","macos":..,"engines":{"tap","sck","mic"},"defaultInput":..}
  audio-tap record --dir <dir> [--engine tap|sck|mic|auto] [--rate 16000]
      Records until SIGINT/SIGTERM or stdin EOF, writing <dir>/mic.wav and <dir>/system.wav
      (16 kHz mono 16-bit PCM). stdout: started / level (1 Hz) / stopped / error JSON lines.
  audio-tap --help

Engines: tap = Core Audio process tap + aggregate (needs System Audio Recording + Microphone),
         sck = ScreenCaptureKit (needs Screen Recording + Microphone), mic = microphone only.
Env: TK_TAP_AUTOSTART=1    wait for the first system audio before the tap aggregate starts (default: start immediately).
     TK_MIC_PROMPT_WAIT=N  seconds to wait for an unanswered Microphone prompt (default 20; 0 = start anyway).
"""

let argv = Array(CommandLine.arguments.dropFirst())
switch argv.first {
case "probe": runProbe()
case "record": runRecord(Array(argv.dropFirst()))
case "--help", "-h", "help": print(usage); exit(0)
default:
    FileHandle.standardError.write((usage + "\n").data(using: .utf8)!)
    exit(2)
}
