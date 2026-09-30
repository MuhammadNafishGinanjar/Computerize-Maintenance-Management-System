// src/pages/AssetForm.jsx
import React, { useState, useEffect } from 'react';
import api from '../services/api';
import { Plus, Loader2, Box, Hash, MapPin, List, Save, Image as ImageIcon, Activity } from 'lucide-react';
import LoadingState from '../components/LoadingState.jsx';

export default function AssetForm({ onAssetCreated, initialData, onAssetUpdated, onClose }) {
  const isEditMode = !!initialData;

  // State Form
  const [name, setName] = useState(initialData?.name || "");
  const [machineId, setMachineId] = useState(initialData?.machine_id || "");
  const [location, setLocation] = useState(initialData?.location || "");
  const [status, setStatus] = useState(initialData?.status || "running"); // Tambahkan State Status
  
  // State Gambar
  const [imagePreview, setImagePreview] = useState(initialData?.image || null);
  const [imageBase64, setImageBase64] = useState(initialData?.image || null);

  const [allComponents, setAllComponents] = useState([]); 
  const [allTemplates, setAllTemplates] = useState([]); 
  const [selectedTemplateId, setSelectedTemplateId] = useState(""); 
  
  // Inisialisasi checkbox
  const [selectedComponentIds, setSelectedComponentIds] = useState(() => {
      if (initialData && initialData.components) {
          return new Set(initialData.components.map(c => c.id));
      }
      return new Set();
  });
  
  const [loading, setLoading] = useState(true); 
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);
  const [isSubmitting, setIsSubmitting] = useState(false);

  // Fetch Data
  useEffect(() => {
    const fetchInitialData = async () => {
      setLoading(true);
      setError(null);
      try {
        const [compRes, templateRes] = await Promise.all([
          api.get('/inventory/components'),
          api.get('/templates')
        ]);
        setAllComponents(compRes.data);
        setAllTemplates(templateRes.data);
      } catch (err) {
        console.error(err);
        setError("Gagal memuat data server.");
      }
      setLoading(false);
    };
    fetchInitialData();
  }, []);

  // Template Logic
  useEffect(() => {
    if (selectedTemplateId === "") {
       // eslint-disable-next-line react-hooks/set-state-in-effect
       if (!isEditMode) setSelectedComponentIds(new Set()); 
    } else {
      const template = allTemplates.find(t => t.id === selectedTemplateId);
      if (template) {
        setSelectedComponentIds(new Set(template.component_ids));
      }
    }
  }, [selectedTemplateId, allTemplates, isEditMode]);

  // Handle Image Upload
  const handleImageChange = (e) => {
    const file = e.target.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onloadend = () => {
            setImageBase64(reader.result);
            setImagePreview(reader.result);
        };
        reader.readAsDataURL(file);
    }
  };

  const handleComponentChange = (componentId) => {
    setSelectedTemplateId(""); 
    setSelectedComponentIds(prevIds => {
      const newIds = new Set(prevIds);
      if (newIds.has(componentId)) newIds.delete(componentId);
      else newIds.add(componentId);
      return newIds;
    });
  };

  const resetForm = () => {
    setName(""); setMachineId(""); setLocation(""); setStatus("running");
    setSelectedTemplateId(""); setSelectedComponentIds(new Set());
    setImagePreview(null); setImageBase64(null);
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError(null);
    setSuccess(null);
    setIsSubmitting(true);

    const assetData = {
      name: name,
      machine_id: machineId,
      location: location,
      status: status, // Kirim Status ke API
      image: imageBase64, 
      component_ids: Array.from(selectedComponentIds) 
    };

    try {
      let response;
      if (isEditMode) {
        response = await api.patch(`/assets/${initialData.id}`, assetData);
        onAssetUpdated(response.data);
        onClose();
      } else {
        response = await api.post('/assets', assetData);
        onAssetCreated(response.data); 
        setSuccess(`Aset "${response.data.name}" berhasil disimpan.`);
        resetForm();
      }
    } catch (err) {
      setError(err.response?.data?.error || `Gagal ${isEditMode ? 'mengupdate' : 'menyimpan'} aset.`);
    }
    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-5">
      {error && <div className="p-3 bg-red-100 text-red-700 rounded-md text-sm">{error}</div>}
      {success && <div className="p-3 bg-green-100 text-green-700 rounded-md text-sm">{success}</div>}
      
      {/* Template Select */}
      <div className="bg-blue-50 p-4 rounded-lg border border-blue-100">
        <label htmlFor="templateSelect" className="block text-sm font-bold text-blue-800 mb-1">
            Cara Cepat: Pilih Tipe Aset (Template)
        </label>
        <div className="relative">
            <List className="absolute left-3 top-1/2 transform -translate-y-1/2 text-blue-400" size={18} />
            <select
                id="templateSelect"
                value={selectedTemplateId}
                onChange={e => setSelectedTemplateId(e.target.value)}
                disabled={loading}
                className="w-full pl-10 pr-3 py-2 border border-blue-300 rounded-md shadow-sm focus:ring-blue-500 focus:border-blue-500 text-sm bg-white"
            >
                <option value="">-- Pilih Manual / Kosong --</option>
                {allTemplates.map(template => (
                <option key={template.id} value={template.id}>
                    {template.name} ({template.component_ids.length} komponen)
                </option>
                ))}
            </select>
        </div>
      </div>

      {/* Input Aset Dasar */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {/* Nama Mesin */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Nama Mesin *</label>
          <div className="relative">
             <Box size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
             <input type="text" value={name} onChange={e => setName(e.target.value)} placeholder="Press Stamping 400 Ton" required className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition-colors"/>
          </div>
        </div>
        
        {/* ID Mesin */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">ID Mesin (Unik) *</label>
           <div className="relative">
             <Hash size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
             <input type="text" value={machineId} onChange={e => setMachineId(e.target.value)} placeholder="PST-001" required className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition-colors"/>
          </div>
        </div>
        
        {/* Lokasi */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Lokasi</label>
           <div className="relative">
             <MapPin size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
             <input type="text" value={location} onChange={e => setLocation(e.target.value)} placeholder="Area Stamping" className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition-colors"/>
          </div>
        </div>

        {/* STATUS MESIN */}
        <div>
          <label className="block text-sm font-medium text-slate-700 mb-1">Status Mesin</label>
           <div className="relative">
             <Activity size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"/>
             <select
                value={status}
                onChange={e => setStatus(e.target.value)}
                className="w-full pl-9 pr-3 py-2 border border-slate-300 rounded-md focus:ring-blue-500 focus:border-blue-500 transition-colors appearance-none font-medium bg-white"
             >
                 <option value="running">Beroperasi (Running)</option>
                 <option value="idle">Standby (Idle)</option>
                 <option value="breakdown">Gangguan (Breakdown)</option>
                 <option value="maintenance">Perawatan (Maintenance)</option>
                 <option value="warning">Peringatan (Warning)</option>
                 <option value="off">Tidak Aktif (Off)</option>
             </select>
          </div>
        </div>
      </div>

      {/* Upload Gambar */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Foto Mesin (Opsional)</label>
        <div className="flex items-center gap-4">
            {imagePreview ? (
                <img src={imagePreview} alt="Preview Mesin" className="h-20 w-20 object-cover rounded-lg border shadow-sm" />
            ) : (
                <div className="h-20 w-20 bg-slate-100 rounded-lg border border-dashed border-slate-300 flex items-center justify-center text-slate-400">
                    <ImageIcon size={24} />
                </div>
            )}
            <label className="cursor-pointer inline-flex items-center px-4 py-2 border border-slate-300 rounded-md shadow-sm text-sm font-medium text-slate-700 bg-white hover:bg-slate-50 transition-colors">
                <ImageIcon size={18} className="mr-2"/> {imagePreview ? "Ganti Foto" : "Upload Foto"}
                <input type="file" className="hidden" accept="image/*" onChange={handleImageChange} />
            </label>
        </div>
      </div>
      
      {/* Pilihan Komponen */}
      <div>
        <label className="block text-sm font-medium text-slate-700 mb-2">Komponen Terpasang (Bill of Materials) *</label>
        {loading ? (
          <LoadingState />
        ) : allComponents.length === 0 ? (
          <p className="text-sm text-slate-500 italic">Data komponen kosong.</p>
        ) : (
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3 max-h-60 overflow-y-auto p-3 border border-slate-200 rounded-lg bg-slate-50">
            {allComponents.map(comp => (
              <label key={comp.id} className="flex items-start space-x-2 p-2 rounded hover:bg-white hover:shadow-sm transition-all cursor-pointer border border-transparent hover:border-slate-200">
                <input
                  type="checkbox"
                  checked={selectedComponentIds.has(comp.id)}
                  onChange={() => handleComponentChange(comp.id)}
                  className="mt-1 h-4 w-4 text-blue-600 border-slate-300 rounded focus:ring-blue-500"
                />
                <div className="text-xs">
                    <span className="font-medium text-slate-700 block">{comp.name}</span>
                    <span className="text-slate-400 text-[10px]">Stok: {comp.stock_quantity}</span>
                </div>
              </label>
            ))}
          </div>
        )}
      </div>
      
      <div className="text-right pt-2 flex justify-end gap-3 border-t border-slate-100">
        {isEditMode && (
            <button type="button" onClick={onClose} className="px-4 py-2 text-sm font-medium text-slate-700 bg-white border border-slate-300 rounded-lg hover:bg-slate-50 transition-colors">Batal</button>
        )}
        <button 
          type="submit" 
          disabled={isSubmitting || loading}
          className="inline-flex items-center px-6 py-2.5 border border-transparent text-sm font-medium rounded-lg shadow-md text-white bg-blue-600 hover:bg-blue-700 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-500 disabled:opacity-50 transition-transform hover:-translate-y-0.5"
        >
          {isSubmitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : isEditMode ? <Save className="mr-2 h-4 w-4" /> : <Plus className="mr-2 h-4 w-4" />}
          {isSubmitting ? 'Menyimpan...' : isEditMode ? 'Simpan Perubahan' : 'Simpan Aset'}
        </button>
      </div>
    </form>
  );
}