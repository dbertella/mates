#!/usr/bin/env node
/**
 * Standalone script (for GitHub Actions): fetch Ilford activities, detect new
 * Sunday Americano / Lunchtime Masterclass, send email for each new one.
 * State is stored in a JSON file (cached between runs in CI).
 *
 * Env: EMAIL_TO, SMTP_HOST, SMTP_PORT, SMTP_USER, SMTP_PASS, ACTIVITY_STATE_FILE (optional), AUTH_TOKEN (optional)
 */
require('dotenv').config();
const fs = require('fs');
const path = require('path');
const nodemailer = require('nodemailer');

const API_BASE = 'https://nestjs-production-fargate.padelmates.io/webportal/getClubActivityRecordsWithoutAuth';
const ILFORD_CLUB_ID = '788fa2c66535421aabc60fd27f941c42';

const ACTIVITY_TYPES = [
  { id: 'sunday-americano', name: 'Sunday Americano', dayOfWeek: 0 },
  { id: 'lunchtime-masterclass', name: 'Lunchtime Masterclass', dayOfWeek: 3 },
];

const STATE_FILE = process.env.ACTIVITY_STATE_FILE || path.join(process.cwd(), '.activity-state', 'state.json');

function getActivityTypeId(record) {
  const name = (record && (record.title ?? record.name ?? record.activityName ?? record.label)) || '';
  const ms = record?.start_datetime ?? record?.startDate ?? record?.date;
  if (ms == null) return null;
  const d = new Date(typeof ms === 'number' ? ms : Number(ms));
  const day = d.getDay();
  const lower = String(name).trim().toLowerCase();
  for (const t of ACTIVITY_TYPES) {
    if (lower.includes(t.name.toLowerCase()) && day === t.dayOfWeek) return t.id;
  }
  return null;
}

function isAllowed(record) {
  return getActivityTypeId(record) != null;
}

function getActivityKey(item) {
  if (item && (item._id != null || item.id != null)) return String(item._id ?? item.id);
  const name = item.title ?? item.name ?? item.activityName ?? item.label ?? '';
  const date = item.start_datetime ?? item.date ?? '';
  const time = item.time ?? '';
  return `${name}|${date}|${time}`;
}

function formatBody(item) {
  const name = item.title ?? item.name ?? item.activityName ?? item.label ?? 'New activity';
  const ms = item.start_datetime ?? item.startDate ?? item.date;
  let sub = '';
  if (ms != null) {
    const d = new Date(typeof ms === 'number' ? ms : Number(ms));
    if (!Number.isNaN(d.getTime())) {
      sub = d.toLocaleString(undefined, { weekday: 'short', dateStyle: 'medium', timeStyle: 'short' });
    }
  }
  if (!sub && (item.date || item.time)) sub = [item.date, item.time].filter(Boolean).join(' · ');
  return sub ? `${name} — ${sub}` : name;
}

function loadState() {
  try {
    const raw = fs.readFileSync(STATE_FILE, 'utf8');
    const data = JSON.parse(raw);
    return Array.isArray(data.keys) ? new Set(data.keys) : new Set();
  } catch (_) {
    return null;
  }
}

function saveState(keysSet) {
  const dir = path.dirname(STATE_FILE);
  if (dir !== '.') {
    try {
      fs.mkdirSync(dir, { recursive: true });
    } catch (_) {}
  }
  fs.writeFileSync(STATE_FILE, JSON.stringify({ keys: [...keysSet] }, null, 0), 'utf8');
}

async function fetchActivities() {
  const url = `${API_BASE}/${ILFORD_CLUB_ID}`;
  const headers = {
    Accept: 'application/json, text/plain, */*',
    'Accept-Language': 'en-US,en;q=0.6',
    Origin: 'https://padelmates.se',
    Referer: 'https://padelmates.se/',
    'User-Agent': 'Mozilla/5.0 (compatible; PadelActivities/1.0)',
  };
  if (process.env.AUTH_TOKEN && process.env.AUTH_TOKEN.trim()) {
    headers.Authorization = `PadelMates ${process.env.AUTH_TOKEN.trim()}`;
  }
  const res = await fetch(url, { headers });
  if (!res.ok) throw new Error(`HTTP ${res.status}: ${res.statusText}`);
  const data = await res.json();
  return Array.isArray(data) ? data : (data?.data ?? data?.records ?? data?.activities ?? []);
}

async function sendEmail(subject, body) {
  const to = process.env.EMAIL_TO;
  const host = process.env.SMTP_HOST;
  const user = process.env.SMTP_USER;
  const pass = process.env.SMTP_PASS;
  if (!to || !host) {
    console.warn('Email not configured (EMAIL_TO, SMTP_HOST). Skipping send.');
    return;
  }
  const transporter = nodemailer.createTransport({
    host,
    port: Number(process.env.SMTP_PORT) || 587,
    secure: process.env.SMTP_SECURE === 'true',
    auth: user ? { user, pass: pass || '' } : undefined,
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM || user || 'noreply@localhost',
    to,
    subject: subject || 'New activity',
    text: body || '',
  });
}

async function main() {
  const list = await fetchActivities();
  const filtered = list.filter(isAllowed);

  let knownKeys = loadState();
  const isFirstRun = knownKeys === null;
  if (isFirstRun) knownKeys = new Set();

  const newItems = [];
  for (const item of filtered) {
    const key = getActivityKey(item);
    if (knownKeys.has(key)) continue;
    knownKeys.add(key);
    if (!isFirstRun) newItems.push(item);
  }

  for (const item of newItems) {
    const body = formatBody(item);
    await sendEmail('New activity added (GH actions)', body);
    console.log('Notified:', body);
  }

  saveState(knownKeys);
  if (newItems.length > 0) {
    console.log(`Sent ${newItems.length} email(s) for new activities.`);
  } else {
    console.log('No new activities.');
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
