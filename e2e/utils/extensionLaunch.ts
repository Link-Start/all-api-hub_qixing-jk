import path from "node:path"
import type { BrowserContextOptions } from "@playwright/test"

type ExtensionLaunchOptions = {
  extensionDir: string
  headless: boolean
  chromeExecutablePath?: string | null
}

type ChromiumPersistentLaunchOptions = BrowserContextOptions & {
  args: string[]
  channel?: "chromium"
  executablePath?: string
  headless: boolean
  ignoreDefaultArgs: string[]
}

/**
 * Build Chromium launch options for MV3 extension E2E.
 *
 * Older Chrome binaries still route Playwright's plain --headless flag through
 * legacy headless, which does not load extensions reliably. Chromium removed
 * legacy headless from the main Chrome binary in 132, matching the observed
 * compat split where 114-122 hang but 144+ pass. Keep extension E2E on the
 * modern headless path explicitly.
 */
export function buildExtensionLaunchOptions({
  extensionDir,
  headless,
  chromeExecutablePath,
}: ExtensionLaunchOptions): ChromiumPersistentLaunchOptions {
  const args = [
    `--disable-extensions-except=${extensionDir}`,
    `--load-extension=${extensionDir}`,
    "--no-default-browser-check",
    "--no-first-run",
  ]

  const ignoreDefaultArgs = ["--disable-extensions"]

  if (headless && chromeExecutablePath) {
    args.push("--headless=new")
    ignoreDefaultArgs.push("--headless")
  }

  return {
    headless,
    args,
    ignoreDefaultArgs,
    ...(chromeExecutablePath
      ? { executablePath: path.resolve(process.cwd(), chromeExecutablePath) }
      : {}),
    ...(headless && !chromeExecutablePath
      ? { channel: "chromium" as const }
      : {}),
  }
}
