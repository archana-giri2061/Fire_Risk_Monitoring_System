// email-alert.test.ts
// End-to-end test suite for the wildfire alert email system.
// Covers unit tests (no network or DB), integration tests (SMTP + DB),
// and API endpoint tests (requires the server running on localhost).
//
// Run with:  npx ts-node tests/email-alert.test.ts
// Or via:    npm run test:email

import "dotenv/config";
import nodemailer from "nodemailer";
import { config } from "../config";
import {
  buildFireAlertHtml,
  buildFireAlertText,
  sendFireAlert,
  sendEmailAlert,
} from "../services/email.service";
import { sendDailyRiskReport }                from "../services/dailyReport.service";
import { runRiskEmailAlerts, sendIoTFireAlert } from "../services/alertEngine.service";


// ANSI color codes for terminal output formatting.
// Used by the pass(), fail(), skip(), and section() helpers below.
const GREEN  = "\x1b[32m";
const RED    = "\x1b[31m";
const YELLOW = "\x1b[33m";
const CYAN   = "\x1b[36m";
const BOLD   = "\x1b[1m";
const RESET  = "\x1b[0m";

// Global counters incremented by pass(), fail(), and skip() for the final summary
let passed  = 0;
let failed  = 0;
let skipped = 0;

// Prints a plain log line to stdout
function log(msg: string) { console.log(msg); }

// Records a passed test and prints a green checkmark with an optional detail string
function pass(name: string, detail = "") {
  passed++;
  log(`  ${GREEN}pass${RESET} ${name}${detail ? ` — ${CYAN}${detail}${RESET}` : ""}`);
}

// Records a failed test and prints the error message in red
function fail(name: string, err: any) {
  failed++;
  log(`  ${RED}FAIL${RESET} ${name}`);
  log(`    ${RED}${err?.message ?? err}${RESET}`);
}

// Records a skipped test and prints the reason in yellow
// Used when a test cannot run due to missing data or an unreachable server
function skip(name: string, reason: string) {
  skipped++;
  log(`  ${YELLOW}SKIP${RESET} ${name} — ${reason}`);
}

// Prints a bold section header to visually separate test groups in the output
function section(title: string) {
  log(`\n${BOLD}${CYAN}-- ${title} ${"-".repeat(Math.max(0, 50 - title.length))}${RESET}`);
}


// UNIT TESTS
// These tests do not require a network connection or database access.
// They verify configuration values and the HTML/text email builder functions.


// Verifies that all four required SMTP environment variables are present.
// Fails immediately with a list of missing variables rather than letting
// a later integration test crash with a less helpful error.
async function testSmtpConfig() {
  section("1 - SMTP Config Check");

  const { host, user, pass: smtpPass, to } = config.smtp;
  const missing: string[] = [];
  if (!host)     missing.push("SMTP_HOST");
  if (!user)     missing.push("SMTP_USER");
  if (!smtpPass) missing.push("SMTP_PASS");
  if (!to)       missing.push("ALERT_TO_EMAIL");

  if (missing.length) {
    fail("SMTP env vars", `Missing: ${missing.join(", ")}`);
  } else {
    pass("SMTP env vars", `host=${host}, user=${user}, to=${to}`);
  }
}

// Verifies that buildFireAlertHtml() produces valid HTML for an Extreme risk alert.
// Checks for required content strings and a minimum length to catch template regressions.
async function testBuildExtremeEmail() {
  section("2 - buildFireAlertHtml Extreme Risk");
  try {
    const html = buildFireAlertHtml({
      location:  "Lumbini Forest",
      latitude:  28.002,
      longitude: 83.036,
      threshold: "Extreme",
      highDays: [
        { date: "2026-04-03", risk_label: "Extreme", risk_probability: 0.95 },
        { date: "2026-04-04", risk_label: "Extreme", risk_probability: 0.88 },
      ],
    });

    if (!html.includes("Extreme")) throw new Error("Missing 'Extreme' in HTML");
    if (!html.includes("[ALERT]")) throw new Error("Missing Extreme icon [ALERT]");
    if (!html.includes("95.0%"))   throw new Error("Missing probability 95.0%");
    if (!html.includes("88.0%"))   throw new Error("Missing probability 88.0%");
    if (html.length < 500)         throw new Error("HTML too short — looks malformed");

    pass("HTML contains Extreme risk content");
    pass("HTML contains correct probabilities");
    pass("HTML well-formed (length check)");
  } catch (e) {
    fail("buildFireAlertHtml Extreme", e);
  }
}

// Verifies that buildFireAlertHtml() produces correct output for a High risk alert.
async function testBuildHighEmail() {
  section("3 - buildFireAlertHtml High Risk");
  try {
    const html = buildFireAlertHtml({
      location:  "Lumbini Forest",
      latitude:  28.002,
      longitude: 83.036,
      threshold: "High",
      highDays: [
        { date: "2026-04-05", risk_label: "High", risk_probability: 0.75 },
      ],
    });

    if (!html.includes("High"))    throw new Error("Missing 'High' in HTML");
    if (!html.includes("[HIGH]"))  throw new Error("Missing High icon [HIGH]");
    if (!html.includes("75.0%"))   throw new Error("Missing probability 75.0%");

    pass("HTML contains High risk content");
  } catch (e) {
    fail("buildFireAlertHtml High", e);
  }
}

// Verifies that buildFireAlertText() produces a correctly structured plain-text body.
// Plain-text is shown by email clients that do not render HTML and as the inbox preview.
async function testBuildPlainText() {
  section("4 - buildFireAlertText plain text");
  try {
    const text = buildFireAlertText({
      location:  "Test Forest",
      latitude:  28.0,
      longitude: 83.0,
      threshold: "High",
      highDays: [
        { date: "2026-04-06", risk_label: "High", risk_probability: 0.80 },
      ],
    });

    if (!text.includes("WILDFIRE RISK ALERT")) throw new Error("Missing header");
    if (!text.includes("High"))               throw new Error("Missing 'High'");
    if (!text.includes("80.0%"))              throw new Error("Missing probability");

    pass("Plain text alert is well-formed");
  } catch (e) {
    fail("buildFireAlertText", e);
  }
}


// INTEGRATION TESTS
// These tests require a working SMTP connection and a running PostgreSQL database.
// They send real emails and query real prediction data.


// Verifies the SMTP connection can be established using the configured credentials.
// Uses nodemailer's verify() which opens a connection and checks authentication
// without sending a message.
async function testSmtpConnection() {
  section("5 - SMTP Connection Verify");
  try {
    const transporter = nodemailer.createTransport({
      host:   config.smtp.host,
      port:   config.smtp.port,
      secure: config.smtp.secure,
      auth:   { user: config.smtp.user, pass: config.smtp.pass },
    });
    await transporter.verify();
    pass("SMTP connection verified", `${config.smtp.host}:${config.smtp.port}`);
  } catch (e: any) {
    fail("SMTP connection", e);
  }
}

// Sends a plain-text smoke test email to confirm the full send path works end to end.
async function testSendPlainEmail() {
  section("6 - sendEmailAlert plain smoke test");
  try {
    await sendEmailAlert(
      "[Test] Wildfire Alert System — Smoke Test",
      [
        "This is a plain-text smoke test from the email alert test suite.",
        "",
        `Timestamp : ${new Date().toISOString()}`,
        `Location  : ${config.locationKey}`,
        `SMTP Host : ${config.smtp.host}`,
        "",
        "If you see this, SMTP is working correctly.",
        "Wildfire Risk Monitoring System",
      ].join("\n"),
    );
    pass("Plain test email sent", `to=${config.smtp.to}`);
  } catch (e) {
    fail("sendEmailAlert", e);
  }
}

// Sends a full HTML + plain-text Extreme risk alert using mock prediction data.
// Verifies that sendFireAlert() returns a messageId confirming the email was accepted.
async function testSendExtremeAlert() {
  section("7 - sendFireAlert EXTREME risk HTML and text");
  try {
    const mockDays = [
      { date: "2026-04-03", risk_label: "Extreme", risk_probability: 0.96 },
      { date: "2026-04-04", risk_label: "Extreme", risk_probability: 0.91 },
      { date: "2026-04-05", risk_label: "High",    risk_probability: 0.74 },
    ];

    const emailArgs = {
      location:  config.locationKey,
      latitude:  config.latitude,
      longitude: config.longitude,
      threshold: "Extreme" as const,
      highDays:  mockDays,
    };

    const result = await sendFireAlert({
      subject: `[TEST] EXTREME Fire Risk — ${config.locationKey}`,
      html:    buildFireAlertHtml(emailArgs),
      text:    buildFireAlertText(emailArgs),
    });

    if (!result.messageId) throw new Error("No messageId returned");
    pass("EXTREME alert email sent", `msgId=${result.messageId}`);
    pass("Recipients confirmed", result.recipients.join(", "));
  } catch (e) {
    fail("sendFireAlert Extreme", e);
  }
}

// Sends a High risk alert using mock prediction data.
async function testSendHighAlert() {
  section("8 - sendFireAlert HIGH risk");
  try {
    const mockDays = [
      { date: "2026-04-06", risk_label: "High", risk_probability: 0.78 },
    ];

    const emailArgs = {
      location:  config.locationKey,
      latitude:  config.latitude,
      longitude: config.longitude,
      threshold: "High" as const,
      highDays:  mockDays,
    };

    const result = await sendFireAlert({
      subject: `[TEST] HIGH Fire Risk — ${config.locationKey}`,
      html:    buildFireAlertHtml(emailArgs),
      text:    buildFireAlertText(emailArgs),
    });

    if (!result.messageId) throw new Error("No messageId returned");
    pass("HIGH alert email sent", `msgId=${result.messageId}`);
  } catch (e) {
    fail("sendFireAlert High", e);
  }
}

// Tests the IoT fire alert path with a confirmed fire detection scenario.
// Simulates an ESP32 device reporting a triggered flame sensor with elevated smoke.
async function testIoTFireAlert() {
  section("9 - sendIoTFireAlert fire detected");
  try {
    const result = await sendIoTFireAlert({
      deviceId:     "IOT-TEST-001",
      deviceName:   "Sensor Node A",
      location:     config.locationKey,
      smokePpm:     450,
      temperature:  38.5,
      fireDetected: true,
    });

    if (!result.ok)   throw new Error("Result not ok");
    if (!result.sent) throw new Error("Email not sent");
    pass("IoT fire alert sent", `recipients=${result.recipients?.join(", ")}`);
  } catch (e) {
    fail("sendIoTFireAlert", e);
  }
}

// Tests the IoT alert path for elevated smoke without a confirmed fire.
// Verifies the smoke-only code path produces a different subject and body.
async function testIoTSmokeOnlyAlert() {
  section("10 - sendIoTFireAlert smoke only no fire");
  try {
    const result = await sendIoTFireAlert({
      deviceId:     "IOT-TEST-002",
      deviceName:   "Sensor Node B",
      location:     config.locationKey,
      smokePpm:     320,
      temperature:  32.0,
      fireDetected: false,
    });

    if (!result.ok)   throw new Error("Result not ok");
    if (!result.sent) throw new Error("Email not sent");
    pass("IoT smoke-only alert sent");
  } catch (e) {
    fail("sendIoTFireAlert smoke-only", e);
  }
}

// Sends the daily report using real predictions from the database.
// Skips gracefully if no predictions exist yet rather than failing.
async function testDailyReportFromDB() {
  section("11 - sendDailyRiskReport real predictions from DB");
  try {
    const result = await sendDailyRiskReport();

    if (!result.ok) throw new Error(result.message ?? "Unknown error");

    if (result.sent) {
      pass("Daily report sent", `Overall risk: ${result.riskLevel}`);
    } else {
      skip("Daily report", result.message ?? "No predictions in DB — run /api/ml/predict-forecast first");
    }
  } catch (e) {
    fail("sendDailyRiskReport", e);
  }
}

// Tests the Extreme-only alert filter against real DB predictions.
// Skips if no Extreme-risk days are currently in the forecast — this is expected
// and should not be treated as a test failure.
async function testRunRiskEmailAlerts_Extreme() {
  section("12 - runRiskEmailAlerts minRisk=Extreme from DB");
  try {
    const result = await runRiskEmailAlerts({
      latitude:     config.latitude,
      longitude:    config.longitude,
      location_key: config.locationKey,
      minRisk:      "Extreme",
    });

    if (!result.ok) throw new Error(result.message);

    if (result.sent) {
      pass("Extreme alert email sent from DB", `${result.alerts} day(s)`);
    } else {
      skip("Extreme alert", result.message ?? "No Extreme-risk predictions in DB — expected if current risk is lower");
    }
  } catch (e) {
    fail("runRiskEmailAlerts Extreme", e);
  }
}

// Tests the High-and-above alert filter against real DB predictions.
async function testRunRiskEmailAlerts_High() {
  section("13 - runRiskEmailAlerts minRisk=High from DB");
  try {
    const result = await runRiskEmailAlerts({
      latitude:     config.latitude,
      longitude:    config.longitude,
      location_key: config.locationKey,
      minRisk:      "High",
    });

    if (!result.ok) throw new Error(result.message);

    if (result.sent) {
      pass("High risk alert sent from DB", `${result.alerts} day(s)`);
    } else {
      skip("High alert", result.message ?? "No High+ predictions in DB");
    }
  } catch (e) {
    fail("runRiskEmailAlerts High", e);
  }
}


// API ENDPOINT TESTS
// These tests require the Express server to be running.
// They call the real HTTP endpoints to verify the full request-response cycle.

// Base URL for all API calls — defaults to localhost:5000 but can be overridden
// via the API_BASE_URL environment variable for testing against a remote server
const BASE = process.env.API_BASE_URL || "http://localhost:5000";

// Sends a POST request to the API and returns the parsed JSON response
async function apiPost(path: string, body: object = {}): Promise<any> {
  const res = await fetch(`${BASE}${path}`, {
    method:  "POST",
    headers: { "Content-Type": "application/json" },
    body:    JSON.stringify(body),
  });
  return res.json();
}

// Sends a GET request to the API and returns the parsed JSON response
async function apiGet(path: string): Promise<any> {
  const res = await fetch(`${BASE}${path}`);
  return res.json();
}

// Checks the /check health endpoint to verify the server is reachable.
// Returns false if the server is unreachable so all subsequent API tests
// are skipped rather than failing with unhelpful network errors.
async function testApiHealth() {
  section("14 - API Health Check");
  try {
    const data = await apiGet("/check");
    if (!data.ok) throw new Error("Server not ok");
    pass("Server is running", data.message);
  } catch (e: any) {
    skip("API tests", `Server unreachable at ${BASE} — ${e.message}`);
    return false;
  }
  return true;
}

// Tests the test-email endpoint which sends a diagnostic email via the API route
async function testApiTestEmail() {
  section("15 - POST /api/alerts/test-email");
  try {
    const data = await apiPost("/api/alerts/test-email");
    if (!data.ok) throw new Error(data.error ?? JSON.stringify(data));
    pass("/api/alerts/test-email", data.message);
  } catch (e) {
    fail("/api/alerts/test-email", e);
  }
}

// Tests the test-extreme endpoint which sends a mock Extreme alert via the API route
async function testApiTestExtreme() {
  section("16 - POST /api/alerts/test-extreme");
  try {
    const data = await apiPost("/api/alerts/test-extreme");
    if (!data.ok) throw new Error(data.error ?? JSON.stringify(data));
    pass("/api/alerts/test-extreme", `msgId=${data.messageId}`);
  } catch (e) {
    fail("/api/alerts/test-extreme", e);
  }
}

// Tests the test-daily-report endpoint using real DB predictions via the API route.
// Skips if no predictions exist in the database.
async function testApiTestDailyReport() {
  section("17 - POST /api/alerts/test-daily-report");
  try {
    const data = await apiPost("/api/alerts/test-daily-report");
    if (!data.ok) throw new Error(data.error ?? JSON.stringify(data));

    if (data.sent) {
      pass("/api/alerts/test-daily-report", `Risk level: ${data.riskLevel}`);
    } else {
      skip("/api/alerts/test-daily-report", data.message ?? "No predictions in DB");
    }
  } catch (e) {
    fail("/api/alerts/test-daily-report", e);
  }
}

// Tests the run-extreme endpoint which filters predictions to Extreme risk only
async function testApiRunExtreme() {
  section("18 - POST /api/alerts/run-extreme");
  try {
    const data = await apiPost("/api/alerts/run-extreme");
    if (!data.ok) throw new Error(data.error ?? JSON.stringify(data));

    if (data.sent) {
      pass("/api/alerts/run-extreme", `${data.alerts} day(s) flagged`);
    } else {
      skip("/api/alerts/run-extreme", data.message ?? "No Extreme-risk predictions currently");
    }
  } catch (e) {
    fail("/api/alerts/run-extreme", e);
  }
}

// Tests the alert status endpoint which returns the current 7-day risk forecast summary
async function testApiAlertStatus() {
  section("19 - GET /api/alerts/status");
  try {
    const data = await apiGet("/api/alerts/status");
    if (!data.ok) throw new Error(data.error ?? JSON.stringify(data));
    pass("/api/alerts/status", `total=${data.total}, highRisk=${data.highRiskDays}, alertNeeded=${data.alertNeeded}`);
  } catch (e) {
    fail("/api/alerts/status", e);
  }
}


// Main test runner — executes all test functions in order and prints a final summary.
// Exits with code 1 if any tests failed so CI pipelines can detect failures.
async function main() {
  log(`\n${BOLD}${"=".repeat(60)}${RESET}`);
  log(`${BOLD}  Wildfire Alert System — Email Test Suite${RESET}`);
  log(`${BOLD}${"=".repeat(60)}${RESET}`);
  log(`  ${CYAN}Target: ${config.smtp.to}${RESET}`);
  log(`  ${CYAN}SMTP  : ${config.smtp.host}:${config.smtp.port}${RESET}\n`);

  // Unit tests — no network or database required
  await testSmtpConfig();
  await testBuildExtremeEmail();
  await testBuildHighEmail();
  await testBuildPlainText();

  // Integration tests — require working SMTP connection and database
  await testSmtpConnection();
  await testSendPlainEmail();
  await testSendExtremeAlert();
  await testSendHighAlert();
  await testIoTFireAlert();
  await testIoTSmokeOnlyAlert();
  await testDailyReportFromDB();
  await testRunRiskEmailAlerts_Extreme();
  await testRunRiskEmailAlerts_High();

  // API tests — require the Express server to be running on BASE
  const serverUp = await testApiHealth();
  if (serverUp) {
    await testApiTestEmail();
    await testApiTestExtreme();
    await testApiTestDailyReport();
    await testApiRunExtreme();
    await testApiAlertStatus();
  }

  // Print the final pass/fail/skip summary
  const total = passed + failed + skipped;
  log(`\n${BOLD}${"=".repeat(60)}${RESET}`);
  log(`${BOLD}  Test Results: ${total} total${RESET}`);
  log(`  ${GREEN}Passed : ${passed}${RESET}`);
  log(`  ${RED}Failed : ${failed}${RESET}`);
  log(`  ${YELLOW}Skipped: ${skipped}${RESET}`);
  log(`${BOLD}${"=".repeat(60)}${RESET}\n`);

  if (failed > 0) {
    log(`${RED}${BOLD}  ${failed} test(s) failed. Check SMTP config and DB connection.${RESET}\n`);
    process.exit(1);
  } else {
    log(`${GREEN}${BOLD}  All tests passed.${RESET}\n`);
  }
}

main().catch((err) => {
  console.error("Test runner crashed:", err);
  process.exit(1);
});