# DeepSeek Copilot Bridge

[English](README_EN.md) | [中文](README.md)

A lightweight bridge service for VS Code Copilot, converting DeepSeek, Qwen, MiniMax, and local model services into Ollama-compatible interfaces that Copilot can use directly.

<p align="center">
  <img src="img/img1.jpg" alt="DeepSeek Copilot Bridge Screenshot 1" width="45%" />
</p>
<p align="center">
  <img src="img/img2.jfif" alt="DeepSeek Copilot Bridge Screenshot 2" width="45%" />
</p>

## Features

- **Copilot Bridge** - Designed for VS Code Copilot integration, bridging interface differences between model providers
- **OpenAI Compatible** - Supports `/v1/models`, `/v1/chat/completions` and other standard endpoints
- **Multi-Model** - Connects to DeepSeek, MiniMax, Qwen, and local Ollama/LM Studio backends
- **Simple Config** - Adjust model list, capabilities, and context length via environment variables

## Quick Start

```bash
# Install dependencies
npm install

# Edit your environment file (for example, .env.prod)
# The bridge supports any OpenAI-compatible backend: DeepSeek, MiniMax, Qwen, local Ollama/LM Studio, etc.

# Start the service (choose one)
## PM2 (background / production)
npm start    # Production (ecosystem.config.js will scan .env-* files, then .env.prod)

## Node.js (foreground / development)
node index.js [--config .env.prod]

# Copilot configuration in VS Code
# 1. VSCode Copilot -> Manage Language Models
# 2. Add Model -> Ollama
# 3. Enter the bridge URL: http://localhost:11435 (default port)
# 4. Select a model

# Optional: configure Copilot to auto-start the selected local model on boot
# VSCode Copilot -> Select Local Model -> enter the option to set this project to start automatically on boot
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
MODELS=
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
MODELS=
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

### Local Service

```dotenv
OPENAI_API_KEY="sk-xxx"
OPENAI_BASE_URL="http://localhost:3001/v1"
PORT=11435
CAPABILITIES=["completion", "tools", "thinking"]
CONTEXT_LENGTH=200000
MODELS=[]
```

## Start multiple services (PM2)

The project supports creating multiple environment files in the repository root that start with `.env-` (for example `.env-1`, `.env-qa`, `.env-prod`). The `ecosystem.config.js` will automatically scan these files and create a separate PM2 process for each.

- Each process is started with an equivalent command: `node index.js --config <env-file>`, e.g. `node index.js --config .env-1`.

Example:

1. Create two env files `.env-1` and `.env-2` (example contents):

```powershell
# .env-1
OPENAI_API_KEY="sk-xxx-1"
OPENAI_BASE_URL="https://api.deepseek.com"
PORT=11435
CAPABILITIES=["completion","tools","thinking"]

# .env-2
OPENAI_API_KEY="sk-xxx-2"
OPENAI_BASE_URL="http://localhost:3001/v1"
PORT=11436
CAPABILITIES=["completion","tools"]
```

2. Start all processes with PM2:

```powershell
npm run start
```

3. Troubleshooting:

- `Port conflict` means two env files define the same `PORT` — change one of them;
- `Port <n> is already in use` means the port is taken by another process — free it or change the `PORT`.

This makes it easy to run multiple instances with different configurations on the same host for testing or traffic segregation.

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
