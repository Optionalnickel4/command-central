# GIVE YOURSELF EYES — HEADLESS BROWSER FOR VISUAL SELF-TESTING

PROBLEM: You keep building visual features you can't see, and the user has to be
your eyes. Fix that: install a headless browser so you can screenshot and verify
your own work before handing it over.

## INSTALL (Playwright + Chromium)

As the builder user, in the project:

    npm install -D playwright
    npx playwright install chromium

If playwright install reports MISSING SYSTEM DEPENDENCIES (it needs libs like
libnss3, libatk1.0, libgbm, etc.), you CANNOT install them yourself — builder
has no apt/sudo for package installs. STOP and give the user the exact command
to run as root, which is typically:

    npx playwright install-deps chromium
    # or the apt-get line Playwright prints

Report the precise command Playwright asks for; don't guess at package names.
Once the user confirms deps are installed, continue.

## SCREENSHOT WORKFLOW

Write a small script (scripts/shoot.mjs or similar) that:

- Launches headless Chromium.
- Goes to http://localhost:3000 (the running service).
- Waits for the boot sequence to finish and panels to hydrate (wait for a known
  selector, not a fixed sleep, so container rows have loaded).
- Saves a full-page screenshot to a known path (e.g. /home/builder/shots/).
- Also captures targeted states, because these are the things you've been unable
  to verify:
  1. Default cockpit view (orb idle, both clusters, command bar).
  2. A container row EXPANDED (click one, wait, shoot) — verify the detail grid
     is legible and doesn't overflow.
  3. The assistant mid-reply: set the toggle to CLAUDE, type a WORDY prompt, send
     it, and capture during the "speaking" window so the ORB animation state is
     visible. (The orb's thinking→speaking→idle lifecycle is the main thing to
     confirm actually renders.)
  4. The command bar close-up (check it doesn't wrap badly).
- Print the saved file paths.

Make it re-runnable (a single `node scripts/shoot.mjs`) so it's a standing tool,
not a one-off.

## USE IT

Run the workflow now and ACTUALLY LOOK at the screenshots. Report:

- Whether the orb visibly animates on a real Claude reply (thinking spin-up,
  speaking pulse) or whether it reads as static/flicker.
- Whether expanded container rows are legible.
- Any layout breakage, overflow, or contrast problems you can now SEE.
- Fix anything clearly broken, re-shoot to confirm, and note what's fixed.

For anything that's a taste call (does it feel like a cockpit, is the glow too
much) — that's still the user's judgment; flag those but don't restyle to taste
without asking.

## CONSTRAINTS

This is a dev tool. Don't add it to the systemd service or the production build.
Don't touch the Proxmox path, the SSH-to-Sol transport, or the chat backends.
Keep screenshots out of the repo (add shots/ to .gitignore).

Do the install first and report if you hit the system-deps wall before going
further.
