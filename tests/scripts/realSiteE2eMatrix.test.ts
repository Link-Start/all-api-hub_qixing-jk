import { execFileSync } from "node:child_process"
import { readFileSync, rmSync } from "node:fs"
import path from "node:path"
import { describe, expect, it } from "vitest"

function runMatrix(...args: string[]) {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "github-real-site-e2e-matrix.mjs",
  )
  const testEnv = { ...process.env }

  // GitHub Actions sets GITHUB_OUTPUT for every step; unset it so this test
  // exercises the script's stdout CLI contract instead of its workflow output.
  delete testEnv.GITHUB_OUTPUT

  return JSON.parse(
    execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      env: testEnv,
      stdio: ["ignore", "pipe", "pipe"],
    }),
  ) as { include: Array<Record<string, unknown>> }
}

function runMatrixWithOutput(...args: string[]) {
  const scriptPath = path.resolve(
    process.cwd(),
    "scripts",
    "github-real-site-e2e-matrix.mjs",
  )
  const outputPath = path.resolve(
    process.cwd(),
    ".scratch",
    `real-site-matrix-${process.pid}-${Date.now()}.txt`,
  )

  try {
    execFileSync(process.execPath, [scriptPath, ...args], {
      encoding: "utf8",
      env: { ...process.env, GITHUB_OUTPUT: outputPath },
      stdio: ["ignore", "pipe", "pipe"],
    })
    return Object.fromEntries(
      readFileSync(outputPath, "utf8")
        .trim()
        .split("\n")
        .map((line) => {
          const separatorIndex = line.indexOf("=")
          return [line.slice(0, separatorIndex), line.slice(separatorIndex + 1)]
        }),
    )
  } finally {
    rmSync(outputPath, { force: true })
  }
}

function selectedIds(matrix: ReturnType<typeof runMatrix>) {
  return matrix.include.map((entry) => entry.id)
}

describe("GitHub real-site E2E matrix selection", () => {
  it("selects one concrete target without expanding the account category", () => {
    const matrix = runMatrix("all", "new-api-account")

    expect(matrix.include).toHaveLength(1)
    expect(matrix.include[0]).toMatchObject({
      id: "new-api-account",
      label: "Account / New API",
      category: "account",
    })
  })

  it("keeps category selection unchanged when target is all", () => {
    const matrix = runMatrix("account", "all")
    const allTargets = runMatrix()
    const expectedAccountIds = allTargets.include
      .filter((entry) => entry.category === "account")
      .map((entry) => entry.id)

    expect(selectedIds(matrix)).toEqual(expectedAccountIds)
    expect(matrix.include.every((entry) => entry.category === "account")).toBe(
      true,
    )
  })

  it("registers OpenCloud without replacing the live provider response", () => {
    const matrix = runMatrix("webdav", "opencloud-webdav")

    expect(matrix.include).toEqual([
      expect.objectContaining({
        id: "opencloud-webdav",
        label: "WebDAV / OpenCloud",
        category: "webdav",
        env_prefix: "OPENCLOUD_WEBDAV",
      }),
    ])
    expect(matrix.include[0]).not.toHaveProperty("simulate_upload_readback_425")
  })

  it("registers Sub2API as an independently runnable managed-site target", () => {
    const matrix = runMatrix("managed-site", "sub2api-managed-site")

    expect(matrix.include).toEqual([
      expect.objectContaining({
        id: "sub2api-managed-site",
        label: "Managed Site / Sub2API Accounts",
        category: "managed-site",
        env_prefix: "SUB2API",
        managed_site_target: "sub2api",
        resource_group: "new-api-source-account",
      }),
    ])
  })

  it("serializes only targets that share the New API source account", () => {
    const matrix = runMatrix()
    const sharedAccountTargetIds = matrix.include
      .filter((entry) => entry.resource_group === "new-api-source-account")
      .map((entry) => entry.id)

    expect(sharedAccountTargetIds).toEqual([
      "new-api-account",
      "new-api-managed-site",
      "sub2api-managed-site",
    ])
    expect(
      matrix.include.find((entry) => entry.id === "veloera-managed-site"),
    ).not.toHaveProperty("resource_group")
  })

  it("emits disjoint parallel and serialized matrices for GitHub Actions", () => {
    const output = runMatrixWithOutput()
    const fullMatrix = JSON.parse(output.matrix) as ReturnType<typeof runMatrix>
    const parallelMatrix = JSON.parse(output.parallel_matrix) as ReturnType<
      typeof runMatrix
    >
    const serializedMatrix = JSON.parse(output.serialized_matrix) as ReturnType<
      typeof runMatrix
    >

    expect(output.has_parallel).toBe("true")
    expect(output.has_serialized).toBe("true")
    expect([
      ...selectedIds(parallelMatrix),
      ...selectedIds(serializedMatrix),
    ]).toEqual(expect.arrayContaining(selectedIds(fullMatrix)))
    expect(
      new Set([
        ...selectedIds(parallelMatrix),
        ...selectedIds(serializedMatrix),
      ]).size,
    ).toBe(fullMatrix.include.length)
  })

  it("keeps a narrow shared-account target in the serialized matrix only", () => {
    const output = runMatrixWithOutput("all", "new-api-account")

    expect(output.has_parallel).toBe("false")
    expect(output.has_serialized).toBe("true")
    expect(JSON.parse(output.parallel_matrix)).toEqual({ include: [] })
    expect(selectedIds(JSON.parse(output.serialized_matrix))).toEqual([
      "new-api-account",
    ])
  })

  it("keeps a narrow independent target in the parallel matrix only", () => {
    const output = runMatrixWithOutput("all", "veloera-account")

    expect(output.has_parallel).toBe("true")
    expect(output.has_serialized).toBe("false")
    expect(selectedIds(JSON.parse(output.parallel_matrix))).toEqual([
      "veloera-account",
    ])
    expect(JSON.parse(output.serialized_matrix)).toEqual({ include: [] })
  })

  it("keeps the default all-category matrix unchanged", () => {
    const matrix = runMatrix()
    const expectedIds = ["account", "managed-site", "webdav"].flatMap(
      (category) => selectedIds(runMatrix(category, "all")),
    )

    expect(selectedIds(matrix)).toEqual(expectedIds)
  })

  it("rejects a target from a different category", () => {
    expect(() => runMatrix("account", "new-api-managed-site")).toThrow(
      /does not belong to category account/,
    )
  })
})
