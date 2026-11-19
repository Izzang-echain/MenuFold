"""启动MenuFold网站：python start.py [--host HOST] [--port PORT] [--no-browser]。"""

import argparse
import importlib.util
import os
from pathlib import Path
import re
import sys
import threading
import webbrowser


PROJECT_ROOT = Path(__file__).resolve().parent


def load_local_env(path):
    """读取简单的 KEY=VALUE 配置；已有环境变量优先，不执行或展开任何值。"""
    if not path.is_file():
        return
    try:
        content = path.read_text(encoding="utf-8-sig")
    except OSError as exc:
        print("无法读取 .env：{}".format(exc), file=sys.stderr)
        return
    for raw_line in content.splitlines():
        line = raw_line.strip()
        if not line or line.startswith("#"):
            continue
        if line.startswith("export "):
            line = line[7:].lstrip()
        key, sep, value = line.partition("=")
        key = key.strip()
        if not sep or not re.fullmatch(r"[A-Za-z_][A-Za-z0-9_]*", key):
            continue
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'":
            value = value[1:-1]
        os.environ.setdefault(key, value)


def main():
    if sys.version_info < (3, 10):
        print("请使用 Python 3.10 或更新版本启动 MenuFold。", file=sys.stderr)
        return 1
    load_local_env(PROJECT_ROOT / ".env")
    try:
        default_port = int(os.getenv("PORT", "8765"))
    except ValueError:
        print("PORT 应为 1 到 65535 之间的整数。", file=sys.stderr)
        return 1
    parser = argparse.ArgumentParser(description="启动MenuFold菜单整理网站")
    parser.add_argument("--host", default=os.getenv("HOST", "127.0.0.1"), help="监听地址，默认 127.0.0.1")
    parser.add_argument("--port", type=int, default=default_port, help="监听端口，默认读取 PORT 或 8765")
    parser.add_argument("--no-browser", action="store_true", help="不自动打开浏览器")
    args = parser.parse_args()
    if not 1 <= args.port <= 65535:
        parser.error("端口必须在 1 到 65535 之间。")

    dependencies = {
        "fastapi": "FastAPI", "uvicorn": "uvicorn", "httpx": "httpx",
        "pydantic": "pydantic", "multipart": "python-multipart",
        "fitz": "PyMuPDF", "PIL": "Pillow",
    }
    missing = [package for module, package in dependencies.items()
               if importlib.util.find_spec(module) is None]
    if missing:
        print("缺少运行依赖：{}".format("、".join(missing)), file=sys.stderr)
        print("请先在本项目目录运行：", file=sys.stderr)
        print("  python -m pip install -r requirements.txt", file=sys.stderr)
        return 1

    os.environ.setdefault("MENU_PROVIDER", "deepseek")
    os.environ.setdefault("DEEPSEEK_MODEL", "deepseek-flash")
    os.environ.setdefault("GEMINI_MODEL", "gemini-3.5-flash-lite")
    os.chdir(PROJECT_ROOT)
    sys.path.insert(0, str(PROJECT_ROOT))
    import uvicorn

    browser_host = "127.0.0.1" if args.host in {"0.0.0.0", "::"} else args.host
    if ":" in browser_host and not browser_host.startswith("["):
        browser_host = "[{}]".format(browser_host)
    url = "http://{}:{}".format(browser_host, args.port)
    print("MenuFold访问地址：{}".format(url))
    print("按 Ctrl+C 结束运行。")
    opener = None
    if not args.no_browser:
        opener = threading.Timer(1.2, lambda: webbrowser.open(url))
        opener.daemon = True
        opener.start()
    try:
        uvicorn.run("server:app", host=args.host, port=args.port, workers=1, access_log=False)
    finally:
        if opener is not None:
            opener.cancel()
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
