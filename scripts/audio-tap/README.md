# audio-tap

Small macOS (14.2+) command-line helper that records a meeting as two files:
`mic.wav` (Karol) and `system.wav` (everyone else, from system audio). Both are
16 kHz mono 16-bit PCM WAV. Built as a tiny app bundle so TCC has a bundle ID
and usage strings to attach the grants to.

```
bash build.sh                                   # → build/TKAudioTap.app/Contents/MacOS/audio-tap
audio-tap probe
audio-tap record --dir <dir> [--engine tap|sck|mic|auto] [--rate 16000]
audio-tap --help
```

## stdout contract (one JSON object per line, nothing else)

`probe` prints one line and exits 0:

```json
{"event":"probe","macos":"15.7","engines":{"tap":"ok|denied|unavailable","sck":"ok|denied|unavailable","mic":"ok|denied|undetermined|unavailable"},"defaultInput":"MacBook Pro Microphone"}
```

`record` runs until SIGINT/SIGTERM **or stdin EOF** (a dead parent ends the
recording; stdin is only watched when it is not a TTY), then patches the WAV
headers and exits 0:

```json
{"event":"started","engine":"tap","tracks":["mic","system"],"rate":16000}
{"event":"level","t":12,"mic":0.031,"sys":0.118}      // every second, RMS 0..1 over the last second
{"event":"stopped","durationSec":47.2,"tracks":["mic","system"]}
{"event":"error","message":"..."}                     // then exit 1
```

With `--engine mic` only `mic.wav` is written and `sys` is omitted from level
lines. A stop that arrives before capture started is reported as an `error`
(exit 1), not a `stopped`. Diagnostics go to stderr.

## Engines

| engine | how | TCC grants | notes |
|---|---|---|---|
| `tap` (preferred) | Core Audio process tap (`CATapDescription` global stereo, unmuted) + private aggregate device holding the default input device and the tap; one IOProc feeds both files | **System Audio Recording Only** + **Microphone** | one clock for both tracks, no Screen Recording nag, no video pipeline |
| `sck` | one `SCStream` with `capturesAudio` + `captureMicrophone` (macOS 15+), 2×2 px @ 1 fps video ignored | **Screen Recording** + **Microphone** | separate clocks per track |
| `mic` | `AVAudioEngine` input tap | **Microphone** | `mic.wav` only |

`auto` (default) tries tap → sck → mic and reports the winner in `started.engine`.

Tap caveats: the aggregate is created with `kAudioAggregateDeviceTapAutoStartKey = 1`,
which per the CoreAudio header means `AudioDeviceStart` waits for the first
tapped audio — until some app plays sound, neither track advances. Set
The aggregate starts immediately by default (`TK_TAP_AUTOSTART=1` waits for the first system audio instead). Also, macOS does not expose the
System Audio Recording grant to a query: `probe` reports `tap: ok` when the tap
*object* can be created; an ungranted tap simply yields silence in `system.wav`
until the user allows it in System Settings › Privacy & Security.

## Signing / TCC

`build.sh` signs ad-hoc (`codesign --sign -`) because this Mac has no signing
identity; set `TK_SIGN_IDENTITY` to use a real one. **Ad-hoc signed means a new
code hash on every rebuild, so macOS forgets the Microphone / System Audio /
Screen Recording answers and prompts again after each build.** TCC attributes a
helper launched from a shell to the *responsible* app (usually the terminal or
the app that spawned it), so the prompt may name that app rather than TKAudioTap.
The prompt cannot be answered from a non-interactive shell; `record` waits at
most 20 s (`TK_MIC_PROMPT_WAIT`, seconds) for the microphone answer and then
exits with an `error` line. `TK_MIC_PROMPT_WAIT=0` starts recording without
waiting — but observed on 15.7: with the prompt still open, the HAL blocks the
engine start itself (no `started` line) until the user answers, so the default
wait is the better contract. Run `probe` first and steer the user to the grant
while `mic` is `undetermined`.
