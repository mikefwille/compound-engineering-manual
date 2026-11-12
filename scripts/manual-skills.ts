import { readdir, readFile, writeFile, mkdir } from "node:fs/promises"
import path from "node:path"
import { fileURLToPath } from "node:url"
import { load, dump } from "js-yaml"

type Mapping = Record<string, unknown>
function mapping(value: unknown, source: string): Mapping {
  if (value === null || value === undefined) return {}
  if (typeof value !== "object" || Array.isArray(value)) throw new Error(`Expected YAML mapping: ${source}`)
  return value as Mapping
}

export function manualFrontmatter(raw: string, source: string): string {
  const match = /^(---\r?\n)([\s\S]*?)(^---[ \t]*\r?$)/m.exec(raw)
  if (!match || match.index !== 0) throw new Error(`Missing YAML frontmatter: ${source}`)
  const metadata = mapping(load(match[2]), source)
  if (metadata["disable-model-invocation"] === true) return raw
  const newline = match[1].endsWith("\r\n") ? "\r\n" : "\n"
  const key = /^disable-model-invocation:[^\r\n]*(?:\r?\n|$)/gm
  const matches = [...match[2].matchAll(key)]
  if (matches.length > 1) throw new Error(`Duplicate invocation key: ${source}`)
  const header = matches.length
    ? match[2].replace(key, `disable-model-invocation: true${newline}`)
    : `${match[2]}disable-model-invocation: true${newline}`
  const updated = match[1] + header + raw.slice(match[1].length + match[2].length)
  if (mapping(load(header), source)["disable-model-invocation"] !== true) throw new Error(`Unsupported frontmatter: ${source}`)
  return updated
}

export function manualCodexPolicy(raw: string, source: string): string {
  const metadata = mapping(load(raw), source)
  const policy = mapping(metadata.policy, source)
  if (policy.allow_implicit_invocation === false) return raw
  metadata.policy = { ...policy, allow_implicit_invocation: false }
  return dump(metadata, { lineWidth: -1, noRefs: true })
}

async function optionalRead(file: string): Promise<string> {
  try { return await readFile(file, "utf8") }
  catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return ""
    throw error
  }
}

export async function manualize(root: string, check = false): Promise<{ skills: number; changed: string[] }> {
  const edits: { file: string; content: string }[] = []
  let skills = 0
  for (const relativeRoot of ["skills", ".agents/skills"]) {
    const skillRoot = path.join(root, relativeRoot)
    let entries
    try { entries = await readdir(skillRoot, { withFileTypes: true }) }
    catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") continue
      throw error
    }
    for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
      if (!entry.isDirectory()) continue
      const skillFile = path.join(skillRoot, entry.name, "SKILL.md")
      const raw = await optionalRead(skillFile)
      if (!raw) continue
      skills++
      const updated = manualFrontmatter(raw, skillFile)
      if (updated !== raw) edits.push({ file: skillFile, content: updated })
      const policyFile = path.join(skillRoot, entry.name, "agents/openai.yaml")
      const policy = await optionalRead(policyFile)
      const nextPolicy = manualCodexPolicy(policy, policyFile)
      if (nextPolicy !== policy) edits.push({ file: policyFile, content: nextPolicy })
    }
  }
  if (!skills) throw new Error(`No skills found under ${root}`)
  const mapFile = path.join(root, "skills/ce-help/references/skill-map.md")
  const map = await optionalRead(mapFile)
  const updatedMap = map.replace(/(\| `[a-z0-9-]+`)( \(manual\))?( \|$)/gm, "$1 (manual)$3")
  if (map !== updatedMap) edits.push({ file: mapFile, content: updatedMap })
  // Validate every input before applying any edit.
  if (!check) for (const edit of edits) {
    await mkdir(path.dirname(edit.file), { recursive: true })
    await writeFile(edit.file, edit.content)
  }
  return { skills, changed: edits.map(edit => path.relative(root, edit.file)) }
}

if (import.meta.main) {
  try {
    const args = process.argv.slice(2)
    if (args.some(arg => arg !== "--check")) throw new Error("Usage: bun scripts/manual-skills.ts [--check]")
    const check = args.includes("--check")
    const result = await manualize(fileURLToPath(new URL("../", import.meta.url)), check)
    console.log(`${result.skills} skills; ${result.changed.length} files ${check ? "need changes" : "updated"}`)
    if (check && result.changed.length) {
      console.error(result.changed.join("\n"))
      process.exitCode = 1
    }
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  }
}
