# Google Sheets Sync — User Guide

This feature allows Gig Tracker to automatically send your earnings and mileage
to a Google Sheet every time you tap Update. It is an advanced, opt-in feature
intended for users who want a live copy of their data in Google Sheets.

---

## How It Works

When you tap Update on the Daily Input screen, Gig Tracker sends the saved
entries to a Google Apps Script web app endpoint you provide. The script receives
the data, finds the correct tab and row in your spreadsheet by matching the date,
and writes the earnings and mileage into the appropriate columns.

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

### Step 2 — Configure Script Properties

Script Properties are the way you provide the script with your secret and your
sheet's column layout without editing any code. In the Apps Script editor:

1. Click **Project Settings** (the gear icon in the left sidebar)
2. Scroll down to **Script Properties**
3. Click **Add script property**

At minimum you must set the following property:

| Property Name | Value |
|---------------|-------|
| `SYNC_SECRET` | A strong password of your choosing |

The script will refuse all requests if `SYNC_SECRET` is not set.

See the **Column Configuration** section below for additional properties you
may need to set depending on your sheet layout.

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

### Tab naming

The script looks for tabs named by the end-of-cycle Sunday date in `MM/DD/YY`
format (e.g. `05/18/25`). These tab names are calculated automatically by Gig
Tracker based on each gig's configured week start day. The tab must already
exist in your spreadsheet — the script will not create tabs, and will report
an error if the expected tab is not found.

### Row layout

The script expects each weekly tab to have a fixed grid where each row
represents one day of the week. It scans a defined range of rows (default:
rows 10–16) looking for a date cell that matches the entry being synced, then
writes the earnings and mileage into the columns configured for that gig.

Formula-driven cells such as $/Mile calculations are never touched by the script.

---

## Column Configuration

The script needs to know which column contains the date, earnings, and mileage
for each gig in your sheet. These are configured via Script Properties so you
never need to edit the code.

### Default column mappings

The following defaults are built into the script. If your sheet matches these,
no additional Script Properties are needed:

| Gig | Date Column | Earnings Column | Miles Column |
|-----|-------------|-----------------|--------------|
| Instacart | B (2) | C (3) | D (4) |
| Lyft | B (2) | F (6) | G (7) |
| Roadie | J (12) | M (13) | O (15) |

### Overriding column mappings

If your sheet uses different columns, add Script Properties to override the
defaults. Use the column number (A=1, B=2, C=3, etc.):

| Property Name | Description |
|---------------|-------------|
| `GIG_DATE_COL_<GigName>` | Column containing dates for this gig |
| `GIG_EARNINGS_COL_<GigName>` | Column to write earnings into |
| `GIG_MILES_COL_<GigName>` | Column to write mileage into |

Replace `<GigName>` with the gig name exactly as it appears in Gig Config.
For example, if your Instacart earnings are in column E instead of C:

| Property Name | Value |
|---------------|-------|
| `GIG_EARNINGS_COL_Instacart` | `5` |

You only need to add properties for values that differ from the defaults.

### Adding a new gig

To support a gig that is not in the default list, add all three column
properties for it. For example, to add a gig called DoorDash:

| Property Name | Value |
|---------------|-------|
| `GIG_DATE_COL_DoorDash` | Column number for DoorDash dates |
| `GIG_EARNINGS_COL_DoorDash` | Column number for DoorDash earnings |
| `GIG_MILES_COL_DoorDash` | Column number for DoorDash mileage |

The gig name in the property key must match the name configured in the app
exactly, including capitalization and spacing.

### Overriding the data row range

By default the script scans rows 10 through 16 for date matching. If your
weekly data starts or ends on different rows, override these:

| Property Name | Default | Description |
|---------------|---------|-------------|
| `DATA_START_ROW` | `10` | First row of daily data |
| `DATA_END_ROW` | `16` | Last row of daily data |

---

## Behavior Notes

**Sync happens after every Update.**
Each time you tap Update on the Daily Input screen, any entries with a non-zero
amount or mileage are sent to the sheet. Entries where both amount and miles
are zero are not synced.

**The sheet reflects your saved totals, not your inputs.**
The value written to the sheet is the final saved total for that date, not the
number you typed into the input field. For gigs set to Replace mode this is the
new value. For gigs set to Additive mode this is the running total after your
entry was added.

**The tab must exist before syncing.**
This script does not create new tabs. Your weekly tabs must already exist in the
spreadsheet before syncing. If a tab matching the expected name is not found,
that entry will be skipped and an error noted in the response.

**Sync failures are silent in the app.**
If a sync request fails due to network issues, a wrong URL, or an invalid secret,
the app will not display an error. Your data is always saved locally first
regardless of whether the sync succeeds. Check Apps Script execution logs if you
suspect entries are not syncing correctly.

**Gig names must match exactly.**
The script uses the gig name sent by the app to look up the column mapping. If
you rename a gig in Gig Config, update the corresponding Script Property keys to
match the new name, otherwise the sync will report an unknown gig error.

**Miles are only written if greater than zero.**
If an entry has no mileage, the miles column in your sheet is left untouched.

---

## Troubleshooting

**Nothing is appearing in my sheet.**
- Confirm the sync toggle is set to Enabled in App Settings
- Check that the endpoint URL is correct and has no extra spaces
- Confirm the sync secret in the app matches the `SYNC_SECRET` Script Property
  exactly, including capitalization
- Make sure the Apps Script deployment is set to execute as `Me` and access
  is set to `Anyone`
- Try re-deploying as a new deployment and updating the URL in the app

**"Sync secret not configured" in Apps Script logs.**
The `SYNC_SECRET` Script Property has not been set. Follow Step 2 above.

**"Unauthorized" in Apps Script logs.**
The secret sent by the app does not match the one stored in Script Properties.
Check both values for typos or extra spaces.

**"Unknown gig" in Apps Script logs.**
The gig name sent by the app does not match any default or configured gig. Check
that the gig name in Gig Config matches the Script Property key exactly including
capitalization (e.g. `GIG_EARNINGS_COL_DoorDash` requires the gig to be named
`DoorDash` in the app, not `Doordash` or `door dash`).

**"Sheet tab not found" in Apps Script logs.**
The tab name calculated by the app does not match any tab in your spreadsheet.
Confirm your tabs are named in `MM/DD/YY` format using the Sunday end-of-cycle
date, and that the week start day configured in Gig Config matches your actual
pay cycle.

**"No row found matching date" in Apps Script logs.**
The script found the correct tab but could not find a row containing the entry's
date in the expected date column. Check that `DATA_START_ROW` and `DATA_END_ROW`
are correct and that the date column number for that gig is configured accurately.

**Sync stopped working after redeploying.**
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
  Script Property immediately and update the value in App Settings. You do not
  need to redeploy the script — the new secret takes effect immediately.
