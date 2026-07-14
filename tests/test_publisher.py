import subprocess
from tools.publisher import publish


def _git(cwd, *args):
    subprocess.run(["git", *args], cwd=cwd, check=True, capture_output=True, text=True)


def test_publish_commits_and_pushes(tmp_path):
    remote = tmp_path / "remote.git"
    remote.mkdir()
    _git(remote, "init", "--bare")

    work = tmp_path / "work"
    work.mkdir()
    _git(work, "init")
    _git(work, "config", "user.email", "t@t.com")
    _git(work, "config", "user.name", "t")
    _git(work, "remote", "add", "origin", str(remote))
    (work / "briefings.json").write_text("[]", encoding="utf-8")
    _git(work, "add", "briefings.json")
    _git(work, "commit", "-m", "init")
    _git(work, "push", "-u", "origin", "master")

    (work / "briefings.json").write_text('[{"id":"x"}]', encoding="utf-8")
    publish(str(work), ["briefings.json"], "add briefing")

    log = subprocess.run(["git", "log", "--oneline"], cwd=remote,
                         capture_output=True, text=True).stdout
    assert "add briefing" in log
