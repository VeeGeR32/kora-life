import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';
import { Dumbbell, Play, Timer, X } from 'lucide-react';
import type { AIDomain, ActiveTab, CalendarOccurrence } from './types';
import { AppProvider, useApp } from './context/AppContext';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { AIProvider, useAI } from './context/AIContext';
import { AuthGate } from './components/AuthGate';
import { KoraLogo } from './components/ui/KoraLogo';
import { Layout } from './components/Layout';
import { TodayView } from './components/TodayView';
import { PlanningView } from './components/PlanningView';
import { StudiesView } from './components/StudiesView';
import { SportView } from './components/SportView';
import { QuickAddModal, type QuickAddContext } from './components/QuickAddModal';
import { EventDetailDrawer } from './components/EventDetailDrawer';
import { SettingsModal } from './components/SettingsModal';
import { AIAssistantDrawer } from './components/AIAssistantDrawer';
import { AIPreviewBar } from './components/AIPreviewBar';
import { FocusModal } from './components/FocusModal';
import { LiveWorkoutModal } from './components/sport/LiveWorkoutModal';
import { WeeklyReviewModal } from './components/WeeklyReviewModal';
import { sendKoraNotification } from './lib/notifications';

function tabToDomain(tab: ActiveTab): AIDomain {
  if (tab === 'studies') return 'cours';
  if (tab === 'sport') return 'sport';
  if (tab === 'music') return 'music';
  return 'general';
}

function fmtMMSS(sec: number): string {
  const s = Math.max(0, Math.floor(sec));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
}

function KoraApp() {
  const {
    state,
    cloudConfigured,
    cloudUser,
    authReady,
    lastCloudSyncAt,
    workoutModalOpen,
    setWorkoutModalOpen,
    discardActiveWorkout,
    completeActiveFocus,
    updateLastSession,
  } = useApp();
  const { openAI, requestAIConfirmation } = useAI();

  const [activeTab, setActiveTabState] = useState<ActiveTab>(
    () => {
      const t = state.preferences.lastSession?.activeTab;
      return t && t !== 'music' ? t : 'today';
    }
  );
  const [quickAddOpen, setQuickAddOpen] = useState(false);
  const [quickAddCtx, setQuickAddCtx] = useState<QuickAddContext | undefined>(undefined);
  const [selectedOccurrence, setSelectedOccurrence] = useState<CalendarOccurrence | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [focusOpen, setFocusOpen] = useState(false);
  const [weeklyOpen, setWeeklyOpen] = useState(false);
  const [focusNowMs, setFocusNowMs] = useState(() => Date.now());

  const autoOpenedFocusIdRef = useRef<string | null>(null);
  const bootTimestampRef = useRef<number>(Date.now());
  const localRestoredRef = useRef(false);
  const cloudRestoredRef = useRef(false);

  const setActiveTab = useCallback(
    (next: ActiveTab) => {
      setActiveTabState(next);
      updateLastSession({ activeTab: next, scrollY: 0 });
    },
    [updateLastSession]
  );

  const activeFocus = state.preferences.activeFocus || null;
  const activeWorkout = state.preferences.activeWorkout || null;

  // Restore exact last session (tab, scroll position & audio track/timestamp) on app launch & cloud hydration!
  useEffect(() => {
    const ls = state.preferences.lastSession;
    if (!ls) return;

    const shouldApplyLocal = !localRestoredRef.current;
    const shouldApplyCloud =
      Boolean(lastCloudSyncAt) &&
      !cloudRestoredRef.current &&
      ls.savedAt > 0 &&
      ls.savedAt <= bootTimestampRef.current + 15_000;

    if (!shouldApplyLocal && !shouldApplyCloud) return;
    if (shouldApplyLocal) localRestoredRef.current = true;
    if (lastCloudSyncAt) cloudRestoredRef.current = true;

    if (ls.activeTab && ls.activeTab !== 'music') {
      setActiveTabState(ls.activeTab);
    }

    if (typeof ls.scrollY === 'number' && ls.scrollY > 20) {
      const targetY = ls.scrollY;
      window.setTimeout(() => {
        window.scrollTo({ top: targetY, behavior: 'auto' });
      }, 120);
    }
  }, [
    lastCloudSyncAt,
    state.preferences.lastSession?.savedAt,
    state.musicTracks.length,
  ]);

  // Persist exact scroll position when leaving / closing the app on any device
  useEffect(() => {
    const saveScroll = () => {
      updateLastSession({ scrollY: Math.round(window.scrollY || 0) });
    };
    const onVis = () => {
      if (document.visibilityState === 'hidden') saveScroll();
    };
    window.addEventListener('pagehide', saveScroll);
    document.addEventListener('visibilitychange', onVis);
    return () => {
      window.removeEventListener('pagehide', saveScroll);
      document.removeEventListener('visibilitychange', onVis);
    };
  }, [updateLastSession]);

  const openQuickAdd = useCallback((ctx?: QuickAddContext) => {
    setQuickAddCtx(ctx);
    setQuickAddOpen(true);
  }, []);

  // Auto-open FocusModal on app launch AND across all synced devices whenever a Focus session is active!
  useEffect(() => {
    if (!activeFocus) {
      autoOpenedFocusIdRef.current = null;
      return;
    }
    if (activeFocus.endsAt > Date.now() && autoOpenedFocusIdRef.current !== activeFocus.id) {
      autoOpenedFocusIdRef.current = activeFocus.id;
      setFocusOpen(true);
    }
  }, [activeFocus?.id, activeFocus?.endsAt]);

  // Global background Focus ticker & auto-completion (never pauses when closed!)
  useEffect(() => {
    if (!activeFocus) return;
    const check = () => {
      const now = Date.now();
      setFocusNowMs(now);
      if (now >= activeFocus.endsAt) {
        if (state.preferences.notifications?.enabled && state.preferences.notifications?.timers) {
          void sendKoraNotification({
            title: 'Session Focus terminée ✓',
            body: `${activeFocus.presetMin} min sur « ${activeFocus.label} » validées.`,
            tag: `kora-focus-${activeFocus.id}`,
          });
        }
        completeActiveFocus();
      }
    };
    check();
    const id = window.setInterval(check, 1000);
    return () => window.clearInterval(id);
  }, [
    activeFocus?.id,
    activeFocus?.endsAt,
    activeFocus?.presetMin,
    activeFocus?.label,
    completeActiveFocus,
    state.preferences.notifications?.enabled,
    state.preferences.notifications?.timers,
  ]);

  // Global keyboard shortcuts (Ctrl+K Quick-Add, Ctrl+J Kora AI, 1-5 tabs)
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'k') {
        e.preventDefault();
        openQuickAdd();
        return;
      }
      if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'j') {
        e.preventDefault();
        openAI(tabToDomain(activeTab));
        return;
      }

      const target = e.target as HTMLElement | null;
      const isInput =
        target &&
        (target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA' ||
          target.tagName === 'SELECT' ||
          target.isContentEditable);

      if (isInput || e.metaKey || e.ctrlKey || e.altKey || quickAddOpen || settingsOpen) {
        return;
      }

      if (e.key === '1') setActiveTab('today');
      else if (e.key === '2') setActiveTab('planning');
      else if (e.key === '3') setActiveTab('studies');
      else if (e.key === '4') setActiveTab('sport');
    };

    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [openQuickAdd, openAI, activeTab, quickAddOpen, settingsOpen]);

  // Require Login / Sign-up on launch when Firebase DB is pre-loaded
  if (cloudConfigured && !authReady) {
    return (
      <div className="min-h-[100dvh] flex flex-col items-center justify-center gap-3 bg-[var(--bg)]">
        <KoraLogo size={42} />
        <span className="text-xs text-slate-400 animate-pulse">Chargement de ton espace…</span>
      </div>
    );
  }

  if (cloudConfigured && !cloudUser) {
    return <AuthGate />;
  }

  const focusRemainingSec = activeFocus
    ? Math.max(0, Math.ceil((activeFocus.endsAt - focusNowMs) / 1000))
    : 0;
  const workoutDoneSets = activeWorkout
    ? activeWorkout.session.exercises.reduce(
        (acc, ex) => acc + ex.sets.filter((s) => s.done).length,
        0
      )
    : 0;
  const workoutTotalSets = activeWorkout
    ? activeWorkout.session.exercises.reduce((acc, ex) => acc + ex.sets.length, 0)
    : 0;

  return (
    <Layout
      activeTab={activeTab}
      onTabChange={setActiveTab}
      onOpenQuickAdd={() => openQuickAdd()}
      onOpenAI={() => openAI(tabToDomain(activeTab))}
      onOpenFocus={() => setFocusOpen(true)}
      onOpenSettings={() => setSettingsOpen(true)}
    >
      {/* Persistent Resume Workout Banner (visible across all tabs when paused / minimized) */}
      {activeWorkout && !workoutModalOpen && (
        <div className="mb-4 rounded-2xl border border-emerald-500/30 bg-emerald-500/10 dark:bg-emerald-950/35 px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
              <Dumbbell size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate">
                Séance en pause · {activeWorkout.session.title}
              </p>
              <p className="text-[11px] font-mono text-emerald-700 dark:text-emerald-300 tabular-nums">
                {fmtMMSS(activeWorkout.elapsedSec)}
                {workoutTotalSets > 0 ? ` · ${workoutDoneSets}/${workoutTotalSets} séries` : ''}
              </p>
            </div>
          </div>
          <div className="flex items-center gap-1.5 shrink-0">
            <button
              type="button"
              onClick={() => setWorkoutModalOpen(true)}
              className="inline-flex items-center gap-1 rounded-xl bg-emerald-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-emerald-700 cursor-pointer"
            >
              <Play size={11} /> Reprendre
            </button>
            <button
              type="button"
              onClick={discardActiveWorkout}
              title="Abandonner la séance"
              className="p-1.5 rounded-lg text-slate-400 hover:text-rose-500 cursor-pointer"
            >
              <X size={14} />
            </button>
          </div>
        </div>
      )}

      {/* Persistent Live Focus Banner (when minimized during current session) */}
      {activeFocus && !focusOpen && focusRemainingSec > 0 && (
        <div className="mb-4 rounded-2xl border border-indigo-500/30 bg-indigo-500/10 dark:bg-indigo-950/35 px-3.5 py-2.5 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="h-8 w-8 rounded-xl bg-indigo-600 text-white flex items-center justify-center shrink-0">
              <Timer size={15} />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-semibold text-slate-900 dark:text-zinc-100 truncate">
                Focus en cours · {activeFocus.label}
              </p>
              <p className="text-[11px] font-mono text-indigo-700 dark:text-indigo-300 tabular-nums">
                {fmtMMSS(focusRemainingSec)} restant
              </p>
            </div>
          </div>
          <button
            type="button"
            onClick={() => setFocusOpen(true)}
            className="rounded-xl bg-indigo-600 text-white px-3 py-1.5 text-xs font-semibold hover:bg-indigo-700 cursor-pointer shrink-0"
          >
            Ouvrir
          </button>
        </div>
      )}

      <AIPreviewBar />

      <AnimatePresence mode="wait">
        <motion.div
          key={activeTab}
          initial={{ opacity: 0, y: 8 }}
          animate={{ opacity: 1, y: 0 }}
          exit={{ opacity: 0, y: -6 }}
          transition={{ duration: 0.15, ease: 'easeOut' }}
        >
          {activeTab === 'today' && (
            <TodayView
              onOpenQuickAdd={openQuickAdd}
              onSelectOccurrence={setSelectedOccurrence}
              onNavigate={setActiveTab}
              onOpenFocus={() => setFocusOpen(true)}
              onOpenWeeklyReview={() => setWeeklyOpen(true)}
              onRequestAI={requestAIConfirmation}
            />
          )}
          {activeTab === 'planning' && (
            <PlanningView
              onOpenQuickAdd={openQuickAdd}
              onSelectOccurrence={setSelectedOccurrence}
            />
          )}
          {activeTab === 'studies' && (
            <StudiesView onOpenQuickAdd={openQuickAdd} onRequestAI={requestAIConfirmation} />
          )}
          {activeTab === 'sport' && (
            <SportView onOpenQuickAdd={openQuickAdd} onRequestAI={requestAIConfirmation} />
          )}
        </motion.div>
      </AnimatePresence>

      <QuickAddModal
        open={quickAddOpen}
        initial={quickAddCtx}
        onClose={() => setQuickAddOpen(false)}
      />

      <EventDetailDrawer
        occurrence={selectedOccurrence}
        onClose={() => setSelectedOccurrence(null)}
        onNavigate={setActiveTab}
      />

      {/* Non-blocking Floating Kora AI Overlay */}
      <AIAssistantDrawer onNavigate={setActiveTab} />

      {/* Persistent Global Live Workout Modal */}
      <LiveWorkoutModal />

      {/* Persistent Global Cross-Device Focus Modal */}
      <FocusModal open={focusOpen} onClose={() => setFocusOpen(false)} />

      <WeeklyReviewModal
        open={weeklyOpen}
        onClose={() => setWeeklyOpen(false)}
        onRequestAI={requestAIConfirmation}
      />

      <SettingsModal open={settingsOpen} onClose={() => setSettingsOpen(false)} />
    </Layout>
  );
}

export default function App() {
  return (
    <AppProvider>
      <AudioPlayerProvider>
        <AIProvider>
          <KoraApp />
        </AIProvider>
      </AudioPlayerProvider>
    </AppProvider>
  );
}
