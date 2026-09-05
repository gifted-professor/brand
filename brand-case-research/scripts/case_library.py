#!/usr/bin/env python3
"""Validate and retrieve a local, evidence-labelled brand collaboration library.

Python 3 standard library only. Retrieval order expresses text relevance, never
commercial quality, confidence, ROI, or a probability. Repeated --brand filters
are ANDed; repeated --case-id filters select any of those IDs.
"""

import argparse
import hashlib
import json
import re
import sys
import unicodedata
from datetime import datetime
from pathlib import Path


SOURCE_KINDS = {"ai_report", "structured_dataset", "workbook", "web_primary", "web_secondary"}
WEB_KINDS = {"web_primary", "web_secondary"}
CLAIM_TYPES = {"event", "outcome", "interpretation", "recommendation"}
CLAIM_STATUSES = {"unverified", "supported", "disputed"}
CONCLUSIONS = {"supports", "contradicts", "inconclusive"}
GUIDANCE = {
    "brand-profile": [
        "将案例中的历史事实作为待纳入当前 CollisionBrief 的资料；保留逐条来源和证据状态。",
        "历史合作、历史授权或历史物料不代表今天仍可用；即使历史事实已核验，也需要进入当前 brief 并确认时效。",
    ],
    "collab-ideation": [
        "提取双方贡献、合作机制和成立边界，组合形成当前项目的不同方向；不要复刻案例外观。",
        "案例的结果不是当前方案的成功概率；unverified 与 disputed 内容只能作为待核查线索或明确标注的假设。",
    ],
    "design-spec": [
        "历史案例只作为设计机制、结构和约束的参考；不能自动成为当前项目的物料、规格、材料或授权。",
        "把可借鉴规则重新转写进当前 DesignSpec，并标明哪些还需品牌方或供应链确认。",
    ],
    "campaign-copy": [
        "参考表达方式和叙事结构；不得把案例销量、收入、增长或宣传承诺套用到当前联名。",
        "对外事实性表述须由当前项目证据支持；未核验或有争议的说法不得写成确定事实。",
    ],
    "visual-production": [
        "案例只用于解释视觉机制和参考方向；网页 URL 或候选图片链接不能冒充 assetId。",
        "实际出图必须使用当前项目已登记且确实获授权的素材，并沿用当前 DesignSpec 和审核约束。",
    ],
    "quality-review": [
        "把历史风险转为当前项目的具体检查项，并逐项比对当前 brief、DesignSpec、素材与输出证据。",
        "历史审核通过、案例成功或资料包生成都不代表当前项目通过审核；缺证据仍需标记。",
    ],
}


def digest(data):
    return hashlib.sha256(data).hexdigest()


def content_hash(value):
    return digest(json.dumps(value, ensure_ascii=False, sort_keys=True, separators=(",", ":")).encode("utf-8"))


def nonempty(value):
    return isinstance(value, str) and bool(value.strip())


def iso_datetime(value):
    if not nonempty(value) or "T" not in value:
        return False
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).tzinfo is not None
    except ValueError:
        return False


def validate_library(library, base_dir):
    """Return all actionable errors without mutating or upgrading any evidence."""
    errors = []

    def error(path, message):
        errors.append({"path": path, "message": message})

    def fields(obj, required, path):
        if not isinstance(obj, dict):
            error(path, "must be an object")
            return False
        for key in required:
            if key not in obj:
                error(f"{path}.{key}", "required field is missing")
        return True

    def array(value, path):
        if not isinstance(value, list):
            error(path, "must be an array")
            return []
        return value

    def string(value, path, nullable=False):
        if not (nullable and value is None) and not nonempty(value):
            error(path, "must be a nonempty string" + (" or null" if nullable else ""))

    def enum(value, choices, path):
        if not isinstance(value, str) or value not in choices:
            error(path, "must be one of: " + ", ".join(sorted(choices)))

    def unique_id(obj, seen, path):
        identifier = obj.get("id")
        string(identifier, path + ".id")
        if nonempty(identifier):
            if identifier in seen:
                error(path + ".id", "duplicate id: " + identifier)
            seen.add(identifier)

    if not fields(library, ["schemaVersion", "revision", "updatedAt", "sources", "cases", "methods", "conflicts"], "$"):
        return errors
    if library.get("schemaVersion") != "1.0":
        error("$.schemaVersion", "must equal 1.0")
    if type(library.get("revision")) is not int or library["revision"] < 1:
        error("$.revision", "must be a positive integer")
    if not iso_datetime(library.get("updatedAt")):
        error("$.updatedAt", "must be an ISO date-time with a timezone")

    sources = {}
    source_ids = set()
    for i, source in enumerate(array(library.get("sources"), "$.sources")):
        path = f"$.sources[{i}]"
        if not fields(source, ["id", "kind", "path", "url", "sha256", "lineageGroup", "status"], path):
            continue
        unique_id(source, source_ids, path)
        if nonempty(source.get("id")):
            sources[source["id"]] = source
        enum(source.get("kind"), SOURCE_KINDS, path + ".kind")
        enum(source.get("status"), {"registered", "read"}, path + ".status")
        string(source.get("lineageGroup"), path + ".lineageGroup")
        for key in ("path", "url", "sha256"):
            string(source.get(key), path + "." + key, nullable=True)
        if source.get("sha256") is not None and (
            not isinstance(source["sha256"], str) or not re.fullmatch(r"[0-9a-f]{64}", source["sha256"])
        ):
            error(path + ".sha256", "must be a lowercase SHA-256 hex digest or null")
        url = source.get("url")
        if nonempty(url) and not re.match(r"^https?://[^/\s]+", url):
            error(path + ".url", "must be an HTTP(S) URL or null")
        if source.get("kind") in WEB_KINDS and source.get("status") == "read" and not nonempty(url):
            error(path + ".url", "a read web source requires a URL")
        local_files = []
        if nonempty(source.get("path")):
            local_files.append((source["path"], path + ".path"))
        if "duplicatePaths" in source:
            for j, duplicate in enumerate(array(source["duplicatePaths"], path + ".duplicatePaths")):
                dpath = f"{path}.duplicatePaths[{j}]"
                string(duplicate, dpath)
                if nonempty(duplicate):
                    local_files.append((duplicate, dpath))
        for local_path, field_path in local_files:
            file_path = Path(local_path)
            if not file_path.is_absolute():
                file_path = Path(base_dir) / file_path
            try:
                raw = file_path.read_bytes()
            except (OSError, ValueError) as exc:
                error(field_path, "cannot read source file: " + str(exc))
            else:
                if source.get("sha256") is not None and digest(raw) != source["sha256"]:
                    error(field_path, "registered SHA-256 does not match source file contents")

    def reference(ref, path):
        if not fields(ref, ["sourceId", "locator"], path):
            return None
        string(ref.get("sourceId"), path + ".sourceId")
        string(ref.get("locator"), path + ".locator")
        sid = ref.get("sourceId")
        if not isinstance(sid, str) or sid not in sources:
            error(path + ".sourceId", "references an unknown source")
            return None
        return sources[sid]

    case_ids, claim_ids = set(), set()
    for i, case in enumerate(array(library.get("cases"), "$.cases")):
        path = f"$.cases[{i}]"
        required = ["id", "title", "participants", "timeframe", "market", "collaborationType", "deliverables", "sourceRefs", "candidateUrls", "claims", "insights", "tags", "sourceLabels", "metrics", "timeline"]
        if not fields(case, required, path):
            continue
        unique_id(case, case_ids, path)
        string(case.get("title"), path + ".title")
        for key in ("timeframe", "market", "collaborationType"):
            string(case.get(key), path + "." + key, nullable=True)
        participants = array(case.get("participants"), path + ".participants")
        if not participants:
            error(path + ".participants", "must contain at least one participant")
        for j, participant in enumerate(participants):
            ppath = f"{path}.participants[{j}]"
            if fields(participant, ["name", "contribution", "benefit", "economics"], ppath):
                string(participant.get("name"), ppath + ".name")
                for key in ("contribution", "benefit"):
                    string(participant.get(key), ppath + "." + key, nullable=True)
                if participant.get("economics") is not None and not isinstance(participant["economics"], dict):
                    error(ppath + ".economics", "must be an object or null; unknown is not zero")
        for key in ("deliverables", "candidateUrls", "tags"):
            for j, value in enumerate(array(case.get(key), path + "." + key)):
                string(value, f"{path}.{key}[{j}]")
                if key == "candidateUrls" and nonempty(value) and not re.match(r"^https?://[^/\s]+", value):
                    error(f"{path}.{key}[{j}]", "must be an HTTP(S) candidate URL")
        for j, ref in enumerate(array(case.get("sourceRefs"), path + ".sourceRefs")):
            reference(ref, f"{path}.sourceRefs[{j}]")
        if fields(case.get("insights"), ["mechanism", "risks", "missingEvidence"], path + ".insights"):
            for key in ("mechanism", "risks", "missingEvidence"):
                if not isinstance(case["insights"].get(key), str):
                    error(path + ".insights." + key, "must be a string")
        if not isinstance(case.get("sourceLabels"), dict):
            error(path + ".sourceLabels", "must be an object; original labels do not establish evidence")
        if "aliases" in case:
            for j, value in enumerate(array(case["aliases"], path + ".aliases")):
                string(value, f"{path}.aliases[{j}]")
        raw_claims = case.get("claims")
        local_claim_ids = {claim["id"] for claim in raw_claims if isinstance(claim, dict) and nonempty(claim.get("id"))} if isinstance(raw_claims, list) else set()
        for key in ("metrics", "timeline"):
            for j, value in enumerate(array(case.get(key), path + "." + key)):
                item_path = f"{path}.{key}[{j}]"
                if not isinstance(value, dict):
                    error(item_path, "must be an object")
                    continue
                if "sourceRefs" in value:
                    for k, ref in enumerate(array(value["sourceRefs"], item_path + ".sourceRefs")):
                        reference(ref, f"{item_path}.sourceRefs[{k}]")
                if "claimId" in value and (not isinstance(value["claimId"], str) or value["claimId"] not in local_claim_ids):
                    error(item_path + ".claimId", "must reference a claim in this case")
                if "claimIds" in value:
                    for k, claim_id in enumerate(array(value["claimIds"], item_path + ".claimIds")):
                        if not isinstance(claim_id, str) or claim_id not in local_claim_ids:
                            error(f"{item_path}.claimIds[{k}]", "must reference a claim in this case")
        for j, claim in enumerate(array(case.get("claims"), path + ".claims")):
            cpath = f"{path}.claims[{j}]"
            if not fields(claim, ["id", "text", "type", "status", "sourceRefs", "verification"], cpath):
                continue
            unique_id(claim, claim_ids, cpath)
            string(claim.get("text"), cpath + ".text")
            enum(claim.get("type"), CLAIM_TYPES, cpath + ".type")
            enum(claim.get("status"), CLAIM_STATUSES, cpath + ".status")
            for k, ref in enumerate(array(claim.get("sourceRefs"), cpath + ".sourceRefs")):
                reference(ref, f"{cpath}.sourceRefs[{k}]")
            conclusions = set()
            for k, check in enumerate(array(claim.get("verification"), cpath + ".verification")):
                vpath = f"{cpath}.verification[{k}]"
                if not fields(check, ["sourceId", "locator", "checkedAt", "conclusion", "notes"], vpath):
                    continue
                source = reference(check, vpath)
                enum(check.get("conclusion"), CONCLUSIONS, vpath + ".conclusion")
                string(check.get("notes"), vpath + ".notes")
                if not iso_datetime(check.get("checkedAt")):
                    error(vpath + ".checkedAt", "must be an ISO date-time with a timezone")
                valid_source = source and source.get("kind") in WEB_KINDS and source.get("status") == "read"
                if not valid_source:
                    error(vpath + ".sourceId", "verification requires a read web_primary or web_secondary source; AI reports and dataset labels are leads")
                elif check.get("conclusion") in CONCLUSIONS:
                    conclusions.add(check["conclusion"])
            status = claim.get("status")
            if status == "supported" and "supports" not in conclusions:
                error(cpath + ".status", "supported requires a supports check from a read web source")
            if "contradicts" in conclusions and status != "disputed":
                error(cpath + ".status", "contradicting evidence requires disputed status")
            if status == "unverified" and "supports" in conclusions:
                error(cpath + ".status", "a decisive verification cannot remain an unverified lead; review its status")

    for key in ("methods", "conflicts"):
        seen = set()
        for i, value in enumerate(array(library.get(key), "$." + key)):
            path = f"$.{key}[{i}]"
            if fields(value, ["id"], path):
                unique_id(value, seen, path)
                if "sourceRefs" in value:
                    for j, ref in enumerate(array(value["sourceRefs"], path + ".sourceRefs")):
                        reference(ref, f"{path}.sourceRefs[{j}]")
                for reference_key, known_ids in (("caseRefs", case_ids), ("claimIds", claim_ids)):
                    if reference_key in value:
                        for j, identifier in enumerate(array(value[reference_key], path + "." + reference_key)):
                            if not isinstance(identifier, str) or identifier not in known_ids:
                                error(f"{path}.{reference_key}[{j}]", "references an unknown id")
                if "caseId" in value and (not isinstance(value["caseId"], str) or value["caseId"] not in case_ids):
                    error(path + ".caseId", "references an unknown case")
    return errors


def normalized(text):
    return unicodedata.normalize("NFKC", text).casefold()


def tokens(text):
    result = set()
    for span in re.findall(r"[a-z0-9]+(?:[-'][a-z0-9]+)*|[\u3400-\u9fff]+", normalized(text)):
        result.add(span)
        if re.fullmatch(r"[\u3400-\u9fff]+", span) and len(span) > 2:
            result.update(span[i:i + 2] for i in range(len(span) - 1))
    return result


def search_text(case):
    values = [case["title"], case.get("timeframe"), case.get("market"), case.get("collaborationType")]
    values += case["tags"] + case["deliverables"]
    values += case.get("aliases", [])
    values += [p.get(key) for p in case["participants"] for key in ("name", "contribution", "benefit")]
    values += [claim["text"] for claim in case["claims"]]
    values += list(case["insights"].values())
    return " ".join(value for value in values if isinstance(value, str))


def retrieve(library, query, brands, case_ids, limit):
    wanted = tokens(query)
    # Punctuation-only queries are not interpreted as a request for every case.
    if query.strip() and not wanted:
        return [], 0
    matches = []
    for case in library["cases"]:
        names = [normalized(p["name"]) for p in case["participants"]]
        if any(not any(normalized(brand).strip() in name for name in names) for brand in brands):
            continue
        if case_ids and case["id"] not in case_ids:
            continue
        hits = wanted & tokens(search_text(case))
        if wanted and not hits:
            continue
        score = sum(min(len(token), 8) for token in hits)
        matches.append((score, case))
    matches.sort(key=lambda pair: (-pair[0], pair[1]["id"]))
    return [{**case, "contentSha256": content_hash(case)} for _, case in matches[:limit]], len(matches)


def related_conflicts(library, cases):
    case_ids = {case["id"] for case in cases}
    claim_ids = {claim["id"] for case in cases for claim in case["claims"]}
    return sorted((conflict for conflict in library["conflicts"] if (
        conflict.get("caseId") in case_ids
        or case_ids.intersection(conflict.get("caseRefs", []))
        or claim_ids.intersection(conflict.get("claimIds", []))
    )), key=lambda conflict: conflict["id"])


def related_sources(library, cases, conflicts):
    ids = set()
    for case in cases:
        ids.update(ref["sourceId"] for ref in case["sourceRefs"])
        for claim in case["claims"]:
            ids.update(ref["sourceId"] for ref in claim["sourceRefs"])
            ids.update(check["sourceId"] for check in claim["verification"])
        for item in case["metrics"] + case["timeline"]:
            ids.update(ref["sourceId"] for ref in item.get("sourceRefs", []))
    for conflict in conflicts:
        ids.update(ref["sourceId"] for ref in conflict.get("sourceRefs", []))
    return sorted((source for source in library["sources"] if source["id"] in ids), key=lambda source: source["id"])


def build_result(library, raw, query, brands, case_ids, limit, consumer=None):
    cases, total = retrieve(library, query, brands, case_ids, limit)
    conflicts = related_conflicts(library, cases)
    result = {
        "schemaVersion": "1.0",
        "libraryRef": {"revision": library["revision"], "sha256": digest(raw)},
        "query": query,
        "filters": {"brands": brands, "caseIds": case_ids, "limit": limit},
        "matchedCount": total,
        "cases": cases,
        "sources": related_sources(library, cases, conflicts),
        "conflicts": conflicts,
        "rankingMeaning": "Text relevance only; not a collaboration score, commercial forecast, or probability.",
    }
    if consumer is not None:
        result.update({
            "consumer": consumer,
            "kind": "researchContext",
            "status": "local_draft",
            "usageGuidance": [
                "本包是本地 researchContext 草案；没有 artifactId，不授予项目、品牌或素材使用权限。",
                "保留所有 claim 的证据状态、核验记录与来源；原始报告标签和多个同源转述不能替代独立核验。",
                "null 表示未知，不是 0；只把已支持的相应事实用于事实性陈述，仍需检查适用时间与条件。",
            ] + GUIDANCE[consumer],
        })
    return result


def original_paths(library, library_path):
    """Include every registered original, even when validation reports a missing file."""
    paths = [library_path]
    if not isinstance(library, dict) or not isinstance(library.get("sources"), list):
        return paths
    for source in library["sources"]:
        if not isinstance(source, dict):
            continue
        candidates = [source.get("path")]
        if isinstance(source.get("duplicatePaths"), list):
            candidates.extend(source["duplicatePaths"])
        for candidate in candidates:
            if nonempty(candidate):
                path = Path(candidate)
                paths.append(path if path.is_absolute() else library_path.parent / path)
    return paths


def write_result(result, output, library_path, library):
    rendered = json.dumps(result, ensure_ascii=False, indent=2, allow_nan=False) + "\n"
    if output:
        output_path = Path(output).expanduser()
        library_path = Path(library_path).expanduser()
        for protected_path in original_paths(library, library_path):
            same_file = output_path.resolve() == protected_path.resolve()
            if output_path.exists() and protected_path.exists():
                same_file = same_file or output_path.samefile(protected_path)
            if same_file:
                raise ValueError("--output must not overwrite the library or a registered original (including duplicates, symlinks and hard links)")
        output_path.write_text(rendered, encoding="utf-8")
    sys.stdout.write(rendered)


def positive_int(value):
    result = int(value)
    if result <= 0:
        raise argparse.ArgumentTypeError("must be a positive integer")
    return result


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    subcommands = parser.add_subparsers(dest="command", required=True)
    for command in ("validate", "query", "packet"):
        sub = subcommands.add_parser(command)
        sub.add_argument("library", type=Path)
        sub.add_argument("--output", help="also write JSON to this path; cannot overwrite the library or registered originals")
        if command != "validate":
            sub.add_argument("--query", default="", help="search text; optional when a brand or case ID is provided")
            sub.add_argument("--brand", action="append", default=[], help="participant-name filter; repeated filters are ANDed")
            sub.add_argument("--case-id", action="append", default=[], help="exact case ID; repeated IDs are ORed")
            sub.add_argument("--limit", type=positive_int, default=8)
        if command == "packet":
            sub.add_argument("--consumer", choices=sorted(GUIDANCE), default="collab-ideation")
    args = parser.parse_args(argv)
    try:
        library_path = args.library.expanduser()
        raw = library_path.read_bytes()
        library = json.loads(raw, parse_constant=lambda value: (_ for _ in ()).throw(ValueError("nonstandard JSON constant: " + value)))
        errors = validate_library(library, library_path.parent)
        if errors:
            write_result({"ok": False, "errors": errors}, args.output, library_path, library)
            return 1
        if args.command == "validate":
            result = {"ok": True, "schemaVersion": library["schemaVersion"], "revision": library["revision"], "sha256": digest(raw), "counts": {key: len(library[key]) for key in ("sources", "cases", "methods", "conflicts")}}
        else:
            if not args.query.strip() and not args.brand and not args.case_id:
                raise ValueError("provide --query, --brand, or --case-id; an unfiltered library dump is not a retrieval request")
            if any(not brand.strip() for brand in args.brand):
                raise ValueError("--brand must be nonempty")
            result = build_result(library, raw, args.query, args.brand, args.case_id, args.limit, getattr(args, "consumer", None))
            result["libraryRef"]["path"] = str(library_path.resolve())
        write_result(result, args.output, library_path, library)
        return 0
    except (OSError, ValueError, TypeError, RecursionError) as exc:
        sys.stdout.write(json.dumps({"ok": False, "errors": [{"path": "$", "message": str(exc)}]}, ensure_ascii=False) + "\n")
        return 1


if __name__ == "__main__":
    sys.exit(main())
