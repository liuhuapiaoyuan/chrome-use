# Browser-CLI 工具参考

本文档描述 `@aipexstudio/browser-cli-ext` 暴露的全部 **29 个**浏览器自动化工具：能力说明、参数规范、调用示例与返回值约定。

扩展本身不包含 Agent、LLM 或聊天 UI，仅作为命令通道执行工具。网页侧请配合 [`@qzsy/browser-cli-sdk`](../browser-cli-sdk/README.md) 使用。

> **不包含的工具**：6 个 `skill_*` 工具（需 QuickJS VM，体积过大）、`organize_tabs`、`download_text_as_markdown` 等未启用工具。详见 [未暴露的工具](#未暴露的工具)。

---

## 目录

- [调用方式](#调用方式)
- [CLI 语法规范](#cli-语法规范)
- [参数类型与强制转换](#参数类型与强制转换)
- [命名与约定](#命名与约定)
- [推荐工作流](#推荐工作流)
- [工具一览](#工具一览)
  - [标签页管理（7）](#标签页管理7)
  - [UI 操作（9）](#ui-操作9)
  - [页面工具（4）](#页面工具4)
  - [截图（3）](#截图3)
  - [下载（2）](#下载2)
  - [人工介入（4）](#人工介入4)
- [未暴露的工具](#未暴露的工具)
- [错误码](#错误码)
- [所需权限](#所需权限)

---

## 调用方式

### 1. CLI 字符串（`exec`）

```ts
await cli.exec("get_all_tabs");
await cli.exec('create_new_tab --url "https://example.com"');
await cli.exec('take_snapshot --tabId 123');
await cli.exec('search_elements --tabId 123 --query "{button,input}*"');
```

若请求信封带有 `raw` 字段，扩展会在服务端重新解析该字符串。

### 2. 对象调用（`call`）

```ts
await cli.call("take_snapshot", { tabId: 123 });
await cli.call("create_new_tab", { url: "https://example.com" });
await cli.call("click", { tabId: 123, uid: "abc-42" });
```

对象调用**绕过 CLI 解析器**，参数直接交给 `@aipexstudio/browser-runtime` 中的 Zod schema 校验。部分工具在 runtime 中支持的参数可能比 `--help` 显示的更多（例如 `switch_to_tab` 的 `urlPattern`），但 `--help` / CLI 以 `tool-schemas.ts` 为准。

### 3. 元命令

| 命令 | 说明 | 示例 |
|------|------|------|
| `-h` | 帮助概览（版本、用法、示例） | `cli.exec("-h")` |
| `--list` | 列出全部工具名称与简介 | `cli.exec("--list")` |
| `--help <tool>` | 单个工具的参数说明 | `cli.exec("--help create_new_tab")` |

SDK 等价 API：`cli.help()`、`cli.list()`、`cli.help("create_new_tab")`。

---

## CLI 语法规范

```
<tool_name> [--param value] [--param value] ...
```

### 规则

1. **第一个 token** 为工具名或元命令（如 `get_all_tabs`、`-h`、`--list`）。
2. **参数** 必须以 `--` 开头：`--tabId 123`、`--url "https://example.com"`。
3. **每个 `--key` 必须带值**；不支持纯布尔 flag（布尔需显式写 `--enabled true` 或 `--enabled false`）。
4. **引号**：单引号或双引号可包裹含空格的字符串；支持 `\"` 转义。
5. **数组 / 对象**：值为 JSON 字符串，例如：
   ```bash
   fill_form --tabId 1 --elements '[{"uid":"x","value":"hello"}]'
   ```
6. **空输入**：空白字符串视为 `-h`。

### 示例

```bash
# 无参数
get_all_tabs

# 字符串参数（含空格需引号）
create_new_tab --url "https://example.com/path?q=1"

# 数字与布尔
switch_to_tab --tabId 42
click --tabId 1 --uid "node-7" --dblClick true

# 复杂 JSON
computer --action scroll --scroll_direction down --scroll_amount 800 --tabId 1
request_intervention --type user-selection --params '{"question":"选哪个？","options":[{"id":"a","label":"A"}],"mode":"single"}'
```

---

## 参数类型与强制转换

CLI 解析器根据 `tool-schemas.ts` 中各参数的 `type` 做强制转换：

| Schema 类型 | CLI 值处理 | 示例 |
|-------------|------------|------|
| `string` | 原样保留 | `hello` → `"hello"` |
| `number` | `Number()`，NaN 则 `PARSE_ERROR` | `42` → `42` |
| `boolean` | `"true"` 或 `"1"` 为 `true`，其余为 `false` | `true` → `true` |
| `array` / `object` | `JSON.parse()`，失败则 `PARSE_ERROR` | `'[1,2]'` → `[1,2]` |

---

## 命名与约定

| 约定 | 说明 |
|------|------|
| 工具名 | `snake_case`，如 `get_all_tabs`、`fill_element_by_uid` |
| 参数名 | 多数为 **camelCase**（`tabId`、`dblClick`）；少数为 **snake_case**（`input_index`、`file_path`、`scroll_direction`） |
| 元素 UID | 来自 `search_elements` 返回的快照文本，页面 DOM 变化后需重新搜索 |
| `tabId` | Chrome 标签页 ID，通常由 `get_all_tabs` / `get_current_tab` 获取 |
| 返回值 | 各工具返回 JSON 可序列化对象；成功时通常在 `data` 字段（响应信封），工具内部常含 `success: true` |

---

## 推荐工作流

### 页面阅读与交互

```
get_current_tab / get_all_tabs
    → take_snapshot(tabId)            # 整页无障碍 DOM 快照，适合通读页面结构
    → search_elements(tabId, query)   # 按模式搜索，获取元素 UID
    → click / fill_element_by_uid / hover_element_by_uid / get_editor_value
```

- **`take_snapshot`**：返回**完整**格式化的无障碍风格 DOM 树（含 uid、role、name），适合需要通读页面、理解布局、或自行解析结构的场景。
- **`search_elements`**：在同一快照上按 glob/grep 过滤，只返回匹配行及上下文，更省 token，适合定位具体控件。

两种工具在**后台模式**下使用 `@aipexstudio/dom-snapshot`（纯 DOM），在**聚焦模式**下使用 CDP 无障碍树；均**不需要**将 tab 切到前台。

### 坐标操作（高成本兜底）

仅在以下情况使用 `capture_screenshot` + `computer`：

- `search_elements` 换用 2 种 query 仍无匹配
- UID 操作两次失败（元素不可交互）
- 需要像素级操作：Canvas、拖拽、滑块、仅 hover 出现的菜单

使用坐标类 `computer` 动作前，应先 `capture_screenshot --sendToLLM true`，坐标系为**截图像素空间**。

### 文件上传

```
search_elements → 确认页面有 file input
    → upload_file_to_input --tabId N --file_path "/absolute/path/to/file.pdf"
    → capture_screenshot（可选，验证上传结果）
```

---

## 工具一览

### 标签页管理（7）

#### `get_all_tabs`

获取所有窗口中的全部打开标签页。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| — | — | — | 无参数 |

**返回示例**：`{ tabs: [{ id, url, title, active, windowId, index }], count }`

**示例**：
```bash
get_all_tabs
```

---

#### `get_current_tab`

获取当前活动标签页信息。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| — | — | — | 无参数 |

**返回示例**：`{ id, url, title, windowId, index }`

---

#### `switch_to_tab`

切换到指定标签页。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 目标标签页 ID |

**返回示例**：`{ success: true, tab: { id, url, title } }`

**示例**：
```bash
switch_to_tab --tabId 123456789
```

> **Runtime 扩展**：通过 `call()` 还可传 `urlPattern`（URL 子串匹配），CLI `--help` 未列出该字段。

---

#### `create_new_tab`

新建标签页并打开 URL。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `url` | string | 是 | 要打开的 URL；无协议时自动补 `https://` |

**返回示例**：`{ success: true, tabId, url, title }`

**示例**：
```bash
create_new_tab --url https://example.com
create_new_tab --url example.com
```

---

#### `get_tab_info`

获取指定标签页详情。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |

**返回**：标签对象 `{ id, index, windowId, title, url }`，不存在时为 `null`。

---

#### `close_tab`

关闭标签页。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是* | 要关闭的标签页 ID |

\* CLI schema 要求 `tabId`；runtime 中省略时关闭当前标签。

**返回示例**：`{ success: true, tabId }`

---

#### `ungroup_tabs`

取消当前窗口中所有标签分组。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| — | — | — | 无参数 |

**返回示例**：`{ success: true, ungroupedCount }`

---

### UI 操作（9）

#### `take_snapshot`

获取指定标签页的**完整**无障碍风格 DOM 快照，返回格式化文本树（含元素 **UID**）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |

**返回示例**：

```json
{
  "success": true,
  "message": "Snapshot captured successfully",
  "tabId": 123,
  "title": "Example Page",
  "url": "https://example.com",
  "snapshot": "→uid=dom_abc RootWebArea \"Example\" <body>\n  uid=dom_def button \"Submit\" <button>\n  ..."
}
```

**快照文本格式**（每行一个节点）：

```
→uid=dom_abc123 RootWebArea "My Page" <body>
  uid=dom_def456 button "Submit" <button>
  uid=dom_ghi789 textbox "Email" <input>
   StaticText "Welcome"
  *uid=dom_jkl012 link "Learn More" <a>
```

标记：`→` 焦点祖先，`*` 当前焦点元素，空格为普通节点。

**示例**：

```bash
take_snapshot --tabId 123
```

**SDK**：

```ts
const result = await cli.takeSnapshot({ tabId: 123 });
if (result.success) console.log(result.snapshot);
```

> 大页面快照可能较长；若只需找特定控件，优先用 `search_elements`。

---

#### `search_elements`

在页面无障碍快照中按 glob/grep 模式搜索元素，返回匹配项及 **UID**（供后续 UID 工具使用）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `query` | string | 是 | 搜索模式（见下表） |
| `contextLevels` | number | 否 | 上下文行数，默认 `1` |

**Query 语法示例**：

| Query | 用途 |
|-------|------|
| `{button,link,input,StaticText}*` |  broad 扫描常见控件 |
| `button*` | 所有 button 角色 |
| `*[Ss]ubmit*` | 文本含 Submit/submit |
| `{input,textarea,select}*` | 表单控件 |
| `*login*` | 文本匹配 login |

**返回示例**：`{ success: true, message, data: "<格式化快照片段>" }`

**示例**：
```bash
search_elements --tabId 123 --query "{button,input}*"
search_elements --tabId 123 --query "*登录*" --contextLevels 2
```

---

#### `click`

通过 UID 点击元素。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `uid` | string | 是 | 快照中的元素 UID |
| `dblClick` | boolean | 否 | `true` 为双击，默认 `false` |

**示例**：
```bash
click --tabId 123 --uid "abc-42"
click --tabId 123 --uid "abc-42" --dblClick true
```

---

#### `fill_element_by_uid`

向输入类元素填入文本。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `uid` | string | 是 | 元素 UID |
| `value` | string | 是 | 要填入的内容 |

**示例**：
```bash
fill_element_by_uid --tabId 123 --uid "input-1" --value "user@example.com"
```

---

#### `get_editor_value`

读取代码编辑器（Monaco / CodeMirror / ACE）或 textarea 的完整内容（不截断）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `uid` | string | 是 | 编辑器元素 UID |

---

#### `fill_form`

批量填写多个表单字段。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `elements` | array | 是 | `{ uid, value }[]` |

**示例**：
```bash
fill_form --tabId 123 --elements '[{"uid":"u1","value":"Alice"},{"uid":"u2","value":"Bob"}]'
```

---

#### `hover_element_by_uid`

悬停在指定元素上（触发 tooltip、下拉菜单等）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `uid` | string | 是 | 元素 UID |

---

#### `upload_file_to_input`

通过 CDP 将本地文件上传到 `<input type="file">`（含隐藏 input）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `uid` | string | 否 | file input 的 UID |
| `input_index` | number | 否 | 多个 file input 时的 0 基索引，默认 `0` |
| `file_id` | string | 否 | 预附加文件引用 ID（schema 保留字段） |
| `file_path` | string | 否* | 本地**绝对路径**，如 `C:\Users\me\file.pdf` |

\* 实际上传需 `file_path`；路径由 Chrome 经 CDP 直接读取，不经过网页。

**示例**：
```bash
upload_file_to_input --tabId 123 --file_path "D:\data\resume.pdf"
upload_file_to_input --tabId 123 --uid "file-1" --file_path "/home/user/doc.pdf"
```

---

#### `computer`

基于**截图像素坐标**的鼠标/键盘操作（高成本兜底，见 [推荐工作流](#推荐工作流)）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `action` | string | 是 | 见下表枚举 |
| `coordinate` | array | 条件 | `[x, y]` 像素坐标 |
| `text` | string | 条件 | `type` 时为文本；`key` 时为按键序列 |
| `start_coordinate` | array | 条件 | 拖拽起点 `[x, y]` |
| `scroll_direction` | string | 条件 | `up` \| `down` \| `left` \| `right` |
| `scroll_amount` | number | 否 | 滚动像素，默认约 2 视口高 |
| `tabId` | number | 否 | 目标标签页 |
| `uid` | string | 条件 | `scroll_to` 时使用元素 UID |

**`action` 枚举**：

| 值 | 说明 | 主要依赖参数 |
|----|------|--------------|
| `left_click` | 左键单击 | `coordinate` |
| `right_click` | 右键 | `coordinate` |
| `double_click` | 双击 | `coordinate` |
| `triple_click` | 三击 | `coordinate` |
| `type` | 输入文本 | `text` |
| `key` | 按键/组合键 | `text`（如 `Enter`、`cmd+a`） |
| `scroll` | 滚动 | `coordinate`、`scroll_direction` |
| `left_click_drag` | 拖拽 | `start_coordinate`、`coordinate` |
| `scroll_to` | 滚动元素入视口 | `uid` |
| `hover` | 移动鼠标不点击 | `coordinate` |

**示例**：
```bash
computer --action left_click --coordinate "[100,200]" --tabId 123
computer --action key --text "Enter" --tabId 123
computer --action scroll_to --uid "btn-1" --tabId 123
```

---

### 页面工具（4）

#### `get_page_metadata`

读取当前活动页 metadata（title、description、keywords 等）。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| — | — | — | 无参数 |

---

#### `scroll_to_element`

按 CSS 选择器滚动并使元素居中。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `selector` | string | 是 | CSS 选择器 |

**示例**：
```bash
scroll_to_element --selector "#main-content"
```

---

#### `highlight_element`

为匹配元素添加阴影高亮。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `selector` | string | 是 | CSS 选择器 |
| `color` | string | 否 | 阴影颜色，如 `#00d4ff` |
| `duration` | number | 否 | 持续时间（ms），`0` 为永久 |
| `intensity` | string | 否 | `subtle` \| `normal` \| `strong` |
| `persist` | boolean | 否 | 是否永久保留高亮 |

---

#### `highlight_text_inline`

在元素文本内联高亮指定词语。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `selector` | string | 是 | CSS 选择器 |
| `searchText` | string | 是 | 要高亮的文本 |
| `caseSensitive` | boolean | 否 | 区分大小写 |
| `wholeWords` | boolean | 否 | 整词匹配 |
| `highlightColor` | string | 否 | 高亮颜色 |
| `backgroundColor` | string | 否 | 背景色 |
| `fontWeight` | string | 否 | 字重 |
| `persist` | boolean | 否 | 永久保留 |

---

### 截图（3）

> 截图类工具在 **background 自动化模式**下不可用；`chrome://` 等内部页无法截图。

#### `capture_screenshot`

截取当前可见标签页。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `sendToLLM` | boolean | 否 | `true` 时将图像纳入 LLM 分析并启用坐标工具链 |

**示例**：
```bash
capture_screenshot
capture_screenshot --sendToLLM true
```

---

#### `capture_screenshot_with_highlight`

截取带元素高亮框的截图。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `uid` | string | 是 | 要高亮的元素 UID |
| `sendToLLM` | boolean | 否 | 是否送 LLM 分析 |

---

#### `capture_tab_screenshot`

截取指定标签页。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `tabId` | number | 是 | 标签页 ID |
| `sendToLLM` | boolean | 否 | 是否送 LLM 分析 |

---

### 下载（2）

#### `download_image`

将 base64 图片数据保存到本地。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `imageData` | string | 是 | `data:image/...;base64,...` 格式 |
| `filename` | string | 否 | 文件名（不含扩展名） |
| `folderPath` | string | 否 | 目标文件夹路径 |

---

#### `download_chat_images`

批量下载聊天消息中的图片。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `messages` | array | 是 | 含图片字段的聊天消息数组 |
| `folderPrefix` | string | 否 | 文件夹名前缀 |
| `filenamingStrategy` | string | 否 | `descriptive` \| `sequential` \| `timestamp` |
| `displayResults` | boolean | 否 | 是否展示下载结果 |

---

### 人工介入（4）

人工介入工具用于暂停自动化、等待用户操作或输入。**本插件为轻量通道，无完整 Agent UI**；`request_intervention` 等行为依赖 runtime 中的介入管理器，在纯 CLI 场景下可能受模式限制（如 `disabled` 模式会拒绝请求）。

可先调用 `list_interventions` / `get_intervention_info` 发现能力与参数 schema。

#### `list_interventions`

列出可用的人工介入类型。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `enabledOnly` | boolean | 否 | 仅返回已启用的类型，默认 `false` |

---

#### `get_intervention_info`

获取某一介入类型的详细 schema 与示例。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 介入类型标识 |

**支持的 `type` 值**：

| type | 说明 |
|------|------|
| `monitor-operation` | 监听用户点击，返回被点元素与页面上下文 |
| `voice-input` | 语音输入转文字（浏览器语音识别等） |
| `user-selection` | 展示选项供用户单选/多选 |

---

#### `request_intervention`

发起人工介入请求并阻塞等待结果。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `type` | string | 是 | 见上表 |
| `params` | object | 否 | 类型相关参数（见下） |
| `timeout` | number | 否 | 超时秒数，默认 `300` |
| `reason` | string | 否 | 展示给用户的说明 |

**各 `type` 的 `params` 结构**：

<details>
<summary><code>monitor-operation</code></summary>

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `reason` | string | 否 | 为何需要用户点击 |
| `highlightColor` | string | 否 | 高亮颜色 |

**输出**：`{ element: { selector, tagName, id, classes, text, attributes }, context: { url, title, timestamp, tabId } }`

</details>

<details>
<summary><code>voice-input</code></summary>

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `reason` | string | 否 | 说明 |
| `language` | string | 否 | 语言代码，默认 `zh-CN` |
| `autoStopSilence` | number | 否 | 静音自动停止秒数，默认 `5` |

**输出**：`{ text, confidence, language, source, timestamp, duration? }`

</details>

<details>
<summary><code>user-selection</code></summary>

| 字段 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `question` | string | 是 | 问题文案 |
| `options` | array | 是 | `[{ id, label, description? }]` |
| `mode` | string | 是 | `single` \| `multiple` |
| `allowOther` | boolean | 否 | 是否允许「其他」自定义输入 |
| `reason` | string | 否 | 说明 |

**输出**：`{ selectedOptions: [...], otherText? }`

</details>

**示例**：
```bash
request_intervention --type monitor-operation --reason "请点击目标按钮" --timeout 120
request_intervention --type user-selection --params '{"question":"继续吗？","options":[{"id":"yes","label":"是"},{"id":"no","label":"否"}],"mode":"single"}'
```

---

#### `cancel_intervention`

取消当前进行中的介入请求。

| 参数 | 类型 | 必填 | 说明 |
|------|------|------|------|
| `id` | string | 否 | 介入请求 ID；省略则取消当前活动请求 |

---

## 未暴露的工具

以下工具存在于 `@aipexstudio/browser-runtime` 但**未**编入本扩展：

| 工具 | 原因 |
|------|------|
| `skill_*`（6 个） | 依赖 QuickJS/emscripten VM，bundle 增大约 5MB |
| `organize_tabs` | 需 LLM，与轻量化目标不符 |
| `download_text_as_markdown` | 未启用 |

完整 Agent 能力请使用 `packages/browser-ext`。

---

## 错误码

响应信封中 `ok: false` 时，`error.code` 可能为：

| code | 含义 |
|------|------|
| `EMPTY_INPUT` | `exec("")` 或空白 raw |
| `EMPTY_TOOL` | `call("", ...)` |
| `TOOL_NOT_FOUND` | 未知命令名 |
| `PARSE_ERROR` / 解析子码 | CLI 语法错误（缺值、非法 JSON、非 `--` 参数等） |
| `EXEC_FAILED` | 工具执行失败（常见为 Zod 参数校验或页面不可访问） |
| `INVALID_ENVELOPE` | 请求不符合协议 |
| `MISSING_TOOL` | `--help` 未带工具名 |

CLI 解析子码（`PARSE_ERROR` 消息的 `code` 字段）：`UNEXPECTED_ARG`、`MISSING_VALUE`、`INVALID_NUMBER`、`INVALID_JSON`。

---

## 所需权限

本扩展为 29 工具声明的 Chrome 权限并集：

```
tabs, windows, tabGroups, activeTab, bookmarks, history, scripting, storage,
downloads, debugger, cookies, webNavigation
```

以及 `host_permissions: ["<all_urls>"]`。

---

## 维护说明

- 工具参数的**权威 schema** 位于 `src/lib/tool-schemas.ts`，与 `src/lib/tool-router.ts` 在启动时做名称一致性校验。
- 修改 runtime 工具后，应同步更新 `tool-schemas.ts` 与本文件。
- 在线查询：`cli.exec("--list")` 或 `cli.exec("--help <tool_name>")`。
