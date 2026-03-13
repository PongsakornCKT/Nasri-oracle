# Pattern: WSL Shell Scripts via Windows Tooling Need CRLF Strip

**Context**: Claude Code runs on Windows. Any shell script written via `Write` tool or Bash heredoc that targets a WSL path will have Windows line endings (CRLF `\r\n`).

**Symptom**: Running `bash script.sh` in WSL gives `$'\r': command not found` or `set: invalid option name`.

**Fix (one-shot)**:
```bash
sed -i 's/\r//' /path/to/script.sh
```

**Fix (preventive)** — add to Write/Edit workflow:
After writing any `.sh` file intended for WSL, immediately run:
```bash
wsl -e bash -c "sed -i 's/\r//' /mnt/c/path/to/file.sh"
```

Also applies to `.env` files sourced in WSL.

**Root cause**: Bash on Linux is strict about CR bytes. Windows line endings are `\r\n`; Linux expects `\n` only.
