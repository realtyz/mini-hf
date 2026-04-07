# Huggingface仓库

本文档介绍如何使用 mini-hf 中缓存的 Huggingface 模型和数据集。

## 基本原理

设置 `HF_ENDPOINT` 环境变量后，HuggingFace 官方库（transformers、datasets、huggingface-hub 等）会自动将请求发送到 mini-hf 服务器，而非 HuggingFace 官方服务器。


## 使用命令行工具

`hf` 是 HuggingFace 官方推荐的命令行工具，用于下载和管理模型/数据集。

### 下载模型

```bash
# 设置环境变量
export HF_ENDPOINT=http://your-server:9801

# 下载模型
hf download bert-base-uncased

# 下载到指定目录
hf download bert-base-uncased --local-dir ./models/bert
```

### 下载数据集

```bash
# 下载数据集
hf download --repo-type dataset imdb

# 下载到指定目录
hf download --repo-type dataset imdb --local-dir ./data/imdb
```

### 下载特定文件

```bash
# 下载单个文件
hf download bert-base-uncased config.json

# 下载多个文件
hf download bert-base-uncased config.json pytorch_model.bin
```

### 指定版本

```bash
# 使用特定分支或 tag
hf download bert-base-uncased --revision v1.0.0

# 使用 commit hash
hf download bert-base-uncased --revision a0
```

### 访问私有仓库

```bash
# 使用访问令牌
hf download your-org/private-model --token hf_xxxxxxxxxxxx
```

### 文件过滤

```bash
# 只下载特定模式的文件
hf download bert-base-uncased --include "*.safetensors"

# 排除特定文件
hf download bert-base-uncased --exclude "*.md"
```

## 在 Python 代码中使用

### 使用 Transformers 加载模型

```python
import os
os.environ["HF_ENDPOINT"] = "http://your-server:9801"

from transformers import AutoModel, AutoTokenizer

# 加载已缓存的模型
model = AutoModel.from_pretrained("bert-base-uncased")
tokenizer = AutoTokenizer.from_pretrained("bert-base-uncased")
```

### 使用 Datasets 加载数据集

```python
import os
os.environ["HF_ENDPOINT"] = "http://your-server:9801"

from datasets import load_dataset

# 加载已缓存的数据集
dataset = load_dataset("imdb", split="train")
```

### 使用 huggingface-hub 下载文件

```python
import os
os.environ["HF_ENDPOINT"] = "http://your-server:9801"

from huggingface_hub import hf_hub_download

# 下载单个文件
file_path = hf_hub_download(
    repo_id="bert-base-uncased",
    filename="config.json"
)
```

### 指定版本下载

```python
from transformers import AutoModel

model = AutoModel.from_pretrained(
    "bert-base-uncased",
    revision="v1.0.0"  # 使用特定 tag
)

# 或使用 commit hash
model = AutoModel.from_pretrained(
    "bert-base-uncased",
    revision="a0"
)
```


## 注意事项

1. **缓存**：仓库必须先通过下载任务保存到 Mini-HF 存储中，才能在局域网中进行下载
2. **私有仓库**：所有缓存到 Mini-HF 中的仓库将对局域网中所有用户公开，请勿缓存私有仓库
