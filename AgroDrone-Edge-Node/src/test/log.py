"""
log.py — AgroDrone Telemetry Logger & Visualizer

Usage:
    python log.py                        # interactive recording mode
    python log.py <csv>                  # re-visualize a saved session
    python log.py <csv> <intervals_csv>  # re-visualize with interval bands

Controls (interactive mode):
    t  — start recording (first press) / stop recording and plot (second press)
    p  — mark interval start (first press) / interval end (second press)
         multiple p-pairs produce multiple shaded bands on the graph
"""

import sys
import os
import time
import csv
import threading
import termios
import tty
from datetime import datetime, timezone

from dotenv import load_dotenv
from pymavlink import mavutil
import plotly.graph_objects as go
import pandas as pd

# ── Config ────────────────────────────────────────────────────────────────────
# .env sits two levels above src/test/
_ENV_PATH = os.path.join(os.path.dirname(__file__), '..', '..', '.env')
load_dotenv(dotenv_path=_ENV_PATH)

DEVICE_NAME = os.getenv('RADIO_DEVICE', '/dev/ttyUSB0')
BAUD_RATE   = int(os.getenv('RADIO_BAUD', 57600))
SAMPLE_HZ   = 4
SAMPLE_INTERVAL = 1.0 / SAMPLE_HZ

OUT_DIR = os.path.dirname(os.path.abspath(__file__))

TELEMETRY_FIELDS = [
    'timestamp',
    'voltage_battery',
    'current_battery',
    'battery_remaining',
    'satellites_visible',
    'gps_hdop',
    'lat',
    'lon',
    'alt_msl',
    'alt_rel',
    'heading',
    'vx',
    'vy',
    'vz',
]

# ── Shared state ──────────────────────────────────────────────────────────────
_recording       = False
_rows: list      = []
_intervals: list = []          # list of (start_ts, end_ts)
_interval_start  = None
_stop_event      = threading.Event()
_start_event     = threading.Event()

# ── Raw keyboard helper ───────────────────────────────────────────────────────

def _getch() -> str:
    """Read a single character from stdin without waiting for Enter."""
    fd = sys.stdin.fileno()
    old = termios.tcgetattr(fd)
    try:
        tty.setraw(fd)
        ch = sys.stdin.read(1)
    finally:
        termios.tcsetattr(fd, termios.TCSADRAIN, old)
    return ch


def _keyboard_listener():
    """Background thread that handles 't' (start/stop) and 'p' (interval marks)."""
    global _recording, _interval_start

    print("Press 't' to begin recording... (Ctrl-C to quit without saving)")

    while True:
        ch = _getch()

        if ch == 't':
            if not _recording:
                # First 't' — signal the main thread to start
                _recording = True
                _start_event.set()
                print('\nRecording started. Press "p" to mark intervals, "t" to stop.')
            else:
                # Second 't' — close any open interval then stop
                if _interval_start is not None:
                    stop_ts = time.time()
                    _intervals.append((_interval_start, stop_ts))
                    print(f'\n  Interval closed at {_fmt_ts(stop_ts)} (auto-closed on stop)')
                    _interval_start = None
                _recording = False
                _stop_event.set()
                break

        elif ch == 'p' and _recording:
            now = time.time()
            if _interval_start is None:
                _interval_start = now
                print(f'\n  Interval started at {_fmt_ts(now)}')
            else:
                _intervals.append((_interval_start, now))
                print(f'  Interval ended   at {_fmt_ts(now)}')
                _interval_start = None

        elif ch == '\x03':  # Ctrl-C
            _stop_event.set()
            break


def _fmt_ts(ts: float) -> str:
    return datetime.fromtimestamp(ts).strftime('%H:%M:%S.%f')[:-3]


# ── MAVLink recording loop ────────────────────────────────────────────────────

def _record_loop():
    """Connect to the radio and sample telemetry at SAMPLE_HZ until _stop_event."""
    print(f'\nConnecting to radio on {DEVICE_NAME} at {BAUD_RATE} baud...')
    try:
        connection = mavutil.mavlink_connection(DEVICE_NAME, baud=BAUD_RATE)
        connection.wait_heartbeat()
        print('Heartbeat received — sampling at 4 Hz.\n')
    except Exception as e:
        print(f'Error connecting to radio: {e}')
        _stop_event.set()
        return

    snapshot = {f: 0.0 for f in TELEMETRY_FIELDS}

    while not _stop_event.is_set():
        loop_start = time.time()

        # Drain all pending MAVLink messages
        while True:
            msg = connection.recv_match(blocking=False)
            if msg is None:
                break
            msg_type = msg.get_type()

            if msg_type == 'SYS_STATUS':
                snapshot['voltage_battery']   = msg.voltage_battery / 1000.0
                snapshot['current_battery']   = msg.current_battery / 100.0
                snapshot['battery_remaining'] = msg.battery_remaining

            elif msg_type == 'GPS_RAW_INT':
                snapshot['satellites_visible'] = msg.satellites_visible
                snapshot['gps_hdop']           = msg.eph / 100.0

            elif msg_type == 'GLOBAL_POSITION_INT':
                snapshot['lat']     = msg.lat / 1e7
                snapshot['lon']     = msg.lon / 1e7
                snapshot['alt_msl'] = msg.alt / 1000.0
                snapshot['alt_rel'] = msg.relative_alt / 1000.0
                snapshot['heading'] = msg.hdg / 100.0
                snapshot['vx']      = msg.vx / 100.0
                snapshot['vy']      = msg.vy / 100.0
                snapshot['vz']      = msg.vz / 100.0

        snapshot['timestamp'] = loop_start
        _rows.append(dict(snapshot))

        elapsed = time.time() - loop_start
        sleep_for = SAMPLE_INTERVAL - elapsed
        if sleep_for > 0:
            time.sleep(sleep_for)


# ── Save ──────────────────────────────────────────────────────────────────────

def _save(ts_tag: str) -> tuple[str, str | None]:
    """Write telemetry rows and interval pairs to CSV files. Returns (csv_path, intervals_path)."""
    csv_path = os.path.join(OUT_DIR, f'log_data/telemetry_{ts_tag}.csv')
    with open(csv_path, 'w', newline='') as f:
        writer = csv.DictWriter(f, fieldnames=TELEMETRY_FIELDS)
        writer.writeheader()
        writer.writerows(_rows)
    print(f'Telemetry saved → {csv_path}')

    intervals_path = None
    if _intervals:
        intervals_path = os.path.join(OUT_DIR, f'log_data/telemetry_{ts_tag}_intervals.csv')
        with open(intervals_path, 'w', newline='') as f:
            writer = csv.writer(f)
            writer.writerow(['start', 'end'])
            writer.writerows(_intervals)
        print(f'Intervals  saved → {intervals_path}')

    return csv_path, intervals_path


# ── Plot ──────────────────────────────────────────────────────────────────────

def plot_session(csv_path: str, intervals_path: str | None = None):
    """
    Load a saved telemetry CSV and display an interactive Plotly graph.
    Each telemetry field is a toggleable trace. Interval pairs are shaded bands.

    Can be called independently:
        from log import plot_session
        plot_session('telemetry_20260403T120000.csv', 'telemetry_20260403T120000_intervals.csv')
    """
    df = pd.read_csv(csv_path)
    if df.empty:
        print('CSV is empty — nothing to plot.')
        return

    t0 = df['timestamp'].iloc[0]
    elapsed = df['timestamp'] - t0  # seconds from start

    numeric_cols = [c for c in TELEMETRY_FIELDS if c != 'timestamp']

    fig = go.Figure()
    for col in numeric_cols:
        if col not in df.columns:
            continue
        fig.add_trace(go.Scatter(
            x=elapsed,
            y=df[col],
            mode='lines',
            name=col,
        ))

    # Shaded interval bands
    if intervals_path and os.path.isfile(intervals_path):
        idf = pd.read_csv(intervals_path)
        for i, row in idf.iterrows():
            x0 = row['start'] - t0
            x1 = row['end']   - t0
            fig.add_vrect(
                x0=x0, x1=x1,
                fillcolor='royalblue',
                opacity=0.15,
                layer='below',
                line_width=0,
                annotation_text=f'interval {i + 1}',
                annotation_position='top left',
            )

    fig.update_layout(
        title=f'AgroDrone Telemetry — {os.path.basename(csv_path)}',
        xaxis_title='Elapsed time (s)',
        yaxis_title='Value',
        legend=dict(
            orientation='v',
            x=1.02,
            y=1,
            xanchor='left',
        ),
        hovermode='x unified',
    )

    fig.show()


# ── Entry point ───────────────────────────────────────────────────────────────

if __name__ == '__main__':
    # Re-visualize mode: python log.py <csv> [intervals_csv]
    if len(sys.argv) > 1:
        csv_arg       = sys.argv[1]
        intervals_arg = sys.argv[2] if len(sys.argv) > 2 else None
        plot_session(csv_arg, intervals_arg)
        sys.exit(0)

    # Interactive recording mode
    kb_thread = threading.Thread(target=_keyboard_listener, daemon=True)
    kb_thread.start()

    # Wait for first 't' before connecting to hardware
    _start_event.wait()
    _record_loop()

    # Recording finished — save and plot
    ts_tag = datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')
    csv_path, intervals_path = _save(ts_tag)

    if _rows:
        plot_session(csv_path, intervals_path)
    else:
        print('No data recorded.')
