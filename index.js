const express = require('express')
const cors = require('cors')
const axios = require('axios')
const morgan = require('morgan')
const fs = require('fs')
const path = require('path')

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
const PORT = parseInt(process.env.PORT || '11435')
const CAPABILITIES = JSON.parse(
  process.env.CAPABILITIES || '["tools", "vision", "thinking"]',
)
const CONTEXT_LENGTH = parseInt(process.env.CONTEXT_LENGTH || 200 * 1024)
let MODELS = JSON.parse(process.env.MODELS || '[]')

if (MODELS.length === 0) {
  axios
    .get(`${BASE_URL}/models`, {
      headers: {
        Authorization: `Bearer ${API_KEY}`,
      },
    })
    .then((response) => {
      MODELS = response.data.data || []
    })
    .catch((error) => {
      console.error(`Error fetching models from ${BASE_URL}/models:`, error.message)
    })
} else {
  MODELS = MODELS.map((model) => {
    if (typeof model === 'string') {
      return {
        id: model,
        object: 'model',
        created: 1626777600,
        owned_by: 'custom',
        permission: null,
        root: 'custom',
        parent: 'custom',
      }
    } else {
      return model
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
        digest:
          'c382fbfbc73b6fdd08c8549c23caedc6e62eb09933c65a1fb82dbf3398320a4' +
          index,
        details: {
          parent_model: '',
          format: '',
          family: '',
          families: null,
          parameter_size: '',
          quantization_level: '',
          context_length: CONTEXT_LENGTH,
        },
        capabilities: CAPABILITIES,
      }
    }),
  })
})

// POST /api/show - 显示模型详情
app.post('/api/show', (req, res) => {
  const { name } = req.body
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
      'custom.context_length': CONTEXT_LENGTH,
      'custom.embedding_length': 5376,
      'general.architecture': 'custom',
      'general.parameter_count': 32682372656,
    },
    capabilities: CAPABILITIES,
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
    })),
  })
})

// POST /v1/chat/completions - 聊天补全（OpenAI兼容格式）
app.post('/v1/chat/completions', async (req, res) => {
  try {
      const isStream = req.body.stream === true;
      const requestModel = req.body.model || MODELS[0] || DEFAULT_VALUES.model.name;
      
      if (isStream) {
        // 流式响应：直接转发
        const response = await axios.post(
          `${BASE_URL}/chat/completions`,
          req.body,
          {
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Content-Type': 'application/json'
            },
            responseType: 'stream'
          }
        );
  
        res.setHeader('Content-Type', 'text/event-stream');
        res.setHeader('Cache-Control', 'no-cache');
        res.setHeader('Connection', 'keep-alive');
  
        response.data.on('data', (chunk) => {
          res.write(chunk);
        });
  
        response.data.on('end', () => {
          res.end();
        });
  
        response.data.on('error', (error) => {
          res.end();
        });
      } else {
        // 非流式响应：聚合SSE数据
        const response = await axios.post(
          `${BASE_URL}/chat/completions`,
          { ...req.body, stream: true }, // 强制请求流式数据以便聚合
          {
            headers: {
              'Authorization': `Bearer ${API_KEY}`,
              'Content-Type': 'application/json'
            },
            responseType: 'text'
          }
        );
  
        const aggregatedResponse = parseSSEToChatCompletion(response.data, requestModel);
        
        if (!aggregatedResponse) {
          throw new Error('Failed to aggregate response: no valid chunks found');
        }
  
        res.json(aggregatedResponse);
      }
    } catch (error) {
      const errorResponse = { 
        error: {
          message: error.message,
          type: 'invalid_request_error',
          param: null,
          code: null
        }
      };
      res.status(500).json(errorResponse);
    }
})

// GET /api/version - 获取ollama版本信息
app.get('/api/version', (req, res) => {
  res.json({
    version: '0.30.2',
  })
})

const os = require('os')

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

  console.log(`Ollama Mock Server v1.0.0  ready in ${Date.now() - startTime} ms\n`)
  console.log(`  ➜  Local:   http://localhost:${PORT}`)
  addresses.forEach((ip) => {
    console.log(`  ➜  Network: http://${ip}:${PORT}`)
  })
})
