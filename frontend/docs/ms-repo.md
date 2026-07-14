# ModelScope 仓库

本文档介绍如何使用 mini-hf 中缓存的 ModelScope 模型和数据集。

## 基本原理

设置 `MODELSCOPE_ENDPOINT` 环境变量后，ModelScope 官方库（`modelscope` / `modelscope_hub`）会自动将下载请求发送到 mini-hf 服务器，而非 ModelScope 官方服务器。

## 安装客户端

```bash
pip install modelscope
```

`modelscope` 包含命令行工具 `modelscope` 以及 Python SDK。

## 使用命令行工具

`modelscope`是 ModelScope 官方提供的命令行工具，用于下载和管理模型/数据集。

### 下载模型

```bash
# 设置环境变量
export MODELSCOPE_ENDPOINT='{{MS_ENDPOINT}}'

# 下载模型
modelscope download Qwen/Qwen3-7B

# 下载到指定目录
modelscope download Qwen/Qwen3-7B --local-dir ./models/Qwen3-7B
```

### 下载数据集

```bash
# 下载数据集
modelscope download --repo-type dataset modelscope/clue

# 下载到指定目录
modelscope download --repo-type dataset modelscope/clue --local-dir ./data/clue
```

### 下载特定文件

```bash
# 下载单个文件
modelscope download Qwen/Qwen3-7B config.json

# 下载多个文件
modelscope download Qwen/Qwen3-7B config.json generation_config.json
```

### 指定版本

```bash
# 使用特定分支或 tag（默认 master）
modelscope download Qwen/Qwen3-7B --revision v1.0.0

# 使用 commit hash
modelscope download Qwen/Qwen3-7B --revision 6d077077
```

### 访问私有仓库

```bash
# 使用访问令牌（ms- 前缀）
modelscope download --token ms-xxxxxxxxxxxx your-org/private-model

# 或通过环境变量配置
export MODELSCOPE_API_TOKEN=ms-xxxxxxxxxxxx
modelscope download your-org/private-model
```

### 文件过滤

```bash
# 只下载特定模式的文件
modelscope download Qwen/Qwen3-7B --include "*.safetensors"

# 排除特定文件
modelscope download Qwen/Qwen3-7B --exclude "*.md"
```

> **注意**：使用 `--include` / `--exclude` 时，仓库 ID 必须放在前面，否则会被当作过滤模式的一部分。

## 在 Python 代码中使用

### 使用 snapshot_download 下载

```python
import os
os.environ["MODELSCOPE_ENDPOINT"] = "{{MS_ENDPOINT}}"

from modelscope_hub import snapshot_download

# 下载模型到默认缓存目录
snapshot_download("Qwen/Qwen3-7B")

# 下载到指定目录
snapshot_download("Qwen/Qwen3-7B", local_dir="./models/Qwen3-7B")

# 下载数据集
snapshot_download("modelscope/clue", repo_type="dataset")
```

### 下载单个文件

```python
import os
os.environ["MODELSCOPE_ENDPOINT"] = "{{MS_ENDPOINT}}"

from modelscope_hub import model_file_download

# 下载单个文件
file_path = model_file_download(
    model_id="Qwen/Qwen3-7B",
    file_path="config.json"
)
```

### 在 Transformers 中加载

ModelScope 缓存的模型同样可通过 `transformers` 加载。先下载到本地目录，再用本地路径加载：

```python
import os
os.environ["MODELSCOPE_ENDPOINT"] = "{{MS_ENDPOINT}}"

from modelscope_hub import snapshot_download
from transformers import AutoModel, AutoTokenizer

# 下载到本地目录
local_path = snapshot_download("Qwen/Qwen3-7B", local_dir="./models/Qwen3-7B")

# 用本地路径加载
model = AutoModel.from_pretrained(local_path)
tokenizer = AutoTokenizer.from_pretrained(local_path)
```

## 注意事项

1. **缓存**：仓库必须先通过下载任务保存到 Mini-HF 存储中，才能在局域网中进行下载
2. **默认分支**：ModelScope 的默认分支为 `master`（不同于 HuggingFace 的 `main`）
3. **私有仓库**：所有缓存到 Mini-HF 中的仓库将对局域网中所有用户公开，请勿缓存私有仓库
