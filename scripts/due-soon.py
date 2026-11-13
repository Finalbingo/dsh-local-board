#!/usr/bin/env python3
"""Upcoming-due reminder: fires only when a card is due within the next two hours.

Each card is announced once per due value — a state file keeps the ones already
sent, so the job can run every half hour without nagging.

Usage: due-soon.py [--dry-run] [--window 120]
"""
import datetime
import json
import pathlib
import re
import os
import subprocess
import sys

BOARD = pathlib.Path(os.environ.get('KANBAN_BOARD') or pathlib.Path(os.environ.get('DSH_KANBAN_VAULT') or pathlib.Path.home() / 'Documents/DSH看板') / '看板.md')
STATE = pathlib.Path(os.environ.get('KANBAN_STATE') or pathlib.Path.home() / '.dsh/kanban/notify/state.json')
TITLE = '看板 · 即将到期'

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
        block_id = BLOCK_ID_RE.search(' ' + item.group(2))
        due = DUE_RE.search(body)
        rows.append({
            'id': block_id.group(1) if block_id else '',
            'key': f"{project}|{body.split(' · ')[0].strip()}",
            'project': project,
            'title': body.split(' · ')[0].strip(),
            'status': status,
            'due_date': due.group(1) if due else '',
            'due_time': (due.group(2) if due and due.group(2) else ''),
            'open': item.group(1).lower() != 'x' and status not in ('done', '已完成'),
        })
    return rows

def load_state():
    try:
        return json.loads(STATE.read_text(encoding='utf-8'))
    except Exception:
        return {}

def save_state(state):
    STATE.parent.mkdir(parents=True, exist_ok=True)
    STATE.write_text(json.dumps(state, ensure_ascii=False), encoding='utf-8')

APPLESCRIPT = (
    'on run argv\n'
    '  display notification (item 2 of argv) with title (item 1 of argv) subtitle "DSH 看板" sound name "Glass"\n'
    'end run'
)


def notify(title, body):
    """Notification text is user data: pass it as argv so AppleScript never parses it."""
    try:
        result = subprocess.run(
            ['/usr/bin/osascript', '-e', APPLESCRIPT, str(title), str(body)],
            capture_output=True, text=True, timeout=20
        )
        if result.returncode != 0:
            print('notify failed:', (result.stderr or '').strip() or 'osascript exit ' + str(result.returncode), file=sys.stderr)
            return False
        return True
    except (OSError, subprocess.SubprocessError) as error:
        print('notify failed:', error, file=sys.stderr)
        return False


def main():
    window = 120
    if '--window' in sys.argv:
        window = int(sys.argv[sys.argv.index('--window') + 1])
    now = datetime.datetime.now()
    horizon = now + datetime.timedelta(minutes=window)
    try:
        rows = parse(read_board())
    except OSError as error:
        print('cannot read board or snapshot:', error, file=sys.stderr)
        return 1
    state = {k: v for k, v in load_state().items() if v and v > (now - datetime.timedelta(days=2)).isoformat(timespec='minutes')}
    hits = []
    for row in rows:
        if not row['open'] or not row['due_time']:
            continue
        try:
            when = datetime.datetime.strptime(f"{row['due_date']} {row['due_time']}", '%Y-%m-%d %H:%M')
        except ValueError:
            continue
        key = f"{row['id'] or row['key']}@{row['due_date']} {row['due_time']}"
        if key in state or not (now <= when <= horizon):
            continue
        minutes = int((when - now).total_seconds() // 60)
        hits.append((when, minutes, row, key))
    if not hits:
        if '--dry-run' in sys.argv:
            print('nothing due in the next', window, 'minutes')
        return 0
    hits.sort(key=lambda entry: entry[0])
    parts = []
    for when, minutes, row, _key in hits[:3]:
        parts.append(f"{when.strftime('%H:%M')} {row['project']}·{row['title']}（{minutes} 分钟后）")
    body = '；'.join(parts)
    if len(body) > 200:
        body = body[:197] + '…'
    if '--dry-run' in sys.argv:
        print('body:', body)
        return 0
    notify(TITLE, body)
    for when, _minutes, _row, key in hits:
        state[key] = when.isoformat(timespec='minutes')
    save_state(state)
    print('notified:', body)
    return 0

sys.exit(main())
