// src/components/NotificationDropdown.jsx
import React, { useState, useEffect, useRef, useCallback } from 'react';
import api from '../services/api';
import { Bell, CalendarClock, ShieldCheck, Loader2, X, AlertTriangle, Activity, Award } from 'lucide-react';
import { Link } from 'react-router-dom';
import MLNotificationDetailModal from './MLNotificationDetailModal';
import { useSocket } from '../context/useSocket.js';

const RISK_BADGE = {
  critical: 'bg-rose-100 text-rose-700',
  high:     'bg-red-100 text-red-700',
  medium:   'bg-orange-100 text-orange-700',
  low:      'bg-yellow-100 text-yellow-700',
  very_low: 'bg-green-100 text-green-700',
};

// Jadwal perawatan (H-3, overdue, dst) berubah murni karena waktu berjalan,
// bukan karena ada aksi tulis di backend — jadi tidak ada event WebSocket
// yang bisa dipicu untuknya. Polling ringan ini jadi satu-satunya jalur
// update untuk notif jenis itu. Notif predictive (ML) & verifikasi WO tetap
// full real-time lewat WebSocket (lihat efek 'machine_alert'/'verification_needed'
// di bawah) — polling ini cuma jaring pengaman tambahan untuk keduanya.
const SCHEDULE_POLL_MS = 5 * 60 * 1000;

// Compound tracking key:
// - ML predictive : id + risk_level + tanggal → eskalasi risk ATAU risiko
//   masih sama tapi sudah ganti hari = notif baru lagi. Tanpa bucket tanggal,
//   mesin yang risk_level-nya persisten (mis. data sensor sudah lama tidak
//   update) hanya akan memicu badge unread SEKALI seumur hidup, lalu diam
//   selamanya walau health-nya tetap rendah — pola ini menyamakan perilakunya
//   dengan notif jadwal overdue di bawah, yang memang didesain re-arm harian.
// - Jadwal overdue: id + days_left   → update tiap hari jika belum dikerjakan
// - Jadwal upcoming/today: id + status → hanya sekali
// - Kalibrasi (H-7): sama seperti jadwal di atas — id + days_left/status
// - Verifikasi WO : id saja
const getTrackingKey = (notif) => {
  if (notif.type === 'predictive') {
    const today = new Date().toISOString().slice(0, 10);
    return `${notif.id}:${notif.risk_level}:${today}`;
  }
  if (notif.type === 'schedule' || notif.type === 'calibration') {
    const d = notif.daysLeft;
    if (d < 0)  return `${notif.id}:overdue:${d}`;
    if (d === 0) return `${notif.id}:today`;
    return `${notif.id}:upcoming`;
  }
  return notif.id;
};

export default function NotificationDropdown() {
  const [isOpen, setIsOpen]               = useState(false);
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading]             = useState(false);
  const [unreadCount, setUnreadCount]     = useState(0);
  const [selectedNotif, setSelectedNotif] = useState(null);

  const dropdownRef = useRef(null);
  const { socket } = useSocket();

  // Apakah dropdown sedang terbuka — diakses dari dalam async callback
  const isOpenRef = useRef(false);
  useEffect(() => { isOpenRef.current = isOpen; }, [isOpen]);

  // Kunci notifikasi yang sudah dilihat user (persist localStorage)
  const seenKeys = useRef(
    new Set(JSON.parse(localStorage.getItem('cmms_seen_notif_keys') || '[]'))
  );

  const persistSeen = () => {
    localStorage.setItem('cmms_seen_notif_keys', JSON.stringify([...seenKeys.current]));
  };

  // Tandai daftar notif sebagai sudah dibaca
  const markAsSeen = useCallback((list) => {
    list.forEach(n => seenKeys.current.add(getTrackingKey(n)));
    persistSeen();
    setUnreadCount(0);
  }, []);

  // ------------------------------------------------------------------
  // Fetch notifikasi — dipanggil oleh polling interval & buka dropdown
  // showLoading : tampilkan spinner di dalam dropdown
  // ------------------------------------------------------------------
  const fetchNotifications = useCallback(async (showLoading = false) => {
    if (showLoading) setLoading(true);
    try {
      const response = await api.get('/dashboard/stats');
      const data     = response.data;
      const newNotifs = [];

      // 1. Jadwal mendekati / terlewat
      if (data.upcoming_schedules) {
        data.upcoming_schedules.forEach(sch => {
          const daysLeft = sch.days_left;
          const msg = daysLeft < 0
            ? `${sch.task_name} pada ${sch.asset_name} sudah terlewat ${Math.abs(daysLeft)} hari.`
            : daysLeft === 0
              ? `${sch.task_name} pada ${sch.asset_name} jatuh tempo hari ini.`
              : `${sch.task_name} pada ${sch.asset_name} jatuh tempo dalam ${daysLeft} hari.`;
          newNotifs.push({
            id:       `sch-${sch.id}`,
            type:     'schedule',
            title:    daysLeft < 0 ? 'Jadwal Perawatan Terlewat' : 'Jadwal Perawatan Dekat',
            message:  msg,
            link:     '/schedules',
            priority: daysLeft < 0 || sch.priority === 'high' ? 'high' : 'medium',
            date:     sch.due_date,
            daysLeft,
          });
        });
      }

      // 2. Work order butuh verifikasi
      if (data.verification_needed_list) {
        data.verification_needed_list.forEach(wo => {
          newNotifs.push({
            id:       `verif-${wo.id}`,
            type:     'verification',
            title:    'Work Order Butuh Verifikasi',
            message:  `${wo.title} pada ${wo.asset_name} menunggu verifikasi.`,
            link:     '/work-orders',
            priority: 'medium',
            date:     wo.completed_at,
          });
        });
      }

      // 3. Predictive maintenance (ML)
      if (data.predictive_maintenance_notifications) {
        data.predictive_maintenance_notifications.forEach(pred => {
          newNotifs.push({
            id:                  pred.id,
            type:                'predictive',
            title:               pred.title,
            asset_id:            pred.asset_id,
            machine_id:          pred.machine_id,
            asset_name:          pred.asset_name,
            message:             pred.message,
            recommendation:      pred.recommendation,
            link:                pred.link,
            priority:            pred.priority,
            date:                pred.due_date,
            predicted_days:      pred.predicted_days,
            failure_probability: pred.failure_probability,
            health_score:        pred.health_score,
            overall_health_score: pred.overall_health_score,
            risk_level:          pred.risk_level,
            faulty_components:   pred.faulty_components,
          });
        });
      }

      // 4. Kalibrasi mendekati/terlewat jatuh tempo (H-7, pola sama dengan
      // jadwal perawatan di poin 1 — lih. dashboard_routes.get_dashboard_stats)
      if (data.calibration_notifications) {
        data.calibration_notifications.forEach(calib => {
          newNotifs.push({
            id:       calib.id,
            type:     'calibration',
            title:    calib.title,
            message:  calib.message,
            link:     calib.link,
            priority: calib.priority,
            date:     calib.date,
            daysLeft: calib.daysLeft,
          });
        });
      }

      // Urutkan: notifikasi terbaru (tanggal paling baru) tampil di atas
      newNotifs.sort((a, b) => new Date(b.date || 0).getTime() - new Date(a.date || 0).getTime());

      // --- Hitung kunci saat ini ---
      const currentKeySet = new Set(newNotifs.map(n => getTrackingKey(n)));

      // Bersihkan seenKeys yang sudah tidak ada di notif aktif
      // (misal: notif selesai dikerjakan, atau prediksi sudah aman)
      const prunedSeen = new Set([...seenKeys.current].filter(k => currentKeySet.has(k)));
      seenKeys.current = prunedSeen;
      persistSeen();

      // Selalu update notifications agar data terbaru (termasuk field baru) selalu tersedia
      setNotifications(newNotifs);

      // Hitung unread: notif yang kunci-nya belum ada di seenKeys
      const unread = newNotifs.filter(n => !seenKeys.current.has(getTrackingKey(n)));
      setUnreadCount(unread.length);

    } catch (err) {
      console.error('Gagal memuat notifikasi:', err);
    }
    if (showLoading) setLoading(false);
  }, []);

  // ------------------------------------------------------------------
  // Mount: fetch awal + polling ringan (jaring pengaman jadwal — lihat
  // catatan SCHEDULE_POLL_MS di atas).
  // ------------------------------------------------------------------
  useEffect(() => {
    fetchNotifications(false);
    const poll = setInterval(() => fetchNotifications(false), SCHEDULE_POLL_MS);
    return () => clearInterval(poll);
  }, [fetchNotifications]);

  // Notif predictive (ML) & verifikasi WO: real-time lewat WebSocket, tanpa
  // menunggu siklus polling. Juga refetch saat socket reconnect setelah
  // sempat putus — jaring pengaman untuk event yang mungkin terlewat selama
  // disconnect (socket.io tidak me-replay event yang di-emit saat client
  // sedang putus).
  useEffect(() => {
    if (!socket) return;
    const handleUpdate = () => fetchNotifications(false);
    socket.on('machine_alert', handleUpdate);
    socket.on('verification_needed', handleUpdate);
    socket.on('connect', handleUpdate);
    return () => {
      socket.off('machine_alert', handleUpdate);
      socket.off('verification_needed', handleUpdate);
      socket.off('connect', handleUpdate);
    };
  }, [socket, fetchNotifications]);

  // Tutup dropdown saat klik di luar
  useEffect(() => {
    const handleOutside = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        // Tutup dropdown → mark semua yang tampil sebagai sudah dibaca
        if (isOpenRef.current) {
          setIsOpen(false);
          setNotifications(prev => { markAsSeen(prev); return prev; });
        }
      }
    };
    document.addEventListener('mousedown', handleOutside);
    return () => document.removeEventListener('mousedown', handleOutside);
  }, [markAsSeen]);

  // ------------------------------------------------------------------
  // Toggle dropdown
  // BUKA  → fetch data fresh (tampilkan unread highlight, belum mark seen)
  // TUTUP → baru mark semua yang tampil sebagai sudah dibaca
  // ------------------------------------------------------------------
  const toggleDropdown = () => {
    const opening = !isOpen;
    setIsOpen(opening);
    if (opening) {
      // Fetch fresh — jangan mark seen dulu, biar user lihat highlight unread
      fetchNotifications(true);
    } else {
      // Tutup → sekarang baru mark seen
      markAsSeen(notifications);
    }
  };

  // ------------------------------------------------------------------
  // Render
  // ------------------------------------------------------------------
  return (
    <>
      <div className="relative" ref={dropdownRef}>

        {/* Tombol Lonceng */}
        <button
          onClick={toggleDropdown}
          className="p-2 text-slate-400 hover:text-blue-600 hover:bg-blue-50 rounded-full transition relative focus:outline-none"
          title="Notifikasi"
        >
          <Bell size={20} />
          {unreadCount > 0 && (
            <span className="absolute top-1.5 right-1.5 flex h-2.5 w-2.5">
              <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-red-400 opacity-75" />
              <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-red-500 border-2 border-white" />
            </span>
          )}
        </button>

        {/* Dropdown Panel */}
        {isOpen && (
          <div className="absolute right-0 mt-2 w-80 md:w-96 bg-white rounded-xl shadow-2xl border border-slate-100 overflow-hidden z-50 animate-in fade-in zoom-in-95 duration-200 origin-top-right">

            {/* Header */}
            <div className="px-4 py-3 border-b border-slate-100 flex justify-between items-center bg-slate-50">
              <div className="flex items-center gap-2">
                <h3 className="font-bold text-slate-700 text-sm">Notifikasi</h3>
                {notifications.length > 0 && (
                  <span className="text-[11px] bg-slate-200 text-slate-600 px-2 py-0.5 rounded-full font-medium">
                    {notifications.length}
                  </span>
                )}
                {unreadCount > 0 && (
                  <span className="text-[11px] bg-red-100 text-red-600 px-2 py-0.5 rounded-full font-bold">
                    {unreadCount} baru
                  </span>
                )}
              </div>
              <button
                onClick={() => { setIsOpen(false); markAsSeen(notifications); }}
                className="text-slate-400 hover:text-slate-600"
              >
                <X size={16} />
              </button>
            </div>

            {/* List Notifikasi */}
            <div className="max-h-80 overflow-y-auto custom-scrollbar">
              {loading ? (
                <div className="p-8 flex justify-center">
                  <Loader2 className="animate-spin text-slate-300" />
                </div>
              ) : notifications.length === 0 ? (
                <div className="p-8 text-center text-slate-500 text-sm">
                  Tidak ada notifikasi aktif.
                </div>
              ) : (
                <div className="divide-y divide-slate-50">
                  {notifications.map((notif) => {
                    const isPredictive = notif.type === 'predictive';
                    const trackKey     = getTrackingKey(notif);
                    const isUnread     = !seenKeys.current.has(trackKey);

                    const Wrapper     = isPredictive ? 'div' : Link;
                    const wrapperProps = isPredictive
                      ? {
                          role: 'button', tabIndex: 0,
                          onClick:   () => { setSelectedNotif(notif); setIsOpen(false); markAsSeen(notifications); },
                          onKeyDown: (e) => e.key === 'Enter' && (setSelectedNotif(notif), setIsOpen(false), markAsSeen(notifications)),
                        }
                      : { to: notif.link, onClick: () => { setIsOpen(false); markAsSeen(notifications); } };

                    return (
                      <Wrapper
                        key={trackKey}
                        {...wrapperProps}
                        className={`block p-4 transition-colors cursor-pointer ${
                          isUnread ? 'bg-blue-50/60 hover:bg-blue-50' : 'hover:bg-slate-50'
                        }`}
                      >
                        <div className="flex gap-3">
                          {/* Icon + titik biru jika belum dibaca */}
                          <div className="relative shrink-0 mt-0.5">
                            {isUnread && (
                              <span className="absolute -top-0.5 -right-0.5 h-2 w-2 rounded-full bg-blue-500 border border-white z-10" />
                            )}
                            <div className={`p-2 rounded-full ${
                              notif.type === 'verification' ? 'bg-purple-100 text-purple-600' :
                              notif.type === 'predictive'   ? 'bg-red-100 text-red-600' :
                              notif.type === 'calibration'  ? 'bg-violet-100 text-violet-700' :
                              notif.priority === 'high'     ? 'bg-orange-100 text-orange-600' :
                              'bg-blue-100 text-blue-600'
                            }`}>
                              {notif.type === 'verification' ? <ShieldCheck size={14} /> :
                               notif.type === 'predictive'   ? <Activity size={14} /> :
                               notif.type === 'calibration'  ? <Award size={14} /> :
                               notif.priority === 'high'     ? <AlertTriangle size={14} /> :
                               <CalendarClock size={14} />}
                            </div>
                          </div>

                          <div className="flex-1 min-w-0">
                            <div className="flex items-start justify-between gap-2">
                              <p className={`text-xs font-bold leading-snug ${
                                notif.priority === 'critical' || notif.priority === 'high'
                                  ? 'text-red-600' : 'text-slate-700'
                              }`}>
                                {notif.title}
                              </p>
                              {isPredictive && notif.risk_level && (
                                <span className={`shrink-0 text-[10px] font-bold px-1.5 py-0.5 rounded ${RISK_BADGE[notif.risk_level] || RISK_BADGE.very_low}`}>
                                  {notif.risk_level}
                                </span>
                              )}
                            </div>

                            <p className="text-[11px] text-slate-500 font-medium mt-0.5">
                              {notif.asset_name || notif.message}
                            </p>

                            {isPredictive && notif.faulty_components?.length > 0 && (
                              <div className="flex flex-wrap gap-1 mt-1.5">
                                {notif.faulty_components.map((c) => (
                                  <span
                                    key={c.key}
                                    className={`text-[10px] font-semibold px-1.5 py-0.5 rounded border ${RISK_BADGE[c.risk_level] || RISK_BADGE.very_low}`}
                                  >
                                    {c.label} · {c.prediction} · {Math.round((c.health_score ?? 0) * 100)}%
                                  </span>
                                ))}
                              </div>
                            )}

                            {isPredictive && notif.recommendation && (
                              <p className="text-[10px] text-slate-600 mt-1.5 leading-relaxed italic">
                                {notif.recommendation}
                              </p>
                            )}

                            {!isPredictive && (
                              <p className="text-[11px] text-slate-600 mt-0.5 leading-relaxed">
                                {notif.message}
                              </p>
                            )}

                            <p className="text-[10px] text-slate-400 mt-1">
                              {isPredictive && notif.predicted_days !== undefined
                                ? `Health ${Math.round((notif.overall_health_score ?? notif.health_score ?? 0) * 100)}% · ${notif.predicted_days === 0 ? 'Tindakan segera' : `${notif.predicted_days} hari lagi`} · Klik untuk detail`
                                : 'Klik untuk melihat detail'}
                            </p>
                          </div>
                        </div>
                      </Wrapper>
                    );
                  })}
                </div>
              )}
            </div>

            {/* Footer */}
            <div className="px-4 py-2 bg-slate-50 border-t border-slate-100 text-center">
              <Link
                to="/dashboard"
                onClick={() => { setIsOpen(false); markAsSeen(notifications); }}
                className="text-xs font-bold text-blue-600 hover:underline"
              >
                Lihat Dashboard Lengkap
              </Link>
            </div>
          </div>
        )}
      </div>

      {/* Modal detail ML */}
      {selectedNotif && (
        <MLNotificationDetailModal
          notification={selectedNotif}
          onClose={() => setSelectedNotif(null)}
        />
      )}
    </>
  );
}
