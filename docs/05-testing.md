# Phase 5 — Testing

## 5.1 Strategy
| Level | Tool | What |
|-------|------|------|
| Unit | `node:test` | Pure business rules: grading bands and boundaries, weighted averages, registration validation |
| Integration / API | `node:test` + `supertest` + in-memory SQLite | Every endpoint group, auth, validation, access control |
| System / UI | Manual in browser (desktop and 375 px mobile) | Every sidebar item and tile, forms, printing, sidebar toggle |

Run automated tests with `cd server && npm test`.

## 5.2 Automated test cases (20 — all passing in v0.1)
| # | Test | Requirement |
|---|------|-------------|
| U1–U3 | Grade boundaries (75/74, 65/64, 60/59, 50/49), invalid marks rejected, weighted average | BR1, BR2 |
| U4–U6 | Registration: valid selection, missing core, unknown course, credit limit, empty, duplicates | FR6 |
| A1 | Wrong password → 401 with generic message | FR2 |
| A2 | Unknown student → same message | FR2 |
| A3 | Student number case-insensitive; cookie is HttpOnly | FR1, NFR3 |
| A4 | 6th attempt after 5 failures → 429 | NFR4 |
| A5 | Protected APIs return 401 and `/dashboard.html` redirects when logged out | FR3 |
| A6 | Dashboard data correct, no password field anywhere in the response | FR4, NFR1 |
| A7 | Logout ends session | FR3 |
| A8 | Registration: missing core rejected; valid selection saved and shown on dashboard | FR6 |
| A9 | Cannot register another level's course | FR6 |
| A10 | Results graded and averaged | FR10 |
| A11 | Payments: bad phone/amount/method rejected; balance decreases; receipt message created | FR7–FR9, FR13 |
| A12 | Cannot mark another student's message as read (IDOR) | Security |
| A13 | Enquiry validation and storage | FR14 |
| A14 | Password change: old password stops working, new works | FR15 |

### v0.2 staff tests (`test/staff.test.js`, 11 tests — total now 31, all passing)
| # | Test | Requirement |
|---|------|-------------|
| S1 | Migration upgrades a v0.1 database, keeps results visible, is safe to re-run | Maintainability |
| S2 | Staff login; student session cannot reach staff API | FR17, FR24 |
| S3 | Deactivated staff: login refused and existing session stops working | FR17 |
| S4 | Role matrix: lecturer ✖ fees, bursary ✖ results, only admin sees audit | FR24, FR23 |
| S5 | Staff pages redirect when logged out | FR17 |
| S6 | Draft hidden from student → publish → visible, graded, student notified; re-publish → 409 | FR18, FR19 |
| S7 | Unchanged mark = no change; edited published mark → draft; blank removes | FR20 |
| S8 | Mark validation: >100, decimals, strings, student not in class, empty list, unknown course | FR18 |
| S9 | Fee item add/edit/delete changes student quote; audited in order; validation | FR21, FR23 |
| S10 | Balances listed; bank deposit lowers balance; duplicate reference 409; bad amount/ref/date 400 | FR22 |
| S11 | Overview totals (students, collected, outstanding) | — |

## 5.3 Manual system test log (v0.1)
| Test | Result |
|------|--------|
| Login with wrong password shows "Invalid student number or password." | Pass |
| Login with demo account opens dashboard with tiles, banner, details, 6 courses | Pass |
| Every route (#/registration … #/elearning, unknown route) renders without errors | Pass |
| EcoCash payment of $100: receipt shown, balance $350 → $250, unread badge 1 → 2 | Pass |
| Mobile 375 px: no horizontal scroll, sidebar opens with ☰ and closes on backdrop tap | Pass |

### v0.2 manual log
| Test | Result |
|------|--------|
| Existing v0.1 `portal.db` upgraded by migration: 3 payments and 12 results kept, results still visible | Pass |
| Lecturer S2001 sees only Dashboard + Capture Results | Pass |
| Lecturer enters 78 for SCS2114 → "1 mark(s) saved as draft" → Publish → status Published | Pass |
| Bursary S3001 sees Dashboard, Fee Structure, Student Accounts | Pass |
| Add "Laboratory fee" $45.50 → total $795.50; balances list updates | Pass |
| Record bank deposit $200 CBZ-778812 → balance $195.50, "Recorded by Blessing Sibanda" | Pass |
| Student sees SCS2114 = 78 (grade 1), "Results published" + "Payment received" messages, badge 3 | Pass |
| No console errors | Pass |

## 5.4 Defects found and fixed
| ID | Defect | Fix |
|----|--------|-----|
| D1 | Test expected fee total $770; the seeded items sum to $750 | Corrected test expectation (the data was right) |
| D2 | Grading scale was an assumption | Replaced with the confirmed NUST scale (BR1); boundary tests updated |
| D3 | "Semesters completed" counted the in-progress semester once staff published current marks | Relabelled "Semesters with results" |
| D4 | Client-side mark check had ambiguous `&&`/`\|\|` precedence | Added parentheses |

### v0.2.1 — Landing page
| Test | Result |
|------|--------|
| Automated: `/` shows the chooser when logged out; logged-in student is redirected from `/`, `/student.html`, `/staff.html` to their dashboard; `/dashboard.html` redirects to `/student.html` when logged out (32 tests total, all passing) | Pass |
| Manual: `/` → Staff Portal → "Choose a different portal" → `/` → Student Portal → log in → dashboard → Logout → back to `/`, session ended (401) | Pass |
