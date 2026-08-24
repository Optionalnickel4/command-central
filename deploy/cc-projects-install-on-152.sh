#!/bin/sh
# Run this ON LXC 152 (10.0.0.152) as root. Idempotent, append-only.
# It installs the cc-projects wrapper and authorizes ONLY the new cc_projects
# key against it. It does not read, move or modify the cc-agent or cc-stats
# entries already in authorized_keys.
set -eu

install -d -m 0755 /usr/local/bin

cat > /usr/local/bin/cc-projects <<'WRAPPER'
#!/bin/sh
# cc-projects — read-only PROJECTS.md reader for the Command Central dashboard.
#
# Invoked via an authorized_keys forced command:
#   command="/usr/local/bin/cc-projects $SSH_ORIGINAL_COMMAND",...
#
# SECURITY MODEL — the allowlist is the whole thing:
#   * Only the first argument is ever read, and exactly ONE keyword matches.
#   * No user-supplied text ever reaches `cat`. The single branch execs a FIXED
#     argv against a FIXED absolute path, so no other file is reachable and no
#     flags or extra words can be appended.
#   * Anything else — a different path, a bare shell, extra words, empty input —
#     is denied with exit 1.
#
# sshd expands $SSH_ORIGINAL_COMMAND as a variable, so metacharacters in it are
# word-split but never re-parsed as shell syntax: `projects; rm -rf /` arrives
# as the literal argument "projects;" and is denied.

set -eu

PATH=/usr/local/sbin:/usr/local/bin:/usr/sbin:/usr/bin:/sbin:/bin
export PATH

# The one file this key can ever read.
PROJECTS_FILE=/root/.openclaw/workspace/PROJECTS.md

case "${1:-}" in
  projects)
    [ "$#" -eq 1 ] || { echo "cc-projects: denied (no arguments allowed)" >&2; exit 1; }
    exec cat "$PROJECTS_FILE"
    ;;
  *)
    echo "cc-projects: denied (allowed: projects)" >&2
    exit 1
    ;;
esac
WRAPPER

chown root:root /usr/local/bin/cc-projects
chmod 0755 /usr/local/bin/cc-projects

PUBKEY='ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIDlvHYAoS+t51F9M/u4wG26//CprCrR0Lm/DfJnlUDbA cc-projects@command-central-220'
LINE="command=\"/usr/local/bin/cc-projects \$SSH_ORIGINAL_COMMAND\",no-port-forwarding,no-agent-forwarding,no-X11-forwarding,no-pty,no-user-rc $PUBKEY"

install -d -m 0700 /root/.ssh
touch /root/.ssh/authorized_keys
chmod 0600 /root/.ssh/authorized_keys

# Append only if this exact key is not already authorized.
if grep -qF "$PUBKEY" /root/.ssh/authorized_keys; then
  echo "cc-projects key already present — leaving authorized_keys untouched."
else
  printf '%s\n' "$LINE" >> /root/.ssh/authorized_keys
  echo "cc-projects key added."
fi

echo "--- wrapper self-test on 152 ---"
/usr/local/bin/cc-projects projects | head -3
/usr/local/bin/cc-projects shell        && echo "UNEXPECTED PASS" || echo "denied bare-shell: ok"
/usr/local/bin/cc-projects /etc/passwd  && echo "UNEXPECTED PASS" || echo "denied /etc/passwd: ok"
