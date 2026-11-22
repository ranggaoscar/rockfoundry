from rockfoundry.gh import PullRequest


class FakeGh:
    def __init__(self, prs: list[PullRequest], homepage: str | None = None, ok: bool = True):
        self._prs, self._homepage, self._ok = prs, homepage, ok

    def available(self) -> bool:
        return self._ok

    def pull_requests(self, repo: str, limit: int = 200) -> list[PullRequest]:
        return list(self._prs)[:limit]

    def homepage(self, repo: str) -> str | None:
        return self._homepage
