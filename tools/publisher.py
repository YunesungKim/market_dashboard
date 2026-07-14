import subprocess


def publish(repo_dir, files, message, push=True):
    """지정 파일을 add → commit → (옵션) push. 실패 시 RuntimeError."""
    _run(["git", "add", *files], repo_dir)
    _run(["git", "commit", "-m", message], repo_dir)
    if push:
        _run(["git", "push"], repo_dir)


def _run(cmd, cwd):
    result = subprocess.run(cmd, cwd=cwd, capture_output=True, text=True)
    if result.returncode != 0:
        raise RuntimeError(f"{' '.join(cmd)} 실패: {result.stderr.strip()}")
    return result.stdout
