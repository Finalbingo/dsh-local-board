#!/usr/bin/env python3
"""Monday review for the DSH kanban: what finished last week, what is still open.

Usage: weekly.py [--dry-run]
"""
import datetime
import pathlib
import re
import os
import subprocess
import sys

BOARD = pathlib.Path(os.environ.get('KANBAN_BOARD') or pathlib.Path(os.environ.get('DSH_KANBAN_VAULT') or pathlib.Path.home() / 'Documents/DSH看板') / '看板.md')
TITLE = '看板 · 周回顾'
ITEM_RE = re.compile(r'^\s*[-*]\s+\[([ xX])\]\s+(.*)$')
BLOCK_ID_RE = re.compile(r'\s\^([A-Za-z0-9-]+)\s*$')
DUE_RE = re.compile(r'📅\s*(\d{4}-\d{2}-\d{2})')
DONE_RE = re.compile(r'✅\s*(\d{4}-\d{2}-\d{2})')

SNAPSHOT = pathlib.Path(os.environ.get('KANBAN_SNAPSHOT') or pathlib.Path.home() / '.dsh/kanban/board-snapshot.md')


def read_board():
    """Read the vault file; LaunchAgents have no Documents access, so fall back to the snapshot."""
    try:
        return BOARD.read_text(encoding='utf-8')
    except (PermissionError, OSError):
        return SNAPSHOT.read_text(encoding='utf-8')

def parse(text):
    rows, project, status = [], '', ''
    for line in text.splitlines():
        heading = re.match(r'^##\s+(.+?)\s*$', line)
        if heading:
            project, status = heading.group(1).strip(), ''
            continue
        column = re.match(r'^###\s+(.+?)\s*$', line)
        if column:
            status = column.group(1).strip().lower()
            continue
        item = ITEM_RE.match(line)
        if not item or not status:
            continue
        body = BLOCK_ID_RE.sub('', item.group(2)).strip()
        due = DUE_RE.search(body)
        done_at = DONE_RE.search(body)
        rows.append({
            'project': project,
            'title': body.split(' · ')[0].strip(),
            'status': status,
            'due': due.group(1) if due else '',
            'done_at': done_at.group(1) if done_at else '',
            'done': item.group(1).lower() == 'x' or status in ('done', '已完成'),
        })
    return rows

def build(rows, today):
    since = (today - datetime.timedelta(days=7)).isoformat()
    start = today.isoformat()
    finished = [r for r in rows if r['done'] and r['done_at'] and since <= r['done_at'] <= start]
    open_items = [r for r in rows if not r['done']]
    overdue = [r for r in open_items if r['due'] and r['due'] < start]
    doing = [r for r in open_items if r['status'] in ('doing', '进行中')]
    parts = [f'上周完成 {len(finished)} 项', f'进行中 {len(doing)} 项', f'待办 {len(open_items) - len(doing)} 项']
    if overdue:
        parts.append(f'逾期 {len(overdue)} 项：' + '；'.join(f"{r['project']}·{r['title']}" for r in overdue[:3]))
    body = '，'.join(parts[:3]) + ('。' + parts[3] if len(parts) > 3 else '')
    if len(body) > 200:
        body = body[:197] + '…'
    return body

def main():
    if not BOARD.exists():
        print('board not found', file=sys.stderr)
        return 1
    today = datetime.date.today()
    body = build(parse(read_board()), today)
    if '--dry-run' in sys.argv:
        print('body:', body)
        return 0
    script = 'display notification "' + body.replace('"', '\\"') + '" with title "' + TITLE + '" sound name "Glass"'
    subprocess.run(['/usr/bin/osascript', '-e', script], check=False)
    print('notified:', body)
    return 0

sys.exit(main())
