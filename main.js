require('dotenv').config();
const { app, BrowserWindow, ipcMain, Notification, shell } = require('electron');
const path = require('path');
const nodemailer = require('nodemailer');

/** Email config from .env (see .env.example). */
const EMAIL_CONFIG = {
  to: process.env.EMAIL_TO || '',
  from: process.env.EMAIL_FROM || undefined,
  smtp: {
    host: process.env.SMTP_HOST || 'smtp.gmail.com',
    port: process.env.SMTP_PORT || '587',
    secure: process.env.SMTP_SECURE === 'true',
    user: process.env.SMTP_USER || '',
    pass: process.env.SMTP_PASS || '',
  },
};

const emailConfig =
  EMAIL_CONFIG.to && EMAIL_CONFIG.smtp.host ? EMAIL_CONFIG : null;

ipcMain.handle('show-notification', (_, title, body) => {
  if (Notification.isSupported()) {
    new Notification({ title, body }).show();
  }
});

ipcMain.handle('open-external', (_, url) => {
  shell.openExternal(url);
});

ipcMain.handle('send-email', async (_, subject, body) => {
  if (!emailConfig || !emailConfig.to) return { ok: false, error: 'No email config' };
  try {
    const transporter = nodemailer.createTransport({
      host: emailConfig.smtp.host,
      port: Number(emailConfig.smtp.port) || 587,
      secure: emailConfig.smtp.secure === true,
      auth: emailConfig.smtp.user
        ? { user: emailConfig.smtp.user, pass: emailConfig.smtp.pass || '' }
        : undefined,
    });
    await transporter.sendMail({
      from: emailConfig.from || emailConfig.smtp.user || 'noreply@localhost',
      to: emailConfig.to,
      subject: subject || 'New activity',
      text: body || '',
    });
    return { ok: true };
  } catch (err) {
    return { ok: false, error: err.message };
  }
});

function createWindow() {
  const win = new BrowserWindow({
    width: 900,
    height: 700,
    webPreferences: {
      nodeIntegration: false,
      contextIsolation: true,
      preload: path.join(__dirname, 'preload.js'),
    },
  });

  win.loadFile(path.join(__dirname, 'renderer', 'index.html'));
}

app.whenReady().then(createWindow);

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit();
});

app.on('activate', () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
