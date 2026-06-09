const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

function scanEnvFiles(dir) {
  try {
    return fs
      .readdirSync(dir)
      .filter((file) => file.startsWith('.env-') && !file.includes(' '))
      .map((file) => `copilot-bridge-${file.replace('.env-', '')}`)
  } catch (error) {
    return []
  }
}

function getProcessNames() {
  const projectRoot = __dirname
  const names = new Set(['deepseek-copilot-bridge'])

  for (const name of scanEnvFiles(projectRoot)) {
    names.add(name)
  }

  return Array.from(names)
}

function getRunningNames() {
  try {
    const output = execSync('pm2 jlist', { encoding: 'utf8', shell: true })
    const processes = JSON.parse(output)
    return new Set(
      processes
        .map((process) => process && process.name)
        .filter((name) => typeof name === 'string' && name.length > 0),
    )
  } catch (error) {
    const message = String(error && error.message ? error.message : '')
    const output = String(error && error.stdout ? error.stdout.toString() : '')
    if (/\[PM2\]|\[WARN\]/.test(message + output)) {
      return new Set()
    }

    throw error
  }
}

const targetNames = getProcessNames()
const runningNames = getRunningNames()
const namesToRemove = targetNames.filter((name) => runningNames.has(name))

if (namesToRemove.length === 0) {
  process.exit(0)
}

try {
  execSync(`pm2 delete ${namesToRemove.map((name) => `"${name}"`).join(' ')}`, {
    stdio: 'inherit',
    shell: true,
  })
  process.exit(0)
} catch (error) {
  const message = String(error && error.message ? error.message : '')
  const output = String(error && error.stderr ? error.stderr.toString() : '')
  if (/not found|does not exist|No such process|Process or Namespace/.test(message + output)) {
    process.exit(0)
  }

  console.error('[stop] Failed to delete PM2 processes')
  console.error(error && error.message ? error.message : error)
  process.exit(1)
}