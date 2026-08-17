// ============================================================================
// CONFIG — edit these if the sender, subject, or date format ever changes.
// ============================================================================
const CONFIG = {
  SENDER_EMAIL: 'RaleighWater_DoNotReply@raleighnc.gov',
  SUBJECT_CONTAINS: 'Bill is Available',
  // Matches "Due Date: 08-11-2026" (mm-dd-yyyy) after the body is upper-cased.
  // [\s*]* (instead of \s*) tolerates the "*" Gmail's plain-text conversion adds
  // around bold text — the email's "Due Date:" label is wrapped in <b>.
  DATE_REGEX: /DUE DATE[\s*]*:[\s*]*(\d{1,2})-(\d{1,2})-(\d{4})/,
  EVENT_NAME: 'Water bill',
  LOOKBACK_DAYS: 30,           // how many days back to search Gmail
  PROCESSED_LABEL: 'BillBot-Processed',
  DRY_RUN: false                // set true to log what would happen without creating events
};

function main() {
  try {
    processBills();
  } catch (err) {
    notifyError(err);
    throw err;
  }
}

function processBills() {
  const query = buildSearchQuery();
  const threads = GmailApp.search(query, 0, 50);

  if (threads.length === 0) {
    Logger.log('No new "%s" emails found.', CONFIG.EVENT_NAME);
    return;
  }

  threads.forEach(function (thread) {
    thread.getMessages().forEach(function (message) {
      processMessage(thread, message);
    });
  });
}

function buildSearchQuery() {
  return [
    'from:(' + CONFIG.SENDER_EMAIL + ')',
    'subject:"' + CONFIG.SUBJECT_CONTAINS + '"',
    'newer_than:' + CONFIG.LOOKBACK_DAYS + 'd',
    '-label:' + CONFIG.PROCESSED_LABEL
  ].join(' ');
}

function processMessage(thread, message) {
  const fromUpper = message.getFrom().toUpperCase();
  const subjectUpper = message.getSubject().toUpperCase();

  if (fromUpper.indexOf(CONFIG.SENDER_EMAIL.toUpperCase()) === -1) {
    Logger.log('Skipping message, sender does not match: %s', message.getFrom());
    return;
  }
  if (subjectUpper.indexOf(CONFIG.SUBJECT_CONTAINS.toUpperCase()) === -1) {
    Logger.log('Skipping message, subject does not match: %s', message.getSubject());
    return;
  }

  const bodyUpper = message.getPlainBody().toUpperCase();
  const dueDate = parseDueDate(bodyUpper);

  if (!dueDate) {
    Logger.log('Could not find a due date. Subject: %s', message.getSubject());
    logBodyForDebugging(bodyUpper);
    notifyError(new Error(
      'A "' + CONFIG.EVENT_NAME + '" email matched sender/subject but no due date could be ' +
      'parsed. The email format probably changed — check CONFIG.DATE_REGEX in the script.'
    ));
    return;
  }

  Logger.log('Parsed due date: %s', dueDate);

  if (CONFIG.DRY_RUN) {
    Logger.log('[DRY RUN] Would create event "%s" on %s (thread not labeled).', CONFIG.EVENT_NAME, dueDate);
    return;
  }

  createCalendarEvent(dueDate);
  markProcessed(thread);
}

function parseDueDate(bodyUpper) {
  const match = bodyUpper.match(CONFIG.DATE_REGEX);
  if (!match) return null;

  const month = parseInt(match[1], 10);
  const day = parseInt(match[2], 10);
  const year = parseInt(match[3], 10);
  return new Date(year, month - 1, day);
}

// Logs the text near "DUE DATE" (or the start of the body, if that phrase isn't
// found at all) so a failed DATE_REGEX match can be debugged from the Executions log.
function logBodyForDebugging(bodyUpper) {
  const index = bodyUpper.indexOf('DUE DATE');
  if (index === -1) {
    Logger.log('"DUE DATE" not found anywhere in the body. First 500 chars:\n%s', bodyUpper.substring(0, 500));
    return;
  }
  const start = Math.max(0, index - 20);
  Logger.log('Text near "DUE DATE":\n%s', bodyUpper.substring(start, index + 80));
}

function createCalendarEvent(dueDate) {
  if (eventAlreadyExists(dueDate)) {
    Logger.log('Event already exists on %s, skipping.', dueDate);
    return;
  }

  const calendar = CalendarApp.getDefaultCalendar();
  const event = calendar.createAllDayEvent(CONFIG.EVENT_NAME, dueDate);

  event.setDescription('Google Apps Script. BillBot: water-bill');

  // CalendarApp's enum uses legacy names; BLUE = colorId "9" = "Blueberry" (#5484ed) in the Calendar UI.
  event.setColor(CalendarApp.EventColor.BLUE);
  event.removeAllReminders();
  Logger.log('Created event "%s" on %s.', CONFIG.EVENT_NAME, dueDate);
}

function eventAlreadyExists(dueDate) {
  const calendar = CalendarApp.getDefaultCalendar();
  const startOfDay = new Date(dueDate);
  const endOfDay = new Date(dueDate);
  endOfDay.setDate(endOfDay.getDate() + 1);

  return calendar.getEvents(startOfDay, endOfDay).some(function (e) {
    return e.getTitle() === CONFIG.EVENT_NAME;
  });
}

function markProcessed(thread) {
  let label = GmailApp.getUserLabelByName(CONFIG.PROCESSED_LABEL);
  if (!label) {
    label = GmailApp.createLabel(CONFIG.PROCESSED_LABEL);
  }
  thread.addLabel(label);
}

function notifyError(err) {
  try {
    MailApp.sendEmail(
      Session.getActiveUser().getEmail(),
      'BillBot (' + CONFIG.EVENT_NAME + ') needs attention',
      'The script hit an error and may need updating:\n\n' + err + '\n\n' +
      'Common causes: the sender address changed, the subject wording changed, or the ' +
      'due-date format in the email changed. Check the CONFIG block at the top of the script.'
    );
  } catch (mailErr) {
    Logger.log('Failed to send error notification: %s', mailErr);
  }
}