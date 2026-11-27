"""SSH login shell runs this fixed dispatcher, not the caller's command."""
import os
import sys


def main():
    original = os.environ.get("SSH_ORIGINAL_COMMAND", "")
    if len(sys.argv) != 1 or original not in {"export", "verify"}:
        os.write(2, b"skm_command_rejected\n")
        return 1
    os.execve("/usr/bin/sudo", ["sudo", "-n", "/usr/bin/python3", "-I",
                              "/opt/skm-site-backup/source.py", original],
              {"PATH": "/usr/sbin:/usr/bin:/sbin:/bin", "LANG": "C.UTF-8"})


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception:
        os.write(2, b"skm_command_rejected\n")
        sys.exit(1)
