# 常见问题

## 配置相关

### Q: 如何确认 HF_ENDPOINT 配置生效？

在终端中执行：

```bash
# macOS / Linux
echo $HF_ENDPOINT

# Windows CMD
echo %HF_ENDPOINT%

# Windows PowerShell
echo $env:HF_ENDPOINT
```

如输出为空，说明环境变量未设置成功。

### Q: 配置后仍然从官方下载？

可能的原因：

1. **仓库未缓存**：mini-hf 仅对已缓存的仓库提供加速服务，未缓存的仓库会回退到源站下载
2. **环境变量未生效**：请检查是否在当前 shell 会话中设置了环境变量
3. **端口错误**：确认使用的是 hf_server 端口（默认 9801），而非管理 API 端口（9800）

### Q: 如何在 Jupyter Notebook 中使用？

在 Notebook 的第一个单元格中设置环境变量：

```python
import os
os.environ["HF_ENDPOINT"] = "{{HF_ENDPOINT}}"
```

注意：必须在导入 transformers/datasets 等库之前设置。

## 任务相关

### Q: 任务一直处于「等待审批」状态？

大容量任务需要管理员审批。请联系管理员处理，或等待管理员审核。

### Q: 任务失败如何处理？

1. 点击任务查看详细错误信息
2. 常见失败原因：
   - 仓库不存在或无访问权限
   - 访问令牌无效
   - 网络连接问题
   - 存储空间不足
3. 根据错误信息修正后重新创建任务

### Q: 如何下载私有仓库？

创建任务时填写有效的 HuggingFace 访问令牌。获取令牌的方法：

1. 登录 [huggingface.co](https://huggingface.co)
2. 进入 Settings → Access Tokens
3. 创建新令牌（需要 read 权限）

### Q: 可以下载特定版本吗？

可以。在创建任务时，在「版本/分支」字段中指定：
- 分支名（如 `main`）
- Tag 名（如 `v1.0.0`）
- Commit hash（如 `a0a0a0a`）

### Q: 如何只下载部分文件？

取消勾选「全量下载」，然后配置 allow_patterns 或 ignore_patterns：

- 只下载模型文件：`allow_patterns = ["*.safetensors", "*.bin"]`
- 排除文档文件：`ignore_patterns = ["*.md", "docs/**"]`

## 使用相关

### Q: 多人可以同时使用同一个缓存吗？

可以。mini-hf 支持多人并发访问同一缓存的仓库。

### Q: 缓存的文件存储在哪里？

缓存的文件存储在 mini-hf 服务器的 S3 存储中，用户无需关心具体存储位置。

### Q: 如何查看已缓存的仓库？

通过 Web 界面的「仓库列表」页面可查看所有已缓存的仓库及其详情。

### Q: 支持断点续传吗？

支持。如果任务中断，下次启动会从断点继续下载。

## 其他问题

### Q: mini-hf 支持哪些平台？

目前支持 HuggingFace 的模型和数据集。暂不支持 ModelScope 等其他平台。

### Q: 系统有什么限制？

- 单个任务文件数量上限取决于服务器配置
- 存储空间受服务器 S3 存储容量限制
- 大容量任务需要管理员审批

### Q: 遇到问题如何寻求帮助？

请联系系统管理员或在内部工单系统中提交问题。
