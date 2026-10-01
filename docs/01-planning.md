# Phase 1 — Planning & Feasibility

## 1.1 Problem statement
Students need one place to see their personal record, register for courses, get a fees quote,
pay fees, view results and exam timetables, and contact the university. The task is to recreate
the NUST Student Portal with HTML, CSS and JavaScript on the frontend and a suitable backend,
following the SDLC.

## 1.2 Objectives
1. Reproduce the look and flow of the existing portal (login → dashboard → services).
2. Build a secure REST backend on a relational database.
3. Document every SDLC phase so the process can be assessed, not only the product.

## 1.3 Scope
| In scope (prototype v0.1) | Out of scope |
|---------------------------|--------------|
| Login/logout, change password | Staff / admin portal |
| Dashboard, personal details, registered courses | Real payment gateways (EcoCash/FBC are simulated) |
| Course registration | Android calendar app |
| Fees quote, payments, payments history | Webmail and e-learning integration |
| Results, continuous assessment, exam timetable | Password reset by email/SMS |
| Messages and enquiries | |

## 1.4 Feasibility
- **Technical:** Free tools that run on a student laptop (Node.js, SQLite, any browser).
- **Economic:** No cost. SQLite avoids hosting a database server.
- **Operational:** The UI copies a layout students already know.
- **Schedule:** Fits a 4-week coursework window.

## 1.5 SDLC model — Iterative (prototype, then improve)
A working prototype is delivered first, then improved in short iterations. Each iteration
revisits requirements → design → build → test. This suits a coursework project where
feedback arrives as you go.

| Iteration | Goal |
|-----------|------|
| v0.1 ✅ | End-to-end working prototype: every sidebar item and tile works on demo data |
| v0.2 ✅ | Staff portal: results capture/publishing, fee structure, student accounts, audit log; confirmed grading scale |
| v0.2.1 ✅ | Landing page; deployed to Render |
| v0.3 ✅ | Coursework brief: student sign-up, exactly six courses, automatic overall remark (PASS / PROCEED CARRYING / REPEAT), lecturers mark only their own courses (with CSV upload), admin management of users, courses and system information |
| v0.4 | Hardening: persistent session store, password reset by email, accessibility audit |

## 1.6 Risks
| Risk | Mitigation |
|------|-----------|
| Handling real personal data | Only fictional seed data is used |
| Security weaknesses | bcrypt, parameterised SQL, httpOnly cookies, rate limiting, CSP |
| Scope creep | Out-of-scope list above; new ideas go into the next iteration |
