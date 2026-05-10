# Partner Engage Portal — InsuranceDekho

A role-based partner performance portal for tracking high-potential partner business.

---

## Files in this repo

| File | Purpose |
|------|---------|
| `index.html` | Login page |
| `dashboard.html` | Main dashboard with partner table + modal |
| `style.css` | All styles |
| `app.js` | All frontend logic (login, table, filters, modal) |
| `config.js` | **Edit this** — paste your Apps Script URL here |
| `Code.gs` | Google Apps Script backend — paste into Apps Script editor |

---

## Setup Steps (do these in order)

### Step 1 — Set up the Apps Script backend

1. Open your Google Sheet: `https://docs.google.com/spreadsheets/d/1AgPaAik0vjh_9fcxX4NdV33-hWd4S5qNzwuFXb3xOis`
2. Click **Extensions → Apps Script**
3. Delete everything in the editor
4. Copy the entire contents of `Code.gs` and paste it
5. Click **Save** (floppy disk icon)
6. Click **Deploy → New deployment**
7. Click the gear icon next to "Type" → select **Web App**
8. Set:
   - **Description**: Partner Engage API v1
   - **Execute as**: Me
   - **Who has access**: Anyone
9. Click **Deploy**
10. **Copy the Web App URL** — it looks like:
    `https://script.google.com/macros/s/AKfycb.../exec`

---

### Step 2 — Set passwords in your Google Sheet

1. Open the **Users** sheet in your Google Sheet
2. In the `password` column, add a hashed password for each person
3. To generate a SHA-256 hash for a password, visit: https://emn178.github.io/online-tools/sha256.html
4. Type the password → copy the hash → paste into the Users sheet

> Note: The password `IDK@2024` already has hash `b0ad42b91aefab4168765b78876a7dd8f5e2012282e6896012bc51e4faf20db6` (already set for Anil Kumar and 405 Partners)

---

### Step 3 — Add the Apps Script URL to config.js

1. Open `config.js`
2. Replace `YOUR_APPS_SCRIPT_URL_HERE` with the URL you copied in Step 1
3. Save the file

---

### Step 4 — Push to GitHub

1. Create a new repository on GitHub named `partner-engage-portal` (public)
2. Upload all 6 files (index.html, dashboard.html, style.css, app.js, config.js, Code.gs)

---

### Step 5 — Deploy on Vercel

1. Go to https://vercel.com and sign up / log in with GitHub
2. Click **Add New → Project**
3. Select your `partner-engage-portal` repository
4. Click **Deploy**
5. Your portal will be live at something like:
   `https://partner-engage-portal.vercel.app`

---

## Access control

| Role | Sees |
|------|------|
| ZH | All partners in their zone(s) |
| RH | Partners where "RH: [Name]" in Owner column |
| SH | Partners where "SH: [Name]" in Owner column |
| AM | Partners where "AM: [Name]" in Owner column |
| RM | Partners where "RM: [Name]" in Owner column |

---

## Need help?

Contact your portal administrator.
