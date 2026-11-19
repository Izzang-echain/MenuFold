# MenuFold · 网页版

把餐厅菜单网址、PDF 或照片整理成紧凑的中文分类菜单。保留原文菜名、编号、价格和套餐限制，用固定浅色背景、五套文字与边框配色导出 PNG。长菜单自动分页，多张图片打包为 ZIP。

## 五步上线，拿到可分享的网址

使用 **GitHub + Render**：网页与识别接口放在同一个服务，不需要另外买域名、租数据库或拆分前后端。项目已附好 `render.yaml`，按下面步骤创建即可；当前代码尚未实际发布到 Render。

1. 在 [DeepSeek 开放平台](https://platform.deepseek.com/api_keys) 创建 API Key，并确认账户有可用余额；余额不足时需在平台充值。Key 只填在下面 Render 的服务器配置中，不要发到聊天、写进 HTML 或上传到 GitHub。
2. 在 [GitHub](https://github.com/new) 新建仓库（私有仓库也可以），上传本项目的文件。打开仓库首页应直接看到 `render.yaml`、`requirements.txt`、`start.py`、`server.py` 和 `web` 文件夹，不能再套一层 `menufold` 文件夹。不要上传 `.env` 或 `.venv`。
3. 登录 [Render 控制台](https://dashboard.render.com/)，选择 **New → Blueprint**，连接 GitHub 并选择刚才的仓库。保留默认的 `render.yaml` 路径，选好分支。
4. 在配置页的 `DEEPSEEK_API_KEY` 输入框填入自己的 Key。检查预览只有一个 Python Web Service，套餐为 **Free**，然后点击 **Deploy Blueprint**。模型、启动命令、健康检查和试用限额已写好，不需要逐项手填。
5. 等服务状态变为 **Live**，打开服务页显示的 `https://你的服务名.onrender.com`。先试示例导出，再提交一份短菜单，核对菜名、价格和套餐说明；成功后把这个 HTTPS 网址分享给朋友。`/api/health` 仅确认服务与配置状态，不代表模型调用已经成功。

Render 自动分配 `onrender.com` 地址并提供 HTTPS，默认域名已自动加入本项目的允许列表。日后绑定自己的域名时，再设置 `MENU_ALLOWED_HOSTS=menu.example.com`（不带协议或路径，多个用逗号分隔）。修改代码后推送到连接的分支会触发重新部署；更换 Key 在 Render 服务的 **Environment** 中操作。

**Free 适合少量试用。** 按 [Render 当前说明](https://render.com/docs/free)，15 分钟无访问会休眠，下一次打开约需一分钟唤醒；每个工作区每月共享 750 免费实例小时，另有流量和构建额度。免费实例为 512 MB 内存，大 PDF、长截图可能超出资源，请先用短菜单测试。服务重启或休眠后，内存限额计数会重置。正式持续使用前，再按实测资源和费用决定是否升级；本配置不创建付费服务。

`render.yaml` 使用 Python 3.12.12，构建命令为 `pip install -r requirements.txt`，启动命令为 `python start.py --host 0.0.0.0 --no-browser`，监听 Render 提供的 `PORT`，仅运行一个进程。服务不需要持久磁盘或数据库。流程参考 [Render Blueprint 官方说明](https://render.com/docs/infrastructure-as-code)。

## 也可以先在本机使用

安装 Python 3.10 或更新版本。Windows 双击 `Start_Windows.bat`；macOS / Linux 在项目目录运行：

```bash
python3 -m venv .venv
.venv/bin/python -m pip install -r requirements.txt
.venv/bin/python start.py
```

网页默认在 <http://127.0.0.1:8765> 打开。保持终端运行，按 Ctrl+C 停止。`python start.py --no-browser` 可只启动服务。

本机启动前，复制 `.env.example` 为 `.env`，填写 `DEEPSEEK_API_KEY`。已有系统环境变量优先于 `.env`。在线部署只使用 Render 环境变量，不需要上传本机 `.env`。

没有配置密钥时仍可查看虚构示例、切换配色和导出示例图片；真实识别会明确提示未配置接口，不会将示例作为识别结果。

`sample_menu.png` 是当前虚构示例实际导出的菜单图。

## 网页怎样使用

- **优先粘贴菜单网址**，也可以切换上传 PDF、JPG、PNG、WEBP；多文件顺序就是提交顺序。
- 点击整理后，后台读取菜单并分批识别，返回全部已识别菜品与用餐规则。编号和中文名醒目，英文及括号备注随行。
- 先核对价格、套餐范围、额外收费和用餐时限，再下载菜单图。页面中的来源与待核对提示用于回看原菜单。
- 随机配色只改变文字、边框与分隔线；背景始终浅色，MenuFold Logo 始终为橙色。

## API 配置与费用

默认 `MENU_PROVIDER=deepseek`，服务器配置 `DEEPSEEK_API_KEY`，`DEEPSEEK_MODEL` 默认 `deepseek-flash`。当前 DeepSeek 官方文档列明该模型支持视觉与 JSON 输出。网站通过服务端 REST 请求调用模型，不需要在访客浏览器输入或保存密钥，也不需要安装模型厂商的 SDK。

**Render 免费托管不包含 DeepSeek API 费用。** DeepSeek 按 token 用量从充值余额或赠送余额扣费；账户需有可用余额，不保证新账户有赠送额度。费用和模型可用性以 [DeepSeek 当前价格页](https://api-docs.deepseek.com/quick_start/pricing/) 为准。全站访客共用你的 API Key 和余额；一次长菜单可能分成多次模型调用，任务上限不等于金额上限。余额不足会报错，程序不会自动切换模型或充值。

使用识别功能会把菜单的文字或图片发送给所选模型提供方；默认发送给 DeepSeek。请使用可分享的菜单，数据处理以 [DeepSeek 开放平台条款](https://cdn.deepseek.com/policies/en-US/deepseek-open-platform-terms-of-service.html) 等当前适用条款为准。换色、网页排版和本地导出图片不会新增模型 token 消耗。

保留 Gemini 作为可选配置：设置 `MENU_PROVIDER=gemini`，再配置 `GEMINI_API_KEY`（或 `GOOGLE_API_KEY`，前者优先）及 `GEMINI_MODEL`，模型须支持视觉与结构化输出。额度与数据处理见 [Google 价格页](https://ai.google.dev/gemini-api/docs/pricing) 和 [使用条款](https://ai.google.dev/gemini-api/terms)。没有配置所选提供方的密钥时不会自动改用另一家。

## 服务器配置与 Docker

Render 按上方五步操作即可。需要自己管理服务器时，也可用随项目提供的 Dockerfile：

```bash
docker build -t menufold .
docker run --rm -p 8765:8765 --env-file .env menufold
```

Docker 默认监听 `0.0.0.0:8765`，可以通过 `PORT` 修改端口。部署平台应提供 HTTPS，并把以下配置放入平台的 Secret / 环境变量：

| 配置 | 用途 |
| --- | --- |
| `MENU_PROVIDER` | `deepseek`（默认）或 `gemini` |
| `DEEPSEEK_API_KEY` | 服务器的 DeepSeek 密钥，默认提供方必填 |
| `DEEPSEEK_MODEL` | 默认 `deepseek-flash` |
| `GEMINI_API_KEY` / `GEMINI_MODEL` | 仅选择 Gemini 时配置 |
| `MENU_ALLOWED_HOSTS` | 允许访问的实际网站域名，逗号分隔，不带协议或路径 |
| `PORT` | 平台分配的监听端口，默认 `8765` |
| `MENU_MAX_CONCURRENT` | 全站同时整理任务数，默认 `1`，最大 `4` |
| `MENU_DAILY_REQUEST_LIMIT` | 全站每日整理任务上限，默认 `30`，含导入失败 |
| `MENU_CLIENT_HOURLY_LIMIT` | 每个客户端 IP 每小时任务上限，默认 `6` |
| `MENU_DAILY_MODEL_CALL_LIMIT` | 全站每日模型调用上限，默认 `100`，失败调用也计数 |

本机地址和 Render 分配的默认域名自动允许；其他网站域名通过 `MENU_ALLOWED_HOSTS` 配置。请勿把 `.env` 上传到代码仓库。镜像构建会排除 `.env`、本地虚拟环境和临时输出文件。

限额按单进程内存计数，重启会重置；每日限额按 UTC 日期计算。部署使用单 worker，多副本或多 worker 时需要共享计数存储。客户端限频使用 ASGI 提供的客户端 IP，不直接相信请求中的 `X-Forwarded-For`；反向代理应按平台说明配置可信代理。

## 支持范围

- 公开静态菜单网页、PDF 和图片直链，以及网页中明确链接的菜单附件。
- 最多 60 页或文字段、总输入文件 30 MB；以接口返回的实际限制为准。文字段数不等于 PDF 页数。
- 动态扫码点餐、登录或反爬页面可能无法直接读取；此时改用 PDF 或截图上传。长条截图建议分段，以保留细字清晰度。
- 跨页套餐图例、Premium 列、小字价格和模糊照片可能识别不完整。模型不确定的内容会标记核对，处理页数不代表已人工确认无遗漏。

## 验收记录

目前没有用真实 DeepSeek 密钥完成端到端识别，没有实际 Render 部署记录，也没有菜单准确率的实测结论。自动测试不能代替下表的人工核对。建议先测 5–10 份真实菜单，再决定开放范围。

| 样本 | 类型 / 页数 | 原菜单菜数 | 漏菜数 | 编号 / 价格错误 | 套餐 / 加价遗漏 | 耗时 | API token / 成本 | 结论 |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| 01 | 待测 | — | — | — | — | — | — | 待测 |
| 02 | 待测 | — | — | — | — | — | — | 待测 |
| 03 | 待测 | — | — | — | — | — | — | 待测 |
| 04 | 待测 | — | — | — | — | — | — | 待测 |
| 05 | 待测 | — | — | — | — | — | — | 待测 |
| 06 | 待测 | — | — | — | — | — | — | 待测 |
| 07 | 待测 | — | — | — | — | — | — | 待测 |
| 08 | 待测 | — | — | — | — | — | — | 待测 |
| 09 | 待测 | — | — | — | — | — | — | 待测 |
| 10 | 待测 | — | — | — | — | — | — | 待测 |

## 开发与测试

```bash
python -m unittest discover -s tests -v
node tests/test_frontend.cjs
```

导出测试使用开发环境中的 `@napi-rs/canvas`，不属于网站运行依赖；具备该包时可运行：

```bash
node tests/test_export.cjs
```

`python build_preview.py` 会生成单文件 `MenuFold_Preview.html`，内嵌虚构示例、样式及脚本。它只用于免安装体验排版和导出，不连接识别接口。普通用户使用在线网站或上面的本机服务即可。

后端使用 FastAPI、PyMuPDF、Pillow 和 httpx；前端为原生 HTML / CSS / JavaScript。接口参考 DeepSeek 官方的 [首次调用](https://api-docs.deepseek.com/)、[模型与价格](https://api-docs.deepseek.com/quick_start/pricing/) 和 [错误码](https://api-docs.deepseek.com/quick_start/error_codes/)。部署参考 Render 的 [Blueprint 配置](https://render.com/docs/blueprint-spec)、[Python 版本](https://render.com/docs/python-version) 和 [Web Service](https://render.com/docs/web-services) 文档。
