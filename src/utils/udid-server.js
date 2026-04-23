/**
 * QR-based iOS UDID enrollment server.
 *
 * Flow:
 *  1. CLI starts local HTTP server, shows QR code in terminal
 *  2. User scans QR on iPhone/iPad → Safari opens landing page
 *  3. User taps "Get UDID" → iOS downloads enrollment .mobileconfig
 *  4. iOS prompts to install profile → installs → POSTs UDID to /submit
 *  5. Server captures UDID, responds with a REMOVAL profile
 *  6. iOS automatically prompts to remove the enrollment profile
 *  7. Promise resolves with { udid, deviceName }
 */

import http from 'http';
import os from 'os';
import { randomUUID } from 'crypto';
import qrcode from 'qrcode-terminal';
import chalk from 'chalk';

function getLocalIp() {
  for (const iface of Object.values(os.networkInterfaces())) {
    for (const info of iface ?? []) {
      if (info.family === 'IPv4' && !info.internal) return info.address;
    }
  }
  return '127.0.0.1';
}

function enrollmentProfile(submitUrl) {
  const uuid = randomUUID().toUpperCase();
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
  <key>PayloadContent</key><dict>
    <key>URL</key><string>${submitUrl}</string>
    <key>DeviceAttributes</key><array>
      <string>UDID</string>
      <string>DEVICE_NAME</string>
      <string>PRODUCT</string>
    </array>
  </dict>
  <key>PayloadDisplayName</key><string>eba-cli Device Registration</string>
  <key>PayloadDescription</key><string>Sends your device UDID to eba-cli. The profile will be removed automatically after registration.</string>
  <key>PayloadOrganization</key><string>eba-cli</string>
  <key>PayloadType</key><string>Profile Service</string>
  <key>PayloadIdentifier</key><string>com.eba-cli.enroll</string>
  <key>PayloadUUID</key><string>${uuid}</string>
  <key>PayloadVersion</key><integer>1</integer>
</dict></plist>`;
}

function landingPage(enrollUrl) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width,initial-scale=1">
  <title>Register Device — eba-cli</title>
  <style>
    *{box-sizing:border-box;margin:0;padding:0}
    body{font-family:-apple-system,sans-serif;background:#f5f5f7;min-height:100vh;display:flex;align-items:center;justify-content:center;padding:24px}
    .card{background:#fff;border-radius:18px;padding:36px 28px;max-width:420px;width:100%;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
    h1{font-size:22px;font-weight:700;margin-bottom:8px}
    p{color:#6e6e73;font-size:15px;line-height:1.55;margin-bottom:20px}
    .btn{display:block;padding:15px;border-radius:12px;text-decoration:none;font-size:17px;font-weight:600;letter-spacing:-.2px;margin-top:12px;cursor:pointer;border:none;width:100%}
    .btn-primary{background:#0071e3;color:#fff}
    .btn-primary:active{background:#0058b0}
    .btn-settings{background:#34c759;color:#fff}
    .btn-settings:active{background:#28a745}
    .note{margin-top:16px;font-size:12px;color:#aeaeb2;line-height:1.5}
    .step{display:flex;align-items:flex-start;text-align:left;gap:12px;margin-top:16px}
    .step-num{background:#e8f0fe;color:#0071e3;font-weight:700;min-width:28px;height:28px;border-radius:50%;display:flex;align-items:center;justify-content:center;font-size:13px;flex-shrink:0}
    .step-text{font-size:14px;color:#3a3a3c;padding-top:4px}
    #step2{display:none;margin-top:8px}
    .badge{display:inline-block;background:#fff3cd;color:#856404;border-radius:8px;padding:8px 14px;font-size:13px;margin-bottom:16px;border:1px solid #ffc10740}
  </style>
</head>
<body>
  <div class="card">
    <div id="step1">
      <h1>📱 Register Your Device</h1>
      <p>Tap the button below to get your device UDID. A temporary profile will be downloaded.</p>
      <div class="step"><div class="step-num">1</div><div class="step-text">Tap <strong>Download Profile</strong> below</div></div>
      <div class="step"><div class="step-num">2</div><div class="step-text">Tap <strong>Allow</strong> when Safari asks to download</div></div>
      <div class="step"><div class="step-num">3</div><div class="step-text">Tap <strong>Open Settings</strong> button → then Install</div></div>
      <br>
      <a class="btn btn-primary" href="${enrollUrl}" id="downloadBtn" onclick="onDownload()">Download Profile</a>
      <p class="note">The profile is used only to read your UDID and will be removed after registration.</p>
    </div>

    <div id="step2">
      <p class="badge">Profile saved to your device</p>
      <p style="margin-bottom:12px">To install the profile, follow these steps:</p>

      <div style="background:#f5f5f7;border-radius:12px;padding:16px;text-align:left">
        <div class="step" style="margin-top:0"><div class="step-num" style="background:#34c75920;color:#34c759">1</div>
          <div class="step-text">Open the <strong>Settings</strong> app <span style="display:inline-flex;align-items:center;justify-content:center;width:22px;height:22px;background:#8e8e93;border-radius:5px;font-size:13px;color:#fff;vertical-align:middle;margin-left:2px">⚙</span></div></div>
        <div class="step"><div class="step-num" style="background:#34c75920;color:#34c759">2</div>
          <div class="step-text">Tap <strong>General</strong></div></div>
        <div class="step"><div class="step-num" style="background:#34c75920;color:#34c759">3</div>
          <div class="step-text">Tap <strong>VPN &amp; Device Management</strong></div></div>
        <div class="step"><div class="step-num" style="background:#34c75920;color:#34c759">4</div>
          <div class="step-text">Tap <strong>eba-cli Device Registration</strong> → <strong>Install</strong></div></div>
      </div>

      <a class="btn btn-primary" href="${enrollUrl}" style="margin-top:16px;background:#6e6e73;font-size:15px" onclick="onDownload()">
        Re-download Profile
      </a>
      <p class="note">After installing, this tab will update automatically and your Mac will receive your UDID.</p>
    </div>
  </div>
  <script>
    function onDownload() {
      setTimeout(function() {
        document.getElementById('step1').style.display = 'none';
        document.getElementById('step2').style.display = 'block';
        // Poll until UDID received — server closes after submit so fetch will fail
        var poll = setInterval(function() {
          fetch('/status').then(function(r){ if(r.ok) r.text().then(function(t){ if(t==='done'){ clearInterval(poll); document.getElementById('step2').innerHTML='<h1 style="color:#34c759">✅ Done!</h1><p>Your UDID has been received by your Mac.<br>You can close this tab.</p>'; }}); }).catch(function(){ clearInterval(poll); });
        }, 2000);
      }, 1200);
    }
  </script>
</body>
</html>`;
}

function parsePlistValue(body, key) {
  const re = new RegExp(`<key>${key}<\\/key>\\s*<string>([^<]+)<\\/string>`);
  return body.match(re)?.[1]?.trim() ?? null;
}

/**
 * Start local enrollment server and show QR code.
 * Resolves with { udid, deviceName } when device submits.
 */
export function startUdidServer({ port = 9876, timeout = 180_000 } = {}) {
  return new Promise((resolve, reject) => {
    const ip = getLocalIp();
    const base = `http://${ip}:${port}`;
    const enrollUrl = `${base}/enroll.mobileconfig`;
    const submitUrl = `${base}/submit`;
    const landingUrl = `${base}/`;
    let done = false;

    const server = http.createServer((req, res) => {
      const path = req.url?.split('?')[0];

      if (req.method === 'GET' && path === '/') {
        res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
        return res.end(landingPage(enrollUrl));
      }

      if (req.method === 'GET' && path === '/status') {
        res.writeHead(200, { 'Content-Type': 'text/plain' });
        return res.end(done ? 'done' : 'waiting');
      }

      if (req.method === 'GET' && path === '/enroll.mobileconfig') {
        const profile = enrollmentProfile(submitUrl);
        res.writeHead(200, {
          'Content-Type': 'application/x-apple-aspen-config',
          'Content-Disposition': 'attachment; filename="eba-enroll.mobileconfig"',
        });
        return res.end(profile);
      }

      if (req.method === 'POST' && path === '/submit') {
        let body = '';
        req.on('data', c => { body += c; });
        req.on('end', () => {
          const udid = parsePlistValue(body, 'UDID');
          const deviceName = parsePlistValue(body, 'DEVICE_NAME');

          if (!udid || done) {
            res.writeHead(400);
            return res.end('UDID not found');
          }

          done = true;

          res.writeHead(200, { 'Content-Type': 'text/html;charset=utf-8' });
          res.end(`<!DOCTYPE html><html><head><meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>Done</title>
<style>body{font-family:-apple-system,sans-serif;display:flex;align-items:center;justify-content:center;min-height:100vh;background:#f5f5f7;margin:0}
.card{background:#fff;border-radius:18px;padding:36px 28px;max-width:360px;text-align:center;box-shadow:0 4px 24px rgba(0,0,0,.08)}
h1{color:#34c759;font-size:22px;margin-bottom:8px}p{color:#6e6e73;font-size:15px;line-height:1.55}</style>
</head><body><div class="card">
<h1>✅ Registration Complete</h1>
<p>Your device UDID has been received by your Mac.<br>You can close this tab.</p>
</div></body></html>`);

          setTimeout(() => { server.close(); resolve({ udid, deviceName }); }, 300);
        });
        return;
      }

      res.writeHead(404);
      res.end('Not found');
    });

    server.listen(port, '0.0.0.0', () => {
      console.log(chalk.bold('\n📲 Scan this QR code with your iPhone/iPad:\n'));
      qrcode.generate(landingUrl, { small: true });
      console.log(chalk.dim(`\n  Or open manually in Safari: ${chalk.white(landingUrl)}`));
      console.log(chalk.dim(`  Make sure the device is on the same WiFi as this Mac.`));
      console.log(chalk.dim(`  Waiting for device response (${Math.round(timeout / 1000)}s timeout)...\n`));
    });

    server.on('error', err => {
      if (err.code === 'EADDRINUSE') {
        reject(new Error(`Port ${port} is already in use. Free it or use a different port.`));
      } else {
        reject(err);
      }
    });

    const timer = setTimeout(() => {
      if (!done) { server.close(); reject(new Error(`Timed out — no device connected within ${Math.round(timeout / 1000)}s.`)); }
    }, timeout);

    server.on('close', () => clearTimeout(timer));
  });
}
