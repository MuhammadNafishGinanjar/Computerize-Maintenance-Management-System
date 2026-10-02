// src/pages/ComplianceForm.jsx
import React, { useState } from 'react';
import api from '../services/api';
import { Plus, Loader2, Shield, Calendar } from 'lucide-react';

export default function ComplianceForm({ assets, onLogCreated }) {
  const [assetId, setAssetId] = useState('');
  const [regulationName, setRegulationName] = useState('');
  const [nextCheckDue, setNextCheckDue] = useState('');
  const [status, setStatus] = useState('pending');
  const [certificateImage, setCertificateImage] = useState(null);

  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  const resetForm = () => {
    setAssetId(''); setRegulationName(''); setNextCheckDue(''); setStatus('pending');
    setCertificateImage(null);
  };

  const handleCertificateFileChange = (e) => {
    const file = e.target.files[0];
    if (file) {
      const reader = new FileReader();
      reader.onloadend = () => setCertificateImage(reader.result);
      reader.readAsDataURL(file);
    } else {
      setCertificateImage(null);
    }
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!assetId || !regulationName || !nextCheckDue) { setError("Data wajib diisi."); return; }
    if (status === 'compliant' && !certificateImage) { setError("Sertifikat wajib diupload untuk status Compliant."); return; }

    setError(null); setSuccess(null); setIsSubmitting(true);

    try {
      const payload = {
        asset_id: assetId, regulation_name: regulationName, next_check_due: nextCheckDue, status: status,
      };
      if (status === 'compliant') payload.certificate_image = certificateImage;
      const response = await api.post('/compliance/logs', payload);
      onLogCreated(response.data); 
      setSuccess(`Log "${response.data.regulation_name}" berhasil dicatat.`);
      resetForm();
    } catch (err) {
      setError(err.response?.data?.error || "Gagal mencatat log.");
    }
    setIsSubmitting(false);
  };

  return (
      <form onSubmit={handleSubmit} className="space-y-5">
        {error && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
        {success && <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm">{success}</div>}

        <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
          {/* Mesin */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Pilih Mesin (Aset) *</label>
            <select
              value={assetId}
              onChange={e => setAssetId(e.target.value)}
              required
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="">-- Pilih Mesin --</option>
              {assets.map(asset => (
                <option key={asset.id} value={asset.id}>{asset.name} (ID: {asset.machine_id})</option>
              ))}
            </select>
          </div>

          {/* Regulasi */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Nama Regulasi/Standar *</label>
            <div className="relative">
                <Shield className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                <input
                type="text"
                value={regulationName}
                onChange={e => setRegulationName(e.target.value)}
                placeholder="Contoh: Kalibrasi ISO 9001"
                required
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
          </div>

          {/* Tanggal */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Jatuh Tempo *</label>
            <div className="relative">
                <Calendar className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" size={16}/>
                <input
                type="date"
                value={nextCheckDue}
                onChange={e => setNextCheckDue(e.target.value)}
                required
                className="w-full pl-9 pr-3 py-2.5 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
                />
            </div>
          </div>

          {/* Status */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">Status Awal</label>
            <select
              value={status}
              onChange={e => setStatus(e.target.value)}
              className="w-full px-3 py-2.5 border border-slate-300 rounded-lg focus:ring-blue-500 focus:border-blue-500"
            >
              <option value="pending">Pending (Menunggu)</option>
              <option value="compliant">Compliant (Sesuai)</option>
              <option value="overdue">Overdue (Terlambat)</option>
            </select>
          </div>

          {/* Sertifikat (wajib bila status Compliant) */}
          {status === 'compliant' && (
            <div className="md:col-span-2">
              <label className="block text-sm font-medium text-slate-700 mb-1">Upload Sertifikat *</label>
              <input
                type="file"
                accept="image/*,application/pdf"
                onChange={handleCertificateFileChange}
                required
                className="w-full text-sm border border-slate-300 rounded-lg px-3 py-2 focus:ring-blue-500 focus:border-blue-500"
              />
              {certificateImage && (
                <p className="text-xs text-green-600 mt-1">File siap diunggah.</p>
              )}
            </div>
          )}
        </div>

        <div className="text-right pt-2">
          <button 
            type="submit" 
            disabled={isSubmitting}
            className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-bold rounded-lg shadow-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-transform hover:-translate-y-0.5"
          >
            {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Plus className="mr-2 h-4 w-4" />}
            Simpan Log
          </button>
        </div>
      </form>
  );
}