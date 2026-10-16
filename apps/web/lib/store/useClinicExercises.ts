"use client";

import { useEffect, useMemo, useState } from "react";
import { isMockMode } from "@/lib/config";
import { exerciseFa } from "@/lib/data/exerciseFa";
import { useAuth } from "@/lib/store/AuthContext";
import { fetchClinicExerciseReviews, type ClinicExerciseReview } from "@/lib/supabase/db";
import type { Exercise } from "@/lib/types";

/**
 * Library exercises this clinic's owner approved (migration 033). The
 * database enforces the same rule when a prescription is saved; this only
 * decides what the forms offer.
 */
export function useClinicExerciseReviews() {
  const { activeClinicId } = useAuth();
  const [token, setToken] = useState(0);
  const key = activeClinicId && !isMockMode ? `${activeClinicId}:${token}` : null;
  const [state, setState] = useState<{ key: string; reviews: Map<string, ClinicExerciseReview> | null } | null>(null);

  useEffect(() => {
    if (!key || !activeClinicId) return;
    let cancelled = false;
    fetchClinicExerciseReviews(activeClinicId).then((reviews) => {
      if (!cancelled) setState({ key, reviews });
    });
    return () => {
      cancelled = true;
    };
  }, [key, activeClinicId]);

  const current = state && state.key === key ? state : null;
  const reviews = current?.reviews ?? null;
  const approvedIds = useMemo(
    () =>
      new Set(
        [...(reviews?.values() ?? [])].filter((review) => review.decision === "approved").map((review) => review.exerciseId)
      ),
    [reviews]
  );
  return {
    reviews,
    approvedIds,
    loading: Boolean(key) && !current,
    failed: Boolean(current) && reviews === null,
    reload: () => setToken((value) => value + 1),
  };
}

/** Globally reviewed (active catalog) or approved by this clinic. */
export function isPrescribable(exercise: Exercise, clinicApproved: ReadonlySet<string>): boolean {
  return (exercise.review === "approved" && Boolean(exerciseFa[exercise.id])) || clinicApproved.has(exercise.id);
}
