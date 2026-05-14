# Google Sheets Sync — User Guide

This feature allows Gig Tracker to automatically send your earnings and mileage
to a Google Sheet every time you tap Update. It is an advanced, opt-in feature
intended for users who want a live copy of their data in Google Sheets.

---

## How It Works

When you tap Update on the Daily Input screen, Gig Tracker sends the saved
entries to a Google Apps Script web app endpoint you provide. The script receives
the data and writes it into the appropriate tab of your spreadsheet — creating
the row if it doesn't exist, or updating it if it does.

Each entry written to the sheet contains:
- **Date** — the date the earnings were recorded (M/D/YYYY format)
- **Gig** — the name of the gig as configured in Gig Config
- **Amount** — the total earnings saved for that gig on that date
- **Miles** — the total mileage saved for that gig on that date (0 if not tracked)

---

## Requirements

- A Google account with access to Google Sheets and Google Apps Script
- The `Code.gs` script deployed as a web app (see Setup below)
- A sync secret configured in both the script and the app

---

## Setup

### Step 1 — Copy the script

Open Google Apps Script at https://script.google.com and create a new project.
Paste the contents of `Code.gs` into the editor and save.

### Step 2 — Set your sync secret

The sync secret is a private password that prevents anyone else from writing
data to your sheet. It is stored securely in Apps Script's Script Properties
rather than in the code itself.

In the Apps Script editor:
1. Click **Project Settings** (the gear icon in the left sidebar)
2. Scroll down to **Script Properties**
3. Click **Add script property**
4. Set the property name to `SYNC_SECRET`
5. Set the value to any strong password of your choosing
6. Click **Save script properties**

The script will refuse all requests if this property is not set, so this step
is required before deploying.

### Step 3 — Deploy as a web app

1. In the Apps Script editor, click **Deploy → New deployment**
2. Click the gear icon next to **Select type** and choose **Web app**
3. Set **Execute as** to `Me`
4. Set **Who has access** to `Anyone`
5. Click **Deploy**
6. Copy the web app URL provided — you will need this in the next step

> Note: "Anyone" access does not mean anyone can write to your sheet freely.
> The sync secret acts as the authentication layer. Without the correct secret,
> all requests are rejected.

### Step 4 — Configure the app

In Gig Tracker, open **App Settings** and scroll to **Google Sheets Sync**:

1. Toggle the switch to **Enabled**
2. Paste your web app URL into the **Sync endpoint URL** field
3. Enter the same sync secret you set in Script Properties into the
   **Sync secret** field
4. Your settings are saved automatically

---

## Sheet Structure

The script writes data into tabs named by the end-of-cycle Sunday date in
`MM/DD/YY` format (e.g. `05/18/25`). These tab names are calculated
automatically by Gig Tracker based on each gig's configured week start day,
and are created by the script if they don't already exist.

Within each tab, the script expects (or creates) a header row as the first row:

| Date | Gig | Amount | Miles |
|------|-----|--------|-------|

Each subsequent row represents one gig's earnings for one date. If a row
already exists for a given date and gig combination, it is updated in place.
If no matching row exists, a new row is appended.

---

## Behavior Notes

**Sync happens after every Update.**
Each time you tap Update on the Daily Input screen, any entries with a non-zero
amount or mileage are sent to the sheet. Entries where both amount and miles
are zero are not synced.

**The sheet reflects your saved totals, not your inputs.**
The value written to the sheet is the final saved total for that date, not the
number you typed into the input field. For gigs set to Replace mode, this is
the new value. For gigs set to Additive mode, this is the running total after
your entry was added.

**Sync failures are silent.**
If a sync request fails (due to network issues, a wrong URL, or an invalid
secret), the app will not display an error. Your data is always saved locally
first regardless of whether the sync succeeds.

**Gig names must match exactly.**
The script uses the gig name sent by the app to identify which row to update.
If you rename a gig in Gig Config after data has already been synced, future
entries will create new rows under the new name rather than updating the old ones.

---

## Troubleshooting

**Nothing is appearing in my sheet.**
- Confirm the sync toggle is set to Enabled in App Settings
- Check that the endpoint URL is correct and has no extra spaces
- Confirm the sync secret in the app matches the `SYNC_SECRET` script property exactly
- Make sure the Apps Script deployment is set to execute as `Me` and access
  is set to `Anyone`
- Try re-deploying as a new deployment and updating the URL in the app

**I see a "Sync secret not configured" error in Apps Script logs.**
The `SYNC_SECRET` script property has not been set. Follow Step 2 above.

**I see an "Unauthorized" error in Apps Script logs.**
The secret sent by the app does not match the one stored in Script Properties.
Check both values for typos or extra spaces.

**Rows are being duplicated instead of updated.**
This happens when the date or gig name in an incoming entry doesn't exactly
match what's already in the sheet. Check for inconsistent date formatting or
gig name changes.

**I redeployed my script and sync stopped working.**
Each new deployment gets a new URL. Copy the updated URL from
**Deploy → Manage deployments** and update it in App Settings.

---

## Security Notes

- Never share your web app URL and sync secret together. The URL alone is
  harmless without the secret, but the combination allows anyone to write
  to your sheet.
- The sync secret is stored in your browser's localStorage on your device.
  Avoid using Gig Tracker's sync feature on shared or public devices.
- If you believe your endpoint has been compromised, change the `SYNC_SECRET`
  script property immediately and update the value in App Settings.
