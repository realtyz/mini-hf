# 文件下载器断点续传修复计划

## 审查范围

[downloader.py](packages/worker/src/worker/handlers/downloader.py) — `HttpFileDownloader` 类的全部代码路径。

---

## 🔴 Bug 1：HEAD 预检携带 Range 头导致 `expected_size` 被污染

### 根因

`download()` 在第 285 行将 `Range: bytes={downloaded_size}-` 写入 `request_headers`，随后在第 293 行将 **同一份 headers** 传入 `_do_head_check()`。`_do_head_check()`（第 748 行）无条件复制全部 headers 并发送 HEAD 请求。服务端收到 `HEAD + Range` 后：

- 返回 `206 Partial Content`
- `Content-Length` 为**剩余字节数**（如 4000），而非完整文件大小（5000）

第 306-312 行用这个剩余大小覆盖 `expected_size`，下载完成后第 606 行的校验必然误报 `size_mismatch`。

### 影响面

- `head_check` 默认值为 `True`（`settings.py:58`），且 `file_processor.py:343` 通过 `settings.WORKER_HEAD_CHECK_ENABLED` 注入
- **所有续传下载在默认配置下必定失败**
- 即使调用方传入 `expected_size=None`，同样会被污染（`None != 4000` 为 `True`，`expected_size` 被设为剩余大小）

### 修复方案

**修改位置**：[downloader.py:748](packages/worker/src/worker/handlers/downloader.py#L748)，`_do_head_check()` 方法内部。

**原则**：HEAD 请求的目的是获取**完整文件**的元数据，Range 头在 HEAD 上下文中不仅无意义，而且有害。应由 `_do_head_check` 自身负责构造干净的请求头，而非依赖调用方在传入前清理。

**具体变更**：

```python
# 第 748 行之后，在设置 Accept-Encoding 之前插入一行
head_headers = dict(headers) if headers else {}
head_headers.pop("Range", None)          # ← 新增：HEAD 不应携带 Range
head_headers["Accept-Encoding"] = "identity"
```

此外，同样需要排除可能被调用方传入的其他与 GET 流式下载相关的头（如 `Accept-Encoding` 已在下一行覆盖，无需额外处理）。

**可选增强**：将 `_do_head_check` 的签名从接收完整 headers 改为只接收认证相关的头部（如 Authorization），从接口层面杜绝误传。但考虑到该方法目前只有一个调用点且改动范围小，当前方案更符合"最小变更"原则。

### 验证方法

1. 启动时有一个 `1000` 字节的 `.incomplete` 临时文件
2. 调用 `download(url, target_path, expected_size=5000)`
3. HEAD 响应（无 Range）返回 `Content-Length: 5000`
4. 下载完成后 `current_size == 5000`，与 `expected_size == 5000` 一致，无报错

---

## 🟡 Issue 2：`is_resumed` 语义不一致

### 现状

在 `_do_download()` 的两个流内重试路径中，`is_resumed` 始终被设为 `True`：

| 位置 | 代码 | current_size 可能为 0? |
|------|------|----------------------|
| 第 488 行 | `is_resumed = True`（429/5xx 重试） | ✅ 可能（temp 文件被外部删除） |
| 第 597 行 | `is_resumed = True`（网络错误重试） | ✅ 可能（写入前出错） |

当 `current_size == 0` 时，含义并非"续传"。虽然由于 Range 头也被同步移除（第 486/595 行），range_ignored 检查（第 434-436 行）的守卫条件 `"Range" in headers` 为 `False`，不会触发误判，但：
- 进度回调收到 `is_resumed=True`，在 UI 上可能显示为"续传中"（误导）
- 文件以 `"ab"` 模式打开（与 `"wb"` 等价，无功能影响）
- 代码意图不清晰，增加维护负担

### 修复方案

**修改位置**：第 488 行和第 597 行。

将 `is_resumed = True` 改为 `is_resumed = current_size > 0`，使其与实际行为一致。

**第 488 行**（429/5xx 重试路径）：

```python
# Before
mode = "ab"
is_resumed = True

# After
is_resumed = current_size > 0
mode = "ab" if is_resumed else "wb"
```

**第 597 行**（网络错误重试路径）：

```python
# Before
mode = "ab"
is_resumed = True

# After
is_resumed = current_size > 0
mode = "ab" if is_resumed else "wb"
```

**注意**：第 596 行的 `mode = "ab"` 也应同步调整。当 `current_size == 0` 时 `"wb"` 更准确，虽然行为等价但语义正确。

### 验证方法

- 模拟流中断时 temp 文件恰好为 0 字节的场景
- 确认进度回调收到 `is_resumed=False`
- 确认下载正常完成

---

## 🟡 Issue 3：重试延迟期间未检查取消

### 现状

外层重试循环（第 359-383 行）在指数退避 sleep 后只检查了暂停：

```python
await asyncio.sleep(delay)              # 最长 30 秒

# Check pause/cancel after the sleep    # ← 注释声称检查两者
self._check_paused(pause_event, url)    # ← 实际只检查了暂停！
```

cancel 要到下一轮循环的第 319 行才被检查。`retry_max_delay` 默认 30 秒，意味着用户点击取消后最长需等待 30 秒才响应。

### 对照：其他 sleep 点的检查模式

| 位置 | sleep 后检查 |
|------|-------------|
| 第 476-478 行（429/5xx 重试） | `_check_cancelled` ✅ + `_check_paused` ✅ |
| 第 598-600 行（网络错误重试） | `_check_cancelled` ✅ + `_check_paused` ✅ |
| **第 379-383 行（外层退避）** | `_check_paused` ✅ + `_check_cancelled` ❌ |

### 修复方案

**修改位置**：[downloader.py:383](packages/worker/src/worker/handlers/downloader.py#L383)

在 `_check_paused` 之后增加取消检查：

```python
self._check_paused(pause_event, url)
self._check_cancelled(cancel_event, url)   # ← 新增
```

### 验证方法

- 在重试等待期间触发取消事件
- 确认 `DownloadCancelledError` 在 sleep 结束后**立即**抛出，而非等到下一轮循环

---

## ℹ️ Issue 4：10MB 刷盘间隔设计取舍（无需代码变更）

### 现状

[downloader.py:132](packages/worker/src/worker/handlers/downloader.py#L132)：`_FLUSH_INTERVAL_BYTES = 10 * 1024 * 1024`

设计意图：每 10MB 调用一次 `f.flush()` 将缓冲区数据同步到磁盘。

### 分析

**收益**：减少 `flush()` 系统调用频率，降低 I/O 开销。

**代价**：进程非优雅终止（`kill -9`、OOM、断电）时，自上次 flush 以来的已下载数据在磁盘上不可见。下次启动时从上次 flush 位置重新下载。

**无数据完整性风险**：缺失的是"下载进度记录"而非"文件内容完整性"。Range 头确保从磁盘记录的字节位置继续下载，不会产生内容缺漏、重复或损坏。

### 建议

维持现状。如果未来需要更细粒度的崩溃恢复，可将此值改为可配置项（如通过 settings），但不属于本次修复范围。

---

## 变更清单汇总

| # | 文件 | 行号 | 变更类型 | 描述 |
|---|------|------|----------|------|
| 1 | downloader.py | 748 后 | **修复** | `_do_head_check` 中移除 Range 头 |
| 2 | downloader.py | 383 后 | **修复** | 外层重试 sleep 后增加取消检查 |
| 3 | downloader.py | 488 | **改进** | `is_resumed` 基于 `current_size > 0` |
| 4 | downloader.py | 596-597 | **改进** | `is_resumed` 和 `mode` 基于 `current_size > 0` |

**变更行数估算**：约 6 行修改 + 2 行新增 = 8 行，零新抽象，全部为针对性修复。

---

## 需要关注的边界情况

1. **Issue 1 修复后，`_do_head_check` 返回的 `Content-Length` 始终是完整文件大小**——确认第 306-312 行的 `expected_size` 覆盖逻辑在修复后行为正确。
2. **RETRY_WITH_RESET 路径**（第 343-358 行）：删除 temp 文件后 `downloaded_size=0`，Range 头被移除，下次 HEAD 检查不会携带 Range——与 Issue 1 修复一致。
3. **Issue 2 修复后 `mode` 变量**：确保 `mode` 与 `is_resumed` 始终一致（`"ab"` ↔ `True`, `"wb"` ↔ `False`），避免出现 `is_resumed=False` 但 `mode="ab"` 的不一致状态。
