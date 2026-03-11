'use client';

import Link from 'next/link';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import Footer from '@/components/layout/Footer';
import { Copy, Check, BookOpen, Terminal, Lock, Zap, Shield, Mail } from 'lucide-react';
import { useState } from 'react';

const BASE_URL = typeof window !== 'undefined' ? window.location.origin : 'https://your-domain.com';

function CodeBlock({ children, lang = 'text' }) {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(children);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };
  return (
    <div className="relative rounded-lg border bg-muted/50 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2 border-b bg-muted/30 text-xs text-muted-foreground">
        <span>{lang}</span>
        <button
          type="button"
          onClick={handleCopy}
          className="flex items-center gap-1 hover:text-foreground transition-colors"
        >
          {copied ? <Check className="w-3 h-3" /> : <Copy className="w-3 h-3" />}
          {copied ? 'copied' : 'copy'}
        </button>
      </div>
      <pre className="p-4 overflow-x-auto text-sm font-mono">{children}</pre>
    </div>
  );
}

const DOC_SECTIONS = [
  { id: 'quick-start', label: 'Quick start', icon: BookOpen },
  { id: 'validate-api', label: 'Validate API', icon: Terminal },
  { id: 'device-binding', label: 'Device binding (HWID)', icon: Lock },
  { id: 'rate-limits', label: 'Rate limits', icon: Zap },
  { id: 'plan-quotas', label: 'Plan quotas', icon: Shield },
  { id: 'examples', label: 'Code examples', icon: Terminal },
  { id: 'contact', label: 'Contact', icon: Mail },
];

export default function DocsPage() {
  return (
    <div className="min-h-screen flex flex-col bg-background">
      <main className="flex-1">
        <div className="max-w-6xl mx-auto py-8 px-4 sm:px-6 lg:px-8">
          <div className="mb-8">
            <h1 className="text-3xl font-bold">Documentation</h1>
            <p className="text-muted-foreground mt-2">
              Integrate license validation into your software. REST API reference and integration guide.
            </p>
          </div>

          <nav className="mb-12">
            <Card>
              <CardHeader>
                <CardTitle className="text-base">Contents</CardTitle>
                <CardDescription>jump to a section</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="flex flex-wrap gap-2">
                  {DOC_SECTIONS.map(({ id, label, icon: Icon }) => (
                    <a
                      key={id}
                      href={`#${id}`}
                      className="inline-flex items-center gap-2 px-3 py-2 rounded-md text-sm bg-muted hover:bg-muted/80 transition-colors"
                    >
                      <Icon className="w-4 h-4" />
                      {label}
                    </a>
                  ))}
                </div>
              </CardContent>
            </Card>
          </nav>

          <section id="quick-start" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <BookOpen className="w-5 h-5" />
                  Quick start
                </CardTitle>
                <CardDescription>get up and running in minutes</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ol className="list-decimal list-inside space-y-3 text-muted-foreground">
                  <li>Sign up at Licentra and create an app in the dashboard</li>
                  <li>Go to your app → Credentials tab → generate an API secret</li>
                  <li>Create licenses for your app (single or batch)</li>
                  <li>Call the validate endpoint from your software</li>
                </ol>
                <p className="text-sm text-muted-foreground">
                  The validate API is a single POST endpoint. No SDK required. Use your app ID and API secret for authentication.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="validate-api" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Validate license
                </CardTitle>
                <CardDescription>POST to validate a license key</CardDescription>
              </CardHeader>
              <CardContent className="space-y-6">
                <div>
                  <p className="font-mono text-sm font-medium">POST {BASE_URL}/api/licenses/validate</p>
                  <p className="text-sm text-muted-foreground mt-1">Content-Type: application/json</p>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Request body</h3>
                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3">Field</th>
                        <th className="text-left p-3">Type</th>
                        <th className="text-left p-3">Required</th>
                        <th className="text-left p-3">Description</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t">
                        <td className="p-3 font-mono">appId</td>
                        <td className="p-3">string</td>
                        <td className="p-3">yes</td>
                        <td className="p-3">Your app ID</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3 font-mono">apiSecret</td>
                        <td className="p-3">string</td>
                        <td className="p-3">yes</td>
                        <td className="p-3">API secret from App → Credentials</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3 font-mono">licenseKey</td>
                        <td className="p-3">string</td>
                        <td className="p-3">yes</td>
                        <td className="p-3">The license key to validate</td>
                      </tr>
                      <tr className="border-t">
                        <td className="p-3 font-mono">hwid</td>
                        <td className="p-3">string</td>
                        <td className="p-3">no</td>
                        <td className="p-3">Device identifier. Required when license has HWID lock enabled.</td>
                      </tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Success response (200)</h3>
                  <p className="text-sm text-muted-foreground mb-2">Valid license returns:</p>
                  <CodeBlock lang="json">{`{
  "success": true,
  "data": {
    "valid": true,
    "license": {
      "id": "...",
      "key": "XXXXX-XXXX",
      "note": "",
      "status": "active",
      "expiryDate": null,
      "hwidLocked": false,
      "hwidLimit": 5,
      "hwids": [],
      "createdAt": "...",
      "updatedAt": "..."
    }
  }
}`}</CodeBlock>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Invalid license (200)</h3>
                  <p className="text-sm text-muted-foreground mb-2">
                    Invalid licenses still return 200 with valid: false and a reason code.
                  </p>
                  <CodeBlock lang="json">{`{
  "success": true,
  "data": {
    "valid": false,
    "reason": "license_not_found"
  }
}`}</CodeBlock>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Reason codes</h3>
                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3">reason</th>
                        <th className="text-left p-3">Meaning</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t"><td className="p-3 font-mono">app_not_found</td><td className="p-3">Invalid app ID or app does not exist</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">license_not_found</td><td className="p-3">No license with that key for this app</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">license_not_active</td><td className="p-3">License is suspended</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">license_expired</td><td className="p-3">Expiry date has passed</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">hwid_required</td><td className="p-3">License has HWID lock but no hwid was sent</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">hwid_mismatch</td><td className="p-3">HWID not in the allowed list for this license</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">hwid_limit_reached</td><td className="p-3">Device limit reached, cannot add new HWID</td></tr>
                    </tbody>
                  </table>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Error responses</h3>
                  <table className="w-full text-sm border rounded-lg overflow-hidden">
                    <thead>
                      <tr className="bg-muted/50">
                        <th className="text-left p-3">Status</th>
                        <th className="text-left p-3">When</th>
                      </tr>
                    </thead>
                    <tbody>
                      <tr className="border-t"><td className="p-3 font-mono">400</td><td className="p-3">Missing appId, apiSecret or licenseKey</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">401</td><td className="p-3">Invalid API secret (invalid credentials)</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">403</td><td className="p-3">App suspended</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">429</td><td className="p-3">Rate limit exceeded (IP, per-license, or per-app)</td></tr>
                      <tr className="border-t"><td className="p-3 font-mono">429</td><td className="p-3">Plan quota exceeded for the month (app auto-suspended)</td></tr>
                    </tbody>
                  </table>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="device-binding" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Lock className="w-5 h-5" />
                  Device binding (HWID)
                </CardTitle>
                <CardDescription>lock licenses to specific devices</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <p className="text-muted-foreground">
                  When a license has HWID lock enabled, you must send the device identifier (hwid) on every validation. Licentra stores up to the configured limit (1–5 devices per license).
                </p>
                <div>
                  <h4 className="font-medium mb-2">Generating a stable HWID</h4>
                  <ul className="text-sm text-muted-foreground space-y-1 list-disc list-inside">
                    <li>Use a stable identifier from your platform (e.g. machine-id, CPU serial, MAC hash)</li>
                    <li>Max length: 256 characters</li>
                  </ul>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="rate-limits" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Zap className="w-5 h-5" />
                  Rate limits
                </CardTitle>
                <CardDescription>protect the API from abuse</CardDescription>
              </CardHeader>
              <CardContent className="space-y-4">
                <ul className="text-muted-foreground space-y-2">
                  <li><strong>IP:</strong> 100 requests per minute per IP</li>
                  <li><strong>Per license:</strong> Configurable per app (1–100 per minute, default 10)</li>
                  <li><strong>Per app:</strong> Plan based (see Plan quotas below)</li>
                </ul>
                <p className="text-sm text-muted-foreground">
                  When a license exceeds its per-minute limit, 429 is returned. Licenses with 50+ blocked requests in 10 minutes may trigger auto-suspend if enabled in the app settings.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="plan-quotas" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Shield className="w-5 h-5" />
                  Plan quotas
                </CardTitle>
                <CardDescription>monthly validation limits by plan</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  each plan has a monthly validation quota and a per-minute limit per app. when quota is exceeded, the app is suspended until the next month. quota resets monthly. see the <Link href="/pricing" className="underline hover:text-primary">pricing page</Link> for current limits.
                </p>
              </CardContent>
            </Card>
          </section>

          <section id="examples" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Terminal className="w-5 h-5" />
                  Code examples
                </CardTitle>
                <CardDescription>examples in cURL, Python, and JavaScript</CardDescription>
              </CardHeader>
              <CardContent className="space-y-8">
                <p className="text-sm text-muted-foreground">
                  any programming language works. the validate API is a standard REST endpoint, if your language can make HTTP POST requests, you can integrate. we show cURL, Python and JavaScript below, but the same call works from PHP, Go, Rust, C#, Java or anything else.
                </p>
                <div>
                  <h3 className="text-lg font-medium mb-2">cURL</h3>
                  <CodeBlock lang="bash">{`curl -X POST ${BASE_URL}/api/licenses/validate \\
  -H "Content-Type: application/json" \\
  -d '{
    "appId": "YOUR_APP_ID",
    "apiSecret": "YOUR_API_SECRET",
    "licenseKey": "XXXXX-XXXX",
    "hwid": "optional-device-hash"
  }'`}</CodeBlock>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">Python</h3>
                  <CodeBlock lang="python">{`import requests

def validate_license(license_key: str, hwid: str = None):
    url = "${BASE_URL}/api/licenses/validate"
    payload = {
        "appId": "YOUR_APP_ID",
        "apiSecret": "YOUR_API_SECRET",
        "licenseKey": license_key,
    }
    if hwid:
        payload["hwid"] = hwid

    resp = requests.post(url, json=payload, timeout=10)
    resp.raise_for_status()
    return resp.json()

result = validate_license("XXXXX-XXXX")
if result.get("data", {}).get("valid"):
    print("License valid")
else:
    print("Invalid:", result.get("data", {}).get("reason"))`}</CodeBlock>
                </div>

                <div>
                  <h3 className="text-lg font-medium mb-2">JavaScript (Node.js)</h3>
                  <CodeBlock lang="javascript">{`async function validateLicense(licenseKey, hwid = null) {
  const res = await fetch(\`${BASE_URL}/api/licenses/validate\`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      appId: 'YOUR_APP_ID',
      apiSecret: 'YOUR_API_SECRET',
      licenseKey,
      ...(hwid && { hwid }),
    }),
  });
  const data = await res.json();
  if (!res.ok) throw new Error(data.message || 'validation failed');
  return data;
}

const result = await validateLicense('XXXXX-XXXX');
if (result.data?.valid) {
  console.log('License valid');
} else {
  console.log('Invalid:', result.data?.reason);
}`}</CodeBlock>
                </div>
              </CardContent>
            </Card>
          </section>

          <section id="contact" className="mb-12 scroll-mt-8">
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Mail className="w-5 h-5" />
                  Contact
                </CardTitle>
                <CardDescription>need help?</CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-muted-foreground">
                  Reach out at licentra.support@gmail.com. We respond within 24–48 hours on business days.
                </p>
              </CardContent>
            </Card>
          </section>

        </div>
      </main>
      <Footer />
    </div>
  );
}
