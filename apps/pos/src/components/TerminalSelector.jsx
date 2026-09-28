/**
 * TerminalSelector — Pantalla de selección de terminal.
 *
 * FICHA 12 de ESPECIFICACION_DE_INTERFACES_POS.md:
 * Landing page del POS. Estética igualada al POS viejo:
 *   - Fondo madera (--madera)
 *   - Tarjetas oscuras con esquinas redondeadas
 *   - 3 estados: libre (🖥️), mía (🔑 dorada), ocupada (🔒 roja)
 *
 * Cicatriz portada: 3 estados explícitos (no 2).
 *
 * @see useTerminals en hooks/useTerminals.js
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

/* ─── Estilos inline (no dependen de Tailwind para funcionar) ─── */
const styles = {
  page: {
    minHeight: '100vh',
    background: 'rgb(var(--madera, 222 180 124))',
    color: 'rgb(var(--crema-ticket, 253 251 247))',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    justifyContent: 'center',
    padding: '2rem',
    position: 'relative',
  },
  subtitle: {
    color: '#ea580c',
    fontWeight: 900,
    textTransform: 'uppercase',
    letterSpacing: '0.5em',
    fontSize: '0.7rem',
    marginBottom: '0.5rem',
  },
  title: {
    fontSize: 'clamp(2rem, 5vw, 3.5rem)',
    fontWeight: 900,
    textTransform: 'uppercase',
    fontStyle: 'italic',
    letterSpacing: '-0.03em',
    color: '#fff',
    marginBottom: '0.25rem',
  },
  titleFaded: {
    opacity: 0.15,
  },
  greeting: {
    color: 'rgba(255,255,255,0.4)',
    fontSize: '0.875rem',
    marginBottom: '2.5rem',
  },
  grid: {
    display: 'grid',
    gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))',
    gap: '1.25rem',
    maxWidth: '1100px',
    width: '100%',
    marginBottom: '2rem',
  },
  managerBtn: {
    position: 'absolute',
    top: '1.5rem',
    right: '1.5rem',
    background: '#ea580c',
    color: '#fff',
    border: 'none',
    borderRadius: '1rem',
    padding: '0.75rem 1.5rem',
    fontWeight: 800,
    fontSize: '0.75rem',
    textTransform: 'uppercase',
    letterSpacing: '0.1em',
    cursor: 'pointer',
  },
};

/* ─── Estilos de tarjeta por estado ─── */
function getCardStyle(state) {
  const base = {
    background: 'rgba(30, 30, 30, 0.85)',
    borderRadius: '35px',
    border: '2px solid transparent',
    padding: '1.5rem 1rem',
    display: 'flex',
    flexDirection: 'column',
    alignItems: 'center',
    gap: '0.5rem',
    cursor: 'pointer',
    transition: 'all 0.4s ease',
    minHeight: '200px',
    justifyContent: 'center',
    position: 'relative',
  };

  if (state === 'free') {
    return { ...base, border: '2px solid rgba(255,255,255,0.08)' };
  }
  if (state === 'mine') {
    return { ...base, border: '2px solid rgba(234,88,12,0.5)', background: 'rgba(40, 30, 20, 0.9)' };
  }
  // occupied
  return {
    ...base,
    border: '2px solid rgba(127, 29, 29, 0.5)',
    background: 'rgba(50, 20, 20, 0.85)',
    cursor: 'not-allowed',
    opacity: 0.85,
  };
}

function getBadge(state) {
  if (state === 'free') return null;
  if (state === 'mine') {
    return {
      text: 'TU SESIÓN',
      bg: '#ea580c',
      color: '#fff',
    };
  }
  return {
    text: 'OCUPADA',
    bg: '#991b1b',
    color: '#fca5a5',
  };
}

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

  const canManage = currentUser?.role === 'ADMIN'
    || currentUser?.permissions?.access_terminal_manager === 'full';

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
  function startEdit(t) { setEditingId(t.id); setEditName(t.name); setEditIcon(t.icon); }
  function cancelEdit() { setEditingId(null); setEditName(''); setEditIcon(''); }
  function applyEdit() { updateTerminal(editingId, { name: editName, icon: editIcon }); cancelEdit(); }

  function handleRemove(tid) {
    const result = removeTerminal(tid);
    if (!result.success) { showToast(result.message, 'error'); return; }
    setConfirmDelete(null);
  }

  async function handleSave() {
    const result = await saveConfig();
    showToast(result.success ? '✅ Configuración guardada' : '❌ Error al guardar',
              result.success ? 'success' : 'error');
  }

  /* ─── Loading ─── */
  if (loading) {
    return (
      <div style={{ ...styles.page, justifyContent: 'center' }}>
        <div style={{ textAlign: 'center' }}>
          <div style={{ fontSize: '4rem', marginBottom: '1rem' }}>🖥️</div>
          <p style={{ opacity: 0.4, fontWeight: 700, textTransform: 'uppercase',
                      letterSpacing: '0.3em', fontSize: '0.8rem', color: '#fff' }}>
            Cargando terminales...
          </p>
        </div>
      </div>
    );
  }

  /* ─── Manager mode ─── */
  if (showManager) {
    return (
      <div style={{ ...styles.page }}>
        <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
          <p style={styles.subtitle}>Administración</p>
          <h2 style={{ ...styles.title, fontSize: 'clamp(1.8rem, 4vw, 3rem)' }}>
            Gestor de <span style={styles.titleFaded}>Terminales</span>
          </h2>
        </div>

        <div style={styles.grid}>
          {terminals.map(t => {
            const isEditing = editingId === t.id;
            return (
              <div key={t.id} style={{
                ...getCardStyle('free'),
                ...(isEditing ? { border: '2px solid #ea580c' } : {}),
              }}>
                <div style={{ width: 64, height: 64, display: 'flex', alignItems: 'center',
                              justifyContent: 'center', background: 'rgba(255,255,255,0.05)',
                              borderRadius: '1rem', fontSize: '2.5rem' }}>
                  {isEditing ? (editIcon || '🖥️') : (t.icon || '🖥️')}
                </div>

                {isEditing ? (
                  <>
                    <input value={editName} onChange={e => setEditName(e.target.value)}
                           style={{ width: '100%', background: 'rgba(0,0,0,0.4)', border: '1px solid rgba(255,255,255,0.1)',
                                    borderRadius: '0.75rem', padding: '0.5rem', textAlign: 'center',
                                    color: '#fff', fontSize: '0.8rem' }} />
                    <div style={{ display: 'flex', gap: '0.3rem', flexWrap: 'wrap', justifyContent: 'center' }}>
                      {PRESET_ICONS.map(p => (
                        <button key={p.value} onClick={() => setEditIcon(p.value)}
                                style={{ fontSize: '1.5rem', padding: '0.25rem', borderRadius: '0.5rem',
                                         background: editIcon === p.value ? 'rgba(234,88,12,0.3)' : 'transparent',
                                         border: 'none', cursor: 'pointer',
                                         transform: editIcon === p.value ? 'scale(1.2)' : 'scale(1)' }}>
                          {p.value}
                        </button>
                      ))}
                    </div>
                    <div style={{ display: 'flex', gap: '0.5rem', width: '100%' }}>
                      <button onClick={applyEdit}
                              style={{ flex: 1, background: '#16a34a', color: '#fff', border: 'none',
                                       borderRadius: '0.75rem', padding: '0.5rem', fontWeight: 700, cursor: 'pointer' }}>
                        ✓
                      </button>
                      <button onClick={cancelEdit}
                              style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
                                       borderRadius: '0.75rem', padding: '0.5rem', fontWeight: 700, cursor: 'pointer' }}>
                        ✗
                      </button>
                    </div>
                  </>
                ) : (
                  <>
                    <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{t.name}</span>
                    <span style={{ fontSize: '0.6rem', opacity: 0.3, fontFamily: 'monospace' }}>{t.id}</span>
                    <div style={{ display: 'flex', gap: '0.5rem' }}>
                      <button onClick={() => startEdit(t)}
                              style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff',
                                       border: 'none', borderRadius: '0.75rem', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
                        ✏️
                      </button>
                      <button onClick={() => setConfirmDelete(t.id)}
                              style={{ fontSize: '0.75rem', background: 'rgba(153,27,27,0.2)', color: '#fca5a5',
                                       border: 'none', borderRadius: '0.75rem', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
                        🗑️
                      </button>
                    </div>
                  </>
                )}
              </div>
            );
          })}

          {/* Add terminal */}
          <button onClick={() => addTerminal('end')}
                  style={{ ...getCardStyle('free'), border: '2px dashed rgba(255,255,255,0.1)',
                           background: 'transparent' }}>
            <span style={{ fontSize: '2.5rem' }}>+</span>
            <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase',
                           letterSpacing: '0.15em', opacity: 0.3 }}>Agregar</span>
          </button>
        </div>

        <div style={{ display: 'flex', gap: '1rem' }}>
          <button onClick={handleSave}
                  style={{ background: '#16a34a', color: '#fff', border: 'none', borderRadius: '1rem',
                           padding: '0.75rem 2rem', fontWeight: 800, fontSize: '0.8rem',
                           textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
            💾 Guardar cambios
          </button>
          <button onClick={() => setShowManager(false)}
                  style={{ background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
                           borderRadius: '1rem', padding: '0.75rem 2rem', fontWeight: 800,
                           fontSize: '0.8rem', textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer' }}>
            ← Volver
          </button>
        </div>

        {/* Confirm delete modal */}
        {confirmDelete && (
          <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.7)',
                        display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50 }}>
            <div style={{ background: '#1c1917', border: '1px solid rgba(255,255,255,0.1)',
                          borderRadius: '1.5rem', padding: '2rem', maxWidth: '24rem', textAlign: 'center' }}>
              <p style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: '1rem', color: '#fff' }}>
                ¿Eliminar {confirmDelete}?
              </p>
              <p style={{ opacity: 0.5, fontSize: '0.85rem', marginBottom: '1.5rem', color: '#fff' }}>
                Esta acción no se puede deshacer.
              </p>
              <div style={{ display: 'flex', gap: '0.75rem' }}>
                <button onClick={() => handleRemove(confirmDelete)}
                        style={{ flex: 1, background: '#dc2626', color: '#fff', border: 'none',
                                 borderRadius: '1rem', padding: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  Eliminar
                </button>
                <button onClick={() => setConfirmDelete(null)}
                        style={{ flex: 1, background: 'rgba(255,255,255,0.1)', color: '#fff', border: 'none',
                                 borderRadius: '1rem', padding: '0.75rem', fontWeight: 700, cursor: 'pointer' }}>
                  Cancelar
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  /* ═══════════════════════════════════════════════════════════════
     ═══ SELECTOR PRINCIPAL — estética del POS viejo ═══════════
     ═══════════════════════════════════════════════════════════════ */
  return (
    <div style={styles.page}>

      {/* Manager button — top right como el POS viejo */}
      {canManage && (
        <button onClick={() => setShowManager(true)} style={styles.managerBtn}>
          ⚙️ Gestor de Terminales
        </button>
      )}

      {/* Header */}
      <div style={{ textAlign: 'center', marginBottom: '2rem' }}>
        <p style={styles.subtitle}>Configuración de Estación</p>
        <h1 style={styles.title}>
          Selecciona tu <span style={styles.titleFaded}>Terminal</span>
        </h1>
        {currentUser && (
          <p style={styles.greeting}>
            Hola, <strong style={{ color: 'rgba(255,255,255,0.7)' }}>{currentUser.name}</strong>
          </p>
        )}
      </div>

      {/* Grid de terminales */}
      <div style={styles.grid}>
        {terminals.map(t => {
          const state = getCardState(t.id);
          const net = getNetStatus(t.id);
          const badge = getBadge(state);
          const info = statuses[t.id];
          const cardStyle = getCardStyle(state);

          return (
            <button key={t.id}
                    onClick={() => handleSelect(t.id)}
                    disabled={locking || state === 'occupied'}
                    style={cardStyle}>

              {/* Badge — esquina superior derecha */}
              {badge && (
                <div style={{
                  position: 'absolute', top: '0.75rem', right: '0.75rem',
                  background: badge.bg, color: badge.color,
                  fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase',
                  letterSpacing: '0.08em', padding: '0.25rem 0.6rem',
                  borderRadius: '0.5rem',
                }}>
                  {badge.text}
                </div>
              )}

              {/* Icon — diferente por estado */}
              <div style={{ fontSize: '3.5rem', marginTop: badge ? '0.5rem' : 0 }}>
                {state === 'mine' ? '🔑' : state === 'occupied' ? '🔒' : (t.icon || '🖥️')}
              </div>

              {/* Info por estado */}
              {state === 'free' && (
                <>
                  <span style={{ fontSize: '0.85rem', fontWeight: 700, color: '#fff' }}>{t.name}</span>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                                 letterSpacing: '0.15em', opacity: 0.3, color: '#fff' }}>
                    Punto de Venta
                  </span>
                </>
              )}

              {state === 'mine' && (
                <>
                  <span style={{ fontSize: '0.65rem', fontWeight: 700, textTransform: 'uppercase',
                                 letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>
                    Sesión Activa
                  </span>
                  <span style={{ fontSize: '1rem', fontWeight: 900, color: '#fff' }}>
                    {currentUser?.name || 'Usuario'}
                  </span>
                </>
              )}

              {state === 'occupied' && (
                <>
                  <span style={{ fontSize: '0.6rem', fontWeight: 700, textTransform: 'uppercase',
                                 letterSpacing: '0.1em', color: 'rgba(255,255,255,0.4)' }}>
                    En uso por
                  </span>
                  <span style={{ fontSize: '0.95rem', fontWeight: 900, color: '#fff' }}>
                    {info?.occupier_name || 'Otro usuario'}
                  </span>
                </>
              )}

              {/* Net status dot */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.4rem', marginTop: '0.25rem' }}>
                <div style={{ width: 8, height: 8, borderRadius: '50%', background: net.color }} />
                <span style={{ fontSize: '0.55rem', fontWeight: 700, color: 'rgba(255,255,255,0.3)',
                               textTransform: 'uppercase', letterSpacing: '0.05em' }}>
                  {net.label}
                </span>
              </div>
            </button>
          );
        })}
      </div>

      {/* Toast */}
      {toast && (
        <div style={{
          position: 'fixed', bottom: '2rem', left: '50%', transform: 'translateX(-50%)',
          padding: '0.75rem 1.5rem', borderRadius: '1rem', fontSize: '0.85rem', fontWeight: 700,
          zIndex: 50, color: '#fff',
          background: toast.type === 'error' ? '#dc2626' : toast.type === 'success' ? '#16a34a' : '#27272a',
          boxShadow: '0 10px 30px rgba(0,0,0,0.3)',
        }}>
          {toast.msg}
        </div>
      )}
    </div>
  );
}
