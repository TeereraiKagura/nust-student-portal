# Phase 2 — Requirements (SRS)

## 2.1 Information gathering
Requirements come from studying the live site: the login page (`portal.nust.ac.zw`), the portal
dashboard (tiles, sidebar, personal details, registered courses), and the *Students* menu on
`nust.ac.zw` (Students Portal, Exams Timetables, Fees Structure, Campus Life).

## 2.2 Stakeholders
| Stakeholder | Interest |
|-------------|----------|
| Student (primary user) | Self-service access to academic and financial records |
| Bursary | Accurate fee quotes and payment records |
| Academic registry | Correct course registrations and results |
| ICT department | Security, maintainability, hosting |

## 2.3 Functional requirements
| ID | Requirement | Priority | Status v0.1 |
|----|-------------|----------|-------------|
| FR1 | Log in with student number and password | Must | Done |
| FR2 | Invalid login gives a generic message (doesn't reveal which field was wrong) | Must | Done |
| FR3 | Log out; session expires after 30 min of inactivity | Must | Done |
| FR4 | Dashboard shows personal details and current-semester courses | Must | Done |
| FR5 | Registration banner reflects registration status | Must | Done |
| FR6 | Register for courses at own level while registration is open; all CORE courses required; ≤ 84 credits | Must | Done |
| FR7 | Itemised, printable fees quote with amount paid and balance | Must | Done |
| FR8 | Simulated payment by EcoCash (Zimbabwean mobile number) or FBC online | Should | Done |
| FR9 | Payments history | Must | Done |
| FR10 | Results by semester with grade and credit-weighted averages | Must | Done |
| FR11 | Continuous assessment marks for the current semester | Should | Done |
| FR12 | Printable exam timetable for registered courses | Must | Done |
| FR13 | Messages inbox; header shows unread count | Should | Done |
| FR14 | Submit an enquiry and track its status | Should | Done |
| FR15 | Change password | Should | Done |
| FR16 | Links to Main Website, E-Learning, Webmail | Could | Partial (placeholders) |

### v0.2 — Staff portal
| ID | Requirement | Role | Status |
|----|-------------|------|--------|
| FR17 | Staff log in with staff number and password; deactivated accounts are refused | All staff | Done |
| FR18 | Lecturer loads a class list (course + semester) and enters marks 0–100 as drafts | Lecturer | Done |
| FR19 | Draft marks are hidden from students until published; publishing notifies each student | Lecturer | Done |
| FR20 | Changing a published mark returns it to draft | Lecturer | Done |
| FR21 | Bursary adds, edits and deletes fee items for any semester | Bursary | Done |
| FR22 | Bursary sees every student's balance and records bank deposits (unique reference, not future-dated) | Bursary | Done |
| FR23 | Every staff change is written to an activity log that only administrators can view | Admin | Done |
| FR24 | Each role sees only its own menu items; the server rejects other actions with 403 | All staff | Done |

Simplification: any lecturer may capture marks for any course (no lecturer ↔ course assignment yet).

### Business rules
- **BR1 Grading scale** (confirmed by the student; configured in `server/src/lib/grading.js`):
  75–100 = 1, 65–74 = 2.1, 60–64 = 2.2, 50–59 = P, 0–49 = F.
- **BR2** Averages are weighted by course credits.
- **BR3** Balance = semester fee items − successful payments for that semester.
- **BR4** One payment is $1–$10,000. Overpayment is allowed and shown as a credit.

## 2.4 Non-functional requirements
| ID | Category | Requirement |
|----|----------|-------------|
| NFR1 | Security | Passwords stored only as bcrypt hashes |
| NFR2 | Security | All SQL uses parameterised queries |
| NFR3 | Security | Session cookie `httpOnly`, `SameSite=Lax`, `Secure` in production; new session ID on login |
| NFR4 | Security | Login limited to 5 failed attempts per IP per 15 min |
| NFR5 | Security | All dynamic text HTML-escaped (XSS); Content-Security-Policy blocks inline scripts |
| NFR6 | Usability | Works from 360 px phone width to desktop |
| NFR7 | Accessibility | Labelled fields, keyboard navigation, skip link, visible focus, ARIA live regions |
| NFR8 | Performance | No frontend framework; pages render in < 1 s locally |
| NFR9 | Maintainability | Business rules in pure, unit-tested modules |

## 2.5 Use cases
```
Student ──► Log in ──► View dashboard
                 ├──► Register courses
                 ├──► Get fees quote ──► Pay (EcoCash / Online) ──► Payments history
                 ├──► Results / Continuous assessment / Exam timetable
                 ├──► Messages / Enquiries
                 └──► Change password / Log out
```

**UC-02 Register courses**
- *Precondition:* logged in; current semester has registration open.
- *Main flow:* open New Registration → system lists courses for the student's programme and
  level with cores pre-ticked → student adds electives → running credit total updates →
  submit → system validates FR6 and saves in one transaction → confirmation.
- *Alternates:* registration closed → read-only; missing core or too many credits → error,
  nothing saved.
