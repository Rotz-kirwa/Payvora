#!/usr/bin/env bash
set -e

ENV_FILE="$(dirname "$0")/.env"
TUNNEL_LOG="/tmp/tunnel-paykit.log"
DEV_LOG="/tmp/devserver-paykit.log"

# Load .env
set -a; source "$ENV_FILE"; set +a

BASE_DARAJA="${MPESA_ENVIRONMENT:-sandbox}"
if [ "$MPESA_ENVIRONMENT" = "production" ]; then
  DARAJA_BASE="https://api.safaricom.co.ke"
else
  DARAJA_BASE="https://sandbox.safaricom.co.ke"
fi

echo "==> Killing any old dev server / tunnel..."
fuser -k 8080/tcp 2>/dev/null || true
pkill -x ngrok 2>/dev/null || true
sleep 1

echo "==> Starting dev server..."
npm run dev > "$DEV_LOG" 2>&1 &
DEV_PID=$!

# Wait for vite to be ready
for i in $(seq 1 20); do
  sleep 1
  grep -q "ready in" "$DEV_LOG" 2>/dev/null && break
done
PORT=$(grep -o 'http://localhost:[0-9]*' "$DEV_LOG" | head -1 | grep -o '[0-9]*$')
echo "    Dev server on port $PORT"

echo "==> Starting ngrok tunnel..."
ngrok http "http://localhost:$PORT" --log=stdout > "$TUNNEL_LOG" 2>&1 &
TUNNEL_PID=$!

# Wait for tunnel URL via ngrok API
TUNNEL_URL=""
for i in $(seq 1 30); do
  sleep 1
  # Try to get the public URL from ngrok's local API
  TUNNEL_URL=$(curl -s http://localhost:4040/api/tunnels | node -e "
    const fs = require('fs');
    try {
      const data = JSON.parse(fs.readFileSync(0, 'utf8'));
      const tunnel = data.tunnels.find(t => t.proto === 'https');
      if (tunnel) process.stdout.write(tunnel.public_url);
    } catch (e) {}
  ")
  [ -n "$TUNNEL_URL" ] && break
done

if [ -z "$TUNNEL_URL" ]; then
  echo "ERROR: Could not get ngrok tunnel URL. Is ngrok installed and configured?"
  echo "Check $TUNNEL_LOG"
  exit 1
fi

echo "    Tunnel: $TUNNEL_URL"

# Update .env with new callback URL
NEW_CALLBACK="${TUNNEL_URL}"
sed -i "s|MPESA_CALLBACK_URL=.*|MPESA_CALLBACK_URL=\"${NEW_CALLBACK}\"|" "$ENV_FILE"
echo "    Updated MPESA_CALLBACK_URL -> $NEW_CALLBACK"

# Re-register C2B URLs with Safaricom
echo "==> Registering C2B URLs with Safaricom..."
node --input-type=module <<EOF
const DARAJA_BASE = "$DARAJA_BASE";
const KEY = "$MPESA_CONSUMER_KEY";
const SECRET = "$MPESA_CONSUMER_SECRET";
const SHORTCODE = "${MPESA_SHORTCODE:-6270335}";
const BASE_URL = "$TUNNEL_URL";

async function main() {
  // Get token
  const authRes = await fetch(\`\${DARAJA_BASE}/oauth/v1/generate?grant_type=client_credentials\`, {
    headers: { Authorization: 'Basic ' + Buffer.from(\`\${KEY}:\${SECRET}\`).toString('base64') }
  });
  const { access_token: token } = await authRes.json();
  if (!token) { console.error('Failed to get token'); process.exit(1); }

  // Register C2B
  const body = {
    ShortCode: SHORTCODE,
    ResponseType: 'Completed',
    ConfirmationURL: \`\${BASE_URL}/api/payments/c2b/confirmation\`,
    ValidationURL: \`\${BASE_URL}/api/payments/c2b/validation\`,
  };
  const res = await fetch(\`\${DARAJA_BASE}/mpesa/c2b/v2/registerurl\`, {
    method: 'POST',
    headers: { Authorization: \`Bearer \${token}\`, 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  if (res.ok) {
    console.log('    C2B registered for shortcode', SHORTCODE);
    console.log('    Confirmation:', body.ConfirmationURL);
    console.log('    Validation:  ', body.ValidationURL);
  } else {
    console.warn('    C2B registration warning:', res.status, text.slice(0, 200));
  }
}
main().catch(e => console.error('C2B registration error:', e.message));
EOF

echo ""
echo "================================================"
echo "  MOBOSOFT ENTERPRISE HQ — Payment Dashboard"
echo "================================================"
echo "  Local:    http://localhost:$PORT"
echo "  Ngrok:    $TUNNEL_URL"
echo "  STK callback: ${TUNNEL_URL}/api/mpesa/callback"
echo "  C2B confirmation: ${TUNNEL_URL}/api/payments/c2b/confirmation"
echo "  C2B validation: ${TUNNEL_URL}/api/payments/c2b/validation"
echo "================================================"
echo "  Dev PID: $DEV_PID  |  Tunnel PID: $TUNNEL_PID"
echo ""
echo "Press Ctrl+C to stop everything."

trap "echo; echo 'Stopping...'; kill $DEV_PID $TUNNEL_PID 2>/dev/null; exit 0" INT TERM
wait $DEV_PID
