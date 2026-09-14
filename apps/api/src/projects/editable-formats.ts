export type EditableFormat = 'premiere' | 'after-effects' | 'blender'

export type NativePositionKey = [frame: number, x: number, y: number]
export type NativeScaleKey = [frame: number, x: number, y: number]
export type NativeValueKey = [frame: number, value: number]

export interface NativeLayerKeys {
  position: NativePositionKey[]
  scale: NativeScaleKey[]
  rotation: NativeValueKey[]
  opacity: NativeValueKey[]
}

export interface NativeLayerBase {
  id: string
  name: string
  shotId: string
  box: { width: number; height: number }
  inFrame: number
  outFrame: number
  keys: NativeLayerKeys
  warnings: string[]
}

export interface NativeTextLayer extends NativeLayerBase {
  kind: 'text'
  text: string
  font: {
    family: string
    style: string
    weight: string
    size: number
    lineHeight: number
    tracking: number
    color: string
    align: string
  }
}

export interface NativeImageLayer extends NativeLayerBase {
  kind: 'image'
  asset: string
  assetSha256: string
}

export type NativeLayer = NativeTextLayer | NativeImageLayer

export interface NativeLayerSidecar {
  version: 1
  stage: { width: number; height: number }
  fps: number
  frames: number
  sourceBytes: number
  sourceMtimeMs: number
  sourceSha256: string
  layers: NativeLayer[]
  warnings: string[]
}

export interface EditableManifest {
  version: 1
  title: string
  video: {
    file: string
    width: number
    height: number
    fps: { num: number; den: number }
    frames: number
  }
  audio: { file: string; channels: number; sampleRate: number } | null
  cuts: Array<{ label: string; start: number; end: number }>
  warnings: string[]
  native?: {
    stage: { width: number; height: number }
    layers: NativeLayer[]
    warnings: string[]
  }
}

export function projectFiles(
  format: EditableFormat,
  manifest: EditableManifest,
): Record<string, string> {
  const { video, audio } = manifest
  const cuts = manifest.cuts.length
    ? manifest.cuts
    : [{ label: manifest.title, start: 0, end: video.frames }]
  const fps = video.fps.num / video.fps.den
  const instructions = {
    premiere: `Premiere Pro: File > Import, select project.xml, then open the imported sequence.
The XML uses package-relative media references. If media is offline, use Link Media
to relink video.mp4 to media/video.mp4 and soundtrack.wav to media/soundtrack.wav.
Relative path resolution varies by importer; relinking may be required.
The soundtrack's channels appear on separate tracks, each routed once.
Use File > Save As to choose a new .prproj file.`,
    'after-effects': `After Effects: open a project, then File > Scripts > Run Script File and select project.jsx.
The script adds a composition and footage to the current project without replacing it.
Media is resolved relative to the JSX file, not the current project.
Movie layers are muted; the separate soundtrack is added once if present.
Use File > Save As to choose a new .aep file.`,
    blender: `Blender 4.4+/5: in the Scripting workspace, use Text > Open to open project.py,
then Text > Run Script. Open the extracted file rather than pasting into an unsaved text.
The script creates and selects a new scene without deleting existing scenes.
Switch an editor to Video Sequencer to inspect the cuts. The timeline starts at frame 1.
Standard display transform is used rather than AgX.
Use File > Save As to choose a new .blend file in the extracted folder.
Enable Relative Remap when saving; if you move the package later, use
File > External Data > Find Missing Files to locate its media folder.`,
  }[format]
  const fidelity =
    format === 'after-effects' && manifest.native
      ? `Native After Effects content: ${manifest.native.layers.length} supported editable layers.
Open the “OPEN ME” composition. “BAKED FIDELITY” is enabled by default; disable it and enable
“EDITABLE NATIVE” to inspect the transparent, visibly incomplete native reconstruction.
Unsupported effects remain only in the baked mode. Font family assignment is best effort;
font weight and style cannot be reproduced exactly, and missing fonts fall back in After Effects.`
      : 'Fidelity: baked visuals from the rendered video, with editable cuts; no native DOM layers.'
  const readme = `Pitch editable timeline

Extract the ZIP first and keep the extracted folders together, including media/.
${instructions}
This package is not a native .prproj, .aep or .blend until opened and saved in its application.
The scripts do not automatically save or overwrite files. Choose a new filename when saving.

${fidelity}
Audio, when present, is one final mixed soundtrack, not separate stems.
Cuts derived from markers may be beat boundaries rather than visual scene changes.
Source and sequence frame coordinates match; ends are exclusive.
Color management, media interpretation and display settings can change the appearance.
Compare against media/video.mp4 before delivery; no native application verification is claimed.

Warnings:
${manifest.warnings.length ? manifest.warnings.map(w => `- ${w}`).join('\n') : 'None.'}
`
  if (format === 'after-effects') {
    if (manifest.native) {
      const aeLayers = manifest.native.layers.map(layer => {
        if (layer.kind !== 'text') return layer
        const color = parseColor(layer.font.color)
        return {
          ...layer,
          font: {
            ...layer.font,
            family: firstFontFamily(layer.font.family),
            tracking: (layer.font.tracking / layer.font.size) * 1000,
          },
          ...(color ? { aeColor: color.rgb } : {}),
        }
      })
      const data = JSON.stringify({
        ...manifest,
        native: { ...manifest.native, layers: aeLayers },
        cuts,
      })
        .replace(/\u2028/g, '\\u2028')
        .replace(/\u2029/g, '\\u2029')
      return {
        'README.txt': readme,
        'project.jsx': `(function () {
  var data = ${data};
  var root = File($.fileName).parent;
  var fps = data.video.fps.num / data.video.fps.den;
  var duration = data.video.frames / fps;
  var sx = data.video.width / data.native.stage.width;
  var sy = data.video.height / data.native.stage.height;
  function transform(layer) { return layer.property("ADBE Transform Group"); }
  function keys(property, values, convert) {
    var times = [], output = [];
    for (var i = 0; i < values.length; i++) {
      times.push(values[i][0] / fps);
      output.push(convert(values[i]));
    }
    property.setValuesAtTimes(times, output);
    if (typeof KeyframeInterpolationType !== "undefined" && property.setInterpolationTypeAtKey) {
      for (var k = 1; k <= values.length; k++) property.setInterpolationTypeAtKey(k, KeyframeInterpolationType.LINEAR, KeyframeInterpolationType.LINEAR);
    }
  }
  app.beginUndoGroup("Import Pitch native timeline");
  try {
    var movie = app.project.importFile(new ImportOptions(File(root.fsName + "/" + data.video.file)));
    movie.mainSource.conformFrameRate = fps;
    var baked = app.project.items.addComp(data.title + " — BAKED", data.video.width, data.video.height, 1, duration, fps);
    baked.displayStartTime = 0;
    for (var b = 0; b < data.cuts.length; b++) {
      var bakedCut = data.cuts[b];
      var bakedMovie = baked.layers.add(movie);
      bakedMovie.name = bakedCut.label;
      bakedMovie.startTime = 0; bakedMovie.inPoint = bakedCut.start / fps; bakedMovie.outPoint = bakedCut.end / fps; bakedMovie.audioEnabled = false;
    }
    var sound = data.audio ? app.project.importFile(new ImportOptions(File(root.fsName + "/" + data.audio.file))) : null;
    var open = app.project.items.addComp(data.title + " — OPEN ME", data.video.width, data.video.height, 1, duration, fps);
    open.displayStartTime = 0;
    var bakedMode = open.layers.add(baked); bakedMode.name = "[MODE] BAKED FIDELITY"; bakedMode.audioEnabled = false; bakedMode.enabled = true;
    if (sound) {
      var soundtrack = open.layers.add(sound); soundtrack.name = "Soundtrack"; soundtrack.startTime = 0; soundtrack.inPoint = 0; soundtrack.outPoint = duration; soundtrack.audioEnabled = true;
    }
    try {
      var editable = app.project.items.addComp(data.title + " — EDITABLE", data.video.width, data.video.height, 1, duration, fps);
      editable.displayStartTime = 0;
      var images = {}, skippedImages = 0;
      for (var a = 0; a < data.native.layers.length; a++) {
        var candidate = data.native.layers[a];
        if (candidate.kind === "image" && !images[candidate.asset]) {
          try { images[candidate.asset] = app.project.importFile(new ImportOptions(File(root.fsName + "/" + candidate.asset))); }
          catch (_imageImportError) { skippedImages++; }
        }
      }
      editable.comment = "Transparent and incomplete native reconstruction. Compare with the disabled guide reference." + (skippedImages ? " Some native images could not be imported and were skipped." : "");
      for (var i = 0; i < data.native.layers.length; i++) {
        var item = data.native.layers[i], layer;
        if (item.kind === "text") {
          layer = editable.layers.addBoxText([item.box.width * sx, item.box.height * sy]);
          try {
            var document = new TextDocument(item.text);
            try { document.font = item.font.family; } catch (_missingFont) {}
            document.fontSize = item.font.size * sy;
            document.leading = item.font.lineHeight * sy;
            document.tracking = item.font.tracking;
            if (item.aeColor) document.fillColor = item.aeColor;
            if (typeof ParagraphJustification !== "undefined") {
              if (item.font.align === "center") document.justification = ParagraphJustification.CENTER_JUSTIFY;
              else if (item.font.align === "right") document.justification = ParagraphJustification.RIGHT_JUSTIFY;
              else if (ParagraphJustification.LEFT_JUSTIFY !== undefined) document.justification = ParagraphJustification.LEFT_JUSTIFY;
            }
            layer.property("ADBE Text Properties").property("ADBE Text Document").setValue(document);
          } catch (_fontError) {}
          transform(layer).property("ADBE Anchor Point").setValue([item.box.width * sx / 2, item.box.height * sy / 2]);
        } else {
          if (!images[item.asset]) continue;
          layer = editable.layers.add(images[item.asset]);
          transform(layer).property("ADBE Anchor Point").setValue([item.box.width / 2, item.box.height / 2]);
        }
        layer.name = item.name;
        layer.inPoint = item.inFrame / fps; layer.outPoint = item.outFrame / fps; layer.audioEnabled = false;
        keys(transform(layer).property("ADBE Position"), item.keys.position, function (v) { return [v[1] * sx, v[2] * sy]; });
        keys(transform(layer).property("ADBE Scale"), item.keys.scale, item.kind === "image" ? function (v) { return [v[1] * sx, v[2] * sy]; } : function (v) { return [v[1], v[2]]; });
        keys(transform(layer).property("ADBE Rotate Z"), item.keys.rotation, function (v) { return v[1]; });
        keys(transform(layer).property("ADBE Opacity"), item.keys.opacity, function (v) { return v[1]; });
      }
      var reference = editable.layers.add(movie);
      reference.name = "[REFERENCE] Full render"; reference.startTime = 0; reference.inPoint = 0; reference.outPoint = duration;
      reference.audioEnabled = false; reference.enabled = false; reference.guideLayer = true; reference.locked = true;
      var nativeMode = open.layers.add(editable); nativeMode.name = "[MODE] EDITABLE NATIVE"; nativeMode.audioEnabled = false; nativeMode.enabled = false;
    } catch (_nativeBuildError) {
      // The baked composition remains usable when optional native reconstruction fails.
    }
    open.openInViewer();
  } finally { app.endUndoGroup(); }
}());
`,
      }
    }
    return {
      'README.txt': readme,
      'project.jsx': `(function () {
  var data = ${JSON.stringify({ ...manifest, cuts })
    .replace(/\u2028/g, '\\u2028')
    .replace(/\u2029/g, '\\u2029')};
  var root = File($.fileName).parent;
  var fps = data.video.fps.num / data.video.fps.den;
  var duration = data.video.frames / fps;
  app.beginUndoGroup("Import Pitch timeline");
  try {
    var movie = app.project.importFile(new ImportOptions(File(root.fsName + "/" + data.video.file)));
    movie.mainSource.conformFrameRate = fps;
    var comp = app.project.items.addComp(data.title, data.video.width, data.video.height, 1, duration, fps);
    comp.displayStartTime = 0;
    for (var i = 0; i < data.cuts.length; i++) {
      var cut = data.cuts[i];
      var layer = comp.layers.add(movie);
      layer.name = cut.label;
      // Source and composition coordinates match: trim, do not shift the source.
      layer.startTime = 0;
      layer.inPoint = cut.start / fps;
      layer.outPoint = cut.end / fps;
      layer.audioEnabled = false;
    }
    if (data.audio) {
      var sound = app.project.importFile(new ImportOptions(File(root.fsName + "/" + data.audio.file)));
      var soundtrack = comp.layers.add(sound);
      soundtrack.name = "Soundtrack";
      soundtrack.startTime = 0;
      soundtrack.inPoint = 0;
      soundtrack.outPoint = duration;
      soundtrack.audioEnabled = true;
    }
    comp.openInViewer();
  } finally {
    app.endUndoGroup();
  }
}());
`,
    }
  }
  if (format === 'premiere') {
    const xml = (value: string) =>
      value.replace(/[^\t\n\r\u0020-\ud7ff\ue000-\ufffd\u{10000}-\u{10ffff}]/gu, '').replace(
        /[&<>"'\r]/g,
        c =>
          ({
            '&': '&amp;',
            '<': '&lt;',
            '>': '&gt;',
            '"': '&quot;',
            "'": '&apos;',
            '\r': '&#13;',
          })[c]!,
      )
    const timebase = Math.round(fps)
    const ntsc = Math.abs(fps - (timebase * 1000) / 1001) < 1e-8
    if (!Number.isInteger(fps) && !ntsc) {
      throw new Error(`Frame rate ${video.fps.num}/${video.fps.den} cannot be represented by xmeml`)
    }
    const rate = `<rate><timebase>${timebase}</timebase><ntsc>${ntsc ? 'TRUE' : 'FALSE'}</ntsc></rate>`
    const sample = `<samplecharacteristics>${rate}<width>${video.width}</width><height>${video.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics>`
    const clips = cuts
      .map(
        (cut, i) =>
          `<clipitem id="video-${i}"><name>${xml(cut.label)}</name><duration>${cut.end - cut.start}</duration>${rate}<start>${cut.start}</start><end>${cut.end}</end><in>${cut.start}</in><out>${cut.end}</out>${i === 0 ? `<file id="video"><name>video.mp4</name><pathurl>${xml(video.file)}</pathurl><duration>${video.frames}</duration>${rate}<media><video>${sample}</video></media></file>` : '<file id="video"/>'}</clipitem>`,
      )
      .join('')
    const audioSample = audio
      ? `<samplecharacteristics><samplerate>${audio.sampleRate}</samplerate></samplecharacteristics>`
      : ''
    // xmeml represents the channels of one mixed soundtrack as separate source tracks.
    const audioTracks = audio
      ? Array.from(
          { length: audio.channels },
          (_, i) =>
            `<track><clipitem id="audio-${i}"><name>Soundtrack</name><duration>${video.frames}</duration>${rate}<start>0</start><end>${video.frames}</end><in>0</in><out>${video.frames}</out>${i === 0 ? `<file id="soundtrack"><name>soundtrack.wav</name><pathurl>${xml(audio.file)}</pathurl><duration>${video.frames}</duration>${rate}<media><audio>${audioSample}<channelcount>${audio.channels}</channelcount></audio></media></file>` : '<file id="soundtrack"/>'}<sourcetrack><mediatype>audio</mediatype><trackindex>${i + 1}</trackindex></sourcetrack></clipitem><outputchannelindex>${i + 1}</outputchannelindex></track>`,
        ).join('')
      : ''
    const audioMedia = audio
      ? `<audio><format>${audioSample}</format><outputs><group><index>1</index><numchannels>${audio.channels}</numchannels><downmix>0</downmix>${Array.from({ length: audio.channels }, (_, i) => `<channel><index>${i + 1}</index></channel>`).join('')}</group></outputs>${audioTracks}</audio>`
      : ''
    return {
      'README.txt': readme,
      'project.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5"><sequence id="sequence"><name>${xml(manifest.title)}</name><duration>${video.frames}</duration>${rate}<media><video><format>${sample}</format><track>${clips}</track></video>${audioMedia}</media></sequence></xmeml>
`,
    }
  }
  return {
    'README.txt': readme,
    'project.py': `import bpy
import json
from pathlib import Path

data = json.loads(${JSON.stringify(JSON.stringify({ ...manifest, cuts }))})
script_path = globals().get("__file__")
if not script_path:
    text = getattr(bpy.context.space_data, "text", None)
    script_path = text.filepath if text else None
if not script_path:
    raise RuntimeError("Open the extracted project.py in Blender's Text Editor, then Run Script.")
root = Path(bpy.path.abspath(script_path)).resolve().parent
video = data["video"]
scene = bpy.data.scenes.new(data["title"])
scene.render.resolution_x = video["width"]
scene.render.resolution_y = video["height"]
scene.render.resolution_percentage = 100
scene.render.fps = round(video["fps"]["num"] / video["fps"]["den"])
scene.render.fps_base = scene.render.fps * video["fps"]["den"] / video["fps"]["num"]
scene.frame_start = 1
scene.frame_end = video["frames"]
scene.display_settings.display_device = "sRGB"
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0
scene.view_settings.gamma = 1
strips = scene.sequence_editor_create().strips
for cut in data["cuts"]:
    strip = strips.new_movie(cut["label"], str(root / video["file"]), channel=1, frame_start=1)
    # Frame 1 is source frame 0. Move handles, not the source origin.
    strip.frame_final_start = cut["start"] + 1
    strip.frame_final_end = cut["end"] + 1
if data["audio"]:
    sound = strips.new_sound("Soundtrack", str(root / data["audio"]["file"]), channel=2, frame_start=1)
    sound.frame_final_end = video["frames"] + 1
if bpy.context.window:
    bpy.context.window.scene = scene
scene.frame_set(1)
`,
  }
}

function firstFontFamily(value: string): string {
  return value
    .split(',')[0]
    .trim()
    .replace(/^(['"])(.*)\1$/, '$2')
}

function parseColor(value: string): { rgb: [number, number, number] } | undefined {
  const rgb = /^rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)$/i.exec(
    value,
  )
  if (rgb) {
    const channels = rgb.slice(1, 4).map(Number)
    if (
      channels.every(channel => Number.isFinite(channel) && channel >= 0 && channel <= 255) &&
      (rgb[4] === undefined || finiteAlpha(rgb[4]))
    )
      return {
        rgb: channels.map(channel => channel / 255) as [number, number, number],
      }
  }
  const hex = /^#([\da-f]{6})([\da-f]{2})?$/i.exec(value)
  if (hex) {
    return {
      rgb: [0, 2, 4].map(offset => Number.parseInt(hex[1].slice(offset, offset + 2), 16) / 255) as [
        number,
        number,
        number,
      ],
    }
  }
  return undefined
}

function finiteAlpha(value: string): boolean {
  const alpha = Number(value)
  return Number.isFinite(alpha) && alpha >= 0 && alpha <= 1
}
