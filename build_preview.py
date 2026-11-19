"""Build a standalone, offline sample preview: python build_preview.py."""
from pathlib import Path
import base64
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
    def embed_font(match):
        relative = match.group(2).lstrip("/")
        font_path = WEB / relative
        if not font_path.resolve().is_relative_to((WEB / "fonts").resolve()) or font_path.suffix != ".woff2":
            raise ValueError("Unexpected preview font path")
        encoded = base64.b64encode(font_path.read_bytes()).decode("ascii")
        return 'url("data:font/woff2;base64,' + encoded + '")'

    css = re.sub(r"url\(([\"']?)(/?fonts/[^)\"']+\.woff2)\1\)", embed_font, css)
    demo = json.loads((WEB / "demo.json").read_text(encoding="utf-8"))
    embedded_data = (
        "window.MENU_LENS_OFFLINE_PREVIEW=true;window.MENU_LENS_DEMO_DATA="
        + json.dumps(demo, ensure_ascii=False)
        + ";"
    )
    html, count = re.subn(
        r'<link\b[^>]*href=["\']/styles\.css(?:\?[^"\']*)?["\'][^>]*>',
        lambda _: "<style>" + css + "</style>", html, count=1, flags=re.IGNORECASE,
    )
    if count != 1:
        raise ValueError("Expected the page to reference /styles.css once")

    allowed = {"design.js", "export.js", "app.js"}
    scripts = []

    def embed_script(match):
        name = match.group(1).split("?", 1)[0].lstrip("/")
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
    banner = '<div style="margin-top:18px;padding:10px 14px;border:1px solid #d6ddcf;border-radius:8px;background:#f4f3ed;color:#56664e;font-size:12px;line-height:1.8">这是离线示例，可试配色和保存长图。翻译自己的菜单，请打开部署后的网站。</div>'
    html = re.sub(r"(<main\b[^>]*>)", lambda match: match.group(1) + banner, html, count=1)
    target = ROOT / "MenuFold_Preview.html"
    target.write_text(html, encoding="utf-8")
    print("Built {} ({:,} bytes)".format(target.name, target.stat().st_size))
    return target


if __name__ == "__main__":
    build()
