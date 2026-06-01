# Homeworks — Deploy

## What this deploys

A production-shaped single-host install:

- **uvicorn** running `server.app:app` on `127.0.0.1:8000`, managed by **systemd**
  (auto-restart, hardened: `NoNewPrivileges`, `ProtectSystem=strict`, `ProtectHome`,
  `PrivateTmp`, dropped ambient caps).
- **Caddy** on `:80` / `:443` as the public reverse proxy, with automatic
  Let's Encrypt TLS for your domain and a strict security header set
  (HSTS, `X-Content-Type-Options`, `X-Frame-Options`, `Referrer-Policy`,
  `Permissions-Policy`).
- **ufw** firewall: only `OpenSSH`, `80/tcp`, `443/tcp` are allowed inbound.
- Secrets live in `/etc/homeworks/env` (mode `0640`, owned `root:homeworks`),
  never in the repo.

## Prereqs

1. A domain you control (e.g. `example.uz`).
2. An **A-record** for that domain pointing at this server's public IP.
   The installer prints the public IP at the end so you can set the record.
3. Ubuntu/Debian VPS with root SSH.

## Install

On the VPS, as root:

```sh
cd /opt && sudo git clone https://github.com/s1gmamale1/Homeworks.git homeworks
cd /opt/homeworks
sudo bash deploy/install.sh --domain example.uz
```

The script is **idempotent** — re-running it is safe and will not overwrite
`/etc/homeworks/env` once it has been provisioned.

Optional flags:

```sh
sudo bash deploy/install.sh --domain example.uz \
    --repo-url https://github.com/s1gmamale1/Homeworks.git \
    --branch DaddysBranch
```

## Update

```sh
cd /opt/homeworks
sudo git pull
sudo systemctl restart homeworks
```

If `requirements.txt` changed:

```sh
sudo -u homeworks /opt/homeworks/.venv/bin/pip install -r /opt/homeworks/requirements.txt
sudo systemctl restart homeworks
```

## View logs

```sh
journalctl -u homeworks -f          # app logs
journalctl -u caddy    -f           # caddy systemd logs
tail -f /var/log/caddy/access.log   # caddy access log (JSON)
```

## Where things live

| Path                                | What                                  |
| ----------------------------------- | ------------------------------------- |
| `/opt/homeworks`                    | Repo / working dir                    |
| `/opt/homeworks/.venv`              | Python virtualenv                     |
| `/opt/homeworks/var/homeworks.db`   | SQLite database                       |
| `/etc/homeworks/env`                | Secrets / runtime config (0640)       |
| `/etc/systemd/system/homeworks.service` | systemd unit                      |
| `/etc/caddy/Caddyfile`              | Rendered Caddy config                 |
| `/var/log/homeworks/`               | Reserved for app file logs            |
| `/var/log/caddy/access.log`         | Caddy access log                      |

## Rotating secrets

```sh
sudo nano /etc/homeworks/env          # edit the value(s)
sudo systemctl restart homeworks
```

Caddy never reads `/etc/homeworks/env`, so no Caddy restart is needed unless
you also changed the domain.

## Admin: reading applications

```sh
curl -H "X-Admin-Token: $(sudo grep APPLICATIONS_ADMIN_TOKEN /etc/homeworks/env | cut -d= -f2-)" \
     https://example.uz/api/applications | jq
```

Replace `example.uz` with your actual domain.
