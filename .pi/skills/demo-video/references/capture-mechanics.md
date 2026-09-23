# Shared capture mechanics

Read for any new or resumed capture. The [lifecycle](../SKILL.md) owns start,
stop, replacement and delivery; scenario references own what to demonstrate.

## Host browser transport

If PDFs/images are attached, run `pitch demo prepare-assets` before browser-open
or record-start: the host requires their manifest even when an app sequence comes
first. Preparation does not require recording or creating a storyboard.

Use `pitch demo bash --command '<playwright-cli command>'`. It runs on the host,
already attached over CDP to the preparation/recording browser. The VM has no
browser. Never call `playwright-cli open`, close, attach, detach or video controls
yourself; use the demo lifecycle commands.

Shared commands include `snapshot`, `goto <url>` and `press ArrowRight`.
Snapshot after navigation or slide advance. Refs belong to the current page
state; never reuse them across transitions or sessions. There is no Playwright
wait command; a short host `sleep` after navigation can allow settling when needed.
The recorded content viewport is 1920×1080. The VNC desktop is 1960×1240 to
include the toolbar/window frame and the bottom of that viewport. Do not resize
the browser during a take. The host journals full-size timestamped JPEG frames to
disk and makes a lightweight H.264 Matroska master (`recording/demo.mkv`). If live
compression stalls, the complete MJPEG journal becomes that master instead; this
is a valid capture, not a reason to retake. Source assembly accepts either codec
and supplies the H.264/AAC editing source in its existing encode pass.

The host records actual pointer positions, button states, cursor shapes and
page changes in `recording/cursor.json`, on the raw video's first-frame clock.
It observes existing pages and future documents/frames without painting an overlay
into the page. The raw master is intentionally cursorless. `pitch demo source`
composites the white, outlined arrow/hand/I-beam and subtle press treatment with
FFmpeg while assembling narration; the synchronized `source-*.mp4` has the cursor.
Click sounds use actual press timestamps. Missing/incomplete telemetry fails source
assembly; do not replace it with guesses from `clickEvents` or rewrite its clock.

Move/hover/click through real browser input; DOM `element.click()` and value
assignment do not move a mouse. The pointer stays still while idle. Ref-based
click/hover/check and field-entry tools move the real mouse with eased travel
(roughly 0.35–1.1s plus a brief settle) before activation. Avoid instantaneous jumps.
Review a synchronized-source interaction on each page for cursor position, press,
and shape; the live browser and raw master are not the composited deliverable.
Do not inject a second cursor or manufacture paths between clicks. Subsequent
cuts, speed changes and camera crops carry the source's cursor with the UI.

Scroll is part of the demonstration. Capture its complete visible travel and
settling, whether driven by wheel, keyboard or smooth-scroll-to-target. Include
its observed range in the editing handoff so the editor protects it at 1× and
keeps the destination visible. Never describe an instant jump as a recorded scroll.

`pitch demo browser-open [--url <url>]` prepares without recording or altering
an existing take. It is for explicitly unrecorded tasks, not the default first
step of a live walkthrough. Use `record-start --url <url>` and discover the route
inside the take; frozen, silent waiting is handled by the editor afterward.
If an unrecorded browser is needed, keep it open while inspecting/debugging. If ending
a preparation-only turn, use `pitch demo browser-close`. After capture, reopen
for inspection with browser-open, never a throwaway recording.

## Narration timing

`pitch demo narrate --text "<complete thought>"` generates audio first, timestamps
it on the active capture timeline, and returns **without waiting for speech to
finish**. Continue matching interactions during that interval. The live browser
does not play TTS; `pitch demo source` muxes it at the saved timestamps. The next
narration waits for the preceding line, so voices do not overlap.

Use `pitch demo narration-wait` when the subject must remain visible until its
explanation ends, including before clearing a page callout. Do not insert it
before every action; actions illustrating active speech should happen during it.
Record-stop waits for final narration automatically. Speech timing returned by
narrate is a clip boundary, not timing for every word within the clip.

## Recover within the take

A missing/stale ref calls for a fresh snapshot, not a restart. Read the current
state, select the control by its actual label and retry the step once. Verify its
visible outcome. If still blocked, inspect the specific error and report the gap
rather than repeating the attempt or pretending it succeeded. On a hard browser
failure, stop the damaged take and report what could not be recorded.

If snapshots and unrelated actions all fail, or startup reports an internal
binding/transport exception, this is a host/browser failure, not a stale ref.
Stop the take and report the exact error. Do not cycle record-start/browser-open,
try different websites, inspect the CLI installation, or generate more narration
for a browser that cannot act. A fresh snapshot is for a functioning connection.

Use individual host commands and inspect their structured results. An error,
missing target or unchanged page is not success. Never swallow errors, guess the
first button or replay a batch of refs through navigation. Do not wrap snapshots
or single clicks in exploratory scripts with record-start/record-stop or
`finally: record-stop`. Keep the preparation browser or take open during recovery.
If narration fails, recover that beat in the same take; do not assume audio exists.
Preserve the intended words. Do not insert test greetings into a live take or
shorten the script repeatedly to probe a provider failure. Inspect the reported
HTTP/finish reason. Temporary 429/5xx errors already get one bounded host retry;
if the provider remains unavailable, report the missing beat rather than looping.

## Damaged captures and infrastructure failures

An encoder timeout, missing duration, truncated source or audio extending beyond
the video is a failed capture, even if a second stop reports that nothing is running.
New captures save cursor metadata before encoder finalization, and use their
durable frame journal if compression cannot finish. A reported journal fallback
with `capture-status.json` state `complete` is ready for `demo source`; continue
editing it. State `failed` remains an error on repeated stop/source calls.
Never rewrite `demo-state.json`/`demo-config.json`/`cursor.json` timestamps or
`capture-status.json` to bypass a failure, shorten `endTime`,
move narration earlier, or replace the raw master to make validation accept it.
These timestamps are capture evidence, not edit controls. Preserve the failed take;
recover the complete artifact through the host or prepare a retake with a specific
failure reason. Report missing content if recovery is blocked.

A checkpoint/extraction/transport failure means the operation did not complete.
Retry the same operation once when transient; if it remains blocked, report it.
Do not bypass failed source assembly/preprocessing/verification with a different
render path and publish an unchecked substitute.
