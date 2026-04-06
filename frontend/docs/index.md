# 快速开始

本指南帮助您快速配置并使用 mini-hf 模型缓存系统。

## 系统简介

mini-hf 是一个 HuggingFace 模型/数据集缓存系统，适用于局域网环境。通过将常用的模型和数据集缓存到本地服务器，您可以：

- 加速模型下载，避免重复从公网下载
- 在离线环境中使用 HuggingFace 资源
- 节省带宽，多人共享同一份缓存

## 前提条件

- 您的网络环境可以访问 mini-hf 服务器
- 已安装 Python 3.8+ 和 huggingface-hub 库

## 配置方法

### macOS / Linux

在终端中执行以下命令：

```bash
export HF_ENDPOINT=http://your-server:9801
```

如需永久生效，请将上述命令添加到 `~/.bashrc` 或 `~/.zshrc` 文件中。

### Windows

**命令提示符 (CMD)：**

```cmd
set HF_ENDPOINT=http://your-server:9801
```

**PowerShell：**

```powershell
$env:HF_ENDPOINT = "http://your-server:9801"
```

如需永久生效，可在「系统属性 → 环境变量」中添加用户变量或系统变量。

## 验证配置

配置完成后，可通过以下方式验证：

```bash
# 查看当前 HF_ENDPOINT 设置
echo $HF_ENDPOINT  # macOS/Linux
echo %HF_ENDPOINT%  # Windows CMD

# 测试下载模型
huggingface-cli download bert-base-uncased
```

## 下一步

- [使用仓库](/docs/usage) - 了解如何在代码中使用缓存的模型和数据集
- [任务队列](/docs/tasks) - 了解如何创建和管理下载任务
- [常见问题](/docs/faq) - 查看常见问题解答
