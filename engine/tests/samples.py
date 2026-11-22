"""Hand-built facts shaped like BresciaHub, for classify and card tests."""

from datetime import date

from rockfoundry.facts import SCHEMA_VERSION, ProjectFacts, ReleaseMarker, WorkdirFacts
from rockfoundry.gh import PullRequest


def wd(path, branch, last, changed=0, in_release=False, in_default=False):
    return WorkdirFacts(
        path=path,
        branch=branch,
        last_commit=last,
        changed_files=changed,
        in_release=in_release,
        in_default=in_default,
    )


def bresciahub_like_facts() -> ProjectFacts:
    prs = [
        PullRequest(n, f"PR {n}", f"feat/pr-{n}", "MERGED", date(2026, 11, 21 + (n % 2)))
        for n in range(23, 31)
    ]
    prs.append(PullRequest(22, "deps", "security/dns", "MERGED", date(2026, 10, 28)))
    return ProjectFacts(
        schema_version=SCHEMA_VERSION,
        slug="bresciahub",
        name="BresciaHub",
        remote="github.com/ranggaoscar/bresciahub",
        default_branch="main",
        first_commit=date(2026, 6, 13),
        commit_count=769,
        last_activity=date(2026, 11, 22),
        release=ReleaseMarker("prod-internal-p2", date(2026, 11, 15), "46c26c40"),
        prs=prs,
        workdirs=[
            wd(
                "C:/AI PROJECTS/BRESCIAHUB-QRIS",
                "release/qris",
                date(2026, 11, 13),
                in_release=True,
                in_default=True,
            ),
            wd(
                "C:/AI PROJECTS/BRESCIAHUB-HOME",
                "release/home",
                date(2026, 10, 31),
                in_release=True,
                in_default=True,
            ),
            wd(
                "D:/HERMES DESIGN AGENT/working/bh-exp",
                "feature/exp",
                date(2026, 11, 2),
                changed=798,
                in_release=True,
            ),
            wd("C:/AI PROJECTS/BRESCIAHUB-STONE", "fix/stone", date(2026, 11, 22)),
            wd("D:/HERMES DESIGN AGENT/working/bh-seo", "feat/seo", date(2026, 11, 18)),
            wd("C:/AI PROJECTS/BRESCIAHUB-BUILD-WEEK", "hackathon/week", date(2026, 7, 17)),
        ],
        main_behind=210,
        main_ahead=2,
        guide_docs={"AGENTS.md": "Dua zona jangan dicampur. Server 203.0.113.7."},
        guide_docs_off_default=["docs/PRODUCTION-BASELINE.md"],
        homepage="https://bresciahub.id",
        notes=[],
    )
