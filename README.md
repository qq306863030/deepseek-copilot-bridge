# DeepSeek Copilot Bridge

[English](README_EN.md) | 中文

为 VS Code 中的 Copilot 提供模型适配桥接的轻量服务，可将 DeepSeek、Qwen、MiniMax 以及本地模型服务统一转换为 Copilot 可以直接使用的Ollama接口。

## 功能特性

- **Copilot 桥接** - 面向 VS Code Copilot 的接入场景，补齐不同模型服务之间的接口适配
- **OpenAI 兼容** - 支持 `/v1/models`、`/v1/chat/completions` 等标准端点
- **多模型接入** - 可桥接 DeepSeek、MiniMax 以及本地 Ollama/LM Studio 等后端
- **配置简单** - 通过环境变量即可调整模型列表、能力声明和上下文长度

## 快速开始

```bash
# 安装依赖
npm install

# 修改.env.prod文件
支持所有OpenAI规范的服务：DeepSeek、MiniMax、Qwen等

# 启动服务(两种方式选一种)
## PM2启动服务
npm start     # 生产环境 (PM2)

## Nodejs启动服务
npm run dev   # 开发环境

# Copilot配置
VSCode Copilot => 管理语言模型 => 添加模型 => Ollama => http://localhost:11435 (项目默认端口11435)
```

## 配置说明

### 环境变量

| 变量 | 说明 | 默认值 |
|------|------|--------|
| `OPENAI_API_KEY` | API 密钥 | - |
| `OPENAI_BASE_URL` | 模型服务地址 | `https://api.deepseek.com/v1` |
| `PORT` | 服务监听端口 | `11435` |
| `CONTEXT_LENGTH` | 上下文长度 | `204800` |

### CAPABILITIES

声明模型支持的能力数组，可选值：

- `completion` - 文本补全
- `tools` - 函数调用
- `thinking` - 思考能力
- `vision` - 多模态图像输入能力

```dotenv
CAPABILITIES=["completion", "tools", "thinking"]
```

### MODELS

手动指定模型列表（为空时自动从 `OPENAI_BASE_URL/models` 获取）：

```dotenv
# 自动发现（推荐）
MODELS=[]

# 手动配置
MODELS=["deepseek-v4-flash", "deepseek-v4-pro"]

# 细粒度手动配置（优先级最高）
MODELS=`
[{
    "name": "MiniMax-M3",
    "content_length": 1000000,
    "capabilities": ["completion", "tools", "thinking", "vision"]
},
{
    "name": "MiniMax-M2.7",
    "content_length": 200000,
    "capabilities": ["completion", "tools", "thinking"]
}]
`
```

## 配置示例

### DeepSeek

```dotenv
OPENAI_API_KEY="sk-xxxxxxxx"
OPENAI_BASE_URL="https://api.deepseek.com"
PORT=11435
CAPABILITIES=["completion", "tools", "thinking"]
CONTEXT_LENGTH=1000000
MODELS=[]
```

### MiniMax

```dotenv
OPENAI_API_KEY="sk-api-xxxxxxxx"
OPENAI_BASE_URL="https://api.minimaxi.com/v1"
PORT=11435
CAPABILITIES=[]
CONTEXT_LENGTH=0
MODELS=`
[{
    "name": "MiniMax-M3",
    "content_length": 1000000,
    "capabilities": ["completion", "tools", "thinking", "vision"]
},
{
    "name": "MiniMax-M2.7",
    "content_length": 200000,
    "capabilities": ["completion", "tools", "thinking"]
}]
`
```

### 本地服务

```dotenv
OPENAI_API_KEY="sk-xxx"
OPENAI_BASE_URL="http://localhost:3001/v1"
PORT=11435
CAPABILITIES=["completion", "tools", "thinking"]
CONTEXT_LENGTH=200000
MODELS=[]
```

## API 端点

服务启动后提供以下端点：
- `GET /v1/models` - 获取模型列表

## 目录结构

```
├── index.js          # 主入口
├── utils.js          # 工具函数
├── ecosystem.config.js  # PM2 配置
├── .env.dev          # 开发环境配置（优先读取）
└── .env.prod         # 生产环境配置
```
