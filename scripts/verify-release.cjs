const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const releaseDir = path.join(root, 'release')
const envPath = path.join(root, '.env.local')

const readEnvKey = () => {
  if (!fs.existsSync(envPath)) return ''

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    if (line.slice(0, index) === 'ZHENZHEN_API_KEY') return line.slice(index + 1).trim()
  }

  return ''
}

const walk = dir => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walk(fullPath)
    if (entry.isFile()) return [fullPath]
    return []
  })
}

const apiKey = readEnvKey()
const hits = []

for (const filePath of walk(releaseDir)) {
  const relative = path.relative(root, filePath)
  if (path.basename(filePath).startsWith('.env')) hits.push(relative)
  if (relative.split(path.sep).includes('output')) hits.push(relative)
  if (fs.statSync(filePath).size > 25 * 1024 * 1024) continue

  try {
    const text = fs.readFileSync(filePath, 'utf8')
    if (apiKey && text.includes(apiKey)) hits.push(relative)
    if (text.includes('.env.local')) hits.push(relative)
  } catch {
    // Binary files are checked by path and skipped for text-only markers.
  }
}

if (hits.length > 0) {
  console.error(`[verify-release] Sensitive release content found:\n${hits.join('\n')}`)
  process.exit(1)
}

console.log('[verify-release] OK: release has no .env, output directory, .env.local marker, or local API key value.')
