# Summer Prelaunch Automation Backlog

Source: June 2026 staff checklist screenshot.

## Active

- [ ] LMS creation/update for students, ideally automate.
  - Current implementation target: dashboard-first Camps LMS setup checklist.
  - V1 is read-only/manual-assist: refresh camp roster from Zebra Portal, show expected LMS setup, and let staff mark Canvas setup status after checking in their own browser session.
  - No Canvas credentials, API tokens, browser automation, user deletion, or LMS enrollment removal in V1.

## Backlog

- [ ] Scratch/Roblox/Unity accounts and laptop assignment.
- [x] Test slips with account number in camp slip creation.
- [ ] Add extended care to camp slips as `EX`.
- [ ] Student/camper list, front and back room, for printing.
  - Fields: name, room, FD/AM/PM, EX add-on, parent name, phone number, birthday, allergies/special notes, September grade, camp program/course.
  - [x] Add birthday to the printable student list.
  - [x] Make this printable as a single landscape page per week to fit more names.
  - Special notes may be stale from prior years, so staff need manual adjustment.
  - Verify fields against previous student list.
- [ ] QR codes for pictures to print on paper.
- [ ] Parent request notes for office use, potentially taped to clipboard.

## Operating Notes

- Zebra Portal camp scrape is source of truth for weekly camp rosters.
- Dashboard LMS checklist should help staff work one camp week at a time.
- Billing tables remain out of scope.
