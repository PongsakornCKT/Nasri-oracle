"""Pytest configuration for mcp-bomsolar tests.

Sets LF_BOM_FIXTURE_MODE=1 automatically so `python3 -m pytest tests/` passes
without needing external environment variable exports.
"""

import os
import pytest


@pytest.fixture(autouse=True)
def enable_fixture_mode_by_default(monkeypatch):
    monkeypatch.setenv("LF_BOM_FIXTURE_MODE", "1")
