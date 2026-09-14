# Editable video export

Pitch can export a finished video as a portable editing package for Adobe
Premiere Pro, Adobe After Effects, or Blender. The package always preserves the
exact finished render and, for launch films, can also reconstruct a conservative
subset of browser layers as native editable animation.

This document explains the product promise, why editable metadata is captured
before encoding, the package contract, target mappings, security boundaries,
limitations, and how to extend the system.

## Product contract

The export is **fidelity-first and hybrid**:

- The encoded movie is the visual authority.
- The final mixed soundtrack is extracted into one separate WAV track.
- Shot or beat boundaries become editable cuts.
- Supported browser layers become native application layers.
- Unsupported graphics remain available through a baked fallback.
- The package states what is native and what remains baked.

It does not promise lossless conversion of arbitrary HTML, CSS, JavaScript,
GSAP plugins, canvas, WebGL, or 3D into another application's object model.

The export happens after the user finishes a video, but native metadata is
captured during rendering, before the composition is flattened into pixels:

```text
shots.js + browser runtime + assets
                 |
                 +-- sample supported rendered layers --> .layers.json
                 |
                 +-- capture frames --> encode/mux --> MP4
                                                |
                                                +-- package movie, audio,
                                                    cuts, native layers
```

Inferring these objects from the MP4 afterwards would not recover the original
layer boundaries or animation semantics.

## User workflow

The studio export menu offers MP4 plus Premiere Pro, After Effects, and Blender
ZIP packages. Launch films require a current MP4 at the selected resolution. If
the source is newer, the API asks the user to render that MP4 first. Uploaded or
previously rendered videos still produce baked editable timelines, but they do
not have browser-native layer metadata.

The shared API remains:

```http
POST /projects/:id/export
Content-Type: application/json

{ "format": "after-effects", "res": "1080p" }
```

`format` is `premiere`, `after-effects`, or `blender`. Omitting it, or using
`mp4`, keeps the normal video path. Status and cancellation use the existing
`GET /projects/:id/export` and `POST /projects/:id/export/cancel` routes.

## Architecture

### 1. Runtime capture

`.pi/scripts/launch-video/capture.mjs` renders the film in the browser runtime
used for MP4 capture. After `window.__READY`, it discovers conservative native
candidates and samples their rendered state at every output frame.

`.pi/scripts/launch-video/lib/native-layers.mjs` owns discovery, sampling,
validation, and key reduction. It reads computed DOM state rather than
evaluating `shots.js` on the host. Custom factories, nested GSAP timelines,
callbacks, layout, and timeline compression only exist correctly in-browser.

Supported candidates are:

- Leaf text with stable content and typography.
- Local PNG, JPEG, or WebP images.
- 2D position, scale, rotation, and opacity animation.
- Continuous visibility over one in/out range.

Candidates are rejected when they depend on canvas, video, inline SVG, WebGL,
Rive, Lottie, perspective, 3D, skew, masks, clipping, filters, blend modes,
borders, rounded clipping, decorated text, unsupported image fitting, changing
content/style, or discontinuous visibility.

The sampler records frame-indexed keys in stage coordinates and removes only
linearly redundant intermediate keys. Adjacent zero-opacity frames are retained
so fades do not become pops. Native capture is optional: discovery, sampling,
asset hashing, or sidecar creation failures never fail the MP4 render.

### 2. Render-bound sidecars

Each launch render writes:

```text
renders/launch-1080p.mp4
renders/launch-1080p.timeline.json
renders/launch-1080p.layers.json
```

The timeline sidecar contains final shot spans. The layer contract, defined in
`apps/api/src/projects/editable-formats.ts`, includes:

```ts
interface NativeLayerSidecar {
  version: 1
  stage: { width: number; height: number }
  fps: number
  frames: number
  sourceBytes: number
  sourceMtimeMs: number
  sourceSha256: string
  layers: Array<NativeTextLayer | NativeImageLayer>
  warnings: string[]
}
```

Image layers also record the SHA-256 digest of the asset bytes used by the
render. This prevents a changed workspace asset from being packaged against an
older movie.

### 3. Secure package assembly

`apps/api/src/projects/editable-export.ts` selects the active artifact, checks
render freshness, starts the package job, reports status, and handles
cancellation.

`apps/api/src/projects/editable-package.ts` snapshots and probes the movie,
extracts its final audio mix, validates metadata, collects approved assets,
generates target files, and writes the ZIP.

It verifies:

- Workspace containment, regular files, and no symlink traversal.
- Source stability while snapshotting.
- Sidecar-to-snapshot size, mtime, and SHA-256 identity.
- Image asset SHA-256 identity.
- Supported H.264/HEVC CFR, progressive SDR, square-pixel media.
- Bounded streams, dimensions, duration, FPS, audio, paths, keys, and sizes.

Invalid optional native metadata degrades to a baked-only package. One
memory-intensive editable package runs at a time. Cancellation uses
`AbortController`, and partial files are removed.

### 4. Target adapters

`apps/api/src/projects/editable-formats.ts` converts one validated manifest into
the application-specific project file or script:

```text
package.zip
├── README.txt
├── manifest.json
├── project.xml | project.jsx | project.py
├── media/
│   ├── video.mp4
│   └── soundtrack.wav
└── assets/
    └── native-image.webp
```

## Target strategies

### After Effects

The JSX script adds `OPEN ME`, `BAKED`, and `EDITABLE` compositions without
replacing or saving the user's current project. `OPEN ME` enables baked fidelity
by default. The editable comp contains native text and image layers plus a
disabled guide reference.

Mapped properties are text content and best-effort typography, image footage,
position, independent X/Y scale, Z rotation, opacity, in/out points, and linear
frame-accurate keys. Browser font names may not equal After Effects PostScript
names, so the baked composition remains authoritative.

### Premiere Pro

The XMEML contains sibling `BAKED FIDELITY` and `EDITABLE IMAGES` sequences.
The baked sequence has final movie cuts and audio. The second is transparent
and intentionally incomplete, containing supported raster clips and audio.

Mapped properties use Premiere Basic Motion and Opacity: position, uniform
scale, rotation, opacity, timing, and linear keys. Non-uniformly scaled images
and text remain baked because Premiere interchange cannot represent them
reliably.

### Blender

The Python script creates a new scene without deleting existing scenes and uses
the Blender 4.4/5.x Video Sequence Editor API.

- Native text and image strips are on lower channels and muted initially.
- Baked movie strips are higher and enabled initially.
- The soundtrack is added once.
- Users mute baked strips and unmute native strips to edit the reconstruction.

Mapped properties are text content, size, color, horizontal alignment, centered
anchors, raster images, position, independent X/Y scale, rotation, opacity,
timing, and linear keys. This is 2D VSE export; it does not translate Three.js
geometry, cameras, lights, materials, or shaders.

## Why there is always a baked fallback

The launch engine can combine arbitrary project JavaScript and CSS, GSAP
callbacks, SVG morphing, masks, custom easing, motion blur, grading, WebGL, and
cross-shot actors. No automatic translator can map all of that faithfully into
three unrelated editing models.

The fallback guarantees the approved visual render remains available, optional
native extraction can improve over time, and an unsupported layer never breaks
the export. Native alternatives are not composited over the complete movie by
default because that would duplicate reconstructed elements.

## Limits

- Audio is one final mix, not narration/music/SFX stems.
- Native metadata exists only for launch MP4s rendered after this feature.
- Older renders and uploaded videos export as baked timelines.
- Easing is sampled into linear keys rather than translated by name.
- Typography, color management, and media interpretation can differ.
- Premiere receives image motion, not native text.
- Blender export is 2D only.
- Generated files are structurally and API-tested, but this environment cannot
  launch the three desktop applications for import tests.

## Extending the system

1. Expand browser eligibility only when a mapping is deterministic.
2. Add fields to `NativeLayerSidecar` and validate them in the packager.
3. Bind every external asset to the bytes used during rendering.
4. Implement mappings independently in each adapter.
5. Preserve baked fallback behavior for unsupported or failed mappings.
6. Add behavioral tests for capture, validation, package contents, and generated
   application APIs.

Do not parse or evaluate `shots.js` on the server to infer animation. Runtime
DOM sampling is the source of truth.

## Key files

| Concern | File |
|---|---|
| Browser render and sidecars | `.pi/scripts/launch-video/capture.mjs` |
| Candidate discovery and sampling | `.pi/scripts/launch-video/lib/native-layers.mjs` |
| Shot timeline sidecar | `.pi/scripts/launch-video/lib/render-timeline.mjs` |
| Export routing and status | `apps/api/src/projects/export.ts` |
| Editable package lifecycle | `apps/api/src/projects/editable-export.ts` |
| Probe, validation, assets, ZIP | `apps/api/src/projects/editable-package.ts` |
| Manifest and target adapters | `apps/api/src/projects/editable-formats.ts` |
| Studio controls | `apps/web/src/solid/studio/StudioView.tsx` |
| Polling and downloads | `apps/web/src/solid/studio/useProject.ts` |

## Tests

- `tests/native-layers.test.ts`
- `tests/render-timeline.test.ts`
- `tests/editable-package.test.ts`
- `tests/editable-formats.test.ts`
- `tests/editable-export-lifecycle.test.ts`
- `tests/editable-export-client.test.ts`
- `tests/export-dispatch.test.ts`

These cover extraction contracts, key reduction, source and asset identity,
media restrictions, package contents, generated XML/JSX/Python, fallbacks,
concurrency, cancellation, and frontend request behavior.
