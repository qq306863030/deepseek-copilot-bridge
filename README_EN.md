# DeepSeek Copilot Bridge

[English](README_EN.md) | [中文](README.md)

A lightweight bridge service for VS Code Copilot, converting DeepSeek, MiniMax, and local model services into Ollama-compatible interfaces that Copilot can use directly.

## Features

- **Copilot Bridge** - Designed for VS Code Copilot integration, bridging interface differences between model providers
- **OpenAI Compatible** - Supports `/v1/models`, `/v1/chat/completions` and other standard endpoints
- **Multi-Model** - Connects to DeepSeek, MiniMax, and local Ollama/LM Studio backends
- **Simple Config** - Adjust model list, capabilities, and context length via environment variables

## Quick Start

```bash
# Install dependencies
npm install

# Start service
npm start     # Production (PM2)
npm run dev   # Development

# Copilot Configuration
VSCode Copilot => Manage Language Models => Add Model => Ollama => http://localhost:11435 (default port)
```

## Configuration

### Environment Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `OPENAI_API_KEY` | API key | - |
| `OPENAI_BASE_URL` | Model service URL | `https://api.deepseek.com/v1` |
| `PORT` | Service port | `11435` |
| `CONTEXT_LENGTH` | Context length | `204800` |

### CAPABILITIES

Declares the capabilities the model supports:

- `completion` - Text completion
- `tools` - Function calling
- `thinking` - Thinking capability
- `vision` - Multimodal image input

```dotenv
CAPABILITIES=["completion", "tools", "thinking"]
```

### MODELS

Manually specify model list (auto-discovered from `OPENAI_BASE_URL/models` when empty):

```dotenv
# Auto-discovery (recommended)
MODELS=[]

# Simple config
MODELS=["deepseek-v4-flash", "deepseek-v4-pro"]

# Fine-grained config (highest priority)
MODELS=`[{
    "name": "MiniMax-M3",
    "content_length": 1000000,
    "capabilities": ["completion", "tools", "thinking", "vision"]
}, {
    "name": "MiniMax-M2.7",
    "content_length": 200000,
    "capabilities": ["completion", "tools", "thinking"]
}]`
```

## Config Examples

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
MODELS=`[{
    "name": "MiniMax-M3",
    "content_length": 1000000,
    "capabilities": ["completion", "tools", "thinking", "vision"]
}, {
    "name": "MiniMax-M2.7",
    "content_length": 200000,
    "capabilities": ["completion", "tools", "thinking"]
}]`
```

### Local Service

```dotenv
OPENAI_API_KEY="sk-xxx"
OPENAI_BASE_URL="http://localhost:3001/v1"
PORT=11435
CAPABILITIES=["completion", "tools", "thinking"]
CONTEXT_LENGTH=200000
MODELS=[]
```

## API Endpoints

- `GET /v1/models` - List models

## Project Structure

```
├── index.js             # Main entry
├── utils.js             # Utilities
├── ecosystem.config.js  # PM2 config
├── .env.dev             # Dev config (loaded first)
└── .env.prod            # Production config
```
