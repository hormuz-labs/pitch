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
the browser during a take. The host records full-size JPEG frames into a 30fps,
quality-based VP9 master, then source assembly supplies the H.264/AAC editing source.

The host paints a visible arrow and a brief click ring from actual mouse events
into the browser capture. It is installed on existing pages and future documents
and frames. Move/hover/click through browser input; a DOM `element.click()` or
value assignment does not move a mouse. The pointer is hidden until the first
mouse event and stays still while idle. Ref-based click/hover/check and field-entry
tools move the real mouse with eased travel (roughly 0.35–1.1s plus a brief settle)
before activation. Avoid direct DOM clicks or ad-hoc instantaneous mouse jumps.
Check a recorded interaction on each page for a visible
pointer before delivery; successful input is not proof that the overlay painted.
If missing, report a capture failure and use a corrected capture path/retake;
do not keep applying CSS blindly or fabricate a path from saved click positions.
Do not add a second cursor in post-processing. Since the
pointer is in the source pixels, the shared editor's cuts, speed changes and crops
carry it with the UI automatically.

Scroll is part of the demonstration. Capture its complete visible travel and
settling, whether driven by wheel, keyboard or smooth-scroll-to-target. Include
its observed range in the editing handoff so the editor protects it at 1× and
keeps the destination visible. Never describe an instant jump as a recorded scroll.

`pitch demo browser-open [--url <url>]` prepares without recording or altering
an existing take. Keep that browser open while inspecting/debugging. If ending
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
Never rewrite `demo-state.json`/`demo-config.json` timestamps, shorten `endTime`,
move narration earlier, or replace the raw master to make validation accept it.
These timestamps are capture evidence, not edit controls. Preserve the failed take;
recover the complete artifact through the host or prepare a retake with a specific
failure reason. Report missing content if recovery is blocked.

A checkpoint/extraction/transport failure means the operation did not complete.
Retry the same operation once when transient; if it remains blocked, report it.
Do not bypass failed source assembly/preprocessing/verification with a different
render path and publish an unchecked substitute.
