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
import { useTheme } from '../hooks/useTheme.js';
import ThemeSelector from './ThemeSelector.jsx';
import { PALETA_POST_ITS, etiquetaDeColor } from '../constants/paletaPostIts.js';
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
    getCardState, getNetStatus, getCajaHabilitada, selectTerminal,
    addTerminal, updateTerminal, removeTerminal, saveConfig,
    ordenTerminales, terminalesDesplegadas, invertirOrden,
  } = useTerminals(currentUser);

  const [showManager, setShowManager] = useState(false);
  const [showTheme, setShowTheme] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [editName, setEditName] = useState('');
  const [editIcon, setEditIcon] = useState('');
  const [editColor, setEditColor] = useState(null);
  const [toast, setToast] = useState(null);
  const [confirmDelete, setConfirmDelete] = useState(null);

  const tema = useTheme();

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
  function startEdit(t) {
    setEditingId(t.id);
    setEditName(t.name);
    setEditIcon(t.icon);
    setEditColor(t.color ?? null);
  }
  function cancelEdit() {
    setEditingId(null);
    setEditName('');
    setEditIcon('');
    setEditColor(null);
  }
  function applyEdit() {
    updateTerminal(editingId, { name: editName, icon: editIcon, color: editColor });
    cancelEdit();
  }

  /* ─── FASE 13.3 — Colores de post-it ──────────────────────────────────────
     Decisión del usuario (9 Oct 2026): NO se permiten colores repetidos. Un
     color ya asignado a OTRA terminal se bloquea (no se puede elegir). El
     color de la terminal que se está editando NO cuenta como "en uso" (se
     puede conservar). `null` (sin color) siempre es válido y no colisiona. */
  function colorEnUso(token, exceptoId) {
    return terminals.some(t => t.id !== exceptoId && t.color === token);
  }

  /* ─── B-01 (F10.2) — Copiar URL de acceso directo ─────────────────────────
     UX heredada del viejo POS (§6.8): el gestor permite copiar la URL con el
     `?terminal=<id>` para pegar en el acceso directo de cada máquina. La
     IMPLEMENTACIÓN se reescribe (navigator.clipboard con fallback a
     `execCommand`), pero la INTEGRACIÓN se hereda: el botón vive en la tarjeta
     del gestor, junto a Editar y Eliminar. */
  async function copyUrl(tid) {
    const url = `http://${window.location.hostname}:${window.location.port}/?terminal=${tid}`;
    try {
      if (navigator.clipboard?.writeText) {
        await navigator.clipboard.writeText(url);
      } else {
        // Fallback para contextos sin Clipboard API (http no seguro, navegadores viejos).
        const ta = document.createElement('textarea');
        ta.value = url;
        ta.style.cssText = 'position:fixed;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
      }
      showToast(`✅ URL copiada: ${url}`, 'success');
    } catch {
      showToast(`No se pudo copiar. URL: ${url}`, 'error');
    }
  }

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

        {/* Selector de orden de despliegue (F6.5) */}
        <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center',
                      gap: '0.5rem', marginBottom: '1.5rem' }}>
          <span style={{ fontSize: '0.6rem', fontWeight: 900, textTransform: 'uppercase',
                         letterSpacing: '0.2em', opacity: 0.4, color: '#fff' }}>
            Orden de terminales
          </span>
          <div style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              data-testid="orden-izq-der"
              onClick={() => { if (ordenTerminales !== 'izq-der') invertirOrden(); }}
              style={{
                background: ordenTerminales === 'izq-der' ? '#ea580c' : 'rgba(255,255,255,0.05)',
                color: '#fff', border: 'none', borderRadius: '1rem',
                padding: '0.5rem 1.25rem', fontWeight: 800, fontSize: '0.7rem',
                textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                opacity: ordenTerminales === 'izq-der' ? 1 : 0.5,
              }}>
              ➡️ Izquierda a derecha
            </button>
            <button
              data-testid="orden-der-izq"
              onClick={() => { if (ordenTerminales !== 'der-izq') invertirOrden(); }}
              style={{
                background: ordenTerminales === 'der-izq' ? '#ea580c' : 'rgba(255,255,255,0.05)',
                color: '#fff', border: 'none', borderRadius: '1rem',
                padding: '0.5rem 1.25rem', fontWeight: 800, fontSize: '0.7rem',
                textTransform: 'uppercase', letterSpacing: '0.1em', cursor: 'pointer',
                opacity: ordenTerminales === 'der-izq' ? 1 : 0.5,
              }}>
              ⬅️ Derecha a izquierda
            </button>
          </div>
        </div>

        <div style={styles.grid}>
          {terminalesDesplegadas.map(t => {
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

                    {/* FASE 13.3 — Selector de color del post-it.
                        Los colores ya asignados a OTRAS terminales se bloquean
                        (decisión del usuario: sin colores repetidos). */}
                    <div data-testid={`paleta-color-${t.id}`}
                         style={{ width: '100%', display: 'flex', flexDirection: 'column', gap: '0.35rem' }}>
                      <span style={{ fontSize: '0.55rem', fontWeight: 900, textTransform: 'uppercase',
                                     letterSpacing: '0.15em', opacity: 0.4, color: '#fff', textAlign: 'center' }}>
                        Color del post-it
                      </span>
                      <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.3rem', justifyContent: 'center' }}>
                        {/* Opción "sin color" (amarillo por defecto) */}
                        <button
                          type="button"
                          data-testid={`color-${t.id}-ninguno`}
                          title="Sin color (amarillo por defecto)"
                          onClick={() => setEditColor(null)}
                          style={{
                            width: 26, height: 26, borderRadius: '0.4rem',
                            border: editColor === null ? '2px solid #ea580c' : '1px solid rgba(255,255,255,0.2)',
                            background: 'rgba(255,255,255,0.05)', color: '#fff',
                            fontSize: '0.6rem', cursor: 'pointer', lineHeight: 1,
                          }}>
                          ∅
                        </button>
                        {PALETA_POST_ITS.map(token => {
                          const enUso = colorEnUso(token, t.id);
                          const seleccionado = editColor === token;
                          return (
                            <button
                              key={token}
                              type="button"
                              data-testid={`color-${t.id}-${token}`}
                              title={enUso ? `${etiquetaDeColor(token)} (en uso)` : etiquetaDeColor(token)}
                              disabled={enUso}
                              onClick={() => { if (!enUso) setEditColor(token); }}
                              style={{
                                width: 26, height: 26, borderRadius: '0.4rem',
                                border: seleccionado ? '2px solid #ea580c' : '1px solid rgba(255,255,255,0.2)',
                                cursor: enUso ? 'not-allowed' : 'pointer',
                                opacity: enUso ? 0.2 : 1,
                                transform: seleccionado ? 'scale(1.15)' : 'scale(1)',
                                padding: 0,
                              }}
                              className={token}
                            />
                          );
                        })}
                      </div>
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
                              title="Editar"
                              style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff',
                                       border: 'none', borderRadius: '0.75rem', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
                        ✏️
                      </button>
                      {/* B-01 (F10.2) — Copiar URL de acceso directo (UX heredada §6.8) */}
                      <button onClick={() => copyUrl(t.id)}
                              data-testid={`copiar-url-${t.id}`}
                              title="Copiar URL"
                              style={{ fontSize: '0.75rem', background: 'rgba(255,255,255,0.05)', color: '#fff',
                                       border: 'none', borderRadius: '0.75rem', padding: '0.4rem 0.75rem', cursor: 'pointer' }}>
                        📋
                      </button>
                      <button onClick={() => setConfirmDelete(t.id)}
                              title="Eliminar"
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

      {/* Rincón de configuración — top right */}
      <div style={{
        position: 'absolute', top: '1.5rem', right: '1.5rem',
        display: 'flex', gap: '0.75rem', alignItems: 'center',
      }}>
        {/* Tema — reubicado aquí desde el header del POS (es una preferencia,
            no una acción transaccional). */}
        <button
          onClick={() => setShowTheme(prev => !prev)}
          style={{
            background: 'rgba(30, 30, 30, 0.85)',
            color: '#fff',
            border: '2px solid rgba(255,255,255,0.1)',
            borderRadius: '1rem',
            padding: '0.75rem 1.25rem',
            fontWeight: 800,
            fontSize: '0.75rem',
            textTransform: 'uppercase',
            letterSpacing: '0.1em',
            cursor: 'pointer',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'all 0.3s ease',
          }}
          title="Cambiar tema visual"
          aria-label="Cambiar tema"
        >
          🎨 Tema
        </button>

        {/* Gestor de terminales */}
        {canManage && (
          <button onClick={() => setShowManager(true)} style={styles.managerBtn}>
            ⚙️ Gestor de Terminales
          </button>
        )}
      </div>

      {/* Overlay del selector de tema */}
      {showTheme && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 50,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            background: 'rgba(0,0,0,0.6)', backdropFilter: 'blur(8px)',
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setShowTheme(false); }}
        >
          <div style={{
            background: 'rgba(30, 30, 30, 0.95)',
            border: '1px solid rgba(255,255,255,0.1)',
            borderRadius: '1.5rem',
            padding: '1.5rem',
            maxWidth: '400px',
            width: '90%',
            boxShadow: '0 25px 60px rgba(0,0,0,0.5)',
          }}>
            <ThemeSelector
              temaActivo={tema.temaActivo}
              temas={tema.temas}
              onCambiar={(id) => { tema.cambiarTema(id); setShowTheme(false); }}
              onCerrar={() => setShowTheme(false)}
            />
          </div>
        </div>
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
        {terminalesDesplegadas.map(t => {
          const state = getCardState(t.id);
          const net = getNetStatus(t.id);
          const badge = getBadge(state);
          const info = statuses[t.id];
          const cardStyle = getCardStyle(state);
          // FIX "habilitar caja" (paridad con el viejo POS §6.8) — la caja es un
          // estado INDEPENDIENTE del candado. Una terminal libre puede tener la
          // caja habilitada (turno abierto) y el landing debe mostrarlo.
          const cajaHabilitada = getCajaHabilitada(t.id);

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

              {/* FIX "habilitar caja" (paridad con el viejo POS §6.8) — indicador de
                  caja habilitada. Independiente del candado: se muestra aunque la
                  terminal esté libre. El verde (#16a34a) es el mismo del botón
                  "● Activa" del POSHeader, para que el lenguaje visual sea uno. */}
              {cajaHabilitada && (
                <div
                  data-testid={`caja-habilitada-${t.id}`}
                  style={{
                    display: 'flex', alignItems: 'center', gap: '0.35rem',
                    marginTop: '0.35rem', padding: '0.2rem 0.6rem',
                    background: 'rgba(22,163,74,0.15)',
                    border: '1px solid rgba(22,163,74,0.5)',
                    borderRadius: '0.5rem',
                  }}>
                  <span style={{ fontSize: '0.6rem', color: '#4ade80' }}>●</span>
                  <span style={{ fontSize: '0.55rem', fontWeight: 900, color: '#4ade80',
                                 textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                    Caja habilitada
                  </span>
                </div>
              )}
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
