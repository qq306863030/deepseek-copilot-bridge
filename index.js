const express = require('express')
const cors = require('cors')
const axios = require('axios')
const morgan = require('morgan')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { generateRandomString } = require('./utils')

const startTime = Date.now()

// 解析命令行参数 --config <path>
const args = process.argv.slice(2)
const configIndex = args.indexOf('--config')
let envPath = null
if (configIndex !== -1 && args[configIndex + 1]) {
  envPath = path.resolve(process.cwd(), args[configIndex + 1])
}

// 根据是否有传入配置文件选择加载逻辑
if (envPath) {
  if (fs.existsSync(envPath)) {
    require('dotenv').config({ path: envPath, quiet: true })
    console.log(`[env] Loaded config from: ${envPath}`)
  } else {
    console.warn(`[env] Config file not found: ${envPath}, fallback to default logic`)
    const envDevPath = path.resolve(process.cwd(), '.env.dev')
    const envProdPath = path.resolve(process.cwd(), '.env.prod')
    if (fs.existsSync(envDevPath)) {
      require('dotenv').config({ path: envDevPath, quiet: true })
    } else if (fs.existsSync(envProdPath)) {
      require('dotenv').config({ path: envProdPath, quiet: true })
    } else {
      require('dotenv').config({ quiet: true })
    }
  }
} else {
  const envDevPath = path.resolve(process.cwd(), '.env.dev')
  const envProdPath = path.resolve(process.cwd(), '.env.prod')
  if (fs.existsSync(envDevPath)) {
    require('dotenv').config({ path: envDevPath, quiet: true })
  } else if (fs.existsSync(envProdPath)) {
    require('dotenv').config({ path: envProdPath, quiet: true })
  } else {
    require('dotenv').config({ quiet: true })
  }
}

// 从环境变量获取配置
const API_KEY = process.env.OPENAI_API_KEY || ''
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://api.deepseek.com'
const HOST = '0.0.0.0'
const parseIntEnv = (value, fallback) => {
  const parsed = parseInt(String(value ?? ''), 10)
  return Number.isNaN(parsed) ? fallback : parsed
}

const parseJsonEnv = (envName, fallback) => {
  const raw = process.env[envName]
  if (!raw || raw.trim() === '') {
    return fallback
  }

  try {
    return JSON.parse(raw)
  } catch (error) {
    console.warn(
      `[env] ${envName} JSON parse failed, fallback will be used: ${error.message}`,
    )
    return fallback
  }
}

const PORT = parseIntEnv(process.env.PORT, 11435)
const CAPABILITIES = parseJsonEnv('CAPABILITIES', [
  'completion',
  'tools',
  'thinking',
])
const CONTEXT_LENGTH = parseIntEnv(process.env.CONTEXT_LENGTH, 200 * 1024)
let MODELS = parseJsonEnv('MODELS', [])

if (MODELS.length === 0) {
  axios
    .get(`${BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    })
    .then((response) => {
      MODELS = (response.data.data || []).map((model) => {
        return {
          ...model,
          name: model.id,
          content_length: CONTEXT_LENGTH,
          capabilities: CAPABILITIES,
          digest: generateRandomString(),
        }
      })
    })
    .catch((error) => {
      console.error(
        `Error fetching models from ${BASE_URL}/models:`,
        error.message,
      )
    })
} else {
  MODELS = MODELS.map((model) => {
    if (typeof model === 'object') {
      const modelId =
        model.id ||
        model.name ||
        'model-' + Math.random().toString(36).substring(2, 8)
      return {
        id: modelId,
        object: 'model',
        created: 1626777600,
        owned_by: 'custom',
        permission: null,
        root: 'custom',
        parent: 'custom',
        name: modelId,
        content_length: CONTEXT_LENGTH,
        capabilities: CAPABILITIES,
        digest: generateRandomString(),
        ...model,
      }
    } else {
      model = String(model)
      return {
        id: model,
        object: 'model',
        created: 1626777600,
        owned_by: 'custom',
        permission: null,
        root: 'custom',
        parent: 'custom',
        name: model,
        content_length: CONTEXT_LENGTH,
        capabilities: CAPABILITIES,
        digest: generateRandomString(),
      }
    }
  })
}

// 将 SSE（Server-Sent Events）格式的流式输出聚合为 OpenAI-compatible 的 chat completion 对象
function parseSSEToChatCompletion(sseText, modelName) {
  if (!sseText || typeof sseText !== 'string') return null

  const events = sseText.split(/\n\n/)
  const choices = {}
  const roles = {}
  const finishReasons = {}
  let any = false

  for (const ev of events) {
    const lines = ev.split(/\n/).map((l) => l.trim()).filter(Boolean)
    if (lines.length === 0) continue

    // 收集 data: 行内容（支持多 data: 行）
    const dataLines = lines
      .filter((l) => l.startsWith('data:'))
      .map((l) => l.replace(/^data:\s?/, ''))
    if (dataLines.length === 0) continue

    const payload = dataLines.join('\n').trim()
    if (payload === '[DONE]') continue

    let obj
    try {
      obj = JSON.parse(payload)
    } catch (e) {
      continue
    }

    any = true
    const chs = obj.choices || []
    chs.forEach((ch, idx) => {
      const i = typeof ch.index === 'number' ? ch.index : idx
      if (!choices[i]) choices[i] = ''

      if (ch.delta) {
        if (ch.delta.content) choices[i] += ch.delta.content
        if (ch.delta.role) roles[i] = ch.delta.role
      } else if (ch.message) {
        if (typeof ch.message.content === 'string') {
          choices[i] += ch.message.content
        } else if (
          ch.message.content &&
          Array.isArray(ch.message.content.parts)
        ) {
          choices[i] += ch.message.content.parts.join('')
        }
        if (ch.message.role) roles[i] = ch.message.role
      } else if (ch.text) {
        choices[i] += ch.text
      }

      if (ch.finish_reason) finishReasons[i] = ch.finish_reason
    })
  }

  if (!any) return null

  const resultChoices = Object.keys(choices)
    .map((k) => Number(k))
    .sort((a, b) => a - b)
    .map((key) => ({
      index: key,
      message: { role: roles[key] || 'assistant', content: (choices[key] || '').trim() },
      finish_reason: finishReasons[key] || 'stop',
    }))

  return {
    id: 'chatcmpl-' + Math.random().toString(36).slice(2, 10),
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model: modelName || 'unknown',
    choices: resultChoices,
    usage: { prompt_tokens: 0, completion_tokens: 0, total_tokens: 0 },
  }
}

const app = express()

app.use(cors())
app.use(express.json({ limit: '50mb' }))
app.use(morgan('dev'))

// GET /api/tags - 获取模型列表
app.get('/api/tags', (req, res) => {
  res.json({
    models: MODELS.map((model, index) => {
      return {
        name: model.id,
        model: model.id,
        remote_model: model.id,
        remote_host: BASE_URL,
        modified_at: '2026-06-03T17:24:49.5524566+08:00',
        size: 342,
        digest: model.digest,
        details: {
          parent_model: '',
          format: '',
          family: '',
          families: null,
          parameter_size: '',
          quantization_level: '',
          context_length: model.content_length,
        },
        capabilities: model.capabilities,
      }
    }),
  })
})

// POST /api/show - 显示模型详情
app.post('/api/show', (req, res) => {
  const { model:name } = req.body
  let model = MODELS.find((m) => m.id === name)
  if (!model) {
    model = MODELS[0] // 如果没有找到，默认使用第一个模型
  }
  res.json({
    name: model.id,
    details: {
      parent_model: model.parent,
      format: '',
      family: model.root,
      families: null,
      parameter_size: '32682372656',
      quantization_level: 'BF16',
    },
    model_info: {
      'custom.context_length': model.content_length,
      'custom.embedding_length': 5376,
      'general.architecture': 'custom',
      'general.parameter_count': 32682372656,
    },
    capabilities: model.capabilities,
    modified_at: model.created
      ? new Date(model.created * 1000).toISOString()
      : '2026-04-02T09:00:00-08:00',
  })
})

// GET /v1/models - 列出模型（OpenAI兼容格式）
app.get('/v1/models', (req, res) => {
  res.json({
    object: 'list',
    data: MODELS.map((model, index) => ({
      id: model.id,
      object: 'model',
      created: model.created || 1780478689,
      owned_by: 'library',
      name: model.id,
      content_length: model.content_length,
      capabilities: model.capabilities,
    })),
  })
})

// POST /v1/chat/completions - 聊天补全（OpenAI兼容格式）
app.post('/v1/chat/completions', async (req, res) => {
  try {
    const isStream = req.body.stream === true
    const requestModel =
      req.body.model || (MODELS[0] && MODELS[0].id) || DEFAULT_VALUES.model.name

    if (isStream) {
      // 流式响应：直接转发
      const response = await axios.post(
        `${BASE_URL}/chat/completions`,
        req.body,
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          responseType: 'stream',
        },
      )

      res.setHeader('Content-Type', 'text/event-stream')
      res.setHeader('Cache-Control', 'no-cache')
      res.setHeader('Connection', 'keep-alive')

      response.data.on('data', (chunk) => {
        res.write(chunk)
      })

      response.data.on('end', () => {
        res.end()
      })

      response.data.on('error', (error) => {
        res.end()
      })
    } else {
      // 非流式响应：聚合SSE数据
      const response = await axios.post(
        `${BASE_URL}/chat/completions`,
        { ...req.body, stream: true }, // 强制请求流式数据以便聚合
        {
          headers: {
            Authorization: `Bearer ${API_KEY}`,
            'Content-Type': 'application/json',
          },
          responseType: 'text',
        },
      )

      const aggregatedResponse = parseSSEToChatCompletion(
        response.data,
        requestModel,
      )

      if (!aggregatedResponse) {
        throw new Error('Failed to aggregate response: no valid chunks found')
      }

      res.json(aggregatedResponse)
    }
  } catch (error) {
    console.error('Error processing chat completion request:', error.message)
    const errorResponse = {
      error: {
        message: error.message,
        type: 'invalid_request_error',
        param: null,
        code: null,
      },
    }
    res.status(500).json(errorResponse)
  }
})

// GET /api/version - 获取ollama版本信息
app.get('/api/version', (req, res) => {
  res.json({
    version: '0.30.2',
  })
})

app.listen(PORT, HOST, () => {
  const interfaces = os.networkInterfaces()
  const addresses = []

  Object.values(interfaces).forEach((ifaceList) => {
    ifaceList.forEach((iface) => {
      if (iface.family === 'IPv4' && !iface.internal) {
        addresses.push(iface.address)
      }
    })
  })

  console.log(
    `Ollama Mock Server v1.0.0  ready in ${Date.now() - startTime} ms\n`,
  )
  console.log(`  ➜  Local:   http://localhost:${PORT}`)
  addresses.forEach((ip) => {
    console.log(`  ➜  Network: http://${ip}:${PORT}`)
  })
})
