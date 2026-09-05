#!/usr/bin/env python3
"""Focused integrity/evidence/retrieval regressions using disposable fixtures."""

import copy
import importlib.util
import json
import os
import subprocess
import sys
import tempfile
import unittest
from pathlib import Path


SCRIPT = Path(__file__).with_name("case_library.py")
SPEC = importlib.util.spec_from_file_location("case_library", SCRIPT)
LIB = importlib.util.module_from_spec(SPEC)
SPEC.loader.exec_module(LIB)


class LibraryTests(unittest.TestCase):
    def setUp(self):
        self.temp = tempfile.TemporaryDirectory()
        self.addCleanup(self.temp.cleanup)
        self.root = Path(self.temp.name)
        (self.root / "report.txt").write_text("AI-generated research leads, not verified facts.\n", encoding="utf-8")
        self.library_path = self.root / "library.json"
        self.library = {
            "schemaVersion": "1.0", "revision": 1, "updatedAt": "2026-09-05T12:00:00+08:00",
            "sources": [{"id": "report", "kind": "ai_report", "path": "report.txt", "url": None,
                         "sha256": LIB.digest((self.root / "report.txt").read_bytes()),
                         "lineageGroup": "report-family", "status": "read"}],
            "cases": [self.case("case-1", ["Nike 耐克", "LEGO 乐高"], "模块化运动产品"),
                      self.case("case-2", ["星巴克 Starbucks", "地方美术馆"], "城市艺术杯", tags=["Nike"] )],
            "methods": [{"id": "method-1", "sourceRefs": [{"sourceId": "report", "locator": "paragraph 1"}], "caseRefs": ["case-1"]}],
            "conflicts": [],
        }
        self.save()

    @staticmethod
    def case(identifier, names, title, tags=None):
        ref = {"sourceId": "report", "locator": identifier}
        return {
            "id": identifier, "title": title,
            "participants": [{"name": name, "contribution": None, "benefit": None, "economics": None} for name in names],
            "timeframe": None, "market": "中国", "collaborationType": "产品联名",
            "deliverables": [title], "sourceRefs": [ref], "candidateUrls": ["https://example.org/candidate"],
            "claims": [{"id": identifier + "-claim", "text": "用户报告称该联名发布过产品。", "type": "event", "status": "unverified", "sourceRefs": [ref], "verification": []}],
            "insights": {"mechanism": title, "risks": "真实结果待核验", "missingEvidence": "官网及业绩资料"},
            "tags": tags or ["跨界"], "sourceLabels": {"report": {"confidence": "A", "score": 95}},
            "metrics": [{"name": "revenue", "value": None, "unit": "CNY"}], "timeline": [],
        }

    def save(self):
        self.library_path.write_text(json.dumps(self.library, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")

    def errors(self):
        return LIB.validate_library(self.library, self.root)

    def run_cli(self, *args, expected=0):
        result = subprocess.run([sys.executable, str(SCRIPT), *args], capture_output=True, text=True)
        self.assertEqual(result.returncode, expected, result.stdout + result.stderr)
        return json.loads(result.stdout), result.stdout

    def add_verification(self, conclusion="supports", source_id="official"):
        self.library["sources"].append({"id": source_id, "kind": "web_primary", "path": None,
                                        "url": "https://example.org/official/" + source_id, "sha256": None,
                                        "lineageGroup": source_id, "status": "read"})
        check = {"sourceId": source_id, "locator": "paragraph 3", "checkedAt": "2026-09-05T04:00:00Z", "conclusion": conclusion, "notes": "Fixture evidence for the corresponding claim."}
        self.library["cases"][0]["claims"][0]["verification"].append(check)
        return check

    def test_valid_library_does_not_change_null_or_labels(self):
        before = copy.deepcopy(self.library)
        self.assertEqual(self.errors(), [])
        self.assertEqual(self.library, before)
        output, _ = self.run_cli("validate", str(self.library_path))
        self.assertTrue(output["ok"])

    def test_chinese_english_search_and_no_match(self):
        matches, count = LIB.retrieve(self.library, "模块化", [], [], 8)
        self.assertEqual(count, 1)
        self.assertEqual(matches[0]["id"], "case-1")
        matches, _ = LIB.retrieve(self.library, "STARBUCKS", [], [], 8)
        self.assertEqual([c["id"] for c in matches], ["case-2"])
        self.assertEqual(LIB.retrieve(self.library, "不相干的天文望远镜", [], [], 8), ([], 0))
        self.assertEqual(LIB.retrieve(self.library, "???", [], [], 8), ([], 0))

    def test_brand_filter_only_matches_participants_and_repeated_filters_are_anded(self):
        matches, _ = LIB.retrieve(self.library, "", ["Nike"], [], 8)
        self.assertEqual([c["id"] for c in matches], ["case-1"])
        self.assertEqual(LIB.retrieve(self.library, "", ["Nike", "Starbucks"], [], 8), ([], 0))
        matches, _ = LIB.retrieve(self.library, "", ["耐克", "LEGO"], [], 8)
        self.assertEqual([c["id"] for c in matches], ["case-1"])

    def test_cli_case_filter_needs_no_empty_query(self):
        result, _ = self.run_cli("query", str(self.library_path), "--case-id", "case-2")
        self.assertEqual([c["id"] for c in result["cases"]], ["case-2"])
        result, _ = self.run_cli("query", str(self.library_path), expected=1)
        self.assertIn("provide --query", result["errors"][0]["message"])

    def test_packet_is_deterministic_and_preserves_claims_evidence_and_unknowns(self):
        self.add_verification()
        claim = self.library["cases"][0]["claims"][0]
        claim["status"] = "supported"
        self.save()
        first, first_text = self.run_cli("packet", str(self.library_path), "--brand", "Nike")
        _, second_text = self.run_cli("packet", str(self.library_path), "--brand", "Nike")
        self.assertEqual(first_text, second_text)
        self.assertEqual(first["cases"][0]["claims"], [claim])
        self.assertEqual(first["cases"][0]["sourceLabels"], self.library["cases"][0]["sourceLabels"])
        self.assertIsNone(first["cases"][0]["participants"][0]["economics"])
        self.assertIsNone(first["cases"][0]["metrics"][0]["value"])
        self.assertEqual(first["cases"][0]["contentSha256"], LIB.content_hash(self.library["cases"][0]))
        self.assertEqual(first["libraryRef"]["sha256"], LIB.digest(self.library_path.read_bytes()))
        self.assertEqual([source["id"] for source in first["sources"]], ["official", "report"])
        self.assertNotIn("artifactId", first)
        self.assertEqual(first["status"], "local_draft")

    def test_six_consumers_have_distinct_guidance(self):
        guidance = []
        for consumer in LIB.GUIDANCE:
            result = LIB.build_result(self.library, self.library_path.read_bytes(), "", ["Nike"], [], 8, consumer)
            self.assertEqual(result["consumer"], consumer)
            guidance.append(tuple(result["usageGuidance"]))
        self.assertEqual(len(set(guidance)), 6)

    def test_retrieval_carries_related_conflicts_and_their_unique_sources(self):
        source = {"id": "conflict-source", "kind": "web_secondary", "path": None, "url": "https://example.org/conflicting-report", "sha256": None, "lineageGroup": "conflict-report", "status": "read"}
        self.library["sources"].append(source)
        conflicts = [
            {"id": "difference-1", "caseId": "case-1", "status": "pending_verification", "note": "Keep the unresolved report difference.", "sourceRefs": [{"sourceId": source["id"], "locator": "paragraph 2"}]},
            {"id": "difference-2", "claimIds": ["case-1-claim"], "status": "pending_verification"},
            {"id": "difference-3", "caseId": "case-2", "status": "pending_verification"},
        ]
        self.library["conflicts"] = conflicts
        self.assertEqual(self.errors(), [])
        self.save()
        for command in ("query", "packet"):
            result, _ = self.run_cli(command, str(self.library_path), "--case-id", "case-1")
            self.assertEqual(result["conflicts"], conflicts[:2])
            self.assertIn(source, result["sources"])
            self.assertEqual(result["cases"][0]["claims"][0]["status"], "unverified")
        result, _ = self.run_cli("packet", str(self.library_path), "--query", "unmatchable")
        self.assertEqual(result["conflicts"], [])
        self.assertEqual(result["sources"], [])

    def test_duplicate_original_paths_are_checked_for_existence_and_hash(self):
        duplicate = self.root / "report-copy.txt"
        duplicate.write_bytes((self.root / "report.txt").read_bytes())
        self.library["sources"][0]["duplicatePaths"] = [duplicate.name]
        self.assertEqual(self.errors(), [])
        duplicate.write_text("changed copy", encoding="utf-8")
        errors = self.errors()
        self.assertTrue(any("duplicatePaths[0]" in e["path"] and "does not match" in e["message"] for e in errors))
        duplicate.unlink()
        errors = self.errors()
        self.assertTrue(any("duplicatePaths[0]" in e["path"] and "cannot read" in e["message"] for e in errors))

    def test_output_protects_all_originals_duplicates_and_their_links(self):
        original = self.root / "report.txt"
        before = original.read_bytes()
        duplicate = self.root / "report-copy.txt"
        duplicate.write_bytes(before)
        self.library["sources"][0]["duplicatePaths"] = [duplicate.name]
        self.save()
        for path in (original, duplicate):
            symlink = path.with_suffix(".symlink")
            symlink.symlink_to(path)
            hardlink = path.with_suffix(".hardlink")
            os.link(path, hardlink)
            for target in (path, symlink, hardlink):
                result, _ = self.run_cli("packet", str(self.library_path), "--case-id", "case-1", "--output", str(target), expected=1)
                self.assertIn("registered original", result["errors"][0]["message"])
                self.assertEqual(path.read_bytes(), before)
        # Validation errors must not allow the error JSON to overwrite an original.
        self.library["revision"] = 0
        self.save()
        result, _ = self.run_cli("validate", str(self.library_path), "--output", str(duplicate), expected=1)
        self.assertIn("registered original", result["errors"][0]["message"])
        self.assertEqual(duplicate.read_bytes(), before)

    def test_metric_and_timeline_references_belong_to_the_current_case(self):
        metric = self.library["cases"][0]["metrics"][0]
        metric["claimId"] = "case-1-claim"
        metric["sourceRefs"] = [{"sourceId": "report", "locator": "metric table"}]
        self.library["cases"][0]["timeline"] = [{"claimIds": ["case-1-claim"], "time": "2023"}]
        self.assertEqual(self.errors(), [])
        metric["claimId"] = "case-2-claim"
        self.library["cases"][0]["timeline"][0]["claimIds"] = ["case-2-claim"]
        errors = self.errors()
        self.assertTrue(any("metrics[0].claimId" in e["path"] for e in errors))
        self.assertTrue(any("timeline[0].claimIds[0]" in e["path"] for e in errors))
        metric["sourceRefs"][0]["sourceId"] = "unknown"
        self.assertTrue(any("metrics[0].sourceRefs[0].sourceId" in e["path"] for e in self.errors()))

    def test_metric_only_sources_are_kept_in_packets(self):
        source = {"id": "metric-source", "kind": "web_primary", "path": None, "url": "https://example.org/metric-table", "sha256": None, "lineageGroup": "metric-report", "status": "read"}
        self.library["sources"].append(source)
        self.library["cases"][0]["metrics"][0]["sourceRefs"] = [{"sourceId": source["id"], "locator": "table 1"}]
        self.assertEqual(self.errors(), [])
        result = LIB.build_result(self.library, self.library_path.read_bytes(), "", [], ["case-1"], 8, "quality-review")
        self.assertIn(source, result["sources"])

    def test_unknown_source_and_case_claim_references_are_rejected(self):
        self.library["cases"][0]["claims"][0]["sourceRefs"][0]["sourceId"] = "missing"
        self.library["methods"][0]["caseRefs"] = ["missing"]
        self.library["conflicts"] = [{"id": "conflict-1", "caseId": "missing", "claimIds": ["missing"]}]
        errors = self.errors()
        self.assertTrue(any("unknown source" in e["message"] for e in errors))
        self.assertTrue(any("caseRefs" in e["path"] for e in errors))
        self.assertTrue(any("claimIds" in e["path"] for e in errors))
        self.assertTrue(any("caseId" in e["path"] for e in errors))

    def test_original_ai_grade_cannot_upgrade_claim_to_supported(self):
        claim = self.library["cases"][0]["claims"][0]
        claim["status"] = "supported"
        self.assertTrue(any("supported requires" in e["message"] for e in self.errors()))
        claim["verification"] = [{"sourceId": "report", "locator": "high confidence table", "checkedAt": "2026-09-05T04:00:00Z", "conclusion": "supports", "notes": "The AI report labels this A."}]
        self.assertTrue(any("AI reports" in e["message"] for e in self.errors()))

    def test_supported_requires_read_web_source_and_complete_check(self):
        check = self.add_verification()
        self.library["cases"][0]["claims"][0]["status"] = "supported"
        self.assertEqual(self.errors(), [])
        self.library["sources"][-1]["status"] = "registered"
        self.assertTrue(self.errors())
        self.library["sources"][-1]["status"] = "read"
        self.library["sources"][-1]["url"] = None
        check["notes"] = ""
        check["checkedAt"] = "yesterday"
        check["locator"] = ""
        errors = self.errors()
        for field in ("url", "notes", "checkedAt", "locator"):
            self.assertTrue(any(e["path"].endswith("." + field) for e in errors), field)

    def test_contradictions_must_be_preserved_as_disputed(self):
        self.add_verification()
        self.add_verification("contradicts", "second-source")
        claim = self.library["cases"][0]["claims"][0]
        claim["status"] = "supported"
        self.assertTrue(any("disputed" in e["message"] for e in self.errors()))
        claim["status"] = "disputed"
        self.assertEqual(self.errors(), [])

    def test_inconclusive_can_remain_unverified_but_supports_cannot(self):
        check = self.add_verification("inconclusive")
        self.assertEqual(self.errors(), [])
        check["conclusion"] = "supports"
        self.assertTrue(any("unverified lead" in e["message"] for e in self.errors()))

    def test_missing_file_and_changed_source_hash_are_rejected(self):
        (self.root / "report.txt").write_text("changed", encoding="utf-8")
        self.assertTrue(any("does not match" in e["message"] for e in self.errors()))
        (self.root / "report.txt").unlink()
        self.assertTrue(any("cannot read source" in e["message"] for e in self.errors()))

    def test_case_claim_and_source_ids_are_unique(self):
        self.library["sources"].append(copy.deepcopy(self.library["sources"][0]))
        self.library["cases"].append(copy.deepcopy(self.library["cases"][0]))
        errors = self.errors()
        self.assertGreaterEqual(sum("duplicate id" in e["message"] for e in errors), 3)

    def test_output_cannot_overwrite_library_directly_or_through_links(self):
        before = self.library_path.read_bytes()
        link = self.root / "symlink.json"
        link.symlink_to(self.library_path)
        hardlink = self.root / "hardlink.json"
        os.link(self.library_path, hardlink)
        for output in (self.library_path, link, hardlink):
            result, _ = self.run_cli("packet", str(self.library_path), "--brand", "Nike", "--output", str(output), expected=1)
            self.assertIn("must not overwrite", result["errors"][0]["message"])
            self.assertEqual(self.library_path.read_bytes(), before)

    def test_output_file_matches_stdout_and_does_not_mutate_library(self):
        before = self.library_path.read_bytes()
        output = self.root / "packet.json"
        _, rendered = self.run_cli("packet", str(self.library_path), "--brand", "Nike", "--output", str(output))
        self.assertEqual(output.read_text(encoding="utf-8"), rendered)
        self.assertEqual(self.library_path.read_bytes(), before)

    def test_json_schema_is_a_readable_draft_2020_schema(self):
        schema = json.loads((SCRIPT.parent.parent / "references" / "library.schema.json").read_text(encoding="utf-8"))
        self.assertEqual(schema["$schema"], "https://json-schema.org/draft/2020-12/schema")
        self.assertIn("claim", schema["$defs"])


if __name__ == "__main__":
    unittest.main()
