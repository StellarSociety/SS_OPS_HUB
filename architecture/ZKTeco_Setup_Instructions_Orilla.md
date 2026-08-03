# ZKTeco Attendance Sync — Setup Instructions for Restaurant PC

## STEP 1: Install Python

Download and install Python 3.10+ from https://www.python.org/downloads/

**IMPORTANT:** During installation, check the box that says "Add Python to PATH"

---

## STEP 2: Install required packages

Open Command Prompt (or terminal) and run:

```
pip install pyzk requests
```

---

## STEP 3: Verify the script location

The file `attendance_sync.py` should be at:

```
C:\Program Files (x86)\ZKTeco\attendance_sync.py
```

---

## STEP 4: Test the connection

Run the script:

```
cd "C:\Program Files (x86)\ZKTeco"
python attendance_sync.py
```

You should see:
```
Orilla Attendance Sync Agent — Starting
Device: 192.168.70.32:4370
Connected to ZKTeco at 192.168.70.32:4370
✅ Synced X punches
```

If you see errors, check:
- Is the ZKTeco device on and connected to the network?
- Can you ping it? Run: `ping 192.168.70.32`
- Is Python installed correctly? Run: `python --version`

---

## STEP 5: Set up auto-start (so it runs on boot)

Option A — Windows Task Scheduler:

1. Open Task Scheduler (search in Start menu)
2. Click "Create Basic Task"
3. Name: `Orilla Attendance Sync`
4. Trigger: "When the computer starts"
5. Action: "Start a program"
6. Program: `python`
7. Arguments: `"C:\Program Files (x86)\ZKTeco\attendance_sync.py"`
8. Finish

Option B — Windows Service (advanced):

```
pip install pywin32
cd "C:\Program Files (x86)\ZKTeco"
python attendance_sync.py install
python attendance_sync.py start
```

---

## STEP 6: Verify it's working

Check the log file at:
```
C:\Program Files (x86)\ZKTeco\attendance_sync.log
```

And check the dashboard at:
https://ssopshub.vercel.app/venue/orilla/

You should see attendance punches appearing.

---

## TROUBLESHOOTING

| Problem | Solution |
|---------|----------|
| `python` not recognized | Reinstall Python with "Add to PATH" checked |
| `pip` not recognized | Try `py -m pip install pyzk requests` |
| Connection refused to device | Check device is on, run `ping 192.168.70.32` |
| API error | Check internet connection on this PC |
| Permission denied | Run Command Prompt as Administrator |

---

## CONFIGURATION (already set in the script)

- Device IP: 192.168.70.32
- Device Port: 4370
- API: https://ssopshub.vercel.app/api/attendance/punch
- Secret: 17e2e6909072f82c743a450c854118d96b2412af590a026f8b92938ccd0d07b9
- Venue: orilla
- Sync every: 30 seconds
