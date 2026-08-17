# Bill → Calendar scripts

An independent Google Apps Script project that watches Gmail for a bill email and create an
all-day "Blueberry" colored calendar event (no reminder) on the parsed due date for **Duke Energy Progress**.

## One-time setup (repeat for each script)

1. Go to [script.google.com](https://script.google.com) → **New project**.
2. Rename the project (top left) to something recognizable, e.g. "Water Bill" or "Electric Bill".
3. Go to Project Settings and enable `Show "appscript.json" manifest in file editor`
4. Delete the placeholder `myFunction() {}` code and paste in the contents of the matching
   `electriuc-bill.gs` file from this repo.
5. Edit `appscript.json` and replace its contents with the matching `appscript.json` file from this repo.
6. Click **Save** (disk icon).
7. In the function dropdown at the top, select `main` and click **Run**.
8. The first run will pop up an authorization screen (Gmail + Calendar access). Click through
   **Advanced → Go to [project name] (unsafe)** — this warning is normal for personal scripts
   you wrote yourself that Google hasn't reviewed.

## Testing

There's a sample `.eml` in each folder (a real bill with the account details redacted) — that's
what the `DATE_REGEX` in each script was written against, useful as a reference if you need to
eyeball the wording/formatting a regex is matching against.

Both scripts have a `DRY_RUN` flag at the top of the `CONFIG` block — set it to `true` and save
before testing so `main` only logs what it *would* do instead of creating events or labeling
Gmail threads. Run `main` from the function dropdown, then check **Executions**/**View → Logs**
for the result. Once you're happy, set `DRY_RUN: false`, save, and run `main` again for real —
check your Google Calendar for the new all-day event.

Testing requires a real message in your Gmail that matches the sender/subject in `CONFIG` —
either wait for the next actual bill, or set up a Gmail filter / send yourself a throwaway test
email and temporarily point `CONFIG.SENDER_EMAIL` at your own address (remember to change it
back afterward).

## Scheduling and re-testing

You said you'll handle triggers (Triggers icon in the left sidebar) and re-running/label cleanup
directly in the Apps Script and Gmail UIs, so there's no trigger-setup code in these scripts —
`main` is the only entry point they expose.

## When something breaks

Raleigh Water or Duke Energy can change their sender address, subject line, or how they format
the due date at any time. When that happens:

- You'll get an email at your own address titled **"BillBot (...) needs attention"** — the script
  emails itself whenever it hits an unexpected error, or when it finds a matching email but can't
  parse a date out of it.
- Everything you're likely to need to change lives in the `CONFIG` block at the top of the file:
  - `SENDER_EMAIL` — update if the "from" address changes.
  - `SUBJECT_CONTAINS` — update if the subject wording changes (case doesn't matter).
  - `DATE_REGEX` — update if the due-date wording/format changes. Test with `DRY_RUN: true` first.
  - `EVENT_NAME` — the calendar event title.
- To see the raw email text the script is working with, temporarily add
  `Logger.log(bodyUpper)` inside `processMessage` (after the `bodyUpper` line), run in dry-run
  mode, and read the log — this is the easiest way to figure out a new `DATE_REGEX`.

## How matching works (both scripts)

1. Gmail is searched for messages from the configured sender, with the configured subject phrase,
   from the last `LOOKBACK_DAYS` days, that don't already have the script's "processed" label.
2. The sender and subject are double-checked in code (not just Gmail's search) by upper-casing
   both sides and checking for a substring match, so matching is case-insensitive regardless of
   how Gmail's search operators behave.
3. The email body is upper-cased and matched against `DATE_REGEX` to pull out the due date.
4. If a due date is found and no matching event already exists on that day, an all-day event is
   created, colored Blueberry (Calendar color ID 9 / `#5484ed` — Apps Script's `CalendarApp`
   enum calls this color `BLUE`, which is just an older internal name for the same color), with
   all reminders removed.
5. The Gmail thread is labeled so the same email isn't processed again tomorrow.