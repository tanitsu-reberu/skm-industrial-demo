"""Local operations helpers; no source, restore or backup protocol changes."""

import contextlib
import fcntl
import json
import os
import stat
import tempfile

from common import json_bytes, protected, require


@contextlib.contextmanager
def exclusive(path, *, existing=False):
    if existing:
        protected(path, owner=os.geteuid())
    fd = os.open(
        path,
        (os.O_RDONLY if existing else os.O_RDWR | os.O_CREAT) | os.O_NOFOLLOW,
        0o600,
    )
    try:
        info = os.fstat(fd)
        require(
            stat.S_ISREG(info.st_mode)
            and info.st_uid == os.geteuid()
            and not info.st_mode & 0o077,
            "unsafe_lock",
        )
        try:
            fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            yield False
        else:
            yield True
    finally:
        os.close(fd)


def read_json(path, *, owner=None, limit=65536):
    path = protected(path, owner=os.geteuid() if owner is None else owner)
    require(path.stat().st_size <= limit, "state_limit")
    value = json.loads(path.read_bytes())
    require(isinstance(value, dict), "invalid_state")
    return value


def atomic_json(path, value):
    protected(path.parent, owner=os.geteuid(), directory=True)
    fd, temporary = tempfile.mkstemp(prefix=".ops-", dir=path.parent)
    try:
        with os.fdopen(fd, "wb") as out:
            os.fchmod(out.fileno(), 0o600)
            out.write(json_bytes(value))
            out.flush()
            os.fsync(out.fileno())
        os.replace(temporary, path)
        directory = os.open(path.parent, os.O_RDONLY | os.O_DIRECTORY)
        try:
            os.fsync(directory)
        finally:
            os.close(directory)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)
