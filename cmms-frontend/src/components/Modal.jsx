// src/components/Modal.jsx
import React from 'react';
import { X } from 'lucide-react';

export default function Modal({ isOpen, onClose, title, children, maxWidth = 'max-w-lg' }) {
    // Jika Modal tidak terbuka, jangan render apa-apa
    if (!isOpen) return null;

    return (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-50 flex justify-center items-center p-4">
            <div className={`bg-white rounded-lg shadow-2xl w-full ${maxWidth} max-h-[90vh] overflow-y-auto transform transition-all`}>
                {/* Modal Header */}
                <div className="flex justify-between items-center p-4 border-b">
                    <h3 className="text-xl font-semibold text-slate-800">{title}</h3>
                    <button onClick={onClose} className="text-slate-400 hover:text-slate-600">
                        <X size={24} />
                    </button>
                </div>
                {/* Modal Body */}
                <div className="p-4">
                    {children}
                </div>
            </div>
        </div>
    );
}