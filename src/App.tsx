import React, { useState, useEffect, useRef } from 'react';
import { CircleHelp } from 'lucide-react';

const VENMO_USERNAME = 'Aaron-Davis-6477';
const VENMO_DEEP = `venmo://paycharge?txn=pay&recipients=${VENMO_USERNAME}&amount=0&note=Gig+Tracker+Beta+Tip`;
const VENMO_WEB = `https://venmo.com/${VENMO_USERNAME}`;
const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const DAY_SHORT = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const DAY_FULL = ['Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday', 'Sunday'];
const DAY_IDX: Record<string, number> = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };
function jsToOur(d: number) { return (d + 6) % 7; }

const fmtDateKey = (d: Date) => d.getFullYear() + '-' + (d.getMonth() + 1).toString().padStart(2, '0') + '-' + d.getDate().toString().padStart(2, '0');
const fmtShort = (d: Date) => MONTHS[d.getMonth()] + ' ' + d.getDate();
const dateOnly = (d: Date | string) => {
  if (typeof d === 'string') {
    const parts = d.split('-');
    return new Date(parseInt(parts[0]), parseInt(parts[1]) - 1, parseInt(parts[2]));
  }
  const x = new Date(d); x.setHours(0, 0, 0, 0); return x;
};
const addDays = (d: Date, n: number) => { const x = new Date(d); x.setDate(x.getDate() + n); return x; };
const getPayWed = (refMonday: Date) => addDays(refMonday, 9);
const getCycleDates = (ws: string, payWed: Date) => {
  const sIdx = DAY_IDX[ws]; const eIdx = (sIdx + 6) % 7;
  let daysBack = (2 - eIdx + 7) % 7; if (daysBack === 0) daysBack = 7;
  const end = addDays(payWed, -daysBack); const start = addDays(end, -6);
  const dates = []; for (let i = 0; i < 7; i++) dates.push(addDays(start, i));
  return { cycleStart: start, cycleEnd: end, dates };
};

export default function App() {
  const [inputDateKey, setInputDateKey] = useState(() => fmtDateKey(dateOnly(new Date())));
  const [theme, setThemeState] = useState(() => localStorage.getItem('theme') || 'auto');
  const [currentScreen, setCurrentScreen] = useState('daily');
  const [gigs, setGigs] = useState<any[]>(() => JSON.parse(localStorage.getItem('gigs') || 'null') || []);
  const [weekHistory, setWeekHistory] = useState<any[]>(() => JSON.parse(localStorage.getItem('weekHistory') || '[]'));
  const [sheetSyncUrl, setSheetSyncUrl] = useState(() => localStorage.getItem('sheetSyncUrl') || '');
  const [isDrawerOpen, setIsDrawerOpen] = useState(false);
  const [reportWeekIndex, setReportWeekIndex] = useState(0);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [fName, setFName] = useState('');
  const [fBehavior, setFBehavior] = useState('replace');
  const [fWeekStart, setFWeekStart] = useState('Mon');
  const [fCutoff, setFCutoff] = useState('00:00');
  const [fMiles, setFMiles] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [confirmMsg, setConfirmMsg] = useState('');
  const [deletingId, setDeletingId] = useState<number | null>(null);
  const [pendingDeleteWeekKey, setPendingDeleteWeekKey] = useState<string | null>(null);
  const [confirmBtnText, setConfirmBtnText] = useState('Remove');
  const [pendingRestoreData, setPendingRestoreData] = useState<any>(null);
  const [notification, setNotification] = useState<{ msg: string; type: 'success' | 'error' | 'info' } | null>(null);
  const [offendingInputIds, setOffendingInputIds] = useState<number[]>([]);
  const [helpModal, setHelpModal] = useState<{ title: string; body: string } | null>(null);

  const updateStateState = useState<'idle' | 'saving' | 'saved'>('idle');
  const [updateState, setUpdateState] = updateStateState;
  const updateTimer = useRef<any>(null);
  const helpTimer = useRef<any>(null);
  const isLongPressActive = useRef(false);

  const [trackingGigId, setTrackingGigId] = useState<number | null>(null);
  const [tripDistance, setTripDistance] = useState(0);
  const watchId = useRef<number | null>(null);
  const lastPos = useRef<{ lat: number; lng: number } | null>(null);
  const wakeLock = useRef<any>(null);
  const [isGpsSupported] = useState(() => 'geolocation' in navigator);

  const requestWakeLock = async () => {
    try {
      if ('wakeLock' in navigator && (navigator as any).wakeLock) {
        wakeLock.current = await (navigator as any).wakeLock.request('screen');
      }
    } catch (err) {
      console.error('Wake Lock error:', err);
    }
  };

  const releaseWakeLock = () => {
    if (wakeLock.current) {
      wakeLock.current.release().then(() => { wakeLock.current = null; });
    }
  };

  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && trackingGigId !== null) requestWakeLock();
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [trackingGigId]);

  const isInputToday = inputDateKey === fmtDateKey(new Date());

  const getDistance = (lat1: number, lon1: number, lat2: number, lon2: number) => {
    const R = 3958.8;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  };

  const stopTracking = (gigId: number, distance: number) => {
    if (watchId.current !== null) { navigator.geolocation.clearWatch(watchId.current); watchId.current = null; }
    releaseWakeLock();
    lastPos.current = null;
    if (distance > 0) {
      setWeekHistory(prev => {
        const hist = [...prev];
        const d = dateOnly(new Date());
        const effKey = fmtDateKey(d);
        const refMon = addDays(d, -jsToOur(d.getDay()));
        const weekKey = fmtDateKey(refMon);
        let idx = hist.findIndex(w => w.key === weekKey);
        if (idx === -1) { hist.push({ key: weekKey, startDate: refMon.toISOString(), data: {}, miles: {}, exported: false }); idx = hist.length - 1; }
        const entry = { ...hist[idx], miles: { ...hist[idx].miles } };
        if (!entry.miles[gigId]) entry.miles[gigId] = {};
        const currentMiles = parseFloat(entry.miles[gigId][effKey] as any) || 0;
        entry.miles[gigId][effKey] = Number((currentMiles + distance).toFixed(1));
        hist[idx] = entry;
        return hist;
      });
      showNotification(`Trip ended: ${distance.toFixed(1)} miles added to ${gigs.find(g => g.id === gigId)?.name}.`, 'success');
    }
    setTrackingGigId(null);
    setTripDistance(0);
  };

  const startTracking = (gigId: number) => {
    if (trackingGigId !== null) stopTracking(trackingGigId, tripDistance);
    setTrackingGigId(gigId);
    setTripDistance(0);
    lastPos.current = null;
    requestWakeLock();
    watchId.current = navigator.geolocation.watchPosition(
      (pos) => {
        const { latitude: lat, longitude: lng } = pos.coords;
        if (lastPos.current) {
          const delta = getDistance(lastPos.current.lat, lastPos.current.lng, lat, lng);
          if (delta > 0.005) { setTripDistance(prev => Number((prev + delta).toFixed(2))); lastPos.current = { lat, lng }; }
        } else { lastPos.current = { lat, lng }; }
      },
      (err) => { console.error('GPS error:', err); showNotification('GPS Error: Could not track location.', 'error'); stopTracking(gigId, 0); },
      { enableHighAccuracy: true, maximumAge: 1000, timeout: 5000 }
    );
  };

  useEffect(() => {
    const lockOrientation = async () => {
      try { if ('orientation' in screen && (screen.orientation as any).lock) await (screen.orientation as any).lock('portrait'); } catch (e) {}
    };
    lockOrientation();
    return () => { if (watchId.current !== null) navigator.geolocation.clearWatch(watchId.current); };
  }, []);

  const longPress = (title: string, body: string) => {
    return {
      onMouseDown: () => {
        isLongPressActive.current = false;
        helpTimer.current = setTimeout(() => { setHelpModal({ title, body }); isLongPressActive.current = true; if ('vibrate' in navigator) navigator.vibrate(50); }, 500);
      },
      onMouseUp: () => { clearTimeout(helpTimer.current); },
      onMouseLeave: () => { clearTimeout(helpTimer.current); },
      onContextMenu: (e: React.MouseEvent) => { e.preventDefault(); },
      onTouchStart: (e: React.TouchEvent) => {
        isLongPressActive.current = false;
        helpTimer.current = setTimeout(() => { setHelpModal({ title, body }); isLongPressActive.current = true; if ('vibrate' in navigator) navigator.vibrate(50); }, 500);
      },
      onTouchMove: () => { clearTimeout(helpTimer.current); },
      onTouchEnd: () => { clearTimeout(helpTimer.current); },
      style: { cursor: 'help' } as React.CSSProperties
    };
  };

  const HelpIcon = () => (<CircleHelp className="help-icon" size="1.2em" strokeWidth={2.5} />);

  useEffect(() => { localStorage.setItem('theme', theme); applyTheme(); }, [theme]);
  useEffect(() => { localStorage.setItem('gigs', JSON.stringify(gigs)); }, [gigs]);
  useEffect(() => { localStorage.setItem('weekHistory', JSON.stringify(weekHistory)); }, [weekHistory]);
  useEffect(() => { localStorage.setItem('sheetSyncUrl', sheetSyncUrl); }, [sheetSyncUrl]);
  useEffect(() => { localStorage.setItem('sheetSyncEnabled', sheetSyncEnabled.toString()); }, [sheetSyncEnabled]);
  useEffect(() => { localStorage.setItem('sheetSyncSecret', sheetSyncSecret); }, [sheetSyncSecret]);

  const applyTheme = () => {
    const prefersDark = window.matchMedia && window.matchMedia('(prefers-color-scheme:dark)').matches;
    document.documentElement.classList.toggle('dark', theme === 'dark' || (theme === 'auto' && prefersDark));
  };

  const getEffectiveDate = (date: Date, cutoff: string) => {
    const d = new Date(date);
    const [h, m] = cutoff.split(':').map(Number);
    if (d.getHours() < h || (d.getHours() === h && d.getMinutes() < m)) d.setDate(d.getDate() - 1);
    return dateOnly(d);
  };

  const getValueForDate = (id: number, dateKey: string) => {
    const gig = gigs.find(g => g.id === id); if (!gig) return 0;
    const d = dateOnly(dateKey);
    const refMon = addDays(d, -jsToOur(d.getDay()));
    const week = weekHistory.find(w => w.key === fmtDateKey(refMon));
    return Number((parseFloat(week?.data?.[id]?.[dateKey] as any) || 0).toFixed(2));
  };

  const getMilesForDate = (id: number, dateKey: string) => {
    const d = dateOnly(dateKey);
    const refMon = addDays(d, -jsToOur(d.getDay()));
    const week = weekHistory.find(w => w.key === fmtDateKey(refMon));
    return Number((parseFloat(week?.miles?.[id]?.[dateKey] as any) || 0).toFixed(1));
  };

  const getCycleTotal = (id: number) => {
    const gig = gigs.find(g => g.id === id); if (!gig) return 0;
    const d = dateOnly(inputDateKey);
    const daysBack = (jsToOur(d.getDay()) - DAY_IDX[gig.weekStart] + 7) % 7;
    const cycleStart = addDays(d, -daysBack);
    const keys = new Set(Array.from({ length: 7 }, (_, i) => fmtDateKey(addDays(cycleStart, i))));
    let total = 0;
    weekHistory.forEach(w => { if (w.data[id]) Object.entries(w.data[id]).forEach(([k, v]) => { if (keys.has(k)) total = Number((total + (parseFloat(v as any) || 0)).toFixed(2)); }); });
    return total;
  };

  const getCycleMilesTotal = (id: number) => {
    const gig = gigs.find(g => g.id === id); if (!gig) return 0;
    const d = dateOnly(inputDateKey);
    const daysBack = (jsToOur(d.getDay()) - DAY_IDX[gig.weekStart] + 7) % 7;
    const cycleStart = addDays(d, -daysBack);
    const keys = new Set(Array.from({ length: 7 }, (_, i) => fmtDateKey(addDays(cycleStart, i))));
    let total = 0;
    weekHistory.forEach(w => { if (w.miles?.[id]) Object.entries(w.miles[id]).forEach(([k, v]) => { if (keys.has(k)) total = Number((total + (parseFloat(v as any) || 0)).toFixed(1)); }); });
    return total;
  };

  const getCycleEf = (id: number) => { const e = getCycleTotal(id); const m = getCycleMilesTotal(id); return m > 0 ? e / m : 0; };

  const isInCycle = (gig: any) => {
    const d = dateOnly(inputDateKey);
    const refMon = addDays(d, -jsToOur(d.getDay()));
    return getCycleDates(gig.weekStart, getPayWed(refMon)).dates.some(date => fmtDateKey(date) === inputDateKey);
  };

  const getSelectLabel = (d: Date) => DAY_FULL[jsToOur(d.getDay())] + ', ' + MONTHS[d.getMonth()] + ' ' + d.getDate();

  const handleCurrencyInput = (e: React.FormEvent<HTMLInputElement>, id: number) => {
    const input = e.currentTarget;
    if (offendingInputIds.includes(id)) setOffendingInputIds(prev => prev.filter(x => x !== id));
    const isNegative = input.value.includes('-');
    let digits = input.value.replace(/\D/g, '');
    if (!digits) { input.value = isNegative ? '-' : ''; return; }
    while (digits.length < 3) digits = '0' + digits;
    const iPart = digits.slice(0, -2).replace(/^0+(?!$)/, '');
    input.value = (isNegative ? '-' : '') + (iPart || '0') + '.' + digits.slice(-2);
  };

  const handleMilesInput = (e: React.FormEvent<HTMLInputElement>) => {
    const input = e.currentTarget;
    let value = input.value.replace(/[^0-9.-]/g, '');
    value = value.replace(/^-*/, value.startsWith('-') ? '-' : ''); // allow at most one - at start
    value = value.replace(/-+/g, ''); // remove any - not at start
    const parts = value.split('.');
    if (parts.length > 2) value = parts[0] + '.' + parts.slice(1).join('');
    input.value = value;
  };

  // --- Google Sheets sync ---
const syncToSheets = (entries: { gig: string; date: string; amount: number; miles: number; tabName: string }[]) => {
  const url = (sheetSyncUrl || import.meta.env.VITE_SHEETS_URL || '').trim();
  if (!sheetSyncEnabled || !url || entries.length === 0) return;
  const payloadBody: any = { entries };
  if (sheetSyncSecret.trim()) payloadBody.token = sheetSyncSecret.trim();
  const payload = JSON.stringify(payloadBody);
  fetch(url, {
  method: 'POST',
  headers: {
    'Content-Type': 'application/json'
  },
  body: payload
})
.catch(() => {});
}; 

  // Actions
  const updateTotals = () => {
    if (isLongPressActive.current) return;
    if (updateTimer.current) clearTimeout(updateTimer.current);

    const offending: number[] = [];
    const selectedDate = dateOnly(inputDateKey);
    const effKey = inputDateKey;
    const refMon = addDays(selectedDate, -jsToOur(selectedDate.getDay()));
    const weekKey = fmtDateKey(refMon);

    gigs.forEach(g => {
      const inp = document.getElementById(`inp-${g.id}`) as HTMLInputElement;
      const val = parseFloat(inp?.value || '') || 0;
      if (val === 0 && (!inp || inp.value === '')) return;
      const week = weekHistory.find(w => w.key === weekKey);
      const ex = parseFloat(week?.data?.[g.id]?.[effKey] as any) || 0;
      const result = g.behavior === 'add' ? Number((ex + val).toFixed(2)) : Number(val.toFixed(2));
      if (result < 0) offending.push(g.id);
    });

    let milesOffending: number[] = [];
    gigs.forEach(g => {
      const miInp = document.getElementById(`mi-${g.id}`) as HTMLInputElement;
      const mVal = parseFloat(miInp?.value || '') || 0;
      if (mVal === 0 && (!miInp || miInp.value === '')) return;
      const week = weekHistory.find(w => w.key === weekKey);
      const exM = parseFloat(week?.miles?.[g.id]?.[effKey] as any) || 0;
      if (exM + mVal < 0) milesOffending.push(g.id);
    });

    if (offending.length > 0) {
      setOffendingInputIds(offending);
      setConfirmMsg("Your balance can't go below zero. Please fix the amounts highlighted in red.");
      setConfirmBtnText('OK');
      setConfirmOpen(true);
      return;
    }

    if (milesOffending.length > 0) {
      setOffendingInputIds(milesOffending);
      setConfirmMsg("Mileage can't go below zero. Please fix the amounts highlighted in red.");
      setConfirmBtnText('OK');
      setConfirmOpen(true);
      return;
    }

    setOffendingInputIds([]);
    setUpdateState('saving');
    setTimeout(() => {
      let entriesToSync: { gig: string; date: string; amount: number; tabName: string }[] = [];

      setWeekHistory(prev => {
        const hist = [...prev];
        const selectedDate = dateOnly(inputDateKey);
        const effKey = inputDateKey;
        const refMon = addDays(selectedDate, -jsToOur(selectedDate.getDay()));
        const weekKey = fmtDateKey(refMon);

        gigs.forEach(g => {
          let idx = hist.findIndex(w => w.key === weekKey);
          if (idx === -1) {
            hist.push({ key: weekKey, startDate: refMon.toISOString(), data: {}, miles: {}, exported: false });
            idx = hist.length - 1;
          }
          const entry = { ...hist[idx], data: { ...hist[idx].data }, miles: { ...hist[idx].miles } };

          const inp = document.getElementById(`inp-${g.id}`) as HTMLInputElement;
          const miInp = document.getElementById(`mi-${g.id}`) as HTMLInputElement;
          const val = parseFloat(inp?.value || '') || 0;
          const mVal = parseFloat(miInp?.value || '') || 0;

          if (val !== 0 || (inp && inp.value !== '')) {
            if (!entry.data[g.id]) entry.data[g.id] = {};
            const ex = parseFloat(entry.data[g.id][effKey]) || 0;
            entry.data[g.id][effKey] = g.behavior === 'add' ? Number((ex + val).toFixed(2)) : Number(val.toFixed(2));
            if (inp) inp.value = '';
          }

          if (mVal !== 0 || (miInp && miInp.value !== '')) {
            if (!entry.miles[g.id]) entry.miles[g.id] = {};
            const exM = parseFloat(entry.miles[g.id][effKey]) || 0;
            entry.miles[g.id][effKey] = Number((exM + mVal).toFixed(1));
            if (miInp) miInp.value = '';
          }

          hist[idx] = entry;
        });

        // Build sync entries from freshly updated hist
	const parts = effKey.split('-');
	const dateStr = parseInt(parts[1]) + '/' + parseInt(parts[2]) + '/' + parts[0];

	entriesToSync = gigs.map(g => {
	  const amount = hist.find(w => w.key === weekKey)?.data?.[g.id]?.[effKey] || 0;
	  const miles = hist.find(w => w.key === weekKey)?.miles?.[g.id]?.[effKey] || 0;

	  const sd = dateOnly(effKey);
	  const gigDow = jsToOur(sd.getDay());
	  const gigStartDow = DAY_IDX[g.weekStart];
	  const gigDaysBack = (gigDow - gigStartDow + 7) % 7;
	  const gigCycleStart = addDays(sd, -gigDaysBack);
	  const cycleStartDow = jsToOur(gigCycleStart.getDay());
	  const tabMonday = addDays(gigCycleStart, -cycleStartDow);
	  const tabSunday = addDays(tabMonday, 6);
	  const tabName = (tabSunday.getMonth() + 1).toString().padStart(2, '0') + '/' +
	    tabSunday.getDate().toString().padStart(2, '0') + '/' +
	    tabSunday.getFullYear().toString().slice(2);

	  return { gig: g.name, date: dateStr, amount, miles, tabName };
	}).filter(e => e.amount !== 0 || e.miles > 0);

        return hist;
      });

      setUpdateState('saved');
      updateTimer.current = setTimeout(() => setUpdateState('idle'), 2000);
      setTimeout(() => syncToSheets(entriesToSync), 100);
    }, 400);
  };

  const showNotification = (msg: string, type: 'success' | 'error' | 'info' = 'info') => {
    setNotification({ msg, type });
    setTimeout(() => setNotification(null), 3000);
  };

  const handleExport = (w: any) => {
    if (isLongPressActive.current) return;
    const today = dateOnly(new Date());
    const payWed = getPayWed(dateOnly(new Date(w.startDate)));
    const uniqueWeekStarts = Array.from(new Set(gigs.map(g => g.weekStart)));
    const activeCycles = uniqueWeekStarts.filter(ws => { const { cycleEnd } = getCycleDates(ws as string, payWed); return today <= cycleEnd; });
    if (activeCycles.length > 0) { setHelpModal({ title: 'Export Restricted', body: 'Exporting is disabled until the current pay cycle is complete.' }); return; }

    const win = window as any; if (!win.XLSX) { showNotification('XLSX not loaded', 'error'); return; }
    const XL = win.XLSX; const rows: any[][] = []; const groups: any = {};
    gigs.forEach(g => { if (!groups[g.weekStart]) groups[g.weekStart] = []; groups[g.weekStart].push(g); });
    const payL = `Paid Wed ${fmtShort(payWed)}`;
    Object.keys(groups).forEach((ws, i) => {
      const { cycleStart, cycleEnd, dates } = getCycleDates(ws, payWed);
      if (i > 0) rows.push([]);
      rows.push([payL], [`Work period: ${fmtShort(cycleStart)} – ${fmtShort(cycleEnd)}`], ['Gig', ...dates.map(d => `${DAY_SHORT[jsToOur(d.getDay())]} ${fmtShort(d)}`), 'Total']);
      const colT = new Array(7).fill(0); const colM = new Array(7).fill(0); let gT = 0; let gM = 0;
      groups[ws].forEach((g: any) => {
        const r: any[] = [g.name]; let rT = 0;
        dates.forEach((d, j) => { const v = parseFloat(w.data[g.id]?.[fmtDateKey(d)] as any) || 0; r.push(v); rT = Number((rT + v).toFixed(2)); colT[j] = Number((colT[j] + v).toFixed(2)); gT = Number((gT + v).toFixed(2)); });
        r.push(rT); rows.push(r);
        if (g.miles) {
          const mR: any[] = [`  Miles`]; let rM = 0;
          dates.forEach((d, j) => { const v = parseFloat(w.miles?.[g.id]?.[fmtDateKey(d)] as any) || 0; mR.push(v); rM = Number((rM + v).toFixed(1)); colM[j] = Number((colM[j] + v).toFixed(1)); gM = Number((gM + v).toFixed(1)); });
          mR.push(rM); rows.push(mR);
          rows.push([`  $/mile`, ...dates.map(d => { const e = parseFloat(w.data?.[g.id]?.[fmtDateKey(d)] as any) || 0; const m = parseFloat(w.miles?.[g.id]?.[fmtDateKey(d)] as any) || 0; return m > 0 ? (e / m).toFixed(2) : '-'; }), (rM > 0 ? (rT / rM).toFixed(2) : '-')]);
        }
      });
      rows.push(['Total Earned', ...colT, gT]);
      if (gM > 0) { rows.push(['Total Miles', ...colM, gM]); rows.push(['Average $/mile', ...dates.map((d, j) => colM[j] > 0 ? (colT[j] / colM[j]).toFixed(2) : '-'), (gM > 0 ? (gT / gM).toFixed(2) : '-')]); }
    });
    const wb = XL.utils.book_new(); const ws_sheet = XL.utils.aoa_to_sheet(rows);
    XL.utils.book_append_sheet(wb, ws_sheet, 'Weekly Report'); XL.writeFile(wb, `GigTracker_${payL.replace(/\s/g, '_')}.xlsx`);
    setWeekHistory(prev => prev.map(item => item.key === w.key ? { ...item, exported: true } : item));
    showNotification('Spreadsheet exported successfully.', 'success');
  };

  const handleInitiateDeleteWeek = (w: any) => {
    if (isLongPressActive.current) return;
    const today = dateOnly(new Date());
    const payWed = getPayWed(dateOnly(new Date(w.startDate)));
    const uniqueWeekStarts = Array.from(new Set(gigs.map(g => g.weekStart)));
    const activeCycles = uniqueWeekStarts.filter(ws => { const { cycleEnd } = getCycleDates(ws as string, payWed); return today <= cycleEnd; });
    if (activeCycles.length > 0) { setHelpModal({ title: 'Delete Restricted', body: 'Deletion is disabled until the current pay cycle is complete.' }); return; }
    setPendingDeleteWeekKey(w.key);
    setConfirmMsg(w.exported ? 'Are you sure you want to delete this week? This action cannot be undone.' : 'This report has not been exported yet. Are you sure you want to delete it permanently?');
    setConfirmBtnText('Delete');
    setConfirmOpen(true);
  };

  const backupToFile = () => {
    const data = JSON.stringify({ version: '1.0', timestamp: new Date().toISOString(), theme, gigs, weekHistory });
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `GigTracker_Backup_${new Date().toISOString().replace('T', '_').slice(0, 16).replace(/:/g, '-')}.json`;
    a.click();
    URL.revokeObjectURL(url);
    showNotification('Backup file created and download started.', 'success');
  };

  const handleRestoreFile = (e: React.ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0]; if (!f) return;
    const r = new FileReader();
    r.onload = (ev) => {
      try {
        const b = JSON.parse(ev.target?.result as string);
        if (b.gigs && b.weekHistory) { setPendingRestoreData(b); setConfirmMsg('Are you sure you want to restore from this backup? This will overwrite all your current configurations and history.'); setConfirmBtnText('Restore Data'); setConfirmOpen(true); }
        else showNotification('Invalid backup file format.', 'error');
      } catch (err) { showNotification('Error parsing backup file.', 'error'); }
      e.target.value = '';
    };
    r.readAsText(f);
  };

  return (
    <div id="app">
      <div className="landscape-warning">
        <i className="ti ti-device-mobile-rotated"></i>
        <h2>Portrait Mode Recommended</h2>
        <p>Please rotate your device for the best experience.</p>
      </div>
      <div className="topbar">
        <span className="topbar-title">{SCREENS.find(s => s.id === currentScreen)?.label}</span>
        <button className="ham-btn" onClick={() => setIsDrawerOpen(true)}><i className="ti ti-menu-2"></i></button>
      </div>

      <div className={`overlay ${isDrawerOpen ? 'open' : ''}`} onClick={() => setIsDrawerOpen(false)}></div>
      <div className={`drawer ${isDrawerOpen ? 'open' : ''}`}>
        <div className="drawer-close"><button onClick={() => setIsDrawerOpen(false)}><i className="ti ti-x"></i></button></div>
        {SCREENS.filter(s => s.id !== currentScreen).map((s, i, arr) => (
          <React.Fragment key={s.id}>
            <button className="drawer-item" onClick={() => { setCurrentScreen(s.id); setIsDrawerOpen(false); }}>
              <i className={`ti ${s.icon}`}></i>{s.label}
            </button>
            {i < arr.length - 1 && <div className="drawer-divider"></div>}
          </React.Fragment>
        ))}
      </div>

      {currentScreen === 'daily' && (
        <div className="screen active">
          {gigs.length === 0 ? (
            <div className="first-run">
              <i className="ti ti-steering-wheel"></i><h2>Welcome to Gig Tracker</h2>
              <p>Track your daily earnings across all your gig platforms in one place. Get started by adding your first gig.</p>
              <button className="first-run-btn" onClick={() => setCurrentScreen('gigs')}><i className="ti ti-settings"></i> Set up my gigs</button>
            </div>
          ) : (
            <>
              <div className="daily-header-row">
                <span className="section-label has-help" {...longPress('Select Date', 'Choose a date to view or enter earnings for that day. You can edit any day within your current pay cycle.')}>Earnings for <HelpIcon /></span>
                <select className="date-select" value={inputDateKey} onChange={e => setInputDateKey(e.target.value)}>
                  {[0, 1, 2, 3, 4, 5, 6].map(offset => { const d = addDays(dateOnly(new Date()), -offset); const k = fmtDateKey(d); return <option key={k} value={k}>{getSelectLabel(d)}{offset === 0 ? ' (Today)' : ''}</option>; })}
                </select>
              </div>
              {gigs.map(g => (
                <div key={g.id} className="input-card has-help" {...longPress('Amount Entry', "Enter the amount earned. Numbers fill from right to left (e.g., typing '500' enters $5.00). Note: You cannot enter an amount that would result in a balance below zero.")}>
                  <div className="input-card-top">
                    <div style={{ flex: 1, display: 'flex', flexDirection: 'column', gap: '3px' }}>
                      <div style={{ display: 'flex', alignItems: 'baseline', gap: '8px' }}>
                        <label htmlFor={`inp-${g.id}`}>{g.name}</label>
                        <span className="behavior-indicator has-help" {...longPress('Calculation Style', g.behavior === 'add' ? "'Add' increases your current total by the amount entered." : "'Replace' sets the total for that day to exactly the amount entered.")}>{g.behavior === 'add' ? 'Add' : 'Replace'} <HelpIcon /></span>
                      </div>
                      <div className="daily-stats-row">
                        <span className="daily-total-label">Earned: ${getValueForDate(g.id, inputDateKey).toFixed(2)}</span>
                        {g.miles && (
                          <>
                            <span className="daily-miles-label">Miles: {getMilesForDate(g.id, inputDateKey).toFixed(1)} mi</span>
                            {getMilesForDate(g.id, inputDateKey) > 0 && (
                              <span style={{ fontSize: '10px', opacity: 0.5, marginLeft: 'auto', fontWeight: 600 }}>
                                ${(getValueForDate(g.id, inputDateKey) / getMilesForDate(g.id, inputDateKey)).toFixed(2)}/mi
                              </span>
                            )}
                          </>
                        )}
                      </div>
                      {g.miles && (
                        <div className="gps-track-bar">
                          {isGpsSupported ? (
                            <button
                              className={`gps-btn ${trackingGigId === g.id ? 'active' : ''}`}
                              disabled={!isInputToday && trackingGigId !== g.id}
                              onClick={() => trackingGigId === g.id ? stopTracking(g.id, tripDistance) : startTracking(g.id)}
                              onMouseDown={(e) => e.stopPropagation()}
                              onTouchStart={(e) => e.stopPropagation()}
                            >
                              <i className={`ti ${trackingGigId === g.id ? 'ti-square-rounded-x' : 'ti-player-play'}`}></i>
                              {trackingGigId === g.id ? `Stop Trip: ${tripDistance.toFixed(1)} mi` : 'Start Trip'}
                            </button>
                          ) : (
                            <div className="gps-unavailable">GPS tracking disabled</div>
                          )}
                        </div>
                      )}
                    </div>
                    <div className="input-group">
                      <div className="side-input">
                        {g.miles && (
                          <div className="sub-input">
                            <span className="sub-label">Miles</span>
                            <input type="text" inputMode="decimal" id={`mi-${g.id}`} placeholder="0.0" onInput={handleMilesInput} className={`input ${offendingInputIds.includes(g.id) ? 'offending' : ''}`} autoComplete="off" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} />
                          </div>
                        )}
                        <div className="sub-input">
                          <span className="sub-label">Amount</span>
                          <input type="text" inputMode="numeric" id={`inp-${g.id}`} className={offendingInputIds.includes(g.id) ? 'invalid-input' : ''} placeholder="0.00" onInput={(e) => handleCurrencyInput(e, g.id)} autoComplete="off" onMouseDown={(e) => e.stopPropagation()} onTouchStart={(e) => e.stopPropagation()} />
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              ))}
              <button className="update-btn" onClick={updateTotals} disabled={updateState === 'saving'} style={{
                backgroundColor: updateState === 'saving' ? '#b71c1c' : updateState === 'saved' ? '#1b5e20' : 'var(--accent-bg)',
                color: updateState === 'idle' ? 'var(--accent-text)' : '#fff',
                borderColor: updateState === 'saving' ? '#c62828' : updateState === 'saved' ? '#2e7d32' : 'var(--accent)'
              }}>
                <i className={`ti ${updateState === 'saved' ? 'ti-check' : 'ti-refresh'} ${updateState === 'saving' ? 'animate-spin' : ''}`}></i>
                <span>{updateState === 'saving' ? 'Saving...' : updateState === 'saved' ? 'Saved!' : 'Update'}</span>
              </button>
              <div className="totals-card">
                <div className="totals-header has-help" {...longPress('Cycle Totals', 'Sum total of your earnings for the current pay cycle (e.g. Wed to Tue).')}>Current cycle totals <HelpIcon /></div>
                {gigs.map((g, idx, arr) => (
                  <div key={g.id} className="totals-row" style={{ fontWeight: idx === arr.length - 1 && arr.length > 1 ? 700 : 400 }}>
                    <div style={{ display: 'flex', flexDirection: 'column' }}>
                      <span>{g.name} {!isInCycle(g) && <span style={{ fontSize: '10px', opacity: 0.55 }}>(prev cycle)</span>}</span>
                      {g.miles && (
                        <div style={{ display: 'flex', gap: '8px', alignItems: 'center' }}>
                          <span style={{ fontSize: '11px', opacity: 0.65 }}>{getCycleMilesTotal(g.id).toFixed(1)} mi</span>
                          <span style={{ fontSize: '10px', opacity: 0.45, fontWeight: 600, background: 'var(--bg2)', padding: '1px 4px', borderRadius: '4px' }}>${getCycleEf(g.id).toFixed(2)}/mi</span>
                        </div>
                      )}
                    </div>
                    <span style={{ fontVariantNumeric: 'tabular-nums' }}>${getCycleTotal(g.id).toFixed(2)}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>
      )}

      {currentScreen === 'gigs' && (
        <div className="screen active">
          <div className="section-label-plain has-help" {...longPress('Gig Configuration', 'Customize how your earnings are calculated and tracked for each platform.')}>Configured gigs <HelpIcon /></div>
          {gigs.length === 0 ? <div style={{ padding: '24px 0', textAlign: 'center', fontSize: '13px', opacity: 0.5 }}>No gigs configured yet.</div> : gigs.map(g => (
            <div key={g.id} className="gig-card">
              <div className="gig-card-top">
                <span className="gig-name">{g.name}</span>
                <div className="gig-actions">
                  <button className="icon-btn" onClick={() => { setEditingId(g.id); setFName(g.name); setFBehavior(g.behavior); setFWeekStart(g.weekStart); setFCutoff(g.cutoff); setFMiles(g.miles || false); setModalOpen(true); }}><i className="ti ti-edit"></i></button>
                  <button className="icon-btn danger" onClick={() => { setDeletingId(g.id); setConfirmMsg(`Remove "${g.name}"?`); setConfirmBtnText('Remove'); setConfirmOpen(true); }}><i className="ti ti-trash"></i></button>
                </div>
              </div>
              <div className="gig-meta">
                <span className="badge">{g.behavior === 'add' ? 'Additive' : 'Replace'}</span>
                <span className="badge">Week: {g.weekStart}</span>
                <span className="badge">Cutoff: {g.cutoff === '00:00' ? 'midnight' : g.cutoff}</span>
                {g.miles && <span className="badge" style={{ background: 'var(--total-bg)', color: 'var(--text3)' }}>Miles tracked</span>}
              </div>
            </div>
          ))}
          <button className="add-btn" onClick={() => { setEditingId(null); setFName(''); setFBehavior('replace'); setFWeekStart('Mon'); setFCutoff('00:00'); setFMiles(false); setModalOpen(true); }}><i className="ti ti-plus"></i> Add gig</button>
        </div>
      )}

      {currentScreen === 'report' && (
        <div className="screen active">
          {weekHistory.length === 0 ? <div className="no-weeks-msg"><i className="ti ti-table"></i>No history yet.</div> : (() => {
            const w = weekHistory[weekHistory.length - 1 - reportWeekIndex];
            const payW = getPayWed(dateOnly(new Date(w.startDate))); const payL = `Paid Wed ${fmtShort(payW)}`;
            const groups: any = {}; gigs.forEach((g: any) => { if (!groups[g.weekStart]) groups[g.weekStart] = []; groups[g.weekStart].push(g); });
            return (
              <>
                <div className="report-nav">
                  <button className="report-nav-btn" disabled={reportWeekIndex >= weekHistory.length - 1} onClick={() => setReportWeekIndex(reportWeekIndex + 1)}><i className="ti ti-chevron-left"></i></button>
                  <div className="report-week-label has-help" {...longPress('Pay Weekly Summary', 'This screen shows your earnings grouped by pay schedule.')}>{payL} <HelpIcon /> {!w.exported && <><br /><span className="unexported-badge">Not exported</span></>}</div>
                  <button className="report-nav-btn" disabled={reportWeekIndex <= 0} onClick={() => setReportWeekIndex(reportWeekIndex - 1)}><i className="ti ti-chevron-right"></i></button>
                </div>
                <div className="report-action-row">
                  <button className="report-action-btn has-help" {...longPress('Export Report', 'Download a CSV/Excel file of your earnings for this cycle.')} onClick={() => handleExport(w)}><i className="ti ti-download"></i> Export <HelpIcon /></button>
                  <button className="report-action-btn has-help" style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)', borderColor: 'var(--danger-border)' }} {...longPress('Delete Report', 'Permanently remove this weekly record.')} onClick={() => handleInitiateDeleteWeek(w)}><i className="ti ti-trash"></i> Delete <HelpIcon /></button>
                </div>
                {Object.keys(groups).map(ws => {
                  const items = groups[ws]; const { cycleStart, cycleEnd, dates } = getCycleDates(ws, payW);
                  const colT = new Array(7).fill(0); let grand = 0;
                  return (
                    <div className="cycle-group" key={ws}>
                      <div className="cycle-group-pay">{payL}</div>
                      <div className="cycle-group-range has-help" {...longPress('Schedule Details', 'Gigs in this table follow the same work period and pay cycle.')}>Work: {fmtShort(cycleStart)} – {fmtShort(cycleEnd)} <HelpIcon /></div>
                      <div className="report-table-wrap">
                        <table>
                          <thead>
                            <tr><th>Gig</th>{dates.map(d => <th key={d.getTime()}>{DAY_SHORT[jsToOur(d.getDay())]}<br />{fmtShort(d)}</th>)}<th>Total</th></tr>
                          </thead>
                          <tbody>
                            {items.map((g: any) => {
                              let rT = 0; let rM = 0;
                              return (
                                <React.Fragment key={g.id}>
                                  <tr>
                                    <td>{g.name}</td>
                                    {dates.map((d, i) => {
                                      const v = parseFloat(w.data?.[g.id]?.[fmtDateKey(d)] as any) || 0;
                                      rT = Number((rT + v).toFixed(2)); colT[i] = Number((colT[i] + v).toFixed(2)); grand = Number((grand + v).toFixed(2));
                                      return <td key={d.getTime()} style={{ color: v > 0 ? 'var(--text)' : 'var(--text3)' }}>{v ? '$' + v.toFixed(2) : '-'}</td>;
                                    })}
                                    <td style={{ color: 'var(--accent-text)', fontWeight: 700 }}>${rT.toFixed(2)}</td>
                                  </tr>
                                  {g.miles && (
                                    <>
                                      <tr className="mileage-row">
                                        <td style={{ paddingLeft: '20px', fontStyle: 'italic', color: 'var(--text3)' }}>Miles</td>
                                        {dates.map((d) => { const v = parseFloat(w.miles?.[g.id]?.[fmtDateKey(d)] as any) || 0; rM = Number((rM + v).toFixed(1)); return <td key={d.getTime()} style={{ color: v > 0 ? 'var(--text3)' : 'transparent', fontSize: '11px' }}>{v ? v.toFixed(1) : '0'}</td>; })}
                                        <td style={{ color: 'var(--text3)', fontSize: '11px' }}>{rM.toFixed(1)}</td>
                                      </tr>
                                      <tr className="mileage-row">
                                        <td style={{ paddingLeft: '20px', fontStyle: 'italic', color: 'var(--text3)', opacity: 0.7 }}>$/mi</td>
                                        {dates.map((d) => { const e = parseFloat(w.data?.[g.id]?.[fmtDateKey(d)] as any) || 0; const m = parseFloat(w.miles?.[g.id]?.[fmtDateKey(d)] as any) || 0; return <td key={d.getTime()} style={{ color: 'var(--text3)', opacity: 0.7, fontSize: '10px' }}>{m > 0 ? (e / m).toFixed(2) : '-'}</td>; })}
                                        <td style={{ color: 'var(--text3)', fontSize: '10px', fontWeight: 600 }}>{rM > 0 ? (rT / rM).toFixed(2) : '-'}</td>
                                      </tr>
                                    </>
                                  )}
                                </React.Fragment>
                              );
                            })}
                            <tr style={{ background: 'var(--table-total-bg)' }}><td>Total</td>{colT.map((v, i) => <td key={i} style={{ fontWeight: 700 }}>{v ? '$' + v.toFixed(2) : '-'}</td>)}<td style={{ fontWeight: 700 }}>${grand.toFixed(2)}</td></tr>
                          </tbody>
                        </table>
                      </div>
                    </div>
                  );
                })}
              </>
            );
          })()}
        </div>
      )}

      {currentScreen === 'settings' && (
        <div className="screen active">
          <div className="section-label-plain has-help" {...longPress('Appearance', 'Switch between Light, Dark, or System themes.')}>Display <HelpIcon /></div>
          <div className="settings-row">
            <div><div className="settings-label">Theme</div><div className="settings-sub">App brightness</div></div>
            <div className="seg">{['light', 'auto', 'dark'].map(t => <button key={t} className={theme === t ? 'active' : ''} onClick={() => setThemeState(t)}>{t.charAt(0).toUpperCase() + t.slice(1)}</button>)}</div>
          </div>
          <div className="settings-row" style={{ flexDirection: 'column', alignItems: 'flex-start' }}>
            <div style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px', marginBottom: '12px' }}>
              <div>
                <div className="settings-label">Google Sheets sync</div>
                <div className="settings-sub">Advanced feature for superusers with their own sheet endpoint.</div>
              </div>
              <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '14px' }}>
                <input type="checkbox" checked={sheetSyncEnabled} onChange={e => setSheetSyncEnabled(e.target.checked)} />
                <span>{sheetSyncEnabled ? 'Enabled' : 'Disabled'}</span>
              </label>
            </div>
            <div style={{ width: '100%', marginBottom: '10px' }}>
              <div style={{ marginBottom: '8px' }}><div className="settings-label">Sync endpoint URL</div><div className="settings-sub">Saved locally in this browser; use only your own Sheets sync endpoint.</div></div>
              <input type="text" value={sheetSyncUrl} onChange={e => setSheetSyncUrl(e.target.value)} placeholder="https://your-sheet-sync-endpoint" style={{ width: '100%', maxWidth: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
            </div>
            <div style={{ width: '100%' }}>
              <div style={{ marginBottom: '8px' }}><div className="settings-label">Sync secret</div><div className="settings-sub">Optional token for private Apps Script endpoints.</div></div>
              <input type="text" value={sheetSyncSecret} onChange={e => setSheetSyncSecret(e.target.value)} placeholder="Optional secret token" style={{ width: '100%', maxWidth: '100%', padding: '10px', borderRadius: '8px', border: '1px solid var(--border)', background: 'var(--surface)', color: 'var(--text)' }} />
            </div>
          </div>
          <div className="section-label-plain has-help" {...longPress('Data Management', 'Backup your data to a file or restore it from a previous backup.')}>Backup <HelpIcon /></div>
          <button className="settings-action-btn" onClick={backupToFile}><i className="ti ti-download"></i><div><div className="settings-label">Save to device</div><div className="settings-sub">Download JSON file</div></div></button>
          <button className="settings-action-btn" onClick={() => window.location.href = `mailto:?subject=Backup&body=${encodeURIComponent(JSON.stringify({ version: '1.0', gigs, weekHistory }))}`}><i className="ti ti-mail"></i><div><div className="settings-label">Email backup</div><div className="settings-sub">Send to yourself</div></div></button>
          <button className="settings-action-btn" onClick={() => document.getElementById('res')?.click()}><i className="ti ti-upload"></i><div><div className="settings-label">Restore</div><div className="settings-sub">Load backup file</div></div></button>
          <input type="file" id="res" accept=".json" style={{ display: 'none' }} onChange={handleRestoreFile} />
          <div className="section-label-plain">Support</div>
          <div className="donate-note">Enjoying the beta? Tips help a lot!</div>
          <button className="donate-btn" onClick={() => { const s = Date.now(); window.location.href = VENMO_DEEP; setTimeout(() => { if (Date.now() - s < 1500) window.open(VENMO_WEB, '_blank'); }, 1200); }}><i className="ti ti-heart"></i> Tip via Venmo</button>
        </div>
      )}

      {currentScreen === 'help' && (
        <div className="screen active">
          {HELP_SECTIONS.map(sec => (
            <div key={sec.id} style={{ marginBottom: '24px' }}>
              <div className="section-label-plain">{sec.title}</div>
              <div className="help-card">
                <div className="help-card-title"><i className={`ti ${sec.icon}`}></i>{sec.title}</div>
                <div className="help-card-body">{sec.isStart ? sec.steps.map((s: string, i: number) => <div className="help-start-step" key={i}><div className="help-step-num">{i + 1}</div><span>{s}</span></div>) : sec.body.map((p: string, i: number) => <p key={i}>{p}</p>)}</div>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className={`modal-bg ${modalOpen ? 'open' : ''}`}>
        <div className="modal">
          <h3>{editingId ? 'Edit gig' : 'Add gig'}</h3>
          <div className="field"><label className="has-help" {...longPress('Gig Name', 'The name of the platform or source of income.')}>Name <HelpIcon /></label><input type="text" value={fName} onChange={e => setFName(e.target.value)} /></div>
          <div className="row2">
            <div className="field"><label className="has-help" {...longPress('Calculation Style', "Choose 'Replace' to overwrite the day's total with your new input, or 'Additive' to add your new input to the existing total.")}>Behavior <HelpIcon /></label><select value={fBehavior} onChange={e => setFBehavior(e.target.value)}><option value="replace">Replace</option><option value="add">Additive</option></select></div>
            <div className="field"><label className="has-help" {...longPress('Week Start', 'Select the day your pay cycle begins for this specific platform.')}>Starts <HelpIcon /></label><select value={fWeekStart} onChange={e => setFWeekStart(e.target.value)}>{['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'].map(d => <option key={d} value={d}>{d}</option>)}</select></div>
          </div>
          <div className="field"><label className="has-help" {...longPress('Cutoff Time', 'The time of day when earnings transition from the previous date to the next date.')}>Cutoff <HelpIcon /></label><input type="time" value={fCutoff} onChange={e => setFCutoff(e.target.value)} /></div>
          <div className="field" style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '20px' }}>
            <input type="checkbox" id="track-miles" checked={fMiles} onChange={e => setFMiles(e.target.checked)} style={{ width: 'auto' }} />
            <label htmlFor="track-miles" style={{ margin: 0, fontSize: '14px', color: 'var(--text)' }}>Track mileage for this gig</label>
          </div>
          <div className="modal-actions"><button onClick={() => setModalOpen(false)}>Cancel</button><button onClick={() => {
            const data = { name: fName, behavior: fBehavior, weekStart: fWeekStart, cutoff: fCutoff, miles: fMiles };
            if (editingId) setGigs(prev => prev.map(x => x.id === editingId ? { ...x, ...data } : x)); else setGigs(prev => [...prev, { id: Date.now(), ...data }]);
            setModalOpen(false);
          }}>Save</button></div>
        </div>
      </div>

      <div className={`confirm-bg ${confirmOpen ? 'open' : ''}`}>
        <div className="confirm-box"><p>{confirmMsg}</p><div className="modal-actions">
          {confirmBtnText !== 'OK' && <button onClick={() => setConfirmOpen(false)}>Cancel</button>}
          <button style={{ background: 'var(--danger-bg)', color: 'var(--danger-text)' }} onClick={() => {
            if (pendingRestoreData) {
              if (pendingRestoreData.gigs) setGigs(pendingRestoreData.gigs);
              if (pendingRestoreData.weekHistory) setWeekHistory(pendingRestoreData.weekHistory);
              showNotification('Data restored successfully!', 'success');
              setPendingRestoreData(null);
            } else if (pendingDeleteWeekKey) {
              setWeekHistory(prev => prev.filter(w => w.key !== pendingDeleteWeekKey));
            } else if (deletingId) {
              setGigs(prev => prev.filter(x => x.id !== deletingId));
            }
            setConfirmOpen(false); setDeletingId(null); setPendingDeleteWeekKey(null);
          }}>{confirmBtnText}</button></div></div>
      </div>

      <div className={`modal-bg ${helpModal ? 'open' : ''}`}>
        <div className="modal help-modal">
          <h3>{helpModal?.title}</h3>
          <p style={{ fontSize: '14px', lineHeight: '1.5', margin: '12px 0 20px', color: 'var(--text2)' }}>{helpModal?.body}</p>
          <div className="modal-actions"><button className="primary-btn" onClick={() => setHelpModal(null)}>Got it</button></div>
        </div>
      </div>

      {notification && (
        <div className={`toast-container ${notification.type}`}>
          <i className={`ti ${notification.type === 'success' ? 'ti-check' : notification.type === 'error' ? 'ti-alert-circle' : 'ti-info-circle'}`}></i>
          <span>{notification.msg}</span>
        </div>
      )}
    </div>
  );
}

const SCREENS = [
  { id: 'daily', label: 'Daily input', icon: 'ti-home' },
  { id: 'gigs', label: 'Gig config', icon: 'ti-settings' },
  { id: 'report', label: 'Weekly report', icon: 'ti-table' },
  { id: 'settings', label: 'App settings', icon: 'ti-adjustments-horizontal' },
  { id: 'help', label: 'Help', icon: 'ti-help-circle' }
];

const HELP_SECTIONS = [
  {
    id: 'start', icon: 'ti-player-play', title: 'Getting started', isStart: true, steps: [
      'Open Gig config from the menu and add each gig platform you work for.',
      'For each gig, set whether earnings add on top or replace the previous amount, which day the pay week starts, and what time the platform starts counting a new day.',
      'Go to Daily input, enter your earnings for each gig, and tap Update.',
      'At the end of the week, visit Weekly report to review your earnings and export them as a spreadsheet.',
      'Use App settings to back up all your data to a file or email it to yourself any time.',
      'If you are enjoying the beta, you can leave an optional tip via Venmo in App settings under Support the app.'
    ]
  },
  {
    id: 'daily', icon: 'ti-home', title: 'Daily input', body: [
      'This is the main screen you will use every day. Each gig appears with its name, today\'s running total beneath it, and a box on the right where you type in your new earnings.',
      'If Track mileage is enabled for a gig, you will see a Start Trip button. Tap it to begin tracking your trip via GPS. Tap it again to finish and add the distance to your daily total.',
      'You can also manually enter or correct mileage in the Miles field.',
      'Tap Update when you are done entering earnings. Today\'s total updates instantly, and if Google Sheets sync is enabled, your earnings are also sent to your own Google Sheet.',
      'For gigs set to add: each Update adds your new number on top of what was already entered today. For gigs set to replace: the new number overwrites today\'s previous amount.',
      'Mileage updates are always additive. You can enter negative values to correct over-counted miles, but the total cannot go below zero.',
      'If you accidentally add a wrong amount on an additive gig, type a negative number to correct it — for example, -20 subtracts $20.'
    ]
  },
  {
    id: 'gigs', icon: 'ti-settings', title: 'Gig config', body: [
      'This is where you manage the gig platforms you work for. Tap Add gig to create a new one, or the pencil icon to edit an existing one.',
      'Each gig has four settings: the name of the platform, whether earnings add on top or replace the previous amount, which day the pay week starts, and what time the platform starts counting a new day.',
      'You can also enable Track mileage for any gig. When enabled, a Start Trip button will appear on the daily screen.',
      'Tap the red trash icon to remove a gig. You will be asked to confirm before anything is deleted.'
    ]
  },
  {
    id: 'report', icon: 'ti-table', title: 'Weekly report', body: [
      'The weekly report groups your gigs by pay schedule. Each group shows its exact work period and the Wednesday pay date.',
      'If mileage tracking is enabled for a gig, a Miles row will appear under its earnings.',
      'Use the arrows at the top to browse past weeks. Tap Export to download the week as a spreadsheet file, or Delete to remove a saved week.',
      'Exporting and Deleting are only available once all work days in the cycle have ended.'
    ]
  },
  {
    id: 'settings', icon: 'ti-adjustments-horizontal', title: 'App settings', body: [
      'Use the Theme buttons to switch between Light mode, Dark mode, or Auto.',
      'Under Data backup, you can save a backup file to your device or email it to yourself. To restore from a backup, tap Restore and choose your saved file.',
      'Google Sheets sync is an advanced, opt-in setting for users who want to sync to their own spreadsheet endpoint. Only enable it if you have a private sync URL and tabs named by end-of-cycle date in MM/DD/YY format.',
      'Under Support the app, you can leave an optional tip via Venmo. It is completely voluntary — thank you for being a beta tester!'
    ]
  },
  {
    id: 'gps-tips', icon: 'ti-location', title: 'GPS Tracking Tips', body: [
      'GPS tracking is only available when the Daily Input screen is set to today\'s date.',
      'For best results, keep the app in the foreground while tracking. Mobile browsers often stop GPS when you switch apps or lock your screen.',
      'This app attempts to keep your screen on while a trip is active (supported browsers only).',
      'If you notice missing distance, you can always manually correct the total in the Miles field.'
    ]
  }
];
