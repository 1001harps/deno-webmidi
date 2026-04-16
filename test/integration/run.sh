#!/bin/bash
set -euo pipefail

IAC_NAME="${MIDI_IAC_NAME:-IAC Driver Bus 1}"
LISTENER_NAME="${MIDI_LISTENER_NAME:-Bus 1}"
BINARY_PATH="${MIDI_BINARY_PATH:-$(pwd)/bindings/midi/target/release/libmidi.dylib}"
CAPTURE_FILE=$(mktemp)
SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/../.." && pwd)"

cleanup() {
  [[ -n "${LISTENER_PID:-}" ]] && kill "$LISTENER_PID" 2>/dev/null || true
  rm -f "$CAPTURE_FILE"
}
trap cleanup EXIT

echo "==> Compiling MIDI listener..."
swiftc "$SCRIPT_DIR/midi_listener.swift" -o /tmp/midi_listener

echo "==> Starting listener on '$LISTENER_NAME'..."
/tmp/midi_listener "$LISTENER_NAME" > "$CAPTURE_FILE" &
LISTENER_PID=$!
sleep 1

echo "==> Sending MIDI messages..."
MIDI_BINARY_PATH="$BINARY_PATH" MIDI_IAC_NAME="$IAC_NAME" \
  deno run --allow-ffi --allow-env --allow-read --allow-net "$SCRIPT_DIR/send_test.ts"

sleep 1

echo "==> Stopping listener..."
kill "$LISTENER_PID" 2>/dev/null || true
wait "$LISTENER_PID" 2>/dev/null || true

echo "==> Captured output:"
cat "$CAPTURE_FILE"
echo ""

echo "==> Verifying..."
FAILURES=0

# Note on: 0x90 0x3c 0x64 = 90 3c 64
if grep -q "90 3c 64" "$CAPTURE_FILE"; then
  echo "PASS: Note on (channel 0, note 60, velocity 100)"
else
  echo "FAIL: Note on not found"
  FAILURES=$((FAILURES + 1))
fi

# Note off: 0x80 0x3c 0x00 = 80 3c 00
if grep -q "80 3c 00" "$CAPTURE_FILE"; then
  echo "PASS: Note off (channel 0, note 60, velocity 0)"
else
  echo "FAIL: Note off not found"
  FAILURES=$((FAILURES + 1))
fi

if [[ "$FAILURES" -gt 0 ]]; then
  echo ""
  echo "FAILED: $FAILURES check(s) failed"
  exit 1
fi

echo ""
echo "ALL SEND CHECKS PASSED"

# ── Test 2: Receive (our library listens, Swift sends) ──

echo ""
echo "==> Compiling MIDI sender..."
swiftc "$SCRIPT_DIR/midi_sender.swift" -o /tmp/midi_sender

echo "==> Starting receive test (our library listening)..."
MIDI_BINARY_PATH="$BINARY_PATH" MIDI_IAC_NAME="$IAC_NAME" \
  deno run --allow-ffi --allow-env --allow-read --allow-net "$SCRIPT_DIR/receive_test.ts" &
RECEIVER_PID=$!
sleep 2

echo "==> Sending MIDI from Swift..."
/tmp/midi_sender "$LISTENER_NAME"

wait "$RECEIVER_PID"
RECEIVE_EXIT=$?

if [[ "$RECEIVE_EXIT" -ne 0 ]]; then
  echo "FAILED: Receive test failed"
  exit 1
fi

echo ""
echo "ALL INTEGRATION TESTS PASSED"
