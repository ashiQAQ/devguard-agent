"""
API 路由集成测试
"""

import pytest
import asyncio
from unittest.mock import patch, AsyncMock, MagicMock
from fastapi.testclient import TestClient

from devguard.api.app import app


@pytest.fixture(scope="module")
def client():
    """创建测试客户端"""
    with TestClient(app) as c:
        yield c


@pytest.mark.integration
class TestRequirementsAPI:
    """需求 API 集成测试"""

    def test_health_check(self, client):
        """测试健康检查"""
        resp = client.get("/health")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_analyze_requirement(self, client, sample_requirement_json):
        """测试需求分析接口"""
        with patch("devguard.api.routes.requirements.FlowA") as MockFlowA:
            mock_instance = AsyncMock()
            mock_instance.execute.return_value = {
                "status": "success",
                "requirement_id": sample_requirement_json["id"],
                "features": [],
                "alignment_results": {},
                "implementation_plan": {},
                "code_skeleton": "",
                "doc_suggestions": []
            }
            MockFlowA.return_value = mock_instance

            resp = client.post("/api/requirements/analyze", json=sample_requirement_json)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert data["requirement_id"] == sample_requirement_json["id"]

    def test_parse_requirement(self, client, sample_requirement_json):
        """测试需求解析接口"""
        with patch("devguard.api.routes.requirements.ReqParser") as MockParser:
            mock_instance = MagicMock()
            mock_instance.parse.return_value = [
                MagicMock(
                    id="BR-001",
                    name="雨量分级检测",
                    feature_type="BUSINESS",
                    phase="CODE_LOGIC",
                    keywords=["雨量"],
                    priority="P0",
                    specified=True,
                    constraint="",
                    acceptance=[]
                )
            ]
            MockParser.return_value = mock_instance

            resp = client.post("/api/requirements/parse", json=sample_requirement_json)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "features" in data

    def test_list_requirements(self, client):
        """测试需求列表接口"""
        resp = client.get("/api/requirements/list")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "requirements" in data

    def test_get_requirement_not_found(self, client):
        """测试获取不存在的需求"""
        resp = client.get("/api/requirements/nonexistent-id")
        assert resp.status_code in (200, 404)

    def test_analyze_requirement_missing_fields(self, client):
        """测试缺少必要字段"""
        resp = client.post("/api/requirements/analyze", json={"title": "只有标题"})
        assert resp.status_code in (400, 422)

    def test_analyze_requirement_invalid_format(self, client):
        """测试无效格式"""
        payload = {
            "id": "REQ-001",
            "title": "测试",
            "content": "内容",
            "format": "invalid_format"
        }
        resp = client.post("/api/requirements/analyze", json=payload)
        assert resp.status_code in (200, 400, 422)


@pytest.mark.integration
class TestAnalysisAPI:
    """分析 API 集成测试"""

    def test_analyze_pr(self, client, sample_pr_event):
        """测试 PR 分析接口"""
        with patch("devguard.api.routes.analysis.FlowB") as MockFlowB:
            mock_instance = AsyncMock()
            mock_instance.execute.return_value = {
                "status": "completed",
                "pr_number": 9152,
                "can_merge": True,
                "commit_validations": [],
                "code_changes": [],
                "doc_gaps": [],
                "traced_requirements": [],
                "confirmations": []
            }
            mock_instance._generate_pr_comment.return_value = "✅ 分析通过"
            MockFlowB.return_value = mock_instance

            resp = client.post("/api/analysis/pr", json=sample_pr_event)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"
        assert "pr_number" in data

    def test_analyze_pr_missing_number(self, client):
        """测试缺少 PR 号"""
        resp = client.post("/api/analysis/pr", json={"title": "PR without number"})
        assert resp.status_code in (400, 422)

    def test_get_pr_analysis(self, client):
        """测试获取 PR 分析结果"""
        resp = client.get("/api/analysis/pr/9152")
        assert resp.status_code in (200, 404)

    def test_confirm_pr_analysis(self, client):
        """测试确认 PR 分析"""
        payload = {
            "owner": "张三",
            "status": "APPROVE",
            "comment": "功能实现符合需求"
        }
        resp = client.post("/api/analysis/pr/9152/confirm", json=payload)
        assert resp.status_code in (200, 404)


@pytest.mark.integration
class TestSimulationAPI:
    """仿真 API 集成测试"""

    def test_run_simulation(self, client, sample_simulation_config):
        """测试运行仿真"""
        with patch("devguard.api.routes.simulation.SimulationOrchestrator") as MockOrch:
            mock_instance = AsyncMock()
            mock_instance.run.return_value = {
                "status": "success",
                "requirement_id": sample_simulation_config["requirement_id"],
                "passed": True,
                "results": [],
                "report": {}
            }
            MockOrch.return_value = mock_instance

            resp = client.post("/api/simulation/run", json=sample_simulation_config)

        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"

    def test_get_simulation_status(self, client):
        """测试获取仿真状态"""
        resp = client.get("/api/simulation/status/sim-001")
        assert resp.status_code in (200, 404)

    def test_get_simulation_results(self, client):
        """测试获取仿真结果"""
        resp = client.get("/api/simulation/results/sim-001")
        assert resp.status_code in (200, 404)

    def test_run_simulation_missing_fields(self, client):
        """测试缺少必要字段"""
        resp = client.post("/api/simulation/run", json={"requirement_id": "REQ-001"})
        assert resp.status_code in (400, 422)


@pytest.mark.integration
class TestBaselinesAPI:
    """基线 API 集成测试"""

    def test_list_baselines(self, client):
        """测试基线列表"""
        resp = client.get("/api/baselines/list")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"

    def test_create_baseline(self, client, sample_baseline):
        """测试创建基线"""
        resp = client.post("/api/baselines/create", json=sample_baseline)
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "success"

    def test_get_baseline(self, client):
        """测试获取基线"""
        resp = client.get("/api/baselines/BL-2025-Q1-001")
        assert resp.status_code in (200, 404)

    def test_get_baseline_versions(self, client):
        """测试获取基线版本历史"""
        resp = client.get("/api/baselines/BL-2025-Q1-001/versions")
        assert resp.status_code in (200, 404)


@pytest.mark.integration
class TestWebhookAPI:
    """Webhook API 集成测试"""

    def test_github_webhook_status(self, client):
        """测试 Webhook 状态"""
        resp = client.get("/api/webhook/github/status")
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ok"

    def test_github_webhook_pr_opened(self, client, sample_pr_event):
        """测试 PR 打开事件"""
        payload = {
            "action": "opened",
            "number": 9152,
            "pull_request": {
                "number": 9152,
                "title": sample_pr_event["title"],
                "body": sample_pr_event["description"],
                "user": {"login": sample_pr_event["author"]},
                "head": {"ref": sample_pr_event["branch"]},
                "changed_files": sample_pr_event["changed_files"],
                "additions": sample_pr_event["additions"],
                "deletions": sample_pr_event["deletions"]
            },
            "repository": {
                "name": "test-repo",
                "owner": {"login": "test-org"}
            }
        }

        with patch("devguard.webhook.github_handler.get_pr_commits", new_callable=AsyncMock) as mock_commits:
            with patch("devguard.webhook.github_handler.post_pr_comment", new_callable=AsyncMock) as mock_comment:
                with patch("devguard.webhook.github_handler.FlowB") as MockFlowB:
                    mock_commits.return_value = []
                    mock_comment.return_value = True
                    mock_instance = AsyncMock()
                    mock_instance.execute.return_value = {
                        "status": "completed",
                        "can_merge": True
                    }
                    mock_instance._generate_pr_comment.return_value = "✅ 通过"
                    MockFlowB.return_value = mock_instance

                    resp = client.post(
                        "/api/webhook/github/webhook",
                        json=payload,
                        headers={"X-GitHub-Event": "pull_request"}
                    )

        assert resp.status_code == 200

    def test_github_webhook_ignored_event(self, client):
        """测试忽略的事件类型"""
        resp = client.post(
            "/api/webhook/github/webhook",
            json={"action": "labeled"},
            headers={"X-GitHub-Event": "issues"}
        )
        assert resp.status_code == 200
        data = resp.json()
        assert data["status"] == "ignored"
