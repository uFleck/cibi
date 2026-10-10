"""Screenshot each cibi-desktop page: python scripts/shot.py [page ...]  -> desktop/shots/<page>.png

Needs Pillow and the API running. The window must be visible (screen grab, not PrintWindow:
GPUI renders via DirectX so PrintWindow returns black). Don't touch the mouse/windows while it runs.
"""
import ctypes, ctypes.wintypes as w, os, subprocess, sys, time
from pathlib import Path
from PIL import ImageGrab

ctypes.windll.user32.SetProcessDPIAware()
ROOT = Path(__file__).resolve().parents[1]
EXE = ROOT / "target" / "debug" / "cibi-desktop.exe"
OUT = ROOT / "shots"
PAGES = sys.argv[1:] or ["Dashboard", "Accounts", "Transactions", "Friends", "Goals", "Settings"]
u = ctypes.windll.user32


def window_rect(pid):
    found = []

    @ctypes.WINFUNCTYPE(w.BOOL, w.HWND, w.LPARAM)
    def cb(hwnd, _):
        p = w.DWORD()
        u.GetWindowThreadProcessId(hwnd, ctypes.byref(p))
        if p.value == pid and u.IsWindowVisible(hwnd):
            r = w.RECT()
            u.GetWindowRect(hwnd, ctypes.byref(r))
            if r.right - r.left > 200:
                found.append((hwnd, (r.left, r.top, r.right, r.bottom)))
        return True

    u.EnumWindows(cb, 0)
    return found[0] if found else None


OUT.mkdir(exist_ok=True)
for page in PAGES:
    proc = subprocess.Popen([str(EXE)], env={**os.environ, "CIBI_START_VIEW": page})
    try:
        win = None
        for _ in range(40):
            time.sleep(0.5)
            win = window_rect(proc.pid)
            if win:
                break
        if not win:
            print(f"{page}: no window"); continue
        for _ in range(10):  # Windows refuses focus steals; a synthetic ALT press lifts the lock
            u.keybd_event(0x12, 0, 0, 0); u.keybd_event(0x12, 0, 2, 0)
            u.ShowWindow(win[0], 9); u.SetForegroundWindow(win[0])
            if u.GetForegroundWindow() == win[0]:
                break
            time.sleep(0.3)
        else:
            print(f"{page}: could not focus window"); continue
        l, t, r, b = win[1]
        u.SetCursorPos((l + r) // 2, t + 5)  # keep the mouse off the taskbar (hover thumbnails)
        time.sleep(3)  # let the API fetch land
        img = ImageGrab.grab(bbox=window_rect(proc.pid)[1], all_screens=True)
        img.save(OUT / f"{page}.png")
        print(f"{page}: {OUT / (page + '.png')} {img.size}")
    finally:
        proc.kill()
