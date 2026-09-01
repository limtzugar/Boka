'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { useAppStore, type FamilyMember } from '@/lib/store';
import {
  Plus, X, Settings, Baby, User, Users, Upload, Trash2, Loader2,
  Check, AlertTriangle, Calendar, Heart, Star,
} from 'lucide-react';
import { PixelAvatar, getCategoryLabel } from '@/components/pixel-avatar';

// ═══════════════════════════════════════════════════════════
// PROFILES TAB — extracted from page.tsx (P0.2)
// Family members + "other people" management
// ═══════════════════════════════════════════════════════════

export function ProfilesTab({ members, activeMemberId, setActiveMember, childNearby, toggleChildNearby }: {
  members: FamilyMember[]; activeMemberId: string | null;
  setActiveMember: (id: string) => void; childNearby: boolean; toggleChildNearby: () => void;
}) {
  const [showAddPerson, setShowAddPerson] = useState(false);
  const [editingMember, setEditingMember] = useState<FamilyMember | null>(null);
  const [selectedMemberId, setSelectedMemberId] = useState<string | null>(null);

  // Form state
  const [formName, setFormName] = useState('');
  const [formRole, setFormRole] = useState('other');
  const [formAge, setFormAge] = useState(0);
  const [formCategory, setFormCategory] = useState<'family' | 'friend' | 'colleague' | 'acquaintance' | 'other'>('other');
  const [formColor, setFormColor] = useState('');
  const [formEmoji, setFormEmoji] = useState('');
  const [formPhotoUrl, setFormPhotoUrl] = useState<string | null>(null);
  const [photoUploading, setPhotoUploading] = useState(false);
  const [saving, setSaving] = useState(false);

  const photoInputRef = useRef<HTMLInputElement>(null);

  // Selected member (from sidebar list — shows details in right panel)
  const selectedMember = members.find(m => m.id === selectedMemberId) || null;

  // Group members by category
  const familyMembers = members.filter(m => !m.category || m.category === 'family');
  const otherMembers = members.filter(m => m.category && m.category !== 'family');

  const resetForm = () => {
    setFormName(''); setFormRole('other'); setFormAge(0);
    setFormCategory('other'); setFormColor(''); setFormEmoji('');
    setFormPhotoUrl(null);
    setEditingMember(null);
  };

  const openAdd = (presetCategory: 'family' | 'friend' | 'colleague' | 'acquaintance' | 'other' = 'other') => {
    resetForm();
    setFormCategory(presetCategory);
    setShowAddPerson(true);
  };

  const openEdit = (m: FamilyMember) => {
    setFormName(m.name);
    setFormRole(m.role);
    setFormAge(m.age);
    setFormCategory((m.category as any) || 'family');
    setFormColor(m.color || '');
    setFormEmoji(m.avatarEmoji);
    setFormPhotoUrl(m.photoUrl || null);
    setEditingMember(m);
    setShowAddPerson(true);
  };

  // ─── Photo upload handler ───
  const handlePhotoUpload = async (file: File) => {
    if (!editingMember) return;
    setPhotoUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch(`/api/family/photo?id=${editingMember.id}`, {
        method: 'POST',
        body: formData,
      });
      const data = await res.json();
      if (res.ok && data.photoUrl) {
        setFormPhotoUrl(data.photoUrl);
      } else {
        alert(data.error || 'Błąd przesyłania zdjęcia');
      }
    } catch (e: any) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handlePhotoDelete = async () => {
    if (!editingMember) return;
    if (!confirm('Usunąć zdjęcie?')) return;
    setPhotoUploading(true);
    try {
      await fetch(`/api/family/photo?id=${editingMember.id}`, { method: 'DELETE' });
      setFormPhotoUrl(null);
    } catch (e: any) {
      alert(`Błąd: ${e.message}`);
    } finally {
      setPhotoUploading(false);
    }
  };

  const handleSubmit = async () => {
    if (!formName.trim()) return;
    setSaving(true);
    try {
      if (editingMember) {
        const res = await fetch(`/api/family/update?id=${editingMember.id}`, {
          method: 'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName, role: formRole, age: formAge,
            avatarEmoji: formEmoji, category: formCategory,
            color: formColor || null,
          }),
        });
        if (res.ok) { setShowAddPerson(false); resetForm(); window.location.reload(); }
      } else {
        const res = await fetch('/api/family', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            name: formName, role: formRole, age: formAge,
            avatarEmoji: formEmoji, category: formCategory,
            color: formColor || null,
          }),
        });
        if (res.ok) { setShowAddPerson(false); resetForm(); window.location.reload(); }
      }
    } finally { setSaving(false); }
  };

  const handleDelete = async (m: FamilyMember) => {
    if (!confirm(`Usunąć "${m.name}"? Tej operacji nie można cofnąć.`)) return;
    const res = await fetch(`/api/family?id=${m.id}`, { method: 'DELETE' });
    if (res.ok) window.location.reload();
    else {
      const data = await res.json();
      alert(data.error || 'Błąd usuwania');
    }
  };

  // ─── Render square card with photo + settings button ───
  const renderSquareCard = (member: FamilyMember) => {
    const isActive = activeMemberId === member.id;
    const isSelected = selectedMemberId === member.id;
    const accentColor = member.color || (
      member.category === 'family' ? '#00f5d4' :
      member.category === 'friend' ? '#a855f7' :
      member.category === 'colleague' ? '#6ec6e7' :
      member.category === 'acquaintance' ? '#ffd93d' :
      '#8888aa'
    );

    return (
      <div
        key={member.id}
        className={`relative transition-all cursor-pointer group ${
          isSelected ? 'bg-[#252535]' : 'hover:bg-[#1a1a28]'
        }`}
        onClick={() => { setSelectedMemberId(member.id); setActiveMember(member.id); }}
      >
        {/* Left accent bar */}
        <div
          className={`absolute left-0 top-0 bottom-0 w-0.5 transition-opacity ${isSelected ? 'opacity-100' : 'opacity-0 group-hover:opacity-50'}`}
          style={{ backgroundColor: accentColor }}
        />
        <div className="flex items-center gap-2.5 p-2">
          {/* Avatar / Photo — rounded */}
          <div
            className="relative w-11 h-11 shrink-0 overflow-hidden flex items-center justify-center"
            style={{
              borderRadius: '50%',
              border: `2px solid ${isActive ? accentColor : 'transparent'}`,
              backgroundColor: '#252535',
            }}
          >
            {member.photoUrl ? (
              <img
                src={`/api/family/photo/file?id=${encodeURIComponent(member.id)}&t=${member.photoUrl.split('.').slice(-2, -1)[0] || ''}`}
                alt={member.name}
                className="w-full h-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <PixelAvatar
                name={member.name}
                category={(member.category || 'family') as any}
                color={member.color || undefined}
                role={member.role}
                size={44}
                showRing={false}
              />
            )}
            {/* Active indicator */}
            {member.isActive && (
              <div className="absolute bottom-0 right-0 w-2.5 h-2.5 bg-[#4ade80] rounded-full border-2 border-[#181828]" />
            )}
          </div>

          {/* Name + role */}
          <div className="flex-1 min-w-0">
            <div className="text-xs font-mono text-[#e8e8f5] truncate">{member.name}</div>
            <div className="text-[9px] text-[#8888aa] font-mono truncate">
              {member.role === 'parent' ? 'Rodzic' : member.role === 'partner' ? 'Partner' : member.role === 'child' ? 'Dziecko' : member.role}
              {member.age > 0 && ` · ${member.age}l`}
            </div>
          </div>

          {/* Settings button — shows on hover */}
          <button
            onClick={(e) => { e.stopPropagation(); openEdit(member); }}
            className="w-6 h-6 flex items-center justify-center text-[#5a5a78] hover:text-[#00f5d4] opacity-0 group-hover:opacity-100 transition-all shrink-0"
            title={`Ustawienia: ${member.name}`}
          >
            <Settings size={12} />
          </button>
        </div>
      </div>
    );
  };

  // ─── Selected member detail panel (right side) ───
  const renderMemberDetail = () => {
    if (!selectedMember) {
      return (
        <div className="flex-1 flex items-center justify-center text-center px-8">
          <div>
            <Users size={48} className="text-[#3a3a4a] mx-auto mb-3" />
            <div className="text-sm text-[#8888aa] font-mono">Wybierz osobę z listy po lewej</div>
            <div className="text-[10px] text-[#5a5a78] font-mono mt-1">
              Kliknij kartę aby zobaczyć szczegóły · kliknij ikonę zębatki aby edytować
            </div>
          </div>
        </div>
      );
    }

    const m = selectedMember;
    const borderColor = m.color || (
      m.category === 'family' ? '#00f5d4' :
      m.category === 'friend' ? '#a855f7' :
      m.category === 'colleague' ? '#6ec6e7' :
      m.category === 'acquaintance' ? '#ffd93d' :
      '#6b6b8d'
    );
    const prefs = m.preferences as Record<string, unknown> | null;

    return (
      <div className="flex-1 overflow-y-auto p-6">
        <div className="max-w-2xl mx-auto">
          {/* Header with photo + name + edit button */}
          <div className="flex items-start gap-4 mb-6">
            <div
              className="w-32 h-32 bg-[#252535] border-2 overflow-hidden shrink-0"
              style={{ borderColor }}
            >
              {m.photoUrl ? (
                <img
                  src={`/api/family/photo/file?id=${encodeURIComponent(m.id)}&t=${m.photoUrl.split('.').slice(-2, -1)[0] || ''}`}
                  alt={m.name}
                  className="w-full h-full object-cover"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <div className="w-full h-full flex items-center justify-center">
                  <PixelAvatar
                    name={m.name}
                    category={(m.category || 'family') as any}
                    color={m.color || undefined}
                    role={m.role}
                    size={96}
                    showRing={false}
                  />
                </div>
              )}
            </div>
            <div className="flex-1 min-w-0">
              <h2 className="text-2xl font-bold text-[#e8e8f5] truncate">{m.name}</h2>
              <div className="text-sm text-[#8888aa] font-mono mt-1">
                {m.role === 'parent' ? 'Rodzic' : m.role === 'partner' ? 'Partner/Partnerka' : m.role === 'child' ? 'Dziecko' : m.role}
                {m.age > 0 && ` · ${m.age} lat`}
                {' · '}
                {getCategoryLabel((m.category as any) || 'family')}
              </div>
              <div className="flex items-center gap-2 mt-3">
                <div className={`flex items-center gap-1 px-2 py-1 text-[10px] font-mono border ${
                  m.isActive
                    ? 'bg-[#4ade80]/10 text-[#4ade80] border-[#4ade80]/30'
                    : 'bg-[#252535] text-[#8888aa] border-[#383850]'
                }`}>
                  <div className={`w-1.5 h-1.5 rounded-full ${m.isActive ? 'bg-[#4ade80]' : 'bg-[#6b6b8d]'}`} />
                  {m.isActive ? 'Obecny/a' : 'Nieobecny/a'}
                </div>
                <button
                  onClick={() => openEdit(m)}
                  className="px-3 py-1 text-[10px] font-mono bg-[#a855f7]/10 text-[#a855f7] border border-[#a855f7]/30 hover:bg-[#a855f7]/20 flex items-center gap-1"
                >
                  <Settings size={11} /> Edytuj
                </button>
              </div>
            </div>
          </div>

          {/* Preferences summary */}
          <div className="bg-[#181828] border border-[#383850] p-4 mb-4">
            <div className="text-[10px] font-mono uppercase text-[#8888aa] mb-2">Profil</div>
            <div className="grid grid-cols-2 gap-3 text-xs font-mono">
              <div>
                <div className="text-[#8888aa]">Kategoria</div>
                <div className="text-[#e8e8f5]">{getCategoryLabel((m.category as any) || 'family')}</div>
              </div>
              <div>
                <div className="text-[#8888aa]">Rola</div>
                <div className="text-[#e8e8f5]">{m.role}</div>
              </div>
              {m.age > 0 && (
                <div>
                  <div className="text-[#8888aa]">Wiek</div>
                  <div className="text-[#e8e8f5]">{m.age} lat</div>
                </div>
              )}
              {prefs && prefs.zodiacSign != null && (
                <div>
                  <div className="text-[#8888aa]">Znak zodiaku</div>
                  <div className="text-[#ffd93d]">{String(prefs.zodiacSign)}</div>
                </div>
              )}
              {m.photoUrl && (
                <div className="col-span-2">
                  <div className="text-[#8888aa]">Zdjęcie</div>
                  <div className="text-[#4ade80]">Dodane ({m.photoUrl})</div>
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className="flex-1 flex overflow-hidden">
      {/* ─── SIDEBAR (left): square user cards grid ─── */}
      <aside className="w-64 shrink-0 border-r border-[#383850] bg-[#12121c] flex flex-col">
        {/* Header */}
        <div className="px-3 py-2 border-b border-[#383850] flex items-center justify-between">
          <h2 className="font-pixel text-[10px] text-[#4ade80]">LUDZIE BOKA</h2>
          <div className="flex gap-0">
            <button onClick={() => openAdd('family')}
              className="w-6 h-6 flex items-center justify-center bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4] hover:bg-[#00f5d4]/20"
              title="Dodaj członka rodziny"
            >
              <Plus size={12} />
            </button>
            <button onClick={() => openAdd('other')}
              className="w-6 h-6 flex items-center justify-center bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/20"
              title="Dodaj inną osobę"
            >
              <User size={12} />
            </button>
          </div>
        </div>

        {/* Child safety toggle (compact) */}
        <button
          onClick={toggleChildNearby}
          className={`px-3 py-2 border-b border-[#383850] flex items-center gap-2 text-left transition-all ${
            childNearby ? 'bg-[#4ade80]/5' : 'bg-transparent'
          }`}
        >
          <Baby size={16} className={childNearby ? 'text-[#4ade80]' : 'text-[#8888aa]'} />
          <div className="flex-1 min-w-0">
            <div className="text-[11px] font-mono text-[#e8e8f5]">
              {childNearby ? 'Tryb: Dziecko' : 'Tryb: Standard'}
            </div>
            <div className="text-[9px] text-[#8888aa] font-mono">
              {childNearby ? 'Filtr języka AKTYWNY' : 'Filtr języka OFF'}
            </div>
          </div>
          <div className={`w-2 h-2 rounded-full ${childNearby ? 'bg-[#4ade80]' : 'bg-[#6b6b8d]'}`} />
        </button>

        {/* Family section */}
        {familyMembers.length > 0 && (
          <div className="border-b border-[#383850]">
            <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-[#00f5d4] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#00f5d4]" />
              RODZINA ({familyMembers.length})
            </div>
            <div className="pb-1">
              {familyMembers.map(renderSquareCard)}
            </div>
          </div>
        )}

        {/* Other people section */}
        {otherMembers.length > 0 && (
          <div className="border-b border-[#383850]">
            <div className="px-3 py-1.5 text-[9px] font-mono uppercase tracking-wider text-[#a855f7] flex items-center gap-1.5">
              <span className="w-1.5 h-1.5 rounded-full bg-[#a855f7]" />
              INNE OSOBY ({otherMembers.length})
            </div>
            <div className="pb-1">
              {otherMembers.map(renderSquareCard)}
            </div>
          </div>
        )}

        {/* Empty hint */}
        {otherMembers.length === 0 && (
          <div className="p-3 text-[9px] text-[#5a5a78] font-mono leading-tight border-b border-[#383850]">
            Brak „innych osób". Dodaj znajomych, kolegów, sąsiadów — tych, którzy pojawiają się w rozmowach ale nie są rodziną.
          </div>
        )}

        <div className="flex-1" />
      </aside>

      {/* ─── DETAIL PANEL (right) ─── */}
      {renderMemberDetail()}

      {/* ─── Add/Edit modal ─── */}
      {showAddPerson && (
        <div className="fixed inset-0 bg-black/70 flex items-center justify-center z-50 p-4" onClick={() => setShowAddPerson(false)}>
          <div className="bg-[#252535] border border-[#383850]  p-6 max-w-md w-full max-h-[90vh] overflow-y-auto" onClick={e => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-lg font-bold text-[#e8e8f5]">
                {editingMember ? 'Edytuj osobę' : 'Dodaj nową osobę'}
              </h2>
              <button onClick={() => setShowAddPerson(false)} className="text-[#8888aa] hover:text-[#e8e8f5]">
                <X size={20} />
              </button>
            </div>

            {/* Photo upload section — only when editing existing member */}
            {editingMember && (
              <div className="mb-4">
                <label className="text-xs text-[#8888aa] font-mono mb-2 block">Zdjęcie profilowe</label>
                <div className="flex items-center gap-3">
                  <div className="w-20 h-20 bg-[#181828] border border-[#383850] overflow-hidden shrink-0">
                    {formPhotoUrl ? (
                      <img
                        src={`/api/family/photo/file?id=${encodeURIComponent(editingMember.id)}&t=${formPhotoUrl.split('.').slice(-2, -1)[0] || ''}`}
                        alt="Podgląd"
                        className="w-full h-full object-cover"
                        referrerPolicy="no-referrer"
                      />
                    ) : (
                      <div className="w-full h-full flex items-center justify-center">
                        <PixelAvatar
                          name={formName || '?'}
                          category={formCategory}
                          color={formColor || undefined}
                          role={formRole}
                          size={48}
                          showRing={false}
                        />
                      </div>
                    )}
                  </div>
                  <div className="flex-1 flex flex-col gap-1">
                    <input
                      ref={photoInputRef}
                      type="file"
                      accept="image/jpeg,image/png,image/webp,image/gif"
                      className="hidden"
                      onChange={e => {
                        const f = e.target.files?.[0];
                        if (f) handlePhotoUpload(f);
                        e.target.value = '';
                      }}
                    />
                    <button
                      type="button"
                      onClick={() => photoInputRef.current?.click()}
                      disabled={photoUploading}
                      className="px-3 py-1.5 text-xs font-mono bg-[#a855f7]/10 border border-[#a855f7]/30 text-[#a855f7] hover:bg-[#a855f7]/20 disabled:opacity-50 flex items-center gap-1 justify-center"
                    >
                      <Upload size={11} /> {photoUploading ? 'Przesyłanie...' : (formPhotoUrl ? 'Zmień zdjęcie' : 'Dodaj zdjęcie')}
                    </button>
                    {formPhotoUrl && (
                      <button
                        type="button"
                        onClick={handlePhotoDelete}
                        disabled={photoUploading}
                        className="px-3 py-1.5 text-[10px] font-mono bg-[#ff6b6b]/5 border border-[#ff6b6b]/20 text-[#ff6b6b] hover:bg-[#ff6b6b]/10 disabled:opacity-50 flex items-center gap-1 justify-center"
                      >
                        <Trash2 size={10} /> Usuń zdjęcie
                      </button>
                    )}
                    <div className="text-[9px] text-[#5a5a78] font-mono mt-1">
                      Max 5MB · JPG/PNG/WEBP/GIF · zapisywane w public/uploads/family-photos/
                    </div>
                  </div>
                </div>
              </div>
            )}

            {/* Live preview */}
            <div className="flex items-center gap-0 mb-2 p-2 bg-[#181828] ">
              {formPhotoUrl && editingMember ? (
                <img
                  src={`/api/family/photo/file?id=${encodeURIComponent(editingMember.id)}&t=${formPhotoUrl.split('.').slice(-2, -1)[0] || ''}`}
                  alt="Podgląd"
                  className="w-14 h-14 object-cover border border-[#383850]"
                  referrerPolicy="no-referrer"
                />
              ) : (
                <PixelAvatar
                  name={formName || '?'}
                  category={formCategory}
                  color={formColor || undefined}
                  role={formRole}
                  size={56}
                />
              )}
              <div>
                <div className="text-sm text-[#e8e8f5] font-bold">{formName || '(imię)'}</div>
                <div className="text-[10px] text-[#8888aa] font-mono">
                  {getCategoryLabel(formCategory)} · {formRole}
                </div>
              </div>
            </div>

            <div className="space-y-2">
              <div>
                <label className="text-xs text-[#8888aa] font-mono mb-1 block">Imię</label>
                <input type="text" value={formName} onChange={e => setFormName(e.target.value)}
                  placeholder="np. Kasia, Wujek Jan, Kolega Tomek"
                  className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5]" />
              </div>

              <div>
                <label className="text-xs text-[#8888aa] font-mono mb-1 block">Kategoria (określa kolor)</label>
                <div className="grid grid-cols-5 gap-1">
                  {(['family', 'friend', 'colleague', 'acquaintance', 'other'] as const).map(cat => {
                    const colors: Record<string, string> = {
                      family: '#00f5d4', friend: '#a855f7', colleague: '#6ec6e7',
                      acquaintance: '#ffd93d', other: '#6b6b8d',
                    };
                    return (
                      <button key={cat} onClick={() => setFormCategory(cat)}
                        className={`px-1 py-1.5  text-[9px] font-mono border transition-all ${
                          formCategory === cat ? 'border-2' : 'border opacity-50 hover:opacity-100'
                        }`}
                        style={{ borderColor: colors[cat], color: colors[cat] }}>
                        {getCategoryLabel(cat)}
                      </button>
                    );
                  })}
                </div>
              </div>

              <div className="grid grid-cols-2 gap-0">
                <div>
                  <label className="text-xs text-[#8888aa] font-mono mb-1 block">Rola</label>
                  <select value={formRole} onChange={e => setFormRole(e.target.value)}
                    className="w-full bg-[#181828] border border-[#383850]  px-2 py-2 text-sm text-[#e8e8f5]">
                    <option value="other">Inna</option>
                    <option value="parent">Rodzic</option>
                    <option value="partner">Partnerka/Partner</option>
                    <option value="child">Dziecko</option>
                    <option value="friend">Przyjaciel/Przyjaciółka</option>
                    <option value="colleague">Kolega/Koleżanka</option>
                    <option value="relative">Krewny</option>
                    <option value="neighbour">Sąsiad</option>
                    <option value="teacher">Nauczyciel</option>
                  </select>
                </div>
                <div>
                  <label className="text-xs text-[#8888aa] font-mono mb-1 block">Wiek</label>
                  <input type="number" value={formAge} onChange={e => setFormAge(parseInt(e.target.value) || 0)}
                    min="0" max="120"
                    className="w-full bg-[#181828] border border-[#383850]  px-3 py-2 text-sm text-[#e8e8f5]" />
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8888aa] font-mono mb-1 block">
                  Kolor (opcjonalny override, hex)
                </label>
                <div className="flex gap-0">
                  <input type="text" value={formColor} onChange={e => setFormColor(e.target.value)}
                    placeholder="np. #ff6b6b (puste = kolor kategorii)"
                    className="flex-1 bg-[#181828] border border-[#383850]  px-3 py-2 text-sm font-mono text-[#e8e8f5]" />
                  {formColor && (
                    <div className="w-10  border border-[#383850]" style={{ backgroundColor: formColor }} />
                  )}
                </div>
              </div>

              <div>
                <label className="text-xs text-[#8888aa] font-mono mb-1 block">
                  Emoji (gdyby potrzebne, awatar pixelowy ma priorytet)
                </label>
                <input type="text" value={formEmoji} onChange={e => setFormEmoji(e.target.value)}
                  maxLength={4}
                  className="w-20 bg-[#181828] border border-[#383850]  px-3 py-2 text-center text-lg text-[#e8e8f5]" />
              </div>
            </div>

            <div className="flex gap-0 mt-5">
              <button onClick={handleSubmit} disabled={saving || !formName.trim()}
                className="flex-1 px-3 py-2 bg-[#00f5d4]/10 border border-[#00f5d4]/30 text-[#00f5d4]  text-sm hover:bg-[#00f5d4]/20 disabled:opacity-50">
                {saving ? 'Zapisywanie...' : (editingMember ? 'Zapisz zmiany' : 'Dodaj osobę')}
              </button>
              <button onClick={() => setShowAddPerson(false)}
                className="px-3 py-2 bg-[#252535] border border-[#383850] text-[#8888aa]  text-sm hover:bg-[#2a2a3a]">
                Anuluj
              </button>
            </div>

            {editingMember && editingMember.category !== 'family' && (
              <button onClick={() => handleDelete(editingMember)}
                className="mt-3 w-full px-3 py-2 bg-[#ff6b6b]/5 border border-[#ff6b6b]/20 text-[#ff6b6b]  text-xs hover:bg-[#ff6b6b]/10">
                <Trash2 size={12} className="inline mr-1" /> Usuń tę osobę
              </button>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════
// SETTINGS TAB — Provider, API Keys, Model
// ═══════════════════════════════════════════
type ProviderType = 'z-ai-sdk' | 'openrouter' | 'ollama' | 'gguf' | 'custom';

interface SettingsState {
  provider: ProviderType;
  openrouterKey: string;
  openrouterModel: string;
  ollamaUrl: string;
  ollamaModel: string;
  // GGUF
  ggufFilePath: string;
  ggufServerPath: string;
  ggufPort: number;
  ggufContextSize: number;
  ggufGpuLayers: number;
  customUrl: string;
  customKey: string;
  customModel: string;
  temperature: number;
  maxTokens: number;
  // Cost control
  topP?: number;
  frequencyPenalty?: number;
  presencePenalty?: number;
  adaptiveMaxTokens?: boolean;
  maxTokensShort?: number;
  maxTokensLong?: number;
  shortPromptThreshold?: number;
  cacheSystemPrompt?: boolean;
  stopSequences?: string[];
  // Memory & ASR
  memoryFolder?: string;
  asrEngine: 'auto' | 'whisper' | 'z-ai-sdk';
  whisperUrl: string;
  whisperModel: string;
}

// ═══════════════════════════════════════════
// VAULT TAB — Obsidian-style notes browser
// ═══════════════════════════════════════════

interface VaultNoteData {
  id: string;
  noteType: string;
  title: string;
  frontmatter: string;
  content: string;
  tags: string;
  memberId?: string;
  emotion?: string;
  importance: number;
  isPinned: boolean;
  backlinkCount: number;
  updatedAt: string;
  createdAt: string;
}

