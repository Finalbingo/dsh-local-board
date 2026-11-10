#!/usr/bin/env python3
"""Morning digest for the DSH kanban: reads 看板.md and posts one macOS notification.

Today's due cards are listed in clock order, so a 09:30 meeting reads before an
18:00 one. Falls back to the in-progress list when nothing is due.

Usage: digest.py [--dry-run] [--force]
"""
import datetime
import os
import pathlib
import re
import subprocess
import sys

BOARD = pathlib.Path(os.environ.get('KANBAN_BOARD') or pathlib.Path(os.environ.get('DSH_KANBAN_VAULT') or pathlib.Path.home() / 'Documents/DSH看板') / '看板.md')
TITLE = '看板 · 今日提醒'

ITEM_RE = re.compile(r'^\s*[-*]\s+\[([ xX])\]\s+(.*)$')
BLOCK_ID_RE = re.compile(r'\s\^([A-Za-z0-9-]+)\s*$')
DUE_RE = re.compile(r'📅\s*(\d{4}-\d{2}-\d{2})(?:\s+(\d{1,2}:\d{2}))?')

SNAPSHOT = pathlib.Path(os.environ.get('KANBAN_SNAPSHOT') or pathlib.Path.home() / '.dsh/kanban/board-snapshot.md')


def read_board():
    """Read the vault file; LaunchAgents cannot read ~/Documents and the file may be gone,
    so fall back to the snapshot the plugin keeps in a readable location."""
    try:
        return BOARD.read_text(encoding='utf-8')
    except OSError:
        return SNAPSHOT.read_text(encoding='utf-8')

def parse(board_text):
    rows, project, status = [], '', ''
    for line in board_text.splitlines():
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
        rows.append({
            'project': project,
            'status': status,
            'title': body.split(' · ')[0].strip(),
            'due': due.group(1) if due else '',
            'due_time': (due.group(2) or '') if due else '',
            'done': item.group(1).lower() == 'x' or status in ('done', '已完成'),
        })
    return rows

def label(row):
    stamp = f"{row['due_time']} " if row['due_time'] else ''
    return f"{stamp}{row['project']}·{row['title']}"

def build(rows, today):
    open_items = [r for r in rows if not r['done']]
    due_today = sorted(
        [r for r in open_items if r['due'] == today],
        key=lambda r: r['due_time'] or '99:99'
    )
    overdue = sorted(
        [r for r in open_items if r['due'] and r['due'] < today],
        key=lambda r: r['due']
    )
    doing = [r for r in open_items if r['status'] in ('doing', '进行中')]
    parts = []
    if due_today:
        parts.append(f"今天到期 {len(due_today)} 项：" + '；'.join(label(r) for r in due_today[:3]))
    if overdue:
        parts.append(f"已逾期 {len(overdue)} 项：" + '；'.join(label(r) for r in overdue[:3]))
    if not parts and doing:
        parts.append(f"进行中 {len(doing)} 项：" + '；'.join(label(r) for r in doing[:3]))
    body = '；'.join(parts)
    if len(body) > 200:
        body = body[:197] + '…'
    return body

def notify(body):
    script = 'display notification "' + body.replace('"', '\\"') + '" with title "' + TITLE + '" sound name "Glass"'
    subprocess.run(['/usr/bin/osascript', '-e', script], check=False)

def main():
    today = datetime.date.today().isoformat()
    try:
        rows = parse(read_board())
    except OSError as error:
        print('cannot read board or snapshot:', error, file=sys.stderr)
        return 1
    body = build(rows, today)
    force = '--force' in sys.argv
    if not body and not force:
        print('nothing to report')
        return 0
    if not body:
        body = '今天没有到期项'
    if '--dry-run' in sys.argv:
        print('title:', TITLE)
        print('body :', body)
        return 0
    notify(body)
    print('notified:', body)
    return 0

sys.exit(main())
