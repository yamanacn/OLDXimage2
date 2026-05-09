import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { dirname, extname } from 'node:path'

export type EnvValues = Record<string, string | undefined>

export interface ServerRuntime {
  env: EnvValues;
  configFile: string;
  defaultOutputDir: string;
}

type RuntimeSettings = Record<string, string>

export const createServerRuntime = (runtime: {
  env?: EnvValues;
  configFile: string;
  defaultOutputDir: string;
}): ServerRuntime => ({
  env: runtime.env || {},
  configFile: runtime.configFile,
  defaultOutputDir: runtime.defaultOutputDir,
})

const parseDotEnv = (content: string): RuntimeSettings =>
  Object.fromEntries(
    content
      .split(/\r?\n/)
      .map(line => line.trim())
      .filter(line => line && !line.startsWith('#') && line.includes('='))
      .map(line => {
        const index = line.indexOf('=')
        return [line.slice(0, index), line.slice(index + 1)]
      })
  )

const stringifyDotEnv = (values: RuntimeSettings) =>
  `${Object.entries(values)
    .filter(([, value]) => value !== '')
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')}\n`

export const readRuntimeSettings = (runtime: ServerRuntime): RuntimeSettings => {
  if (!existsSync(runtime.configFile)) return {}

  const content = readFileSync(runtime.configFile, 'utf8')
  if (extname(runtime.configFile).toLowerCase() !== '.json') return parseDotEnv(content)

  try {
    const parsed = JSON.parse(content) as unknown
    if (!parsed || typeof parsed !== 'object') return {}

    return Object.fromEntries(
      Object.entries(parsed as Record<string, unknown>)
        .filter(([, value]) => typeof value === 'string')
    ) as RuntimeSettings
  } catch {
    return {}
  }
}

export const writeRuntimeSettings = (runtime: ServerRuntime, nextValues: RuntimeSettings) => {
  const current = readRuntimeSettings(runtime)
  const merged = { ...current, ...nextValues }
  mkdirSync(dirname(runtime.configFile), { recursive: true })

  if (extname(runtime.configFile).toLowerCase() === '.json') {
    const clean = Object.fromEntries(Object.entries(merged).filter(([, value]) => value !== ''))
    writeFileSync(runtime.configFile, `${JSON.stringify(clean, null, 2)}\n`, 'utf8')
    return
  }

  writeFileSync(runtime.configFile, stringifyDotEnv(merged), 'utf8')
}
