import { execFileSync } from 'node:child_process'
import { runInNewContext } from 'node:vm'
import { expect, it, vi } from 'vitest'
import { type EditableManifest, projectFiles } from '../apps/api/src/projects/editable-formats.js'

const manifest: EditableManifest = {
  version: 1,
  title: 'Film <&> "title"',
  video: {
    file: 'media/video.mp4',
    width: 1920,
    height: 1080,
    fps: { num: 30000, den: 1001 },
    frames: 90,
  },
  audio: null,
  cuts: [
    { label: 'First <&> "cut"', start: 0, end: 30 },
    { label: 'Second', start: 30, end: 90 },
  ],
  warnings: [],
}

function xmlTree(xml: string) {
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import json, sys, xml.etree.ElementTree as ET
def tree(e):
    return dict(tag=e.tag, attrs=e.attrib, text=e.text or '', children=[tree(c) for c in e])
print(json.dumps(tree(ET.fromstring(sys.stdin.read()))))
`,
      ],
      { input: xml, encoding: 'utf8' },
    ),
  ) as XmlNode
}

type XmlNode = { tag: string; attrs: Record<string, string>; text: string; children: XmlNode[] }
function nodes(node: XmlNode, path: string): XmlNode[] {
  return path
    .split('/')
    .reduce((parents, tag) => parents.flatMap(p => p.children.filter(c => c.tag === tag)), [node])
}
function text(node: XmlNode, path: string) {
  return nodes(node, path)[0]?.text
}

it('exports a Premiere xmeml v5 sequence with escaped names and matching source/sequence cuts', () => {
  const root = xmlTree(projectFiles('premiere', manifest)['project.xml'])
  expect(root.tag).toBe('xmeml')
  expect(root.attrs.version).toBe('5')
  const sequence = nodes(root, 'sequence')[0]
  expect(text(sequence, 'name')).toBe(manifest.title)
  expect(text(sequence, 'duration')).toBe('90')
  expect(text(sequence, 'rate/timebase')).toBe('30')
  expect(text(sequence, 'rate/ntsc')).toBe('TRUE')
  const sample = nodes(sequence, 'media/video/format/samplecharacteristics')[0]
  expect(text(sample, 'width')).toBe('1920')
  expect(text(sample, 'height')).toBe('1080')
  expect(text(sample, 'pixelaspectratio')).toBe('square')
  expect(text(sample, 'fielddominance')).toBe('none')
  const clips = nodes(sequence, 'media/video/track/clipitem')
  expect(clips).toHaveLength(2)
  clips.forEach((clip, i) => {
    const cut = manifest.cuts[i]
    expect(text(clip, 'name')).toBe(cut.label)
    expect(['start', 'end', 'in', 'out'].map(p => Number(text(clip, p)))).toEqual([
      cut.start,
      cut.end,
      cut.start,
      cut.end,
    ])
    expect(text(clip, 'duration')).toBe(String(cut.end - cut.start))
    expect(text(clip, 'rate/timebase')).toBe('30')
  })
  expect(text(clips[0], 'file/pathurl')).toBe('media/video.mp4')
  expect(text(clips[0], 'file/media/video/samplecharacteristics/width')).toBe('1920')
  expect(nodes(sequence, 'media/audio/track/clipitem')).toHaveLength(0)
})

it('routes each soundtrack channel once across the entire Premiere sequence without movie audio', () => {
  const withAudio = {
    ...manifest,
    audio: { file: 'media/soundtrack.wav', channels: 2, sampleRate: 48000 },
  }
  const sequence = nodes(xmlTree(projectFiles('premiere', withAudio)['project.xml']), 'sequence')[0]
  const tracks = nodes(sequence, 'media/audio/track')
  expect(tracks).toHaveLength(2)
  tracks.forEach((track, i) => {
    const clips = nodes(track, 'clipitem')
    expect(clips).toHaveLength(1)
    expect(['start', 'end', 'in', 'out'].map(p => Number(text(clips[0], p)))).toEqual([
      0, 90, 0, 90,
    ])
    expect(text(clips[0], 'sourcetrack/mediatype')).toBe('audio')
    expect(text(clips[0], 'sourcetrack/trackindex')).toBe(String(i + 1))
    expect(text(track, 'outputchannelindex')).toBe(String(i + 1))
    expect(nodes(clips[0], 'file')[0].attrs.id).toBe('soundtrack')
  })
  const file = nodes(tracks[0], 'clipitem/file')[0]
  expect(text(file, 'pathurl')).toBe('media/soundtrack.wav')
  expect(text(file, 'media/audio/channelcount')).toBe('2')
  expect(text(file, 'media/audio/samplecharacteristics/samplerate')).toBe('48000')
  expect(nodes(sequence, 'media/video/track/clipitem/file/media/audio')).toHaveLength(0)
})

it('adds a sibling Premiere sequence containing only uniformly scaled native images', () => {
  const input: EditableManifest = {
    ...manifest,
    audio: { file: 'media/soundtrack.wav', channels: 1, sampleRate: 48000 },
    native: {
      stage: { width: 960, height: 540 },
      warnings: ['Glow remains baked.'],
      layers: [
        {
          id: 'logo </clipitem>',
          name: 'Logo <&>',
          shotId: 'hero',
          kind: 'image',
          asset: 'assets/logo.png?x=1&y=2',
          assetSha256: 'a'.repeat(64),
          box: { width: 200, height: 100 },
          inFrame: 3,
          outFrame: 30,
          keys: {
            position: [
              [3, 480, 270],
              [9, 720, 135],
            ],
            scale: [
              [3, 50, 50],
              [9, 75, 75],
            ],
            rotation: [[3, 10]],
            opacity: [[3, 80]],
          },
          warnings: [],
        },
        {
          id: 'photo',
          name: 'Photo',
          shotId: 'hero',
          kind: 'image',
          asset: 'assets/photo.jpg',
          assetSha256: 'b'.repeat(64),
          box: { width: 400, height: 200 },
          inFrame: 30,
          outFrame: 90,
          keys: {
            position: [[30, 240, 135]],
            scale: [[30, 100, 100.005]],
            rotation: [[30, -5]],
            opacity: [[30, 100]],
          },
          warnings: [],
        },
        {
          id: 'stretched',
          name: 'Stretched image',
          shotId: 'hero',
          kind: 'image',
          asset: 'assets/stretched.webp',
          assetSha256: 'c'.repeat(64),
          box: { width: 100, height: 100 },
          inFrame: 0,
          outFrame: 90,
          keys: {
            position: [[0, 100, 100]],
            scale: [[0, 100, 101]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
        {
          id: 'title',
          name: 'Text is unsupported',
          shotId: 'hero',
          kind: 'text',
          text: 'Hello',
          box: { width: 200, height: 50 },
          inFrame: 0,
          outFrame: 90,
          font: {
            family: 'Arial',
            style: 'normal',
            weight: '400',
            size: 20,
            lineHeight: 24,
            tracking: 0,
            color: '#ffffff',
            align: 'left',
          },
          keys: {
            position: [[0, 100, 100]],
            scale: [[0, 100, 100]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
      ],
    },
  }

  const root = xmlTree(projectFiles('premiere', input)['project.xml'])
  const sequences = nodes(root, 'sequence')
  expect(sequences.map(sequence => text(sequence, 'name'))).toEqual([
    `${input.title} — BAKED FIDELITY`,
    `${input.title} — EDITABLE IMAGES`,
  ])
  expect(nodes(sequences[0], 'media/video/track/clipitem')).toHaveLength(2)
  expect(nodes(sequences[0], 'media/audio/track/clipitem')).toHaveLength(1)

  const tracks = nodes(sequences[1], 'media/video/track')
  expect(tracks).toHaveLength(2)
  const nativeClips = tracks.map(track => nodes(track, 'clipitem')[0])
  expect(nativeClips.map(clip => text(clip, 'name'))).toEqual(['Logo <&>', 'Photo'])
  expect(nativeClips.map(clip => clip.attrs.id)).toEqual(['native-0', 'native-1'])
  expect(['duration', 'start', 'end', 'in', 'out'].map(path => text(nativeClips[0], path))).toEqual(
    ['27', '3', '30', '0', '27'],
  )
  expect(text(nativeClips[0], 'file/pathurl')).toBe('assets/logo.png?x=1&y=2')
  expect(text(nativeClips[0], 'stillframe')).toBe('TRUE')
  expect(text(nativeClips[0], 'alphatype')).toBe('straight')
  expect(text(nativeClips[0], 'file/media/video/stillframe')).toBe('TRUE')
  expect(text(nativeClips[0], 'file/media/video/alphatype')).toBe('straight')
  expect(text(nativeClips[1], 'file/media/video/alphatype')).toBe('none')

  const effects = nodes(nativeClips[0], 'filter/effect')
  expect(effects.map(effect => text(effect, 'effectid'))).toEqual(['basic', 'opacity'])
  const basicParameters = nodes(effects[0], 'parameter')
  expect(basicParameters.map(parameter => text(parameter, 'parameterid'))).toEqual([
    'center',
    'scale',
    'rotation',
  ])
  const centerKeys = nodes(basicParameters[0], 'keyframe')
  expect(centerKeys.map(key => Number(text(key, 'when')))).toEqual([0, 6])
  expect(
    centerKeys.map(key => [Number(text(key, 'value/horiz')), Number(text(key, 'value/vert'))]),
  ).toEqual([
    [0, 0],
    [2.4, -2.7],
  ])
  expect(nodes(basicParameters[1], 'keyframe').map(key => Number(text(key, 'value')))).toEqual([
    100, 150,
  ])
  expect(Number(text(nodes(basicParameters[2], 'keyframe')[0], 'value'))).toBe(-10)
  expect(Number(text(nodes(effects[1], 'parameter/keyframe')[0], 'value'))).toBe(80)
  expect(nodes(sequences[1], 'media/audio/track/clipitem')).toHaveLength(1)

  const readme = projectFiles('premiere', input)['README.txt']
  expect(readme).toMatch(/two.*sequences/is)
  expect(readme).toMatch(/image-only.*incomplete/is)
  expect(readme).toMatch(/non-uniform.*omitted/is)
})

function runAe(input: EditableManifest) {
  const imports: Array<{ file: { fsName: string }; mainSource: { conformFrameRate: number } }> = []
  const layers: Array<{
    source: (typeof imports)[number]
    name: string
    startTime: number
    inPoint: number
    outPoint: number
    enabled: boolean
    audioEnabled: boolean
    stretch: number
  }> = []
  const comp = {
    layers: {
      add(source: (typeof imports)[number]) {
        const layer = {
          source,
          name: '',
          startTime: 7,
          inPoint: 7,
          outPoint: 20,
          enabled: true,
          audioEnabled: true,
          stretch: 100,
        }
        layers.push(layer)
        return layer
      },
    },
    openInViewer: vi.fn(),
    displayStartTime: 7,
  }
  const addComp = vi.fn(
    (
      _name: string,
      _width: number,
      _height: number,
      _aspect: number,
      _duration: number,
      _fps: number,
    ) => comp,
  )
  const app = {
    project: {
      items: { addComp },
      importFile(options: { file: { fsName: string } }) {
        const source = { file: options.file, mainSource: { conformFrameRate: 0 } }
        imports.push(source)
        return source
      },
      save: vi.fn(),
    },
    beginUndoGroup: vi.fn(),
    endUndoGroup: vi.fn(),
    newProject: vi.fn(),
  }
  function File(path: string) {
    return { fsName: path, parent: { fsName: '/extracted folder' }, exists: true }
  }
  function ImportOptions(this: { file: { fsName: string } }, file: { fsName: string }) {
    this.file = file
  }
  const script = projectFiles('after-effects', input)['project.jsx']
  expect(script).toBeTypeOf('string')
  runInNewContext(script, {
    app,
    File,
    ImportOptions,
    $: { fileName: '/extracted folder/project.jsx' },
  })
  return { app, comp, addComp, layers, imports, script }
}

it('builds AE cuts at matching source times, with movie audio muted and the soundtrack audible once', () => {
  const input = {
    ...manifest,
    audio: { file: 'media/soundtrack.wav', channels: 2, sampleRate: 48000 },
  }
  const { app, comp, addComp, layers, imports } = runAe(input)
  const fps = 30000 / 1001
  expect(addComp).toHaveBeenCalledExactlyOnceWith(input.title, 1920, 1080, 1, 90 / fps, fps)
  expect(comp.displayStartTime).toBe(0)
  expect(imports.map(item => item.file.fsName)).toEqual([
    '/extracted folder/media/video.mp4',
    '/extracted folder/media/soundtrack.wav',
  ])
  expect(imports[0].mainSource.conformFrameRate).toBe(fps)
  expect(layers).toHaveLength(3)
  expect(layers.filter(layer => layer.audioEnabled)).toHaveLength(1)
  for (let frame = 0; frame < 90; frame++) {
    const time = (frame + 0.5) / fps
    const active = layers.filter(
      layer => layer.enabled && layer.inPoint <= time && layer.outPoint > time,
    )
    const visible = active.filter(layer => layer.source.file.fsName.endsWith('.mp4'))
    expect(visible).toHaveLength(1)
    expect((time - visible[0].startTime) * fps).toBeCloseTo(frame + 0.5)
    expect(visible[0].name).toBe(input.cuts[frame < 30 ? 0 : 1].label)
    expect(active.filter(layer => layer.audioEnabled)).toHaveLength(1)
  }
  expect(app.newProject).not.toHaveBeenCalled()
  expect(app.project.save).not.toHaveBeenCalled()
  expect(app.endUndoGroup).toHaveBeenCalledOnce()
  expect(comp.openInViewer).toHaveBeenCalledOnce()
})

it('keeps hostile AE names as data, including legacy ExtendScript line separators, with no soundtrack', () => {
  const title = '"; throw new Error("injected"); //\n\\\u2028\u2029'
  const { script, layers, imports, addComp } = runAe({
    ...manifest,
    title,
    cuts: [{ label: title, start: 0, end: 90 }],
  })
  expect(script).not.toMatch(/[\u2028\u2029]/)
  expect(addComp.mock.calls[0][0]).toBe(title)
  expect(layers[0].name).toBe(title)
  expect(layers.every(layer => !layer.audioEnabled)).toBe(true)
  expect(imports).toHaveLength(1)
})

it('builds native AE modes with scaled text/image keys, a disabled reference, and one soundtrack', () => {
  const native: EditableManifest = {
    ...manifest,
    audio: { file: 'media/soundtrack.wav', channels: 2, sampleRate: 48000 },
    native: {
      stage: { width: 960, height: 540 },
      warnings: ['Glow remains baked.'],
      layers: [
        {
          id: 'title',
          name: 'Title',
          shotId: 'hero',
          kind: 'text',
          text: 'Hello',
          box: { width: 200, height: 50 },
          inFrame: 3,
          outFrame: 30,
          font: {
            family: '"Missing Font", Arial, sans-serif',
            style: 'normal',
            weight: '700',
            size: 20,
            lineHeight: 24,
            tracking: 1,
            color: 'rgba(255, 128, 0, .5)',
            align: 'center',
          },
          keys: {
            position: [
              [3, 100, 200],
              [9, 200, 250],
            ],
            scale: [[3, 100, 80]],
            rotation: [[3, 10]],
            opacity: [[3, 90]],
          },
          warnings: [],
        },
        {
          id: 'image',
          name: 'Image',
          shotId: 'hero',
          kind: 'image',
          asset: 'assets/product.webp',
          assetSha256: 'a'.repeat(64),
          box: { width: 400, height: 200 },
          inFrame: 0,
          outFrame: 90,
          keys: {
            position: [[0, 480, 270]],
            scale: [[0, 50, 75]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
        {
          id: 'missing-image',
          name: 'Missing Image',
          shotId: 'hero',
          kind: 'image',
          asset: 'assets/missing.png',
          assetSha256: 'b'.repeat(64),
          box: { width: 100, height: 100 },
          inFrame: 0,
          outFrame: 90,
          keys: {
            position: [[0, 100, 100]],
            scale: [[0, 100, 100]],
            rotation: [[0, 0]],
            opacity: [[0, 100]],
          },
          warnings: [],
        },
      ],
    },
  }
  const imports: any[] = []
  const comps: any[] = []
  const property = () => ({
    values: [] as any[],
    value: undefined as any,
    setValuesAtTimes(times: number[], values: any[]) {
      this.values = times.map((time, i) => [time, values[i]])
    },
    setValue(value: any) {
      this.value = value
    },
    setInterpolationTypeAtKey: vi.fn(),
  })
  const layer = (source?: any) => {
    const properties: Record<string, any> = {
      'ADBE Position': property(),
      'ADBE Scale': property(),
      'ADBE Rotate Z': property(),
      'ADBE Opacity': property(),
      'ADBE Anchor Point': property(),
      'ADBE Text Document': property(),
    }
    return {
      source,
      name: '',
      enabled: true,
      audioEnabled: true,
      guideLayer: false,
      locked: false,
      property(name: string) {
        if (name === 'ADBE Transform Group')
          return { property: (child: string) => properties[child] }
        if (name === 'ADBE Text Properties')
          return { property: (child: string) => properties[child] }
        return properties[name]
      },
      properties,
    }
  }
  const addComp = vi.fn((name: string) => {
    const layers: any[] = []
    const comp = {
      name,
      layers: {
        add(source: any) {
          const value = layer(source)
          layers.push(value)
          return value
        },
        addBoxText(size: number[]) {
          const value = layer()
          value.boxSize = size
          layers.push(value)
          return value
        },
      },
      layerList: layers,
      openInViewer: vi.fn(),
      comment: '',
    }
    comps.push(comp)
    return comp
  })
  const app = {
    project: {
      items: { addComp },
      importFile(options: any) {
        if (options.file.fsName.endsWith('/assets/missing.png')) throw new Error('missing image')
        const item = { file: options.file, mainSource: { conformFrameRate: 0 } }
        imports.push(item)
        return item
      },
      save: vi.fn(),
    },
    beginUndoGroup: vi.fn(),
    endUndoGroup: vi.fn(),
  }
  function File(path: string) {
    return { fsName: path, parent: { fsName: '/package' } }
  }
  function ImportOptions(this: any, file: any) {
    this.file = file
  }
  function TextDocument(this: any, text: string) {
    this.text = text
  }
  runInNewContext(projectFiles('after-effects', native)['project.jsx'], {
    app,
    File,
    ImportOptions,
    TextDocument,
    ParagraphJustification: { CENTER_JUSTIFY: 'center' },
    KeyframeInterpolationType: { LINEAR: 'linear' },
    $: { fileName: '/package/project.jsx' },
  })

  expect(comps.map(comp => comp.name)).toEqual([
    `${native.title} — BAKED`,
    `${native.title} — OPEN ME`,
    `${native.title} — EDITABLE`,
  ])
  const editable = comps[2]
  const baked = comps[0]
  const text = editable.layerList.find((item: any) => item.name === 'Title')
  const image = editable.layerList.find((item: any) => item.name === 'Image')
  const reference = editable.layerList.find((item: any) => item.name === '[REFERENCE] Full render')
  expect(text.boxSize).toEqual([400, 100])
  expect(text.properties['ADBE Position'].values).toEqual([
    [3 / (30000 / 1001), [200, 400]],
    [9 / (30000 / 1001), [400, 500]],
  ])
  expect(text.properties['ADBE Scale'].values[0][1]).toEqual([100, 80])
  expect(text.properties['ADBE Text Document'].value).toMatchObject({
    font: 'Missing Font',
    tracking: 50,
    fillColor: [1, 128 / 255, 0],
  })
  expect(text.properties['ADBE Opacity'].values[0][1]).toBe(90)
  expect(image.properties['ADBE Scale'].values[0][1]).toEqual([100, 150])
  expect(editable.layerList.some((item: any) => item.name === 'Missing Image')).toBe(false)
  expect(baked.layerList).toHaveLength(native.cuts.length)
  native.cuts.forEach((cut, i) => {
    expect(baked.layerList[i]).toMatchObject({
      name: cut.label,
      startTime: 0,
      inPoint: cut.start / (30000 / 1001),
      outPoint: cut.end / (30000 / 1001),
      audioEnabled: false,
    })
  })
  expect(reference).toMatchObject({
    enabled: false,
    guideLayer: true,
    locked: true,
    audioEnabled: false,
  })
  const open = comps[1].layerList
  expect(open.find((item: any) => item.name === '[MODE] EDITABLE NATIVE').enabled).toBe(false)
  expect(open.find((item: any) => item.name === '[MODE] BAKED FIDELITY').enabled).toBe(true)
  expect(
    comps.flatMap(comp => comp.layerList).filter((item: any) => item.name === 'Soundtrack'),
  ).toHaveLength(1)
  expect(imports.map(item => item.file.fsName)).toEqual([
    '/package/media/video.mp4',
    '/package/media/soundtrack.wav',
    '/package/assets/product.webp',
  ])
  const readme = projectFiles('after-effects', native)['README.txt']
  expect(readme).toMatch(/3 supported editable layers/i)
  expect(readme).toMatch(/transparent.*incomplete/i)
  expect(readme).toMatch(/font.*fall back/i)
  expect(readme).toMatch(/font family.*best effort.*font weight.*style/is)
  expect(readme).not.toMatch(/no native DOM layers/i)
  expect(app.project.save).not.toHaveBeenCalled()
  expect(app.endUndoGroup).toHaveBeenCalledOnce()
})

function runBlender(input: EditableManifest, fromTextEditor = false) {
  const script = projectFiles('blender', input)['project.py']
  expect(script).toBeTypeOf('string')
  return JSON.parse(
    execFileSync(
      'python3',
      [
        '-c',
        `
import json, sys, types
from types import SimpleNamespace as NS
payload = json.load(sys.stdin)
created = []
strips = []
class Strip:
    def __init__(self, kind, name, filepath, channel, frame_start):
        self.kind, self.name, self.filepath = kind, name, filepath
        self.channel, self.frame_start = channel, frame_start
        self.frame_duration = 90
        self.frame_offset_start = self.frame_offset_end = 0
        self.mute = False
        self.blend_alpha = 1
        self.keyframes = []
        self.transform = NS(offset_x=0, offset_y=0, scale_x=1, scale_y=1, rotation=0,
            keyframes=[])
        self.transform.keyframe_insert = lambda data_path, frame: self.transform.keyframes.append([data_path, frame, getattr(self.transform, data_path)])
    def keyframe_insert(self, data_path, frame):
        self.keyframes.append([data_path, frame, getattr(self, data_path)])
    @property
    def frame_final_start(self): return self.frame_start + self.frame_offset_start
    @frame_final_start.setter
    def frame_final_start(self, value): self.frame_offset_start = value - self.frame_start
    @property
    def frame_final_end(self): return self.frame_start + self.frame_duration - self.frame_offset_end
    @frame_final_end.setter
    def frame_final_end(self, value): self.frame_offset_end = self.frame_start + self.frame_duration - value
def new_movie(name, filepath, channel, frame_start, *, fit_method='ORIGINAL'):
    s = Strip('MOVIE', name, filepath, channel, frame_start)
    strips.append(s)
    return s
def new_sound(name, filepath, channel, frame_start):
    s = Strip('SOUND', name, filepath, channel, frame_start)
    strips.append(s)
    return s
def new_image(name, filepath, channel, frame_start, *, fit_method='ORIGINAL'):
    s = Strip('IMAGE', name, filepath, channel, frame_start)
    s.fit_method = fit_method
    strips.append(s)
    return s
def new_effect(name, type, channel, frame_start, **kwargs):
    s = Strip(type, name, '', channel, frame_start)
    s.frame_duration = kwargs.get('length', kwargs.get('frame_end', frame_start) - frame_start)
    strips.append(s)
    return s
def new_scene(name):
    scene = NS(name=name, render=NS(), view_settings=NS(), display_settings=NS(),
        sequencer_colorspace_settings=NS(),
        sequence_editor_create=lambda: NS(strips=NS(new_movie=new_movie, new_sound=new_sound, new_image=new_image, new_effect=new_effect)),
        animation_data=NS(action=NS(fcurves=[])),
        frame_set=lambda frame: None)
    created.append(scene)
    return scene
existing = NS(name='Existing scene')
bpy = types.ModuleType('bpy')
bpy.data = NS(scenes=NS(new=new_scene))
bpy.app = NS(version=(5, 0, 0))
bpy.context = NS(window=NS(scene=existing), space_data=NS(text=NS(filepath='/extracted folder/project.py')))
bpy.path = NS(abspath=lambda path: path)
sys.modules['bpy'] = bpy
scope = {} if payload['fromTextEditor'] else {'__file__': '/extracted folder/project.py'}
exec(compile(payload['script'], 'project.py', 'exec'), scope)
scene = created[0]
print(json.dumps(dict(name=scene.name, render=vars(scene.render), view=vars(scene.view_settings),
    start=scene.frame_start, end=scene.frame_end, existing=existing.name,
    selected=bpy.context.window.scene is scene, scenes=len(created),
    strips=[dict(kind=s.kind, name=s.name, filepath=s.filepath, channel=s.channel,
        frame_start=s.frame_start, frame_offset_start=s.frame_offset_start,
        visible_start=s.frame_final_start, visible_end=s.frame_final_end,
        mute=s.mute, blend_alpha=s.blend_alpha, fit_method=getattr(s, 'fit_method', None),
        text=getattr(s, 'text', None), font_size=getattr(s, 'font_size', None),
        color=getattr(s, 'color', None), alignment_x=getattr(s, 'alignment_x', None),
        anchor_x=getattr(s, 'anchor_x', None), anchor_y=getattr(s, 'anchor_y', None),
        location=getattr(s, 'location', None), transform=dict(
            offset_x=s.transform.offset_x, offset_y=s.transform.offset_y,
            scale_x=s.transform.scale_x, scale_y=s.transform.scale_y,
            rotation=s.transform.rotation, keyframes=s.transform.keyframes),
        keyframes=s.keyframes) for s in strips])))
`,
      ],
      { input: JSON.stringify({ script, fromTextEditor }), encoding: 'utf8' },
    ),
  )
}

it('builds a new Blender scene with frame-one origin, source trims, rational fps and one soundtrack', () => {
  const input = {
    ...manifest,
    audio: { file: 'media/soundtrack.wav', channels: 2, sampleRate: 48000 },
  }
  const result = runBlender(input)
  expect(result).toMatchObject({
    name: input.title,
    start: 1,
    end: 90,
    existing: 'Existing scene',
    selected: true,
    scenes: 1,
  })
  expect(result.render).toMatchObject({
    resolution_x: 1920,
    resolution_y: 1080,
    resolution_percentage: 100,
    fps: 30,
  })
  expect(result.render.fps / result.render.fps_base).toBeCloseTo(30000 / 1001, 10)
  expect(result.view).toMatchObject({
    view_transform: 'Standard',
    look: 'None',
    exposure: 0,
    gamma: 1,
  })
  expect(result.strips).toHaveLength(3)
  input.cuts.forEach((cut, i) => {
    expect(result.strips[i]).toMatchObject({
      kind: 'MOVIE',
      name: cut.label,
      channel: 1,
      filepath: '/extracted folder/media/video.mp4',
      frame_start: 1,
      frame_offset_start: cut.start,
      visible_start: cut.start + 1,
      visible_end: cut.end + 1,
    })
  })
  expect(result.strips[2]).toMatchObject({
    kind: 'SOUND',
    filepath: '/extracted folder/media/soundtrack.wav',
    channel: 2,
    visible_start: 1,
    visible_end: 91,
  })
})

it('adds muted native Blender image and text strips beneath the unmuted baked movie', () => {
  const input: EditableManifest = {
    ...manifest,
    audio: { file: 'media/soundtrack.wav', channels: 2, sampleRate: 48000 },
    native: {
      stage: { width: 960, height: 540 },
      warnings: ['Glow remains baked.'],
      layers: [
        {
          id: 'image',
          name: 'Product',
          shotId: 'hero',
          kind: 'image',
          asset: 'assets/product.webp',
          assetSha256: 'a'.repeat(64),
          box: { width: 400, height: 200 },
          inFrame: 3,
          outFrame: 30,
          keys: {
            position: [
              [3, 480, 270],
              [9, 720, 135],
            ],
            scale: [[3, 50, 75]],
            rotation: [[3, 90]],
            opacity: [[3, 80]],
          },
          warnings: [],
        },
        {
          id: 'text',
          name: 'Title',
          shotId: 'hero',
          kind: 'text',
          text: 'Hello',
          box: { width: 200, height: 50 },
          inFrame: 10,
          outFrame: 40,
          font: {
            family: 'Arial',
            style: 'normal',
            weight: '700',
            size: 20,
            lineHeight: 24,
            tracking: 0,
            color: 'rgba(255, 128, 0, .5)',
            align: 'right',
          },
          keys: {
            position: [[10, 240, 135]],
            scale: [[10, 120, 80]],
            rotation: [[10, -10]],
            opacity: [[10, 90]],
          },
          warnings: [],
        },
      ],
    },
  }

  const result = runBlender(input)
  expect(result.strips.map((strip: any) => strip.kind)).toEqual([
    'IMAGE',
    'TEXT',
    'MOVIE',
    'MOVIE',
    'SOUND',
  ])
  const [image, title, ...baked] = result.strips
  expect(image).toMatchObject({
    name: 'NATIVE — Product',
    filepath: '/extracted folder/assets/product.webp',
    channel: 1,
    frame_start: 4,
    visible_end: 31,
    mute: true,
    fit_method: 'ORIGINAL',
  })
  expect(image.transform).toMatchObject({
    offset_x: 480,
    offset_y: 270,
    scale_x: 1,
    scale_y: 1.5,
    rotation: -Math.PI / 2,
  })
  expect(image.transform.keyframes).toContainEqual(['offset_x', 10, 480])
  expect(image.transform.keyframes).toContainEqual(['offset_y', 10, 270])
  expect(image.keyframes).toContainEqual(['blend_alpha', 4, 0.8])
  expect(title).toMatchObject({
    kind: 'TEXT',
    name: 'NATIVE — Title',
    channel: 2,
    frame_start: 11,
    visible_end: 41,
    mute: true,
    text: 'Hello',
    font_size: 40,
    color: [1, 128 / 255, 0, 1],
    alignment_x: 'RIGHT',
    anchor_x: 'CENTER',
    anchor_y: 'CENTER',
    location: [0.5, 0.5],
  })
  expect(title.transform).toMatchObject({
    offset_x: -480,
    offset_y: 270,
    scale_x: 1.2,
    scale_y: 0.8,
    rotation: Math.PI / 18,
  })
  expect(baked.filter((strip: any) => strip.kind === 'MOVIE')).toHaveLength(2)
  expect(
    baked.filter((strip: any) => strip.kind === 'MOVIE').every((strip: any) => !strip.mute),
  ).toBe(true)
  expect(
    baked.filter((strip: any) => strip.kind === 'MOVIE').map((strip: any) => strip.channel),
  ).toEqual([4, 4])
  expect(baked.filter((strip: any) => strip.kind === 'SOUND')).toHaveLength(1)
  expect(baked.find((strip: any) => strip.kind === 'SOUND')).toMatchObject({
    channel: 5,
    mute: false,
  })
  expect(projectFiles('blender', input)['README.txt']).toMatch(/mute.*baked.*unmute.*NATIVE/is)
})

it('runs Blender from an opened UI text file without __file__, preserving hostile names as data and no audio', () => {
  const title = '"); raise Exception("injected") #\n\\\u0000\u2028\u2029'
  const result = runBlender(
    { ...manifest, title, cuts: [{ label: title, start: 30, end: 90 }] },
    true,
  )
  expect(result.name).toBe(title)
  expect(result.strips).toHaveLength(1)
  expect(result.strips[0]).toMatchObject({
    name: title,
    kind: 'MOVIE',
    visible_start: 31,
    visible_end: 91,
  })
})

it('includes application-specific extraction, import, save and fidelity instructions without duplicating the manifest', () => {
  const formats = ['premiere', 'after-effects', 'blender'] as const
  const steps = ['File > Import', 'File > Scripts > Run Script File', 'Scripting']
  const native = ['.prproj', '.aep', '.blend']
  formats.forEach((format, i) => {
    const files = projectFiles(format, { ...manifest, warnings: ['A marker was clamped.'] })
    expect(Object.keys(files)).toHaveLength(2)
    expect(files['manifest.json']).toBeUndefined()
    const readme = files['README.txt']
    expect(readme).toContain(steps[i])
    expect(readme).toContain(native[i])
    expect(readme).toMatch(/not .*until .*sav/i)
    expect(readme).toMatch(/keep .*folders together/i)
    expect(readme).toMatch(/baked visuals/i)
    expect(readme).toMatch(/mixed .*not .*stems/i)
    expect(readme).toMatch(/no native DOM layers/i)
    expect(readme).toMatch(/markers.*beat boundaries/i)
    expect(readme).toMatch(/color management/i)
    expect(readme).toContain('A marker was clamped.')
    if (format === 'premiere') {
      expect(readme).toMatch(/relink/i)
      expect(readme).toContain('media/video.mp4')
      expect(readme).toContain('media/soundtrack.wav')
    }
    if (format === 'blender') {
      expect(readme).toContain('4.4')
      expect(readme).toContain('Run Script')
      expect(readme).toContain('Standard')
    }
  })
})

it('removes XML-forbidden name characters without allowing injected elements', () => {
  const title = '\u0000\u0001\ud800\ufffe</name><evil/> & "\r\n'
  const root = xmlTree(
    projectFiles('premiere', { ...manifest, title, cuts: [{ label: title, start: 0, end: 90 }] })[
      'project.xml'
    ],
  )
  const expected = '</name><evil/> & "\r\n'
  expect(text(root, 'sequence/name')).toBe(expected)
  expect(text(root, 'sequence/media/video/track/clipitem/name')).toBe(expected)
  expect(nodes(root, 'sequence/evil')).toHaveLength(0)
})

it('rejects Premiere frame rates xmeml cannot express instead of silently changing timing', () => {
  const input = { ...manifest, video: { ...manifest.video, fps: { num: 25, den: 2 } } }
  expect(() => projectFiles('premiere', input)).toThrow(/frame rate.*xmeml/i)
})

it('keeps the full rendered video when there are no cut markers, without mutating the manifest', () => {
  const input = { ...manifest, video: { ...manifest.video, fps: { num: 24, den: 1 } }, cuts: [] }
  const before = JSON.stringify(input)
  const sequence = nodes(xmlTree(projectFiles('premiere', input)['project.xml']), 'sequence')[0]
  const clips = nodes(sequence, 'media/video/track/clipitem')
  expect(clips).toHaveLength(1)
  expect(text(sequence, 'rate/ntsc')).toBe('FALSE')
  expect(text(clips[0], 'in')).toBe('0')
  expect(text(clips[0], 'out')).toBe('90')
  const ae = runAe(input)
  expect(ae.layers).toHaveLength(1)
  expect(ae.layers[0]).toMatchObject({ startTime: 0, inPoint: 0, outPoint: 90 / 24 })
  const blender = runBlender(input)
  expect(blender.strips).toHaveLength(1)
  expect(blender.strips[0]).toMatchObject({ visible_start: 1, visible_end: 91 })
  expect(JSON.stringify(input)).toBe(before)
})
