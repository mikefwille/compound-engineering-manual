import { describe, test, expect } from "bun:test"
import { mkdtemp, mkdir, readFile, writeFile, rm } from "node:fs/promises"
import { tmpdir } from "node:os"
import path from "node:path"
import { load } from "js-yaml"
import { manualFrontmatter, manualCodexPolicy, manualize } from "../scripts/manual-skills"

describe("manual invocation automation", () => {
  test("preserves instruction bytes, descriptions, and other frontmatter", () => {
    for (const newline of ["\n", "\r\n"]) {
      const body = `${newline}# Instructions${newline}Keep $HOME and \`code\` exactly.${newline}`
      const original = ["---", "name: example", "description: Preserve this", "disable-model-invocation: false", "user-invocable: true", "---"].join(newline) + body
      const updated = manualFrontmatter(original, "fixture")
      expect(updated).toBe(original.replace("disable-model-invocation: false", "disable-model-invocation: true"))
      expect(manualFrontmatter(updated, "fixture")).toBe(updated)
    }
  })

  test("retains Codex interface, dependencies, and other policy values", () => {
    const original = 'interface:\n  display_name: "Example"\ndependencies:\n  tools: []\npolicy:\n  allow_implicit_invocation: true\n  other_policy: keep\n'
    const updated = manualCodexPolicy(original, "fixture")
    expect(load(updated)).toEqual({
      interface: { display_name: "Example" }, dependencies: { tools: [] },
      policy: { allow_implicit_invocation: false, other_policy: "keep" },
    })
    expect(manualCodexPolicy(updated, "fixture")).toBe(updated)
  })

  test("rejects malformed metadata without replacing it", () => {
    expect(() => manualFrontmatter("missing", "fixture")).toThrow()
    expect(() => manualFrontmatter("---\nname: a\nname: b\n---\nbody", "fixture")).toThrow()
    expect(() => manualCodexPolicy("policy: false", "fixture")).toThrow()
  })

  test("discovers new skills on both surfaces; check is read-only; apply is idempotent", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ce-manual-"))
    try {
      for (const surface of ["skills/new-skill", ".agents/skills/new-local"]) {
        await mkdir(path.join(root, surface), { recursive: true })
        await writeFile(path.join(root, surface, "SKILL.md"), "---\nname: new\ndescription: Example\n---\nUnchanged body.\n")
      }
      const before = await readFile(path.join(root, "skills/new-skill/SKILL.md"), "utf8")
      expect((await manualize(root, true)).changed).toHaveLength(4)
      expect(await readFile(path.join(root, "skills/new-skill/SKILL.md"), "utf8")).toBe(before)
      expect((await manualize(root)).skills).toBe(2)
      expect((await manualize(root)).changed).toEqual([])
      expect((await manualize(root, true)).changed).toEqual([])
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test("a malformed later skill prevents edits to earlier skills", async () => {
    const root = await mkdtemp(path.join(tmpdir(), "ce-manual-invalid-"))
    try {
      for (const name of ["a", "z"]) await mkdir(path.join(root, "skills", name), { recursive: true })
      const original = "---\nname: a\ndescription: Example\n---\nBody\n"
      await writeFile(path.join(root, "skills/a/SKILL.md"), original)
      await writeFile(path.join(root, "skills/z/SKILL.md"), "invalid")
      await expect(manualize(root)).rejects.toThrow()
      expect(await readFile(path.join(root, "skills/a/SKILL.md"), "utf8")).toBe(original)
    } finally { await rm(root, { recursive: true, force: true }) }
  })

  test("all repository skill surfaces satisfy the policy", async () => {
    expect((await manualize(path.resolve(import.meta.dir, ".."), true)).changed).toEqual([])
  })
})
