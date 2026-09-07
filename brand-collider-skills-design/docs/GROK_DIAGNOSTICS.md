# Grok 任务日志定位

## 按会话定位

发现入口的输出根目录是 `brand-relations-demo/outputs/`。

- `collider-sessions/<session-id>.json`：会话状态、阶段、公开消息、当前执行 PID/runId、自动修复记录。
- `collider-cli-agents/<session-id>/v<revision>/<agent-id>/<run-id>/`：一次实际 CLI 激活。
- agent-id 为 `research-a`、`research-b` 时对应双方品牌研究；`media-reference-discovery-*` 对应真实素材检索。
- `.grok-runtime/sessions/` 是隔离的 CLI 原生会话目录；并非应用日志，不应把其原始对话或认证材料复制到诊断报告。

每次激活的文件：

| 文件 | 用途 |
| --- | --- |
| `activity.json` | 新增：运行中每 5 秒保存活动快照，关闭时刷新最终记录 |
| `execution.json` | 进程结束后保存的执行摘要、耗时、PID、状态 |
| `research-evidence.json` / `discovery-evidence.json` | 记录可用网页工具与实际观测到的调用 |
| `diagnostics.json` | 收到最终信封后才有的 stopReason、格式和会话匹配检查；超时可能没有 |
| `task.txt` / `output.schema.json` | 输入任务与要求的产物结构 |
| `result.json` | 验证通过的公开产物；文件缺失不代表一定尚未收到字节 |

## 活动字段如何解释

- `waiting_cli_output`：进程已启动，尚未收到 stdout。
- `waiting_model_or_cli`：已收到工具清单或工具结束事件，等待后续 CLI 事件；无法仅凭此区分模型排队、推理、网络等待。
- `waiting_tool`：已经观察到网页工具启动，尚有工具未完成。
- `receiving_cli_output`：收到 stdout 或公开文本事件，不能等同首个模型 token。
- `waiting_process_exit`：收到 end 事件，进程尚未退出。
- `closed`：进程已结束。`reason` 区分超时、中止、启动/输入失败、无效事件流、输出超限和正常退出路径；`exitCode`、`signal` 保留系统退出证据。
- `stdoutIdleMs`：距上次收到 stdout 的毫秒数；心跳本身不是上游进展。
- `stderrSignals`：识别到的认证、限流、网络、TLS 文本特征，仅是诊断线索，不证明根因。
- `timeline`：最多 64 条阶段事件，超时事件保留超时前阶段。

快照包含字节数、事件数与工具调用计数，不保存 stdout/stderr 原文、模型私有思考、工具查询内容或凭证。使用临时文件原子替换；写日志失败不会使生成任务失败。

旧激活不会补生成 `activity.json`；新代码必须由服务加载后才会记录。不要为了加日志而重启仍在执行的任务。
