"""Build a standalone, offline sample preview: python build_preview.py."""
from pathlib import Path
import json
import re

ROOT = Path(__file__).resolve().parent
WEB = ROOT / "web"


def safe_script(text):
    """Prevent a JavaScript string or JSON value from closing its HTML element."""
    return re.sub(r"</script", r"<\\/script", text, flags=re.IGNORECASE)


def build():
    html = (WEB / "index.html").read_text(encoding="utf-8")
    css = (WEB / "styles.css").read_text(encoding="utf-8")
    demo = json.loads((WEB / "demo.json").read_text(encoding="utf-8"))
    embedded_data = (
        "window.MENU_LENS_OFFLINE_PREVIEW=true;window.MENU_LENS_DEMO_DATA="
        + json.dumps(demo, ensure_ascii=False)
        + ";"
    )
    html, count = re.subn(
        r'<link\b[^>]*href=["\']/styles\.css["\'][^>]*>',
        lambda _: "<style>" + css + "</style>", html, count=1, flags=re.IGNORECASE,
    )
    if count != 1:
        raise ValueError("Expected the page to reference /styles.css once")

    allowed = {"design.js", "export.js", "app.js"}
    scripts = []

    def embed_script(match):
        name = match.group(1).lstrip("/")
        if name not in allowed:
            raise ValueError("Unexpected preview script: " + name)
        scripts.append(name)
        content = (WEB / name).read_text(encoding="utf-8")
        prefix = "<script>" + safe_script(embedded_data) + "</script>" if len(scripts) == 1 else ""
        return prefix + "<script>" + safe_script(content) + "</script>"

    html = re.sub(
        r'<script\b[^>]*src=["\']([^"\']+)["\'][^>]*>\s*</script\s*>',
        embed_script, html, flags=re.IGNORECASE,
    )
    if set(scripts) != allowed:
        raise ValueError("Expected design.js, export.js and app.js in the preview")
    html = html.replace('href="/"', 'href="#"')
    banner = '<div style="margin-top:20px;padding:12px 15px;border:1px solid #dfe5d5;border-radius:8px;background:#f4f3ed;color:#65725c;font-size:11px;line-height:1.8">免安装示例预览 · 可换色和导出虚构示例；真实网址读取与文件识别请启动网站服务。</div>'
    html = re.sub(r"(<main\b[^>]*>)", lambda match: match.group(1) + banner, html, count=1)
    target = ROOT / "MenuFold_Preview.html"
    target.write_text(html, encoding="utf-8")
    print("Built {} ({:,} bytes)".format(target.name, target.stat().st_size))
    return target


if __name__ == "__main__":
    build()
