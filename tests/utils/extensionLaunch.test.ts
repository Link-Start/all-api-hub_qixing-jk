import path from "node:path"
import { describe, expect, it } from "vitest"

import { buildExtensionLaunchOptions } from "~~/e2e/utils/extensionLaunch"

describe("buildExtensionLaunchOptions", () => {
  it("forces modern headless when running an explicit Chrome binary for extension E2E", () => {
    const options = buildExtensionLaunchOptions({
      extensionDir: "/repo/.output/chrome-mv3-e2e",
      headless: true,
      chromeExecutablePath: "/opt/chrome-116/chrome",
    })

    expect(options.args).toContain("--headless=new")
    expect(options.ignoreDefaultArgs).toContain("--headless")
    expect(options.ignoreDefaultArgs).toContain("--disable-extensions")
    expect(options.executablePath).toBe(path.resolve("/opt/chrome-116/chrome"))
    expect(options.channel).toBeUndefined()
  })

  it("keeps Playwright Chromium on its channel-based new headless path", () => {
    const options = buildExtensionLaunchOptions({
      extensionDir: "/repo/.output/chrome-mv3-e2e",
      headless: true,
    })

    expect(options.args).not.toContain("--headless=new")
    expect(options.ignoreDefaultArgs).not.toContain("--headless")
    expect(options.channel).toBe("chromium")
    expect(options.executablePath).toBeUndefined()
  })

  it("does not inject headless flags for headed debugging", () => {
    const options = buildExtensionLaunchOptions({
      extensionDir: "/repo/.output/chrome-mv3-e2e",
      headless: false,
      chromeExecutablePath: "/opt/chrome-116/chrome",
    })

    expect(options.args).not.toContain("--headless=new")
    expect(options.ignoreDefaultArgs).not.toContain("--headless")
    expect(options.executablePath).toBe(path.resolve("/opt/chrome-116/chrome"))
  })
})
