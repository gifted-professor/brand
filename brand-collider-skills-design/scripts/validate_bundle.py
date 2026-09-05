"""检查文档/模板包结构；不调用 Agent 或模型。依赖：PyYAML。"""
from __future__ import annotations
import json
import re
from pathlib import Path
import sys
try:
    import yaml
except ImportError as exc:
    raise SystemExit("缺少 PyYAML：请安装后重试。") from exc

ROOT = Path(__file__).resolve().parents[1]

def project_files(pattern: str):
    """Generated outputs and installed dependencies are not authored bundle data."""
    ignored = {"node_modules", "outputs", ".git", "__pycache__"}
    return (path for path in ROOT.rglob(pattern) if not ignored.intersection(path.relative_to(ROOT).parts))

def require(condition: bool, message: str) -> None:
    if not condition:
        raise ValueError(message)

def main() -> None:
    config = json.loads((ROOT / "config/collider.config.json").read_text())
    expected = {item["name"] for item in config["approvedSkills"]}
    skills = sorted((ROOT / ".claude/skills").glob("*/SKILL.md"))
    require(len(skills) == 6, "应包含六个 Skill")
    discovered = set()
    checked_refs = 0
    for path in skills:
        text = path.read_text(encoding="utf-8")
        require(text.startswith("---\n"), f"缺少 frontmatter：{path}")
        parts = text.split("---", 2)
        require(len(parts) == 3, f"frontmatter 未关闭：{path}")
        meta = yaml.safe_load(parts[1])
        name = meta.get("name", "")
        require(bool(re.fullmatch(r"[a-z0-9]+(?:-[a-z0-9]+)*", name)), f"非法 name：{name}")
        require(len(name) <= 64 and name == path.parent.name, f"目录与 name 不一致：{path}")
        require(isinstance(meta.get("description"), str) and 0 < len(meta["description"]) <= 1024,
                f"非法 description：{path}")
        require(all(isinstance(v, str) for v in meta.get("metadata", {}).values()),
                f"metadata 值应为字符串：{path}")
        require(len(text.splitlines()) < 500, f"Skill 过长：{path}")
        for target in re.findall(r"\]\((references/[^)]+)\)", text):
            require((path.parent / target).is_file(), f"参考文件不存在：{path} -> {target}")
            checked_refs += 1
        discovered.add(name)
    require(discovered == expected, "Skill 目录与批准配置不一致")
    runtime = json.loads((ROOT / "config/runtime.example.json").read_text())
    require(set(runtime["approvedSkillNames"]) == expected, "运行时白名单不一致")
    count = 0
    for path in project_files("*.json"):
        json.loads(path.read_text(encoding="utf-8"))
        count += 1
    brief = json.loads((ROOT / "examples/fictional-brief.json").read_text())
    require(len(brief["brands"]) == 2, "示例应包含两个品牌")
    require(all(c["provenance"] == "assumption" for b in brief["brands"] for c in b["claims"]),
            "虚构品牌事实应标为假设")
    style = json.loads((ROOT / "styles/warm-editorial.json").read_text())
    require(style["id"] == brief["stylePackId"] == config["defaultStylePackId"], "风格引用不一致")
    template = json.loads((ROOT / "templates/poster-portrait-v1.json").read_text())
    require(template["id"] == config["defaultPosterTemplateId"], "模板引用不一致")
    for name, slot in template["slots"].items():
        require(slot["x"] >= 0 and slot["y"] >= 0, f"模板坐标非法：{name}")
        require(slot["x"] + slot["width"] <= template["width"], f"模板横向溢出：{name}")
        require(slot["y"] + slot["height"] <= template["height"], f"模板纵向溢出：{name}")
    cases = json.loads((ROOT / "tests/acceptance-cases.json").read_text())
    require(len(cases["cases"]) == 12, "应包含十二个验收场景")
    require(cases["status"] == "not_executed", "不能将用例定义误标为已通过")
    for path in project_files("*.md"):
        text = path.read_text(encoding="utf-8")
        fences = [line for line in text.splitlines() if line.startswith("```")]
        require(len(fences) % 2 == 0, f"代码块未闭合：{path}")
    print(f"PASS: {len(skills)} Skill frontmatter / {checked_refs} local references / {count} JSON files")
    print("PASS: approved names, fictional provenance, style/template references, layout bounds, 12 case definitions, Markdown fences")
    print("NOT COVERED BY THIS CHECK: Agent SDK, model calls, image generation, visual inspection, end-to-end acceptance; see CHECKS.md for separate evidence")

if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, json.JSONDecodeError) as exc:
        print(f"FAIL: {exc}", file=sys.stderr)
        sys.exit(1)
