import React, { useEffect, useMemo, useState } from 'react';
import { motion } from 'framer-motion';
import {
  ArrowUpRight,
  BarChart3,
  Check,
  Clock,
  Disc3,
  Droplets,
  Dumbbell,
  ExternalLink,
  MapPin,
  Play,
  Plus,
  Scale,
  Sparkles,
  Timer,
  Utensils,
  X,
} from 'lucide-react';
import type { AIDomain, ActiveTab, CalendarOccurrence } from '../types';
import { useApp } from '../context/AppContext';
import { useAI } from '../context/AIContext';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import {
  diffDays,
  formatCountdownBadge,
  formatDurationLabel,
  formatLongDateFR,
  formatRelativeMinutes,
  getOccurrencesForDate,
  timeToMinutes,
  todayISO,
} from '../utils/dates';
import { EVENT_STYLES, PRIORITY_STYLES } from '../utils/theme';
import { CheckCircle } from './ui/CheckCircle';
import { ProgressRing } from './ui/ProgressRing';
import { WeightChart } from './ui/WeightSparkline';
import type { QuickAddContext } from './QuickAddModal';

interface TodayViewProps {
  onOpenQuickAdd: (ctx?: QuickAddContext) => void;
  onSelectOccurrence: (occ: CalendarOccurrence) => void;
  onNavigate: (tab: ActiveTab) => void;
  onOpenFocus: () => void;
  onOpenWeeklyReview: () => void;
  onRequestAI: (prompt: string, domain?: AIDomain) => void;
}

export function TodayView({
  onOpenQuickAdd,
  onSelectOccurrence,
  onNavigate,
  onOpenFocus,
  onOpenWeeklyReview,
  onRequestAI,
}: TodayViewProps) {
  const { state, toggleHomework, toggleTask, addTask, addWater } = useApp();
  const { draftActions, applyDraftAction, dismissDraftAction } = useAI();
  const player = useAudioPlayer();
  const [quickTaskTitle, setQuickTaskTitle] = useState('');
  const [nowMinutes, setNowMinutes] = useState(() => {
    const d = new Date();
    return d.getHours() * 60 + d.getMinutes();
  });

  const today = todayISO();

  useEffect(() => {
    const id = window.setInterval(() => {
      const d = new Date();
      setNowMinutes(d.getHours() * 60 + d.getMinutes());
    }, 30_000);
    return () => window.clearInterval(id);
  }, []);

  const todayOccurrences = useMemo(() => getOccurrencesForDate(state, today), [state, today]);

  // Draft AI previews relevant to Today
  const draftTodayEvents = useMemo(
    () =>
      draftActions.filter(
        (d) => d.action.kind === 'add_schedule_event' && d.action.payload.date === today
      ),
    [draftActions, today]
  );

  const draftTodayTasks = useMemo(
    () =>
      draftActions.filter(
        (d) => d.action.kind === 'add_task' || d.action.kind === 'add_homework'
      ),
    [draftActions]
  );

  const spotlight = useMemo(() => {
    for (const occ of todayOccurrences) {
      const start = timeToMinutes(occ.startTime);
      const end = timeToMinutes(occ.endTime);
      if (nowMinutes >= start && nowMinutes < end) {
        return { kind: 'now' as const, occ, remainingMin: end - nowMinutes };
      }
      if (start > nowMinutes) {
        return { kind: 'next' as const, occ, untilMin: start - nowMinutes };
      }
    }
    return null;
  }, [todayOccurrences, nowMinutes]);

  const upcomingExams = useMemo(
    () =>
      state.exams
        .filter((e) => !e.done && diffDays(today, e.date) >= 0)
        .sort((a, b) => a.date.localeCompare(b.date))
        .slice(0, 2),
    [state.exams, today]
  );

  const focusHomework = useMemo(
    () =>
      state.homework
        .filter((h) => !h.done || h.dueDate === today)
        .sort((a, b) => (a.done !== b.done ? (a.done ? 1 : -1) : a.dueDate.localeCompare(b.dueDate)))
        .slice(0, 4),
    [state.homework, today]
  );

  const focusTasks = useMemo(
    () =>
      state.tasks
        .filter((t) => !t.done || t.dueDate === today)
        .sort((a, b) =>
          a.done !== b.done ? (a.done ? 1 : -1) : (a.dueDate || '9999').localeCompare(b.dueDate || '9999')
        )
        .slice(0, 5),
    [state.tasks, today]
  );

  const todayMeals = useMemo(() => state.meals.filter((m) => m.date === today), [state.meals, today]);
  const totals = useMemo(
    () =>
      todayMeals.reduce(
        (acc, m) => ({ calories: acc.calories + m.calories, protein: acc.protein + m.protein }),
        { calories: 0, protein: 0 }
      ),
    [todayMeals]
  );
  const goals = state.preferences.nutritionGoals;
  const waterMl = state.waterMlByDate[today] || 0;
  const todayWorkout = useMemo(() => state.workouts.find((w) => w.date === today) || null, [state.workouts, today]);
  const sortedWeights = useMemo(
    () => [...state.weights].sort((a, b) => a.date.localeCompare(b.date)),
    [state.weights]
  );
  const latestWeight = sortedWeights[sortedWeights.length - 1] || null;
  const firstWeight = sortedWeights[0] || null;
  const weightDelta =
    latestWeight && firstWeight && sortedWeights.length > 1
      ? latestWeight.weightKg - firstWeight.weightKg
      : null;

  const activeProject = state.musicProjects[0] || null;
  const latestTrack = state.musicTracks[0] || null;

  const rhythmScore = useMemo(() => {
    const items: number[] = [];
    state.tasks.filter((t) => t.dueDate === today).forEach((t) => items.push(t.done ? 1 : 0));
    state.homework.filter((h) => h.dueDate === today).forEach((h) => items.push(h.done ? 1 : 0));
    if (todayWorkout) {
      const sets = todayWorkout.exercises.flatMap((e) => e.sets);
      items.push(sets.length > 0 ? sets.filter((s) => s.done).length / sets.length : todayWorkout.completed ? 1 : 0);
    }
    if (goals.waterMl > 0) items.push(Math.min(1, waterMl / goals.waterMl));
    if (goals.calories > 0 && todayMeals.length > 0) items.push(Math.min(1, totals.calories / goals.calories));
    if (items.length === 0) return 0;
    return Math.round((items.reduce((a, b) => a + b, 0) / items.length) * 100);
  }, [state.tasks, state.homework, today, todayWorkout, goals, waterMl, todayMeals, totals]);

  const greeting = useMemo(() => {
    const h = new Date().getHours();
    const base = h < 5 ? 'Bonne nuit' : h < 12 ? 'Bonjour' : h < 18 ? 'Bon après-midi' : 'Bonsoir';
    return state.preferences.name ? `${base}, ${state.preferences.name}` : base;
  }, [state.preferences.name]);

  const handleQuickTaskSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const clean = quickTaskTitle.trim();
    if (!clean) return;
    addTask({ title: clean, dueDate: today, category: 'perso', priority: 'medium', done: false });
    setQuickTaskTitle('');
  };

  return (
    <div className="space-y-5 pb-10">
      {/* Top Minimalist Header + Focus & Bilan */}
      <header className="flex flex-col sm:flex-row sm:items-end justify-between gap-4">
        <div>
          <p className="text-xs font-medium uppercase tracking-widest text-slate-400 dark:text-zinc-500 mb-1">
            {formatLongDateFR(today)}
          </p>
          <h1 className="text-2xl sm:text-3xl font-semibold tracking-tight text-slate-900 dark:text-zinc-50">
            {greeting}
          </h1>

          <div className="flex items-center flex-wrap gap-2 mt-3">
            <button
              type="button"
              onClick={onOpenFocus}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:border-indigo-400 transition cursor-pointer"
            >
              <Timer size={12} className="text-indigo-500" /> Focus
            </button>
            <button
              type="button"
              onClick={onOpenWeeklyReview}
              className="inline-flex items-center gap-1.5 rounded-full border border-slate-200/80 dark:border-zinc-800 bg-white dark:bg-zinc-900 px-3 py-1 text-xs font-medium text-slate-700 dark:text-zinc-200 hover:border-violet-400 transition cursor-pointer"
            >
              <BarChart3 size={12} className="text-violet-500" /> Bilan 7j
            </button>
          </div>
        </div>

        {/* Daily Rhythm Ring */}
        <div className="tempo-card rounded-2xl px-4 py-2.5 flex items-center gap-3.5 self-start sm:self-auto">
          <ProgressRing
            value={rhythmScore}
            size={46}
            strokeWidth={4}
            colorClass="stroke-slate-900 dark:stroke-zinc-100"
          />
          <div>
            <p className="text-xs font-semibold leading-tight">Rythme du jour</p>
            <p className="text-[11px] text-slate-500 dark:text-zinc-400 mt-0.5">
              {todayOccurrences.length} créneau{todayOccurrences.length > 1 ? 'x' : ''} ·{' '}
              {focusHomework.filter((h) => !h.done).length + focusTasks.filter((t) => !t.done).length} restant
            </p>
          </div>
        </div>
      </header>

      {/* Live Focus Spotlight */}
      {spotlight && (
        <motion.div
          initial={{ opacity: 0, y: 6 }}
          animate={{ opacity: 1, y: 0 }}
          onClick={() => onSelectOccurrence(spotlight.occ)}
          className="tempo-card rounded-2xl p-4 sm:px-5 flex flex-col sm:flex-row sm:items-center justify-between gap-3 cursor-pointer hover:border-slate-300 dark:hover:border-zinc-700 transition group"
        >
          <div className="flex items-center gap-3.5 min-w-0">
            <div className="relative flex h-2.5 w-2.5 shrink-0">
              {spotlight.kind === 'now' && (
                <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75" />
              )}
              <span
                className={`relative inline-flex rounded-full h-2.5 w-2.5 ${
                  spotlight.kind === 'now' ? 'bg-emerald-500' : EVENT_STYLES[spotlight.occ.type].dot
                }`}
              />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-[11px] font-semibold uppercase tracking-wider text-slate-500 dark:text-zinc-400">
                  {spotlight.kind === 'now'
                    ? `En cours · ${spotlight.remainingMin} min restantes`
                    : formatRelativeMinutes(spotlight.untilMin)}
                </span>
                <span className="text-slate-300 dark:text-zinc-700">·</span>
                <span className="font-mono text-xs tabular-nums text-slate-500 dark:text-zinc-400">
                  {spotlight.occ.startTime}–{spotlight.occ.endTime}
                </span>
              </div>
              <p className="text-sm sm:text-base font-semibold truncate mt-0.5">
                {spotlight.occ.title}
                {spotlight.occ.location && (
                  <span className="font-normal text-slate-400 ml-2 text-xs">
                    {spotlight.occ.location}
                  </span>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestAI(
                  `Optimise ma journée d'aujourd'hui pour avancer efficacement sur mes cours, mes devoirs, ma séance gym et mes projets Music en utilisant mes créneaux libres.`,
                  'general'
                );
              }}
              className="inline-flex items-center gap-1 rounded-full bg-violet-500/12 text-violet-700 dark:text-violet-300 px-3 py-1.5 text-xs font-medium hover:bg-violet-500/20 cursor-pointer"
            >
              <Sparkles size={12} /> Optimiser IA
            </button>
          </div>
        </motion.div>
      )}

      {/* Main Grid */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-start">
        {/* LEFT: Timeline + Exams */}
        <section className="lg:col-span-7 tempo-card rounded-3xl p-5 sm:p-6">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-sm font-semibold">Ma journée</h2>
              <p className="text-xs text-slate-400 mt-0.5">Cours, sport, music & rendez-vous</p>
            </div>
            <div className="flex items-center gap-1.5">
              <button
                type="button"
                onClick={() => onNavigate('planning')}
                className="rounded-xl px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-zinc-800 cursor-pointer"
              >
                Planning
              </button>
              <button
                type="button"
                onClick={() => onOpenQuickAdd({ mode: 'cours', date: today })}
                className="inline-flex items-center gap-1 rounded-xl bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-950 px-3 py-1.5 text-xs font-medium cursor-pointer"
              >
                <Plus size={13} /> Créneau
              </button>
            </div>
          </div>

          {todayOccurrences.length === 0 && draftTodayEvents.length === 0 ? (
            <div className="py-10 text-center">
              <p className="text-sm text-slate-500">Journée libre</p>
              <button
                type="button"
                onClick={() => onOpenQuickAdd({ mode: 'cours', date: today })}
                className="mt-2 text-xs font-semibold text-indigo-600 dark:text-indigo-400 cursor-pointer"
              >
                + Planifier un créneau
              </button>
            </div>
          ) : (
            <div className="space-y-2.5">
              {todayOccurrences.map((occ) => {
                const startM = timeToMinutes(occ.startTime);
                const endM = timeToMinutes(occ.endTime);
                const isLive = nowMinutes >= startM && nowMinutes < endM;
                const isPast = nowMinutes >= endM;
                const style = EVENT_STYLES[occ.type];

                return (
                  <motion.div
                    key={occ.occurrenceKey}
                    whileHover={{ x: 2 }}
                    onClick={() => onSelectOccurrence(occ)}
                    className={`flex items-stretch gap-3 rounded-2xl border p-3.5 cursor-pointer transition ${
                      isLive
                        ? 'border-slate-900/20 dark:border-zinc-100/25 bg-slate-50/90 dark:bg-zinc-900/90'
                        : 'border-slate-100 dark:border-zinc-800/80 hover:border-slate-200 dark:hover:border-zinc-700 bg-white/50 dark:bg-zinc-900/35'
                    } ${isPast && !isLive ? 'opacity-65 hover:opacity-100' : ''}`}
                  >
                    <div className="w-12 shrink-0 flex flex-col justify-between py-0.5 text-right">
                      <span className="font-mono text-xs font-semibold tabular-nums">{occ.startTime}</span>
                      <span className="font-mono text-[10px] tabular-nums text-slate-400">{occ.endTime}</span>
                    </div>
                    <span className={`w-1 rounded-full ${style.dot}`} />
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center justify-between gap-2">
                        <span className={`text-[10px] font-semibold uppercase tracking-wider ${style.text}`}>
                          {occ.subject || style.label}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400 shrink-0">
                          {formatDurationLabel(occ.startTime, occ.endTime)}
                        </span>
                      </div>
                      <p className={`text-sm font-semibold truncate mt-0.5 ${occ.completed ? 'line-through opacity-60' : ''}`}>
                        {occ.title}
                      </p>
                      {occ.location && (
                        <p className="inline-flex items-center gap-1 text-xs text-slate-500 mt-1">
                          <MapPin size={11} /> {occ.location}
                        </p>
                      )}
                    </div>
                  </motion.div>
                );
              })}

              {/* LIVE AI GHOST PREVIEW EVENTS FOR TODAY */}
              {draftTodayEvents.map((draft) => {
                if (draft.action.kind !== 'add_schedule_event') return null;
                const ev = draft.action.payload;
                return (
                  <div
                    key={draft.id}
                    className="flex items-stretch gap-3 rounded-2xl border-2 border-dashed border-violet-400 dark:border-violet-600 bg-violet-50/60 dark:bg-violet-950/30 p-3.5"
                  >
                    <div className="w-12 shrink-0 flex flex-col justify-between py-0.5 text-right">
                      <span className="font-mono text-xs font-semibold tabular-nums text-violet-700 dark:text-violet-300">
                        {ev.startTime}
                      </span>
                      <span className="font-mono text-[10px] tabular-nums text-violet-500">
                        {ev.endTime}
                      </span>
                    </div>
                    <span className="w-1 rounded-full bg-violet-500" />
                    <div className="flex-1 min-w-0 py-0.5">
                      <div className="flex items-center gap-1.5">
                        <span className="inline-flex items-center gap-1 rounded-full bg-violet-600 text-white px-2 py-0.5 text-[9px] font-semibold">
                          <Sparkles size={9} /> Aperçu IA
                        </span>
                        <span className="text-[10px] font-semibold uppercase text-violet-600 dark:text-violet-400">
                          {EVENT_STYLES[ev.type].label}
                        </span>
                      </div>
                      <p className="text-sm font-semibold truncate mt-0.5">{ev.title}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => applyDraftAction(draft.id)}
                        title="Appliquer"
                        className="h-7 w-7 rounded-lg bg-emerald-600 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Check size={13} />
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissDraftAction(draft.id)}
                        title="Refuser"
                        className="h-7 w-7 rounded-lg bg-white dark:bg-zinc-900 text-slate-500 flex items-center justify-center cursor-pointer"
                      >
                        <X size={13} />
                      </button>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* Upcoming Exams · Notebooks Gemini */}
          {upcomingExams.length > 0 && (
            <div className="mt-5 pt-5 border-t border-slate-100 dark:border-zinc-800/80">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold uppercase tracking-wider text-slate-500 flex items-center gap-1.5">
                  <Sparkles size={13} className="text-violet-500" /> Évals · Notebooks Gemini
                </span>
                <button
                  type="button"
                  onClick={() => onNavigate('studies')}
                  className="text-xs font-medium text-violet-600 dark:text-violet-400 hover:underline cursor-pointer"
                >
                  Cours →
                </button>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5">
                {upcomingExams.map((exam) => {
                  const badge = formatCountdownBadge(exam.date);
                  const total = exam.topics.length;
                  const done = exam.topics.filter((t) => t.done).length;
                  const pct = total > 0 ? Math.round((done / total) * 100) : 0;
                  return (
                    <div
                      key={exam.id}
                      onClick={() => onNavigate('studies')}
                      className="rounded-2xl border border-violet-200/70 dark:border-violet-900/50 bg-violet-50/40 dark:bg-violet-950/20 p-3.5 cursor-pointer hover:border-violet-300 transition"
                    >
                      <div className="flex items-center justify-between gap-2">
                        <span className="text-[11px] font-medium text-violet-700 dark:text-violet-300">
                          {exam.subject}
                        </span>
                        <span className="font-mono text-[10px] font-semibold px-2 py-0.5 rounded-full bg-violet-600 text-white">
                          {badge.label}
                        </span>
                      </div>
                      <p className="text-xs font-semibold mt-1 truncate">{exam.title}</p>
                      {total > 0 && (
                        <div className="mt-2 h-1 rounded-full bg-violet-200/70 dark:bg-violet-950 overflow-hidden">
                          <div className="h-full bg-violet-600 rounded-full" style={{ width: `${pct}%` }} />
                        </div>
                      )}
                      {exam.geminiNotebookUrl && (
                        <a
                          href={exam.geminiNotebookUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          onClick={(e) => e.stopPropagation()}
                          className="mt-2.5 inline-flex items-center gap-1 text-[11px] font-semibold text-violet-700 dark:text-violet-300"
                        >
                          <Sparkles size={10} /> Notebook Gemini <ExternalLink size={10} />
                        </a>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </section>

        {/* RIGHT: Tasks + Sport + Music Pulse */}
        <div className="lg:col-span-5 space-y-5">
          {/* Tasks & Homework */}
          <section className="tempo-card rounded-3xl p-5">
            <div className="flex items-center justify-between mb-3">
              <h2 className="text-sm font-semibold">À faire & Devoirs</h2>
              <button
                type="button"
                onClick={() => onOpenQuickAdd({ mode: 'devoir', date: today })}
                className="text-xs font-medium text-slate-500 hover:text-slate-900 dark:hover:text-zinc-100 cursor-pointer"
              >
                + Devoir
              </button>
            </div>

            <form onSubmit={handleQuickTaskSubmit} className="mb-3">
              <div className="flex items-center gap-2 rounded-xl border border-slate-200/80 dark:border-zinc-800 bg-slate-50/70 dark:bg-zinc-900/60 px-3 py-2">
                <Plus size={14} className="text-slate-400 shrink-0" />
                <input
                  type="text"
                  value={quickTaskTitle}
                  onChange={(e) => setQuickTaskTitle(e.target.value)}
                  placeholder="Ajouter une tâche rapide…"
                  className="w-full bg-transparent text-xs outline-none"
                />
              </div>
            </form>

            <div className="space-y-1">
              {/* LIVE AI GHOST PREVIEW TASKS/HOMEWORK */}
              {draftTodayTasks.map((draft) => {
                const title =
                  draft.action.kind === 'add_task' || draft.action.kind === 'add_homework'
                    ? draft.action.payload.title
                    : '';
                return (
                  <div
                    key={draft.id}
                    className="flex items-center justify-between gap-2 rounded-xl border border-dashed border-violet-400 dark:border-violet-600 bg-violet-50/60 dark:bg-violet-950/30 px-2.5 py-2"
                  >
                    <div className="min-w-0">
                      <span className="inline-flex items-center gap-1 text-[9px] font-semibold uppercase text-violet-600 dark:text-violet-300">
                        <Sparkles size={9} /> Aperçu IA
                      </span>
                      <p className="text-xs font-medium truncate">{title}</p>
                    </div>
                    <div className="flex items-center gap-1 shrink-0">
                      <button
                        type="button"
                        onClick={() => applyDraftAction(draft.id)}
                        className="h-6 w-6 rounded-lg bg-emerald-600 text-white flex items-center justify-center cursor-pointer"
                      >
                        <Check size={11} />
                      </button>
                      <button
                        type="button"
                        onClick={() => dismissDraftAction(draft.id)}
                        className="h-6 w-6 rounded-lg bg-white dark:bg-zinc-900 text-slate-400 flex items-center justify-center cursor-pointer"
                      >
                        <X size={11} />
                      </button>
                    </div>
                  </div>
                );
              })}

              {focusHomework.map((hw) => {
                const badge = formatCountdownBadge(hw.dueDate);
                return (
                  <div key={hw.id} className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60">
                    <div className="pt-0.5">
                      <CheckCircle checked={hw.done} onToggle={() => toggleHomework(hw.id)} accent="amber" size="sm" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <p className={`text-xs font-medium ${hw.done ? 'line-through text-slate-400' : ''}`}>
                        {hw.title}
                      </p>
                      <div className="flex items-center gap-2 mt-0.5">
                        <span className="rounded bg-amber-500/10 text-amber-700 dark:text-amber-300 px-1.5 py-0.5 text-[10px]">
                          {hw.subject}
                        </span>
                        <span className="text-[10px] font-mono text-slate-400">{badge.label}</span>
                      </div>
                    </div>
                  </div>
                );
              })}

              {focusTasks.map((task) => (
                <div key={task.id} className="flex items-start gap-2.5 rounded-xl px-2 py-1.5 hover:bg-slate-50 dark:hover:bg-zinc-900/60">
                  <div className="pt-0.5">
                    <CheckCircle checked={task.done} onToggle={() => toggleTask(task.id)} accent="slate" size="sm" />
                  </div>
                  <p className={`flex-1 text-xs font-medium ${task.done ? 'line-through text-slate-400' : ''}`}>
                    {task.title}
                  </p>
                  <span className={`mt-1.5 h-1.5 w-1.5 rounded-full shrink-0 ${PRIORITY_STYLES[task.priority].dot}`} />
                </div>
              ))}
            </div>
          </section>

          {/* Sport & Nutrition Pulse */}
          <section className="tempo-card rounded-3xl p-5 space-y-3.5">
            <div className="flex items-center justify-between">
              <h2 className="text-sm font-semibold">Sport & Corps</h2>
              <button
                type="button"
                onClick={() => onNavigate('sport')}
                className="text-xs font-medium text-emerald-600 dark:text-emerald-400 inline-flex items-center gap-0.5 cursor-pointer"
              >
                Live Gym <ArrowUpRight size={12} />
              </button>
            </div>

            <div
              onClick={() => onNavigate('sport')}
              className="flex items-center justify-between rounded-2xl border border-emerald-200/70 dark:border-emerald-900/50 bg-emerald-50/45 dark:bg-emerald-950/20 px-3.5 py-3 cursor-pointer"
            >
              <div className="flex items-center gap-3 min-w-0">
                <div className="h-9 w-9 rounded-xl bg-emerald-600 text-white flex items-center justify-center shrink-0">
                  <Dumbbell size={16} />
                </div>
                <div className="min-w-0">
                  <p className="text-xs font-semibold truncate">
                    {todayWorkout ? todayWorkout.title : 'Lancer une séance Hevy'}
                  </p>
                  <p className="text-[11px] text-slate-500 flex items-center gap-1 mt-0.5">
                    <Clock size={10} /> {todayWorkout ? todayWorkout.startTime || '18:00' : 'Routine ou séance vide'}
                  </p>
                </div>
              </div>
              <ArrowUpRight size={14} className="text-emerald-600 shrink-0" />
            </div>

            <div className="grid grid-cols-2 gap-2.5">
              <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/80 p-3">
                <div className="flex items-center justify-between mb-1">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Utensils size={11} /> Kcal
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenQuickAdd({ mode: 'repas', date: today })}
                    className="text-[10px] font-semibold cursor-pointer"
                  >
                    + Repas
                  </button>
                </div>
                <p className="font-mono text-base font-semibold tabular-nums">
                  {totals.calories}
                  <span className="text-[10px] font-normal text-slate-400">/{goals.calories}</span>
                </p>
                <p className="text-[10px] font-mono text-slate-500 mt-1">
                  Prot : <strong>{totals.protein}g</strong>/{goals.protein}g
                </p>
              </div>

              <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/80 p-3 flex flex-col justify-between">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500 flex items-center gap-1">
                    <Droplets size={11} className="text-sky-500" /> Eau
                  </span>
                  <span className="font-mono text-[10px] text-slate-400">{(waterMl / 1000).toFixed(2)} L</span>
                </div>
                <button
                  type="button"
                  onClick={() => addWater(today, 250)}
                  className="mt-2 w-full rounded-xl bg-sky-500/15 text-sky-700 dark:text-sky-300 py-1.5 text-[11px] font-semibold active:scale-95 transition cursor-pointer"
                >
                  + 250 ml
                </button>
              </div>
            </div>

            <div className="rounded-2xl bg-slate-50/80 dark:bg-zinc-900/60 border border-slate-100 dark:border-zinc-800/80 p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-[11px] text-slate-500 flex items-center gap-1">
                  <Scale size={11} /> Poids
                </p>
                <div className="flex items-baseline gap-1.5">
                  <span className="font-mono text-base font-semibold">
                    {latestWeight ? `${latestWeight.weightKg.toFixed(1)} kg` : '—'}
                  </span>
                  {weightDelta !== null && (
                    <span className="font-mono text-[10px] text-emerald-600 dark:text-emerald-400">
                      {weightDelta > 0 ? '+' : ''}
                      {weightDelta.toFixed(1)}
                    </span>
                  )}
                </div>
              </div>
              <div className="w-28 shrink-0">
                <WeightChart entries={sortedWeights} compact />
              </div>
            </div>
          </section>

          {/* Music Pulse (moved to the standalone Kora Music app) */}
          {false && (activeProject || latestTrack) && (
            <section className="tempo-card rounded-3xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <h2 className="text-sm font-semibold">Music · Textes</h2>
                <button
                  type="button"
                  onClick={() => onNavigate('music')}
                  className="text-xs font-medium text-fuchsia-600 dark:text-fuchsia-400 inline-flex items-center gap-0.5 cursor-pointer"
                >
                  Ouvrir <ArrowUpRight size={12} />
                </button>
              </div>

              {latestTrack && (
                <div className="flex items-center justify-between rounded-2xl border border-fuchsia-200/70 dark:border-fuchsia-900/50 bg-fuchsia-50/45 dark:bg-fuchsia-950/20 px-3.5 py-2.5">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <div className="h-8 w-8 rounded-xl bg-fuchsia-600 text-white flex items-center justify-center shrink-0">
                      <Disc3 size={15} />
                    </div>
                    <div className="min-w-0">
                      <p className="text-xs font-semibold truncate">{latestTrack.title}</p>
                      <p className="text-[10px] text-slate-500 truncate">
                        {activeProject
                    ? activeProject.title
                    : state.preferences.name || latestTrack.artist}
                      </p>
                    </div>
                  </div>
                  <button
                    type="button"
                    onClick={() => void player.playTrack(latestTrack)}
                    className="h-8 w-8 rounded-full bg-slate-900 dark:bg-zinc-100 text-white dark:text-zinc-950 flex items-center justify-center shrink-0 cursor-pointer"
                  >
                    <Play size={13} fill="currentColor" className="ml-0.5" />
                  </button>
                </div>
              )}
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
