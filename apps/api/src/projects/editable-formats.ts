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

/** One bus of the soundtrack's mix, as mix.mjs left it: voice, music, effects. */
export interface AudioStem {
  name: string
  /** Workspace-relative file. */
  file: string
  sha256: string
}

/** `<render>.stems.json`: the stems the movie's soundtrack was summed from. */
export interface AudioStemSidecar {
  version: 1
  sourceBytes: number
  sourceMtimeMs: number
  sourceSha256: string
  stems: AudioStem[]
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
  /** The mix's buses on their own tracks; the mixed soundtrack is then kept muted. */
  stems?: Array<{ name: string; file: string; channels: number; sampleRate: number }>
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
to relink video.mp4 to media/video.mp4 and the audio to media/soundtrack.wav and media/stems/.
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
      : format === 'premiere' && manifest.native
        ? `Native Premiere content: the import contains two sibling sequences. “BAKED FIDELITY”
preserves the render; “EDITABLE IMAGES” is a transparent image-only, visibly incomplete
reconstruction. Text, unsupported layers, and images with non-uniform scale are omitted.`
        : format === 'blender' && manifest.native
          ? `Native Blender content: one scene contains the baked movie enabled by default and
muted NATIVE text/image strips beneath it. Mute the baked movie strips and unmute the NATIVE
strips to inspect the transparent, visibly incomplete reconstruction. The soundtrack stays enabled once.`
          : 'Fidelity: baked visuals from the rendered video, with editable cuts; no native DOM layers.'
  const readme = `Pitch editable timeline

Extract the ZIP first and keep the extracted folders together, including media/.
${instructions}
This package is not a native .prproj, .aep or .blend until opened and saved in its application.
The scripts do not automatically save or overwrite files. Choose a new filename when saving.

${fidelity}
${
  manifest.stems?.length
    ? `Audio: ${manifest.stems.map(stem => stem.name).join(', ')} stems sit on their own tracks in media/stems/;
the final mixed soundtrack is included muted, for reference. Together the stems play as the mix
(the mix adds only a final limiter).`
    : 'Audio, when present, is one final mixed soundtrack, not separate stems.'
}
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
      var soundtrack = open.layers.add(sound); soundtrack.name = data.stems ? "Soundtrack (full mix)" : "Soundtrack"; soundtrack.startTime = 0; soundtrack.inPoint = 0; soundtrack.outPoint = duration; soundtrack.audioEnabled = !data.stems;
    }
${AE_STEMS('open')}
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
      soundtrack.name = data.stems ? "Soundtrack (full mix)" : "Soundtrack";
      soundtrack.startTime = 0;
      soundtrack.inPoint = 0;
      soundtrack.outPoint = duration;
      // With stems the mix is the muted reference; the stems play.
      soundtrack.audioEnabled = !data.stems;
    }
${AE_STEMS('comp')}
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
    // The stems play; the mix stays beside them, muted, as the reference.
    const stemmed = Boolean(manifest.stems?.length)
    const sources = [
      ...(manifest.stems ?? []).map(stem => ({
        clip: `stem-${stem.name}-`,
        id: `stem-${stem.name}`,
        name: stem.name.charAt(0).toUpperCase() + stem.name.slice(1),
        file: stem.file,
        channels: stem.channels,
        sampleRate: stem.sampleRate,
        enabled: true,
      })),
      ...(audio
        ? [
            {
              clip: 'audio-',
              id: 'soundtrack',
              name: stemmed ? 'Soundtrack (full mix)' : 'Soundtrack',
              file: audio.file,
              channels: audio.channels,
              sampleRate: audio.sampleRate,
              enabled: !stemmed,
            },
          ]
        : []),
    ]
    const outputs = Math.max(0, ...sources.map(source => source.channels))
    const audioFormat = audio
      ? `<samplecharacteristics><samplerate>${audio.sampleRate}</samplerate></samplecharacteristics>`
      : ''
    // xmeml represents the channels of one source as separate source tracks.
    const audioMedia = (prefix = '') =>
      sources.length
        ? `<audio><format>${audioFormat}</format><outputs><group><index>1</index><numchannels>${outputs}</numchannels><downmix>0</downmix>${Array.from({ length: outputs }, (_, i) => `<channel><index>${i + 1}</index></channel>`).join('')}</group></outputs>${sources
            .flatMap(source =>
              Array.from(
                { length: source.channels },
                (_, i) =>
                  `<track><clipitem id="${prefix}${source.clip}${i}"><name>${xml(source.name)}</name>${source.enabled ? '' : '<enabled>FALSE</enabled>'}<duration>${video.frames}</duration>${rate}<start>0</start><end>${video.frames}</end><in>0</in><out>${video.frames}</out>${i === 0 ? `<file id="${prefix}${source.id}"><name>${xml(source.file.slice(source.file.lastIndexOf('/') + 1))}</name><pathurl>${xml(source.file)}</pathurl><duration>${video.frames}</duration>${rate}<media><audio><samplecharacteristics><samplerate>${source.sampleRate}</samplerate></samplecharacteristics><channelcount>${source.channels}</channelcount></audio></media></file>` : `<file id="${prefix}${source.id}"/>`}<sourcetrack><mediatype>audio</mediatype><trackindex>${i + 1}</trackindex></sourcetrack></clipitem><outputchannelindex>${i + 1}</outputchannelindex></track>`,
              ),
            )
            .join('')}</audio>`
        : ''
    if (manifest.native) {
      const sx = video.width / manifest.native.stage.width
      const sy = video.height / manifest.native.stage.height
      const imageLayers = manifest.native.layers.filter(
        (layer): layer is NativeImageLayer =>
          layer.kind === 'image' && layer.keys.scale.every(([, x, y]) => Math.abs(x - y) <= 0.01),
      )
      const parameter = (id: string, name: string, values: string) =>
        `<parameter authoringApp="PremierePro"><parameterid>${id}</parameterid><name>${name}</name>${values}</parameter>`
      const scalarKeys = (
        values: NativeValueKey[],
        inFrame: number,
        convert: (value: number) => number,
      ) =>
        values
          .map(
            ([frame, value]) =>
              `<keyframe><when>${frame - inFrame}</when><value>${convert(value)}</value><interpolation><name>linear</name></interpolation></keyframe>`,
          )
          .join('')
      const nativeTracks = imageLayers
        .map((layer, i) => {
          const duration = layer.outFrame - layer.inFrame
          const centerKeys = layer.keys.position
            .map(
              ([frame, x, y]) =>
                `<keyframe><when>${frame - layer.inFrame}</when><value><horiz>${(x * sx - video.width / 2) / layer.box.width}</horiz><vert>${(y * sy - video.height / 2) / layer.box.height}</vert></value><interpolation><name>linear</name></interpolation></keyframe>`,
            )
            .join('')
          const scaleKeys = layer.keys.scale.map(([frame, x]) => [frame, x] as NativeValueKey)
          const alpha = /\.(?:png|webp)(?:[?#].*)?$/i.test(layer.asset) ? 'straight' : 'none'
          const effects = `<filter><effect><name>Basic Motion</name><effectid>basic</effectid><effectcategory>motion</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype>${parameter('center', 'Center', centerKeys)}${parameter(
            'scale',
            'Scale',
            scalarKeys(scaleKeys, layer.inFrame, value => value * sx),
          )}${parameter(
            'rotation',
            'Rotation',
            scalarKeys(layer.keys.rotation, layer.inFrame, value => -value),
          )}</effect></filter><filter><effect><name>Opacity</name><effectid>opacity</effectid><effectcategory>opacity</effectcategory><effecttype>motion</effecttype><mediatype>video</mediatype>${parameter(
            'opacity',
            'Opacity',
            scalarKeys(layer.keys.opacity, layer.inFrame, value => value),
          )}</effect></filter>`
          return `<track><clipitem id="native-${i}"><name>${xml(layer.name)}</name><duration>${duration}</duration>${rate}<start>${layer.inFrame}</start><end>${layer.outFrame}</end><in>0</in><out>${duration}</out><stillframe>TRUE</stillframe><alphatype>${alpha}</alphatype><compositemode>normal</compositemode><file id="native-file-${i}"><name>${xml(layer.name)}</name><pathurl>${xml(layer.asset)}</pathurl><duration>${duration}</duration>${rate}<media><video><duration>${duration}</duration><stillframe>TRUE</stillframe><alphatype>${alpha}</alphatype><samplecharacteristics>${rate}<width>${layer.box.width}</width><height>${layer.box.height}</height><anamorphic>FALSE</anamorphic><pixelaspectratio>square</pixelaspectratio><fielddominance>none</fielddominance></samplecharacteristics></video></media></file>${effects}</clipitem></track>`
        })
        .join('')
      const baked = `<sequence id="sequence-baked"><name>${xml(`${manifest.title} — BAKED FIDELITY`)}</name><duration>${video.frames}</duration>${rate}<media><video><format>${sample}</format><track>${clips}</track></video>${audioMedia()}</media></sequence>`
      const editable = `<sequence id="sequence-editable"><name>${xml(`${manifest.title} — EDITABLE IMAGES`)}</name><duration>${video.frames}</duration>${rate}<media><video><format>${sample}</format>${nativeTracks}</video>${audioMedia('native-')}</media></sequence>`
      return {
        'README.txt': readme,
        'project.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5">${baked}${editable}</xmeml>
`,
      }
    }
    return {
      'README.txt': readme,
      'project.xml': `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE xmeml>
<xmeml version="5"><sequence id="sequence"><name>${xml(manifest.title)}</name><duration>${video.frames}</duration>${rate}<media><video><format>${sample}</format><track>${clips}</track></video>${audioMedia()}</media></sequence></xmeml>
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
baked_channel = 1
if data.get("native"):
    import math
    import re
    native = data["native"]
    sx = video["width"] / native["stage"]["width"]
    sy = video["height"] / native["stage"]["height"]
    def css_color(value):
        match = re.fullmatch(r"rgba?\\(\\s*([\\d.]+)\\s*,\\s*([\\d.]+)\\s*,\\s*([\\d.]+)(?:\\s*,\\s*([\\d.]+))?\\s*\\)", value, re.I)
        if match:
            channels = [float(match.group(i)) / 255 for i in range(1, 4)]
            return (*channels, float(match.group(4)) if match.group(4) is not None else 1.0)
        match = re.fullmatch(r"#([0-9a-f]{6})([0-9a-f]{2})?", value, re.I)
        if match:
            rgb = match.group(1)
            return tuple(int(rgb[i:i + 2], 16) / 255 for i in (0, 2, 4)) + ((int(match.group(2), 16) / 255) if match.group(2) else 1.0,)
        return (1.0, 1.0, 1.0, 1.0)
    def native_keys(strip, item, image):
        for frame, x, y in item["keys"]["position"]:
            strip.transform.offset_x = x * sx - video["width"] / 2
            strip.transform.offset_y = video["height"] / 2 - y * sy
            strip.transform.keyframe_insert(data_path="offset_x", frame=frame + 1)
            strip.transform.keyframe_insert(data_path="offset_y", frame=frame + 1)
        for frame, x, y in item["keys"]["scale"]:
            strip.transform.scale_x = x / 100 * (sx if image else 1)
            strip.transform.scale_y = y / 100 * (sy if image else 1)
            strip.transform.keyframe_insert(data_path="scale_x", frame=frame + 1)
            strip.transform.keyframe_insert(data_path="scale_y", frame=frame + 1)
        for frame, value in item["keys"]["rotation"]:
            strip.transform.rotation = math.radians(-value)
            strip.transform.keyframe_insert(data_path="rotation", frame=frame + 1)
        for frame, value in item["keys"]["opacity"]:
            strip.blend_alpha = value / 100
            strip.keyframe_insert(data_path="blend_alpha", frame=frame + 1)
    for index, item in enumerate(native["layers"]):
        start = item["inFrame"] + 1
        duration = item["outFrame"] - item["inFrame"]
        if item["kind"] == "image":
            strip = strips.new_image("NATIVE — " + item["name"], str(root / item["asset"]), channel=index + 1, frame_start=start, fit_method='ORIGINAL')
            strip.frame_final_duration = duration
            strip.frame_final_end = item["outFrame"] + 1
            is_image = True
        else:
            if bpy.app.version >= (5, 0, 0):
                strip = strips.new_effect("NATIVE — " + item["name"], type='TEXT', channel=index + 1, frame_start=start, length=duration)
            else:
                strip = strips.new_effect("NATIVE — " + item["name"], type='TEXT', channel=index + 1, frame_start=start, frame_end=item["outFrame"] + 1)
            strip.text = item["text"]
            strip.location = (0.5, 0.5)
            strip.anchor_x = 'CENTER'
            strip.anchor_y = 'CENTER'
            strip.font_size = item["font"]["size"] * sy
            color = css_color(item["font"]["color"])
            strip.color = (color[0], color[1], color[2], 1.0)
            strip.alignment_x = {"left": "LEFT", "center": "CENTER", "right": "RIGHT"}.get(item["font"]["align"], "LEFT")
            is_image = False
        strip.mute = True
        native_keys(strip, item, is_image)
    animation = getattr(scene, "animation_data", None)
    action = getattr(animation, "action", None) if animation else None
    if action:
        curves = getattr(action, "fcurves", None)
        if curves is None:
            slot = getattr(action, "slots", [None])[0] if getattr(action, "slots", None) else None
            layers = getattr(action, "layers", [])
            layered_strip = layers[0].strips[0] if layers and getattr(layers[0], "strips", None) else None
            bag = layered_strip.channelbag(slot, ensure=False) if slot and layered_strip else None
            curves = getattr(bag, "fcurves", []) if bag else []
        for curve in curves:
            for point in getattr(curve, "keyframe_points", []):
                point.interpolation = 'LINEAR'
    baked_channel = len(native["layers"]) + 2
for cut in data["cuts"]:
    strip = strips.new_movie(cut["label"], str(root / video["file"]), channel=baked_channel, frame_start=1)
    strip.mute = False
    # Frame 1 is source frame 0. Move handles, not the source origin.
    strip.frame_final_start = cut["start"] + 1
    strip.frame_final_end = cut["end"] + 1
stems = data.get("stems") or []
if data["audio"]:
    sound = strips.new_sound("Soundtrack (full mix)" if stems else "Soundtrack", str(root / data["audio"]["file"]), channel=baked_channel + 1, frame_start=1)
    # With stems the mix is the muted reference; the stems play.
    sound.mute = bool(stems)
    sound.frame_final_end = video["frames"] + 1
for index, stem in enumerate(stems):
    strip = strips.new_sound(stem["name"].capitalize(), str(root / stem["file"]), channel=baked_channel + 2 + index, frame_start=1)
    strip.mute = False
    strip.frame_final_end = video["frames"] + 1
if bpy.context.window:
    bpy.context.window.scene = scene
scene.frame_set(1)
`,
  }
}

/** JSX adding each stem as its own audio layer of `comp`, over the whole film. */
const AE_STEMS = (comp: string) => `    if (data.stems) {
      for (var s = 0; s < data.stems.length; s++) {
        var stem = data.stems[s];
        var stemLayer = ${comp}.layers.add(app.project.importFile(new ImportOptions(File(root.fsName + "/" + stem.file))));
        stemLayer.name = stem.name.charAt(0).toUpperCase() + stem.name.slice(1);
        stemLayer.startTime = 0; stemLayer.inPoint = 0; stemLayer.outPoint = duration; stemLayer.audioEnabled = true;
      }
    }`

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
