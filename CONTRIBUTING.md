# Contributing

Thanks for helping. Aniwhere is developed privately and published here with each release, so:

- **Bug reports and ideas** are the most useful thing you can send. Use the issue templates.
- **Pull requests** are welcome for fixes. They may be applied by hand in the private repo and show up in the next
  release rather than being merged directly, and you'll be credited in the changelog.
- **Episodes not loading?** That's usually ani-cli catching up with a streaming site. Try Settings → Stream source →
  *Update ani-cli* first, and check [ani-cli's issues](https://github.com/pystardust/ani-cli/issues).

## Running it locally

Python 3.11+, from the repository root:

```bash
python3 -m venv venv && venv/bin/pip install -r requirements.txt
```

```bash
venv/bin/python deploy/gen_icons.py static/icons && mkdir -p static/vendor && curl -fsSL https://cdn.jsdelivr.net/npm/hls.js@1.5.15/dist/hls.min.js -o static/vendor/hls.min.js
```

```bash
ANIME_DATA=./data ANI_CLI_PATH=/path/to/ani-cli ANIME_BRIDGE=./bridge.sh venv/bin/uvicorn app.main:app --reload
```

With no `ANIME_ALLOWED_LOGINS` set, every request acts as the owner, which is handy locally. Never run it that way on
a network.

## Style

Keep it simple: vanilla JS, no build step, FastAPI and SQLite. Match the code around your change.
