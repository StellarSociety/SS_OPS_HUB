# ZKTeco Attendance Sync — Complete Guide

**For:** Orilla Restaurant FZE
**System:** ZKTeco U350 Fingerprint → ssopshub (Vercel)
**Last Updated:** 2 August 2026

---

## HOW IT WORKS (Overview)

```
[ZKTeco Fingerprint Device]  →  [Python Script on Restaurant PC]  →  [ssopshub API]  →  [Database]
     (192.168.70.32)              (attendance_sync.py)                 (Vercel)           (Supabase)
```

1. Staff scan fingerprint on the ZKTeco device at the restaurant
2. The device stores the punch (employee ID + timestamp) locally
3. A Python script running on the restaurant PC connects to the device every **30 seconds**
4. The script reads new punches and sends them to ssopshub via API
5. ssopshub stores the data in Supabase and displays it in the HR → Attendance section

**The script runs continuously in the background.** As long as the restaurant PC is on and has internet, attendance data flows automatically.

---

## WHAT WE SET UP

| Component | Details |
|-----------|---------|
| **Fingerprint Device** | ZKTeco U350 |
| **Device IP** | 192.168.70.32 |
| **Device Port** | 4370 |
| **Device Serial** | ZKM6244900188 |
| **Connection** | Ethernet (device plugged into restaurant network) |
| **Restaurant PC** | Always-on PC near the device, has WiFi/internet |
| **Script Location** | `C:\Program Files (x86)\ZKTeco\attendance_sync.py` |
| **Log File** | `C:\Program Files (x86)\ZKTeco\attendance_sync.log` |
| **State File** | `C:\Program Files (x86)\ZKTeco\attendance_sync_state.json` |
| **Offline Buffer** | `C:\Program Files (x86)\ZKTeco\attendance_offline_buffer.json` |
| **API Endpoint** | https://ssopshub.vercel.app/api/attendance/punch |
| **API Secret** | 17e2e6909072f82c743a450c854118d96b2412af590a026f8b92938ccd0d07b9 |
| **Venue** | orilla |
| **Sync Interval** | Every 30 seconds |
| **Dashboard** | https://ssopshub.vercel.app/venue/orilla/ → HR → Attendance |

---

## HOW TO CHECK IF IT'S WORKING

### Method 1: Check the log file
On the restaurant PC, open:
```
C:\Program Files (x86)\ZKTeco\attendance_sync.log
```
You should see entries like:
```
2026-08-01 14:30:00 [INFO] Connected to ZKTeco at 192.168.70.32:4370
2026-08-01 14:30:01 [INFO] Found 3 new punches
2026-08-01 14:30:02 [INFO] ✅ Synced 3 punches
```

### Method 2: Check ssopshub
Go to https://ssopshub.vercel.app/venue/orilla/ → HR → Attendance
You should see recent punches appearing.

### Method 3: Check if the script is running
On the restaurant PC, open **Task Manager** (Ctrl+Shift+Esc):
- Look for `python.exe` in the Processes tab
- If it's there, the sync is running

---

## HOW TO PAUSE THE SYNC

### If running as a regular script:
1. Open **Task Manager** on the restaurant PC
2. Find `python.exe` 
3. Right-click → **End Task**

The sync is now paused. No data will be sent until you restart it.

### If running as a Windows Service:
Open Command Prompt as Administrator and run:
```
net stop OrillaAttendanceSync
```

### If running via Task Scheduler:
1. Open **Task Scheduler** (search in Start menu)
2. Find "Orilla Attendance Sync"
3. Right-click → **Disable**

---

## HOW TO RESTART THE SYNC

### Option 1: Run manually
Open Command Prompt on the restaurant PC:
```
cd "C:\Program Files (x86)\ZKTeco"
python attendance_sync.py
```
Leave the window open — closing it stops the sync.

### Option 2: Run in background (won't close with the window)
```
cd "C:\Program Files (x86)\ZKTeco"
pythonw attendance_sync.py
```

### Option 3: Restart the Windows Service
```
net start OrillaAttendanceSync
```

### Option 4: Re-enable Task Scheduler
1. Open **Task Scheduler**
2. Find "Orilla Attendance Sync"
3. Right-click → **Enable**
4. The sync will start next time the PC boots (or right-click → **Run**)

### After any restart:
- The script automatically picks up where it left off (uses the state file)
- Any punches that happened while paused will be synced on the next cycle
- Nothing is lost — the device stores all punches locally

---

## WHAT HAPPENS WHEN...

### Internet goes down?
- The script detects the API is unreachable
- Failed punches are saved to `attendance_offline_buffer.json`
- When internet returns, the buffer is sent first before fetching new punches
- **No data is lost**

### The restaurant PC is turned off?
- The sync stops (script isn't running)
- The ZKTeco device continues storing punches locally (it has internal memory)
- When the PC turns back on and the script starts, it reads ALL new punches since the last sync and sends them
- **No data is lost**

### The ZKTeco device loses power/network?
- The script logs a connection error and retries every 60 seconds
- Once the device is back, syncing resumes automatically
- **No data is lost** (device stores punches in its own memory)

### A new employee joins?
- Register their fingerprint on the ZKTeco device (see "Adding New Employee" below)
- The script automatically picks up their punches using their device user ID
- Make sure their employee ID in the device matches their staff record in ssopshub

### The state file gets corrupted/deleted?
- The script will re-sync ALL punches from the device (may create duplicates)
- ssopshub API handles duplicates gracefully (same employee + same timestamp = ignored)
- No harm done, just a bit of extra network traffic on first sync

---

## ADDING A NEW EMPLOYEE TO THE DEVICE

1. On the restaurant PC, open the **ZKTeco software** (V2011)
2. Go to **User Management** → **Add User**
3. Fill in:
   - **User ID:** Use the employee's Orilla staff number (e.g., ORL0057)
   - **Name:** Employee's full name
4. Click **Enroll Fingerprint** → have the employee scan their finger 3 times
5. Save

The next sync cycle (within 30 seconds) will pick up this employee's punches automatically.

---

## REMOVING AN EMPLOYEE FROM THE DEVICE

1. Open ZKTeco software → **User Management**
2. Find the employee → **Delete**
3. Their historical punches remain in the database — only new punches stop

---

## FILES EXPLAINED

| File | Purpose | Can I delete it? |
|------|---------|-----------------|
| `attendance_sync.py` | The main script — does everything | ❌ NO |
| `attendance_sync.log` | Log of all activity (for troubleshooting) | ✅ Yes (it recreates automatically) |
| `attendance_sync_state.json` | Tracks what's already been synced | ⚠️ Only if you want to re-sync everything |
| `attendance_offline_buffer.json` | Stores failed punches for retry | ✅ Yes (only if buffer is empty/no pending data) |

---

## TROUBLESHOOTING

| Problem | What to check | Solution |
|---------|---------------|----------|
| No punches appearing in ssopshub | Is the script running? Check Task Manager for `python.exe` | Restart the script |
| Script says "Failed to connect to ZKTeco" | Device network issue | Check device is on, `ping 192.168.70.32` from PC |
| Script says "API returned 401" | API secret may have changed | Check `API_SECRET` in the script matches ssopshub |
| Script says "Failed to send punches" | Internet is down | Wait for internet, offline buffer will retry |
| `python` not recognized | Python not installed or not in PATH | Reinstall Python, check "Add to PATH" |
| `ModuleNotFoundError: No module named 'zk'` | Missing package | Run `pip install pyzk requests` |
| Punches showing wrong time | Timezone issue | Device clock should be set to Dubai time (UTC+4) |
| Employee showing as "Employee 5" instead of name | Name not set in device | Update user name in ZKTeco software |
| Duplicate punches in ssopshub | State file was deleted/reset | Not harmful — API deduplicates. Will normalize after one cycle |
| PC restarted but sync didn't start | Auto-start not configured | Set up Task Scheduler (see setup instructions below) |

---

## INITIAL SETUP (For reference — already done)

### Prerequisites installed on restaurant PC:
- Python 3.10+ (with "Add to PATH")
- Packages: `pyzk`, `requests`

### Installation commands:
```
pip install pyzk requests
```

### Auto-start via Task Scheduler:
1. Open Task Scheduler → Create Basic Task
2. Name: `Orilla Attendance Sync`
3. Trigger: "When the computer starts"
4. Action: Start a program
5. Program: `pythonw`
6. Arguments: `"C:\Program Files (x86)\ZKTeco\attendance_sync.py"`
7. Start in: `"C:\Program Files (x86)\ZKTeco"`
8. ✅ Check "Run with highest privileges"
9. ✅ Check "Run whether user is logged on or not"

---

## CREDENTIALS & ACCESS

| What | Value |
|------|-------|
| ssopshub URL | https://ssopshub.vercel.app |
| ssopshub Login | admin@orillarestaurant.com / pirocamarelA!25 |
| API Endpoint | https://ssopshub.vercel.app/api/attendance/punch |
| API Secret | 17e2e6909072f82c743a450c854118d96b2412af590a026f8b92938ccd0d07b9 |
| ZKTeco Device IP | 192.168.70.32:4370 |
| ZKTeco PC Software | V2011, Version 4.8.8 Build:157, SDK 6.2.5.7 |
| GitHub (ssopshub) | https://github.com/StellarSociety/SS_OPS_HUB.git |

---

## ARCHITECTURE SUMMARY

```
┌─────────────────────────────────────────────────────────────┐
│                    RESTAURANT (Hotel Local)                   │
│                                                              │
│  ┌──────────────┐        ┌─────────────────────────────┐   │
│  │  ZKTeco U350  │◄─ETH──│   Restaurant PC (always on)  │   │
│  │  Fingerprint  │        │                              │   │
│  │  Device       │        │   attendance_sync.py         │   │
│  │              │        │   - Reads punches every 30s   │   │
│  │  192.168.70.32│        │   - Sends to API via WiFi    │   │
│  └──────────────┘        │   - Buffers if offline        │   │
│                           └──────────────┬──────────────┘   │
│                                          │ WiFi/Internet     │
└──────────────────────────────────────────┼──────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   ssopshub (Vercel)      │
                              │   /api/attendance/punch  │
                              └────────────┬────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   Supabase Database      │
                              │   attendance_punches     │
                              └─────────────────────────┘
                                           │
                                           ▼
                              ┌─────────────────────────┐
                              │   ssopshub Dashboard     │
                              │   HR → Attendance        │
                              │   (view, approve, export)│
                              └─────────────────────────┘
```

---

## QUICK REFERENCE (Print this and keep near the PC)

| Action | Command |
|--------|---------|
| **Start sync** | `cd "C:\Program Files (x86)\ZKTeco"` then `python attendance_sync.py` |
| **Stop sync** | Close the terminal window OR kill `python.exe` in Task Manager |
| **Check status** | Open `attendance_sync.log` — look for recent timestamps |
| **Test device connection** | `ping 192.168.70.32` |
| **View dashboard** | https://ssopshub.vercel.app/venue/orilla/ |

---

*Document prepared by: Yusuf Khan, HR Administrator, Orilla Restaurant FZE*

---

## SETTING UP FOR A NEW VENUE

If you want to replicate this attendance sync for another restaurant/venue, here's what you need:

### Requirements

| Item | What you need |
|------|---------------|
| **ZKTeco device** | Any ZKTeco fingerprint device (U350, K40, UA760, etc.) connected to local network via Ethernet |
| **A PC** | Always-on PC on the same network as the device (Windows recommended) |
| **Internet** | WiFi or Ethernet on that PC |
| **Python 3.8+** | Installed on the PC with `pyzk` and `requests` packages |
| **ssopshub venue** | The venue must be created in ssopshub with attendance module enabled |
| **API secret** | A new secret generated for that venue (ask David or check ssopshub settings) |

### Step-by-Step Process

**1. Set up the hardware**
- Install ZKTeco fingerprint device at the new venue
- Connect it to the local network via Ethernet cable
- Note down the device's IP address (check device menu → Network settings, or check your router)
- Plug in the always-on PC on the same network

**2. Register employees on the device**
- Use ZKTeco software or the device's menu to add each employee
- Assign user IDs that match ssopshub staff IDs (for clean mapping)
- Enroll fingerprints (3 scans per employee)

**3. Create the venue in ssopshub**
- Go to ssopshub → Settings → add the new venue
- Enable the attendance module for that venue
- Generate or note the API secret for the venue

**4. Copy and configure the script**
- Copy `attendance_sync.py` to the new venue's PC
- Edit these values at the top of the script:

```python
ZKTECO_IP = "xxx.xxx.xxx.xxx"    # New device's IP address
ZKTECO_PORT = 4370                # Usually 4370 (default)
API_URL = "https://ssopshub.vercel.app/api/attendance/punch"  # Same API
API_SECRET = "new-venue-secret"   # New venue's secret
VENUE = "new-venue-slug"          # e.g. "venue-two" (must match ssopshub)
DEVICE_SERIAL = "device-serial"   # Found on device label or in device menu
SYNC_INTERVAL = 30                # Keep at 30 or adjust as needed
```

**5. Install Python and packages on the new PC**
```
# Download Python from python.org (check "Add to PATH")
pip install pyzk requests
```

**6. Test the connection**
```
cd "path\to\script\folder"
python attendance_sync.py
```
You should see:
```
Connected to ZKTeco at xxx.xxx.xxx.xxx:4370
✅ Synced X punches
```

**7. Set up auto-start**
- Use Task Scheduler (same steps as Orilla setup above)
- Set it to run on PC boot with highest privileges

**8. Verify in ssopshub**
- Go to ssopshub → select new venue → HR → Attendance
- Punches should appear within 30 seconds of a scan

### Tips for Multi-Venue

- Each venue gets its **own script instance** on its own PC
- Each venue has a **different API secret** (security)
- Each venue has a **different VENUE slug** in the script
- All data goes to the **same ssopshub** — just filtered by venue
- You can monitor all venues from one ssopshub login

### Cost per venue
- ZKTeco device: ~AED 500-1,500 (one-time)
- PC: Use any existing always-on computer
- Software: Free (Python, open-source libraries)
- ssopshub: Already running on Vercel
- **Total recurring cost: AED 0** (no subscription fees)

---

*End of document*
