import json
import os
import re
import subprocess
import urllib.request
from pathlib import Path

root = Path(__file__).resolve().parent.parent
user = "arhwx"


def get(url):
    req = urllib.request.Request(url, headers={"Accept": "application/vnd.github+json"})
    if os.environ.get("GITHUB_TOKEN"):
        req.add_header("Authorization", "Bearer " + os.environ["GITHUB_TOKEN"])
    with urllib.request.urlopen(req) as r:
        return json.load(r)


items = []

# pages on the site, dated by their last commit
for section in ("blog", "projects"):
    for page in sorted((root / section).glob("*/index.html")):
        date = subprocess.run(
            ["git", "log", "-1", "--format=%cs", "--", str(page.parent)],
            cwd=root, capture_output=True, text=True).stdout.strip()
        if not date:
            continue
        html = page.read_text()
        title = re.search(r"<title>(.*?)</title>", html, re.S)
        title = title.group(1).strip() if title else page.parent.name
        title = re.sub(r"\s*-\s*arhwx\s*$", "", title)
        note = re.search(r'<meta name="description" content="(.*?)"', html)
        items.append({"date": date, "title": title,
                      "url": f"/{section}/{page.parent.name}/",
                      "note": note.group(1) if note else ""})

# my repos, dated by their last push
for repo in get(f"https://api.github.com/users/{user}/repos?per_page=100"):
    if repo["fork"] or repo["name"] in (f"{user}.github.io", user):
        continue
    items.append({"date": repo["pushed_at"][:10], "title": repo["name"],
                  "url": repo["html_url"], "note": repo["description"] or ""})

# merged PRs elsewhere, dated by when they were merged
for pr in get(f"https://api.github.com/search/issues?q=author:{user}+type:pr+is:merged")["items"]:
    repo = "/".join(pr["repository_url"].split("/")[-2:])
    items.append({"date": pr["closed_at"][:10], "title": pr["title"],
                  "url": pr["html_url"], "note": "merged into " + repo})

overrides_path = root / "data" / "feed-overrides.json"
if overrides_path.exists():
    overrides = json.loads(overrides_path.read_text())
    for item in items:
        item.update(overrides.get(item["url"], {}))

items.sort(key=lambda item: item["date"], reverse=True)
out = root / "data" / "feed.json"
out.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n")
print(len(items), "items")
