// src/pages/SensorMonitoringPage.jsx
import React, { useState, useEffect, useCallback } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../services/api';
import {
    Line
} from 'react-chartjs-2';
import {
    Chart as ChartJS,
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler,
} from 'chart.js';
import {
    ArrowLeft, RefreshCw, Activity, Thermometer, Gauge,
    Wind, Zap, Waves, Radio, Loader2, FileDown,
} from 'lucide-react';
import LoadingState from '../components/LoadingState.jsx';
import ErrorState from '../components/ErrorState.jsx';
import { useSocket } from '../context/useSocket.js';

ChartJS.register(
    CategoryScale, LinearScale, PointElement, LineElement,
    Title, Tooltip, Legend, Filler
);

// Label & satuan untuk setiap field sensor
// `normal` = nilai referensi kondisi sehat (dari preset "normal" di config simulasi)
const FIELD_META = {
    rpm:                 { label: 'RPM',                  unit: 'RPM',    color: '#3B82F6', icon: Zap },
    motor_power:         { label: 'Motor Power',          unit: 'W',      color: '#8B5CF6', icon: Zap },
    // Compressor (CMP-DUMMY-001)
    noise_db:            { label: 'Kebisingan',           unit: 'dB',     color: '#F59E0B', icon: Radio },
    outlet_pressure_bar: { label: 'Tekanan Outlet',       unit: 'bar',    color: '#EF4444', icon: Gauge },
    air_flow:            { label: 'Aliran Udara',         unit: 'm³/h',   color: '#06B6D4', icon: Wind },
    outlet_temp:         { label: 'Suhu Outlet',          unit: '°C',     color: '#F97316', icon: Thermometer },
    wpump_outlet_press:  { label: 'Tekanan Pompa Air',    unit: 'bar',    color: '#10B981', icon: Gauge },
    water_flow:          { label: 'Aliran Air',           unit: 'L/min',  color: '#0EA5E9', icon: Waves },
    gaccx:               { label: 'G-Acc X',              unit: 'g',      color: '#6366F1', icon: Activity },
    gaccz:               { label: 'G-Acc Z',              unit: 'g',      color: '#818CF8', icon: Activity },
    haccz:               { label: 'H-Acc Z',              unit: 'g',      color: '#EC4899', icon: Activity },
    temperature:         { label: 'Suhu',                 unit: '°C',     color: '#F97316', icon: Thermometer },
    vibration:           { label: 'Getaran',              unit: 'mm/s²',  color: '#6366F1', icon: Activity },
    pressure:            { label: 'Tekanan',              unit: 'bar',    color: '#EF4444', icon: Gauge },
    current:             { label: 'Arus',                 unit: 'A',      color: '#F59E0B', icon: Zap },
    voltage:             { label: 'Tegangan',             unit: 'V',      color: '#8B5CF6', icon: Zap },
    torque:              { label: 'Torsi',                unit: 'Nm',     color: '#14B8A6', icon: Zap },
    wpump_power:         { label: 'Daya Pompa Air',       unit: 'W',      color: '#06B6D4', icon: Zap },
    water_inlet_temp:    { label: 'Suhu Masuk Air',       unit: '°C',     color: '#0EA5E9', icon: Thermometer },
    water_outlet_temp:   { label: 'Suhu Keluar Air',      unit: '°C',     color: '#F97316', icon: Thermometer },
    oilpump_power:       { label: 'Daya Pompa Oli',       unit: 'W',      color: '#84CC16', icon: Zap },
    oil_tank_temp:       { label: 'Suhu Tangki Oli',      unit: '°C',     color: '#EAB308', icon: Thermometer },
    // Fitur model Induksi (IND-001)
    active_power_w:      { label: 'Daya Aktif',           unit: 'W',      color: '#8B5CF6', icon: Zap },
    current_a:           { label: 'Arus',                 unit: 'A',      color: '#F59E0B', icon: Zap },
    energy_kwh:          { label: 'Energi',               unit: 'kWh',    color: '#84CC16', icon: Zap },
    temp_c:              { label: 'Suhu',                 unit: '°C',     color: '#F97316', icon: Thermometer },
    voltage_v:           { label: 'Tegangan',             unit: 'V',      color: '#8B5CF6', icon: Zap },
    // Fitur model Forging (FRG-002)
    tekanan_bar:         { label: 'Tekanan Hidrolik',     unit: 'bar',    color: '#EF4444', icon: Gauge },
    vx:                  { label: 'Getaran Sumbu X',      unit: 'mm/s',   color: '#6366F1', icon: Activity },
    vy:                  { label: 'Getaran Sumbu Y',      unit: 'mm/s',   color: '#818CF8', icon: Activity },
    vz:                  { label: 'Getaran Sumbu Z',      unit: 'mm/s',   color: '#A5B4FC', icon: Activity },
    // Fitur model Bubut (BBT-001) — active_power_w, temp_c, vx/vy/vz sudah di atas
    vrms:                { label: 'Getaran Resultan',     unit: 'mm/s',   color: '#7C3AED', icon: Activity },
};

// Nilai referensi kondisi normal per mesin — diambil dari preset "normal"
// di config simulasi (Simulasi/Version 2/simulasi-input data/config.py).
// Hanya 3 mesin yang punya model ML aktif.
const NORMAL_VALUES = {
    'CMP-DUMMY-001': {
        noise_db:    51.50,
        water_flow:  58.11,
        air_flow:    600.0,
        gaccx:       0.5768,
        outlet_temp: 118.28,
    },
    'DRL-001': {
        current_a:      0.834,
        active_power_w: 164.20,
        temp_c:         34.43,
        vx:             16.25,
        vy:             6.975,
        vz:             40.77,
    },
    'BBT-001': {
        active_power_w: 2274.09,
        temp_c:         30.60,
        vx:             2.398,
        vy:             0.775,
        vz:             0.482,
        vrms:           2.566,
    },
};

const HEALTH_COLORS = {
    high:   '#22C55E',
    medium: '#F59E0B',
    low:    '#EF4444',
};

// Jaring pengaman sementara selagi push WebSocket di produksi belum stabil
// (lih. perbaikan Nginx/Gunicorn worker) — bisa dihapus lagi setelah
// dikonfirmasi event sensor_data_update sampai konsisten ke client.
const SENSOR_POLL_MS = 1000;

// Palet & fallback untuk field sensor yang belum terdaftar di FIELD_META
// (mis. sensor dari mesin baru: vx, dy, fz, dll.)
const FALLBACK_PALETTE = [
    '#3B82F6', '#8B5CF6', '#F59E0B', '#EF4444', '#06B6D4',
    '#F97316', '#10B981', '#0EA5E9', '#6366F1', '#EC4899',
];

function hashString(str) {
    let hash = 0;
    for (let i = 0; i < str.length; i++) hash = (hash * 31 + str.charCodeAt(i)) | 0;
    return Math.abs(hash);
}

function humanizeFieldName(field) {
    return field.replace(/_/g, ' ').replace(/\b\w/g, c => c.toUpperCase());
}

function getFieldMeta(field) {
    if (FIELD_META[field]) return FIELD_META[field];
    return {
        label: humanizeFieldName(field),
        unit: '',
        color: FALLBACK_PALETTE[hashString(field) % FALLBACK_PALETTE.length],
        icon: Activity,
    };
}

function fmt(v) {
    if (v === null || v === undefined) return '-';
    return parseFloat(v).toLocaleString('id-ID', { maximumFractionDigits: 2 });
}

function fmtTs(iso) {
    return new Date(iso).toLocaleString('id-ID', {
        day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit',
    });
}

// Bungkus nilai dengan tanda kutip kalau mengandung koma/kutip/baris baru,
// supaya kolom seperti nama aset tidak merusak struktur CSV.
function csvCell(value) {
    const s = value === null || value === undefined ? '' : String(value);
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

function buildSensorCsv(history, fields, assetName) {
    const header = ['Timestamp', 'Asset', 'Health Score (%)', ...fields.map(f => {
        const meta = getFieldMeta(f);
        return meta.unit ? `${meta.label} (${meta.unit})` : meta.label;
    })];

    const rows = history.map(r => {
        const hPct = r.health_score != null ? Math.round(r.health_score * 100) : '';
        return [
            r.timestamp,
            assetName,
            hPct,
            ...fields.map(f => r[f] ?? ''),
        ];
    });

    return [header, ...rows]
        .map(row => row.map(csvCell).join(','))
        .join('\r\n');
}

function downloadCsv(filename, content) {
    // Prefix BOM supaya Excel membaca karakter non-ASCII (mis. nama aset) dengan benar.
    const blob = new Blob(['﻿' + content], { type: 'text/csv;charset=utf-8;' });
    const url  = URL.createObjectURL(blob);
    const a    = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

// ── Chart satu sensor ──────────────────────────────────────────────────────
function SensorChart({ field, history, normalValue }) {
    const meta = getFieldMeta(field);
    const Icon = meta.icon;

    const labels = [...history].reverse().map(r => fmtTs(r.timestamp));
    const values = [...history].reverse().map(r => r[field] ?? null);

    const latest = history[0]?.[field];
    const prev   = history[1]?.[field];
    const delta  = latest != null && prev != null ? latest - prev : null;

    const chartData = {
        labels,
        datasets: [{
            label: `${meta.label} (${meta.unit})`,
            data: values,
            borderColor: meta.color,
            backgroundColor: `${meta.color}18`,
            fill: true,
            tension: 0.4,
            pointRadius: history.length > 30 ? 0 : 3,
            pointHoverRadius: 5,
            borderWidth: 2,
        }],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: {
            legend: { display: false },
            tooltip: {
                callbacks: {
                    label: ctx => `${ctx.parsed.y?.toFixed(3)} ${meta.unit}`,
                },
            },
        },
        scales: {
            x: {
                ticks: { maxTicksLimit: 6, font: { size: 10 } },
                grid: { display: false },
            },
            y: {
                ticks: { font: { size: 10 } },
                grid: { color: '#F1F5F9' },
            },
        },
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg" style={{ backgroundColor: `${meta.color}18` }}>
                        <Icon size={14} style={{ color: meta.color }} />
                    </div>
                    <div>
                        <p className="text-xs font-bold text-slate-700">{meta.label}</p>
                        <p className="text-[10px] text-slate-400">{meta.unit}</p>
                        {normalValue != null && (
                            <p className="text-[10px] text-slate-400">
                                Normal: <span className="font-semibold text-slate-500">{normalValue} {meta.unit}</span>
                            </p>
                        )}
                    </div>
                </div>
                <div className="text-right">
                    <p className="text-lg font-bold text-slate-800">
                        {latest != null ? parseFloat(latest).toFixed(2) : '-'}
                    </p>
                    {delta != null && (
                        <p className={`text-[10px] font-medium ${delta > 0 ? 'text-red-500' : delta < 0 ? 'text-green-500' : 'text-slate-400'}`}>
                            {delta > 0 ? '▲' : delta < 0 ? '▼' : '—'} {Math.abs(delta).toFixed(2)}
                        </p>
                    )}
                </div>
            </div>
            <div className="h-28">
                <Line data={chartData} options={options} />
            </div>
        </div>
    );
}

// ── Health Score Chart ─────────────────────────────────────────────────────
function HealthChart({ history }) {
    const hasAnyHealth = history.some(r => r.health_score != null);
    const labels  = [...history].reverse().map(r => fmtTs(r.timestamp));
    const values  = [...history].reverse().map(r => r.health_score != null ? r.health_score * 100 : null);
    const latest  = history[0]?.health_score;
    const hPct    = latest != null ? Math.round(latest * 100) : null;
    const color   = hPct >= 70 ? HEALTH_COLORS.high : hPct >= 40 ? HEALTH_COLORS.medium : HEALTH_COLORS.low;

    const chartData = {
        labels,
        datasets: [{
            label: 'Health Score (%)',
            data: values,
            borderColor: color,
            backgroundColor: `${color}18`,
            fill: true,
            tension: 0.4,
            pointRadius: history.length > 30 ? 0 : 3,
            borderWidth: 2,
        }],
    };

    const options = {
        responsive: true,
        maintainAspectRatio: false,
        plugins: { legend: { display: false } },
        scales: {
            x: { ticks: { maxTicksLimit: 6, font: { size: 10 } }, grid: { display: false } },
            y: { min: 0, max: 100, ticks: { font: { size: 10 } }, grid: { color: '#F1F5F9' } },
        },
    };

    return (
        <div className="bg-white rounded-xl border border-slate-200 shadow-sm p-4 col-span-full">
            <div className="flex items-center justify-between mb-3">
                <div className="flex items-center gap-2">
                    <div className="p-1.5 rounded-lg bg-green-50">
                        <Activity size={14} className="text-green-600" />
                    </div>
                    <p className="text-xs font-bold text-slate-700">Health Score Keseluruhan</p>
                </div>
                {hPct != null ? (
                    <span className="text-lg font-bold" style={{ color }}>
                        {hPct}%
                    </span>
                ) : (
                    <span className="text-xs font-semibold text-slate-400 italic">
                        Belum ada fitur ML
                    </span>
                )}
            </div>
            {hasAnyHealth ? (
                <div className="h-28">
                    <Line data={chartData} options={options} />
                </div>
            ) : (
                <div className="h-28 flex items-center justify-center text-center px-6">
                    <p className="text-xs text-slate-400">
                        Mesin ini belum memiliki model Machine Learning terdaftar, sehingga health score belum tersedia.
                    </p>
                </div>
            )}
        </div>
    );
}

// ── Tabel riwayat ─────────────────────────────────────────────────────────
function HistoryTable({ history, fields }) {
    return (
        <div className="overflow-x-auto rounded-xl border border-slate-200 shadow-sm">
            <table className="min-w-full text-xs">
                <thead className="bg-slate-50 sticky top-0">
                    <tr>
                        <th className="px-3 py-2.5 text-left font-bold text-slate-500 whitespace-nowrap">Timestamp</th>
                        <th className="px-3 py-2.5 text-center font-bold text-slate-500">Health</th>
                        {fields.map(f => {
                            const meta = getFieldMeta(f);
                            return (
                                <th key={f} className="px-3 py-2.5 text-right font-bold text-slate-500 whitespace-nowrap">
                                    {meta.label}
                                    <span className="font-normal text-slate-400 ml-0.5">
                                        ({meta.unit})
                                    </span>
                                </th>
                            );
                        })}
                    </tr>
                </thead>
                <tbody className="divide-y divide-slate-100 bg-white">
                    {history.map(r => {
                        const hPct = r.health_score != null ? Math.round(r.health_score * 100) : null;
                        const hColor = hPct >= 70 ? 'text-green-700 bg-green-50' : hPct >= 40 ? 'text-amber-700 bg-amber-50' : 'text-red-700 bg-red-50';
                        return (
                            <tr key={r.id} className="hover:bg-slate-50 transition-colors">
                                <td className="px-3 py-2 whitespace-nowrap text-slate-600">{fmtTs(r.timestamp)}</td>
                                <td className="px-3 py-2 text-center">
                                    {hPct != null
                                        ? <span className={`px-1.5 py-0.5 rounded font-bold text-[10px] ${hColor}`}>{hPct}%</span>
                                        : <span className="text-slate-300" title="Belum ada fitur ML">-</span>}
                                </td>
                                {fields.map(f => (
                                    <td key={f} className="px-3 py-2 text-right text-slate-700 font-mono">
                                        {fmt(r[f])}
                                    </td>
                                ))}
                            </tr>
                        );
                    })}
                </tbody>
            </table>
        </div>
    );
}

// ── Main Page ──────────────────────────────────────────────────────────────
export default function SensorMonitoringPage() {
    const { assetId } = useParams();
    const navigate    = useNavigate();

    const [data, setData]         = useState(null);
    const [loading, setLoading]   = useState(true);
    const [error, setError]       = useState(null);
    const [limit, setLimit]       = useState(50);
    const [view, setView]         = useState('chart'); // chart | table
    const [refreshing, setRefreshing] = useState(false);
    const [exporting, setExporting]   = useState(false);
    const { socket } = useSocket();

    const fetchData = useCallback(async (showRefresh = false) => {
        if (showRefresh) setRefreshing(true); else setLoading(true);
        setError(null);
        try {
            const res = await api.get(`/ml/sensor-history/${assetId}?limit=${limit}`);
            setData(res.data);
        } catch (e) {
            setError(e.response?.data?.error || 'Gagal memuat data sensor.');
        } finally {
            setLoading(false);
            setRefreshing(false);
        }
    }, [assetId, limit]);

    useEffect(() => { fetchData(); }, [fetchData]);

    // Polling tiap 5 detik (lihat catatan SENSOR_POLL_MS di atas).
    useEffect(() => {
        const poll = setInterval(() => fetchData(true), SENSOR_POLL_MS);
        return () => clearInterval(poll);
    }, [fetchData]);

    // Refresh otomatis kalau data sensor baru masuk untuk mesin yang sedang dibuka,
    // supaya grafik/tabel tidak perlu di-refresh manual. Pakai showRefresh=true
    // (jalur spinner kecil di tombol) supaya tidak nge-blank seluruh halaman
    // ke <LoadingState /> tiap kali ada data sensor baru masuk.
    useEffect(() => {
        if (!socket) return;
        const handleUpdate = (payload) => {
            if (payload?.machine_id === assetId) fetchData(true);
        };
        socket.on('sensor_data_update', handleUpdate);
        socket.on('machine_alert', handleUpdate);
        return () => {
            socket.off('sensor_data_update', handleUpdate);
            socket.off('machine_alert', handleUpdate);
        };
    }, [socket, assetId, fetchData]);

    if (loading) return <LoadingState />;
    if (error)   return <ErrorState message={error} />;
    if (!data)   return null;

    const { asset_name, history, available_fields, total } = data;

    // Ambil SELURUH riwayat sensor asset ini (bukan cuma yang sedang tampil di
    // layar, yang dibatasi dropdown limit 20/50/100/200) lalu export ke CSV.
    const handleExportCsv = async () => {
        setExporting(true);
        try {
            const res = await api.get(`/ml/sensor-history/${assetId}?limit=all`);
            const full = res.data;
            const csv = buildSensorCsv(full.history, full.available_fields, full.asset_name);
            const safeName = full.asset_name.replace(/[^a-z0-9]+/gi, '-').toLowerCase();
            const today = new Date().toISOString().slice(0, 10);
            downloadCsv(`sensor-data-${safeName}-${today}.csv`, csv);
        } catch (e) {
            setError(e.response?.data?.error || 'Gagal mengekspor data sensor.');
        } finally {
            setExporting(false);
        }
    };

    return (
        <div>
            {/* Header */}
            <div className="flex items-center justify-between mb-6">
                <div className="flex items-center gap-3">
                    <button
                        onClick={() => navigate('/monitoring')}
                        className="p-2 text-slate-500 hover:text-blue-600 hover:bg-blue-50 rounded-lg transition"
                    >
                        <ArrowLeft size={20} />
                    </button>
                    <div>
                        <h1 className="text-2xl font-bold text-slate-900">Monitoring Sensor</h1>
                        <p className="text-slate-500 text-sm mt-0.5">{asset_name}</p>
                    </div>
                </div>
                <div className="flex items-center gap-2">
                    {/* Limit selector */}
                    <select
                        value={limit}
                        onChange={e => setLimit(Number(e.target.value))}
                        className="text-xs border border-slate-200 rounded-lg px-2 py-1.5 text-slate-600 focus:outline-none focus:ring-2 focus:ring-blue-300"
                    >
                        <option value={20}>20 data</option>
                        <option value={50}>50 data</option>
                        <option value={100}>100 data</option>
                        <option value={200}>200 data</option>
                    </select>

                    {/* View toggle */}
                    <div className="flex rounded-lg border border-slate-200 overflow-hidden">
                        {['chart', 'table'].map(v => (
                            <button
                                key={v}
                                onClick={() => setView(v)}
                                className={`px-3 py-1.5 text-xs font-bold transition ${
                                    view === v ? 'bg-blue-600 text-white' : 'bg-white text-slate-600 hover:bg-slate-50'
                                }`}
                            >
                                {v === 'chart' ? 'Grafik' : 'Tabel'}
                            </button>
                        ))}
                    </div>

                    <button
                        onClick={handleExportCsv}
                        disabled={history.length === 0 || exporting}
                        title="Export seluruh riwayat sensor mesin ini, tidak terpengaruh filter jumlah data di atas"
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-white border border-slate-300 text-slate-700 text-xs font-bold rounded-lg hover:bg-slate-50 disabled:opacity-50 disabled:cursor-not-allowed shadow-sm transition"
                    >
                        {exporting
                            ? <Loader2 size={14} className="text-green-600 animate-spin" />
                            : <FileDown size={14} className="text-green-600" />}
                        {exporting ? 'Mengekspor…' : 'Export Semua CSV'}
                    </button>

                    <button
                        onClick={() => fetchData(true)}
                        disabled={refreshing}
                        className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-blue-600 text-white text-xs font-bold rounded-lg hover:bg-blue-700 disabled:opacity-50 transition"
                    >
                        {refreshing ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
                        Refresh
                    </button>
                </div>
            </div>

            {/* Info bar */}
            <div className="flex items-center gap-4 mb-5 text-xs text-slate-500">
                <span><span className="font-bold text-slate-700">{total}</span> data ditampilkan</span>
                <span>·</span>
                <span><span className="font-bold text-slate-700">{available_fields.length}</span> sensor aktif</span>
                {history[0] && (
                    <>
                        <span>·</span>
                        <span>Terbaru: <span className="font-bold text-slate-700">{fmtTs(history[0].timestamp)}</span></span>
                    </>
                )}
            </div>

            {history.length === 0 ? (
                <div className="bg-white rounded-xl border border-slate-200 p-16 text-center">
                    <Activity size={40} className="mx-auto text-slate-300 mb-3" />
                    <p className="text-slate-500 font-medium">Belum ada data sensor untuk mesin ini.</p>
                </div>
            ) : view === 'chart' ? (
                <div className="grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
                    <HealthChart history={history} />
                    {available_fields.map(f => (
                        <SensorChart key={f} field={f} history={history} normalValue={NORMAL_VALUES[assetId]?.[f] ?? null} />
                    ))}
                </div>
            ) : (
                <HistoryTable history={history} fields={available_fields} />
            )}
        </div>
    );
}
