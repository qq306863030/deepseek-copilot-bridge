const fs = require('fs')
const path = require('path')
const { execSync } = require('child_process')

// 同步扫描 .env-* 配置文件
function findEnvFiles(dir) {
  try {
    return fs.readdirSync(dir)
      .filter(f => f.startsWith('.env-') && !f.includes(' '))
      .map(f => ({ file: f, name: f.replace('.env-', '') }))
  } catch (err) {
    console.error('[PM2] Failed to scan env files:', err && err.message)
    return []
  }
}

// 解析 .env 文件中的 PORT 值（同步）
function getPortFromEnvFile(envPath) {
  try {
    const content = fs.readFileSync(envPath, 'utf8')
    const match = content.match(/^PORT\s*=\s*(\d+)/m)
    return match ? parseInt(match[1], 10) : 11435
  } catch (err) {
    return 11435
  }
}

// 同步检查端口是否被占用。Windows 使用 netstat+findstr，类 Unix 使用 lsof。
function isPortInUseSync(port) {
  try {
    if (process.platform === 'win32') {
      // netstat 返回有结果时退出码为 0；无结果时 findstr 返回非0，会抛出。
      execSync(`netstat -ano | findstr :${port}`, { stdio: 'ignore', shell: true })
      return true
    } else {
      execSync(`lsof -i :${port} -sTCP:LISTEN`, { stdio: 'ignore', shell: true })
      return true
    }
  } catch (err) {
    return false
  }
}

function generateAppsSync() {
  const dir = process.cwd()
  const envFiles = findEnvFiles(dir)

  if (envFiles.length === 0) {
    return [{
      name: 'deepseek-copilot-bridge',
      script: 'index.js',
      instances: 1,
      autorestart: true,
      watch: false,
      max_memory_restart: '1G',
      env: { NODE_ENV: 'development' },
      env_production: { NODE_ENV: 'production' },
      error_file: './logs/error.log',
      out_file: './logs/out.log',
      log_date_format: 'YYYY-MM-DD HH:mm:ss',
      merge_logs: true
    }]
  }

  // 检查端口重复配置
  const portMap = new Map()
  for (const { file, name } of envFiles) {
    const envPath = path.join(dir, file)
    const port = getPortFromEnvFile(envPath)
    if (portMap.has(port)) {
      throw new Error(`[PM2] Port conflict: ${file} and ${portMap.get(port)} both use port ${port}`)
    }
    portMap.set(port, file)
  }

  // 同步检测端口是否被其他进程占用
  for (const [port, file] of portMap) {
    const inUse = isPortInUseSync(port)
    if (inUse) {
      throw new Error(`[PM2] Port ${port} is already in use by another process (configured by ${file})`)
    }
  }

  console.log(`[PM2] Found ${envFiles.length} env config(s):`, envFiles.map(e => e.file).join(', '))

  return envFiles.map(({ file, name }) => ({
    name: `copilot-bridge-${name}`,
    script: 'index.js',
    args: `--config ${file}`,
    instances: 1,
    autorestart: true,
    watch: false,
    max_memory_restart: '1G',
    env: { NODE_ENV: 'development' },
    env_production: { NODE_ENV: 'production' },
    error_file: `./logs/error-${name}.log`,
    out_file: `./logs/out-${name}.log`,
    log_date_format: 'YYYY-MM-DD HH:mm:ss',
    merge_logs: true
  }))
}

module.exports = {
  apps: generateAppsSync()
}
