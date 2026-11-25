# Havoc

A fun and economy bot for Haven servers. It logs in as a normal account on
any number of servers at once and answers messages that start with a prefix
(`?` in the examples).

| Command | What it does | Default cooldown |
|---|---|---|
| `?help` | lists the commands (admins also see the admin ones) | 5sec |
| `?cat` | a random cat picture | 5sec |
| `?fish` / `?mine` | go fishing or mining; catches (trash included) go in your Backpack, with a small risk of a hospital bill | 5sec |
| `?hunt small` / `?hunt big` | go hunting with a Hunting License, a gun and ammo; the biggest risk of a hospital bill | 5sec |
| `?crew` | hire, fire and rename crew who catch alongside you and share your hospital risk; paid once a day; `?crew overtime [on|off]` shows how close each is to overtime and can sit out anyone who reaches it | 5sec |
| `?money` / `?stats [@user]` | money, energy, licenses, crew, tools, Backpack and safe, yours or someone else's | 5sec |
| `?safe` | move things between your Backpack and your safe, or sell from the safe | 5sec |
| `?give <user> <amount>` / `?give <user> <item> [amount\|all]` (also `?zelle`) | give someone cash, or items from your Backpack; they get a ping | 5sec |
| `?blowup [@user]` | "explodes" a picture: the first attached image, else the named user's, else yours | 15sec |
| `?id [@user]` | a Haven user id | 1hr |
| `?cooldown` | **admin**: list cooldowns, `?cooldown <command> <X><sec\|min\|hr>` to override one on this server, `?cooldown reset <command>` to remove it | none |
| `?remote [server]` | **admin**: run your commands as if on another server (replies still come here); alone, turns it off | none |
| `?link <server>:<id> <server>:<id>` | **admin**: the first profile uses the second one's money, stuff and progress everywhere, `?gdp` and `?top` included (its own is kept for when the link goes; a profile can be in one link); `?link list`, `?link remove <server>:<id>` | none |

How it behaves:
- Answers only in server channels (never DMs), in forum topics and threads
  where the command was typed. Every message is silent and a reply to the command,
  except pings (a milestone, a gift received), which notify.
- Cooldowns are per person, per command, per server. Admins skip them.
  Non-admins get no response at all to admin commands.
- `?fish` and `?money` are economy commands. A guest account gets
  "Guest accounts are unable to use economy commands" once, then is ignored
  by them for 12 hours.
- Errors never reach chat: details go to the console, chat gets a short
  friendly line.
- Everything is stored per server and per Haven user id (never display
  names) in a SQLite file, `havoc.db`.

## Setup

1. On each Haven server, make an account for the bot (two-factor auth off).
2. Copy `.env.example` to `.env` and fill in `SERVERS` (see the comments in it).
3. Install and start (Node 22.13+):

```bash
npm install
npm start
```

A server that is down is retried every 10 seconds. A server entry with a
missing or duplicate name is skipped with the reason logged; if none are
usable, Havoc stops.

`npm run preview-blowup -- some-picture.png` writes `out/boom.gif` without
needing a server.

## Code layout

| File | Job |
|---|---|
| `src/index.js` | start-up: config, database, one connection per server |
| `src/config.js` | reads and validates `SERVERS` |
| `src/haven.js` | Haven client: login, messages, member lookups, sending |
| `src/router.js` | admin check, `?remote`, guest check, cooldowns, payday, error handling |
| `src/db.js` | SQLite storage; `db.linked` follows `?link` and only economy commands get it |
| `src/cooldowns.js`, `src/duration.js` | cooldown checks and `30sec`/`5min`/`1hr` text |
| `src/items.js` | everything that can be in a Backpack or safe, with sell prices |
| `src/storage.js` | Backpack and safe space, choosing items by name, amount or tier |
| `src/hospital.js`, `src/milestones.js` | hospital bills; economy command milestones |
| `src/crew.js` | crew: catching alongside you, sharing the risk, wages and payday |
| `src/members.js` | `@user` lookup shared by commands |
| `src/commands/` | one file per command; `index.js` lists them |

## Running it 24/7 on a free VPS

Oracle Cloud's Always Free tier works well: make an Ubuntu VM, then:

```bash
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
git clone https://github.com/Bo0sted/Havoc.git havoc && cd havoc && npm ci --omit=dev
cp .env.example .env && chmod 600 .env && nano .env
sudo cp havoc.service /etc/systemd/system/ && sudo systemctl enable --now havoc
```

`havoc.service` assumes the code is in `/home/ubuntu/havoc`; edit the paths if not.
Logs: `journalctl -u havoc -f`. Update: `git pull && sudo systemctl restart havoc`.

Oracle may reclaim Always Free VMs that sit mostly idle for a week; upgrading
the account to Pay As You Go (still free within the limits) stops that.

## Daily backups to Backblaze

Run `backups/manager.sh` as the user Havoc runs as (not root). The first time,
it walks you through connecting a Backblaze B2 bucket, the encryption password,
and the backup time and retention. After that it shows how backups are going
and lets you run one now, enable or disable the daily backup, look at and
download backups, and change the time or retention.

It backs up `.env` and `havoc.db` with restic, encrypted. A report for each day
goes in `backups/backups/` as `SUCCESS__<date>.txt` or `FAILED__<date>.txt`.
