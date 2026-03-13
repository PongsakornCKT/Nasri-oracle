# WSL Mount Path: /c/ not /mnt/c/

**Pattern**: This machine mounts Windows drives at `/c/` (not the standard `/mnt/c/`).

**Discovery**: `ls /mnt/c/Users/pO-Ch` → broken. `ls /c/Users/pO-Ch` → works.

**Why it matters**: Any script, config, or hardcoded path using `/mnt/c/` will silently fail (directory not found) if `set -e` is absent, or loudly fail if it is present.

**Apply**: Always use `/c/Users/pO-Ch/...` for paths on this machine. Verify with `mount | grep "C:"` when in doubt.

**Root cause**: WSL2 `wsl.conf` can configure custom mount points. This setup uses `root=/` for drive mounts.
