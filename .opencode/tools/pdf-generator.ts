/**
 * pdf-generator tools
 *
 * Toolset for the PDF-deck agent (.opencode/agents/pdf-generator.md). These wrap
 * the shell steps of the deck pipeline so the agent never needs raw bash:
 *
 *   pdf_scaffold       create /tmp/ppt-<jobId>, copy the builder (+ inject the
 *                      chosen template's layouts/CSS), ready for CONFIG authoring
 *   pdf_scrape_images  fetch Pinterest/Unsplash images (Gemini fallback) for the
 *                      deck's keywords into pptx/ppt-<jobId>/images/<keyword>
 *   pdf_build          run pdf-builder.js (Playwright HTML→PDF + DOM QA + slide
 *                      screenshots) and report outputs + qa-renders
 *
 * The agent authors the deck content itself: it edits the CONFIG object in the
 * scaffolded pdf-builder.js with the built-in edit tool, and reads qa-renders
 * with the built-in read tool. Content/design guidance comes from the native
 * `skill` tool (ppt-generator / template-ppt in .opencode/skills/).
 *
 * These tools are intentionally self-contained — unlike the demo tools they do
 * NOT read recordings/demo-config.json, so PDF jobs no longer depend on the
 * demo flow's state files. The worker keeps the upload contract unchanged:
 * /tmp/ppt-<jobId>/output.pdf (+ output.html).
 */

import { tool } from '@opencode-ai/plugin'
import { exec, execSync } from 'child_process'
import fs from 'fs'
import path from 'path'
import { promisify } from 'util'

const execAsync = promisify(exec)
const BIG_BUFFER = 64 * 1024 * 1024

function baseDir(context: any): string {
  return context?.directory || process.cwd()
}

function skillsDir(base: string): string {
  return path.join(base, '.opencode', 'skills')
}

// Playwright is installed globally (Dockerfile.base: `npm install -g
// playwright`), not in any workspace package — so scripts under /tmp must
// resolve it via NODE_PATH. Cached; failures just leave NODE_PATH unset.
let globalNodeModules: string | null | undefined
function npmGlobalRoot(): string | null {
  if (globalNodeModules === undefined) {
    try {
      globalNodeModules = execSync('npm root -g', { encoding: 'utf-8' }).trim() || null
    } catch {
      globalNodeModules = null
    }
  }
  return globalNodeModules
}

function nodeEnv(): NodeJS.ProcessEnv {
  const env = { ...process.env }
  const globalRoot = npmGlobalRoot()
  if (globalRoot) env.NODE_PATH = env.NODE_PATH ? `${globalRoot}:${env.NODE_PATH}` : globalRoot
  return env
}

const TEMPLATE_DIRS: Record<string, string> = {
  BRUTALIST_NEWSPAPER: 'brutalist-newspaper',
  MINIMAL_CORPORATE: 'minimal-corporate',
  DARK_TECH: 'dark-tech',
  COMIC_POP: 'comic-pop',
}

export const pdf_scaffold = tool({
  description:
    'Set up the PDF build directory for this job: creates /tmp/ppt-<jobId>, copies ' +
    "pdf-builder-template.js in as pdf-builder.js (with the template's layouts/CSS " +
    'injected when a template is given), and stages the DOM-QA script. Call this ' +
    'ONCE, after loading the skill and before scraping images or authoring the ' +
    'CONFIG. Then edit the CONFIG object inside the returned pdf-builder.js with ' +
    'the built-in edit tool.',
  args: {
    jobId: tool.schema.string().describe('The job id (from the worker message).'),
    template: tool.schema
      .string()
      .optional()
      .describe(
        'Optional template id: BRUTALIST_NEWSPAPER | MINIMAL_CORPORATE | DARK_TECH | COMIC_POP. ' +
          "When set, the template's skill.md layouts/CSS are injected into the builder.",
      ),
  },
  async execute(args, context) {
    const base = baseDir(context)
    const buildDir = path.join('/tmp', `ppt-${args.jobId}`)
    try {
      fs.rmSync(buildDir, { recursive: true, force: true })
      fs.mkdirSync(path.join(buildDir, 'reference'), { recursive: true })

      const pptSkill = path.join(skillsDir(base), 'ppt-generator')
      const builderTemplate = path.join(pptSkill, 'pdf-builder-template.js')
      const builderOut = path.join(buildDir, 'pdf-builder.js')
      fs.copyFileSync(builderTemplate, builderOut)
      fs.copyFileSync(
        path.join(pptSkill, 'reference', 'qa-dom.js'),
        path.join(buildDir, 'reference', 'qa-dom.js'),
      )

      let injected = false
      if (args.template) {
        const dirName = TEMPLATE_DIRS[args.template]
        if (!dirName) {
          return `ERROR: unknown template "${args.template}". Known: ${Object.keys(TEMPLATE_DIRS).join(', ')}`
        }
        const templateSkillMd = path.join(
          skillsDir(base),
          'template-ppt',
          'templates',
          dirName,
          'skill.md',
        )
        if (!fs.existsSync(templateSkillMd)) {
          return `ERROR: template skill.md not found at ${templateSkillMd}`
        }
        const injector = path.join(skillsDir(base), 'template-ppt', 'scripts', 'inject_template.js')
        await execAsync(
          `node "${injector}" "${builderTemplate}" "${templateSkillMd}" "${builderOut}"`,
          { maxBuffer: BIG_BUFFER },
        )
        injected = true
      }

      return (
        `Build directory ready: ${buildDir}\n` +
        `- builder: ${builderOut}${injected ? ` (template ${args.template} injected)` : ''}\n` +
        `- DOM QA: ${path.join(buildDir, 'reference', 'qa-dom.js')} (runs inside the build)\n` +
        `Next: scrape images (pdf_scrape_images), then author the CONFIG object in pdf-builder.js ` +
        `(set jobId to "${args.jobId}"${args.template ? ` and template to "${args.template}"` : ''}), then pdf_build.`
      )
    } catch (e) {
      return `ERROR: scaffold failed — ${e instanceof Error ? e.message : String(e)}`
    }
  },
})

export const pdf_scrape_images = tool({
  description:
    'Fetch images for the deck. Runs the Pinterest → Unsplash → Gemini-fallback ' +
    'scraper for each keyword and writes files under ' +
    'pptx/ppt-<jobId>/images/<keyword>/ (paths are relative to the repo root). ' +
    'Reference those local files from the CONFIG as base64 (per the skill).',
  args: {
    jobId: tool.schema.string().describe('The job id (from the worker message).'),
    keywords: tool.schema
      .array(tool.schema.string())
      .describe(
        'Concise search keywords, one per image topic (e.g. ["istanbul skyline", "coffee shop"]).',
      ),
    richPrompts: tool.schema
      .record(tool.schema.string(), tool.schema.string())
      .optional()
      .describe(
        'Optional map of keyword → rich image prompt, passed to the Gemini fallback ' +
          '(--rich-prompt keyword::prompt). Only used if scraping comes up short.',
      ),
  },
  async execute(args, context) {
    const base = baseDir(context)
    const script = path.join(skillsDir(base), 'ppt-generator', 'reference', 'scrape_images.js')
    if (!fs.existsSync(script)) return `ERROR: scraper not found at ${script}`
    if (!args.keywords?.length) return 'ERROR: provide at least one keyword'

    const shEsc = (s: string) => `'${s.replace(/'/g, `'\\''`)}'`
    const parts = [
      'node',
      shEsc(script),
      '--topic',
      shEsc(args.jobId),
      '--keywords',
      ...args.keywords.map(shEsc),
    ]
    for (const [kw, prompt] of Object.entries(args.richPrompts || {})) {
      parts.push('--rich-prompt', shEsc(`${kw}::${prompt}`))
    }
    try {
      const { stdout, stderr } = await execAsync(parts.join(' '), {
        cwd: base,
        env: nodeEnv(),
        maxBuffer: BIG_BUFFER,
        timeout: 8 * 60 * 1000,
      })
      const out = `${stdout}\n${stderr}`.trim()
      return (
        `Images written under ${path.join(base, 'pptx', `ppt-${args.jobId}`, 'images')}/<keyword>/\n\n` +
        out.slice(-4000)
      )
    } catch (e: any) {
      const out = `${e.stdout || ''}\n${e.stderr || ''}`.trim()
      return `ERROR: image scraping failed — ${e.message}\n${out.slice(-2000)}`
    }
  },
})

export const pdf_build = tool({
  description:
    'Build the deck: runs pdf-builder.js inside the build directory. This renders ' +
    'the HTML slides to output.pdf + output.html via Playwright, runs the DOM QA, ' +
    'and screenshots every slide into qa-renders/. Re-run after each CONFIG fix — ' +
    'the QA loop is: read qa-renders PNGs with the built-in read tool, patch the ' +
    'CONFIG/layouts with edit, then pdf_build again.',
  args: {
    jobId: tool.schema.string().describe('The job id (from the worker message).'),
  },
  async execute(args) {
    const buildDir = path.join('/tmp', `ppt-${args.jobId}`)
    const builder = path.join(buildDir, 'pdf-builder.js')
    if (!fs.existsSync(builder)) {
      return `ERROR: ${builder} not found — run pdf_scaffold first.`
    }
    try {
      const { stdout, stderr } = await execAsync('node pdf-builder.js', {
        cwd: buildDir,
        env: nodeEnv(),
        maxBuffer: BIG_BUFFER,
        timeout: 10 * 60 * 1000,
      })
      const out = `${stdout}\n${stderr}`.trim()

      const pdfPath = path.join(buildDir, 'output.pdf')
      const htmlPath = path.join(buildDir, 'output.html')
      const qaDir = path.join(buildDir, 'qa-renders')
      const renders = fs.existsSync(qaDir)
        ? fs
            .readdirSync(qaDir)
            .filter(f => f.endsWith('.png'))
            .sort()
        : []

      return (
        `Build finished.\n` +
        `- output.pdf: ${fs.existsSync(pdfPath) ? 'OK' : 'MISSING'} (${pdfPath})\n` +
        `- output.html: ${fs.existsSync(htmlPath) ? 'OK' : 'MISSING'} (${htmlPath})\n` +
        `- qa-renders: ${renders.length} slide screenshot(s) in ${qaDir}` +
        `${renders.length ? ` — ${renders.join(', ')}` : ''}\n` +
        `${renders.length ? '\nRead each PNG with the read tool for Visual QA; patch pdf-builder.js and re-run pdf_build on any defect.\n' : ''}` +
        `\n--- build output (tail) ---\n${out.slice(-4000)}`
      )
    } catch (e: any) {
      const out = `${e.stdout || ''}\n${e.stderr || ''}`.trim()
      return `ERROR: build failed — ${e.message}\n${out.slice(-3000)}`
    }
  },
})
