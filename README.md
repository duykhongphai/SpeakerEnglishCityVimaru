# README — Auto Pronunciation Bot
[![Watch the demo](https://img.youtube.com/vi/OgEv7quvoZ8/0.jpg)](https://www.youtube.com/watch?v=OgEv7quvoZ8)
## Overview

A browser-based script that automates pronunciation exercises. Instead of manually listening to the audio sample and recording your own voice, the script captures the sample audio and feeds it into a virtual microphone so the system can grade it automatically.

---

## Requirements

- Chrome or Edge browser with DevTools access
- A pronunciation exercise page with the format: listen to sample — record — get graded
- No additional extensions or software required

---

## Installation

1. Open the pronunciation exercise page
2. Press `F12` to open DevTools
3. Switch to the **Console** tab
4. Paste the entire script into the Console and press `Enter`
5. Wait for the `HOOK READY` message to appear

---

## Usage

**Start:**
```
play()
```
The script will begin from the current question and loop continuously.

**Stop:**
```
stop()
```
The script will finish the current question and then halt.

---

## How It Works

Each question follows this sequence:

1. Automatically clicks the speaker button to play the sample audio
2. Captures the URL of the sample audio file while it plays
3. Prepares a virtual microphone stream from the captured audio
4. Waits for the sample audio to finish and the record button to appear
5. Automatically clicks the record button
6. Plays the captured audio into the virtual microphone for the system to grade
7. Once audio ends, automatically clicks the stop recording button
8. Pauses and waits for the user to review the score and press **Continue**
9. Once the next question loads, automatically starts the next cycle

---

## Notes

- After each question, the script pauses and waits for the user to press **Continue**. This allows time to review the grading result before moving on.
- If an error occurs on any question (button not found, timeout, etc.), the script will automatically retry after 2 seconds instead of stopping entirely.
- Running `play()` always starts from the current question on the page, no questions are skipped.
- The script only persists for the current browser session. If the page is reloaded, the script must be pasted and run again.
- Do not close DevTools while the script is running.

---

## Troubleshooting

| Symptom | Cause | Solution |
|---|---|---|
| Speaker button not found | Page has not finished loading | Wait for the page to fully load, then run `play()` again |
| Audio capture fails | Audio URL blocked by CORS | Script automatically falls back to the direct URL, usually self-resolving |
| Script stops unexpectedly | Unrecoverable error encountered | Run `play()` again to resume from the current question |
| Virtual microphone not working | Browser blocked AudioContext | Click anywhere on the page to interact with it, then run `play()` again |
