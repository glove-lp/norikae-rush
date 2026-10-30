"""Wait briefly for the selected checkout's HTTP server; fail if it is not ready."""
import sys
import time
import urllib.request

for attempt in range(30):
    try:
        with urllib.request.urlopen(sys.argv[1], timeout=1) as response:
            if response.status == 200 and '<title>乗り換えRUSH</title>' in response.read().decode():
                break
    except OSError:
        pass
    time.sleep(0.2)
else:
    raise SystemExit('Application server did not become ready')
