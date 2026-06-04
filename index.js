const express = require('express')
const cors = require('cors')
const axios = require('axios')
const morgan = require('morgan')
const fs = require('fs')
const path = require('path')
const os = require('os')
const { generateRandomString } = require('./utils')

const startTime = Date.now()
const envDevPath = path.resolve(process.cwd(), '.env.dev')
const envProdPath = path.resolve(process.cwd(), '.env.prod')

if (fs.existsSync(envDevPath)) {
  require('dotenv').config({ path: envDevPath, quiet: true })
} else if (fs.existsSync(envProdPath)) {
  require('dotenv').config({ path: envProdPath, quiet: true })
} else {
  require('dotenv').config({ quiet: true })
}

// 从环境变量获取配置
const API_KEY = process.env.OPENAI_API_KEY || ''
const BASE_URL = process.env.OPENAI_BASE_URL || 'https://ollama.com:443/v1'
const HOST = process.env.HOST || '0.0.0.0'
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
