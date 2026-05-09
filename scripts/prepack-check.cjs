const fs = require('node:fs')
const path = require('node:path')

const root = path.resolve(__dirname, '..')
const distDir = path.join(root, 'dist')
const forbiddenPaths = [
  path.join(root, '.env'),
  path.join(root, '.env.local'),
  path.join(root, 'output'),
]

const readEnvKey = () => {
  const envPath = path.join(root, '.env.local')
  if (!fs.existsSync(envPath)) return ''

  for (const rawLine of fs.readFileSync(envPath, 'utf8').split(/\r?\n/)) {
    const line = rawLine.trim()
    if (!line || line.startsWith('#') || !line.includes('=')) continue
    const index = line.indexOf('=')
    if (line.slice(0, index) === 'ZHENZHEN_API_KEY') return line.slice(index + 1).trim()
  }

  return ''
}

const walkFiles = dir => {
  if (!fs.existsSync(dir)) return []
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap(entry => {
    const fullPath = path.join(dir, entry.name)
    if (entry.isDirectory()) return walkFiles(fullPath)
    if (entry.isFile()) return [fullPath]
    return []
  })
}

if (!fs.existsSync(distDir)) {
  console.error('[prepack-check] dist directory is missing. Run npm run build first.')
  process.exit(1)
}

const apiKey = readEnvKey()
const forbiddenMarkers = ['.env.local']

for (const filePath of walkFiles(distDir)) {
  const text = fs.readFileSync(filePath, 'utf8')
  if (apiKey && text.includes(apiKey)) {
    console.error(`[prepack-check] API key was found in ${path.relative(root, filePath)}.`)
    process.exit(1)
  }

  const marker = forbiddenMarkers.find(value => text.includes(value))
  if (marker) {
    console.error(`[prepack-check] Forbidden marker "${marker}" was found in ${path.relative(root, filePath)}.`)
    process.exit(1)
  }
}

const notes = forbiddenPaths
  .filter(filePath => fs.existsSync(filePath))
  .map(filePath => path.relative(root, filePath))

if (notes.length > 0) {
  console.log(`[prepack-check] Local-only paths present and excluded from packaging: ${notes.join(', ')}`)
}

console.log('[prepack-check] OK: dist has no local API key markers.')
