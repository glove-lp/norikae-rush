"""Expose useful failure diagnostics in Actions annotations as well as saved artifacts."""
import json
import pathlib
import sys

path = pathlib.Path(sys.argv[1])
if path.suffix == '.json':
    result = json.loads(path.read_text())
    messages = [] if result.get('success') else [str(result)]
else:
    lines = path.read_text(errors='replace').splitlines()
    messages = [line for line in lines if 'error:' in line.lower() or 'error domain' in line.lower()][:20]
    if not messages:
        messages = lines[-10:]
for message in messages:
    escaped = message.replace('%', '%25').replace('\r', '%0D').replace('\n', '%0A')
    print(f'::error::{escaped}')
