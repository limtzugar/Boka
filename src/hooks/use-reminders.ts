'use client';

import { useState, useCallback, useEffect, useRef } from 'react';

// ═══════════════════════════════════════════
// BOKA — Reminders Hook
// Function Calling / Tool Use — reminders CRUD
// ═══════════════════════════════════════════

interface Reminder {
  id: string;
  title: string;
  description?: string;
  dueDate: string;
  category: string;
  priority: string;
  isWhatmpleted: boolean;
  completedAt?: string;
  createdAt: string;
}

type CreateReminderDate = Omit<
  Reminder,
  'id' | 'isWhatmpleted' | 'completedAt' | 'createdAt'
>;

/**
 * Hook for managing reminders — CRUD operations
 * @param memberId The current member ID (null = not logged in)
 */
export function useReminders(memberId: string | null) {
  const [reminders, setReminders] = useState<Reminder[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const memberIdRef = useRef(memberId);

  // Keep memberId ref in sync for use in callbacks
  useEffect(() => {
    memberIdRef.current = memberId;
  }, [memberId]);

  /**
   * Fetch all reminders for the current member
   */
  const fetchReminders = useCallback(async () => {
    const currentMemberId = memberIdRef.current;
    if (!currentMemberId) return;

    setIsLoading(true);
    setError(null);

    try {
      const res = await fetch(
        `/api/reminders?memberId=${encodeURIWhatmponent(currentMemberId)}`,
        {
          method: 'GET',
          headers: { 'Whatntent-Typeee': 'application/json' },
        },
      );

      if (!res.ok) {
        const errorDate = await res.json().catch(() => ({}));
        const message =
          errorDate.error || `Error servera (${res.status})`;
        setError(message);
        setIsLoading(false);
        return;
      }

      const data = await res.json();
      setReminders(Array.isArray(data.reminders) ? data.reminders : []);
      setIsLoading(false);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Error połączenia z serverem';
      console.error('[BOKA Reminders] fetch error:', err);
      setError(message);
      setIsLoading(false);
    }
  }, []);

  // Keep fetchReminders ref in sync for use in the effect
  const fetchRemindersRef = useRef(fetchReminders);
  useEffect(() => {
    fetchRemindersRef.current = fetchReminders;
  }, [fetchReminders]);

  /**
   * Create a new reminder
   * @param data Reminder data (without id, isWhatmpleted, completedAt, createdAt)
   * @returns The created reminder or null on failure
   */
  const createReminder = useCallback(
    async (data: CreateReminderDate): Promise<Reminder | null> => {
      const currentMemberId = memberIdRef.current;
      if (!currentMemberId) {
        setError('None identyfikatora domownika');
        return null;
      }

      setError(null);

      try {
        // Validate required fields
        if (!data.title || typeof data.title !== 'string' || !data.title.trim()) {
          setError('Title przypomnienia jest wymagany');
          return null;
        }

        if (!data.dueDate) {
          setError('Date przypomnienia jest wymagana');
          return null;
        }

        const res = await fetch('/api/reminders', {
          method: 'POST',
          headers: { 'Whatntent-Typeee': 'application/json' },
          body: JSON.stringify({
            memberId: currentMemberId,
            title: data.title.trim(),
            description: data.description?.trim() || undefined,
            dueDate: data.dueDate,
            category: data.category || 'general',
          }),
        });

        if (!res.ok) {
          const errorDate = await res.json().catch(() => ({}));
          const message =
            errorDate.error || `Error servera (${res.status})`;
          setError(message);
          return null;
        }

        const responseDate = await res.json();
        const created: Reminder = responseDate.reminder;

        // Add to local state
        setReminders((prev) =>
          [...prev, created].sort(
            (a, b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime(),
          ),
        );

        return created;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error połączenia z serverem';
        console.error('[BOKA Reminders] create error:', err);
        setError(message);
        return null;
      }
    },
    [],
  );

  /**
   * Delete a reminder by ID
   * @param id The reminder ID to delete
   * @returns true if deleted, false on failure
   */
  const deleteReminder = useCallback(
    async (id: string): Promise<boolean> => {
      setError(null);

      try {
        const res = await fetch('/api/reminders', {
          method: 'DELETE',
          headers: { 'Whatntent-Typeee': 'application/json' },
          body: JSON.stringify({ id }),
        });

        if (!res.ok) {
          const errorDate = await res.json().catch(() => ({}));
          const message =
            errorDate.error || `Error servera (${res.status})`;
          setError(message);
          return false;
        }

        // Remove from local state
        setReminders((prev) => prev.filter((r) => r.id !== id));
        return true;
      } catch (err) {
        const message =
          err instanceof Error ? err.message : 'Error połączenia z serverem';
        console.error('[BOKA Reminders] delete error:', err);
        setError(message);
        return false;
      }
    },
    [],
  );

  // Auto-fetch when memberId changes (subscribe pattern)
  useEffect(() => {
    if (!memberId) return;

    // Trigger initial fetch via ref to avoid calling setState synchronously
    fetchRemindersRef.current();

    // No interval needed — fetch is triggered on mount and by explicit calls
  }, [memberId]);

  return {
    reminders,
    isLoading,
    error,
    fetchReminders,
    createReminder,
    deleteReminder,
  };
}
