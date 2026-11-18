# Havoc

A fun bot for Haven servers. It logs in as a normal account and answers
messages that start with a prefix (`h!` by default).

| Command | What it does |
|---|---|
| `h!cat` | a random cat picture |
| `h!fish` | go fishing: random catch from trash to legendary (20s cooldown) |
| `h!blowup [@user]` | "explodes" a picture: the middle bulges out and the rest warps. Uses the first attached image if there is one (skipping files that aren't pictures), otherwise the named user's profile picture, otherwise yours |
| `h!bet` | not built yet |
| `h!help` | lists the commands |

Havoc only answers in server channels, never in DMs or group DMs. Every
message it sends is silent and is a reply to the command. Cooldowns are per
person and per command (cat 5s, fish 20s, blowup 15s).

## Setup

1. Make an account for the bot on the Haven server (two-factor auth off).
2. Copy `.env.example` to `.env` and fill in `HAVEN_URL`, `HAVOC_USERNAME`
   and `HAVOC_PASSWORD`.
3. Install and start (Node 22+):

```bash
npm install
npm start
```

If the server isn't up yet, Havoc keeps retrying every 10 seconds and
connects as soon as it is.

`npm run preview-blowup -- some-picture.png` writes `out/boom.gif` without
needing a server.

## Running it 24/7 on a free VPS

Oracle Cloud's Always Free tier works well: make an Ubuntu VM (the Ampere/ARM
shape is plenty), then:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone <your repo> havoc && cd havoc && npm install
cp .env.example .env && nano .env
sudo cp havoc.service /etc/systemd/system/ && sudo systemctl enable --now havoc
```

`havoc.service` assumes the code is in `/home/ubuntu/havoc`; edit the paths if not.
Logs: `journalctl -u havoc -f`.

Oracle may reclaim Always Free VMs that sit mostly idle for a week; upgrading
the account to Pay As You Go (still free within the limits) stops that.
