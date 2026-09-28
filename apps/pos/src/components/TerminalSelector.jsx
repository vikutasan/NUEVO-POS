/**
 * TerminalSelector — Pantalla de selección de terminal.
 *
 * FICHA 12 de ESPECIFICACION_DE_INTERFACES_POS.md:
 * Landing page del POS. Muestra las terminales como tarjetas con 3 estados
 * visuales: libre (verde), mía (azul), ocupada (rojo/naranja).
 *
 * Cicatriz portada: el bug del POS viejo donde el ocupante veía su propia
 * terminal como "libre" (solo 2 ramas en vez de 3). Ahora resolveCardState()
 * produce 3 estados explícitos.
 *
 * @see useTerminals en hooks/useTerminals.js
 * @see resolveCardState en utils/terminalCardState.js
 */

import React, { useState } from 'react';
import { useTerminals } from '../hooks/useTerminals.js';

const PRESET_ICONS = [
  { label: 'Monitor', value: '🖥️' },
  { label: 'Laptop', value: '💻' },
  { label: 'Tablet', value: '📱' },
  { label: 'Impresora', value: '🖨️' },
  { label: 'Servidor', value: '🖧' },
  { label: 'Caja', value: '💰' },
];

function renderIcon(icon) {
  if (!icon) return <span className="text-5xl">🖥️</span>;
  if (icon.endsWith('.png') || icon.startsWith('data:')) {
    return <img src={icon} alt="" className="w-16 h-16 object-contain" />;
  }
  return <span className="text-5xl">{icon}</span>;
}

/* ─── Estilos por estado de tarjeta ─── */
const CARD_STYLES = {
  free: {
    border: 'border-white/10 hover:border-green-400/60',
    bg: 'bg-black/20 hover:bg-green-900/20',
    badge: 'bg-green-500/20 text-green-400',
    badgeText: '🟢 LIBRE',
    cursor: 'cursor-pointer',
  },
  mine: {
    border: 'border-blue-500/50',
    bg: 'bg-blue-900/20',
    badge: 'bg-blue-500/20 text-blue-400',
    badgeText: '🔵 TU TERMINAL',
    cursor: 'cursor-pointer',
  },
  occupied: {
    border: 'border-red-500/30',
    bg: 'bg-black/30',
    badge: 'bg-red-500/20 text-red-400',
    badgeText: '🔴 OCUPADA',
    cursor: 'cursor-not-allowed opacity-60',
  },
};

export default function TerminalSelector({ currentUser, onTerminalSelected }) {
  const {
    terminals, statuses, loading, locking,
    getCardState, getNetStatus, selectTerminal,
    addTerminal, updateTerminal, removeTerminal, saveConfig,
  } = useTerminals(currentUser);

  const [showManager, setShowManager] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const showToast = (msg, type = 'info') => {
    setToast({ msg, type });
    setTimeout(() => setToast(null), 3000);
  };

  /* ─── Seleccionar terminal ─── */
  async function handleSelect(terminalId) {
    const state = getCardState(terminalId);
    if (state === 'occupied') {
      showToast('Terminal ocupada por otro usuario', 'error');
      return;
    }
    if (state === 'mine') {
      onTerminalSelected?.(terminalId);
      return;
    }
    const result = await selectTerminal(terminalId);
    if (result.success) {
      onTerminalSelected?.(terminalId);
    } else {
      showToast(result.message || 'No se pudo tomar la terminal', 'error');
    }
  }

  /* ─── Gestión ─── */
  function startEdit(t) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditIcon(t.icon);
  }

  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditIcon('');
  }

  function applyEdit() {
    updateTerminal(editingId, { name: editName, icon: editIcon });
    cancelEdit();
  }

  function handleRemove(tid) {
    const result = removeTerminal(tid);
    if (!result.success) {
      showToast(result.message, 'error');
      return;
    }
    setConfirmDelete(null);
  }

  async function handleSave() {
    const result = await saveConfig();
    if (result.success) {
      showToast('✅ Configuración guardada', 'success');
    } else {
      showToast('❌ Error al guardar', 'error');
    }
  }

  /* ─── Loading state ─── */
  if (loading) {
    return (
      <div className="flex-1 flex items-center justify-center min-h-screen"
           style={{ background: 'var(--pos-bg, #0a0a0a)' }}>
        <div className="text-center animate-pulse">
          <div className="text-6xl mb-6">🖥️</div>
          <p className="text-white/40 text-sm font-bold uppercase tracking-[0.3em]">
            Cargando terminales...
          </p>
        </div>
      </div>
    );
  }

  /* ─── Manager mode ─── */
  if (showManager) {
    return (
      <div className="flex-1 flex flex-col items-center justify-center p-10 min-h-screen
                      animate-in fade-in zoom-in-95 duration-700"
           style={{ background: 'var(--pos-bg, #0a0a0a)', color: 'var(--pos-text, #fff)' }}>

        <div className="text-center mb-10">
          <h3 className="text-orange-500 font-black uppercase tracking-[0.5em] text-xs mb-4">
            Administración
          </h3>
          <h2 className="text-5xl font-black uppercase tracking-tighter italic">
            Gestor de <span className="opacity-20">Terminales</span>
          </h2>
        </div>

        <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 max-w-7xl w-full mb-10">
          {terminals.map(t => {
            const isEditing = editingId === t.id;
            return (
              <div key={t.id}
                   className={`rounded-[30px] border p-6 flex flex-col items-center gap-4
                              transition-all duration-300
                              ${isEditing
                                ? 'bg-orange-600/10 border-orange-500/40'
                                : 'bg-black/20 border-white/5'}`}>
                <div className="w-20 h-20 flex items-center justify-center bg-white/5 rounded-2xl">
                  {renderIcon(isEditing ? editIcon : t.icon)}
                </div>

                {isEditing ? (
                  <>
                    <input value={editName}
                           onChange={e => setEditName(e.target.value)}
                           className="w-full bg-black/40 border border-white/10 rounded-xl px-3 py-2
                                      text-center text-sm text-white" />
                    <div className="flex flex-wrap gap-2 justify-center">
                      {PRESET_ICONS.map(p => (
                        <button key={p.value}
                                onClick={() => setEditIcon(p.value)}
                                className={`text-2xl p-1 rounded-lg transition-all
                                           ${editIcon === p.value ? 'bg-orange-500/30 scale-125' : 'hover:bg-white/10'}`}>
                          {p.value}
                        </button>
                      ))}
                    </div>
                    <div className="flex gap-2 w-full">
                      <button onClick={applyEdit}
                              className="flex-1 bg-green-600 hover:bg-green-500 text-white text-xs
                                         font-bold py-2 rounded-xl transition-colors">
                        ✓
                      </button>
                      <button onClick={cancelEdit}
                              className="flex-1 bg-white/10 hover:bg-white/20 text-white text-xs
                                         font-bold py-2 rounded-xl transition-colors">
                        ✗
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span className="text-sm font-bold">{t.name}</span>
                    <span className="text-[10px] text-white/30 font-mono">{t.id}</span>
                    <div className="flex gap-2">
                      <button onClick={() => startEdit(t)}
                              className="text-xs bg-white/5 hover:bg-white/10 px-3 py-1.5
                                         rounded-xl transition-colors">
                        ✏️
                      </button>
                      <button onClick={() => setConfirmDelete(t.id)}
                              className="text-xs bg-red-900/20 hover:bg-red-900/40 px-3 py-1.5
                                         rounded-xl transition-colors text-red-400">
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Add terminal button */}
          <button onClick={() => addTerminal('end')}
                  className="rounded-[30px] border-2 border-dashed border-white/10 p-6
                             flex flex-col items-center justify-center gap-4 min-h-[200px]
                             hover:border-orange-500/40 hover:bg-orange-600/5 transition-all group">
            <span className="text-4xl group-hover:scale-125 transition-transform">+</span>
            <span className="text-[10px] font-black uppercase tracking-widest text-white/30
                             group-hover:text-orange-400">
              Agregar
            </span>
          </button>
        </div>

        <div className="flex gap-4">
          <button onClick={handleSave}
                  className="bg-green-600 hover:bg-green-500 text-white font-bold
                             px-8 py-3 rounded-2xl transition-colors text-sm uppercase tracking-wider">
            💾 Guardar cambios
          </button>
          <button onClick={() => setShowManager(false)}
                  className="bg-white/10 hover:bg-white/20 text-white font-bold
                             px-8 py-3 rounded-2xl transition-colors text-sm uppercase tracking-wider">
            ← Volver
          </button>
        </div>

        {/* Confirm delete modal */}
        {confirmDelete && (
          <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50">
            <div className="bg-zinc-900 border border-white/10 rounded-3xl p-8 max-w-sm text-center">
              <p className="text-lg font-bold mb-4">¿Eliminar {confirmDelete}?</p>
              <p className="text-white/50 text-sm mb-6">Esta acción no se puede deshacer.</p>
              <div className="flex gap-3">
                <button onClick={() => handleRemove(confirmDelete)}
                        className="flex-1 bg-red-600 hover:bg-red-500 text-white font-bold
                                   py-3 rounded-2xl transition-colors">
                  Eliminar
                </button>
                <button onClick={() => setConfirmDelete(null)}
                        className="flex-1 bg-white/10 hover:bg-white/20 text-white font-bold
                                   py-3 rounded-2xl transition-colors">
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ─── Selector principal ─── */
  return (
    <div className="flex-1 flex flex-col items-center justify-center p-8 min-h-screen
                    animate-in fade-in zoom-in-95 duration-700"
         style={{ background: 'var(--pos-bg, #0a0a0a)', color: 'var(--pos-text, #fff)' }}>

      {/* Header */}
      <div className="text-center mb-12">
        <h3 className="text-orange-500 font-black uppercase tracking-[0.5em] text-xs mb-4">
          R de Rico • Punto de Venta
        </h3>
        <h1 className="text-5xl md:text-6xl font-black uppercase tracking-tighter italic mb-3">
          Selecciona tu <span className="opacity-20">Terminal</span>
        </h1>
        {currentUser && (
          <p className="text-white/40 text-sm">
            Hola, <span className="text-white/70 font-bold">{currentUser.name}</span>
          </p>
        )}
      </div>

      {/* Grid de terminales */}
      <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-6 max-w-7xl w-full mb-12">
        {terminals.map(t => {
          const state = getCardState(t.id);
          const net = getNetStatus(t.id);
          const style = CARD_STYLES[state];
          const status = statuses[t.id];

          return (
            <button key={t.id}
                    onClick={() => handleSelect(t.id)}
                    disabled={locking || state === 'occupied'}
                    className={`rounded-[30px] border ${style.border} ${style.bg} ${style.cursor}
                               p-8 flex flex-col items-center gap-4 transition-all duration-500
                               shadow-2xl hover:shadow-3xl hover:-translate-y-1
                               disabled:pointer-events-none`}>

              {/* Icon */}
              <div className="w-20 h-20 flex items-center justify-center bg-white/5 rounded-2xl
                              transition-transform group-hover:scale-110">
                {renderIcon(t.icon)}
              </div>

              {/* Name */}
              <span className="text-sm font-bold">{t.name}</span>

              {/* Status badge */}
              <span className={`text-[10px] font-black uppercase tracking-wider px-3 py-1
                               rounded-full ${style.badge}`}>
                {style.badgeText}
              </span>

              {/* Occupier info */}
              {state === 'occupied' && status?.occupier_name && (
                <span className="text-[10px] text-white/30">
                  {status.occupier_name}
                </span>
              )}

              {/* Net status indicator */}
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full" style={{ background: net.color }} />
                <span className="text-[9px] text-white/30 font-mono">{net.label}</span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Bottom actions */}
      <div className="flex gap-4">
        {(currentUser?.role === 'ADMIN' || currentUser?.permissions?.access_terminal_manager === 'full') && (
          <button onClick={() => setShowManager(true)}
                  className="bg-white/5 hover:bg-white/10 text-white/60 hover:text-white
                             font-bold px-6 py-3 rounded-2xl transition-all text-sm
                             uppercase tracking-wider border border-white/5 hover:border-white/20">
            ⚙️ Gestionar terminales
          </button>
        )}
      </div>

      {/* Toast */}
      {toast && (
        <div className={`fixed bottom-8 left-1/2 -translate-x-1/2 px-6 py-3 rounded-2xl
                        text-sm font-bold shadow-2xl animate-in fade-in slide-in-from-bottom-4
                        duration-300 z-50
                        ${toast.type === 'error' ? 'bg-red-600 text-white' :
                          toast.type === 'success' ? 'bg-green-600 text-white' :
                          'bg-zinc-800 text-white border border-white/10'}`}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
